import { expect, test } from '@playwright/test';
import { addEndpoint, saveAndSelectEndpoint } from './endpoint-helpers.js';

test('adds and edits profiles explicitly without switching the active endpoint or leaking draft headers', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  const input = page.getByLabel('SPARQL endpoint', { exact: true });
  await expect(input).toBeHidden();
  await addEndpoint(page);
  await input.fill('https://one.example/sparql');
  await page.getByLabel('Request method').selectOption('GET');
  await saveAndSelectEndpoint(page);
  await expect(
    page.getByRole('radio', {
      name: 'https://one.example/sparql',
      exact: true,
    }),
  ).toBeChecked();
  await addEndpoint(page);
  await input.fill('https://two.example/sparql');
  await page.getByRole('button', { name: 'Add header', exact: true }).click();
  await page.getByLabel('Header name', { exact: true }).fill('Authorization');
  await page
    .getByLabel('Header value', { exact: true })
    .fill('Bearer session-only');
  await page
    .getByRole('button', { name: 'Save endpoint', exact: true })
    .click();
  await expect(
    page.getByRole('radio', {
      name: 'https://one.example/sparql',
      exact: true,
    }),
  ).toBeChecked();
  await page
    .getByRole('button', {
      name: 'Edit endpoint: https://two.example/sparql',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Header value', { exact: true })).toHaveValue(
    'Bearer session-only',
  );
  await input.fill('https://renamed.example/sparql');
  await expect(page.locator('.header-row')).toHaveCount(0);
  await page.getByLabel('Request method').selectOption('GET');
  await page
    .getByRole('button', { name: 'Save endpoint', exact: true })
    .click();
  await expect(
    page.getByRole('radio', {
      name: 'https://two.example/sparql',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('radio', {
      name: 'https://one.example/sparql',
      exact: true,
    }),
  ).toBeChecked();
  await page
    .getByRole('button', {
      name: 'Edit endpoint: https://renamed.example/sparql',
      exact: true,
    })
    .click();
  await input.fill('https://discarded.example/sparql');
  await page.locator('#cancel-endpoint').click();
  await expect(
    page.getByRole('radio', {
      name: 'https://discarded.example/sparql',
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole('button', {
      name: 'Edit endpoint: https://one.example/sparql',
      exact: true,
    })
    .click();
  await page.getByLabel('Request method').selectOption('POST');
  await page
    .getByRole('button', { name: 'Save endpoint', exact: true })
    .click();
  await expect(page.locator('#connection-status')).toContainText('(POST)');
  await expect(page.locator('#connection')).toBeHidden();
  await page.screenshot({
    path: testInfo.outputPath('endpoint-manager.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await page.locator('.ldforge-tools-trigger').click();
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await expect(
    page.getByRole('radio', {
      name: 'https://one.example/sparql',
      exact: true,
    }),
  ).toBeChecked();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    'session-only',
  );
});

test('copies the endpoint URL from its code-formatted footer with clipboard feedback', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await addEndpoint(page);
  const endpoint = 'https://clipboard.example/sparql';
  await page.getByLabel('SPARQL endpoint', { exact: true }).fill(endpoint);
  await saveAndSelectEndpoint(page);
  await expect(page.locator('#active-endpoint code')).toHaveText(endpoint);
  await page
    .getByRole('button', { name: 'Copy endpoint URL', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Endpoint URL copied', exact: true }),
  ).toHaveAttribute('data-copied', 'true');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    endpoint,
  );
  await expect(
    page.getByRole('button', { name: 'Copy endpoint URL', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('radio', { name: 'Local fixture (no endpoint)', exact: true })
    .check();
  await expect(page.locator('#active-endpoint button')).toHaveCount(0);
});
