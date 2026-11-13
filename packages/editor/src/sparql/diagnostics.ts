import type { Diagnostic } from '@codemirror/lint';
import type { EditorState } from '@codemirror/state';
import type { Locale } from '@ldforge/core';
import { translate } from '@ldforge/core';
import { parseTree, prefixDeclarations } from './analysis.js';
import { prefixEdit } from './completion.js';
import type { SparqlOptions } from './vocabulary.js';
import { namespaceCatalog } from './vocabulary.js';

export function sparqlDiagnostics(
  state: EditorState,
  locale: Locale = 'en',
  options: SparqlOptions = {},
): Diagnostic[] {
  if (!state.doc.toString().trim()) return [];
  const tree = parseTree(state);
  const diagnostics: Diagnostic[] = [];
  const declared = new Set(
    prefixDeclarations(state, tree).map((entry) => entry.prefix),
  );
  const catalog = namespaceCatalog(options);
  tree.iterate({
    enter(node) {
      if (node.type.isError) {
        diagnostics.push({
          from: node.from,
          to: node.to,
          severity: 'error',
          source: 'SPARQL',
          message: translate(
            locale,
            node.from === node.to ? 'sparqlIncomplete' : 'sparqlUnexpected',
          ),
        });
        return false;
      }
      if (node.name !== 'PrefixedName') return;
      const text = state.sliceDoc(node.from, node.to);
      const prefix = text.slice(0, text.indexOf(':'));
      if (declared.has(prefix)) return;
      const iri = catalog[prefix];
      diagnostics.push({
        from: node.from,
        to: node.to,
        severity: 'error',
        source: 'SPARQL',
        message: translate(locale, 'sparqlUnknownPrefix', { prefix }),
        ...(iri
          ? {
              actions: [
                {
                  name: translate(locale, 'sparqlAddPrefix', { prefix }),
                  apply(view) {
                    // A tooltip action may outlive the diagnostic; never insert duplicates.
                    if (
                      !prefixDeclarations(view.state).some(
                        (entry) => entry.prefix === prefix,
                      )
                    )
                      view.dispatch({
                        changes: prefixEdit(view.state, prefix, iri),
                      });
                  },
                },
              ],
            }
          : {}),
      });
    },
  });
  return diagnostics;
}
