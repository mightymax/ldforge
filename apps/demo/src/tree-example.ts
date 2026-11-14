import type { QueryResult } from '@ldforge/core';
export const localTreeQuery = `# view=tree
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?tree_id ?tree_parent ?tree_label ?tree_url WHERE {
  VALUES (?tree_id ?tree_parent ?tree_label) {
    (<https://example.org/art> UNDEF "Art")
    (<https://example.org/painting> <https://example.org/art> "Painting")
    (<https://example.org/drawing> <https://example.org/art> "Drawing")
    (<https://example.org/watercolor> <https://example.org/painting> "Watercolor")
    (<https://example.org/watercolor> <https://example.org/drawing> "Watercolor")
  }
  BIND(?tree_id AS ?tree_url)
}`;
export const localTreeResult: QueryResult = {
  kind: 'bindings',
  variables: ['tree_id', 'tree_parent', 'tree_label', 'tree_url'],
  bindings: [
    ['art', '', 'Art'],
    ['painting', 'art', 'Painting'],
    ['drawing', 'art', 'Drawing'],
    ['watercolor', 'painting', 'Watercolor'],
    ['watercolor', 'drawing', 'Watercolor'],
  ].map(([id, parent, label]) => ({
    tree_id: { type: 'uri', value: `https://example.org/${id}` },
    ...(parent
      ? {
          tree_parent: {
            type: 'uri' as const,
            value: `https://example.org/${parent}`,
          },
        }
      : {}),
    tree_label: { type: 'literal', value: label ?? '' },
    tree_url: { type: 'uri', value: `https://example.org/${id}` },
  })),
};
export const gettyTreeQuery = `# view=tree
# sparql-endpoint=https://vocab.getty.edu/sparql.json
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX aat: <http://vocab.getty.edu/aat/>
SELECT DISTINCT ?tree_id ?tree_parent ?tree_label ?tree_url WHERE {
  VALUES ?root { aat:300033618 }
  { BIND(?root AS ?tree_id) }
  UNION {
    ?tree_parent skos:broader? ?root .
    ?tree_id skos:broader ?tree_parent .
  }
  OPTIONAL {
    ?tree_id skos:prefLabel ?label .
    FILTER(LANGMATCHES(LANG(?label), "en"))
  }
  BIND(COALESCE(?label, STR(?tree_id)) AS ?tree_label)
  BIND(?tree_id AS ?tree_url)
}
ORDER BY ?tree_parent ?tree_label ?tree_id`;
