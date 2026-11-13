import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditor, formatSparql } from '@ldforge/editor';
import type { ForgeEditor } from '@ldforge/editor';
import { undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';

const editors: ForgeEditor[] = [];
function mount(options: Partial<Parameters<typeof createEditor>[1]> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = createEditor(host, {
    executor: { execute: async () => ({ kind: 'boolean', value: true }) },
    query: 'select * where {?s ?p ?o}',
    ...options,
  });
  editors.push(editor);
  return { editor, host };
}
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('public tab API', () => {
  it('exposes a live indexable collection and stable handles with names, queries and identity', () => {
    const change = vi.fn();
    const { editor, host } = mount({ onWorkspaceChange: change });
    const tabs = editor.getTabs();
    const first = tabs[0];
    if (!first) throw new Error('Missing tab');
    expect(tabs).toBe(editor.getTabs());
    expect(tabs.getByName('Query 1')).toBe(first);
    expect(tabs.getActive()).toBe(first);
    const originalView = host.querySelector('.cm-editor');
    const second = tabs.addTab({
      name: 'foo',
      query: 'ask {}',
      prefixes: ['sdo', 'dct'],
    });
    expect(tabs.length).toBe(2);
    expect(tabs[1]).toBe(second);
    expect(second.name).toBe('foo');
    expect(second.isActive).toBe(true);
    expect(second.getQuery()).toContain('PREFIX sdo: <https://schema.org/>');
    expect(second.getQuery()).toContain(
      'PREFIX dct: <http://purl.org/dc/terms/>',
    );
    first.setQuery('select ?s where {?s ?p ?o}');
    expect(editor.getQuery()).toBe(second.getQuery());
    first.rename('People');
    expect(tabs.getByName('People')).toBe(first);
    expect(tabs.getById(first.id)).toBe(first);
    first.activate();
    expect(editor.getQuery()).toBe(first.getQuery());
    expect(host.querySelector('.cm-editor')).toBe(originalView);
    expect(change.mock.lastCall?.[0].tabs[0].title).toBe('People');
    expect(tabs.getByName('missing')).toBeUndefined();
    expect(tabs.getById('missing')).toBeUndefined();
    expect(tabs.map((tab) => tab.name)).toEqual(['People', 'foo']);
    expect(second.delete()).toBe(true);
    expect(second.isDeleted).toBe(true);
    expect(() => second.getQuery()).toThrow('deleted');
    expect(tabs.length).toBe(1);
    expect(first.delete()).toBe(false);
  });
  it('creates inactive tabs atomically, keeps their queries separate and handles prefix conflicts', () => {
    const warning = vi.fn();
    const { editor } = mount({ onWarning: warning });
    const tabs = editor.getTabs();
    const tab = tabs.addTab({
      name: 'Other',
      activate: false,
      query: 'PREFIX sdo: <https://different.example/> ask {}',
      prefixes: [
        { prefix: 'ex', namespace: 'https://example.org/' },
        'unknown-prefix',
      ],
    });
    expect(tab.isActive).toBe(false);
    expect(editor.getQuery()).not.toContain('different.example');
    expect(warning).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'unknown-prefix',
        prefix: 'unknown-prefix',
      }),
    );
    expect(tab.addPrefix('sdo', 'https://schema.org/')).toBe('sdo2');
    expect(tab.addPrefix('schema')).toBe('sdo2');
    expect(tab.getQuery().match(/PREFIX sdo2:/g)).toHaveLength(1);
    expect(() =>
      tabs.addTab({ prefixes: [{ prefix: 'bad', namespace: 'not an IRI' }] }),
    ).toThrow('Invalid SPARQL');
    expect(tabs).toHaveLength(2);
  });
  it('warns and leaves text unchanged for unknown shorthand, even with the registry disabled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { editor } = mount({ sparql: { prefixes: false } });
    const original = editor.getQuery();
    expect(editor.addPrefix('dct')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Unknown prefix "dct"'),
    );
    expect(editor.getQuery()).toBe(original);
    expect(editor.addPrefix('dct', 'http://purl.org/dc/terms/')).toBe('dct');
  });
  it('does not recycle a deleted restored identifier or let stale handles address a new tab', () => {
    const { editor } = mount({
      workspace: {
        activeId: 'query-9',
        tabs: [
          { id: 'query-1', query: '' },
          { id: 'query-9', query: '' },
        ],
      },
    });
    const old = editor.getTabs().getActive();
    old.delete();
    const added = editor.getTabs().addTab();
    expect(added.id).not.toBe(old.id);
    expect(old.isDeleted).toBe(true);
    editor.destroy();
    expect(() => added.getQuery()).toThrow('destroyed');
    expect(() => editor.getTabs()).toThrow('destroyed');
  });
});

describe('formatting', () => {
  it('formats with comments and literals intact, is idempotent and is undoable', async () => {
    const query =
      '# header\nselect ?s where {?s ?p "a # b". # inline\nfilter(?s!=?o)}';
    const { editor, host } = mount({ query });
    const result = await editor.formatQuery();
    expect(result).toContain('SELECT ?s\nWHERE {\n  ');
    expect(result).toContain('"a # b"');
    expect(result).toContain('# header');
    expect(result).toContain('# inline');
    expect(await editor.formatQuery()).toBe(result);
    const dom = host.querySelector<HTMLElement>('.cm-editor');
    const view = dom ? EditorView.findFromDOM(dom) : null;
    if (!view) throw new Error('Missing view');
    undo(view);
    expect(editor.getQuery()).toBe(query);
  });
  it('formats inactive tabs without activating them and supports indentation options', async () => {
    const { editor } = mount();
    const original = editor.getQuery();
    const tab = editor
      .getTabs()
      .addTab({ activate: false, query: 'select * where {?s ?p ?o}' });
    expect(await tab.formatQuery({ indentSize: 4 })).toContain('\n    ?s');
    expect(editor.getQuery()).toBe(original);
    expect(tab.isActive).toBe(false);
    await expect(formatSparql('ask {}', { indentSize: 0 })).rejects.toThrow(
      'indentSize',
    );
    expect(await formatSparql(' ')).toBe(' ');
  });
  it('preserves invalid text and rejects stale formatting after an edit, deletion or teardown', async () => {
    const { editor } = mount({ query: 'select {' });
    await expect(editor.formatQuery()).rejects.toThrow();
    expect(editor.getQuery()).toBe('select {');
    editor.setQuery('ask {}');
    const pending = editor.formatQuery();
    editor.setQuery('ask { ?s ?p ?o }');
    await expect(pending).rejects.toThrow('changed while formatting');
    const tab = editor.getTabs().addTab({ query: 'ask {}' });
    const formatting = tab.formatQuery();
    tab.delete();
    await expect(formatting).rejects.toThrow('deleted');
    const destroyed = editor.formatQuery();
    editor.destroy();
    await expect(destroyed).rejects.toThrow('destroyed');
  });
});

it('hides configured built-in controls but leaves custom buttons and the public API available', async () => {
  const { editor, host } = mount({
    controls: false,
    buttons: [{ id: 'project-action', label: 'Project action', execute() {} }],
  });
  expect(
    [...host.querySelectorAll('button')]
      .filter((button) => button.closest('.ldforge-toolbar'))
      .map((button) => button.textContent),
  ).toEqual(['Project action']);
  expect(host.querySelector<HTMLElement>('.ldforge-tabs')?.hidden).toBe(true);
  const tab = editor.getTabs().addTab({ query: 'ask {}' });
  await tab.formatQuery();
  expect(tab.getQuery()).toBe('ASK {\n}');
  const partial = mount({
    controls: {
      run: false,
      cancel: false,
      language: false,
      addTab: false,
      renameTab: false,
      closeTab: false,
    },
  });
  expect(
    partial.host.querySelectorAll('.ldforge-core-actions button'),
  ).toHaveLength(0);
  expect(partial.host.querySelector('.ldforge-tab-add')).toBeNull();
  expect(partial.host.querySelector('.ldforge-tab-rename')).toBeNull();
  expect(partial.host.querySelector('.ldforge-tab-close')).toBeNull();
  expect(
    partial.host.querySelector<HTMLElement>('.ldforge-language')?.hidden,
  ).toBe(true);
});
