import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

async function chooseExample(page: Page, name: string): Promise<void> {
  const group = /^(SELECT|CONSTRUCT|ASK) /.test(name)
    ? 'Query Examples'
    : 'Plugin Examples';
  await page.getByRole('button', { name: group, exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

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
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  await expect(page.locator('.ldforge-results pre')).toContainText('bindings');
  await chooseExample(page, 'ASK example');
  await page
    .getByRole('textbox', { name: 'SPARQL query' })
    .press('ControlOrMeta+Enter');
  await page.getByRole('tab', { name: 'Boolean', exact: true }).click();
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

test('uses accessible result tabs and downloads complete CSV independently of the active renderer', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Download CSV', exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Run query', exact: true }).locator('svg'),
  ).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Cancel', exact: true }).locator('svg'),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  const tabs = page.getByRole('tablist', { name: 'Result view', exact: true });
  await expect(tabs.getByRole('tab')).toHaveCount(2);
  await expect(
    tabs.getByRole('tab', { name: 'Table', exact: true }).locator('svg'),
  ).toHaveCount(1);
  await tabs.getByRole('tab', { name: 'Table', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    tabs.getByRole('tab', { name: 'JSON', exact: true }),
  ).toBeFocused();
  await expect(
    tabs.getByRole('tab', { name: 'JSON', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('results.csv');
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Missing CSV download');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('Amsterdam');
  expect(csv).toContain('Rotterdam');
  expect(csv.trim().split('\r\n')).toHaveLength(4);
  await chooseExample(page, 'ASK example');
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(
    tabs.getByRole('tab', { name: 'Table', exact: true }),
  ).toHaveCount(0);
  await expect(
    tabs.getByRole('tab', { name: 'Boolean', exact: true }),
  ).toBeVisible();
});

test('shows readable read-only TypeScript examples, plugin binding guides and shared site links', async ({
  page,
}) => {
  await page.goto('/api.html');
  const example = page
    .locator('[aria-label="TypeScript code example"]')
    .first();
  await expect(example).toBeVisible();
  await expect(example).toHaveAttribute('contenteditable', 'false');
  const before = await example.innerText();
  await example.focus();
  await page.keyboard.type('THIS_MUST_NOT_EDIT');
  expect(await example.innerText()).toBe(before);
  const contrast = await example.evaluate((element) => {
    const token = element.querySelector('span');
    if (!token) throw new Error('No highlighted TypeScript tokens');
    const rgb = getComputedStyle(token).color.match(/\d+/g)?.map(Number);
    if (!rgb || rgb.length < 3) throw new Error('No token color');
    const linear = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    const luminance =
      0.2126 * (linear[0] ?? 0) +
      0.7152 * (linear[1] ?? 0) +
      0.0722 * (linear[2] ?? 0);
    return 1.05 / (luminance + 0.05); // The code editor uses a white background.
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await expect(
    page.getByRole('link', { name: 'LDForge on GitHub' }),
  ).toHaveAttribute('href', 'https://github.com/mightymax/ldforge');
  const imprint = page.locator('.site-imprint');
  await expect(imprint).toContainText('©');
  await expect(
    imprint.getByRole('link', { name: 'LDMax', exact: true }),
  ).toHaveAttribute('href', 'https://ldmax.nl/');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Plugins', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Plugins', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Table', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#plugin-content')).toContainText(
    'Binding contract:',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Demo', exact: true })
    .click();
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Documentation for Table', exact: true }),
  ).toHaveAttribute('href', /plugins\.html#table$/);
  await expect(page.locator('.ldforge-result-toolbar')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('renders Cards from query headers, scopes CSS and preserves manual view switching', async ({
  page,
}) => {
  await page.goto('/');
  await chooseExample(page, 'Cards example');
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  const tabs = page.getByRole('tablist', { name: 'Result view', exact: true });
  await expect(
    tabs.getByRole('tab', { name: 'Cards', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  const cards = page.locator('.ldforge-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText('Linked data');
  await expect(cards.first().locator('img')).toHaveAttribute('loading', 'lazy');
  await expect(cards.first()).toHaveCSS('max-width', '320px');
  await expect(
    cards.first().getByRole('link', { name: 'Explore LDMax', exact: true }),
  ).toHaveAttribute('href', 'https://ldmax.nl/');
  await expect(
    page.getByRole('link', { name: 'Documentation for Cards', exact: true }),
  ).toHaveAttribute('href', /plugins\.html#cards$/);
  await tabs.getByRole('tab', { name: 'Table', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('card_title');
  await tabs.getByRole('tab', { name: 'Cards', exact: true }).click();
  await expect(cards).toHaveCount(3);
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  await query.fill(
    '# view=cards\n# css=max-width=100px; color: red;\nSELECT ?card_title WHERE { BIND("Test" AS ?card_title) }',
  );
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(cards.first()).toHaveCSS('max-width', '100px');
  await expect(page.locator('.ldforge-toolbar')).not.toHaveCSS(
    'color',
    'rgb(255, 0, 0)',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Plugins', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Cards', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#plugin-content')).toContainText(
    'card_button_url',
  );
});

test('loads the external chart library only on activation and renders real charts without repeat downloads', async ({
  page,
}) => {
  const { readFile } = await import('node:fs/promises');
  const library = await readFile(
    new URL('../node_modules/chart.js/dist/chart.umd.js', import.meta.url),
    'utf8',
  );
  let requests = 0;
  await page.route(
    'https://cdn.jsdelivr.net/npm/chart.js@4.6.1/auto/+esm',
    async (route) => {
      requests++;
      await route.fulfill({
        contentType: 'text/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: `const module = { exports: {} }; const exports = module.exports;\n${library}\nexport const Chart = module.exports; export default Chart;`,
      });
    },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  expect(requests).toBe(0);
  await chooseExample(page, 'Charts example');
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  await query.fill(
    '# view=table; chart=bar; chart-title=Example values\nSELECT ?chart_label ?chart_value WHERE { VALUES (?chart_label ?chart_value) { ("A" 1) } }',
  );
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  expect(requests).toBe(0);
  const tabs = page.getByRole('tablist', { name: 'Result view', exact: true });
  await tabs.getByRole('tab', { name: 'Charts', exact: true }).click();
  const chart = page.locator('.ldforge-chart');
  await expect(chart).toHaveAttribute('aria-busy', 'false');
  await expect(chart.locator('canvas')).toBeVisible();
  await expect(
    chart.getByRole('heading', { name: 'Example values', exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
  expect(
    await chart.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas
        .getContext('2d')
        ?.getImageData(0, 0, canvas.width, canvas.height).data;
      return pixels?.some((value, index) => index % 4 === 3 && value > 0);
    }),
  ).toBe(true);
  await chart.getByText('Chart data', { exact: true }).click();
  await expect(chart.getByRole('table')).toContainText('Amsterdam');
  await tabs.getByRole('tab', { name: 'Table', exact: true }).click();
  await tabs.getByRole('tab', { name: 'Charts', exact: true }).click();
  await expect(chart).toHaveAttribute('aria-busy', 'false');
  expect(requests).toBe(1);
  await query.fill(
    '# view=charts; chart=doughnut\nSELECT ?chart_label ?chart_value WHERE { VALUES (?chart_label ?chart_value) { ("A" 1) } }',
  );
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(chart).toHaveAttribute('aria-busy', 'false');
  await expect(chart.locator('canvas')).toBeVisible();
  expect(requests).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('executes CONSTRUCT over HTTP with RDF negotiation and displays parsed triples', async ({
  page,
}) => {
  await page.route('https://construct.example/sparql', async (route) => {
    expect(route.request().headers().accept).toContain('application/n-triples');
    expect(route.request().postData()).toContain('construct');
    await route.fulfill({
      contentType: 'text/turtle',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: '@prefix ex: <https://example.org/> . ex:s ex:p "Hello"@en; ex:number 42 .',
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await page
    .getByLabel('SPARQL endpoint', { exact: true })
    .fill('https://construct.example/sparql');
  await page.getByRole('button', { name: 'Apply endpoint' }).click();
  await page
    .getByRole('textbox', { name: 'SPARQL query', exact: true })
    .fill('construct {?s ?p ?o} where {?s ?p ?o} limit 10');
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('subject');
  await expect(page.getByRole('table')).toContainText('Hello');
  await expect(page.getByRole('table')).toContainText('42');
  await expect(page.locator('.ldforge-status')).toHaveText(
    /^2 triples in \d+ ms$/,
  );
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  await expect(page.locator('.ldforge-results pre')).toContainText(
    '"kind": "graph"',
  );
});

test('uses configured toolbar dropdowns with keyboard navigation, dismissal and mobile positioning', async ({
  page,
}) => {
  await page.goto('/');
  const trigger = page.getByRole('button', {
    name: 'Query Examples',
    exact: true,
  });
  await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page.getByRole('button', { name: 'Run query', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'SELECT example', exact: true }),
  ).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu', { name: 'Query Examples', exact: true });
  await expect(menu.getByRole('menuitem')).toHaveText([
    'SELECT example',
    'CONSTRUCT example',
    'ASK example',
  ]);
  await expect(
    menu.getByRole('menuitem', { name: 'SELECT example', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    menu.getByRole('menuitem', { name: 'CONSTRUCT example', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page.getByRole('textbox', { name: 'SPARQL query', exact: true }),
  ).toContainText('CONSTRUCT');
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(page.locator('.ldforge-status')).toHaveText(
    /^3 triples in \d+ ms$/,
  );
  await trigger.click();
  await page.keyboard.press('End');
  await expect(
    menu.getByRole('menuitem', { name: 'ASK example', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  const box = await menu.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Query Examples', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Plugin Examples', exact: true })
    .click();
  await expect(
    page
      .getByRole('menu', { name: 'Plugin Examples', exact: true })
      .getByRole('menuitem'),
  ).toHaveText(['Cards example', 'Charts example']);
});

test('collapses PREFIX declarations in the gutter without changing the executable query', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  const original = await query.textContent();
  await page.getByTitle('Fold line', { exact: true }).first().click();
  await expect(page.locator('.cm-foldPlaceholder')).toHaveText('…');
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Amsterdam');
  // Folding never replaces the full prefix declarations in the query document.
  await page.getByTitle('Unfold', { exact: true }).click();
  await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(0);
  await expect(query).toHaveText(original ?? '');
  expect(errors).toEqual([]);
});

test('uses an accessible icon-only Run action and hides Cancel on mobile', async ({
  page,
}) => {
  await page.goto('/');
  const run = page.getByRole('button', { name: 'Run query', exact: true });
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  await expect(run.locator('.ldforge-button-label')).toBeVisible();
  await expect(cancel).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(run).toBeVisible();
  await expect(run.locator('.ldforge-button-label')).toBeHidden();
  await expect(run.locator('svg')).toBeVisible();
  await expect(cancel).toBeHidden();
  const bounds = await run.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await run.click();
  await expect(page.getByRole('table')).toContainText('Amsterdam');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(run.locator('.ldforge-button-label')).toBeVisible();
  await expect(cancel).toBeVisible();
});

test('serves complete social sharing metadata without JavaScript', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.route('https://cdn.jsdelivr.net/**', (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  );
  try {
    for (const path of [
      '/',
      '/guide.html',
      '/api.html',
      '/plugins.html',
      '/wikidata-cats.html',
    ]) {
      await page.goto(`http://127.0.0.1:4173${path}`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
        'content',
        `https://ldforge.nl${path}`,
      );
      await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
        'content',
        'website',
      );
      for (const property of ['og:title', 'og:description', 'og:image:alt'])
        await expect(
          page.locator(`meta[property="${property}"]`),
        ).toHaveAttribute('content', /\S+/);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        'content',
        'https://ldforge.nl/assets/ldforge-social-v1.png',
      );
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
        'content',
        'summary_large_image',
      );
    }
    const image = await request.get('/assets/ldforge-social-v1.png');
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toContain('image/png');
    const bytes = await image.body();
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
    expect(bytes.length).toBeLessThan(5 * 1024 * 1024);
  } finally {
    await context.close();
  }
});
