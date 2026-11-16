import { expect, test } from '@playwright/test';

test('keeps the active renderer on the bar and offers disabled alternatives with binding guidance', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  const active = page.locator('.ldforge-result-tab-active');
  await expect(
    active.getByRole('tab', { name: 'Table', exact: true }),
  ).toBeVisible();
  await expect(active.locator('[data-renderer-info]')).toHaveCount(0);
  await expect(
    page.getByRole('tab', { name: 'JSON', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: 'Map', exact: true }),
  ).toBeHidden();
  const picker = page.locator('.ldforge-renderer-picker');
  await picker.locator('summary').click();
  await expect(
    page.getByRole('tab', { name: 'Map', exact: true }),
  ).toBeDisabled();
  await picker
    .getByRole('button', { name: 'Binding contract: Charts', exact: true })
    .click();
  const info = page.locator('.ldforge-renderer-info');
  await expect(info).toContainText('?chart_value · required');
  await expect(info).toContainText('Finite numeric value');
  await info.getByRole('button', { name: 'Close binding contract' }).click();
  await picker.locator('summary').click();
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  await expect(
    active.getByRole('tab', { name: 'JSON', exact: true }),
  ).toBeVisible();
  const json = page.locator('.ldforge-json');
  await expect(json.locator('.cm-content span').first()).toBeVisible();
  await expect(json.locator('.cm-content')).toHaveAttribute(
    'contenteditable',
    'false',
  );
  await json.getByRole('button', { name: 'Copy JSON', exact: true }).click();
  await expect(
    json.getByRole('button', { name: 'Copied!', exact: true }),
  ).toHaveAttribute('data-copied', 'true');
  expect(
    JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).kind,
  ).toBe('bindings');
  await expect(
    json.getByRole('button', { name: 'Copy JSON', exact: true }),
  ).toBeVisible();
  await picker.locator('summary').click();
  await page.screenshot({
    path: '/tmp/ldforge-renderer-picker.png',
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(picker).not.toHaveAttribute('open', '');
});
