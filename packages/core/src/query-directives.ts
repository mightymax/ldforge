/** Leading SPARQL comment metadata, extensible by renderer plugins. */
export interface QueryViewDirectives {
  readonly view?: string;
  readonly 'sparql-endpoint'?: string;
  readonly css?: string;
  readonly [key: string]: string | undefined;
}

/** Split configuration assignments, preserving semicolons in quoted values. */
function assignments(line: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
    } else if (
      (character === '"' || character === "'") &&
      /^\s*[a-z][\w-]*\s*=\s*$/i.test(line.slice(start, index))
    )
      quote = character;
    else if (character === ';') {
      parts.push(line.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(line.slice(start));
  return parts;
}
function value(raw: string): string {
  return /^(["']).*\1$/.test(raw)
    ? raw.slice(1, -1).replace(/\\(["'\\])/g, '$1')
    : raw;
}

/** Read leading comment metadata; CSS occupies its own unsplit comment line. */
export function parseQueryViewDirectives(query: string): QueryViewDirectives {
  const directives: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const line of query.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!line.trimStart().startsWith('#')) break;
    const content = line.trimStart().slice(1).trim();
    const css = /^css\s*=\s*(.+)$/i.exec(content);
    if (css?.[1]) {
      directives.css = value(css[1].trim());
      continue;
    }
    if (!/^[a-z][\w-]*\s*=/i.test(content)) continue;
    for (const assignment of assignments(content)) {
      const match = /^\s*([a-z][\w-]*)\s*=\s*(.*?)\s*$/i.exec(assignment);
      if (match?.[1] && match[2] && match[1].toLowerCase() !== 'css')
        directives[match[1].toLowerCase()] = value(match[2]);
    }
  }
  return Object.freeze(directives);
}
