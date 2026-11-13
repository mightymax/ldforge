import { prefixes } from '@ldforge/prefixes';
export interface SparqlPredicate {
  readonly iri: string;
  readonly description?: string;
}
export interface SparqlOptions {
  /** Add known missing PREFIX declarations while typing/pasting terms. Defaults to true. */
  readonly autoPrefixes?: boolean;
  /** Namespace catalog used when inserting declarations for selected completions. */
  readonly prefixes?: Readonly<Record<string, string>> | false;
  /** Host-owned vocabulary; omitted to use the small built-in RDF vocabulary. */
  readonly predicates?: readonly SparqlPredicate[];
}
export const defaultPrefixes = prefixes;
export const defaultPredicates: readonly SparqlPredicate[] = [
  { iri: `${defaultPrefixes.rdf}type`, description: 'RDF type' },
  { iri: `${defaultPrefixes.rdfs}label`, description: 'Human-readable label' },
  {
    iri: `${defaultPrefixes.rdfs}comment`,
    description: 'Description of a resource',
  },
  { iri: `${defaultPrefixes.rdfs}subClassOf`, description: 'Superclass' },
  { iri: `${defaultPrefixes.skos}prefLabel`, description: 'Preferred label' },
  { iri: `${defaultPrefixes.skos}altLabel`, description: 'Alternative label' },
  { iri: `${defaultPrefixes.skos}broader`, description: 'Broader concept' },
  { iri: `${defaultPrefixes.dcterms}title`, description: 'Title' },
  { iri: `${defaultPrefixes.dcterms}creator`, description: 'Creator' },
  { iri: `${defaultPrefixes.schema}name`, description: 'Name' },
  {
    iri: `${defaultPrefixes.foaf}name`,
    description: 'Name of a person or agent',
  },
];

export function isAbsoluteIri(value: string): boolean {
  if (
    /[\s<>"{}|^`\\]/u.test(value) ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
export function namespaceCatalog(
  options: SparqlOptions,
): Readonly<Record<string, string>> {
  const catalog =
    options.prefixes === false
      ? {}
      : { ...defaultPrefixes, ...options.prefixes };
  for (const [prefix, iri] of Object.entries(catalog)) {
    if (
      !/^(?:[A-Za-z](?:[\w.-]*[\w-])?)?$/.test(prefix) ||
      !isAbsoluteIri(iri)
    ) {
      throw new Error(`Invalid SPARQL namespace: ${prefix}`);
    }
  }
  for (const predicate of options.predicates ?? []) {
    if (!isAbsoluteIri(predicate.iri))
      throw new Error(`Invalid predicate IRI: ${predicate.iri}`);
  }
  return catalog;
}
