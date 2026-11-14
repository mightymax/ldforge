import type { BindingTerm, QueryResult } from '@ldforge/core';
export interface TreeNode {
  readonly key: string;
  readonly term: BindingTerm;
  label: string;
  url?: string;
  readonly children: string[];
}
export interface TreeModel {
  readonly nodes: Map<string, TreeNode>;
  readonly roots: string[];
  /** Canonical spanning forest; other edges render as leaf references. */
  readonly parents: Map<string, string>;
  readonly diagnostics: {
    invalidRows: number;
    missingParents: number;
    cycles: number;
  };
}
const xsdString = 'http://www.w3.org/2001/XMLSchema#string';
export function treeTermKey(term: BindingTerm | undefined): string | undefined {
  if (!term || !term.value.trim() || term.type === 'bnode') return undefined;
  return JSON.stringify(
    term.type === 'uri'
      ? ['uri', term.value]
      : [
          'literal',
          term.value,
          term.datatype ??
            (term['xml:lang']
              ? 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'
              : xsdString),
          (term['xml:lang'] ?? '').toLowerCase(),
        ],
  );
}
export function safeTreeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
/** Iterative O(V+E) traversal after stable key sorting; never follows the JS call stack. */
export function buildTreeModel(result: QueryResult): TreeModel {
  const nodes = new Map<string, TreeNode>();
  const labels = new Map<string, string>();
  const edges = new Map<string, Set<string>>();
  const diagnostics = { invalidRows: 0, missingParents: 0, cycles: 0 };
  const explicitRoots = new Set<string>();
  if (result.kind === 'bindings')
    for (const row of result.bindings) {
      const key = treeTermKey(row.tree_id);
      if (!key || !row.tree_id) {
        diagnostics.invalidRows++;
        continue;
      }
      let node = nodes.get(key);
      if (!node) {
        node = {
          key,
          term: row.tree_id,
          label: row.tree_id.value,
          children: [],
        };
        nodes.set(key, node);
      }
      // Stable minimum makes repeated rows independent of endpoint row order.
      const label = row.tree_label?.value;
      if (label && (!labels.has(key) || label < (labels.get(key) ?? ''))) {
        labels.set(key, label);
        node.label = label;
      }
      const url = safeTreeUrl(row.tree_url?.value);
      if (url && (!node.url || url < node.url)) node.url = url;
      const parent = treeTermKey(row.tree_parent);
      if (row.tree_parent && !parent) diagnostics.invalidRows++;
      if (!parent) explicitRoots.add(key);
      else {
        let children = edges.get(parent);
        if (!children) {
          children = new Set();
          edges.set(parent, children);
        }
        children.add(key);
      }
    }
  const incoming = new Set<string>();
  for (const [parent, children] of edges) {
    const node = nodes.get(parent);
    if (!node) {
      diagnostics.missingParents++;
      continue;
    }
    for (const child of [...children].sort()) node.children.push(child);
    for (const child of children) incoming.add(child);
  }
  const roots: string[] = [];
  const parents = new Map<string, string>();
  const visited = new Set<string>();
  const active = new Set<string>();
  const keys = [...nodes.keys()].sort();
  for (const start of [
    ...keys.filter((key) => explicitRoots.has(key) || !incoming.has(key)),
    ...keys,
  ]) {
    if (visited.has(start)) continue;
    roots.push(start);
    visited.add(start);
    active.add(start);
    const stack = [{ key: start, index: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (!frame) break;
      const child = nodes.get(frame.key)?.children[frame.index++];
      if (child === undefined) {
        active.delete(frame.key);
        stack.pop();
        continue;
      }
      if (active.has(child)) diagnostics.cycles++;
      if (visited.has(child)) continue;
      visited.add(child);
      active.add(child);
      parents.set(child, frame.key);
      stack.push({ key: child, index: 0 });
    }
  }
  return { nodes, roots, parents, diagnostics };
}
