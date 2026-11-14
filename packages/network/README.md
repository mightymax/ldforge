# @ldforge/network

**Package:** `@ldforge/network` (optional) · **Factory:** `createNetworkRenderer(options?)` · **ID:** `network`

Interactive directed relationship graphs using vis-network 10.1.5, loaded from a
pinned external ESM module only when the Network tab opens. The library is not
bundled or a package runtime dependency. Register it alongside other renderers:

```ts
import { createNetworkRenderer } from '@ldforge/network';
const renderers = [createTableRenderer(), createNetworkRenderer()];
```

| Binding                        | Required | Meaning                                                                        |
| ------------------------------ | -------- | ------------------------------------------------------------------------------ |
| `?source`, `?target`           | Yes      | URI or blank-node identifiers. Literals and missing nodes produce a row error. |
| `?sourceLabel`, `?targetLabel` | No       | Plain-text names; fall back to each identifier.                                |
| `?relationLabel`               | No       | Plain-text directed edge label.                                                |
| `?sourceGroup`, `?targetGroup` | No       | Group names used for node colors and the legend.                               |

A node is identified by its RDF term type and value. Repeated nodes and identical
source/target/label edges are deduplicated; different relation labels stay separate.
Use consistent group names for a node across rows. URI nodes have a safe HTTP(S)
link in the selected-node panel and the always-available Network data list; blank
nodes and unsafe URL schemes remain plain text. No labels are interpreted as HTML.

Use `# view=network; network-title=My graph`. Drag nodes/background, zoom, select a
node to highlight its connected edges, or use the labeled node picker to focus a
node and expose its link. Fit/zoom buttons are available. Arrow keys and +/- work
while the network canvas is focused; they do not capture keys globally.

Options: `libraryUrl` defaults to
`https://cdn.jsdelivr.net/npm/vis-network@10.1.5/standalone/esm/vis-network.min.mjs`;
`loadLibrary` supplies a custom lazy loader exporting `Network` with the exported
`NetworkConstructor`/`NetworkHandle` interfaces. Optional `stylesheetUrl` loads
host CSS (or `false` disables it); the default standalone build includes its own
styles. vis-network is dual Apache-2.0/MIT licensed. Only trusted host options can
change executable asset URLs. Failed downloads/module exports can be retried;
late loads after cleanup never create a network. Cleanup calls `destroy()`.

### Dutch painters example

Public endpoint: `https://query.wikidata.org/sparql` (GET). Both Netherlands and
Kingdom of the Netherlands citizenship values are included. The bounded query
returns up to 75 teacher/movement relations with Dutch labels, falling back to
English. Values reflect Wikidata's current statements, not a curated art history.

```sparql
# view=network; network-title=Nederlandse schilders, leermeesters en kunststromingen
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?source ?sourceLabel ?target ?targetLabel ?relationLabel ?sourceGroup ?targetGroup WHERE {
  {
    SELECT DISTINCT ?source ?target ?relationLabel ?targetGroup WHERE {
      VALUES ?country { wd:Q55 wd:Q29999 }
      ?source wdt:P27 ?country ;
              wdt:P106/wdt:P279* wd:Q1028181 .
      {
        ?source wdt:P135 ?target .
        BIND("kunststroming" AS ?relationLabel)
        BIND("Kunststroming" AS ?targetGroup)
      }
      UNION
      {
        ?source wdt:P1066 ?target .
        BIND("leermeester" AS ?relationLabel)
        BIND("Kunstenaar" AS ?targetGroup)
      }
    }
    LIMIT 75
  }
  BIND("Kunstenaar" AS ?sourceGroup)
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "nl,en" .
    ?source rdfs:label ?sourceLabel .
    ?target rdfs:label ?targetLabel .
  }
}
```

LDForge is EUPL-1.2; the external visualization library retains its own license.
