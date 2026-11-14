import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('lazy network and timeline plugins render, navigate, link and cleanly reactivate', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const loads = { network: 0, timeline: 0, css: 0 };
  for (const [key, url, file, type] of [
    [
      'network',
      'https://cdn.jsdelivr.net/npm/vis-network@10.1.5/standalone/esm/vis-network.min.mjs',
      'vis-network/standalone/esm/vis-network.min.mjs',
      'text/javascript',
    ],
    [
      'timeline',
      'https://cdn.jsdelivr.net/npm/vis-timeline@8.5.6/standalone/esm/vis-timeline-graph2d.min.mjs',
      'vis-timeline/standalone/esm/vis-timeline-graph2d.min.mjs',
      'text/javascript',
    ],
    [
      'css',
      'https://cdn.jsdelivr.net/npm/vis-timeline@8.5.6/styles/vis-timeline-graph2d.min.css',
      'vis-timeline/styles/vis-timeline-graph2d.min.css',
      'text/css',
    ],
  ] as const) {
    const body = await readFile(
      new URL(`../node_modules/${file}`, import.meta.url),
      'utf8',
    );
    await page.route(url, (route) => {
      loads[key]++;
      return route.fulfill({
        contentType: type,
        body,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    });
  }
  await page.route('https://query.wikidata.org/sparql?**', (route) => {
    expect(route.request().method()).toBe('GET');
    const query =
      new URL(route.request().url()).searchParams.get('query') ?? '';
    const timeline = query.includes('timelineStart');
    return route.fulfill({
      contentType: 'application/sparql-results+json',
      body: JSON.stringify(
        timeline
          ? {
              head: {
                vars: [
                  'timelineLabel',
                  'timelineStart',
                  'timelineEnd',
                  'timelineGroup',
                  'timelineLink',
                  'timelineDescription',
                  'timelineImage',
                ],
              },
              results: {
                bindings: [
                  {
                    timelineLabel: {
                      type: 'literal',
                      value: 'Vincent van Gogh',
                    },
                    timelineStart: {
                      type: 'literal',
                      value: '1853-03-30T00:00:00Z',
                    },
                    timelineEnd: {
                      type: 'literal',
                      value: '1890-07-29T00:00:00Z',
                    },
                    timelineGroup: { type: 'literal', value: 'Schilders' },
                    timelineLink: {
                      type: 'uri',
                      value: 'https://www.wikidata.org/entity/Q5582',
                    },
                    timelineImage: {
                      type: 'uri',
                      value: 'https://images.example/portrait.png',
                    },
                    timelineDescription: {
                      type: 'literal',
                      value: 'Nederlandse schilder',
                    },
                  },
                  {
                    timelineLabel: { type: 'literal', value: 'Piet Mondriaan' },
                    timelineStart: {
                      type: 'literal',
                      value: '1872-03-07T00:00:00Z',
                    },
                    timelineEnd: {
                      type: 'literal',
                      value: '1944-02-01T00:00:00Z',
                    },
                    timelineGroup: { type: 'literal', value: 'Schilders' },
                  },
                ],
              },
            }
          : {
              head: {
                vars: [
                  'source',
                  'sourceLabel',
                  'target',
                  'targetLabel',
                  'relationLabel',
                  'sourceGroup',
                  'targetGroup',
                ],
              },
              results: {
                bindings: [
                  {
                    source: {
                      type: 'uri',
                      value: 'https://www.wikidata.org/entity/Q5582',
                    },
                    sourceLabel: { type: 'literal', value: 'Vincent van Gogh' },
                    sourceGroup: { type: 'literal', value: 'Kunstenaar' },
                    target: {
                      type: 'uri',
                      value: 'https://www.wikidata.org/entity/Q80113',
                    },
                    targetLabel: {
                      type: 'literal',
                      value: 'Postimpressionisme',
                    },
                    targetGroup: { type: 'literal', value: 'Kunststroming' },
                    relationLabel: { type: 'literal', value: 'kunststroming' },
                  },
                  {
                    source: {
                      type: 'uri',
                      value: 'https://www.wikidata.org/entity/Q151',
                    },
                    sourceLabel: { type: 'literal', value: 'Piet Mondriaan' },
                    sourceGroup: { type: 'literal', value: 'Kunstenaar' },
                    target: {
                      type: 'uri',
                      value: 'https://www.wikidata.org/entity/Q207447',
                    },
                    targetLabel: { type: 'literal', value: 'De Stijl' },
                    targetGroup: { type: 'literal', value: 'Kunststroming' },
                    relationLabel: { type: 'literal', value: 'kunststroming' },
                  },
                ],
              },
            },
      ),
    });
  });
  await page.route('https://images.example/portrait.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  expect(loads).toEqual({ network: 0, timeline: 0, css: 0 });
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page
    .getByRole('menuitem', {
      name: 'Dutch painters and their connections (network)',
      exact: true,
    })
    .click();
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  await query.fill(
    (await query.innerText()).replace('view=network', 'view=table'),
  );
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  expect(loads.network).toBe(0);
  const tabs = page.getByRole('tablist', { name: 'Result view', exact: true });
  await tabs.getByRole('tab', { name: 'Network', exact: true }).click();
  const network = page.locator('.ldforge-network');
  await expect(network).toHaveAttribute('aria-busy', 'false');
  await expect(network.locator('canvas')).toBeVisible();
  await network
    .getByRole('combobox', { name: 'Find a node' })
    .selectOption({ label: 'Vincent van Gogh' });
  await expect(
    network.locator('.ldforge-network-selection').getByRole('link'),
  ).toHaveAttribute('href', 'https://www.wikidata.org/entity/Q5582');
  await network.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await network.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await network
    .getByRole('button', { name: 'Fit network', exact: true })
    .click();
  await expect(network.locator('.ldforge-network-legend')).toContainText(
    'Kunststroming',
  );
  const pixels = await network
    .locator('canvas')
    .evaluate((canvas: HTMLCanvasElement) =>
      canvas
        .getContext('2d')
        ?.getImageData(0, 0, canvas.width, canvas.height)
        .data.some((value, index) => index % 4 === 3 && value > 0),
    );
  expect(pixels).toBe(true);
  await tabs.getByRole('tab', { name: 'Table', exact: true }).click();
  await tabs.getByRole('tab', { name: 'Network', exact: true }).click();
  await expect(network).toHaveAttribute('aria-busy', 'false');
  expect(loads.network).toBe(1);
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page
    .getByRole('menuitem', {
      name: 'Lives of Dutch painters (timeline)',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  const timeline = page.locator('.ldforge-timeline');
  await expect(timeline).toHaveAttribute('aria-busy', 'false');
  await expect(timeline.locator('.vis-item.vis-range')).toHaveCount(2);
  await expect(timeline.locator('.ldforge-timeline-thumbnail')).toBeVisible();
  await expect(
    timeline.locator('.vis-item.vis-range').getByRole('link'),
  ).toHaveAttribute('href', 'https://www.wikidata.org/entity/Q5582');
  await timeline
    .locator('.vis-item.vis-range')
    .first()
    .click({ position: { x: 2, y: 2 } });
  await expect(timeline.locator('.ldforge-timeline-selection')).toContainText(
    'Nederlandse schilder',
  );
  await timeline.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await timeline.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await timeline
    .getByRole('button', { name: 'Fit timeline', exact: true })
    .click();
  await tabs.getByRole('tab', { name: 'Table', exact: true }).click();
  await tabs.getByRole('tab', { name: 'Timeline', exact: true }).click();
  await expect(timeline).toHaveAttribute('aria-busy', 'false');
  expect(loads).toEqual({ network: 1, timeline: 1, css: 1 });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
