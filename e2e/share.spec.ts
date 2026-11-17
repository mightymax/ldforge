import { addEndpoint, saveAndSelectEndpoint } from './endpoint-helpers.js';
import { expect, test } from '@playwright/test';

test('copies a link with the active view and opens the shared query over a saved workspace', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const query = page.getByRole('textbox', {
    name: 'SPARQL query',
    exact: true,
  });
  await query.fill(
    '# view=table\n# css=color: green\nSELECT ?resource WHERE { ?resource ?p ?o }',
  );
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  if (!(await page.getByRole('tab', { name: 'JSON', exact: true }).isVisible()))
    await page.locator('.ldforge-renderer-picker > summary').click();
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  await page
    .getByRole('button', { name: 'Share your query', exact: true })
    .click();
  const dialog = page.getByRole('region', { name: 'Share your query' });
  await dialog
    .getByRole('button', {
      name: 'Copy URL to this query in the editor',
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole('status').filter({ hasText: 'Copied' }),
  ).toHaveClass('ldforge-sr-only');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const sharedQuery = new URL(link).searchParams.get('query');
  expect(sharedQuery).toContain('# view=json');
  expect(sharedQuery).toContain('# css=color: green');
  await page
    .getByRole('button', { name: 'Share your query', exact: true })
    .click();
  await expect(query).not.toContainText('# view=json');
  await query.fill('ASK {}');
  await page.goto(link);
  expect(
    await page.evaluate(() => localStorage.getItem('ldforge.demo.queries.v1')),
  ).toContain('ASK {}');
  await expect(query).toContainText('# view=json');
  await expect(query).toContainText('SELECT ?resource');
  await expect(
    page.getByRole('tab', { name: 'Shared query', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: 'JSON', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('shares the applied endpoint in query metadata and removes page fragments', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#plugins');
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  const endpoint = 'https://example.org/sparql?graph=demo';
  await addEndpoint(page);
  await page.getByLabel('SPARQL endpoint', { exact: true }).fill(endpoint);
  await saveAndSelectEndpoint(page);
  await page.getByRole('button', { name: 'IDE settings', exact: true }).click();
  await page
    .getByRole('button', { name: 'Share your query', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Copy URL to this query in the editor',
      exact: true,
    })
    .click();
  const url = new URL(
    await page.evaluate(() => navigator.clipboard.readText()),
  );
  expect(url.hash).toBe('');
  expect(url.searchParams.get('query')).toContain(
    `sparql-endpoint="${endpoint}"`,
  );
  await page
    .getByRole('button', { name: 'Share your query', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'SPARQL query', exact: true }),
  ).not.toContainText('sparql-endpoint=');
});

test('the existing share button awaits a configured host shortener', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.evaluate(async (moduleUrl) => {
    // Load the source module through Vite to exercise the public embedding API.
    const { createEditor } = await import(/* @vite-ignore */ moduleUrl);
    document.body.replaceChildren();
    const host = document.createElement('div');
    document.body.append(host);
    createEditor(host, {
      query: 'ASK {}',
      executor: { execute: async () => ({ kind: 'boolean', value: true }) },
      shortenShareUrl: async (fullUrl: string) => {
        const response = await fetch('/shorten-test', {
          method: 'POST',
          body: fullUrl,
        });
        return response.text();
      },
    });
  }, `/@fs${process.cwd()}/packages/editor/src/index.ts`);
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let fullUrl = '';
  await page.route('**/shorten-test', async (route) => {
    fullUrl = route.request().postData() ?? '';
    await pending;
    await route.fulfill({ body: 'https://short.example/browser' });
  });
  const button = page.getByRole('button', {
    name: 'Share your query',
    exact: true,
  });
  await button.click();
  const dialog = page.getByRole('region', { name: 'Share your query' });
  await expect(
    dialog.getByRole('button', { name: 'Copy Short editor URL', exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole('textbox', {
      name: 'URL to this query in the editor',
      exact: true,
    }),
  ).toHaveValue(/query=/);
  await expect.poll(() => fullUrl).not.toBe('');
  expect(new URL(fullUrl).searchParams.get('query')).toContain('ASK {}');
  complete();
  await expect(
    dialog.getByRole('textbox', { name: 'Short editor URL', exact: true }),
  ).toHaveValue('https://short.example/browser');
  const copyIcon = dialog.getByRole('button', {
    name: 'Copy Short editor URL',
    exact: true,
  });
  await expect(copyIcon).toHaveText('');
  await expect(copyIcon.locator('svg')).toHaveCount(1);
  await expect(copyIcon).toHaveAttribute('data-copied', 'false');
  await copyIcon.click();
  await expect(copyIcon).toHaveAttribute('data-copied', 'true');
  await expect(copyIcon).toHaveAttribute('title', 'Copied');
  await expect(copyIcon).toHaveAttribute('data-copied', 'false');
  await expect(copyIcon).toHaveAttribute('title', 'Copy Short editor URL');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'https://short.example/browser',
  );
});

test('share panel expands below the toolbar, toggles with prefixes and fits mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByRole('button', {
    name: 'Share your query',
    exact: true,
  });
  await toggle.click();
  const dialog = page.getByRole('region', { name: 'Share your query' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('textbox', {
      name: 'URL to this query in the editor',
      exact: true,
    }),
  ).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const toolbarBottom = await page
    .locator('.ldforge-toolbar')
    .evaluate((element) => element.getBoundingClientRect().bottom);
  expect((await dialog.boundingBox())?.y).toBeGreaterThanOrEqual(toolbarBottom);
  await page.getByRole('button', { name: 'Prefixes', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.locator('.ldforge-prefix-picker')).toBeHidden();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await expect(dialog).toBeVisible();
  await toggle.click();
  await expect(dialog).toBeHidden();
});

test('demo executes only the explicit automatic-execution shared URL', async ({
  page,
}) => {
  let requests = 0;
  await page.route('https://endpoint.example/sparql**', async (route) => {
    requests++;
    await route.fulfill({
      contentType: 'application/sparql-results+json',
      body: JSON.stringify({ boolean: true }),
    });
  });
  const query = '# sparql-endpoint=https://endpoint.example/sparql\nASK {}';
  const link = '/?query=' + encodeURIComponent(query);
  await page.goto(link);
  await expect(
    page.getByRole('textbox', { name: 'SPARQL query', exact: true }),
  ).toContainText('ASK');
  expect(requests).toBe(0);
  await page.goto(link + '&execute=true');
  await expect.poll(() => requests).toBe(1);
});

test('toolbar panels share styling and highlight their toggle until collapsed', async ({
  page,
}) => {
  await page.goto('/');
  const panels = [
    ['Prefixes', '.ldforge-prefix-picker'],
    ['Plugin wizard', '.ldforge-renderer-wizard'],
    ['Share your query', '.ldforge-share-dialog'],
    ['IDE settings', '.ldforge-settings'],
    ['Keyboard shortcuts', '.ldforge-keyboard-help'],
  ] as const;
  let surface: string | undefined;
  let active: string | undefined;
  for (const [name, selector] of panels) {
    const toggle = page.getByRole('button', { name, exact: true });
    const panel = page.locator(selector ?? '');
    const inactive = await toggle.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Close', exact: true }),
    ).toHaveCount(0);
    const selected = await toggle.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    const background = await panel.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(selected).not.toBe(inactive);
    active ??= selected;
    surface ??= background;
    expect(selected).toBe(active);
    expect(background).toBe(surface);
    expect(
      await panel.evaluate((element) => getComputedStyle(element).fontSize),
    ).toBe('12px');
    await expect(page.locator('.ldforge-tool-panel:visible')).toHaveCount(1);
  }
  const keyboard = page.getByRole('button', {
    name: 'Keyboard shortcuts',
    exact: true,
  });
  await keyboard.click();
  await expect(keyboard).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.ldforge-tool-panel:visible')).toHaveCount(0);
});

test('all enabled buttons share the hover overlay while primary colors and disabled buttons stay intact', async ({
  page,
}) => {
  await page.goto('/');
  const run = page.getByRole('button', { name: 'Run query', exact: true });
  const primary = await run.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await run.hover();
  const overlay = await run.evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  );
  expect(overlay).not.toBe('none');
  expect(
    await run.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe(primary);
  const share = page.getByRole('button', {
    name: 'Share your query',
    exact: true,
  });
  await share.click();
  await share.hover();
  expect(
    await share.evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    ),
  ).toBe(overlay);
  const copy = page.getByRole('button', {
    name: 'Copy URL to this query in the editor',
    exact: true,
  });
  await copy.hover();
  expect(
    await copy.evaluate((element) => getComputedStyle(element).backgroundImage),
  ).toBe(overlay);
  const disabled = page.getByRole('button', {
    name: 'Copy cURL command line for POST request',
    exact: true,
  });
  await expect(disabled).toBeDisabled();
  await disabled.hover();
  expect(
    await disabled.evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    ),
  ).toBe('none');
});
