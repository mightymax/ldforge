import { expect, test } from '@playwright/test';
test('query font size persists and leaves toolbar/settings/results unchanged, including styled saved endpoints', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  await expect(query).toHaveCSS('font-size', '12px');
  const original = await query.innerText();
  const sizes = await page.evaluate(() => ({
    toolbar: getComputedStyle(
      document.querySelector('.ldforge-core-actions button') as HTMLElement,
    ).fontSize,
    cell: getComputedStyle(
      document.querySelector('.ldforge-results td') as HTMLElement,
    ).fontSize,
  }));
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  const font = page.getByRole('combobox', { name: 'Text size', exact: true });
  await font.selectOption('18');
  await expect(query).toHaveCSS('font-size', '18px');
  await expect(
    page.getByRole('button', { name: 'Run query', exact: true }),
  ).toHaveCSS('font-size', sizes.toolbar);
  await expect(page.locator('.ldforge-results td').first()).toHaveCSS(
    'font-size',
    sizes.cell,
  );
  expect(await query.innerText()).toBe(original);
  const saved = page.getByRole('combobox', {
    name: 'Saved endpoints',
    exact: true,
  });
  await expect(saved).toHaveCSS('border-radius', '8px');
  expect(
    await saved.evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    ),
  ).toContain('linear-gradient');
  await page
    .getByRole('button', { name: 'Increase text size', exact: true })
    .click();
  await expect(query).toHaveCSS('font-size', '19px');
  await page
    .getByRole('button', { name: 'Decrease text size', exact: true })
    .click();
  await expect(query).toHaveCSS('font-size', '18px');
  await page.reload();
  await expect(query).toHaveCSS('font-size', '18px');
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Text size', exact: true }),
  ).toHaveValue('18');
  await page
    .getByRole('button', { name: 'Reset text size', exact: true })
    .click();
  await expect(query).toHaveCSS('font-size', '12px');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
