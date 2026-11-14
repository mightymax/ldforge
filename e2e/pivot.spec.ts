import { expect, test } from '@playwright/test';

test('pivots Wikidata query results and supports aggregation, sorting, transpose and mobile scrolling', async ({
  page,
}) => {
  await page.route('https://query.wikidata.org/sparql?**', (route) => {
    expect(route.request().method()).toBe('GET');
    const query =
      new URL(route.request().url()).searchParams.get('query') ?? '';
    expect(query).toContain('COUNT(DISTINCT ?painting)');
    expect(query).toContain('wd:Q190804');
    return route.fulfill({
      contentType: 'application/sparql-results+json',
      body: JSON.stringify({
        head: { vars: ['pivotRow', 'pivotColumn', 'pivotValue'] },
        results: {
          bindings: [
            ['Impressionisme', 'Rijksmuseum', '10'],
            ['Impressionisme', 'Van Gogh Museum', '20'],
            ['Impressionisme', 'Van Gogh Museum', '10'],
            ['Expressionisme', 'Mauritshuis', '60'],
          ].map(([r, c, v]) => ({
            pivotRow: { type: 'literal', value: r },
            pivotColumn: { type: 'literal', value: c },
            pivotValue: { type: 'literal', value: v },
          })),
        },
      }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page
    .getByRole('menuitem', {
      name: 'Art movements by collection (pivot)',
      exact: true,
    })
    .click();
  await expect(page.locator('#active-endpoint')).toHaveText(
    'Endpoint: https://query.wikidata.org/sparql',
  );
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  const pivot = page.locator('.ldforge-pivot');
  await expect(pivot.getByRole('table')).toBeVisible();
  await expect(pivot.locator('tbody tr')).toHaveCount(2);
  await expect(pivot.locator('tfoot td').last()).toHaveText('100');
  await expect(pivot.getByTitle('No observations')).toHaveCount(3);
  await pivot
    .getByRole('combobox', { name: 'Sort rows', exact: true })
    .selectOption('total-asc');
  await expect(pivot.locator('tbody th').first()).toHaveText('Impressionisme');
  await pivot
    .getByRole('combobox', { name: 'Aggregate', exact: true })
    .selectOption('avg');
  await expect(pivot.locator('tfoot td').last()).toHaveText('25');
  await pivot.getByRole('button', { name: 'Swap axes', exact: true }).click();
  await expect(pivot.locator('tbody tr')).toHaveCount(3);
  await expect(pivot.locator('caption')).toContainText(
    'Collectie × Kunststroming',
  );
  await pivot
    .getByRole('checkbox', { name: 'Cell colors', exact: true })
    .uncheck();
  await expect(pivot.locator('tbody td').first()).not.toHaveAttribute('style');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('the plugin guide menu includes every documented plugin and follows its section links', async ({
  page,
}) => {
  await page.goto('/plugins.html');
  const menu = page.getByRole('navigation', { name: 'Plugins', exact: true });
  for (const name of [
    'Geo',
    'Network',
    'Timeline',
    'Pivot',
    'Tree',
    'Charts',
    'Cards',
    'Table',
    'Boolean',
    'JSON',
  ]) {
    await menu.getByRole('link', { name, exact: true }).click();
    await expect(
      page.getByRole('heading', { name, level: 2, exact: true }),
    ).toBeInViewport();
  }
  const links = await menu.getByRole('link').allTextContents();
  const sections = await page.locator('#plugin-content h2').allTextContents();
  expect(links).toEqual(sections);
});
