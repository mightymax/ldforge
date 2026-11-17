import { afterEach, expect, it } from 'vitest';
import { createEditor, type ForgeEditor } from '@ldforge/editor';
import { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';

const editors: ForgeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});
function mount(
  query: string,
  prefixes: Record<string, string> | false = {
    ex: 'https://example.org/',
    other: 'https://other.org/',
  },
) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = createEditor(host, {
    query,
    sparql: { prefixes, autoPrefixes: false },
    executor: { execute: async () => ({ kind: 'boolean', value: true }) },
  });
  editors.push(editor);
  host
    .querySelector<HTMLButtonElement>('[aria-controls$="-prefixes"]')
    ?.click();
  const click = (label: string) =>
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent === label)
      ?.click();
  const dom = host.querySelector<HTMLElement>('.cm-editor');
  const view = dom ? EditorView.findFromDOM(dom) : null;
  if (!view) throw new Error('Missing editor');
  return { host, editor, view, click };
}
it('adds only used, known missing aliases in one undoable edit without touching comments or literals', () => {
  const source =
    '# view=table\n# ghost:comment\nPREFIX alias: <https://example.org/>\nSELECT * WHERE { ?s ex:p other:q; ex:value "ghost:text"; ex:iri <https://ghost.org/p> . FILTER(unknown:fn(?s)) }';
  const { editor, view, host, click } = mount(source);
  click('Add missing prefixes');
  expect(editor.getPrefixes()).toEqual({
    alias: 'https://example.org/',
    ex: 'https://example.org/',
    other: 'https://other.org/',
  });
  expect(editor.getQuery()).toContain('# ghost:comment');
  expect(editor.getQuery()).toContain('"ghost:text"');
  expect(host.textContent).toContain('unknown');
  const added = editor.getQuery();
  click('Add missing prefixes');
  expect(editor.getQuery()).toBe(added);
  expect(undo(view)).toBe(true);
  expect(editor.getQuery()).toBe(source);
  expect(redo(view)).toBe(true);
  expect(editor.getQuery()).toBe(added);
});
it('removes unused default and named declarations while preserving used paths, datatypes, comments and shared statements', () => {
  const source =
    '# view=table\nPREFIX : <https://unused.org/>\nPREFIX ex: <https://example.org/>\nPREFIX other: <https://other.org/>\nPREFIX gone: <https://gone.org/> # gone: in a comment\nPREFIX unused: <https://unused.org/> SELECT * WHERE { ?s ex:p/ex:q "value"^^other:type . BIND("gone:text" AS ?v) }';
  const { editor, click, view } = mount(source);
  click('Remove unused prefixes');
  expect(editor.getPrefixes()).toEqual({
    ex: 'https://example.org/',
    other: 'https://other.org/',
  });
  expect(editor.getQuery()).toContain('# gone: in a comment');
  expect(editor.getQuery()).toContain('SELECT * WHERE');
  expect(editor.getQuery()).toContain('"gone:text"');
  expect(undo(view)).toBe(true);
  expect(editor.getQuery()).toBe(source);
});
it('keeps declarations in incomplete queries and supports disabled catalogs and Dutch actions', () => {
  const source = 'PREFIX ex: <https://example.org/>\nSELECT * WHERE { ?s';
  const { editor, host, click } = mount(source, false);
  click('Remove unused prefixes');
  expect(editor.getQuery()).toBe(source);
  expect(host.textContent).toContain('Fix syntax errors');
  editor.setLocale('nl');
  expect(host.textContent).toContain('Voeg missende prefixes toe');
  expect(host.textContent).toContain('Verwijder ongebruikte prefixes');
  click('Voeg missende prefixes toe');
  expect(editor.getQuery()).toBe(source);
});
it('keeps default prefixes that are used and ignores prefixed-looking text in long strings', () => {
  const { editor, click } = mount(
    'PREFIX : <https://default.org/>\nPREFIX ghost: <https://ghost.org/>\nSELECT * WHERE { ?s :p """ghost:p\nother:q""" }',
  );
  click('Remove unused prefixes');
  expect(editor.getPrefixes()).toEqual({ '': 'https://default.org/' });
  click('Add missing prefixes');
  expect(editor.getPrefixes()).toEqual({ '': 'https://default.org/' });
});
