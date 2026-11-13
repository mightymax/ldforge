import { afterEach, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { createEditor } from '@ldforge/editor';
import type { ForgeEditor } from '@ldforge/editor';
import { prefixFoldRanges } from '../packages/editor/src/prefix-folding.js';

const query = `# view=cards
PREFIX ex: <https://example.org/>
# A comment between declarations
PREFIX schema: <https://schema.org/>

SELECT ?s WHERE { ?s ex:name "PREFIX fake: <https://fake/>" }`;
const editors: ForgeEditor[] = [];
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.replaceChildren();
});
function mount(options: Partial<Parameters<typeof createEditor>[1]> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const execute = vi.fn(async () => ({
    kind: 'boolean' as const,
    value: true,
  }));
  const editor = createEditor(host, {
    query,
    executor: { execute },
    ...options,
  });
  editors.push(editor);
  const view = EditorView.findFromDOM(
    host.querySelector('.cm-editor') as HTMLElement,
  );
  if (!view) throw new Error('Missing CodeMirror view');
  return { editor, host, execute, view };
}

it('folds via API without changing, persisting or executing a shortened query', async () => {
  const onQueryChange = vi.fn();
  const onWorkspaceChange = vi.fn();
  const { editor, host, execute } = mount({ onQueryChange, onWorkspaceChange });
  expect(editor.arePrefixesCollapsed()).toBe(false);
  expect(editor.togglePrefixes()).toBe(true);
  expect(host.querySelector('.cm-foldPlaceholder')).not.toBeNull();
  expect(editor.getQuery()).toBe(query);
  expect(editor.getWorkspace().tabs[0]?.query).toBe(query);
  expect(onQueryChange).not.toHaveBeenCalled();
  expect(onWorkspaceChange).not.toHaveBeenCalled();
  await editor.run();
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ query }));
  editor.setPrefixesCollapsed(false);
  expect(editor.arePrefixesCollapsed()).toBe(false);
  expect(host.querySelector('.cm-foldPlaceholder')).toBeNull();
});

it('handles a single declaration, comments, BASE boundaries and queries without prefixes', () => {
  const { editor, view } = mount({
    query:
      'PREFIX ex: <https://ex/>\nBASE <https://base/>\nPREFIX x: <https://x/>\nASK {}',
  });
  const ranges = prefixFoldRanges(view.state);
  expect(ranges).toHaveLength(2);
  expect(
    ranges.map(({ from, to }) => view.state.sliceDoc(from, to)).join(''),
  ).not.toContain('BASE');
  expect(editor.togglePrefixes()).toBe(true);
  editor.setQuery('SELECT ?s WHERE { ?s ?p "PREFIX ex: <https://ex/>" }');
  expect(editor.togglePrefixes()).toBe(false);
  expect(prefixFoldRanges(view.state)).toEqual([]);
});

it('starts collapsed, keeps each tab preference, and exposes API with the gutter hidden', () => {
  const { editor, host } = mount({
    prefixesCollapsed: true,
    controls: { prefixFolding: false },
  });
  expect(editor.arePrefixesCollapsed()).toBe(true);
  expect(host.querySelector('.cm-foldGutter')).toBeNull();
  const first = editor.getTabs().getActive();
  editor.setPrefixesCollapsed(false);
  editor.getTabs().addTab({ name: 'Other', query });
  expect(editor.arePrefixesCollapsed()).toBe(true);
  first.activate();
  expect(editor.arePrefixesCollapsed()).toBe(false);
  editor.destroy();
  expect(() => editor.togglePrefixes()).toThrow(/destroyed/);
});
