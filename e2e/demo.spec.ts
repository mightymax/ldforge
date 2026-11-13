import { expect, test } from '@playwright/test';

test('runs fixture queries, switches result plugins and uses example button plugins', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'SPARQL query',
  );
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.getByRole('table')).toContainText('Amsterdam');
  await expect(page.locator('.ldforge-status')).toHaveText(
    /^3 results in \d+ ms$/,
  );
  await page
    .getByRole('combobox', { name: 'Result view' })
    .selectOption('json');
  await expect(page.locator('.ldforge-results pre')).toContainText('bindings');
  await page.getByRole('button', { name: 'ASK example' }).click();
  await page
    .getByRole('textbox', { name: 'SPARQL query' })
    .press('ControlOrMeta+Enter');
  await page
    .getByRole('combobox', { name: 'Result view' })
    .selectOption('boolean');
  await expect(page.locator('.ldforge-results')).toHaveText('True');
  expect(errors).toEqual([]);
});

test('connects an HTTP endpoint and reports transport errors', async ({
  page,
}) => {
  await page.route('https://example.org/sparql', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postData()).toContain('SELECT');
    await route.fulfill({
      status: 503,
      body: 'Unavailable',
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await page
    .getByLabel('SPARQL endpoint', { exact: true })
    .fill('https://example.org/sparql');
  await page.getByRole('button', { name: 'Apply endpoint' }).click();
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.locator('.ldforge-status')).toHaveText(
    'SPARQL endpoint returned HTTP 503.',
  );
});

test('fits a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('remembers applied endpoints across reloads and reuses a saved choice', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  const endpoint = page.getByLabel('SPARQL endpoint', { exact: true });
  const choices = page.getByRole('combobox', { name: 'Saved endpoints' });
  for (const value of [
    'https://one.example/sparql',
    'https://two.example/sparql',
    'https://one.example/sparql',
  ]) {
    await endpoint.fill(value);
    await page.getByRole('button', { name: 'Apply endpoint' }).click();
  }
  await page.reload();
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await expect(choices.locator('option')).toHaveText([
    'Choose a saved endpoint',
    'Local fixture (no endpoint)',
    'https://one.example/sparql',
    'https://two.example/sparql',
  ]);
  await choices.selectOption('https://two.example/sparql');
  await expect(endpoint).toHaveValue('https://two.example/sparql');
  await expect(page.locator('#connection-status')).toContainText(
    'Live endpoint: https://two.example/sparql',
  );
  await choices.selectOption('');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.getByRole('table')).toContainText('Amsterdam');
  await expect(page.locator('.ldforge-status')).toHaveText(
    /^3 results in \d+ ms$/,
  );
});

for (const method of ['GET', 'POST']) {
  test(`configures ${method} and authentication headers inside IDE settings`, async ({
    page,
  }) => {
    let requests = 0;
    await page.route('https://secure.example/sparql**', async (route) => {
      const request = route.request();
      expect(request.method()).toBe(method);
      expect(request.headers().authorization).toBe('Bearer demo-secret');
      if (method === 'GET') {
        expect(new URL(request.url()).searchParams.get('query')).toContain(
          'SELECT',
        );
        expect(request.postData()).toBeNull();
      } else {
        expect(request.postData()).toContain('SELECT');
        expect(request.headers()['content-type']).toBe(
          'application/sparql-query',
        );
      }
      requests++;
      await route.fulfill({ json: { boolean: true } });
    });
    await page.goto('/');
    const ide = page.getByRole('region', {
      name: 'SPARQL editor',
      exact: true,
    });
    const settings = page.getByRole('region', {
      name: 'IDE settings',
      exact: true,
    });
    await expect(settings).toBeHidden();
    await ide
      .getByRole('button', { name: 'IDE settings', exact: true })
      .click();
    await settings
      .getByLabel('SPARQL endpoint', { exact: true })
      .fill('https://secure.example/sparql');
    await settings.getByLabel('Request method').selectOption(method);
    await settings.getByRole('button', { name: 'Add header' }).click();
    await settings
      .getByLabel('Header name', { exact: true })
      .fill('Authorization');
    await settings
      .getByLabel('Header value', { exact: true })
      .fill('Bearer demo-secret');
    await settings.getByRole('button', { name: 'Apply endpoint' }).click();
    await ide
      .getByRole('button', { name: 'IDE settings', exact: true })
      .click();
    await page.getByRole('button', { name: 'Run query' }).click();
    await expect(page.locator('.ldforge-status')).toHaveText(
      /^True in \d+ ms$/,
    );
    expect(requests).toBe(1);
    expect(
      await page.evaluate(() => JSON.stringify(localStorage)),
    ).not.toContain('demo-secret');
    await page.reload();
    await page
      .getByRole('button', { name: 'IDE settings', exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Saved endpoints' })
      .selectOption('https://secure.example/sparql');
    await expect(page.getByLabel('Request method')).toHaveValue(method);
    await expect(page.getByLabel('Header value', { exact: true })).toHaveCount(
      0,
    );
  });
}

test('validates header settings and keeps credentials separate between endpoints', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  const endpoint = page.getByLabel('SPARQL endpoint', { exact: true });
  await endpoint.fill('https://one.example/sparql');
  await page.getByRole('button', { name: 'Add header' }).click();
  const name = page.getByLabel('Header name', { exact: true });
  await name.fill('Content-Type');
  await page.getByRole('button', { name: 'Apply endpoint' }).click();
  await expect(page.locator('#connection-status')).toHaveText(
    'Accept and Content-Type are managed by LDForge.',
  );
  await name.fill('Authorization');
  await page.getByLabel('Header value', { exact: true }).fill('Bearer one');
  await page.getByRole('button', { name: 'Apply endpoint' }).click();
  await endpoint.fill('https://two.example/sparql');
  await expect(page.getByLabel('Header value', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply endpoint' }).click();
  await page
    .getByRole('combobox', { name: 'Saved endpoints' })
    .selectOption('https://one.example/sparql');
  await expect(page.getByLabel('Header value', { exact: true })).toHaveValue(
    'Bearer one',
  );
  await page.getByRole('button', { name: 'Remove header' }).click();
  await expect(page.getByLabel('Header value', { exact: true })).toHaveCount(0);
});

test('persists virtual query tabs, renamed titles and edits without replacing the editor', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    Object.assign(window, {
      originalEditor: document.querySelector('.cm-editor'),
    });
  });
  await page.getByRole('tab', { name: 'Query 1', exact: true }).dblclick();
  await page
    .getByRole('textbox', { name: 'Query name', exact: true })
    .fill('Cities');
  await page
    .getByRole('textbox', { name: 'Query name', exact: true })
    .press('Enter');
  await page.getByRole('button', { name: 'New query', exact: true }).click();
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  await query.fill('ASK { ?s ?p ?o }');
  await page
    .getByRole('button', { name: 'Rename Query 2', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Query name', exact: true })
    .fill('Exists?');
  await page
    .getByRole('textbox', { name: 'Query name', exact: true })
    .press('Enter');
  await page.getByRole('tab', { name: 'Cities', exact: true }).click();
  await expect(query).toContainText('SELECT');
  await page.getByRole('tab', { name: 'Exists?', exact: true }).click();
  await expect(query).toHaveText('ASK { ?s ?p ?o }');
  expect(
    await page.evaluate(
      () =>
        Reflect.get(window, 'originalEditor') ===
        document.querySelector('.cm-editor'),
    ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByRole('tab', { name: 'Exists?', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(query).toHaveText('ASK { ?s ?p ?o }');
  await page
    .getByRole('button', { name: 'Rename Exists?', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Query name', exact: true })
    .fill('Discard');
  await page
    .getByRole('textbox', { name: 'Query name', exact: true })
    .press('Escape');
  await expect(
    page.getByRole('tab', { name: 'Exists?', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Close Exists?', exact: true })
    .click();
  await expect(
    page.getByRole('tab', { name: 'Cities', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await expect(page.getByRole('tab')).toHaveCount(1);
});

test.describe('Dutch browser language', () => {
  test.use({ locale: 'nl-NL' });
  test('follows the browser and remembers the user override without losing query or header drafts', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Query uitvoeren', exact: true })
      .click();
    await expect(page.locator('.ldforge-status')).toHaveText(
      /^3 resultaten in \d+ ms$/,
    );
    await page
      .getByRole('button', { name: 'IDE-instellingen', exact: true })
      .click();
    await page
      .getByLabel('SPARQL-endpoint', { exact: true })
      .fill('https://example.org/sparql');
    await page.getByRole('button', { name: 'Header toevoegen' }).click();
    await page.getByLabel('Headernaam', { exact: true }).fill('Authorization');
    await page.getByLabel('Headerwaarde', { exact: true }).fill('Bearer draft');
    await page.locator('.ldforge-language select').selectOption('en');
    await expect(page.getByLabel('Header value', { exact: true })).toHaveValue(
      'Bearer draft',
    );
    await expect(
      page.getByRole('button', { name: 'Run query', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.ldforge-status')).toHaveText(
      /^3 results in \d+ ms$/,
    );
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Run query', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'IDE settings', exact: true })
      .click();
    await page.locator('.ldforge-language select').selectOption('auto');
    await expect(
      page.getByRole('button', { name: 'Query uitvoeren', exact: true }),
    ).toBeVisible();
  });
});

test('completes predicates with PREFIX insertion and marks syntax errors in the browser', async ({
  page,
}) => {
  await page.goto('/');
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  await query.fill('SELECT * WHERE { ?s rdfs:la');
  await query.press('Control+Space');
  await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible();
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText(
    'rdfs:label',
  );
  await page
    .locator('.cm-tooltip-autocomplete [role=option]')
    .filter({ hasText: 'rdfs:label' })
    .click();
  await expect(query).toContainText(
    'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>',
  );
  await expect(query).toContainText('?s rdfs:label');
  await query.pressSequentially(' ?label }');
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(0);
  await query.fill('SELECT * WHERE { ?s ?p @ }');
  await expect(page.locator('.cm-lintRange-error').first()).toBeVisible();
  await query.fill('SELECT * WHERE { ?person ?predicate ?object . FILTER(?per');
  await query.press('Control+Space');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText(
    '?person',
  );
});

test('finds namespaces through the integrated prefix picker and keeps tabs lightweight', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Prefixes', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Find a prefix', exact: true })
    .fill('prov');
  await page
    .getByRole('button', { name: 'Add PREFIX prov', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'SPARQL query', exact: true }),
  ).toContainText('PREFIX prov: <http://www.w3.org/ns/prov#>');
  await page
    .getByRole('searchbox', { name: 'Find a prefix', exact: true })
    .press('Escape');
  await expect(page.locator('.ldforge-prefix-picker')).toBeHidden();
  await expect(
    page
      .getByRole('group', { name: 'Query execution', exact: true })
      .getByRole('button'),
  ).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'SPARQL query', exact: true }),
  ).toContainText('PREFIX prov:');
});

test('groups icon-only core tools on the right and formats without loading a global formatter', async ({
  page,
}) => {
  await page.goto('/');
  const tools = page.getByRole('group', { name: 'Editor tools', exact: true });
  await expect(tools.getByRole('button')).toHaveCount(3);
  expect(
    await tools
      .getByRole('button')
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute('aria-label')),
      ),
  ).toEqual(['Prefixes', 'Format query', 'IDE settings']);
  expect(
    await tools
      .getByRole('button')
      .evaluateAll((buttons) =>
        buttons.every((button) => button.textContent?.trim() === ''),
      ),
  ).toBe(true);
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  await query.fill('select * where {?s ?p ?o}');
  await tools
    .getByRole('button', { name: 'Format query', exact: true })
    .click();
  await expect(query).toContainText('SELECT *WHERE {');
  expect(await query.innerText()).toContain('\n');
  expect(await page.evaluate(() => Reflect.has(window, 'spfmt'))).toBe(false);
  await query.fill('select {');
  await tools
    .getByRole('button', { name: 'Format query', exact: true })
    .click();
  await expect(page.locator('.ldforge-status')).toContainText(
    'Could not format query:',
  );
  await expect(query).toHaveText('select {');
});

test('restores the last applied endpoint and method without running a query', async ({
  page,
}) => {
  let requests = 0;
  await page.route('https://remember.example/sparql**', async (route) => {
    requests++;
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: { boolean: true } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await page
    .getByLabel('SPARQL endpoint', { exact: true })
    .fill('https://remember.example/sparql');
  await page.getByLabel('Request method', { exact: true }).selectOption('GET');
  await page
    .getByRole('button', { name: 'Apply endpoint', exact: true })
    .click();
  await page.reload();
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await expect(page.getByLabel('SPARQL endpoint', { exact: true })).toHaveValue(
    'https://remember.example/sparql',
  );
  await expect(page.getByLabel('Request method', { exact: true })).toHaveValue(
    'GET',
  );
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(page.locator('.ldforge-status')).toHaveText(/^True in \d+ ms$/);
  expect(requests).toBe(1);
  await page
    .getByRole('combobox', { name: 'Saved endpoints', exact: true })
    .selectOption('');
  await page.reload();
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await expect(page.getByLabel('SPARQL endpoint', { exact: true })).toHaveValue(
    '',
  );
});

test('navigates object-based API documentation and configuration without overflowing on mobile', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'API reference', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'LDForge API', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'API objects' })
    .getByRole('link', { name: 'Configuration', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'EditorControls', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'API objects' })
    .getByRole('link', { name: 'QueryTabHandle', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'QueryTabHandle', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#api-content')).toContainText(
    'formatQuery(options?)',
  );
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('inserts missing known prefixes during typing and persists the updated query', async ({
  page,
}) => {
  await page.goto('/');
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  await query.fill('SELECT * WHERE { ?s ');
  await query.press('End');
  await query.pressSequentially(
    'schema:name ?name . ?s schema:description ?description }',
  );
  await expect(query).toContainText('PREFIX schema: <https://schema.org/>');
  await expect(query).toContainText('schema:name ?name');
  expect((await query.innerText()).match(/PREFIX schema:/g)).toHaveLength(1);
  await page.reload();
  await expect(query).toContainText('PREFIX schema: <https://schema.org/>');
  await expect(query).toContainText('schema:description ?description');
});
