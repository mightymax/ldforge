import { expect, test } from '@playwright/test';

test('automatically indents nested SPARQL blocks and dedents closing braces', async ({
  page,
}) => {
  await page.goto('/');
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  await query.fill('SELECT * WHERE {');
  await query.press('End');
  await query.press('Escape');
  await query.press('Enter');
  await page.keyboard.insertText('GRAPH <g> {');
  await query.press('Escape');
  await query.press('Enter');
  await page.keyboard.insertText('?s ?p ?o .');
  await query.press('Escape');
  await query.press('Enter');
  await page.keyboard.insertText('}');
  await query.press('Enter');
  await page.keyboard.insertText('}');
  await expect(query.locator('.cm-line')).toHaveText([
    'SELECT * WHERE {',
    '  GRAPH <g> {',
    '    ?s ?p ?o .',
    '  }',
    '}',
  ]);
});

for (const platform of ['MacIntel', 'Win32', 'Linux x86_64']) {
  test(`indents selections and toggles comments on ${platform}`, async ({
    page,
  }) => {
    await page.addInitScript((platform) => {
      Object.defineProperty(navigator, 'platform', { get: () => platform });
    }, platform);
    const mod = platform === 'MacIntel' ? 'Meta' : 'Control';
    await page.goto('/');
    const query = page.getByRole('textbox', {
      name: 'SPARQL query',
      exact: true,
    });
    const original = ['SELECT * WHERE {', '  ?s ?p ?o .', '}'];
    await query.fill(original.join('\n'));
    await query.press(`${mod}+a`);
    await query.press('Tab');
    await expect(query.locator('.cm-line')).toHaveText(
      original.map((line) => '  ' + line),
    );
    await query.press('Shift+Tab');
    await expect(query.locator('.cm-line')).toHaveText(original);
    await query.press(`${mod}+/`);
    await expect(query.locator('.cm-line')).toHaveText(
      original.map((line) => '# ' + line),
    );
    await query.press(`${mod}+/`);
    await expect(query.locator('.cm-line')).toHaveText(original);
    await query.press('ArrowRight');
    await query.press(`${mod}+/`);
    await expect(query.locator('.cm-line').last()).toHaveText('# }');
    await query.press(`${mod}+/`);
    await expect(query.locator('.cm-line')).toHaveText(original);
    await query.press('Escape');
    await query.press('Tab');
    await expect(query).not.toBeFocused();
    await page
      .getByRole('button', { name: 'Keyboard shortcuts', exact: true })
      .click();
    const help = page.getByRole('region', {
      name: 'Keyboard shortcuts',
      exact: true,
    });
    await expect(help).toContainText('Shift+Tab');
    await expect(help).toContainText('Toggle comment on line or selection');
  });
}
