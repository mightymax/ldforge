import { createPrefixCatalog } from './catalog.js';

const catalog = createPrefixCatalog({
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  skosxl: 'http://www.w3.org/2008/05/skos-xl#',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  foaf: 'http://xmlns.com/foaf/0.1/',
  schema: 'https://schema.org/',
  sdo: 'https://schema.org/',
  dct: 'http://purl.org/dc/terms/',
  sh: 'http://www.w3.org/ns/shacl#',
  prov: 'http://www.w3.org/ns/prov#',
  dcat: 'http://www.w3.org/ns/dcat#',
  void: 'http://rdfs.org/ns/void#',
  vcard: 'http://www.w3.org/2006/vcard/ns#',
  geo: 'http://www.w3.org/2003/01/geo/wgs84_pos#',
  geosparql: 'http://www.opengis.net/ont/geosparql#',
  sf: 'http://www.opengis.net/ont/sf#',
  time: 'http://www.w3.org/2006/time#',
  org: 'http://www.w3.org/ns/org#',
  adms: 'http://www.w3.org/ns/adms#',
  cc: 'http://creativecommons.org/ns#',
  qb: 'http://purl.org/linked-data/cube#',
  qudt: 'http://qudt.org/schema/qudt/',
  unit: 'http://qudt.org/vocab/unit/',
  oa: 'http://www.w3.org/ns/oa#',
  as: 'https://www.w3.org/ns/activitystreams#',
  sosa: 'http://www.w3.org/ns/sosa/',
  ssn: 'http://www.w3.org/ns/ssn/',
  sd: 'http://www.w3.org/ns/sparql-service-description#',
});
export const prefixes = catalog.prefixes;
export const prefixEntries = catalog.prefixEntries;
export const searchPrefixes = catalog.searchPrefixes;
export type { PrefixEntry } from './catalog.js';
