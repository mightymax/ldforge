import { expect, test } from '@playwright/test';

test('project release history links versions, Markdown and source on desktop and mobile', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Release notes', exact: true }).click();
  await expect(page).toHaveURL(/releases\.html$/);
  await expect(
    page.getByRole('link', { name: 'Release notes', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  const latest = page.locator('.release-entry').first();
  await expect(
    latest.getByRole('heading', { name: 'Updated packages' }),
  ).toBeVisible();
  await expect(latest.locator('table')).toContainText('@ldforge/editor');
  await expect(
    latest.getByRole('link', { name: 'Read this release as Markdown ↗' }),
  ).toHaveAttribute('href', /docs\/releases\/release-.*\.md$/);
  await page
    .getByRole('navigation', { name: 'Releases', exact: true })
    .getByRole('link', { name: 'v1.0.0', exact: true })
    .click();
  await expect(page).toHaveURL(/#v1\.0\.0$/);
  await expect(page.locator('[id="v1.0.0"]')).toContainText('Historical entry');
  await expect(page.locator('[id="v1.0.0"] table')).toContainText('1.0.0');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
