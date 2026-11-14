import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('lazy geo modes render real points, polygons, clusters and a heatmap', async ({
  page,
}) => {
  const counts = { leaflet: 0, css: 0, cluster: 0, heat: 0 };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [key, url, file, umd] of [
    [
      'leaflet',
      'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm',
      'leaflet/dist/leaflet-src.esm.js',
      false,
    ],
    [
      'cluster',
      'https://cdn.jsdelivr.net/npm/supercluster@8.0.1/+esm',
      'supercluster/dist/supercluster.js',
      true,
    ],
    [
      'heat',
      'https://cdn.jsdelivr.net/npm/simpleheat@0.4.0/+esm',
      'simpleheat/simpleheat.js',
      true,
    ],
  ] as const) {
    const source = await readFile(
      new URL(`../node_modules/${file}`, import.meta.url),
      'utf8',
    );
    await page.route(url, async (route) => {
      counts[key]++;
      await route.fulfill({
        contentType: 'text/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: umd
          ? `const module = {exports:{}}; const exports = module.exports;\n${source}\nexport default module.exports;`
          : source,
      });
    });
  }
  const css = await readFile(
    new URL('../node_modules/leaflet/dist/leaflet.css', import.meta.url),
    'utf8',
  );
  await page.route(
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
    async (route) => {
      counts.css++;
      await route.fulfill({ contentType: 'text/css', body: css });
    },
  );
  await page.route('https://images.example/track.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.abort(),
  );
  await page.route('https://query.wikidata.org/sparql?**', (route) =>
    route.fulfill({
      contentType: 'application/sparql-results+json',
      body: JSON.stringify({
        head: {
          vars: [
            'geometryLabel',
            'geometry',
            'geoImage',
            'geoDescription',
            'geoLink',
          ],
        },
        results: {
          bindings: [
            ['Amsterdam', 'Point(4.9 52.37)'],
            ['Nearby', 'Point(4.9001 52.3701)'],
            ['Area', 'POLYGON((4.86 52.35,4.89 52.35,4.89 52.38,4.86 52.35))'],
            ['Line', 'LINESTRING(4.88 52.36,4.92 52.38)'],
          ].map(([label, geometry]) => ({
            geometryLabel: { type: 'literal', value: label },
            geometry: { type: 'literal', value: geometry },
            geoImage: {
              type: 'uri',
              value: 'https://images.example/track.png',
            },
            geoDescription: {
              type: 'literal',
              value: 'Atletiekbaan met een foto',
            },
            geoLink: {
              type: 'uri',
              value: 'https://www.openstreetmap.org/way/123',
            },
          })),
        },
      }),
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  expect(counts).toEqual({ leaflet: 0, css: 0, cluster: 0, heat: 0 });
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page
    .getByRole('menuitem', {
      name: 'Castles in North Holland',
      exact: true,
    })
    .click();
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  const initialQuery = await query.innerText();
  expect(initialQuery).toContain('geo-title=Kastelen in Noord-Holland');
  expect(initialQuery).toContain('?geoDescription ?geoImage ?geometry');
  expect(initialQuery).toContain('?geometry ?geoLink WHERE');
  expect(initialQuery).toContain('?geoLink schema:about ?place');
  expect(initialQuery).toContain('schema:isPartOf <https://nl.wikipedia.org/>');
  expect(initialQuery).toContain('wdt:P31 wd:Q23413');
  expect(initialQuery).toContain('wdt:P625 ?geometry');
  expect(initialQuery).toContain('wdt:P131+ wd:Q701');
  expect(initialQuery).not.toContain('OPTIONAL');
  expect(initialQuery).toContain('LIMIT 250');
  await expect(page.locator('#active-endpoint')).toHaveText(
    'Endpoint: https://query.wikidata.org/sparql',
  );
  await query.fill(
    initialQuery
      .replace('view=geo', 'view=table')
      .replace('mode=heatmap', 'mode=normal'),
  );
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Nearby');
  expect(counts.leaflet).toBe(0);
  const tabs = page.getByRole('tablist', { name: 'Result view', exact: true });
  await tabs.getByRole('tab', { name: 'Map', exact: true }).click();
  const map = page.locator('.ldforge-geo');
  await expect(map).toHaveAttribute('aria-busy', 'false');
  await expect(map.locator('path.leaflet-interactive')).toHaveCount(4);
  expect(counts).toEqual({ leaflet: 1, css: 1, cluster: 0, heat: 0 });
  await map.locator('path.leaflet-interactive').first().dispatchEvent('click');
  const popup = map.locator('.leaflet-popup-content');
  await expect(
    popup.getByRole('link', { name: 'Amsterdam', exact: true }),
  ).toHaveAttribute('href', 'https://www.openstreetmap.org/way/123');
  await expect(popup).toContainText('Atletiekbaan met een foto');
  await expect(popup.getByRole('img')).toHaveAttribute(
    'src',
    'https://images.example/track.png',
  );
  await map.locator('.leaflet-popup-close-button').click();
  const mode = map.getByRole('group', { name: 'Map display' });
  await mode.getByRole('button', { name: 'Grouped', exact: true }).click();
  await expect(map).toHaveAttribute('aria-busy', 'false');
  await expect(map.locator('.leaflet-tooltip')).toHaveText('2');
  await expect(map.locator('path.leaflet-interactive')).toHaveCount(3);
  expect(counts.cluster).toBe(1);
  expect(counts.heat).toBe(0);
  await mode.getByRole('button', { name: 'Heatmap', exact: true }).click();
  await expect(map).toHaveAttribute('aria-busy', 'false');
  await expect(
    mode.getByRole('button', { name: 'Heatmap', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const canvas = map.locator('canvas');
  await expect(canvas).toBeVisible();
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) =>
      node
        .getContext('2d')
        ?.getImageData(0, 0, node.width, node.height)
        .data.some((value, index) => index % 4 === 3 && value > 0),
    ),
  ).toBe(true);
  await expect(map.locator('path.leaflet-interactive')).toHaveCount(2);
  expect(counts.heat).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(mode).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await mode.getByRole('button', { name: 'Normal', exact: true }).click();
  await expect(map.locator('path.leaflet-interactive')).toHaveCount(4);
  await expect(canvas).toHaveCount(0);
  await tabs.getByRole('tab', { name: 'Table', exact: true }).click();
  await tabs.getByRole('tab', { name: 'Map', exact: true }).click();
  await expect(map).toHaveAttribute('aria-busy', 'false');
  expect(counts.leaflet).toBe(1);
  expect(counts.css).toBe(1);
  expect(errors).toEqual([]);
});

test('renders geometryHeight as real 3D buildings and switches back to the 2D map', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let threeDLoads = 0;
  for (const [url, file, contentType] of [
    [
      'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm',
      'leaflet/dist/leaflet-src.esm.js',
      'text/javascript',
    ],
    [
      'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
      'leaflet/dist/leaflet.css',
      'text/css',
    ],
    [
      'https://cdn.jsdelivr.net/npm/maplibre-gl@6.18.0/dist/maplibre-gl.mjs',
      'maplibre-gl/dist/maplibre-gl.mjs',
      'text/javascript',
    ],
    [
      'https://cdn.jsdelivr.net/npm/maplibre-gl@6.18.0/dist/maplibre-gl.css',
      'maplibre-gl/dist/maplibre-gl.css',
      'text/css',
    ],
  ] as const) {
    const body = await readFile(
      new URL(`../node_modules/${file}`, import.meta.url),
      'utf8',
    );
    await page.route(url, (route) => {
      if (file.endsWith('maplibre-gl.mjs')) threeDLoads++;
      return route.fulfill({
        contentType,
        body,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    });
  }
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.route(
    'https://api.triplydb.com/datasets/osm/osm/services/osm/sparql?**',
    (route) =>
      route.fulfill({
        contentType: 'application/sparql-results+json',
        body: JSON.stringify({
          head: { vars: ['geometry', 'geometryLabel', 'geometryHeight'] },
          results: {
            bindings: [
              {
                geometry: {
                  type: 'literal',
                  value:
                    'POLYGON((5.944 52.233,5.946 52.233,5.946 52.234,5.944 52.234,5.944 52.233),(5.9445 52.2333,5.9455 52.2333,5.9455 52.2337,5.9445 52.2337,5.9445 52.2333))',
                },
                geometryLabel: { type: 'literal', value: 'Paleis het Loo' },
                geometryHeight: { type: 'literal', value: '10' },
                geoDescription: { type: 'literal', value: 'Koninklijk paleis' },
                geoLink: {
                  type: 'uri',
                  value: 'https://www.openstreetmap.org/way/456',
                },
              },
            ],
          },
        }),
      }),
  );
  await page.goto('/');
  expect(threeDLoads).toBe(0);
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Paleis het Loo (3D)', exact: true })
    .click();
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  const section = page.locator('.ldforge-geo');
  await expect(
    section.getByRole('button', { name: '3D', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(section).toHaveAttribute('aria-busy', 'false');
  await expect(section.locator('.ldforge-geo-3d canvas')).toBeVisible();
  await expect(
    section.getByRole('button', { name: 'Retry loading map', exact: true }),
  ).toBeHidden();
  expect(threeDLoads).toBe(1);
  // Inspect the actual WebGL framebuffer, rather than only the presence of a canvas.
  const pixels = await section
    .locator('.ldforge-geo-3d canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      const gl = canvas.getContext('webgl2');
      if (!gl) return { green: 0, x: 0, y: 0 };
      const data = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(
        0,
        0,
        canvas.width,
        canvas.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
      let green = 0;
      let longest = 0;
      let targetX = 0;
      let targetY = 0;
      for (let y = 0; y < canvas.height; y++) {
        let run = 0;
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (
            (data[i + 1] ?? 0) > (data[i] ?? 0) * 1.3 &&
            (data[i + 1] ?? 0) > (data[i + 2] ?? 0)
          ) {
            green++;
            run++;
            if (run > longest) {
              longest = run;
              targetX = x - run / 2;
              targetY = y;
            }
          } else run = 0;
        }
      }
      return {
        green,
        x: (targetX * canvas.clientWidth) / canvas.width,
        y:
          ((canvas.height - targetY - 1) * canvas.clientHeight) / canvas.height,
      };
    });
  expect(pixels.green).toBeGreaterThan(100);
  await section
    .locator('.ldforge-geo-3d canvas')
    .click({ position: { x: pixels.x, y: pixels.y } });
  await expect(section.locator('.maplibregl-popup-content')).toContainText(
    'Koninklijk paleis',
  );
  await expect(
    section.locator('.maplibregl-popup-content').getByRole('link'),
  ).toHaveAttribute('href', 'https://www.openstreetmap.org/way/456');
  await section.getByRole('button', { name: 'Normal', exact: true }).click();
  await expect(section.locator('.ldforge-geo-3d')).toBeHidden();
  await expect(section.locator('path.leaflet-interactive')).toHaveCount(1);
  await section.getByRole('button', { name: '3D', exact: true }).click();
  await expect(section).toHaveAttribute('aria-busy', 'false');
  await expect(section.locator('.ldforge-geo-3d canvas')).toBeVisible();
  expect(threeDLoads).toBe(1);
  expect(errors).toEqual([]);
});
