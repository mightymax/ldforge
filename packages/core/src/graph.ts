import type { BindingTerm, QueryResult } from './index.js';

export interface RdfTriple {
  readonly subject: BindingTerm;
  readonly predicate: BindingTerm;
  readonly object: BindingTerm;
}

/** Classify the query form after leading comments and BASE/PREFIX declarations. */
export function isGraphQuery(query: string): boolean {
  const body = query
    .replace(/^\uFEFF/, '')
    .replace(
      /^(?:\s+|#[^\r\n]*(?:\r?\n|$)|PREFIX\s+[^\s:]*:\s*<[^>]*>|BASE\s*<[^>]*>)+/i,
      '',
    );
  return /^(?:CONSTRUCT|DESCRIBE)\b/i.test(body);
}

/** Lazy, standards-based Turtle/N-Triples parsing; no RDF parser in the initial bundle. */
export async function parseRdfGraph(
  source: string,
  mediaType = 'text/turtle',
  baseIRI?: string,
): Promise<Extract<QueryResult, { kind: 'graph' }>> {
  const type = mediaType.split(';')[0]?.trim().toLowerCase() ?? '';
  const format = ['application/n-triples', 'text/plain'].includes(type)
    ? 'N-Triples'
    : [
          '',
          'text/turtle',
          'application/turtle',
          'application/x-turtle',
        ].includes(type)
      ? 'Turtle'
      : undefined;
  if (!format)
    throw new Error(
      `Unsupported RDF result format: ${mediaType}. Expected Turtle or N-Triples.`,
    );
  const { Parser } = await import('n3/browser/n3.esm.min.js');
  const quads = new Parser({ format, ...(baseIRI ? { baseIRI } : {}) }).parse(
    source,
  );
  const triples: RdfTriple[] = [];
  const seen = new Set<string>();
  for (const quad of quads) {
    const convert = (
      term: typeof quad.subject | typeof quad.predicate | typeof quad.object,
    ): BindingTerm => {
      if (term.termType === 'NamedNode')
        return { type: 'uri', value: term.value };
      if (term.termType === 'BlankNode')
        return { type: 'bnode', value: term.value };
      if (term.termType === 'Literal')
        return {
          type: 'literal',
          value: term.value,
          ...(term.language
            ? { 'xml:lang': term.language }
            : { datatype: term.datatype.value }),
        };
      throw new Error(`Unsupported RDF term: ${term.termType}.`);
    };
    if (quad.graph.termType !== 'DefaultGraph')
      throw new Error('Expected an RDF graph, not a named-graph dataset.');
    const triple = {
      subject: convert(quad.subject),
      predicate: convert(quad.predicate),
      object: convert(quad.object),
    };
    const key = JSON.stringify(triple);
    if (!seen.has(key)) {
      seen.add(key);
      triples.push(triple);
    }
  }
  return { kind: 'graph', triples };
}

/** Tabular projection for graph renderers and CSV, retaining RDF term metadata. */
export function graphToBindings(
  result: Extract<QueryResult, { kind: 'graph' }>,
): Extract<QueryResult, { kind: 'bindings' }> {
  return {
    kind: 'bindings',
    variables: ['subject', 'predicate', 'object'],
    bindings: result.triples.map((triple) => ({ ...triple })),
  };
}
