import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { parseTree, prefixDeclarations } from './analysis.js';
import { prefixEdit } from './completion.js';
import { namespaceCatalog } from './vocabulary.js';
import type { SparqlOptions } from './vocabulary.js';

/** Extend typing/paste transactions so automatic declarations undo with the input. */
export function automaticPrefixes(options: SparqlOptions): Extension {
  if (options.autoPrefixes === false) return [];
  const catalog = namespaceCatalog(options);
  return EditorState.transactionFilter.of((transaction) => {
    if (
      !transaction.docChanged ||
      !(
        transaction.isUserEvent('input.type') ||
        transaction.isUserEvent('input.paste')
      )
    )
      return transaction;
    const state = transaction.state;
    const declared = new Set(
      prefixDeclarations(state).map((entry) => entry.prefix),
    );
    const additions = new Map<string, string>();
    const ranges: { from: number; to: number }[] = [];
    transaction.changes.iterChangedRanges((_from, _to, from, to) =>
      ranges.push({ from, to }),
    );
    parseTree(state).iterate({
      enter(node) {
        if (
          node.name !== 'PrefixedName' ||
          !ranges.some((range) => node.from < range.to && node.to > range.from)
        )
          return;
        const term = state.sliceDoc(node.from, node.to);
        const colon = term.indexOf(':');
        if (colon < 0 || colon === term.length - 1) return;
        const prefix = term.slice(0, colon);
        const namespace = catalog[prefix];
        if (namespace && !declared.has(prefix))
          additions.set(prefix, namespace);
      },
    });
    const entries = [...additions];
    const first = entries[0];
    if (!first) return transaction;
    const edit = prefixEdit(state, first[0], first[1]);
    const insert =
      edit.insert +
      entries
        .slice(1)
        .map(([prefix, iri]) => `PREFIX ${prefix}: <${iri}>\n`)
        .join('');
    return [
      transaction,
      { changes: { from: edit.from, insert }, sequential: true },
    ];
  });
}
