import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditor } from '@ldforge/editor';
import type { ForgeEditor } from '@ldforge/editor';
import { createBooleanRenderer, createJsonRenderer } from '@ldforge/renderers';
import type { QueryResult } from '@ldforge/core';

const editors: ForgeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});
function mount(options: Parameters<typeof createEditor>[1]) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = createEditor(host, options);
  editors.push(editor);
  return { host, editor };
}
const executor = {
  execute: async (): Promise<QueryResult> => ({ kind: 'boolean', value: true }),
};

describe('editor integration', () => {
  it('edits queries, notifies hosts and executes through the default toolbar', async () => {
    const onQueryChange = vi.fn();
    const { editor, host } = mount({
      executor,
      query: 'ASK {}',
      onQueryChange,
      renderers: [createBooleanRenderer(), createJsonRenderer()],
    });
    expect(editor.getQuery()).toBe('ASK {}');
    editor.setQuery('ASK { ?s ?p ?o }');
    expect(onQueryChange).toHaveBeenCalledWith('ASK { ?s ?p ?o }');
    editor.focus();
    host.querySelector('button')?.click();
    await vi.waitFor(() =>
      expect(host.querySelector('.ldforge-status')?.textContent).toMatch(
        /^True in \d+ ms$/,
      ),
    );
    expect(host.querySelector('.ldforge-results')?.textContent).toBe('True');
    host.querySelector<HTMLButtonElement>('[data-renderer-id="json"]')?.click();
    expect(host.querySelector('pre')?.textContent).toContain('"boolean"');
    await editor.run();
    expect(
      host
        .querySelector('[data-renderer-id="json"]')
        ?.getAttribute('aria-selected'),
    ).toBe('true');
  });
  it('allows custom buttons and displays rejected actions', async () => {
    const { host, editor } = mount({
      executor,
      buttons: [
        {
          id: 'example',
          label: 'Example',
          execute: (ctx) => ctx.setQuery('ASK {}'),
        },
        {
          id: 'failure',
          label: 'Fail',
          execute: () => {
            throw new Error('Plugin failed');
          },
        },
        {
          id: 'rejection',
          label: 'Reject',
          execute: () => Promise.reject('Async failure'),
        },
      ],
    });
    const buttons = host.querySelectorAll('button');
    buttons[0]?.click();
    await vi.waitFor(() => expect(editor.getQuery()).toBe('ASK {}'));
    buttons[1]?.click();
    await vi.waitFor(() =>
      expect(host.textContent).toContain('Action failed: Plugin failed'),
    );
    buttons[2]?.click();
    await vi.waitFor(() =>
      expect(host.textContent).toContain('Action failed: Async failure'),
    );
  });
  it('disables actions during execution and cancels pending requests', async () => {
    let signal: AbortSignal | undefined;
    const { host, editor } = mount({
      executor: {
        execute: (request) => {
          signal = request.signal;
          return new Promise(() => {});
        },
      },
      query: 'ASK {}',
    });
    void editor.run();
    expect(host.querySelectorAll('button')[0]?.disabled).toBe(true);
    expect(host.querySelectorAll('button')[1]?.disabled).toBe(false);
    expect(
      host.querySelector('.ldforge-results')?.getAttribute('aria-busy'),
    ).toBe('true');
    host.querySelectorAll('button')[1]?.click();
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    expect(host.textContent).toContain('Ready.');
  });
  it('cleans up renderer resources on view changes and unmount', async () => {
    const cleanup = vi.fn();
    const { host, editor } = mount({
      executor,
      query: 'ASK {}',
      renderers: [
        {
          id: 'custom',
          label: 'Custom',
          supports: () => true,
          render: () => cleanup,
        },
        createJsonRenderer(),
      ],
    });
    await editor.run();
    host.querySelector<HTMLButtonElement>('[data-renderer-id="json"]')?.click();
    expect(cleanup).toHaveBeenCalledTimes(1);
    host
      .querySelector<HTMLButtonElement>('[data-renderer-id="custom"]')
      ?.click();
    editor.destroy();
    editor.destroy();
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(host.children).toHaveLength(0);
    editor.setQuery('Ignored after unmount');
  });
  it('reports missing renderers, rendering errors and endpoint failures', async () => {
    const missing = mount({ executor, query: 'ASK {}' });
    await missing.editor.run();
    expect(missing.host.textContent).toContain('No renderer supports');
    const broken = mount({
      executor,
      query: 'ASK {}',
      renderers: [
        {
          id: 'broken',
          label: 'Broken',
          supports: () => true,
          render: () => {
            throw 'Bad renderer';
          },
        },
      ],
    });
    await broken.editor.run();
    expect(broken.host.textContent).toContain('Renderer failed: Bad renderer');
    const offline = mount({
      executor: { execute: () => Promise.reject(new Error('Offline')) },
      query: 'ASK {}',
    });
    await offline.editor.run();
    expect(offline.host.textContent).toContain('Offline');
  });
  it('keeps editor instances independent', async () => {
    const a = mount({ executor, query: 'ASK {}' });
    const b = mount({ executor, query: 'SELECT * {}' });
    await a.editor.run();
    expect(b.editor.getState().status).toBe('idle');
    a.editor.setQuery('Changed');
    expect(b.editor.getQuery()).toBe('SELECT * {}');
  });
});

it('mounts settings within the IDE and controls the panel with its gear button and Escape', () => {
  const cleanup = vi.fn();
  const { host, editor } = mount({
    executor,
    settings: [
      {
        id: 'example',
        label: 'Example settings',
        render(container, context) {
          const input = document.createElement('input');
          input.value = context.getQuery();
          container.append(input);
          return cleanup;
        },
      },
    ],
  });
  const toggle = host.querySelector<HTMLButtonElement>(
    '[aria-label="IDE settings"]',
  );
  const panel = host.querySelector<HTMLElement>('.ldforge-settings');
  expect(panel?.hidden).toBe(true);
  expect(toggle?.getAttribute('aria-controls')).toBe(panel?.id);
  toggle?.click();
  expect(panel?.hidden).toBe(false);
  expect(toggle?.getAttribute('aria-expanded')).toBe('true');
  expect(document.activeElement).toBe(panel?.querySelector('select'));
  panel?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  expect(panel?.hidden).toBe(true);
  expect(document.activeElement).toBe(toggle);
  toggle?.click();
  toggle?.click();
  expect(toggle?.getAttribute('aria-expanded')).toBe('false');
  editor.destroy();
  expect(cleanup).toHaveBeenCalledOnce();
});

it('contains settings plugin failures and rejects duplicate settings identifiers', () => {
  const { host } = mount({
    executor,
    settings: [
      {
        id: 'broken',
        label: 'Broken',
        render() {
          throw new Error('Settings error');
        },
      },
    ],
  });
  expect(host.textContent).toContain('Settings failed: Settings error');
  expect(() =>
    createEditor(document.createElement('div'), {
      executor,
      settings: [
        { id: 'duplicate', label: 'One', render() {} },
        { id: 'duplicate', label: 'Two', render() {} },
      ],
    }),
  ).toThrow('Duplicate plugin');
});

it('uses browser language, project defaults and user overrides independently per editor', async () => {
  const browser = vi
    .spyOn(navigator, 'languages', 'get')
    .mockReturnValue(['nl-NL', 'en-US']);
  try {
    const automatic = mount({ executor });
    expect(automatic.editor.getLocale()).toBe('nl');
    expect(automatic.host.querySelector('.ldforge')?.getAttribute('lang')).toBe(
      'nl',
    );
    const onLocaleChange = vi.fn();
    const configured = mount({
      executor,
      locale: 'en',
      onLocaleChange,
      query: 'ASK {}',
      renderers: [createBooleanRenderer()],
    });
    expect(configured.editor.getLocale()).toBe('en');
    await configured.editor.run();
    configured.editor.setLocale('nl');
    expect(
      configured.host.querySelector('.ldforge-status')?.textContent,
    ).toMatch(/^Waar in/);
    expect(configured.host.querySelector('.ldforge-results')?.textContent).toBe(
      'Waar',
    );
    expect(configured.editor.getQuery()).toBe('ASK {}');
    configured.editor.setLocale('auto');
    expect(configured.editor.getLocale()).toBe('en');
    expect(onLocaleChange).toHaveBeenLastCalledWith('auto');
    const restored = mount({ executor, locale: 'en', userLocale: 'nl' });
    expect(restored.editor.getLocale()).toBe('nl');
    configured.editor.destroy();
    configured.editor.setLocale('nl');
    expect(configured.editor.getLocale()).toBe('en');
  } finally {
    browser.mockRestore();
  }
});

it('reuses one CodeMirror view when switching tabs and cancels pending queries', () => {
  const onWorkspaceChange = vi.fn();
  let signal: AbortSignal | undefined;
  const { host, editor } = mount({
    executor: {
      execute: (request) => {
        signal = request.signal;
        return new Promise(() => {});
      },
    },
    query: 'ASK {}',
    onWorkspaceChange,
  });
  const originalView = host.querySelector('.cm-editor');
  const add = () =>
    host.querySelector<HTMLButtonElement>('[aria-label="New query"]')?.click();
  void editor.run();
  add();
  expect(signal?.aborted).toBe(true);
  expect(editor.getQuery()).toBe('');
  editor.setQuery('SELECT * {}');
  host.querySelector<HTMLButtonElement>('[role="tab"]')?.click();
  expect(editor.getQuery()).toBe('ASK {}');
  expect(host.querySelectorAll('.cm-editor')).toHaveLength(1);
  expect(host.querySelector('.cm-editor')).toBe(originalView);
  expect(editor.getState().status).toBe('idle');
  expect(onWorkspaceChange.mock.lastCall?.[0].tabs[1].query).toBe(
    'SELECT * {}',
  );
});

it('renders plugin icons, supports keyboard result tabs and retains accessible labels', async () => {
  const { createSvgIcon } = await import('@ldforge/core');
  const { host, editor } = mount({
    executor,
    query: 'ASK {}',
    renderers: [
      {
        id: 'custom',
        label: { en: 'Custom', nl: 'Eigen' },
        icon: createSvgIcon(['M3 3h18v18H3z']),
        supports: () => true,
        render(container) {
          container.textContent = 'Custom result';
        },
      },
      createBooleanRenderer(),
      createJsonRenderer(),
    ],
  });
  expect(
    host.querySelectorAll('.ldforge-core-actions button svg'),
  ).toHaveLength(2);
  expect(
    host.querySelector('[aria-label="Download CSV"]')?.hasAttribute('hidden'),
  ).toBe(true);
  await editor.run();
  const tab = host.querySelector<HTMLButtonElement>(
    '[data-renderer-id="custom"]',
  );
  expect(tab?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  expect(tab?.textContent).toBe('Custom');
  expect(
    host.querySelector('.ldforge-results')?.getAttribute('aria-labelledby'),
  ).toBe(tab?.id);
  tab?.focus();
  tab?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
  );
  expect(
    host
      .querySelector('[data-renderer-id="boolean"]')
      ?.getAttribute('aria-selected'),
  ).toBe('true');
  expect(document.activeElement?.textContent).toBe('Boolean');
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
  );
  expect(document.activeElement?.textContent).toBe('JSON');
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
  );
  editor.setLocale('nl');
  expect(host.querySelector('[data-renderer-id="custom"]')?.textContent).toBe(
    'Eigen',
  );
  expect(
    host.querySelector('[aria-label="CSV downloaden"]')?.hasAttribute('hidden'),
  ).toBe(false);
});

it('hides CSV download when configured and clears result controls on a tab switch', async () => {
  const hidden = mount({
    executor,
    query: 'ASK {}',
    controls: { download: false },
  });
  await hidden.editor.run();
  expect(
    hidden.host
      .querySelector('[aria-label="Download CSV"]')
      ?.hasAttribute('hidden'),
  ).toBe(true);
  const { editor, host } = mount({
    executor,
    query: 'ASK {}',
    renderers: [createBooleanRenderer()],
  });
  await editor.run();
  expect(
    host.querySelector('[aria-label="Download CSV"]')?.hasAttribute('hidden'),
  ).toBe(false);
  editor.getTabs().addTab({ query: 'ASK {}', name: 'Other' });
  expect(
    host.querySelector('[aria-label="Download CSV"]')?.hasAttribute('hidden'),
  ).toBe(true);
  expect(
    host.querySelectorAll('.ldforge-result-tabs [role="tab"]'),
  ).toHaveLength(0);
});

it('links the selected renderer documentation, rejects unsafe URLs and supports hiding the link', async () => {
  const { host, editor } = mount({
    executor,
    query: 'ASK {}',
    renderers: [
      {
        ...createBooleanRenderer(),
        documentationUrl: 'https://example.org/plugins#boolean',
      },
      { ...createJsonRenderer(), documentationUrl: 'javascript:alert(1)' },
    ],
  });
  await editor.run();
  const link = host.querySelector<HTMLAnchorElement>('.ldforge-renderer-docs');
  expect(link?.hidden).toBe(false);
  expect(link?.href).toBe('https://example.org/plugins#boolean');
  expect(link?.getAttribute('aria-label')).toBe('Documentation for Boolean');
  expect(link?.rel).toContain('noopener');
  host.querySelector<HTMLButtonElement>('[data-renderer-id="json"]')?.click();
  expect(link?.hidden).toBe(true);
  expect(link?.hasAttribute('href')).toBe(false);
  const hidden = mount({
    executor,
    query: 'ASK {}',
    controls: { rendererDocumentation: false },
    renderers: [createBooleanRenderer()],
  });
  await hidden.editor.run();
  expect(
    hidden.host.querySelector<HTMLAnchorElement>('.ldforge-renderer-docs')
      ?.hidden,
  ).toBe(true);
});

it('selects a requested renderer once and gives plugins the executed query snapshot', async () => {
  const render = vi.fn();
  const query =
    '# view=custom; custom-setting=enabled\n# css=max-width: 100px;\nASK {}';
  let resolve: ((result: QueryResult) => void) | undefined;
  const { host, editor } = mount({
    query,
    executor: {
      execute: () =>
        new Promise((done) => {
          resolve = done;
        }),
    },
    renderers: [
      createJsonRenderer(),
      {
        id: 'custom',
        label: 'Custom',
        supports: () => true,
        render,
      },
    ],
  });
  const pending = editor.run();
  editor.setQuery('# view=json\nASK { ?s ?p ?o }');
  resolve?.({ kind: 'boolean', value: true });
  await pending;
  expect(
    host
      .querySelector('[data-renderer-id="custom"]')
      ?.getAttribute('aria-selected'),
  ).toBe('true');
  expect(render.mock.lastCall?.[2]).toMatchObject({
    query,
    directives: { view: 'custom', css: 'max-width: 100px;' },
  });
  host.querySelector<HTMLButtonElement>('[data-renderer-id="json"]')?.click();
  expect(
    host
      .querySelector('[data-renderer-id="json"]')
      ?.getAttribute('aria-selected'),
  ).toBe('true');
  editor.setLocale('nl');
  expect(
    host
      .querySelector('[data-renderer-id="json"]')
      ?.getAttribute('aria-selected'),
  ).toBe('true');
  editor.setQuery('# view=missing\nASK {}');
  const next = editor.run();
  resolve?.({ kind: 'boolean', value: true });
  await next;
  expect(
    host
      .querySelector('[data-renderer-id="json"]')
      ?.getAttribute('aria-selected'),
  ).toBe('true');
});

it('keeps query headers ahead of inserted prefixes and after formatting', async () => {
  const { parseQueryViewDirectives } = await import('@ldforge/core');
  const { editor } = mount({
    executor,
    query:
      '# view=cards\n# css=max-width=100px;\nSELECT ?card_title WHERE { BIND("Demo" AS ?card_title) }',
  });
  editor.addPrefix('schema');
  expect(editor.getQuery()).toMatch(
    /^# view=cards\n# css=max-width=100px;\nPREFIX schema:/,
  );
  await editor.formatQuery();
  expect(parseQueryViewDirectives(editor.getQuery())).toMatchObject({
    view: 'cards',
    css: 'max-width=100px;',
  });
});
