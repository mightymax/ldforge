import { expect, test } from '@playwright/test';

test('copies a link with the active view and opens the shared query over a saved workspace', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  await query.fill(
    '# view=table\n# css=color: green\nSELECT ?resource WHERE { ?resource ?p ?o }',
  );
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  await page
    .getByRole('button', { name: 'Copy share link', exact: true })
    .click();
  const copied = page.getByRole('button', { name: 'Link copied', exact: true });
  await expect(copied).toHaveAttribute('data-copied', 'true');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const sharedQuery = new URL(link).searchParams.get('query');
  expect(sharedQuery).toContain('# view=json');
  expect(sharedQuery).toContain('# css=color: green');
  await expect(query).toContainText('# view=json');
  await expect(
    page.getByRole('button', { name: 'Copy share link', exact: true }),
  ).toBeVisible();
  await query.fill('ASK {}');
  await page.goto(link);
  expect(
    await page.evaluate(() => localStorage.getItem('ldforge.demo.queries.v1')),
  ).toContain('ASK {}');
  await expect(query).toContainText('# view=json');
  await expect(query).toContainText('SELECT ?resource');
  await expect(
    page.getByRole('tab', { name: 'Shared query', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: 'JSON', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('shares the applied endpoint in query metadata and removes page fragments', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#plugins');
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  const endpoint = 'https://example.org/sparql?graph=demo';
  await page.getByLabel('SPARQL endpoint', { exact: true }).fill(endpoint);
  await page
    .getByRole('button', { name: 'Apply endpoint', exact: true })
    .click();
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await page
    .getByRole('button', { name: 'Copy share link', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Link copied', exact: true }),
  ).toBeVisible();
  const url = new URL(
    await page.evaluate(() => navigator.clipboard.readText()),
  );
  expect(url.hash).toBe('');
  expect(url.searchParams.get('query')).toContain(
    `sparql-endpoint="${endpoint}"`,
  );
  await expect(
    page.getByRole('textbox', { name: 'SPARQL query', exact: true }),
  ).toContainText(`sparql-endpoint="${endpoint}"`);
});
