import { isolateHistory } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { parseTree, prefixDeclarations } from './analysis.js';
import { prefixEdit } from './completion.js';

/** Batch each explicit cleanup as one undoable edit; never infer usage from text. */
export function maintainPrefixes(
  view: EditorView,
  catalog: Readonly<Record<string, string>>,
  action: 'add' | 'remove',
): { count: number; unknown: string[]; incomplete: boolean } {
  const state = view.state;
  const tree = parseTree(state);
  const declarations = prefixDeclarations(state, tree);
  const declared = new Set(declarations.map((entry) => entry.prefix));
  const used = new Set<string>();
  let incomplete = false;
  tree.iterate({
    enter(node) {
      if (node.type.isError) incomplete = true;
      if (node.name === 'PrefixedName') {
        const term = state.sliceDoc(node.from, node.to);
        used.add(term.slice(0, term.indexOf(':')));
      }
    },
  });
  const missing = [...used].filter((prefix) => !declared.has(prefix));
  const unknown = missing.filter((prefix) => !catalog[prefix]);
  if (action === 'add') {
    const entries = missing.flatMap((prefix) =>
      catalog[prefix] ? [[prefix, catalog[prefix]] as const] : [],
    );
    const first = entries[0];
    if (first) {
      const edit = prefixEdit(state, first[0], first[1]);
      view.dispatch({
        changes: {
          from: edit.from,
          insert:
            edit.insert +
            entries
              .slice(1)
              .map(([prefix, iri]) => `PREFIX ${prefix}: <${iri}>\n`)
              .join(''),
        },
        annotations: isolateHistory.of('full'),
        userEvent: 'input.prefixes',
      });
    }
    return { count: entries.length, unknown, incomplete };
  }
  // A recovered tree cannot prove that an apparently unused declaration is safe to remove.
  if (incomplete) return { count: 0, unknown, incomplete };
  const unused = declarations.filter((entry) => !used.has(entry.prefix));
  const source = state.doc.toString();
  const changes = unused.map((entry) => {
    let { from, to } = entry;
    const lineStart = source.lastIndexOf('\n', from - 1) + 1;
    const newline = source.indexOf('\n', to);
    const lineEnd = newline < 0 ? source.length : newline;
    if (
      /^[ \t]*$/.test(source.slice(lineStart, from)) &&
      /^[ \t\r]*$/.test(source.slice(to, lineEnd))
    ) {
      from = lineStart;
      to = newline < 0 ? lineEnd : newline + 1;
    }
    return { from, to };
  });
  if (changes.length)
    view.dispatch({
      changes,
      annotations: isolateHistory.of('full'),
      userEvent: 'delete.prefixes',
    });
  return { count: unused.length, unknown, incomplete };
}
