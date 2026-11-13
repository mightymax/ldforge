declare module 'sparql-formatter/src/sparql-parser.js' {
  export function parse(query: string): unknown;
}
declare module 'sparql-formatter/src/formatter.js' {
  export function formatAst(ast: unknown, indentDepth?: number): string;
}
