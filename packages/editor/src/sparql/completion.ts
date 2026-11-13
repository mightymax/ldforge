import { pickedCompletion } from '@codemirror/autocomplete';
import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  completionRange,
  getSparqlContext,
  parseTree,
  prefixDeclarations,
  previousVariables,
} from './analysis.js';
import { defaultPredicates, namespaceCatalog } from './vocabulary.js';
import type { SparqlOptions } from './vocabulary.js';

export function prefixEdit(
  state: EditorState,
  prefix: string,
  iri: string,
): { from: number; insert: string } {
  let at = state.sliceDoc(0, 1) === '\uFEFF' ? 1 : 0;
  // Keep leading comments/directives ahead of the first PREFIX declaration.
  const source = state.doc.toString();
  while (at < source.length) {
    const end = source.indexOf('\n', at);
    const next = end < 0 ? source.length : end + 1;
    const line = source.slice(at, next).trim();
    if (line && !line.startsWith('#')) break;
    at = next;
  }
  parseTree(state).iterate({
    enter(node) {
      if (node.name === 'BaseDecl' || node.name === 'PrefixDecl')
        at = Math.max(at, node.to);
    },
  });
  return {
    from: at,
    insert: `${at > 0 && state.sliceDoc(at - 1, at) !== '\n' ? '\n' : ''}PREFIX ${prefix}: <${iri}>\n`,
  };
}

export function addPrefix(
  view: EditorView,
  preferred: string,
  iri: string,
): string {
  namespaceCatalog({ prefixes: { [preferred]: iri } });
  const declared = prefixDeclarations(view.state);
  const existing = declared.find((entry) => entry.iri === iri);
  if (existing) return existing.prefix;
  let prefix = preferred;
  let number = 2;
  while (declared.some((entry) => entry.prefix === prefix))
    prefix = `${preferred || 'ns'}${number++}`;
  view.dispatch({
    changes: prefixEdit(view.state, prefix, iri),
    userEvent: 'input.prefix',
  });
  return prefix;
}

function compactIri(
  state: EditorState,
  iri: string,
  catalog: Readonly<Record<string, string>>,
): { label: string; prefix?: string; namespace?: string } {
  const declared = prefixDeclarations(state);
  const namespaces = [
    ...declared.map((entry) => [entry.prefix, entry.iri] as const),
    ...Object.entries(catalog),
  ].sort((a, b) => b[1].length - a[1].length);
  for (const [preferred, namespace] of namespaces) {
    const local = iri.slice(namespace.length);
    if (
      !iri.startsWith(namespace) ||
      !/^[A-Za-z_][\w.-]*[\w-]$|^[A-Za-z_]$/.test(local)
    )
      continue;
    const existing = declared.find((entry) => entry.iri === namespace);
    if (existing) return { label: `${existing.prefix}:${local}` };
    let prefix = preferred;
    let suffix = 2;
    while (
      declared.some(
        (entry) => entry.prefix === prefix && entry.iri !== namespace,
      )
    )
      prefix = `${preferred || 'ns'}${suffix++}`;
    return { label: `${prefix}:${local}`, prefix, namespace };
  }
  return { label: `<${iri}>` };
}

export function applyPredicate(
  view: EditorView,
  completion: Completion,
  from: number,
  to: number,
  iri: string,
  catalog: Readonly<Record<string, string>>,
): void {
  const term = compactIri(view.state, iri, catalog);
  const declaration =
    term.prefix !== undefined && term.namespace
      ? prefixEdit(view.state, term.prefix, term.namespace)
      : undefined;
  const changes = [
    ...(declaration ? [declaration] : []),
    { from, to, insert: term.label },
  ];
  view.dispatch({
    changes,
    selection: {
      anchor:
        from +
        term.label.length +
        (declaration && declaration.from <= from
          ? declaration.insert.length
          : 0),
    },
    annotations: pickedCompletion.of(completion),
    userEvent: 'input.complete',
  });
}

export function createSparqlCompletion(
  options: SparqlOptions = {},
): (context: CompletionContext) => CompletionResult | null {
  const catalog = namespaceCatalog(options);
  const predicates = options.predicates ?? defaultPredicates;
  return (context) => {
    const cursor = getSparqlContext(context.state, context.pos);
    if (cursor.blocked) return null;
    const range = completionRange(context.state, context.pos);
    if (!context.explicit && !range.text) return null;
    const completions: Completion[] = [];
    const variablePrefix = range.text.startsWith('$') ? '$' : '?';
    if (!range.text || /^[?$]/.test(range.text)) {
      for (const variable of previousVariables(context.state, range.from))
        completions.push({
          label: `${variablePrefix}${variable}`,
          type: 'variable',
        });
    }
    if (cursor.position === 'predicate' && !/^[?$]/.test(range.text)) {
      completions.push({ label: 'a', type: 'keyword', detail: 'rdf:type' });
      for (const predicate of predicates) {
        const term = compactIri(context.state, predicate.iri, catalog);
        completions.push({
          label: term.label,
          type: 'property',
          detail: predicate.description ?? predicate.iri,
          apply: (view, completion, from, to) =>
            applyPredicate(view, completion, from, to, predicate.iri, catalog),
        });
      }
    }
    if (!/^[?$]/.test(range.text)) {
      const keywords =
        cursor.position === 'expression'
          ? [
              'BOUND',
              'STR',
              'LANG',
              'LANGMATCHES',
              'REGEX',
              'CONTAINS',
              'IF',
              'COALESCE',
              'EXISTS',
              'isIRI',
              'isLiteral',
            ]
          : cursor.position === 'other' || cursor.position === 'subject'
            ? [
                'SELECT',
                'ASK',
                'WHERE',
                'FILTER',
                'OPTIONAL',
                'SERVICE',
                'GRAPH',
                'BIND',
                'VALUES',
                'UNION',
                'MINUS',
                'LIMIT',
                'ORDER BY',
                'GROUP BY',
              ]
            : [];
      completions.push(
        ...keywords.map((label) => ({ label, type: 'keyword' })),
      );
    }
    return completions.length
      ? { from: range.from, to: range.to, options: completions }
      : null;
  };
}
