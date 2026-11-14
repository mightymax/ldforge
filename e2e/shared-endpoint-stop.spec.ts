import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';
test('shared endpoint headers update the connection, omit old credentials and support Stop with a spinner', async ({
  page,
}) => {
  let pending: Route | undefined;
  let count = 0;
  await page.route('https://shared.example/sparql?**', async (route) => {
    count++;
    expect(route.request().headers().authorization).toBeUndefined();
    expect(route.request().method()).toBe('GET');
    if (count === 1) {
      pending = route;
      return;
    }
    await route.fulfill({
      contentType: 'application/sparql-results+json',
      body: JSON.stringify({
        head: { vars: ['label'] },
        results: {
          bindings: [
            { label: { type: 'literal', value: 'Shared endpoint result' } },
          ],
        },
      }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await page
    .getByLabel('SPARQL endpoint', { exact: true })
    .fill('https://private.example/sparql');
  await page.getByRole('button', { name: 'Add header', exact: true }).click();
  await page.locator('.header-name').fill('Authorization');
  await page.locator('.header-value').fill('Bearer private');
  await page
    .getByRole('button', { name: 'Apply endpoint', exact: true })
    .click();
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'SPARQL query', exact: true })
    .fill(
      '# view=table\n# sparql-endpoint=https://shared.example/sparql\nSELECT ?label WHERE { ?s ?p ?label }',
    );
  expect(count).toBe(0);
  await expect(page.locator('#active-endpoint')).toHaveText(
    'Endpoint: https://private.example/sparql',
  );
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Stop query', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('.ldforge-spinner')).toBeVisible();
  await expect(page.locator('#active-endpoint')).toHaveText(
    'Endpoint: https://shared.example/sparql',
  );
  await page.getByRole('button', { name: 'Stop query', exact: true }).click();
  await expect(page.locator('.ldforge-spinner')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Run query', exact: true }),
  ).toBeEnabled();
  if (pending) await pending.abort().catch(() => {});
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Shared endpoint result');
  await expect(page.locator('.ldforge-spinner')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Cancel', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Examples', exact: true }).locator('svg'),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await expect(page.getByLabel('SPARQL endpoint', { exact: true })).toHaveValue(
    'https://shared.example/sparql',
  );
  await expect(page.locator('.header-row')).toHaveCount(0);
});
