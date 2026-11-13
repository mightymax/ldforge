import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { CompletionContext } from '@codemirror/autocomplete';
import type { CompletionResult } from '@codemirror/autocomplete';
import { undo } from '@codemirror/commands';
import { history } from '@codemirror/commands';
import {
  sparqlSupport,
  sparqlLanguage,
  getSparqlContext,
  previousVariables,
  createSparqlCompletion,
  sparqlDiagnostics,
} from '@ldforge/editor';
import type { SparqlOptions } from '@ldforge/editor';

function input(marked: string) {
  const position = marked.indexOf('¦');
  if (position < 0) throw new Error('Missing cursor marker');
  const doc = marked.replace('¦', '');
  return {
    position,
    state: EditorState.create({
      doc,
      extensions: [sparqlSupport(), history()],
    }),
  };
}
function complete(marked: string, options?: SparqlOptions) {
  const { state, position } = input(marked);
  return {
    state,
    position,
    result: createSparqlCompletion(options)(
      new CompletionContext(state, position, true),
    ),
  };
}
const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});
function mount(state: EditorState) {
  const container = document.createElement('div');
  document.body.append(container);
  const view = new EditorView({ state, parent: container });
  views.push(view);
  return view;
}
function pick(
  view: EditorView,
  result: CompletionResult | null,
  label: string,
  position: number,
) {
  const completion = result?.options.find((option) => option.label === label);
  if (!result || !completion || typeof completion.apply !== 'function')
    throw new Error(`Missing completion ${label}`);
  completion.apply(view, completion, result.from, result.to ?? position);
}

describe('SPARQL grammar and structural cursor context', () => {
  it.each([
    ['SELECT * WHERE { ¦ }', 'subject', false, false],
    ['SELECT * WHERE { ?s ¦ }', 'predicate', false, false],
    ['SELECT * WHERE { ?s rdfs:la¦ ?o }', 'predicate', false, false],
    ['SELECT * WHERE { ?s ?p ¦ }', 'object', false, false],
    ['SELECT * WHERE { ?s ?p ?o ; ¦ }', 'predicate', false, false],
    ['SELECT * WHERE { ?s ?p ?o, ¦ }', 'object', false, false],
    ['SELECT * WHERE { ?s ?p ?o . ¦ }', 'subject', false, false],
    ['SELECT * WHERE { ?s <urn:p>/¦ ?o }', 'predicate', false, false],
    ['SELECT * WHERE { ?s a [ ¦ ] }', 'predicate', false, false],
    ['SELECT * WHERE { SERVICE ¦ { ?s ?p ?o } }', 'service', true, false],
    [
      'SELECT * WHERE { SERVICE <https://example.org> { ?s ¦ } }',
      'predicate',
      true,
      false,
    ],
    ['SELECT * WHERE { FILTER(¦) }', 'expression', false, true],
    ['SELECT * WHERE { FILTER EXISTS { ?s ¦ } }', 'predicate', false, true],
    [
      'SELECT * WHERE { SERVICE <https://example.org> { ?s ?p ?o FILTER(?o = ¦) } }',
      'expression',
      true,
      true,
    ],
  ])('recognizes %s', (marked, position, service, filter) => {
    const context = input(marked as string);
    expect(getSparqlContext(context.state, context.position)).toMatchObject({
      position,
      service,
      filter,
      blocked: false,
    });
  });
  it.each([
    'SELECT * WHERE { ?s ?p "abc ¦ def" }',
    'SELECT * WHERE { ?s ?p "unfinished ¦',
    "SELECT * WHERE { ?s ?p '''unfinished ¦",
    'SELECT * WHERE { ?s <https://example.org/¦',
    "SELECT * WHERE { ?s ?p '''abc ¦ def''' }",
    'SELECT * WHERE { # ?fake ¦\n?s ?p ?o }',
    'SELECT * WHERE { ?s <https://example.org/¦p> ?o }',
  ])('does not complete in comments, strings or IRIs: %s', (marked) => {
    expect(complete(marked).result).toBeNull();
  });
  it.each([
    'PREFIX ex: <http://example.org/> SELECT ?s WHERE { ?s ex:p ?o . FILTER(?o > 1) SERVICE <http://example.org/sparql> { ?x ex:q ?y } }',
    'SELECT (COUNT(?s) AS ?count) WHERE { ?s ?p ?o } GROUP BY ?o HAVING(COUNT(?s) > 1) ORDER BY DESC(?count) LIMIT 10',
    'SELECT * WHERE { VALUES ?x { 1 2 3 } BIND(STR(?x) AS ?label) OPTIONAL { ?s ?p ?x } FILTER EXISTS { ?s ?p ?o } }',
    'ASK { ?s (<urn:p>|^<urn:q>)+ ?o }',
    'CONSTRUCT { ?s <urn:p> ?o } WHERE { ?s <urn:p> ?o }',
    'select * where { ?s ?p "é # not a comment"@nl }',
  ])('parses valid SPARQL without error recovery: %s', (query) => {
    let errors = 0;
    sparqlLanguage.parser.parse(query).iterate({
      enter: (node) => {
        if (node.type.isError) errors++;
      },
    });
    expect(errors).toBe(0);
  });
});

describe('contextual SPARQL completion', () => {
  it.each([
    ['SELECT * WHERE { ?s ¦ }', true],
    ['SELECT * WHERE { ¦ ?p ?o }', false],
    ['SELECT * WHERE { ?s ?p ¦ }', false],
    ['SELECT * WHERE { FILTER(¦) }', false],
    ['SELECT * WHERE { SERVICE ¦ {} }', false],
  ])(
    'only suggests predicates in predicate positions: %s',
    (marked, expected) => {
      expect(
        complete(marked as string).result?.options.some(
          (option) => option.type === 'property',
        ) ?? false,
      ).toBe(expected);
    },
  );
  it('collects previous variables, deduplicates sigils and ignores strings/comments and later occurrences', () => {
    const { state, position } = input(
      'SELECT ?person WHERE { ?person ?p "?fake" . # ?comment\nFILTER(?person = $value) FILTER(?¦) ?later ?p ?x }',
    );
    expect(previousVariables(state, position - 1)).toEqual([
      'person',
      'p',
      'value',
    ]);
    expect(
      createSparqlCompletion()(
        new CompletionContext(state, position, true),
      )?.options.map((option) => option.label),
    ).toEqual(['?person', '?p', '?value']);
    expect(
      complete('SELECT $name WHERE { FILTER($¦) }').result?.options.map(
        (option) => option.label,
      ),
    ).toContain('$name');
  });
  it('keeps hidden subquery variables out of the outer scope and outer variables out of subqueries', () => {
    const outer = input(
      'SELECT ?outer WHERE { { SELECT ?visible WHERE { ?hidden ?p ?visible } } FILTER(¦) }',
    );
    expect(previousVariables(outer.state, outer.position)).toEqual([
      'outer',
      'visible',
    ]);
    const inner = input(
      'SELECT ?outer WHERE { { SELECT ?inner WHERE { ?inner ?p ?o FILTER(¦) } } }',
    );
    expect(previousVariables(inner.state, inner.position)).toEqual([
      'inner',
      'p',
      'o',
    ]);
  });
  it('uses only the host vocabulary when configured and validates namespace input', () => {
    const custom = complete('SELECT * WHERE { ?s ¦ }', {
      prefixes: { ex: 'https://example.org/' },
      predicates: [{ iri: 'https://example.org/name' }],
    });
    expect(
      custom.result?.options
        .filter((option) => option.type === 'property')
        .map((option) => option.label),
    ).toEqual(['ex:name']);
    expect(() =>
      createSparqlCompletion({ prefixes: { bad: 'not an IRI' } }),
    ).toThrow('Invalid SPARQL');
    expect(() =>
      createSparqlCompletion({
        predicates: [{ iri: 'https://example.org/>bad' }],
      }),
    ).toThrow('Invalid predicate');
  });
  it('does not automatically open completion on whitespace', () => {
    const { state, position } = input('SELECT * WHERE { ?s ¦ }');
    expect(
      createSparqlCompletion()(new CompletionContext(state, position, false)),
    ).toBeNull();
  });
});

describe('automatic PREFIX insertion', () => {
  it('inserts a missing declaration and predicate in one undoable transaction', () => {
    const { state, position, result } = complete(
      'SELECT * WHERE { ?s rdfs:la¦ ?o }',
    );
    const view = mount(state);
    pick(view, result, 'rdfs:label', position);
    expect(view.state.doc.toString()).toBe(
      'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\nSELECT * WHERE { ?s rdfs:label ?o }',
    );
    expect(view.state.sliceDoc(0, view.state.selection.main.head)).toMatch(
      /rdfs:label$/,
    );
    undo(view);
    expect(view.state.doc.toString()).toBe('SELECT * WHERE { ?s rdfs:la ?o }');
  });
  it('reuses existing aliases and does not duplicate declarations', () => {
    const { state, position, result } = complete(
      'PREFIX labels: <http://www.w3.org/2000/01/rdf-schema#> SELECT * WHERE { ?s ¦ ?o }',
    );
    const view = mount(state);
    pick(view, result, 'labels:label', position);
    expect(view.state.doc.toString().match(/PREFIX/g)).toHaveLength(1);
    expect(view.state.doc.toString()).toContain('?s labels:label ?o');
  });
  it('avoids prefix collisions and preserves BASE and comments', () => {
    const { state, position, result } = complete(
      '# header\nBASE <https://example.org/>\nPREFIX rdfs: <https://different.example/>\nSELECT * WHERE { ?s ¦ ?o }',
    );
    const view = mount(state);
    pick(view, result, 'rdfs2:label', position);
    expect(view.state.doc.toString()).toContain(
      'PREFIX rdfs2: <http://www.w3.org/2000/01/rdf-schema#>',
    );
    expect(view.state.doc.toString()).toContain(
      'PREFIX rdfs: <https://different.example/>',
    );
    expect(view.state.doc.toString()).toMatch(/^# header\nBASE/);
  });
  it('replaces the entire name when completing in the middle of a token', () => {
    const { state, position, result } = complete(
      'SELECT * WHERE { ?s rdfs:la¦bel ?o }',
    );
    const view = mount(state);
    pick(view, result, 'rdfs:label', position);
    expect(view.state.doc.toString()).toContain('?s rdfs:label ?o');
    expect(view.state.doc.toString()).not.toContain('labelbel');
  });
});

describe('syntax diagnostics', () => {
  it('points to the exact unexpected token and missing closing delimiter', () => {
    const invalid = input('SELECT * WHERE { ?s ?p @bad }¦');
    const diagnostics = sparqlDiagnostics(invalid.state);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.from === invalid.state.doc.toString().indexOf('@'),
      ),
    ).toBe(true);
    const missing = input('SELECT * WHERE { ?s ?p ?o¦');
    expect(
      sparqlDiagnostics(missing.state).some(
        (diagnostic) =>
          diagnostic.from === missing.state.doc.length &&
          diagnostic.to === missing.state.doc.length,
      ),
    ).toBe(true);
  });
  it('offers a localized quick fix for a known undeclared prefix and clears the diagnostic', () => {
    const { state } = input('SELECT * WHERE { ?s rdfs:label ?o }¦');
    const view = mount(state);
    const diagnostic = sparqlDiagnostics(state, 'nl').find(
      (item) => item.message === 'Niet-gedeclareerde prefix: rdfs',
    );
    expect(diagnostic?.from).toBe(state.doc.toString().indexOf('rdfs:label'));
    const action = diagnostic?.actions?.[0];
    if (!action || !diagnostic) throw new Error('Missing prefix action');
    action.apply(view, diagnostic.from, diagnostic.to);
    action.apply(view, diagnostic.from, diagnostic.to);
    expect(view.state.doc.toString().match(/PREFIX rdfs:/g)).toHaveLength(1);
    expect(sparqlDiagnostics(view.state)).toEqual([]);
  });
  it('reports unknown prefixes without inventing namespaces and accepts empty documents', () => {
    expect(
      sparqlDiagnostics(input('SELECT * WHERE { ?s unknown:p ?o }¦').state)[0]
        ?.actions,
    ).toBeUndefined();
    expect(sparqlDiagnostics(input('¦').state)).toEqual([]);
  });
});

describe('live PREFIX insertion', () => {
  it('adds known prefixes while typing, preserves the caret and undoes with the typed text', () => {
    const state = EditorState.create({
      doc: 'SELECT * WHERE { ?s ',
      extensions: [sparqlSupport(), history()],
    });
    const view = mount(state);
    view.dispatch({
      changes: { from: state.doc.length, insert: 'schema:name' },
      selection: { anchor: state.doc.length + 'schema:name'.length },
      userEvent: 'input.type',
    });
    expect(view.state.doc.toString()).toBe(
      'PREFIX schema: <https://schema.org/>\nSELECT * WHERE { ?s schema:name',
    );
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    undo(view);
    expect(view.state.doc.toString()).toBe('SELECT * WHERE { ?s ');
  });
  it('adds multiple pasted prefixes once and respects existing declarations', () => {
    const state = EditorState.create({ extensions: [sparqlSupport()] });
    const view = mount(state);
    view.dispatch({
      changes: {
        from: 0,
        insert:
          'SELECT * WHERE { ?s schema:name ?name; skos:prefLabel ?label . ?o schema:name ?other }',
      },
      userEvent: 'input.paste',
    });
    expect(view.state.doc.toString().match(/PREFIX schema:/g)).toHaveLength(1);
    expect(view.state.doc.toString()).toContain('PREFIX skos:');
    expect(sparqlDiagnostics(view.state)).toEqual([]);
    view.dispatch({
      changes: { from: view.state.doc.length, insert: ' ' },
      userEvent: 'input.type',
    });
    expect(view.state.doc.toString().match(/PREFIX schema:/g)).toHaveLength(1);
  });
  it.each([
    'SELECT * WHERE { ?s ?p "schema:name" }',
    'SELECT * WHERE { # schema:name\n?s ?p ?o }',
    'SELECT * WHERE { ?s <https://example.org/schema:name> ?o }',
    'SELECT * WHERE { ?s unknown:name ?o }',
    'SELECT * WHERE { ?s schema: }',
    'PREFIX schema: <https://custom.example/> SELECT * WHERE {?s schema:name ?o}',
  ])('does not add or replace declarations for %s', (query) => {
    const view = mount(EditorState.create({ extensions: [sparqlSupport()] }));
    view.dispatch({
      changes: { from: 0, insert: query },
      userEvent: 'input.paste',
    });
    expect(view.state.doc.toString()).toBe(query);
  });
  it('is configurable and leaves exact programmatic replacements untouched', () => {
    for (const options of [
      { autoPrefixes: false },
      { prefixes: false },
    ] as const) {
      const view = mount(
        EditorState.create({ extensions: [sparqlSupport(options)] }),
      );
      view.dispatch({
        changes: { from: 0, insert: 'ASK {?s schema:name ?o}' },
        userEvent: 'input.type',
      });
      expect(view.state.doc.toString()).not.toContain('PREFIX');
    }
    const view = mount(EditorState.create({ extensions: [sparqlSupport()] }));
    view.dispatch({ changes: { from: 0, insert: 'ASK {?s schema:name ?o}' } });
    expect(view.state.doc.toString()).not.toContain('PREFIX');
  });
});
