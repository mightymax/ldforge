import { expect, it, vi } from 'vitest';
import { createTableRenderer } from '@ldforge/renderers';
import type { BindingTerm, QueryResult } from '@ldforge/core';
import { formatRdfTerm } from '../packages/renderers/src/rdf-term.js';

const xsd = 'http://www.w3.org/2001/XMLSchema#';
const values = [
  ['string', 'Hello world'],
  ['integer', '42'],
  ['long', '9223372036854775807'],
  ['int', '123'],
  ['decimal', '3.14159'],
  ['float', '3.14'],
  ['double', '1.23E4'],
  ['boolean', 'true'],
  ['boolean', 'false'],
  ['date', '2026-11-16'],
  ['dateTime', '2026-11-16T12:30:00Z'],
  ['time', '14:30:00'],
  ['duration', 'P2Y3M5D'],
  ['gYear', '2026'],
  ['anyURI', 'https://example.org'],
] as const;

it.each(values)(
  'displays %s without converting its lexical value',
  (datatype, value) => {
    expect(
      formatRdfTerm({ type: 'literal', value, datatype: xsd + datatype }),
    ).toBe(`${JSON.stringify(value)}^^xsd:${datatype}`);
  },
);

it('formats language tags, plain strings, IRIs, blank nodes and unbound cells safely', () => {
  expect(
    formatRdfTerm({ type: 'literal', value: 'Hallo wereld', 'xml:lang': 'nl' }),
  ).toBe('"Hallo wereld"@nl');
  expect(
    formatRdfTerm({ type: 'literal', value: 'Hello world', 'xml:lang': 'en' }),
  ).toBe('"Hello world"@en');
  expect(formatRdfTerm({ type: 'literal', value: 'Hello\n"world"\\' })).toBe(
    '"Hello\\n\\"world\\"\\\\"',
  );
  expect(
    formatRdfTerm({ type: 'uri', value: 'https://example.org/a b>' }),
  ).toBe('<https://example.org/a\\u0020b\\u003e>');
  expect(formatRdfTerm({ type: 'bnode', value: 'b1' })).toBe('_:b1');
  expect(formatRdfTerm({ type: 'bnode', value: '_:b1' })).toBe('_:b1');
  expect(formatRdfTerm(undefined)).toBe('');
  expect(
    formatRdfTerm({
      type: 'typed-literal',
      value: 'x',
      datatype: 'https://example.org/type',
    }),
  ).toBe('"x"^^<https://example.org/type>');
  expect(
    formatRdfTerm({
      type: 'literal',
      value: 'x',
      datatype: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#HTML',
    }),
  ).toBe('"x"^^rdf:HTML');
});

it('toggles RDF details without losing filtering, sorting or changing source data', () => {
  const container = document.createElement('div');
  const result: QueryResult = {
    kind: 'bindings',
    variables: ['label', 'value', 'uri', 'missing'],
    bindings: [
      {
        label: { type: 'literal', value: 'first' },
        value: { type: 'literal', value: 'Hallo', 'xml:lang': 'nl' },
        uri: { type: 'uri', value: 'https://example.org' },
      },
      {
        label: { type: 'literal', value: 'second' },
        value: {
          type: 'literal',
          value: '9223372036854775807',
          datatype: xsd + 'long',
        },
      },
    ],
  };
  const original = JSON.stringify(result);
  const renderer = createTableRenderer();
  let cleanup = renderer.render(container, result, { locale: 'nl' });
  const toggle = container.querySelector<HTMLButtonElement>(
    '.ldforge-table-rdf-details',
  );
  expect(toggle?.textContent).toBe('RDF-details');
  expect(toggle?.getAttribute('aria-pressed')).toBe('false');
  expect(container.querySelectorAll('tbody td')[1]?.textContent).toBe('Hallo');
  const filter = container.querySelector<HTMLInputElement>(
    '[aria-label="Filter label"]',
  );
  if (!filter) throw new Error('Missing filter');
  filter.value = 'second';
  filter.dispatchEvent(new Event('input'));
  const sort = container.querySelector<HTMLButtonElement>(
    '.ldforge-table-sort',
  );
  sort?.click();
  toggle?.click();
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(container.querySelectorAll('tbody td')[1]?.textContent).toBe(
    '"9223372036854775807"^^xsd:long',
  );
  expect(container.querySelector('th')?.getAttribute('aria-sort')).toBe(
    'ascending',
  );
  expect(filter.value).toBe('second');
  expect(toggle?.getAttribute('aria-pressed')).toBe('true');
  expect(JSON.stringify(result)).toBe(original);
  cleanup?.();
  cleanup = renderer.render(container, result, { locale: 'en' });
  expect(
    container
      .querySelector('.ldforge-table-rdf-details')
      ?.getAttribute('aria-pressed'),
  ).toBe('true');
  const other = document.createElement('div');
  const otherCleanup = renderer.render(other, result);
  expect(
    other
      .querySelector('.ldforge-table-rdf-details')
      ?.getAttribute('aria-pressed'),
  ).toBe('false');
  cleanup?.();
  otherCleanup?.();
});

it('allows RDF details as the initial option and retains resource inspection', () => {
  const container = document.createElement('div');
  const loadResource = vi
    .fn()
    .mockResolvedValue({ kind: 'graph', triples: [] });
  const value: BindingTerm = {
    type: 'literal',
    value: '<img src=x onerror=alert(1)>',
    datatype: xsd + 'string',
  };
  const cleanup = createTableRenderer({
    showRdfDetails: true,
    loadResource,
  }).render(container, {
    kind: 'bindings',
    variables: ['uri', 'value'],
    bindings: [{ uri: { type: 'uri', value: 'https://example.org' }, value }],
  });
  expect(container.querySelector('tbody td')?.textContent).toBe(
    '<https://example.org>',
  );
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('.ldforge-resource-info')).not.toBeNull();
  const metadata = container.querySelector<HTMLElement>('sup');
  expect(metadata?.textContent).toBe('^^xsd:string');
  expect(metadata?.style.color).toBe('var(--ldforge-muted, #65756f)');
  expect(loadResource).not.toHaveBeenCalled();
  expect(
    container
      .querySelector('.ldforge-table-rdf-details')
      ?.getAttribute('aria-pressed'),
  ).toBe('true');
  cleanup?.();
});
