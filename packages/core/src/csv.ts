import { graphToBindings } from './graph.js';
import type { QueryResult } from './index.js';

/** CSV in result-variable order, with CRLF records and escaped lexical values. */
export function serializeResultsCsv(result: QueryResult): string {
  if (result.kind === 'boolean') return `boolean\r\n${result.value}\r\n`;
  if (result.kind === 'graph')
    return serializeResultsCsv(graphToBindings(result));
  const rows = [
    result.variables,
    ...result.bindings.map((binding) =>
      result.variables.map((name) => {
        const term = binding[name];
        return term?.type === 'bnode' ? `_:${term.value}` : (term?.value ?? '');
      }),
    ),
  ];
  return (
    rows
      .map((row) =>
        row
          .map((value) =>
            /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value,
          )
          .join(','),
      )
      .join('\r\n') + '\r\n'
  );
}
