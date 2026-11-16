import type { Page } from '@playwright/test';

export async function addEndpoint(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add endpoint', exact: true }).click();
}

export async function saveAndSelectEndpoint(page: Page): Promise<void> {
  const value = await page
    .getByLabel('SPARQL endpoint', { exact: true })
    .inputValue();
  await page
    .getByRole('button', { name: 'Save endpoint', exact: true })
    .click();
  // Validation errors leave the draft open and keep the active connection intact.
  if (await page.locator('#connection').isVisible()) return;
  await page
    .getByRole('radio', { name: new URL(value).href, exact: true })
    .check();
}
