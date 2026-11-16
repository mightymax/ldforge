import { expect, test } from '@playwright/test';

test('shows exact RDF lexical values with themed superscript datatypes and language tags', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(
    async ({ modulePath, themePath }) => {
      const { createTableRenderer } = await import(
        /* @vite-ignore */ modulePath
      );
      const { themeTokens, applyTheme } = await import(
        /* @vite-ignore */ themePath
      );
      const host = document.createElement('div');
      host.id = 'rdf-detail-table';
      host.className = 'ldforge';
      host.style.cssText = 'margin:24px;width:calc(100% - 48px)';
      applyTheme(host, {}, themeTokens('#1a80b9'));
      document.body.replaceChildren(host);
      const xsd = 'http://www.w3.org/2001/XMLSchema#';
      const rows = [
        ['string', 'Hello world'],
        ['integer', '42'],
        ['long', '9223372036854775807'],
        ['int', '123'],
        ['decimal', '3.14159'],
        ['float', '3.14'],
        ['double', '1.23E4'],
        ['boolean', 'true'],
        ['boolean', 'false'],
        ['date', '2026-11-16'],
        ['dateTime', '2026-11-16T12:30:00Z'],
        ['time', '14:30:00'],
        ['duration', 'P2Y3M5D'],
        ['gYear', '2026'],
        ['anyURI', 'https://example.org'],
      ];
      createTableRenderer().render(
        host,
        {
          kind: 'bindings',
          variables: ['type', 'value'],
          bindings: [
            ...rows.map(([datatype, value]) => ({
              type: { type: 'literal', value: datatype },
              value: { type: 'literal', value, datatype: xsd + datatype },
            })),
            {
              type: { type: 'literal', value: 'langString' },
              value: {
                type: 'literal',
                value: 'Hallo wereld',
                'xml:lang': 'nl',
              },
            },
            {
              type: { type: 'literal', value: 'langString' },
              value: {
                type: 'literal',
                value: 'Hello world',
                'xml:lang': 'en',
              },
            },
            {
              type: { type: 'literal', value: 'uri' },
              value: { type: 'uri', value: 'https://example.org' },
            },
            {
              type: { type: 'literal', value: 'bnode' },
              value: { type: 'bnode', value: 'b1' },
            },
          ],
        },
        { locale: 'en' },
      );
    },
    {
      modulePath: `/@fs${process.cwd()}/packages/renderers/src/index.ts`,
      themePath: `/@fs${process.cwd()}/packages/editor/src/theme.ts`,
    },
  );
  const table = page.locator('#rdf-detail-table');
  const toggle = table.getByRole('button', {
    name: 'RDF details',
    exact: true,
  });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(
    table.getByRole('cell', {
      name: '"9223372036854775807"^^xsd:long',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    table.getByRole('cell', { name: '"3.14"^^xsd:float', exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole('cell', { name: '"1.23E4"^^xsd:double', exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole('cell', { name: '"Hallo wereld"@nl', exact: true }),
  ).toBeVisible();
  await expect(
    table.getByText('<https://example.org>', { exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole('cell', { name: '_:b1', exact: true }),
  ).toBeVisible();
  const meta = table.locator('sup').first();
  await expect(meta).toHaveCSS('vertical-align', 'super');
  const colors = await meta.evaluate((element) => ({
    actual: getComputedStyle(element).color,
    muted: getComputedStyle(element.closest('.ldforge') as HTMLElement)
      .getPropertyValue('--ldforge-muted')
      .trim(),
    textSize: parseFloat(
      getComputedStyle(element.parentElement as HTMLElement).fontSize,
    ),
    size: parseFloat(getComputedStyle(element).fontSize),
  }));
  expect(colors.size).toBeLessThan(colors.textSize);
  await expect(meta).toHaveCSS(
    'color',
    await page.evaluate((color) => {
      const probe = document.createElement('span');
      probe.style.color = color;
      document.body.append(probe);
      const result = getComputedStyle(probe).color;
      probe.remove();
      return result;
    }, colors.muted),
  );
  await page.screenshot({
    path: '/tmp/ldforge-rdf-details.png',
    fullPage: true,
  });
  await toggle.click();
  await expect(table.locator('sup')).toHaveCount(0);
  await expect(
    table.getByRole('cell', { name: '9223372036854775807', exact: true }),
  ).toBeVisible();
});
