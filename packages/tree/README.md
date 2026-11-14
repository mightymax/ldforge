# @ldforge/tree

Optional, dependency-free hierarchy renderer for LDForge. Importing it does not register it globally.

```sh
npm install @ldforge/core @ldforge/editor @ldforge/renderers @ldforge/tree
```

```ts
import { createHttpExecutor } from '@ldforge/core';
import { createEditor } from '@ldforge/editor';
import { createTableRenderer } from '@ldforge/renderers';
import { createTreeRenderer } from '@ldforge/tree';
import '@ldforge/editor/styles.css';

const editor = createEditor(document.querySelector('#editor')!, {
  executor: createHttpExecutor({
    endpoint: 'https://vocab.getty.edu/sparql.json',
    method: 'GET',
  }),
  renderers: [createTableRenderer(), createTreeRenderer()],
});
// Set a query from the examples below, then editor.run().
// On host unmount: editor.destroy().
```

## Binding contract

SELECT results must declare `tree_id`; rows without a valid ID are skipped and counted in the diagnostic. No parent or label columns are required.

| Binding       | Meaning                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tree_id`     | Required nonempty URI or stable literal identifier. Blank nodes and whitespace-only values are rejected.                                                |
| `tree_parent` | Optional identifier using exactly the same matching rules. An unbound/invalid parent makes the row a root candidate. Invalid bound parents are counted. |
| `tree_label`  | Optional nonempty term value displayed as text; defaults to the original identifier value.                                                              |
| `tree_url`    | Optional absolute HTTP(S) term value; all other schemes and relative URLs are ignored. No automatic dereferencing.                                      |

Matching is exact and case-sensitive on lexical values, with URI and literal identities kept separate. No trimming, URL normalization, prefix expansion or numeric coercion is applied to IDs. Literal identity includes datatype and lowercased language tag. Plain literals and `xsd:string` match; `literal` and legacy `typed-literal` with the same datatype match. Language literals default to `rdf:langString`. The original ID term is preserved independently of the label and URL; for equivalent term encodings the first original term is retained.

Repeated IDs merge; repeated parent/child edges merge. Conflicting nonempty labels and valid URLs use the lexicographically smallest value (UTF-16 order), independent of result row order. Sorting uses the serialized identity key, not the label or browser locale. Missing parents are omitted, counted once per missing identifier, and their children become root candidates unless they also have a present parent.

## Shared children, cycles and large results

A deterministic iterative depth-first spanning forest assigns each resource one expandable occurrence. Start with sorted root candidates, then start any still-unvisited components at their smallest remaining key. A candidate already reached from another root stays there. Other incoming edges appear as terminal **(reference)** occurrences with the same original ID, link and inspector action. This avoids exponentially repeated subtrees. References do not expand or jump to another occurrence.

Back edges are counted under **Cycles** and rendered as references. This count is a diagnostic, not the number of all mathematical cycles. Cyclic-only datasets therefore remain visible, including self loops; no traversal or rendering uses recursive calls.

All branches start collapsed. Expanding creates only the visible rows; collapsing removes descendants. Rendering is O(visible nodes + visible edges), and the model is O(nodes + edges) after key sorting. This is lazy branch rendering, not viewport virtualization: a very wide expanded branch still creates every immediate child. Input results remain in memory. Indentation is capped visually after 30 levels while ARIA levels retain full depth.

## Options, accessibility and lifecycle

`createTreeRenderer({ title?, onInspect? })` accepts a default title and a host callback `(term: BindingTerm) => void`. `# view=tree` selects the registered renderer; `# tree-title=...` overrides its title. The wizard includes all four bindings and the title option. UI labels and diagnostics support English and Dutch through the editor locale.

A single tree item is in the Tab sequence. Up/Down move through visible items; Home/End select first/last; Right expands or enters a branch; Left collapses or selects the parent; Enter/Space toggle. Pointer clicks select and toggle. The selected resource's link and optional inspector button follow the tree. Flat treeitems expose `aria-level`, `aria-posinset`, `aria-setsize`, `aria-selected` and branch `aria-expanded`.

The renderer returns cleanup that removes all its listeners and expansion state. The editor invokes it on result/view changes and destruction. No network requests, timers or global listeners are created.

To use the shared resource inspector without embedding endpoint configuration in this package, have the host own its panel and loader:

```ts
import {
  createResourceInspector,
  createResourceLoader,
} from '@ldforge/renderers';
const inspector = createResourceInspector(
  document.querySelector('#inspector')!,
  {
    loadResource: createResourceLoader(executor), // host-owned QueryExecutor
  },
);
const tree = createTreeRenderer({
  onInspect: (term) => {
    void inspector.open(term);
  },
});
// Register tree in your editor. On host unmount: inspector.destroy(); editor.destroy().
```

The inspector button appears only for URI IDs when `onInspect` is supplied; it passes `tree_id`, never a label or `tree_url`.

## Runnable local SKOS example

Run `npm ci && npm run dev` at the repository root, choose **Examples → SKOS hierarchy (local tree)**, then **Run query**. The fixture is deterministic and requires no endpoint. The same complete query runs against any SPARQL 1.1 endpoint:

```sparql
# view=tree
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
}
```

These rows describe `tree_id skos:broader tree_parent`. The fixture deliberately shares Watercolor between Drawing and Painting.

## Optional live SKOS example: Getty AAT

Choose **Examples → Getty paintings (live tree)** or run this query with GET at `https://vocab.getty.edu/sparql.json`. It includes the painting root and two narrower levels, retaining shared children. Availability and counts depend on Getty; automated tests never require it.

```sparql
# view=tree
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
ORDER BY ?tree_parent ?tree_label ?tree_id
```
