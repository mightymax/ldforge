import { describe, expect, it, vi } from 'vitest';
import type { Binding, QueryResult } from '@ldforge/core';
import {
  buildTreeModel,
  createTreeRenderer,
  safeTreeUrl,
  treeTermKey,
} from '@ldforge/tree';
const term = (value: string) => ({ type: 'literal' as const, value });
const row = (id: string, parent?: string): Binding => ({
  tree_id: term(id),
  ...(parent ? { tree_parent: term(parent) } : {}),
});
const result = (bindings: Binding[]): QueryResult => ({
  kind: 'bindings',
  variables: ['tree_id'],
  bindings,
});
const key = (id: string) => treeTermKey(term(id)) ?? '';
function keypress(node: Element, value: string) {
  node.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: value,
      bubbles: true,
      cancelable: true,
    }),
  );
}
describe('tree model', () => {
  it('retains multiple roots, deduplicates edges and preserves shared children deterministically', () => {
    const rows = [
      row('a'),
      row('b'),
      row('c', 'a'),
      row('c', 'b'),
      row('c', 'a'),
    ];
    const model = buildTreeModel(result(rows));
    expect(model.roots).toEqual([key('a'), key('b')]);
    expect(model.nodes.get(key('a'))?.children).toEqual([key('c')]);
    expect(model.nodes.get(key('b'))?.children).toEqual([key('c')]);
    expect(model.parents.get(key('c'))).toBe(key('a'));
    expect(buildTreeModel(result(rows.reverse()))).toEqual(model);
  });
  it('exposes cyclic-only components and self cycles with finite diagnostics', () => {
    const model = buildTreeModel(
      result([row('a', 'b'), row('b', 'a'), row('c', 'c')]),
    );
    expect(model.roots).toEqual([key('a'), key('c')]);
    expect(model.diagnostics.cycles).toBe(2);
  });
  it('promotes missing-parent children, skips invalid IDs and reports malformed parents', () => {
    const model = buildTreeModel(
      result([
        {},
        row(' '),
        { tree_id: { type: 'bnode', value: 'a' } },
        row('a', 'missing'),
        { tree_id: term('b'), tree_parent: term('') },
      ]),
    );
    expect(model.diagnostics).toEqual({
      invalidRows: 4,
      missingParents: 1,
      cycles: 0,
    });
    expect(model.roots).toEqual([key('a'), key('b')]);
    expect(buildTreeModel({ kind: 'boolean', value: true }).roots).toEqual([]);
  });
  it('uses RDF identity independent of labels, datatype and language normalization', () => {
    expect(treeTermKey(term('a'))).toBe(
      treeTermKey({
        type: 'typed-literal',
        value: 'a',
        datatype: 'http://www.w3.org/2001/XMLSchema#string',
      }),
    );
    expect(treeTermKey({ ...term('a'), 'xml:lang': 'EN' })).toBe(
      treeTermKey({ ...term('a'), 'xml:lang': 'en' }),
    );
    expect(treeTermKey(term('a'))).not.toBe(
      treeTermKey({ type: 'uri', value: 'a' }),
    );
    const model = buildTreeModel(
      result([
        { ...row('a'), tree_label: term('Same') },
        { ...row('b'), tree_label: term('Same') },
      ]),
    );
    expect(model.nodes.size).toBe(2);
  });
  it('handles 20,000 levels without recursion', () => {
    const model = buildTreeModel(
      result(
        Array.from({ length: 20000 }, (_, i) =>
          row(
            String(i).padStart(5, '0'),
            i ? String(i - 1).padStart(5, '0') : undefined,
          ),
        ),
      ),
    );
    expect(model.nodes.size).toBe(20000);
    expect(model.roots).toHaveLength(1);
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    '/relative',
    'ftp://example.org',
    'not a url',
    undefined,
  ])('rejects unsafe URL %s', (value) =>
    expect(safeTreeUrl(value)).toBeUndefined(),
  );
  it('accepts HTTP(S) links', () =>
    expect(safeTreeUrl('https://example.org')).toBe('https://example.org/'));
});
describe('tree renderer', () => {
  it('lazily expands, navigates, collapses and removes listeners on cleanup', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const cleanup = createTreeRenderer().render(
      container,
      result([row('a'), row('b', 'a'), row('c', 'b'), row('d')]),
    );
    const tree = container.querySelector('[role=tree]');
    if (!tree) throw new Error('Missing tree');
    const items = () =>
      container.querySelectorAll<HTMLElement>('[role=treeitem]');
    expect(items()).toHaveLength(2);
    keypress(tree, 'ArrowRight');
    expect(items()).toHaveLength(3);
    keypress(tree, 'ArrowRight');
    expect(document.activeElement?.textContent).toBe('▸ b');
    keypress(tree, ' ');
    expect(items()).toHaveLength(4);
    keypress(tree, 'ArrowDown');
    expect(document.activeElement?.textContent).toBe('c');
    keypress(tree, 'ArrowLeft');
    expect(document.activeElement?.textContent).toBe('▾ b');
    keypress(tree, 'ArrowLeft');
    expect(items()).toHaveLength(3);
    keypress(tree, 'End');
    expect(document.activeElement?.textContent).toBe('d');
    keypress(tree, 'ArrowUp');
    expect(document.activeElement?.textContent).toBe('▸ b');
    keypress(tree, 'Home');
    keypress(tree, 'Enter');
    expect(items()).toHaveLength(2);
    items()[0]?.click();
    expect(items()).toHaveLength(3);
    if (typeof cleanup === 'function') cleanup();
    items()[0]?.click();
    keypress(tree, 'ArrowLeft');
    expect(items()).toHaveLength(3);
    container.remove();
  });
  it('renders cycles as references, localized diagnostics, safe text and inspector terms', () => {
    const container = document.createElement('div');
    const onInspect = vi.fn();
    const id = { type: 'uri' as const, value: 'https://example.org/a' };
    createTreeRenderer({ onInspect, title: 'Title' }).render(
      container,
      result([
        {
          tree_id: id,
          tree_parent: id,
          tree_label: term('<img src=x>'),
          tree_url: term('javascript:alert(1)'),
        },
      ]),
      { locale: 'nl', directives: { 'tree-title': 'Mijn boom' } },
    );
    expect(container.querySelector('h3')?.textContent).toBe('Mijn boom');
    expect(container.textContent).toContain('Cycli: 1');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')?.hasAttribute('href')).toBe(false);
    container.querySelector<HTMLElement>('[role=treeitem]')?.click();
    expect(container.querySelectorAll('[role=treeitem]')).toHaveLength(2);
    expect(container.textContent).toContain('(verwijzing)');
    container.querySelector('button')?.click();
    expect(onInspect).toHaveBeenCalledWith(id);
  });
  it('supports the wizard contract and handles empty results, valid links and references', () => {
    const plugin = createTreeRenderer();
    expect(plugin.supports(result([]))).toBe(true);
    expect(plugin.supports({ kind: 'boolean', value: true })).toBe(false);
    expect(plugin.wizard?.bindings[0]?.required).toBe(true);
    const container = document.createElement('div');
    plugin.render(container, result([]));
    expect(container.textContent).toContain('No tree');
    plugin.render(container, result([]), { locale: 'nl' });
    expect(container.textContent).toContain('Geen boom');
    plugin.render(
      container,
      result([
        { ...row('a'), tree_url: term('https://example.org') },
        row('a', 'a'),
      ]),
    );
    expect(container.querySelector('a')?.href).toBe('https://example.org/');
    const tree = container.querySelector('[role=tree]');
    if (!tree) throw new Error('Missing tree');
    keypress(tree, 'ArrowRight');
    keypress(tree, 'ArrowDown');
    keypress(tree, 'Enter');
    keypress(tree, 'ArrowRight');
    keypress(tree, 'Escape');
    expect(container.textContent).toContain('(reference)');
    expect(container.querySelectorAll('[role=treeitem]')).toHaveLength(2);
  });
});
