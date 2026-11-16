# @ldforge/prefixes

Two frozen RDF/SPARQL namespace catalogs without labels or descriptions. ESM with TypeScript declarations, no dependencies and no network requests. Licensed under MIT.

```sh
npm install @ldforge/prefixes
```

## Choose a catalog

```ts
// Compact: the existing 32 common prefixes. Also the default package entry point.
import {
  prefixes,
  prefixEntries,
  searchPrefixes,
} from '@ldforge/prefixes/compact';

// Extended: 3,623 prefixes. Use this import instead when you want the larger catalog.
// import { prefixes, prefixEntries, searchPrefixes } from '@ldforge/prefixes/extended';

prefixes.rdfs; // http://www.w3.org/2000/01/rdf-schema#
searchPrefixes('prov'); // [{ prefix: 'prov', namespace: 'http://www.w3.org/ns/prov#' }]
searchPrefixes('schema', 5); // Case-insensitive prefix/namespace search.

// In createEditor options:
// sparql: { prefixes }
// Or add project mappings: sparql: { prefixes: { ...prefixes, ex: 'https://example.org/' } }
```

The root import `@ldforge/prefixes` remains an alias for compact. Both subpaths export the same API:

- `prefixes`: readonly prefix-to-namespace map.
- `prefixEntries`: readonly list of `{ prefix, namespace }` objects. No label property.
- `searchPrefixes(query, limit = 50)`: searches only prefix names and namespace strings, preserving catalog order.

The compact import does not import the extended data; a compact-only browser bundle therefore avoids that payload. Import the extended subpath explicitly to opt in. The editor uses compact by default, and its prefix picker renders at most 50 matching entries while searching the full effective map.

Catalogs preserve their own bindings. They are not interchangeable aliases for the same data: for example `geo` means WGS84 in compact and GeoSPARQL in extended; `schema` uses HTTPS in compact and HTTP in extended. See [DATA.md](DATA.md) for provenance and the syntactic repairs made to the supplied extended snapshot. Namespace identifiers are exact; do not normalize HTTP/HTTPS or guess a namespace.
