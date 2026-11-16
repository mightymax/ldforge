import { expect, test } from '@playwright/test';

test('virtual table reaches the final row and filters and sorts all loaded rows', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const { createTableRenderer } = await import(/* @vite-ignore */ modulePath);
    const host = document.createElement('div');
    host.id = 'large-table';
    host.className = 'ldforge';
    document.body.replaceChildren(host);
    createTableRenderer().render(host, {
      kind: 'bindings',
      variables: ['value'],
      bindings: Array.from({ length: 10000 }, (_, i) => ({
        value: { type: 'literal', value: String(i) },
      })),
    });
  }, `/@fs${process.cwd()}/packages/renderers/src/index.ts`);
  const viewport = page.locator('.ldforge-table-viewport');
  await expect(page.locator('tbody tr')).toHaveCount(27);
  await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    page.getByRole('cell', { name: '9999', exact: true }),
  ).toBeVisible();
  const overflow = await viewport.evaluate(
    (element) =>
      element.scrollHeight - element.scrollTop - element.clientHeight,
  );
  expect(overflow).toBeLessThan(40);
  const scrollBefore = await viewport.evaluate((element) => element.scrollTop);
  const detailsToggle = page.getByRole('button', {
    name: 'RDF details',
    exact: true,
  });
  await detailsToggle.click();
  await expect(
    page.getByRole('cell', { name: '"9999"', exact: true }),
  ).toBeVisible();
  expect(await viewport.evaluate((element) => element.scrollTop)).toBe(
    scrollBefore,
  );
  await detailsToggle.click();
  const heading = page.getByRole('columnheader');
  const filter = page.getByRole('searchbox', {
    name: 'Filter value',
    exact: true,
  });
  await expect(heading).toHaveAttribute('aria-sort', 'none');
  const headingBox = await heading.boundingBox();
  const filterBox = await filter.boundingBox();
  if (!headingBox || !filterBox) throw new Error('Table header is not visible');
  expect(filterBox.x).toBeGreaterThanOrEqual(headingBox.x);
  expect(filterBox.x + filterBox.width).toBeLessThanOrEqual(
    headingBox.x + headingBox.width,
  );
  const sort = page.getByRole('button', { name: 'value', exact: true });
  await sort.focus();
  await sort.press('Enter');
  await expect(heading).toHaveAttribute('aria-sort', 'ascending');
  await expect(sort.locator('path').first()).toHaveAttribute('opacity', '1');
  await sort.press('Enter');
  await expect(heading).toHaveAttribute('aria-sort', 'descending');
  await expect(sort.locator('path').last()).toHaveAttribute('opacity', '1');
  await expect(page.locator('tbody tr').first()).toHaveText('9999');
  await page
    .getByRole('searchbox', { name: 'Filter value', exact: true })
    .fill('1234');
  await expect(
    page.getByRole('cell', { name: '1234', exact: true }),
  ).toBeVisible();
  await expect(page.locator('caption')).toHaveText('1 / 10000 results');
});

test('table URI opens local inspector with keyboard close', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'DESCRIBE example', exact: true })
    .click();
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  const resource = page.locator('tbody button').first();
  await resource.click();
  const inspector = page.getByRole('region', { name: 'Resource inspector' });
  await expect(inspector).toBeVisible();
  await expect(inspector.locator('dl')).toBeVisible();
  await inspector.press('Escape');
  await expect(inspector).toBeHidden();
  await expect(resource).toBeFocused();
});

test('inspector loads properties through the selected endpoint and follows resources', async ({
  page,
}) => {
  const queries: string[] = [];
  await page.route('https://inspector.example/sparql?**', async (route) => {
    const query =
      new URL(route.request().url()).searchParams.get('query') ?? '';
    queries.push(query);
    if (query.startsWith('CONSTRUCT')) {
      await route.fulfill({
        contentType: 'application/n-triples',
        body: '<urn:a> <urn:related> <urn:b> .\n<urn:b> <urn:label> "Related resource"@en .',
      });
    } else {
      await route.fulfill({
        contentType: 'application/sparql-results+json',
        body: JSON.stringify({
          head: { vars: ['resource'] },
          results: {
            bindings: [{ resource: { type: 'uri', value: 'urn:a' } }],
          },
        }),
      });
    }
  });
  await page.goto('/');
  await page
    .getByRole('textbox', { name: 'SPARQL query', exact: true })
    .fill(
      '# view=table\n# sparql-endpoint=https://inspector.example/sparql\nSELECT ?resource WHERE { ?resource ?p ?o } LIMIT 1',
    );
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await page
    .getByRole('button', { name: 'Information about urn:a', exact: true })
    .click();
  const inspector = page.getByRole('region', { name: 'Resource inspector' });
  await expect(
    inspector.getByRole('button', { name: 'urn:b', exact: true }),
  ).toBeVisible();
  await inspector.getByRole('button', { name: 'urn:b', exact: true }).click();
  await expect(inspector.getByRole('heading')).toHaveText('urn:b');
  await expect(inspector).toContainText('Related resource');
  expect(queries).toHaveLength(3);
  expect(queries[1]).toContain('CONSTRUCT { <urn:a>');
  expect(queries[2]).toContain('CONSTRUCT { <urn:b>');
});

test('resource details expand beneath their row and survive virtual scrolling', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const { createTableRenderer } = await import(/* @vite-ignore */ modulePath);
    const host = document.createElement('div');
    host.className = 'ldforge';
    document.body.replaceChildren(host);
    createTableRenderer({
      loadResource: async (iri: string) => ({
        kind: 'graph',
        triples: [
          {
            subject: { type: 'uri', value: iri },
            predicate: { type: 'uri', value: 'urn:label' },
            object: { type: 'literal', value: `Details for ${iri}` },
          },
        ],
      }),
    }).render(host, {
      kind: 'bindings',
      variables: ['resource', 'value'],
      bindings: Array.from({ length: 10000 }, (_, i) => ({
        resource: { type: 'uri', value: `urn:item:${i}` },
        value: { type: 'literal', value: String(i) },
      })),
    });
  }, `/@fs${process.cwd()}/packages/renderers/src/index.ts`);
  const viewport = page.locator('.ldforge-table-viewport');
  const origin = page.getByRole('button', {
    name: 'Information about urn:item:2',
    exact: true,
  });
  const panel = page.getByRole('region', { name: 'Resource inspector' });
  await viewport.evaluate((element) => {
    const button = element.querySelector('tbody button');
    const heading = element.querySelector('th');
    if (!button || !heading) throw new Error('Missing table controls');
    const buttonBox = button.getBoundingClientRect();
    const headingBox = heading.getBoundingClientRect();
    element.scrollTop +=
      buttonBox.top + buttonBox.height / 2 - headingBox.bottom + 12;
  });
  expect(
    await page
      .locator('tbody button')
      .first()
      .evaluate((button) => {
        const box = button.getBoundingClientRect();
        return Boolean(
          document
            .elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
            ?.closest('thead'),
        );
      }),
  ).toBe(true);
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
  });
  await origin.click();
  await expect(panel).toContainText('Details for urn:item:2');
  await expect(origin).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('tbody tr[aria-rowindex="4"] + tr')).toHaveClass(
    'ldforge-table-detail',
  );
  await expect(page.locator('.ldforge-table-detail > td')).toHaveAttribute(
    'colspan',
    '2',
  );
  expect(await viewport.evaluate((el) => el.scrollTop)).toBe(0);
  await viewport.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(
    page.getByRole('cell', { name: '9999', exact: true }),
  ).toBeVisible();
  expect(await page.locator('tbody tr').count()).toBeLessThan(40);
  await viewport.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(panel).toContainText('Details for urn:item:2');
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.ldforge-table-detail')).toHaveCount(0);
  await expect(origin).toBeFocused();
  await origin.click();
  await page
    .getByRole('searchbox', { name: 'Filter value', exact: true })
    .fill('9999');
  await expect(page.locator('.ldforge-table-detail')).toHaveCount(0);
  await expect(
    page.getByRole('cell', { name: '9999', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('searchbox', { name: 'Filter value', exact: true }),
  ).toBeFocused();
});
