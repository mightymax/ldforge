import { expect, test } from '@playwright/test';

test('demo toolbar moves complete results between classic and split layouts', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Run query/ }).click();
  const results = page.locator('.ldforge-results');
  await expect(results).toContainText('Amsterdam');
  const original = await results.getAttribute('id');
  if (!original) throw new Error('Missing results ID');
  await page
    .getByRole('button', { name: 'Split: query left, results right' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Split: query left, results right' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.locator('#separate-results .ldforge-results'),
  ).toHaveAttribute('id', original);
  await expect(
    page.locator('#separate-results .ldforge-result-tabs'),
  ).toBeVisible();
  await expect(
    page.locator('#separate-results .ldforge-result-download'),
  ).toBeVisible();
  const queryBounds = await page.locator('#editor').boundingBox();
  const resultBounds = await page.locator('#separate-results').boundingBox();
  if (!resultBounds || !queryBounds)
    throw new Error('Missing split layout bounds');
  expect(resultBounds.x).toBeGreaterThan(queryBounds.x);
  await page.screenshot({
    path: testInfo.outputPath('split-screen.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Classic: results below' }).click();
  await expect(page.locator('#editor .ldforge-results')).toContainText(
    'Amsterdam',
  );
  await expect(page.locator('#separate-results')).toBeHidden();
});
