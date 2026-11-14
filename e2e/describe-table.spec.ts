import { expect, test } from '@playwright/test';
test('local DESCRIBE example uses equal/custom table column widths', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'DESCRIBE example', exact: true })
    .click();
  await expect(page.locator('#active-endpoint')).toHaveText(
    'Local fixture (no endpoint)',
  );
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  const table = page.locator('table.ldforge-table');
  await expect(table).toBeVisible();
  await expect(table).toContainText('Lokale DESCRIBE-demodataset');
  await expect(table.getByRole('columnheader')).toHaveText([
    'subject',
    'predicate',
    'object',
  ]);
  const widths = await table
    .getByRole('columnheader')
    .evaluateAll((cells) =>
      cells.map((cell) => cell.getBoundingClientRect().width),
    );
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(2);
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  await query.fill(
    '# view=table; colums=40%,40%,20%\nDESCRIBE <https://n2t.net/ark:/72166/dataset>',
  );
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(table.locator('col').nth(2)).toHaveAttribute(
    'style',
    'width: 20%;',
  );
  const custom = await table
    .getByRole('columnheader')
    .evaluateAll((cells) =>
      cells.map((cell) => cell.getBoundingClientRect().width),
    );
  expect((custom[0] ?? 0) / (custom[2] ?? 1)).toBeCloseTo(2, 1);
  await page
    .getByRole('button', { name: 'Plugin wizard', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    dialog.getByRole('textbox', {
      name: 'Column widths (e.g. 40%,40%,20%)',
      exact: true,
    }),
  ).toHaveValue('40%,40%,20%');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
