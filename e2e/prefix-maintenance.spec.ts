import { expect, test } from '@playwright/test';

test('prefix panel actions add missing declarations and remove unused ones with undo', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async (moduleUrl) => {
    const { createEditor } = await import(/* @vite-ignore */ moduleUrl);
    const mount = document.createElement('div');
    document.body.replaceChildren(mount);
    createEditor(mount, {
      query:
        'PREFIX unused: <https://unused.org/>\nSELECT * WHERE { ?s ex:p "unused:text" }',
      executor: { execute: async () => ({ kind: 'boolean', value: true }) },
      sparql: { prefixes: { ex: 'https://example.org/' }, autoPrefixes: false },
    });
  }, `/@fs${process.cwd()}/packages/editor/src/index.ts`);
  await page.getByRole('button', { name: 'Prefixes', exact: true }).click();
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  await page
    .getByRole('button', { name: 'Add missing prefixes', exact: true })
    .click();
  await expect(query).toContainText('PREFIX ex: <https://example.org/>');
  await page
    .getByRole('button', { name: 'Remove unused prefixes', exact: true })
    .click();
  await expect(query).not.toContainText('PREFIX unused:');
  await expect(query).toContainText('"unused:text"');
  await query.focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(query).toContainText('PREFIX unused:');
  await expect(query).toContainText('PREFIX ex:');
});
