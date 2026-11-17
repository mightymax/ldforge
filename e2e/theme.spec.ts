import { expect, test } from '@playwright/test';

test('default and blue themes cover settings, wizard and result controls independently', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.evaluate(async (base) => {
    const modulePath = base + '/packages/editor/src/index.ts';
    const { createEditor } = await import(modulePath);
    const { createTableRenderer } = await import(
      base + '/packages/renderers/src/index.ts'
    );
    const fixture = document.createElement('div');
    fixture.id = 'theme-fixture';
    document.body.replaceChildren(fixture);
    for (const [id, color] of [
      ['default', undefined],
      ['blue', '#1a80b9'],
    ] as const) {
      const host = document.createElement('div');
      host.id = id;
      fixture.append(host);
      const editor = createEditor(host, {
        ...(color ? { themeMainColor: color } : {}),
        query: 'SELECT ?value WHERE { VALUES ?value { "hello" } }',
        executor: {
          execute: async () => ({
            kind: 'bindings',
            variables: ['value'],
            bindings: [{ value: { type: 'literal', value: 'hello' } }],
          }),
        },
        renderers: [createTableRenderer()],
        settings: [
          {
            id: 'theme-probe',
            label: 'Theme probe',
            render(container: HTMLElement) {
              const probe = document.createElement('div');
              probe.className = 'theme-probe';
              probe.style.cssText =
                'background:var(--ldforge-selected,#eef7f1);color:var(--ldforge-accent-text,#216b50)';
              probe.textContent = 'Plugin consumes shared tokens';
              container.append(probe);
            },
          },
        ],
      });
      (
        window as unknown as { themeEditors: Record<string, typeof editor> }
      ).themeEditors ??= {};
      (
        window as unknown as { themeEditors: Record<string, typeof editor> }
      ).themeEditors[id] = editor;
      await editor.run();
    }
  }, `/@fs${process.cwd()}`);
  const standard = page.locator('#default');
  const blue = page.locator('#blue');
  await expect(
    standard
      .locator('.ldforge-button-group[data-button-group="query"] > button')
      .first(),
  ).toHaveCSS('background-color', 'rgb(7, 94, 85)');
  await expect(
    blue
      .locator('.ldforge-button-group[data-button-group="query"] > button')
      .first(),
  ).toHaveCSS('background-color', 'rgb(26, 128, 185)');
  await expect(blue.locator('th').first()).not.toHaveCSS(
    'background-color',
    'rgb(242, 246, 244)',
  );
  // Open settings through the public button, exercising inherited plugin tokens.
  for (const host of [standard, blue]) {
    await host.locator('.ldforge-settings-toggle').click();
    await expect(host.locator('.theme-probe')).toBeVisible();
  }
  await expect(standard.locator('.theme-probe')).toHaveCSS(
    'background-color',
    'rgb(238, 247, 241)',
  );
  await expect(blue.locator('.theme-probe')).toHaveCSS(
    'background-color',
    'rgb(221, 236, 245)',
  );
  await page.screenshot({
    path: testInfo.outputPath('themes-settings.png'),
    fullPage: true,
  });
  await testInfo.attach('Default and blue settings', {
    path: testInfo.outputPath('themes-settings.png'),
    contentType: 'image/png',
  });
  await standard
    .getByRole('button', { name: 'Plugin wizard', exact: true })
    .click();
  await expect(
    standard
      .getByRole('region', { name: /Plugin wizard/ })
      .locator('.ldforge-wizard-primary'),
  ).toHaveCSS('background-color', 'rgb(33, 107, 80)');
  await page.keyboard.press('Escape');
  await blue
    .getByRole('button', { name: 'Plugin wizard', exact: true })
    .click();
  const dialog = blue.getByRole('region', { name: /Plugin wizard/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[aria-current="step"] > span')).toHaveCSS(
    'background-color',
    'rgb(26, 128, 185)',
  );
  await expect(dialog.locator('.ldforge-wizard-primary')).toHaveCSS(
    'background-color',
    'rgb(26, 128, 185)',
  );
  const selectedCard = dialog.locator(
    '.ldforge-wizard-renderer:has(input:checked)',
  );
  await expect(selectedCard).toHaveCount(1);
  await expect(selectedCard).not.toHaveCSS(
    'background-color',
    'rgb(238, 247, 241)',
  );
  await page.screenshot({
    path: testInfo.outputPath('theme-wizard.png'),
    fullPage: true,
  });
  await testInfo.attach('Blue wizard', {
    path: testInfo.outputPath('theme-wizard.png'),
    contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const editors = (
      window as unknown as {
        themeEditors: Record<
          string,
          { setThemeMainColor(color?: string): void }
        >;
      }
    ).themeEditors;
    editors.blue?.setThemeMainColor('#fff');
  });
  const action = blue
    .locator('.ldforge-button-group[data-button-group="query"] > button')
    .first();
  await expect(action).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(action).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(standard.locator('.ldforge')).toHaveCSS(
    '--ldforge-accent',
    '#075e55',
  );
  await page.evaluate(() => {
    (
      window as unknown as {
        themeEditors: Record<
          string,
          { setThemeMainColor(color?: string): void }
        >;
      }
    ).themeEditors.blue?.setThemeMainColor();
  });
  await expect(action).toHaveCSS('background-color', 'rgb(7, 94, 85)');
});
