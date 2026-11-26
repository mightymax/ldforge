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
    expect(
      host.querySelector('.cm-content[aria-label="JSON"]')?.textContent,
    ).toContain('"boolean"');
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
  it('turns Run into an enabled Stop action and cancels pending requests', async () => {
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
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="Stop query"]')
        ?.disabled,
    ).toBe(false);
    expect(
      host.querySelector('.ldforge-results')?.getAttribute('aria-busy'),
    ).toBe('true');
    host.querySelector<HTMLButtonElement>('[aria-label="Stop query"]')?.click();
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
  ).toHaveLength(1);
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
      .querySelector('[data-renderer-id="json"]')
      ?.getAttribute('aria-selected'),
  ).toBe('true');
  expect(document.activeElement?.textContent).toBe('JSON');
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

it.each(['en', 'nl'] as const)(
  'explains unsupported requested views and missing bindings (%s)',
  async (locale) => {
    const { host, editor } = mount({
      locale,
      query:
        '# view=geo\nSELECT ?subject ?predicate ?object WHERE { ?subject ?predicate ?object } LIMIT 25',
      executor: {
        execute: async () => ({
          kind: 'bindings',
          variables: ['subject', 'predicate', 'object'],
          bindings: [],
        }),
      },
      renderers: [
        createJsonRenderer(),
        {
          id: 'geo',
          label: { en: 'Map', nl: 'Kaart' },
          wizard: {
            bindings: [
              { variable: 'geometry', required: true, description: 'WKT' },
              { variable: 'geometryLabel', description: 'Label' },
            ],
          },
          supports: (result) =>
            result.kind === 'bindings' && result.variables.includes('geometry'),
          render: vi.fn(),
        },
      ],
    });
    await editor.run();
    const warning = host.querySelector<HTMLElement>(
      '.ldforge-renderer-warning',
    );
    if (!warning) throw new Error('Missing renderer warning element');
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toContain(locale === 'nl' ? 'Kaart' : 'Map');
    expect(warning.textContent).toContain('?geometry.');
    expect(warning.textContent).not.toContain('?geometryLabel');
    expect(
      host
        .querySelector('[data-renderer-id="json"]')
        ?.getAttribute('aria-selected'),
    ).toBe('true');
    editor.setQuery('# view=unknown\nASK {}');
    await editor.run();
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toContain('unknown');
    expect(warning.textContent).not.toContain('?geometry');
    editor.setQuery('# view=json\nASK {}');
    await editor.run();
    expect(warning.hidden).toBe(true);
    expect(warning.textContent).toBe('');
  },
);

it('shows disabled third-party renderers and their localized binding contracts without rendering them', async () => {
  const render = vi.fn();
  const { host, editor } = mount({
    locale: 'nl',
    executor,
    query: 'ASK {}',
    renderers: [
      createBooleanRenderer(),
      {
        id: 'third-party',
        label: 'Custom map',
        supports: () => false,
        render,
        wizard: {
          description: { en: 'Custom description', nl: 'Eigen beschrijving' },
          bindings: [
            { variable: 'location', required: true, description: 'WKT <safe>' },
            { variable: 'label', description: 'Naam' },
          ],
        },
      },
      createJsonRenderer(),
    ],
  });
  await editor.run();
  const tab = host.querySelector<HTMLButtonElement>(
    '[data-renderer-id="third-party"]',
  );
  expect(tab?.disabled).toBe(true);
  tab?.click();
  expect(render).not.toHaveBeenCalled();
  const info = host.querySelector<HTMLButtonElement>(
    '[data-renderer-info="third-party"]',
  );
  info?.click();
  const panel = host.querySelector<HTMLElement>('.ldforge-renderer-info');
  expect(panel?.hidden).toBe(false);
  expect(panel?.textContent).toContain('Eigen beschrijving');
  expect(panel?.textContent).toContain('?location · verplicht');
  expect(panel?.textContent).toContain('?label · optioneel');
  expect(panel?.textContent).toContain('WKT <safe>');
  expect(info?.getAttribute('aria-expanded')).toBe('true');
  panel?.querySelector('button')?.click();
  expect(panel?.hidden).toBe(true);
  expect(document.activeElement).toBe(
    host.querySelector('.ldforge-renderer-picker summary'),
  );
  const first = host.querySelector<HTMLButtonElement>(
    '[data-renderer-id="boolean"]',
  );
  first?.focus();
  first?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
  );
  expect(document.activeElement?.getAttribute('data-renderer-id')).toBe('json');
  info?.click();
  editor.setQuery('ASK {}');
  await editor.run();
  expect(panel?.hidden).toBe(true);
});

it('configures and toggles plugin visibility without rerendering results or executing queries', async () => {
  const render = vi.fn((container: HTMLElement) => {
    container.textContent = 'Result';
  });
  const execute = vi.fn(async (): Promise<QueryResult> => ({
    kind: 'boolean',
    value: true,
  }));
  const maps = {
    id: 'maps',
    label: 'Maps',
    supports: (result: QueryResult) => result.kind === 'bindings',
    render: vi.fn(),
  };
  const { host, editor } = mount({
    executor: { execute },
    query: 'ASK {}',
    availablePlugins: false,
    visiblePlugins: ['base', maps],
    renderers: [
      { id: 'base', label: 'Base', supports: () => true, render },
      maps,
      createJsonRenderer(),
    ],
  });
  editor.showPlugin('json');
  await editor.run();
  const pinned = () =>
    [
      ...host.querySelectorAll(
        '.ldforge-result-tabs > .ldforge-result-tab-item [data-renderer-id]',
      ),
    ].map((tab) => tab.getAttribute('data-renderer-id'));
  expect(pinned()).toEqual(['base', 'maps', 'json']);
  expect(
    host.querySelector<HTMLButtonElement>('[data-renderer-id="maps"]')
      ?.disabled,
  ).toBe(true);
  expect(
    host.querySelector<HTMLDetailsElement>('.ldforge-renderer-picker')?.hidden,
  ).toBe(true);
  editor.hidePlugin(maps);
  expect(pinned()).toEqual(['base', 'json']);
  editor.showAvailablePlugins();
  expect(
    host.querySelector<HTMLDetailsElement>('.ldforge-renderer-picker')?.hidden,
  ).toBe(false);
  editor.hideAvailablePlugins();
  expect(
    host.querySelector<HTMLDetailsElement>('.ldforge-renderer-picker')?.hidden,
  ).toBe(true);
  editor.showPlugin(maps);
  expect(pinned()).toContain('maps');
  expect(render).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(() => editor.showPlugin('unknown')).toThrow('Unknown result renderer');
  expect(() => editor.hidePlugin('unknown')).toThrow('Unknown result renderer');
  editor.hidePlugin('base');
  expect(pinned()).toContain('base'); // The active renderer remains visible.
  execute.mockResolvedValueOnce({
    kind: 'bindings',
    variables: ['geometry'],
    bindings: [],
  });
  await editor.run();
  expect(
    host.querySelector<HTMLButtonElement>('[data-renderer-id="maps"]')
      ?.disabled,
  ).toBe(false);
  expect(maps.render).not.toHaveBeenCalled();
  editor.destroy();
  expect(() => editor.showAvailablePlugins()).toThrow();
  expect(() => editor.hideAvailablePlugins()).toThrow();
  expect(() => editor.showPlugin(maps)).toThrow();
  expect(() => editor.hidePlugin(maps)).toThrow();
});

it('rejects unregistered plugin configuration before mounting', () => {
  const host = document.createElement('div');
  expect(() =>
    createEditor(host, { executor, visiblePlugins: ['unknown'] }),
  ).toThrow('Unknown result renderer');
  expect(host.children).toHaveLength(0);
});

describe('separate results host', () => {
  it('moves the entire live panel, retains state, and cleans up only owned DOM', async () => {
    const external = document.createElement('div');
    const marker = document.createElement('span');
    external.append(marker);
    document.body.append(external);
    const { host, editor } = mount({
      executor,
      resultsContainer: external,
      query: 'ASK {}',
      themeMainColor: '#123456',
      renderers: [
        {
          ...createBooleanRenderer(),
          documentationUrl: 'https://example.org/docs',
        },
        createJsonRenderer(),
      ],
    });
    expect(host.querySelector('.ldforge-results')).toBeNull();
    const panel = external.querySelector<HTMLElement>('.ldforge-results-panel');
    if (!panel) throw new Error('Missing results panel');
    expect(panel.classList.contains('ldforge')).toBe(true);
    expect(panel.lang).toBe('en');
    expect(panel.style.getPropertyValue('--ldforge-accent')).toBe('#123456');
    await editor.run();
    expect(panel.querySelector('.ldforge-results')?.textContent).toBe('True');
    expect(panel.querySelector('.ldforge-status')?.textContent).toMatch(
      /^True/,
    );
    expect(
      panel.querySelector<HTMLAnchorElement>('.ldforge-renderer-docs')?.href,
    ).toBe('https://example.org/docs');
    panel
      .querySelector<HTMLButtonElement>('[data-renderer-id="json"]')
      ?.click();
    editor.setResultsContainer();
    expect(host.querySelector('.ldforge-results-panel')).toBe(panel);
    expect(
      panel
        .querySelector('[data-renderer-id="json"]')
        ?.getAttribute('aria-selected'),
    ).toBe('true');
    expect(external.children.length).toBe(1);
    editor.setResultsContainer(external);
    editor.setThemeMainColor('#abcdef');
    expect(panel.style.getPropertyValue('--ldforge-accent')).toBe('#abcdef');
    editor.setLocale('nl');
    expect(panel.lang).toBe('nl');
    editor.destroy();
    editor.destroy();
    expect(external.children.length).toBe(1);
    expect(external.firstChild).toBe(marker);
    expect(() => editor.setResultsContainer()).toThrow('destroyed');
  });
  it('keeps loading, errors and multiple instances isolated in a shared host', async () => {
    const external = document.createElement('div');
    document.body.append(external);
    let reject!: (error: Error) => void;
    const first = mount({
      resultsContainer: external,
      query: 'ASK {}',
      executor: {
        execute: () =>
          new Promise((_, fail) => {
            reject = fail;
          }),
      },
    });
    const second = mount({
      resultsContainer: external,
      query: 'ASK {}',
      executor,
      renderers: [createBooleanRenderer()],
    });
    const panels = external.querySelectorAll('.ldforge-results-panel');
    const run = first.editor.run();
    await vi.waitFor(() =>
      expect(
        panels[0]?.querySelector('.ldforge-loading-indicator'),
      ).not.toBeNull(),
    );
    expect(
      panels[0]?.querySelector('.ldforge-results')?.getAttribute('aria-busy'),
    ).toBe('true');
    await second.editor.run();
    expect(panels[1]?.querySelector('.ldforge-results')?.textContent).toBe(
      'True',
    );
    const ids = [...external.querySelectorAll('[id]')].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    reject(new Error('Endpoint unavailable'));
    await run;
    expect(panels[0]?.textContent).toContain('Endpoint unavailable');
    expect(panels[0]?.querySelector('.ldforge-loading-indicator')).toBeNull();
    expect(() =>
      first.editor.setResultsContainer(
        first.host.querySelector<HTMLElement>('.ldforge-code') ?? undefined,
      ),
    ).toThrow(TypeError);
    expect(() =>
      first.editor.setResultsContainer(
        document.implementation.createHTMLDocument().body,
      ),
    ).toThrow(TypeError);
    first.editor.destroy();
    expect(external.querySelectorAll('.ldforge-results-panel')).toHaveLength(1);
  });
  it('moves pending execution and disposes the rendered view in its new host', async () => {
    const external = document.createElement('div');
    document.body.append(external);
    let resolve!: (result: QueryResult) => void;
    const cleanup = vi.fn();
    const { editor, host } = mount({
      query: 'ASK {}',
      executor: {
        execute: () =>
          new Promise((done) => {
            resolve = done;
          }),
      },
      renderers: [
        {
          id: 'probe',
          label: 'Probe',
          supports: () => true,
          render(container) {
            container.textContent = 'Rendered';
            return cleanup;
          },
        },
      ],
    });
    const running = editor.run();
    const panel = host.querySelector('.ldforge-results-panel');
    editor.setResultsContainer(external);
    expect(external.querySelector('.ldforge-results-panel')).toBe(panel);
    expect(external.querySelector('.ldforge-loading-indicator')).not.toBeNull();
    resolve({ kind: 'boolean', value: true });
    await running;
    expect(external.querySelector('.ldforge-results')?.textContent).toBe(
      'Rendered',
    );
    expect(
      external.querySelector<HTMLButtonElement>('.ldforge-result-download')
        ?.hidden,
    ).toBe(false);
    expect(external.querySelector('.ldforge-loading-indicator')).toBeNull();
    editor.destroy();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(external.childElementCount).toBe(0);
  });
});
