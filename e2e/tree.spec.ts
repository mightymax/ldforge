import { expect, test } from '@playwright/test';
test('local tree supports keyboard, collapse and view switching', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'SKOS hierarchy (local tree)', exact: true })
    .click();
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  const tree = page.getByRole('tree');
  await expect(tree.getByRole('treeitem')).toHaveCount(1);
  const root = tree.getByRole('treeitem').first();
  await root.focus();
  await root.press('ArrowRight');
  await expect(tree.getByRole('treeitem')).toHaveCount(3);
  await expect(root).toHaveAttribute('aria-expanded', 'true');
  await root.press('ArrowDown');
  await expect(tree.getByRole('treeitem').nth(1)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tree.getByRole('treeitem')).toHaveCount(4);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft');
  await expect(tree.getByRole('treeitem')).toHaveCount(1);
  if (
    !(await page.getByRole('tab', { name: 'Table', exact: true }).isVisible())
  )
    await page.locator('.ldforge-renderer-picker > summary').click();
  await page.getByRole('tab', { name: 'Table', exact: true }).click();
  await expect(tree).toHaveCount(0);
  if (!(await page.getByRole('tab', { name: 'Tree', exact: true }).isVisible()))
    await page.locator('.ldforge-renderer-picker > summary').click();
  await page.getByRole('tab', { name: 'Tree', exact: true }).click();
  await expect(tree.getByRole('treeitem')).toHaveCount(1);
  await tree.getByRole('treeitem').click();
  await expect(tree.getByRole('treeitem')).toHaveCount(3);
});
