import { expect, test } from '@playwright/test';

test('uses a 15-line query viewport, scrolls long queries and persists optional auto-grow', async ({
  page,
}) => {
  await page.goto('/');
  const code = page.locator('.ldforge-code');
  const editor = code.locator('.cm-editor');
  const scroller = code.locator('.cm-scroller');
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  const dimensions = () =>
    editor.evaluate((element) => {
      const scroll = element.querySelector('.cm-scroller');
      if (!scroll) throw new Error('Missing query scroller');
      return {
        height: element.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(scroll).lineHeight),
      };
    });
  const initial = await dimensions();
  expect(initial.height).toBeCloseTo(15 * initial.lineHeight + 8, 0);
  const longQuery =
    Array.from({ length: 50 }, (_, i) => `# line ${i + 1}`).join('\n') +
    '\nASK {}';
  await query.fill(longQuery);
  await expect
    .poll(async () => (await dimensions()).height)
    .toBe(initial.height);
  expect(
    await scroller.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(query).toContainText('ASK {}');
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  const autoGrow = page.getByRole('checkbox', {
    name: 'Show the full query',
    exact: true,
  });
  await expect(autoGrow).not.toBeChecked();
  await autoGrow.check();
  await expect
    .poll(async () => (await dimensions()).height)
    .toBeGreaterThan(initial.height * 2);
  await expect(code).toHaveAttribute('data-auto-grow', 'true');
  await autoGrow.uncheck();
  await expect
    .poll(async () => (await dimensions()).height)
    .toBe(initial.height);
  await page
    .getByRole('combobox', { name: 'Text size', exact: true })
    .selectOption('18');
  const larger = await dimensions();
  expect(larger.height).toBeCloseTo(15 * larger.lineHeight + 8, 0);
  await autoGrow.check();
  await page.reload();
  await expect(code).toHaveAttribute('data-auto-grow', 'true');
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await expect(autoGrow).toBeChecked();
  await autoGrow.uncheck();
  await page.reload();
  await expect(code).toHaveAttribute('data-auto-grow', 'false');
  await expect
    .poll(async () => (await dimensions()).height)
    .toBe(larger.height);
});
