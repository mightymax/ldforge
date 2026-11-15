import { afterEach, describe, expect, it, vi } from 'vitest';
import Yasgui, { type Tab } from '@ldforge/yasgui';
function active(gui: Yasgui): Tab {
  const tab = gui.getTab();
  if (!tab) throw new Error('Expected an active tab');
  return tab;
}

const instances: Yasgui[] = [];
function mount(config: ConstructorParameters<typeof Yasgui>[1] = {}) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const gui = new Yasgui(parent, { autofocus: false, ...config });
  instances.push(gui);
  return gui;
}
afterEach(() => {
  for (const gui of instances.splice(0)) gui.destroy();
  document.body.replaceChildren();
  localStorage.clear();
});
const response = () =>
  new Response(
    JSON.stringify({
      head: { vars: ['s'] },
      results: {
        bindings: [{ s: { type: 'uri', value: 'https://example.org/s' } }],
      },
    }),
    { headers: { 'Content-Type': 'application/sparql-results+json' } },
  );

describe('Yasgui compatibility', () => {
  it('preserves the constructor, tab and Yasqe migration idiom', () => {
    const gui = mount({
      requestConfig: { endpoint: 'https://example.org/sparql' },
      yasqe: { value: 'ASK {}' },
    });
    const first = active(gui);
    expect(first.getQuery()).toBe('ASK {}');
    const second = gui.addTab(true, {
      name: 'People',
      yasqe: { value: 'SELECT * WHERE {}' },
    });
    expect(gui.getTab()).toBe(second);
    expect(second.getEndpoint()).toBe('https://example.org/sparql');
    first.getYasqe().setValue('ASK { ?s ?p ?o }');
    expect(first.getQuery()).toContain('?s');
    expect(second.getQuery()).toBe('SELECT * WHERE {}');
    first.select();
    expect(gui.getTab()).toBe(first);
    second.close();
    first.close();
    expect(gui.getTab()).toBe(first);
    expect(gui.addTab().getId()).toBeTruthy();
  });
  it('uses the native LDForge interface and synchronizes native tab actions', () => {
    const gui = mount();
    const root = gui.rootEl;
    expect(root.className).toBe('ldforge');
    expect(root.querySelector('.ldforge-toolbar')).not.toBeNull();
    expect(root.querySelector('.ldforge-tabs')).not.toBeNull();
    expect(root.querySelector('[class*="yasgui"]')).toBeNull();
    expect(root.querySelector('input[type="url"]')).toBeNull();
    const view = root.querySelector('.cm-editor');
    const added = vi.fn();
    const selected = vi.fn();
    const changed = vi.fn();
    const closed = vi.fn();
    gui
      .on('tabAdd', added)
      .on('tabSelect', selected)
      .on('tabChange', changed)
      .on('tabClose', closed);
    const add = root.querySelector<HTMLButtonElement>('.ldforge-tab-add');
    add?.click();
    const tab = active(gui);
    expect(added).toHaveBeenCalledWith(gui, tab.getId());
    expect(selected).toHaveBeenCalledWith(gui, tab.getId());
    expect(root.querySelectorAll('.cm-editor')).toHaveLength(1);
    expect(root.querySelector('.cm-editor')).toBe(view);
    expect(tab.editor).toBe(gui.editor);
    const native = gui.editor.getTabs().getActive();
    native.setQuery('ASK {}');
    native.rename('Native rename');
    expect(tab.getQuery()).toBe('ASK {}');
    expect(tab.getName()).toBe('Native rename');
    expect(changed).toHaveBeenCalledWith(gui, tab);
    native.delete();
    expect(closed).toHaveBeenCalledWith(gui, tab);
    expect(gui.getTab(tab.getId())).toBeUndefined();
    expect(() => tab.setQuery('ASK {}')).toThrow('closed');
  });
  it('maps GET, dynamic config, graph arguments, credentials and lifecycle events', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => response());
    const gui = mount({
      fetch,
      requestConfig: {
        endpoint: () => 'https://example.org/sparql?existing=1',
        method: () => 'GET',
        headers: () => ({ Authorization: 'Bearer test' }),
        args: [{ name: 'extra', value: 'x' }],
        defaultGraphs: ['https://example.org/default'],
        namedGraphs: ['https://example.org/named'],
        withCredentials: true,
      },
    });
    const tab = active(gui);
    const query = vi.fn();
    const done = vi.fn();
    gui.on('query', query).once('queryResponse', done);
    await tab.query();
    expect(query).toHaveBeenCalledWith(gui, tab);
    expect(done).toHaveBeenCalledWith(gui, tab);
    const call = fetch.mock.calls[0];
    if (!call) throw new Error('Expected a request');
    const [url, init] = call;
    expect(new URL(String(url)).searchParams.get('query')).toBe(tab.getQuery());
    expect(new URL(String(url)).searchParams.get('default-graph-uri')).toBe(
      'https://example.org/default',
    );
    expect(new URL(String(url)).searchParams.get('named-graph-uri')).toBe(
      'https://example.org/named',
    );
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test');
    expect(tab.getResult()?.kind).toBe('bindings');
    await tab.query();
    expect(done).toHaveBeenCalledTimes(1);
  });
  it('uses form POST, preserves independent endpoints and rejects HTTP errors', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => response());
    const gui = mount({
      fetch,
      requestConfig: {
        endpoint: 'https://one.example/sparql',
        adjustQueryBeforeRequest: () => 'ASK {}',
      },
    });
    const first = active(gui);
    const other = gui.addTab(true, {
      yasqe: { value: 'ASK {}' },
      requestConfig: { endpoint: 'https://two.example/sparql' },
    });
    await first.query();
    expect(fetch.mock.calls[0]?.[0]).toBe('https://one.example/sparql');
    expect(
      new URLSearchParams(String(fetch.mock.calls[0]?.[1]?.body)).get('query'),
    ).toBe('ASK {}');
    expect(gui.getTab()).toBe(other);
    fetch.mockResolvedValue(new Response('', { status: 503 }));
    await expect(other.query()).rejects.toThrow('503');
  });
  it('cancels requests and does not deliver a late response event', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const gui = mount({ fetch });
    const tab = active(gui);
    const aborted = vi.fn();
    const done = vi.fn();
    gui.on('queryAbort', aborted).on('queryResponse', done);
    const running = tab.query();
    tab.getYasqe().abortQuery();
    await running;
    expect(aborted).toHaveBeenCalledWith(gui, tab);
    expect(done).not.toHaveBeenCalled();
  });
  it('persists and restores tabs, text, endpoint and selected tab', () => {
    const gui = mount({ persistenceId: 'migration-test' });
    const first = active(gui);
    first.setQuery('ASK {}');
    first.setEndpoint('https://example.org/a');
    const second = gui.addTab(true, {
      name: 'Saved',
      yasqe: { value: 'SELECT * WHERE {}' },
    });
    const id = second.getId();
    gui.destroy();
    const restored = mount({ persistenceId: 'migration-test' });
    expect(restored.getTab()?.getId()).toBe(id);
    expect(restored.getTab()?.getName()).toBe('Saved');
    expect(restored.getTab(first.getId())?.getQuery()).toBe('ASK {}');
    expect(restored.getTab(first.getId())?.getEndpoint()).toBe(
      'https://example.org/a',
    );
  });
  it('parses RDF graph responses and recovers from malformed persistence', async () => {
    localStorage.setItem('ldforge:yasgui:broken', '{');
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(
        async () =>
          new Response(
            '<https://example.org/s> <https://example.org/p> "value" .',
            { headers: { 'Content-Type': 'text/turtle' } },
          ),
      );
    const gui = mount({ persistenceId: 'broken', fetch });
    const tab = active(gui);
    tab.setQuery('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }');
    await tab.query();
    expect(tab.getResult()?.kind).toBe('graph');
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Accept')).toBe(
      'text/turtle',
    );
  });
  it('preserves native tab behavior and reports unsupported options', () => {
    expect(() => mount({ autoAddOnInit: false })).toThrow(
      'one native query tab',
    );
    const gui = mount();
    const change = vi.fn();
    gui.on('tabChange', change);
    gui.addTab(true, { id: 'fixed' }).setName('Renamed');
    expect(change).toHaveBeenCalled();
    expect(() => gui.addTab(true, { id: 'fixed' })).toThrow('Duplicate');
    expect(() => mount({ yasqe: { autocompleters: [] } } as never)).toThrow(
      'yasqe.autocompleters',
    );
    const parent = document.createElement('div');
    expect(() => new Yasgui(parent, { yasr: {} } as never)).toThrow('yasr');
    expect(parent.childElementCount).toBe(0);
    gui.destroy();
    expect(() => gui.getTab()).toThrow('destroyed');
  });
});
