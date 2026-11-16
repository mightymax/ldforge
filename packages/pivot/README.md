# @ldforge/pivot

**Package:** `@ldforge/pivot` (optional) · **Factory:** `createPivotRenderer(options?)` · **ID:** `pivot`

An accessible native HTML pivot table: rows cross columns, cells aggregate the
matching source observations, and margins show row, column and grand totals. No
external JavaScript, stylesheet, canvas or runtime dependency is needed.

```ts
import { createPivotRenderer } from '@ldforge/pivot';
const renderers = [
  createTableRenderer(),
  createPivotRenderer({ aggregate: 'sum' }),
];
```

| Binding        | Required | Meaning                                                       |
| -------------- | -------- | ------------------------------------------------------------- |
| `?pivotRow`    | Yes      | Nonempty row category; compared by its exact string value.    |
| `?pivotColumn` | Yes      | Nonempty column category; compared by its exact string value. |
| `?pivotValue`  | Yes      | Finite numeric literal, including negative values and zero.   |

Use `# view=pivot; pivot-aggregate=sum; pivot-title=My pivot`. Optional
`pivot-row-title` and `pivot-column-title` name the axes. Supported aggregations:

- `sum` (default): sum of source values.
- `count`: number of source observations, including zero-valued observations.
- `avg`: mean of source values. Totals use all underlying observations, so an
  average of displayed averages is never substituted for the weighted mean.
- `min` and `max`: extrema of source values, including for totals.

Repeated row/column pairs are aggregated. Missing combinations display an em dash
with a “No observations” tooltip, distinct from a real zero. Invalid bindings,
unsupported operations and nonfinite sum/average results report an error with the
source row. Numeric cells expose full precision in `title`/`data-value`; localized
formatting controls the visible representation. Category labels are DOM text,
never HTML. Group keys such as `__proto__` remain ordinary data.

Controls choose the aggregation, sort either axis by labels or totals, swap axes
without losing observations, and toggle cell colors. Color intensity reflects
absolute cell magnitude; positive values are green and negative values are warm
red. Values remain readable independently of color. Row/column headers use table
scopes; the overflow region is labeled, keyboard-focusable and scrolls horizontally
on narrow screens. Cleanup disables renderer-owned controls.

`PivotRendererOptions` accepts `aggregate`, `heatmap` (default `true`),
`maximumFractionDigits` (integer 0–20, default 3), `rowTitle` and `columnTitle`.
Query directives override the initial operation/axis titles; runtime controls only
change this result view. `buildPivotModel`, `transposePivotModel`, `pivotAggregates`,
`PivotDataError`, `PivotAggregate` and `PivotModel` are exported for host use.

### Art movements by collection example

Public endpoint: `https://query.wikidata.org/sparql` (GET). Counts Wikidata paintings
by art movement in the Rijksmuseum, Van Gogh Museum and Mauritshuis. Dutch labels
fall back to English. There is no LIMIT on the grouped combinations, so the pivot
covers all matches in these three collections. It describes Wikidata coverage,
not the institutions' complete inventories. A painting can have multiple movement
or collection statements: totals count assignments across cells, not globally
unique paintings. Keep the initial `sum` to sum the query's painting counts;
choosing `count` instead counts the returned grouped query rows.

```sparql
# view=pivot; pivot-title=Schilderijen per kunststroming en collectie; pivot-aggregate=sum; pivot-row-title=Kunststroming; pivot-column-title=Collectie
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?pivotRow ?pivotColumn ?pivotValue WHERE {
  {
    SELECT ?movement ?collection (COUNT(DISTINCT ?painting) AS ?pivotValue) WHERE {
      # Rijksmuseum, Van Gogh Museum, Mauritshuis
      VALUES ?collection { wd:Q190804 wd:Q224124 wd:Q221092 }
      ?painting wdt:P31 wd:Q3305213 ;
                wdt:P135 ?movement ;
                wdt:P195 ?collection .
    }
    GROUP BY ?movement ?collection
  }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "nl,en" .
    ?movement rdfs:label ?pivotRow .
    ?collection rdfs:label ?pivotColumn .
  }
}
ORDER BY ?pivotRow ?pivotColumn
```

LDForge is MIT licensed.
