import { serializeResultsCsv } from '@ldforge/core';
import type { QueryResult } from '@ldforge/core';

export function downloadResultsCsv(
  document: Document,
  result: QueryResult,
): void {
  const url = URL.createObjectURL(
    new Blob([serializeResultsCsv(result)], {
      type: 'text/csv;charset=utf-8',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'results.csv';
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Give the browser time to start reading the Blob before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}
