import {
  ensureSyntaxTree,
  indentService,
  syntaxTree,
} from '@codemirror/language';

const blocks: Readonly<Record<string, string>> = {
  GroupGraphPattern: '}',
  ConstructTemplate: '}',
  QuadData: '}',
  QuadPattern: '}',
  QuadsNotTriples: '}',
  InlineDataOneVar: '}',
  InlineDataFull: '}',
  BlankNodePropertyList: ']',
  BlankNodePropertyListPath: ']',
  BrackettedExpression: ')',
  ArgList: ')',
  ExpressionList: ')',
  Collection: ')',
  CollectionPath: ')',
};

// The grammar omits anonymous delimiters from the tree. CodeMirror's default
// tree traversal also skips some recovered blocks at EOF, exactly where Enter
// is normally pressed. Include those nodes explicitly using the parsed ranges.
export const sparqlIndentation = indentService.of((context, pos) => {
  const { state } = context;
  const tree = ensureSyntaxTree(state, pos, 50) ?? syntaxTree(state);
  let indent: number | null | undefined;
  tree.iterate({
    to: pos,
    enter(node) {
      if (node.from >= pos || node.to < pos) return false;
      if (node.name === 'String' && node.to > pos) {
        indent = null;
        return false;
      }
      const closing = blocks[node.name];
      if (!closing) return;
      const unfinished = node.node.lastChild?.type.isError;
      if (
        node.to === pos &&
        state.sliceDoc(pos - 1, pos) === closing &&
        !unfinished
      )
        return false;
      indent =
        context.lineIndent(node.from) +
        (context.textAfterPos(pos).trimStart().startsWith(closing)
          ? 0
          : context.unit);
    },
  });
  return indent ?? null;
});
