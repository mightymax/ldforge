import { describe, expect, it } from 'vitest';
import { serializeResultsCsv } from '@ldforge/core';

describe('result CSV', () => {
  it('preserves variable order, escaping, Unicode and unbound columns', () => {
    expect(
      serializeResultsCsv({
        kind: 'bindings',
        variables: ['label', 'missing', 'uri', 'node'],
        bindings: [
          {
            node: { type: 'bnode', value: 'b1' },
            uri: { type: 'uri', value: 'https://example.org/' },
            label: { type: 'literal', value: 'Café, "hello"\r\nnext' },
          },
        ],
      }),
    ).toBe(
      'label,missing,uri,node\r\n"Café, ""hello""\r\nnext",,https://example.org/,_:b1\r\n',
    );
  });
  it('exports headers for an empty SELECT result', () => {
    expect(
      serializeResultsCsv({
        kind: 'bindings',
        variables: ['name'],
        bindings: [],
      }),
    ).toBe('name\r\n');
  });
  it.each([true, false])('exports ASK %s without localized values', (value) => {
    expect(serializeResultsCsv({ kind: 'boolean', value })).toBe(
      `boolean\r\n${value}\r\n`,
    );
  });
});
