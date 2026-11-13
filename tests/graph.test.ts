import { describe, expect, it, vi } from 'vitest';
import {
  createHttpExecutor,
  isGraphQuery,
  parseRdfGraph,
  serializeResultsCsv,
} from '@ldforge/core';
import { createTableRenderer, createJsonRenderer } from '@ldforge/renderers';
import { formatQueryStatus } from '../packages/editor/src/query-status.js';

const turtle =
  '@prefix ex: <https://example.org/> . ex:s ex:p "Hello"@en; ex:number 42; ex:blank _:b .';
describe('RDF graph results', () => {
  it.each([
    'construct {?s ?p ?o} where {?s ?p ?o} limit 10',
    '# view=table\nPREFIX ex: <https://example.org/#>\nBASE <https://example.org/>\nCONSTRUCT WHERE {?s ?p ?o}',
    'describe <https://example.org/s>',
  ])('detects graph query form: %s', (query) => {
    expect(isGraphQuery(query)).toBe(true);
  });
  it.each([
    'SELECT ?construct WHERE {?s ?p "CONSTRUCT"}',
    '# CONSTRUCT\nASK {}',
    'PREFIX construct: <https://example.org/> SELECT * {}',
  ])('does not misclassify %s', (query) => {
    expect(isGraphQuery(query)).toBe(false);
  });
  it('parses Turtle, preserves RDF metadata, renders triples and exports CSV', async () => {
    const result = await parseRdfGraph(turtle, 'text/turtle; charset=utf-8');
    expect(result.triples).toHaveLength(3);
    expect(result.triples[0]?.object).toEqual({
      type: 'literal',
      value: 'Hello',
      'xml:lang': 'en',
    });
    expect(result.triples[1]?.object.datatype).toBe(
      'http://www.w3.org/2001/XMLSchema#integer',
    );
    expect(result.triples[2]?.object.type).toBe('bnode');
    const container = document.createElement('div');
    const renderer = createTableRenderer();
    expect(renderer.supports(result)).toBe(true);
    renderer.render(container, result);
    expect(
      [...container.querySelectorAll('th')].map((cell) => cell.textContent),
    ).toEqual(['subject', 'predicate', 'object']);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(
      container.querySelector('td:last-child')?.getAttribute('title'),
    ).toBe('Language: en');
    expect(serializeResultsCsv(result)).toContain(
      'subject,predicate,object\r\nhttps://example.org/s,https://example.org/p,Hello',
    );
    createJsonRenderer().render(container, result);
    expect(JSON.parse(container.textContent ?? '').kind).toBe('graph');
    expect(
      formatQueryStatus({ status: 'success', result, durationMs: 10 }),
    ).toBe('3 triples in 10 ms');
  });
  it('parses N-Triples, removes duplicates, handles empty graphs and rejects unsupported or invalid RDF', async () => {
    const triple =
      '<https://example.org/s> <https://example.org/p> "Hello\\nworld" .\n';
    expect(
      (await parseRdfGraph(triple + triple, 'application/n-triples')).triples,
    ).toHaveLength(1);
    expect((await parseRdfGraph('', 'text/turtle')).triples).toEqual([]);
    await expect(parseRdfGraph('bad RDF', 'text/turtle')).rejects.toThrow();
    await expect(
      parseRdfGraph('<rdf/>', 'application/rdf+xml'),
    ).rejects.toThrow('Unsupported RDF');
  });
  it.each(['GET', 'POST'] as const)(
    'negotiates RDF for %s without changing SELECT/ASK negotiation',
    async (method) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(turtle, { headers: { 'Content-Type': 'text/turtle' } }),
        )
        .mockResolvedValueOnce(
          new Response('{"boolean":true}', {
            headers: { 'Content-Type': 'application/sparql-results+json' },
          }),
        );
      const executor = createHttpExecutor({
        endpoint: 'https://example.org/sparql',
        method,
        fetch: fetcher,
      });
      const result = await executor.execute({
        query: 'construct {?s ?p ?o} where {?s ?p ?o} limit 10',
        signal: new AbortController().signal,
      });
      expect(result.kind).toBe('graph');
      expect(
        new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Accept'),
      ).toContain('application/n-triples');
      await executor.execute({
        query: 'ASK {}',
        signal: new AbortController().signal,
      });
      expect(
        new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('Accept'),
      ).toBe('application/sparql-results+json');
    },
  );
});
