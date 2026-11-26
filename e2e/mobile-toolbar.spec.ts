import { expect, test } from '@playwright/test';

test('collapses editor tools on mobile and restores them on desktop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const trigger = page.locator('.ldforge-tools-trigger');
  const tools = page.locator('.ldforge-core-tools');
  await expect(trigger).toBeVisible();
  await expect(tools).toBeHidden();
  await trigger.click();
  await expect(tools).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const bounds = await tools.boundingBox();
  if (!bounds) throw new Error('Tools dropdown has no visible bounds');
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(tools).toBeHidden();
  await trigger.click();
  await tools
    .getByRole('button', { name: 'IDE settings', exact: true })
    .click();
  await expect(tools).toBeHidden();
  await expect(page.locator('.ldforge-settings')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(trigger).toBeHidden();
  await expect(tools).toBeVisible();
  await expect(tools).not.toHaveAttribute('popover');
});
