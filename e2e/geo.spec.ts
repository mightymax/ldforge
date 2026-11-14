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
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.abort(),
  );
  await page.route('https://query.wikidata.org/sparql?**', (route) =>
    route.fulfill({
      contentType: 'application/sparql-results+json',
      body: JSON.stringify({
        head: { vars: ['geometryLabel', 'geometry'] },
        results: {
          bindings: [
            ['Amsterdam', 'Point(4.9 52.37)'],
            ['Nearby', 'Point(4.9001 52.3701)'],
            ['Area', 'POLYGON((4.86 52.35,4.89 52.35,4.89 52.38,4.86 52.35))'],
            ['Line', 'LINESTRING(4.88 52.36,4.92 52.38)'],
          ].map(([label, geometry]) => ({
            geometryLabel: { type: 'literal', value: label },
            geometry: { type: 'literal', value: geometry },
          })),
        },
      }),
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  expect(counts).toEqual({ leaflet: 0, css: 0, cluster: 0, heat: 0 });
  await page
    .getByRole('button', { name: 'Plugin Examples', exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: 'Map example (Wikidata)', exact: true })
    .click();
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  const initialQuery = await query.innerText();
  await query.fill(initialQuery.replace('view=geo', 'view=table'));
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Nearby');
  expect(counts.leaflet).toBe(0);
  const tabs = page.getByRole('tablist', { name: 'Result view', exact: true });
  await tabs.getByRole('tab', { name: 'Map', exact: true }).click();
  const map = page.locator('.ldforge-geo');
  await expect(map).toHaveAttribute('aria-busy', 'false');
  await expect(map.locator('path.leaflet-interactive')).toHaveCount(4);
  expect(counts).toEqual({ leaflet: 1, css: 1, cluster: 0, heat: 0 });
  const mode = map.getByRole('combobox', { name: 'Map display' });
  await mode.selectOption('grouped');
  await expect(map).toHaveAttribute('aria-busy', 'false');
  await expect(map.locator('.leaflet-tooltip')).toHaveText('2');
  await expect(map.locator('path.leaflet-interactive')).toHaveCount(3);
  expect(counts.cluster).toBe(1);
  expect(counts.heat).toBe(0);
  await mode.selectOption('heatmap');
  await expect(map).toHaveAttribute('aria-busy', 'false');
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
  await mode.selectOption('normal');
  await expect(map.locator('path.leaflet-interactive')).toHaveCount(4);
  await expect(canvas).toHaveCount(0);
  await tabs.getByRole('tab', { name: 'Table', exact: true }).click();
  await tabs.getByRole('tab', { name: 'Map', exact: true }).click();
  await expect(map).toHaveAttribute('aria-busy', 'false');
  expect(counts.leaflet).toBe(1);
  expect(counts.css).toBe(1);
  expect(errors).toEqual([]);
});
