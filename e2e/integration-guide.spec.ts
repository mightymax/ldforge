import { expect, test } from '@playwright/test';

test('navigates the integration sidebar and copies the minimal Yasgui HTML migration', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/guide.html');
  const navigation = page.getByRole('navigation', {
    name: 'Integration topics',
  });
  const migration = navigation.getByRole('link', {
    name: 'Migrate from Yasgui',
  });
  const sidebarBox = await navigation.boundingBox();
  const contentBox = await page.locator('.guide-content').boundingBox();
  expect(
    sidebarBox && contentBox && sidebarBox.x + sidebarBox.width < contentBox.x,
  ).toBe(true);
  await migration.click();
  await expect(page).toHaveURL(/guide\.html#yasgui$/);
  await expect(migration).toHaveAttribute('aria-current', 'location');
  const section = page.locator('#yasgui');
  await expect(
    section.getByRole('heading', { name: 'Migrate from Yasgui' }),
  ).toBeVisible();
  await expect(section.locator('.code-diff-added')).toHaveCount(4);
  await expect(section.locator('.code-diff-removed')).toHaveCount(4);
  await section
    .getByRole('button', { name: 'Copy migrated HTML' })
    .first()
    .click();
  const html = await page.evaluate(() => navigator.clipboard.readText());
  expect(html).toContain(
    '<link rel="stylesheet" href="./vendor/ldforge/yasgui.css">',
  );
  expect(html).toContain(
    '<script src="./vendor/ldforge/yasgui.min.js"></script>',
  );
  expect(html).toContain('new Yasgui(');
  expect(html).not.toContain('./vendor/yasgui.min.js');
  expect(html).not.toMatch(/^[+-]/m);
  const cdn = page.locator('#yasgui-cdn');
  await expect(cdn).toContainText('not published on npm yet');
  await cdn.getByRole('button', { name: 'Copy migrated HTML' }).click();
  const cdnHtml = await page.evaluate(() => navigator.clipboard.readText());
  expect(cdnHtml).toContain(
    'https://cdn.jsdelivr.net/npm/@ldforge/yasgui@0.1.7/dist/yasgui.css',
  );
  expect(cdnHtml).toContain(
    'https://cdn.jsdelivr.net/npm/@ldforge/yasgui@0.1.7/dist/yasgui.min.js',
  );
  expect(cdnHtml).not.toContain('@triply/yasgui');
  expect(cdnHtml).not.toMatch(/^[+-]/m);
  await page.reload();
  await expect(migration).toHaveAttribute('aria-current', 'location');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(migration).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await navigation.getByRole('link', { name: 'Embed LDForge' }).click();
  await expect(page).toHaveURL(/#embed$/);
});
