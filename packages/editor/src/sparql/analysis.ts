import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode, Tree } from '@lezer/common';
import { SparqlLanguage } from 'codemirror-lang-sparql';

export type SparqlPosition =
  'subject' | 'predicate' | 'object' | 'expression' | 'service' | 'other';
export interface SparqlCursorContext {
  readonly service: boolean;
  readonly filter: boolean;
  readonly triple: boolean;
  readonly position: SparqlPosition;
  readonly blocked: boolean;
}

export function parseTree(state: EditorState): Tree {
  return (
    ensureSyntaxTree(state, state.doc.length, 50) ??
    (syntaxTree(state).length === state.doc.length
      ? syntaxTree(state)
      : SparqlLanguage.parser.parse(state.doc.toString()))
  );
}
export function ancestors(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let current: SyntaxNode | null = node; current; current = current.parent)
    result.push(current);
  return result;
}
export function completionRange(
  state: EditorState,
  position: number,
): { from: number; to: number; text: string } {
  const before =
    state.sliceDoc(0, position).match(/[$?:\p{L}_][\p{L}\p{N}_:.-]*$/u)?.[0] ??
    '';
  const after = before
    ? (state.sliceDoc(position).match(/^[\p{L}\p{N}_:.-]*/u)?.[0] ?? '')
    : '';
  return {
    from: position - before.length,
    to: position + after.length,
    text: before,
  };
}

function unfinishedLexeme(
  state: EditorState,
  tree: Tree,
  position: number,
): boolean {
  let brokenDelimiter = false;
  tree.iterate({
    to: position,
    enter(node) {
      if (
        node.type.isError &&
        node.from < position &&
        ['"', "'", '<'].includes(state.sliceDoc(node.from, node.from + 1))
      )
        brokenDelimiter = true;
    },
  });
  if (!brokenDelimiter) return false;
  // A String/IriRef token needs its closing delimiter. Repair that delimiter
  // and inspect the resulting node rather than guessing its lexical scope.
  for (const close of ['"', "'", '"""', "'''", '>']) {
    const repaired = SparqlLanguage.parser.parse(
      state.sliceDoc(0, position) + close,
    );
    if (
      ancestors(repaired.resolveInner(Math.max(0, position - 1), 0)).some(
        (node) =>
          ['String', 'IriRef'].includes(node.name) &&
          node.from < position &&
          node.to > position,
      )
    )
      return true;
  }
  return false;
}

/** Probe a recovered syntax tree with an IRI, so incomplete triples have a role too. */
export function getSparqlContext(
  state: EditorState,
  position: number,
): SparqlCursorContext {
  const tree = parseTree(state);
  const original = tree.resolveInner(position, -1);
  const originalChain = ancestors(original);
  const blocked =
    unfinishedLexeme(state, tree, position) ||
    originalChain.some(
      (node) =>
        ['Comment', 'String', 'IriRef'].includes(node.name) &&
        position > node.from &&
        (position < node.to ||
          (position === node.to &&
            node.name === 'Comment' &&
            !state.sliceDoc(node.from, node.to).endsWith('\n'))),
    );
  const range = completionRange(state, position);
  const marker = '<urn:ldforge:cursor>';
  const probe =
    state.sliceDoc(0, range.from) + marker + state.sliceDoc(range.to);
  const node = SparqlLanguage.parser
    .parse(probe)
    .resolveInner(range.from + 2, 0);
  const chain = ancestors(node);
  const names = chain.map((node) => node.name);
  const triple = names.some((name) =>
    ['TriplesSameSubjectPath', 'TriplesSameSubject'].includes(name),
  );
  let cursorPosition: SparqlPosition = 'other';
  // The nearest structural role wins, including triples nested in FILTER EXISTS.
  for (const current of chain) {
    if (['Verb', 'VerbPath', 'VerbSimple'].includes(current.name)) {
      cursorPosition = 'predicate';
      break;
    }
    if (['Object', 'ObjectPath'].includes(current.name)) {
      cursorPosition = 'object';
      break;
    }
    if (
      ['TriplesSameSubject', 'TriplesSameSubjectPath'].includes(current.name)
    ) {
      cursorPosition = 'subject';
      break;
    }
    if (current.name === 'Filter' || current.name === 'Expression') {
      cursorPosition = 'expression';
      break;
    }
    if (current.name === 'ServiceGraphPattern') {
      cursorPosition = 'service';
      break;
    }
  }
  return {
    service: names.includes('ServiceGraphPattern'),
    filter: names.includes('Filter'),
    triple,
    position: cursorPosition,
    blocked,
  };
}

export interface PrefixDeclaration {
  readonly prefix: string;
  readonly iri: string;
  readonly from: number;
  readonly to: number;
}
export function prefixDeclarations(
  state: EditorState,
  tree = parseTree(state),
): PrefixDeclaration[] {
  const result: PrefixDeclaration[] = [];
  tree.iterate({
    enter(node) {
      if (node.name !== 'PrefixDecl') return;
      const prefix = node.node.getChild('Pname_ns');
      const iri = node.node.getChild('IriRef');
      if (prefix && iri)
        result.push({
          prefix: state.sliceDoc(prefix.from, prefix.to).slice(0, -1),
          iri: state.sliceDoc(iri.from + 1, iri.to - 1),
          from: node.from,
          to: node.to,
        });
    },
  });
  return result;
}

function subquery(node: SyntaxNode): SyntaxNode | undefined {
  return ancestors(node).find((parent) => parent.name === 'SubSelect');
}
/** Previous syntactic variable occurrences, scoped across subquery projections. */
export function previousVariables(
  state: EditorState,
  before: number,
): readonly string[] {
  const tree = parseTree(state);
  const scope = subquery(tree.resolveInner(before, -1));
  const result = new Set<string>();
  tree.iterate({
    to: before,
    enter(ref) {
      if (ref.name !== 'Var' || ref.to > before) return;
      const node = ref.node;
      const variableScope = subquery(node);
      let visible = variableScope?.from === scope?.from;
      if (
        !visible &&
        variableScope &&
        variableScope.to < before &&
        subquery(variableScope.parent ?? variableScope)?.from === scope?.from
      ) {
        const select = variableScope.getChild('SelectClause');
        visible =
          node.parent?.name === 'SelectClause' ||
          (select !== null &&
            /^SELECT\s+(?:(?:DISTINCT|REDUCED)\s+)?\*\s*$/i.test(
              state.sliceDoc(select.from, select.to),
            ));
      }
      if (visible) result.add(state.sliceDoc(ref.from + 1, ref.to));
    },
  });
  return [...result];
}

/** Variables throughout the query, including later occurrences and visible subquery outputs. */
export function queryVariables(
  state: EditorState,
  position: number,
): readonly string[] {
  const tree = parseTree(state);
  const scope = subquery(tree.resolveInner(position, -1));
  const exports = new Map<number, Set<string>>();
  const nameOf = (node: SyntaxNode) => state.sliceDoc(node.from + 1, node.to);
  function sameScope(
    a: SyntaxNode | undefined,
    b: SyntaxNode | undefined,
  ): boolean {
    return a?.from === b?.from;
  }
  function visible(node: SyntaxNode, target: SyntaxNode | undefined): boolean {
    let owner = subquery(node);
    const name = nameOf(node);
    while (!sameScope(owner, target)) {
      if (!owner || !projected(owner).has(name)) return false;
      owner = subquery(owner.parent ?? owner);
    }
    return true;
  }
  function projected(query: SyntaxNode): Set<string> {
    const cached = exports.get(query.from);
    if (cached) return cached;
    const result = new Set<string>();
    exports.set(query.from, result);
    const select = query.getChild('SelectClause');
    if (!select) return result;
    for (const variable of select.getChildren('Var'))
      result.add(nameOf(variable));
    if (
      /^SELECT\s+(?:(?:DISTINCT|REDUCED)\s+)?\*\s*$/i.test(
        state.sliceDoc(select.from, select.to),
      )
    ) {
      tree.iterate({
        from: query.from,
        to: query.to,
        enter(ref) {
          if (ref.name === 'Var' && visible(ref.node, query))
            result.add(nameOf(ref.node));
        },
      });
    }
    return result;
  }
  const result = new Set<string>();
  tree.iterate({
    enter(ref) {
      if (ref.name !== 'Var' || (ref.from <= position && position <= ref.to))
        return;
      const name = nameOf(ref.node);
      if (name && visible(ref.node, scope)) result.add(name);
    },
  });
  return [...result];
}
