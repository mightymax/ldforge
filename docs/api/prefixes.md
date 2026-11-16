# Prefix catalog

`@ldforge/prefixes` provides namespace data and search. It has no dependencies, performs no network requests, and works without a DOM. Namespace IRIs are exact identifiers; HTTP and HTTPS are not interchangeable.

```sh
npm install @ldforge/prefixes
```

## Choose compact or extended

```ts
import {
  prefixes,
  prefixEntries,
  searchPrefixes,
} from '@ldforge/prefixes/compact';
// Replace the import above with this to opt in to the extended catalog:
// import { prefixes, prefixEntries, searchPrefixes } from '@ldforge/prefixes/extended';
```

| Import                       | Contents                                  | Loading                                  |
| ---------------------------- | ----------------------------------------- | ---------------------------------------- |
| `@ldforge/prefixes`          | Compact, 32 common prefixes               | Backward-compatible default entry point. |
| `@ldforge/prefixes/compact`  | The same compact catalog                  | Does not import extended data.           |
| `@ldforge/prefixes/extended` | 3,623 mappings from the supplied snapshot | Explicit opt-in to the larger payload.   |

Both variants export exactly the same API:

| Export                          | Type / signature                              | Description                                                                                                                                                               |
| ------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prefixes`                      | `Readonly<Record<string, string>>`            | Frozen shorthand-to-namespace map.                                                                                                                                        |
| `prefixEntries`                 | `readonly PrefixEntry[]`                      | Frozen entries containing only prefix and namespace.                                                                                                                      |
| `searchPrefixes(query, limit?)` | `(string, number?) => readonly PrefixEntry[]` | Case-insensitive substring search over prefix and namespace. Default limit 50; catalog order preserved. Empty text matches all; non-positive limit returns an empty list. |

`PrefixEntry` has only readonly string properties `prefix` and `namespace`. Vocabulary labels/descriptions are not included or searched.

```ts
const matches = searchPrefixes('prov', 10);
// [{ prefix: 'prov', namespace: 'http://www.w3.org/ns/prov#' }]
```

## Editor integration

The editor uses compact by default. The developer chooses the other variant by importing it and passing its map to `sparql.prefixes`:

```ts
import { prefixes } from '@ldforge/prefixes/extended';
const sparql = { prefixes };
// Pass sparql in EditorOptions.
// Extend with project mappings: prefixes: { ...prefixes, ex: 'https://example.org/' }.
// Hide the UI without disabling the API: controls: { prefixes: false }.
// Disable lookup itself: sparql: { prefixes: false }.
```

The selected map controls shorthand tab methods, PREFIX quick fixes, predicate completion aliases and the Prefixes picker. The picker searches every mapping but renders only the first 50 matches; refine the search to find more specific entries. No entries are rendered while the panel is initially hidden.

Maps extend/override compact defaults. The supplied extended catalog already contains every compact prefix key, so selecting it preserves the complete extended set, including different namespace bindings. In particular, compact geo is `http://www.w3.org/2003/01/geo/wgs84_pos#` while extended geo is `http://www.opengis.net/ont/geosparql#`. Compact schema uses HTTPS, while extended schema uses HTTP. These identifiers are intentionally preserved.

The extended data comes from the user-supplied prefixes.json snapshot; see the package's DATA.md for four scheme-whitespace repairs and corrections to four HTML-encoded rows. No mappings were discarded. The catalogs are bundled snapshots, not live registry lookups or authoritative endpoint lists.

For ordinary host integrations, use [tab.addPrefix](tab.md) rather than the low-level CodeMirror function.

## Low-level language utilities

Exports from `@ldforge/editor` for custom CodeMirror hosts:

| Export                                        | Purpose                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `sparqlLanguage`                              | SPARQL Lezer `LRLanguage`.                                                                                   |
| `sparqlSupport(options?, locale?)`            | CodeMirror extension for parsing, completion and local diagnostics. `locale` is a getter returning en/nl.    |
| `formatSparql(query, options?)`               | `Promise<string>` standalone formatter; no editor needed.                                                    |
| `getSparqlContext(state, position)`           | Structural context with booleans `service`, `filter`, `triple`, `blocked`, and `position`.                   |
| `previousVariables(state, before)`            | Earlier visible syntactic variable names without their sigil.                                                |
| `queryVariables(state, position)`             | Visible variable names throughout the current query scope, including later occurrences, without their sigil. |
| `createSparqlCompletion(options?)`            | CodeMirror completion source.                                                                                |
| `sparqlDiagnostics(state, locale?, options?)` | Synchronous CodeMirror diagnostics, including known-prefix quick fixes.                                      |
| `addPrefix(view, prefix, namespace)`          | Adds a declaration to an existing CodeMirror view; returns the actual alias.                                 |
| `defaultPrefixes` / `defaultPredicates`       | Default namespace map / small predicate vocabulary.                                                          |

Cursor `position` is subject, predicate, object, expression, service or other. Diagnostics report parser recovery spans and undeclared names. They do not certify semantic validity, endpoint capabilities or query safety. This implementation does not start a language server.

The public demo opts into the extended catalog through `sparql: { prefixes: extendedPrefixes }`. Embedded editors still default to the compact catalog unless the host explicitly supplies the extended map.
