export interface FormatOptions {
  /** Number of spaces per indentation level. Defaults to 2. */
  readonly indentSize?: number;
}

/** Loaded on demand; keeps formatter and CLI dependencies out of the initial UI bundle. */
export async function formatSparql(
  query: string,
  options: FormatOptions = {},
): Promise<string> {
  const indent = options.indentSize ?? 2;
  if (!Number.isInteger(indent) || indent < 1 || indent > 8)
    throw new RangeError('indentSize must be an integer between 1 and 8.');
  if (!query.trim()) return query;
  const [{ parse }, { formatAst }] = await Promise.all([
    import('sparql-formatter/src/sparql-parser.js'),
    import('sparql-formatter/src/formatter.js'),
  ]);
  return formatAst(parse(query), indent);
}
