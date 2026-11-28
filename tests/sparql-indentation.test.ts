import { afterEach, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { insertNewlineAndIndent } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { sparqlSupport } from '@ldforge/editor';

const views: EditorView[] = [];
afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.replaceChildren();
});

function editor(marked: string, unit = '  ') {
  const anchor = marked.indexOf('|');
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: marked.replace('|', ''),
      selection: { anchor },
      extensions: [sparqlSupport(), indentUnit.of(unit)],
    }),
  });
  views.push(view);
  return view;
}

it.each([
  ['SELECT * WHERE {\n  ?s |', 'SELECT * WHERE {\n  ?s \n  '],
  [
    'SELECT * WHERE {\n  GRAPH <g> {\n    ?s ?p ?o .|\n  }\n}',
    'SELECT * WHERE {\n  GRAPH <g> {\n    ?s ?p ?o .\n    \n  }\n}',
  ],
  ['SELECT * WHERE {\n  ?s ?p [|', 'SELECT * WHERE {\n  ?s ?p [\n    '],
  ['SELECT * WHERE {\n  FILTER (|', 'SELECT * WHERE {\n  FILTER (\n    '],
  [
    'SELECT * WHERE {\n  VALUES (?s ?p) {|',
    'SELECT * WHERE {\n  VALUES (?s ?p) {\n    ',
  ],
  ['CONSTRUCT {|', 'CONSTRUCT {\n  '],
  ['DELETE WHERE {|', 'DELETE WHERE {\n  '],
  ['SELECT * WHERE {|', 'SELECT * WHERE {\n  '],
  ['SELECT * WHERE {\n  GRAPH <g> {|', 'SELECT * WHERE {\n  GRAPH <g> {\n    '],
  ['SELECT * WHERE {\n  ?s ?p ?o .|', 'SELECT * WHERE {\n  ?s ?p ?o .\n  '],
  ['SELECT * WHERE {\n  OPTIONAL {|', 'SELECT * WHERE {\n  OPTIONAL {\n    '],
  ['SELECT * WHERE {\n  VALUES ?s {|', 'SELECT * WHERE {\n  VALUES ?s {\n    '],
  ['INSERT DATA {\n  GRAPH <g> {|', 'INSERT DATA {\n  GRAPH <g> {\n    '],
  ['SELECT * WHERE {\n  # { ignored|', 'SELECT * WHERE {\n  # { ignored\n  '],
  ['SELECT * WHERE {\n  ?s ?p "{" .|', 'SELECT * WHERE {\n  ?s ?p "{" .\n  '],
  [
    'SELECT * WHERE {\n  ?s ?p """text\n    { literal|\n""" .\n}',
    'SELECT * WHERE {\n  ?s ?p """text\n    { literal\n    \n""" .\n}',
  ],
])('indents Enter in %s', (before, after) => {
  const view = editor(before);
  expect(insertNewlineAndIndent(view)).toBe(true);
  expect(view.state.doc.toString()).toBe(after);
});

it('uses the host indentation unit', () => {
  const view = editor('SELECT * WHERE {|', '    ');
  insertNewlineAndIndent(view);
  expect(view.state.doc.toString()).toBe('SELECT * WHERE {\n    ');
});

it('dedents closing braces as they are typed and continues outside the block', () => {
  const view = editor('SELECT * WHERE {\n  GRAPH <g> {\n    ?s ?p ?o\n    |');
  view.dispatch(view.state.replaceSelection('}'), { userEvent: 'input.type' });
  expect(view.state.doc.toString()).toBe(
    'SELECT * WHERE {\n  GRAPH <g> {\n    ?s ?p ?o\n  }',
  );
  insertNewlineAndIndent(view);
  expect(view.state.doc.toString()).toBe(
    'SELECT * WHERE {\n  GRAPH <g> {\n    ?s ?p ?o\n  }\n  ',
  );
  view.dispatch(view.state.replaceSelection('}'), { userEvent: 'input.type' });
  expect(view.state.doc.toString()).toBe(
    'SELECT * WHERE {\n  GRAPH <g> {\n    ?s ?p ?o\n  }\n}',
  );
});

it('splits an empty block and leaves the cursor on the indented inner line', () => {
  const view = editor('SELECT * WHERE {|}');
  insertNewlineAndIndent(view);
  expect(view.state.doc.toString()).toBe('SELECT * WHERE {\n  \n}');
  expect(view.state.selection.main.head).toBe('SELECT * WHERE {\n  '.length);
});
