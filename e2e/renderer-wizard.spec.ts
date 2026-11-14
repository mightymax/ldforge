import { expect, test } from '@playwright/test';

test('plugin wizard previews registered renderer options, preserves query/CSS and applies with undo', async ({
  page,
}) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.goto('/');
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  await query.fill(
    '# view=table\n# css=color: red\n# Keep my comment\nSELECT ?chart_label ?chart_value WHERE { VALUES (?chart_label ?chart_value) { ("A" 1) } }',
  );
  const trigger = page.getByRole('button', {
    name: 'Plugin wizard',
    exact: true,
  });
  await expect(trigger).toHaveAttribute('title', 'Plugin wizard');
  await trigger.click();
  const dialog = page.getByRole('dialog', {
    name: 'Plugin wizard',
    exact: false,
  });
  await expect(dialog).toBeVisible();
  const renderers = dialog.getByRole('combobox', {
    name: 'Renderer',
    exact: true,
  });
  await expect(renderers.locator('option')).toHaveCount(9);
  await renderers.selectOption('charts');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog
    .getByRole('combobox', { name: 'Chart type', exact: true })
    .selectOption('pie');
  await dialog
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('My "pie"; title');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  const preview = dialog.getByRole('textbox', {
    name: 'Generated header',
    exact: true,
  });
  await expect(preview).toHaveValue(/chart=pie/);
  await expect(preview).toHaveValue(/\?chart_value \(required\)/);
  await expect(query).not.toContainText('chart=pie');
  await dialog
    .getByRole('button', { name: 'Apply to query', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(query).toContainText('chart=pie');
  await expect(query).toContainText('# css=color: red');
  await expect(query).toContainText('# Keep my comment');
  await expect(query).toContainText('SELECT ?chart_label');
  await query.focus();
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+z' : 'Control+z',
  );
  await expect(query).not.toContainText('chart=pie');
  expect(
    scripts.some((url) =>
      /chart\.js@|leaflet@|vis-network@|vis-timeline@|maplibre-gl@/.test(url),
    ),
  ).toBe(false);
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(390);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
});
