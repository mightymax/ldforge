# Plugins

LDForge result renderers turn normalized SELECT, ASK or RDF graph results into independent views. Choose a view through the icon tabs below the query editor. Only plugins supporting the current result appear. The download button always exports the complete result as CSV.

## Geo

**Package:** `@ldforge/geo` (optional) · **Factory:** `createGeoRenderer(options?)` · **ID:** `geo`

Shows WKT points, lines and polygons on an interactive Leaflet map, with automatic bounds and plain-text label popups. The small adapter loads pinned Leaflet 1.9.4 JavaScript and CSS only on activation, outside the application bundle, following the chart plugin's loading pattern. No Leaflet runtime dependency is installed.

```ts
import { createGeoRenderer } from '@ldforge/geo';
// Add alongside your other result renderers:
const renderers = [createTableRenderer(), createGeoRenderer()];
```

### Geo binding contract

| Variable          | Required | Meaning                                                                         |
| ----------------- | -------- | ------------------------------------------------------------------------------- |
| `?geometry`       | Yes      | Literal containing two-dimensional WGS84 WKT; longitude first, latitude second. |
| `?geometryLabel`  | No       | Plain-text feature label, defaults to the result row number.                    |
| `?geometryHeight` | No       | Nonnegative numeric literal in meters; extrudes polygons in 3D.                 |
| `?geoImage`       | No       | Absolute HTTP(S) image URI or URL literal, shown in the feature popup.          |
| `?geoDescription` | No       | Plain-text popup description, with line breaks preserved.                       |
| `?geoLink`        | No       | Absolute HTTP(S) URI or URL literal; makes the label a link in a new tab.       |

The tab appears for results declaring `geometry`. Use `# view=geo` to activate it automatically and optional `geo-title` for its heading. `POINT`, `LINESTRING`, `POLYGON` (including holes), `MULTIPOINT`, `MULTILINESTRING` and `MULTIPOLYGON` are supported, including mixed types in one result. Bare WKT and the GeoSPARQL CRS84 URI prefix are accepted. Other CRS/SRID values, extra dimensions, EMPTY and geometry collections are rejected rather than projected or guessed. Coordinate bounds, finite numbers, minimum lengths and closed rings are checked; polygon topology is not checked. Invalid or unbound geometries produce a localized row error; empty results show an empty state without loading external assets.

### Map display modes

The compact button group offers **Normal**, **Grouped**, and **Heatmap** (localized in Dutch). Normal draws each feature. Grouped uses Supercluster to combine nearby points, shows their counts, and expands clusters on click or zoom. Heatmap uses simpleheat to show point density with equal weight per point. MultiPoint members are individual observations. Lines and polygons remain visible in all modes and are not interpreted as point observations. When there are only shapes, the original geometry is shown without loading a mode library.

Choose the initial mode with `# view=geo; mode=grouped` or `mode=heatmap`; the host option `mode` supplies the default. `geo-mode` remains supported as an alias; `mode` takes precedence when both are supplied. Invalid mode directives fall back to Normal. Switching modes preserves map position. Supercluster 8.0.1 and simpleheat 0.4.0 are separate pinned external ESM downloads that happen only when that mode is first selected. Configure `clusterLibraryUrl`/`heatLibraryUrl` or inject `loadClusterLibrary`/`loadHeatLibrary` for self-hosting. Failed mode loads can be retried; late completions after another selection or cleanup cannot replace the active view. Supercluster is ISC licensed and simpleheat is BSD-2-Clause licensed.

### 3D buildings

Bind `?geometryHeight` to a finite, nonnegative number in meters. Polygons and
MultiPolygons retain their holes and extrude upward from ground level. Missing
heights leave a polygon flat; points and lines remain visible. Invalid bound
heights produce a row error. WKT remains two-dimensional longitude/latitude data.

Positive polygon heights default to **3D**, unless `mode`/`geo-mode` or the host
`mode` option explicitly chooses another mode. To always select 3D, use
`# view=geo; mode=3d`. The 3D button uses MapLibre GL JS 6.18.0 (BSD-3-Clause),
loaded from a pinned external module with matching CSS only when needed. Normal,
Grouped and Heatmap continue to use Leaflet without downloading MapLibre.

The demo's **Paleis het Loo (Geo 3D)** example uses the OSM endpoint below:

```sparql
# view=geo; mode=3d; geo-title=Paleis het Loo
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX osmt: <https://data.osm.pldn.nl/wiki/Key:>
SELECT * WHERE {
  ?gebouw osmt:building ?building .
  ?gebouw skos:prefLabel ?geometryLabel .
  ?gebouw geo:hasGeometry/geo:asWKT ?geometry .
  BIND(10 AS ?geometryHeight)
  FILTER(?geometryLabel = "Paleis het Loo")
}
```

This makes a ten-meter building volume, not a detailed roof or architectural
model. The tilted view fits query bounds. Navigation controls and right-drag
allow rotation/tilt. Click a feature for its label and height. Returning to a
Leaflet mode restores the 2D view. WebGL is required; on failure, retry or choose
Normal. Text geometry/height data stays available. Self-host using
`threeDLibraryUrl`, `threeDStylesheetUrl` (or `false` for host CSS), and
`loadThreeDLibrary`. The exported `ThreeDLibrary`, `ThreeDMapHandle` and
`ThreeDMapEvent` types require no installed MapLibre type dependency. The usual
`tileUrl`/`tileAttribution` options apply in both renderers, including
`tileUrl: false`. Allow `worker-src blob:` in CSP for MapLibre's worker.

### Castles in North Holland example

Endpoint: `https://query.wikidata.org/sparql` (GET). The demo's **Kastelen in Nederland (Geo)**
returns up to 250 castles in North Holland with coordinates and a Wikidata image. It uses
mandatory patterns without OPTIONAL, including a Dutch Wikipedia sitelink. Only castles
with a Dutch article appear. Popup labels link to that Wikipedia article; descriptions
prefer Dutch and fall back to English. Commons images use HTTPS thumbnail URLs.
The missing `rdfs` and `schema` prefixes are included explicitly.

```sparql
# view=geo; geo-title=Kastelen in Noord-Holland
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>

SELECT ?place ?geometryLabel ?geoDescription ?geoImage ?geometry ?geoLink WHERE {
  ?place wdt:P31 wd:Q23413 ;
         wdt:P17 wd:Q55 ;
         wdt:P131+ wd:Q701 ;
         wdt:P625 ?geometry ;
         wdt:P18 ?image .

  ?geoLink schema:about ?place ;
           schema:isPartOf <https://nl.wikipedia.org/> .

  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "nl,en" .
    ?place rdfs:label ?geometryLabel ;
           schema:description ?geoDescription .
  }

  BIND(IRI(CONCAT(REPLACE(STR(?image), "^http:", "https:"), "?width=480")) AS ?geoImage)
}
LIMIT 250
```

Wikipedia sitelinks are modeled from the article to the Wikidata item:
`?geoLink schema:about ?place`. The additional
`schema:isPartOf <https://nl.wikipedia.org/>` selects Dutch Wikipedia rather than
another language or Wikimedia project. This is a sitelink, not a `wdt:P…`
statement on the castle. See the [Wikibase RDF sitelink format](https://www.mediawiki.org/wiki/Wikibase/Indexing/RDF_Dump_Format#Sitelinks).

Wikidata's `wdt:P625` returns WGS84 WKT points directly, so no geometry conversion
is needed. The separate **Paleis het Loo (Geo 3D)** example above keeps using OSM.

This deterministic query demonstrates all three basic types on any SPARQL 1.1 endpoint:

```sparql
# view=geo; geo-title=Points, lines and polygons
SELECT ?geometryLabel ?geometry WHERE {
  VALUES (?geometryLabel ?geometry) {
    ("Point" "POINT(4.9 52.37)")
    ("Line" "LINESTRING(4.88 52.36,4.92 52.38)")
    ("Area" "POLYGON((4.86 52.35,4.89 52.35,4.89 52.38,4.86 52.35))")
  }
}
```

### Loading, hosting and lifecycle

See [GeoRendererOptions and supported WKT](https://github.com/mightymax/ldforge/blob/main/packages/geo/README.md) for every option. Defaults are `https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm`, the matching external `dist/leaflet.css`, and OpenStreetMap raster tiles with visible attribution. `libraryUrl`, `stylesheetUrl`, `tileUrl` and `tileAttribution` allow self-hosting/custom providers. `loadLibrary` overrides the JavaScript loader only; set `stylesheetUrl: false` if the host supplies CSS. Set `tileUrl: false` for no basemap requests. The exported `GeoLibrary`, `GeoMapHandle` and `GeoLayerHandle` interfaces avoid a mandatory Leaflet type dependency.

External mode requires network access and CSP permissions for CDN scripts/styles and tile images. Leaflet is BSD-2-Clause licensed. The default tiles follow the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/); use a suitable provider for production traffic. Only trusted host configuration can specify executable library URLs or attribution HTML; query comments cannot. Module/CSS failures show a retry button. Tile failures are handled by Leaflet and do not remove geometry. An expandable text geometry list remains accessible. Cleanup removes maps and resize observers and ignores late asynchronous completions.

## Network

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

## Timeline

**Package:** `@ldforge/timeline` (optional) · **Factory:** `createTimelineRenderer(options?)` · **ID:** `timeline`

Interactive dated points and ranges with vis-timeline 8.5.6, downloaded only when
the Timeline tab opens. Supports grouping, dragging through time, Ctrl + scroll
to zoom, explicit zoom buttons and a Fit action. Large overlapping sets can be
scrolled vertically. Events are read-only; dragging does not edit source data.

```ts
import { createTimelineRenderer } from '@ldforge/timeline';
const renderers = [createTableRenderer(), createTimelineRenderer()];
```

| Binding                | Required | Meaning                                                                                             |
| ---------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `?timelineLabel`       | Yes      | Nonempty plain-text event label.                                                                    |
| `?timelineStart`       | Yes      | Literal ISO year, year-month, calendar date, or timezone-qualified dateTime.                        |
| `?timelineEnd`         | No       | Same format; makes a range. Must not precede the start.                                             |
| `?timelineGroup`       | No       | Row/group name. Mixed grouped/ungrouped events use an Other row.                                    |
| `?timelineLink`        | No       | Absolute HTTP(S) URL on the label, opened with `noopener noreferrer`.                               |
| `?timelineDescription` | No       | Plain-text details shown on selection.                                                              |
| `?timelineImage`       | No       | Absolute HTTP(S) image URI or URL literal. Thumbnail on the timeline and larger image on selection. |

Use `# view=timeline; timeline-title=My timeline`. `buildTimelineModel` and
`parseTimelineDate` are exported for hosts that need to inspect normalized data.
Years/months start on January 1/the first of the month, at midnight UTC. Full
calendar dates and dateTimes are validated (including leap days); ambiguous locale
formats and reversed ranges report their row. Signed extended years and Wikidata's
leading plus are accepted. No imprecise year/month value is silently treated as an
exact source date: the display uses the first day of the given period. The example
uses available Wikidata date literals; date precision/uncertainty qualifiers are
not modeled. The fallback Timeline data table formats dates in UTC and remains
available during loading or failure. All labels/descriptions/group names use DOM
text; query values are never executable HTML.

Timeline images load lazily, use no-referrer, and disappear on image errors. Unsafe or invalid image URLs are omitted without dropping events. The example samples one portrait per painter and requests a Commons thumbnail.

Options: `libraryUrl` defaults to
`https://cdn.jsdelivr.net/npm/vis-timeline@8.5.6/standalone/esm/vis-timeline-graph2d.min.mjs`;
`stylesheetUrl` defaults to the same version's `styles/vis-timeline-graph2d.min.css`
(or `false` for host-supplied CSS). `loadLibrary` overrides the JS loader and must
export `Timeline` following `TimelineConstructor`/`TimelineHandle`. Library and CSS
failures can be retried, stale loads are discarded, and cleanup destroys the view.
vis-timeline is dual Apache-2.0/MIT licensed. Standalone builds own their internal
DataSets: these plugins pass plain arrays and do not exchange DataSet instances.

### Lives of Dutch painters example

Public endpoint: `https://query.wikidata.org/sparql` (GET). Up to 35 deceased
painters with a Wikidata image and at least 30 sitelinks, ranked by sitelinks, with birth/death ranges
and links. MIN/MAX collapse repeated birth/death statements per person; this is a
data demonstration, not an assessment of conflicting historical dates. Citizenship
includes the Netherlands and Kingdom of the Netherlands. Names/descriptions prefer
Dutch and fall back to English.

```sparql
# view=timeline; timeline-title=Levens van Nederlandse schilders
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>

SELECT ?timelineLabel ?timelineStart ?timelineEnd ?timelineGroup ?timelineDescription ?timelineImage (?person AS ?timelineLink) WHERE {
  {
    SELECT ?person (MIN(?birth) AS ?timelineStart) (MAX(?death) AS ?timelineEnd) (SAMPLE(?portrait) AS ?photo) WHERE {
      VALUES ?country { wd:Q55 wd:Q29999 }
      ?person wdt:P31 wd:Q5 ;
              wdt:P27 ?country ;
              wdt:P106 wd:Q1028181 ;
              wdt:P569 ?birth ;
              wdt:P570 ?death ;
              wdt:P18 ?portrait ;
              wikibase:sitelinks ?sitelinks .
      FILTER(?sitelinks >= 30)
    }
    GROUP BY ?person
    ORDER BY DESC(MAX(?sitelinks))
    LIMIT 35
  }
  BIND(IRI(CONCAT(REPLACE(STR(?photo), "^http:", "https:"), "?width=320")) AS ?timelineImage)
  BIND("Schilders" AS ?timelineGroup)
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "nl,en" .
    ?person rdfs:label ?timelineLabel ;
            schema:description ?timelineDescription .
  }
}
ORDER BY ?timelineStart
```

## Pivot

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

## Charts

**Package:** `@ldforge/charts` (optional, separate from `@ldforge/renderers`) · **Factory:** `createChartRenderer(options?)` · **ID:** `charts`

Renders bar, line, pie and doughnut charts with [Chart.js](https://www.chartjs.org/docs/latest/). The plugin adapter has no Chart.js runtime dependency and imports no chart code at module initialization. Its default loader fetches a version-pinned external ESM module **only when the Charts result tab is activated**. Installing or registering the plugin, executing a query in Table, and opening the documentation do not download the library. A query using `# view=charts` activates the tab after success and starts loading at that point.

### Chart binding contract

| Binding         | Required | Meaning                                                                                                                                                                  |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `?chart_label`  | Yes      | Nonempty category label. Literal, IRI and blank-node lexical values are displayed as text.                                                                               |
| `?chart_value`  | Yes      | Finite numeric literal; decimal and exponent notation accepted. URI values, unbound values, blanks, NaN, Infinity, hexadecimal and comma-formatted numbers are rejected. |
| `?chart_series` | No       | Series name, for grouped bar or multiple-line charts. Missing values use the default series, labeled Value/Waarde.                                                       |

The plugin appears only for SELECT results declaring both required variables. Empty results show an empty state without loading Chart.js. Invalid bindings produce a localized error with a one-based row number; rows are never silently dropped. CSV, Table and JSON remain available even when chart data is invalid.

Categories and series preserve their first encounter order. Duplicate `(label, series)` pairs are summed, including finite-overflow checks. A missing category within a series remains `null` (a gap), rather than inventing a zero. Use SPARQL `ORDER BY` and aggregation to control ordering and totals. There is no date adapter or continuous numeric/time X-axis: line charts use the provided category order.

Pie and doughnut require a single series and nonnegative values. Multiple series or negative slices produce an explicit error. Bar and line support negative values. All-zero pie data has no visible slices; the accessible data table still shows its values.

### Complete chart query

```sparql
# view=charts; chart=bar; chart-title=Example values by category
SELECT ?chart_label ?chart_value ?chart_series
WHERE {
  VALUES (?chart_label ?chart_value ?chart_series) {
    ("A" 10 "First") ("B" 20 "First")
    ("A" 15 "Second") ("B" 12 "Second")
  }
}
ORDER BY ?chart_label ?chart_series
```

- `# view=charts` requests the registered plugin's result tab.
- `# chart=bar` chooses `bar` (default), `line`, `pie` or `doughnut`. Values are case-sensitive. Unsupported values produce an error, without a library request.
- `# chart-title=...` supplies a plain-text heading and canvas accessible name. The default is Charts/Grafieken.
- `# css=...` is not interpreted by this plugin; it remains specific to Cards.

For pie or doughnut, omit `?chart_series` or return only one series. Open **Charts example** in the demo for deterministic fixture data. The displayed city values are illustrative sample values, not a live statistics feed.

### Install and register

```sh
npm install @ldforge/charts
```

```ts
import { createChartRenderer } from '@ldforge/charts';
import { createTableRenderer, createJsonRenderer } from '@ldforge/renderers';

const renderers = [
  createTableRenderer(),
  createChartRenderer(),
  createJsonRenderer(),
];
// Pass renderers to createEditor().
```

No chart dependency is added to core, editor or the standard renderer package. Applications that omit `@ldforge/charts` do not include the adapter either. Applications that register it include only the small adapter; the default Chart.js download is outside the application's bundle and build output.

### ChartRendererOptions

| Property      | Type                        | Default and behavior                                                                                                                                                                                                                                                          |
| ------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libraryUrl`  | `string?`                   | `https://cdn.jsdelivr.net/npm/chart.js@4.6.1/auto/+esm`. An external HTTP(S) ESM module, or a relative URL resolved against the host document. It must export a registered Chart.js constructor as `Chart` or `default`. UMD script files cannot be imported directly as ESM. |
| `loadLibrary` | `(() => Promise<unknown>)?` | Custom asynchronous loader. Takes precedence over `libraryUrl`; no default CDN request occurs. Must resolve to an ESM module with `Chart` or `default`. It runs on first activation, not during configuration.                                                                |

`DEFAULT_CHART_LIBRARY_URL` is exported for inspecting the default version. Module loads are shared between activations of a plugin, and default URL loads are shared across plugin instances. Failed loads are removed from the adapter's cache so Retry can invoke the loader again; browser/module-loader caching still applies. If a CDN/module failure remains cached by the browser, reload the page after correcting the cause. Each activation gets its own chart instance. Locale/view/query changes and editor destruction call `destroy()` on that instance. A late import result never mounts into a disposed renderer.

For a module hosted on your own domain:

```ts
createChartRenderer({ libraryUrl: '/vendor/chartjs-4.6.1.esm.js' });
// Use a real ESM bundle with Chart.js controllers already registered.
// This path is an example; LDForge does not create the file automatically.
```

For a local lazy chunk managed by your application's bundler:

```sh
npm install chart.js
```

```ts
createChartRenderer({ loadLibrary: () => import('chart.js/auto') });
```

This keeps Chart.js out of the initial bundle but **does** include it as a separate file in your build output. The default CDN mode keeps it out of the build output as well. Do not statically import Chart.js in your application's entry point if you want to defer its download. The external loader uses a runtime dynamic import without bundler resolution; it does not inject script tags or modify import maps.

The default external mode requires network access and a content security policy permitting `https://cdn.jsdelivr.net` for scripts, including its ESM dependencies. External modules must support CORS. Choose your own loader or self-hosted ESM URL for deployments that prohibit external scripts or need offline operation. The URL is developer configuration; SPARQL headers cannot select executable module URLs. The CDN version is pinned, and Chart.js keeps its own MIT license. See the official [integration guide](https://www.chartjs.org/docs/latest/getting-started/integration.html) for registration and bundling choices.

### Accessibility and failure behavior

The canvas has an accessible name and is accompanied by an expandable **Chart data** / **Grafiekgegevens** table. The table remains available during loading and after a library failure. Numeric table values follow the IDE locale. A loading status and Retry button handle asynchronous failures inside the renderer without changing the query execution result or hiding CSV download. Animations are disabled.

Custom loaders may use the exported structural types `ChartConstructor`, `ChartHandle` and `ChartRendererConfig`: the constructor receives `(canvas: HTMLCanvasElement, config: ChartRendererConfig)`, returns a handle with `destroy(): void`, and receives labels, datasets and the selected chart type. These types deliberately have no dependency on Chart.js declarations, so applications using the default external loader do not need Chart.js installed to typecheck.

## Cards

**Package:** `@ldforge/renderers` · **Factory:** `createCardsRenderer(options?)` · **ID:** `cards`

Displays one card per SELECT result row in a responsive grid. Register it explicitly; `# view=cards` does not install a plugin. It supports binding results with at least one of the five exact, case-sensitive variable names below. Other selected variables are ignored by Cards and remain available in Table, JSON and CSV.

| Binding            | Content                                       | Behavior when missing or unbound |
| ------------------ | --------------------------------------------- | -------------------------------- |
| `?card_title`      | Plain-text heading                            | No heading                       |
| `?card_text`       | Plain-text description; line breaks preserved | No description                   |
| `?card_image`      | Image URL as an IRI or literal                | No image                         |
| `?card_button`     | Plain-text link label                         | No button                        |
| `?card_button_url` | Link destination as an IRI or literal         | No button                        |

All fields are optional per row. A button requires both a nonempty label and a valid URL. Empty results show a localized empty-state message; a row without usable fields shows a localized placeholder. Duplicate rows remain separate cards, with the endpoint's order preserved. Alias your source variables using `AS` when they have different names. The renderer uses lexical values; it does not require a particular literal datatype or language.

Image and button URLs accept HTTP(S) or relative URLs resolved against the host document. Invalid URLs and other schemes, including `javascript:` and `data:`, are omitted. Text is never interpreted as HTML. Buttons open in a new tab with `noopener noreferrer`. Images load lazily without a referrer, and are removed if loading fails. Use images your application is allowed to load; the renderer makes no image-proxy requests.

### Complete Cards query

This query works without a dataset because it uses VALUES. Replace the image and destination URLs with your own. The demo's **Plugin Examples → Cards example** instead loads the [Wikidata cat grid](https://ldforge.nl/wikidata-cats.html) query and selects `https://query.wikidata.org/sparql` over GET. Press Run query to fetch twelve cats with pictures, descriptions and links. This live example requires internet access; selecting it updates the endpoint settings and remembered endpoint, and does not reuse authentication headers from another connection. Choose **Local fixture (no endpoint)** in settings to return to offline sample data.

```sparql
# view=cards
# css=max-width: 320px; border-radius: 14px;
SELECT ?card_title ?card_text ?card_image ?card_button ?card_button_url
WHERE {
  VALUES (?card_title ?card_text ?card_image ?card_button ?card_button_url) {
    ("LDMax" "Explore connected knowledge." <https://your-project.example/image.jpg>
     "Explore LDMax" <https://ldmax.nl/>)
    ("LDForge" "Build your own SPARQL IDE." UNDEF
     "View source" <https://github.com/mightymax/ldforge>)
  }
}
```

```ts
import { createCardsRenderer } from '@ldforge/renderers';
const renderers = [createCardsRenderer()];
// Pass renderers to createEditor(), and import @ldforge/editor/styles.css.

// Hosts can disable query-provided styling while keeping card rendering:
const unstyledByQuery = createCardsRenderer({ allowQueryStyles: false });
```

`CardsRendererOptions.allowQueryStyles?: boolean` defaults to `true`. The shared editor stylesheet provides the grid, images, headings and buttons. A standalone renderer can use the same stylesheet or host CSS targeting `.ldforge-cards`, `.ldforge-card`, `.ldforge-card-body` and `.ldforge-card-button`.

## Plugin wizard

The right-hand toolbar's **Plugin wizard** button guides you through choosing a
registered renderer, setting its header options, and reviewing a header with
optional binding-contract comments. **Apply to query** replaces existing renderer
header settings and previously generated contracts without changing the query
body, unrelated comments, host metadata or CSS. It does not run or rewrite your
SELECT/ASK/graph query: use the contract comments to choose matching bindings.
Closing the dialog leaves the query unchanged.

Every registered plugin can appear; only its declared `wizard` metadata supplies
options and contracts. No unregistered renderer catalogue is imported, and lazy
visualization libraries are not downloaded. Custom renderers without metadata
still get a view-only header. For example:

```sparql
# view=charts; chart=bar; chart-title="My chart"
# ldforge-bindings:start
# Pie and doughnut require one nonnegative series.
# ?chart_label (required): Category label
# ?chart_value (required): Finite numeric value
# ?chart_series (optional): Series name
# ldforge-bindings:end
```

The button defaults to enabled. Hide it with `controls.rendererWizard: false`, or
call `editor.getRendererWizard().setVisible(false)` at runtime. The API remains
available when hidden; `generate(config)` returns a header and `apply(config)`
applies it to the active query. `editor.getRenderers()` lists registered plugins.
See [Plugin wizard API](api/editor.md#plugin-wizard) and
[renderer metadata](api/plugins.md#wizard-metadata) for types and examples.

## Query headers

### Shared endpoints

In the demo, a leading endpoint comment makes a query portable:

```sparql
# view=table
# sparql-endpoint=https://datasetregister.netwerkdigitaalerfgoed.nl/sparql
DESCRIBE <https://n2t.net/ark:/72166/dataset>
```

The endpoint is selected when you run the query and is shown under the editor.
The request uses fresh connection headers. Live examples include this comment
when loaded; SELECT, CONSTRUCT, ASK and DESCRIBE basics explicitly select local
fixtures and make no endpoint request unless you add an endpoint header yourself.
The Plugin wizard preserves endpoint comments. Embedded applications can enable
this through core's `createQueryEndpointExecutor`; see
[portable endpoint headers](api/transport.md#portable-endpoint-headers).

Put metadata in the leading SPARQL comment block, before PREFIX/BASE and the query operation. Keep plugin settings together on one comment line, using semicolon-separated `key=value` assignments: `# view=charts; chart=bar; chart-title=Example city populations`. Put CSS on its own `# css=...` line, because CSS declarations themselves contain semicolons. Separate configuration lines remain supported for existing queries. Blank lines and ordinary comments are allowed in that block. Keys are case-insensitive, values can optionally be quoted, and the last occurrence wins, including across lines. Quote values containing semicolons, for example `chart-title="Cities; populations"`; quoted values also support escaped quotes and backslashes. Apostrophes inside unquoted values such as `People's cities` do not start a quoted value. CSS consumes its entire dedicated comment line; `css` embedded among plugin assignments is ignored. Parsing stops at the first non-comment SPARQL line: comments inside the query and strings are never directives. Formatting and prefix insertion preserve the header. These are normal SPARQL comments and are sent to the executor unchanged.

```sparql
# view=cards
# css=max-width=100px; background-color: #f5f8f6;
SELECT ?card_title WHERE { BIND("A small card" AS ?card_title) }
```

- `view` selects a registered renderer by its exact ID after a successful execution. Any supported plugin ID works, such as `cards`, `table` or `json`. An unknown, unregistered or unsupported ID leaves the previous supported selection in place, then falls back to the first supported renderer. A query header never prevents manual tab switching. Running the query again reapplies its requested view.
- `css` is a declaration list used by Cards, scoped to **each card**, not the grid, page or other result views. Both standard CSS (`max-width: 100px`) and the shorthand in the example (`max-width=100px`) are accepted. Semicolons separate declarations. Other plugins may interpret this value themselves; the editor does not inject query CSS globally.

Cards accepts these properties: `width`, `min-width`, `max-width`, `height`, `min-height`, `max-height`; `padding` and its four sides; `margin` and its four sides; `border`, `border-width`, `border-style`, `border-color`, `border-radius`; `background-color`, `color`, `box-shadow`, `font-size`, `font-weight`, `line-height`, `text-align`. The browser validates property values. Other properties, selectors, at-rules, `url()`, escaped expressions and `!important` are ignored. For grid layout, image styling or wider customization, use host CSS instead. Use CSS properties such as `background-color`, not the unsupported `background` shorthand.

### Header API for third-party plugins

Core exports `parseQueryViewDirectives(query: string): QueryViewDirectives`. It returns a frozen map with optional `view` and `css` strings and additional custom string keys. It performs no DOM operations. The editor passes the executed query snapshot and parsed headers to the renderer as `context.query` and `context.directives`. Subsequent typing does not change the metadata associated with an existing result.

```ts
import { parseQueryViewDirectives } from '@ldforge/core';
const directives = parseQueryViewDirectives(
  '# view=cards\n# css=max-width: 320px;\nSELECT * {}',
);
console.log(directives.view); // 'cards'
console.log(directives.css); // 'max-width: 320px;'
```

A custom renderer can read `context?.directives?.['my-setting']`. Document each custom key and validate its values in the plugin. Unknown keys do not change editor behavior. Direct calls to `renderer.render()` may omit the context or pass `{ locale, query, directives }`; direct callers must parse and pass directives themselves.

## Table

**Package:** `@ldforge/renderers` · **Factory:** `createTableRenderer(options?)` · **ID:** `table`

Displays SELECT bindings or CONSTRUCT/DESCRIBE triples as a table. Graph results use subject/predicate/object columns. Column order follows the SELECT variable order, rows follow the endpoint's result order, and unbound values produce empty cells. RDF values are rendered safely as text. URI terms retain plain text with a small circular information button that opens the resource inspector. Datatype and language information appear in cell tooltips. The table caption and result count follow the editor language.

**Binding contract:** supports `kind: 'bindings'` and `kind: 'graph'`. No special variable names are required: `?resource`, `?label`, `?price` or any other SELECT variables become columns. SELECT aliases determine the displayed column names.

The first plugin example in the demo’s Examples menu (after the four standard queries), **Dataset publishers (table)**,
uses the NDE Dataset Register endpoint to list publishers and their dataset counts:

```sparql
# view=table
# sparql-endpoint=https://datasetregister.netwerkdigitaalerfgoed.nl/sparql
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX schema: <https://schema.org/>

select ?publisher
       (sample(?pn) as ?publisherName)
       (sample(?dataset) as ?exampleDataset)
       (sample(?t) as ?exampleTitle)
       (count(distinct ?dataset) as ?datasetCount)
where {
  ?dataset a dcat:Dataset ;
    schema:subjectOf ?registration ;
    dct:title ?t ;
    dct:publisher ?publisher .

  ?registration schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .

  ?publisher foaf:name ?pn .
}
group by ?publisher
order by desc(?datasetCount)
limit 100
```

```ts
import { createTableRenderer } from '@ldforge/renderers';
const renderers = [createTableRenderer()];
// Pass renderers to createEditor().
```

### Sorting, filters and large results

Click a column heading to sort ascending, then descending. Sorting uses a locale-aware
numeric text comparison (not RDF datatype arithmetic); the original result is never
mutated. Search all columns or combine case-insensitive per-column substring filters.
The caption reports the filtered and original counts. These operations use only the
loaded result; they do not fetch additional endpoint pages or alter CSV downloads.

By default the table displays **all loaded rows at full height**, with wrapped
values and no inner vertical scrollbar. The editor result-panel height cap does
not apply to tables. Horizontal overflow remains contained. Other renderer views
keep their own sizing; leaving the table restores the shared panel's styles.

Opt into a bounded, vertically scrolling table with the API:

```ts
createTableRenderer({
  scroll: true, // Default: false (full table).
  viewportHeight: 480, // Pixels; positive finite number, minimum 120.
  virtualizeThreshold: 500, // Only applies when scroll is true.
});
```

Or configure the active query, including through the Plugin wizard:

```sparql
# view=table; table-scroll=true; table-height=480
SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 1000
```

`table-scroll=true|false` overrides the host's `scroll` default; `table-height`
overrides `viewportHeight` and only constrains the table in scroll mode. Invalid
query options show a warning and fall back to host defaults. Heights below 120
pixels are clamped to 120. Use `table-scroll=false` to expand a table even if the
host enables scrolling by default.

In scroll mode, results above `virtualizeThreshold` use a bounded number of DOM
rows and spacer rows. Virtualized rows have a fixed height and visually truncate
long values. All loaded rows remain searchable and sortable, but only rendered
rows appear in the accessibility tree. Open URI details or use JSON/CSV for full
values. Full-height mode does not virtualize; for very large results, opt into
scroll mode or limit the query. All bindings remain in memory in either mode.

### Resource inspector

The information buttons beside URIs open an inline panel with outgoing properties and incoming references.
Click related URIs to continue exploring; Close or Escape returns focus to the
original table button. Graph results use matching local triples first. SELECT
results require a host loader for additional properties; without one the panel
shows the URI and an empty-data message. HTTP(S) resources also have an explicit
external link. Resource IRIs are never automatically fetched as web pages.

```ts
import { createTableRenderer, createResourceLoader } from '@ldforge/renderers';
createTableRenderer({ loadResource: createResourceLoader(executor) });
```

`createResourceLoader(executor)` uses the host's query executor with a cancellable
CONSTRUCT query for outgoing and incoming triples, limited to 200 triples. It rejects
IRIs containing SPARQL delimiters. The host retains endpoint/authentication policy.
The demo connects this loader to its active connection. In fixture mode the returned
graph is demonstration data, not an actual endpoint lookup.

For other views, `createResourceInspector(container, { locale, graph?, loadResource? })`
returns `{ element, open(term), close(), destroy() }`. Append `element` to the host,
call `open` with a URI term, and call `destroy` during cleanup. A custom
`ResourceLoader` receives `(iri, signal)` and returns a `Promise<QueryResult>` with
a graph. Errors appear in the panel; closing, navigating and cleanup abort stale
requests and prevent late responses from changing the panel.

### Column widths

By default, every result column gets `100 / n` percent of the table width. Fixed
table layout and wrapping prevent a long RDF literal or URI from squeezing the
other columns. This also applies to the subject/predicate/object columns of
CONSTRUCT and DESCRIBE results.

```sparql
# view=table; columns=40%,40%,20%
DESCRIBE <https://n2t.net/ark:/72166/dataset>
```

`columns` is the canonical directive; `colums` is accepted as a legacy spelling.
Supply exactly one positive percentage per result column, totaling 100. Invalid
or mismatched query widths show a localized warning and use equal widths while
retaining the result data. If both spellings occur, `columns` takes precedence.
The Plugin wizard offers this field and reads either spelling from existing
queries; applying its header writes the canonical `columns` key.

```ts
createTableRenderer({ columnWidths: [40, 40, 20] });
```

`TableRendererOptions.columnWidths` supplies default percentages in result-variable
order. Invalid host percentages throw at construction; a column-count mismatch
falls back to equal widths at render time with a warning. Query widths override
host defaults. No arbitrary CSS values are accepted as widths.

### RDF details

Table defaults to readable lexical values. The **RDF details** (**RDF-details**)
toggle adds RDF notation: `<https://example.org>` for IRIs, `_:b1` for blank nodes,
`"Hallo wereld"@nl` for language-tagged literals, and `"42"^^xsd:integer` for typed
literals. Plain literals are quoted and unbound cells remain empty. Datatypes and
language tags use smaller superscript in the active theme's muted color; the full
original datatype IRI is available in the tooltip. XML Schema and RDF datatype
IRIs are abbreviated as `xsd:` and `rdf:`; other datatype IRIs are shown in full.
These display prefixes are predefined and do not depend on query prefix declarations.

```ts
createTableRenderer({ showRdfDetails: true }); // Default: false.
```

The exact lexical string, datatype and language from the endpoint are preserved;
no numeric/date conversion is performed. For example, a long integer remains
`"9223372036854775807"^^xsd:long`, and a float remains `"3.14"^^xsd:float` if those
are the endpoint's returned terms. The table cannot recover values or datatypes
that an endpoint has already converted. Quotes, newlines and backslashes are escaped
for display; RDF text is never interpreted as HTML.

The toggle choice is retained per result container for the renderer instance,
including rerenders and view switches. Other editor instances remain independent.
Changing it preserves filters, sort order, virtual scrolling and expanded resource
information. Filters, sorting, CSV downloads and the result model continue using
the original lexical values.

### Local DESCRIBE example

The demo's **DESCRIBE-voorbeeld** explicitly selects local example data (no
endpoint) and loads:

```sparql
DESCRIBE <https://n2t.net/ark:/72166/dataset>
```

The URI is used as the subject of a small, clearly labeled local demonstration
graph. These are fixture triples, not a fetched description of the actual dataset.
The same query can be run manually against
`https://datasetregister.netwerkdigitaalerfgoed.nl/sparql` for live data. All four
basic examples (SELECT, CONSTRUCT, ASK, DESCRIBE) reset the active connection to
local fixtures, even after a live example or manually configured endpoint. The
demo fixture is deterministic and is not a general SPARQL engine. Every example
explicitly declares either its endpoint or no endpoint; visual plugin examples
continue to select their own public service.

## Boolean

**Package:** `@ldforge/renderers` · **Factory:** `createBooleanRenderer()` · **ID:** `boolean`

Displays an ASK result as a compact True/False badge, translated to Waar/Onwaar in Dutch. The underlying boolean value is unchanged; CSV always uses `true` or `false`.

**Binding contract:** supports `kind: 'boolean'` only. There are no named bindings. SELECT results, including SELECT expressions returning boolean literals, belong to the Table or JSON renderer instead.

```sparql
ASK { ?subject ?predicate ?object }
```

```ts
import { createBooleanRenderer } from '@ldforge/renderers';
const renderers = [createBooleanRenderer()];
```

## JSON

**Package:** `@ldforge/renderers` · **Factory:** `createJsonRenderer()` · **ID:** `json`

Displays formatted JSON in a read-only CodeMirror editor with syntax highlighting and line numbers. This is LDForge's normalized `QueryResult` model, rather than the endpoint's raw JSON response. Literal text is never interpreted as HTML. The Copy JSON button copies the complete result, including content outside the visible viewport, and briefly shows a checkmark and confirmation. Clipboard failures appear beside the button. The renderer cleans up its CodeMirror instance and feedback timer when the view is closed; query-editor height settings do not change this result view.

**Binding contract:** supports `kind: 'bindings'`, `kind: 'boolean'` and `kind: 'graph'`. There are no required variable names. SELECT variables, RDF types, datatypes, language tags and unbound fields retain their normalized representation.

```ts
import { createJsonRenderer } from '@ldforge/renderers';
const renderers = [createJsonRenderer()];
```

## Register plugins

```ts
import { createEditor } from '@ldforge/editor';
import {
  createTableRenderer,
  createBooleanRenderer,
  createJsonRenderer,
} from '@ldforge/renderers';

// Inside your createEditor() options:
const renderers = [
  createTableRenderer(),
  createBooleanRenderer(),
  createJsonRenderer(),
];
```

Registration order controls tab order. The current renderer stays selected for a new result when it still supports that result. Switching views cleans up the previous renderer before mounting the next one. Instances are isolated per editor.

## Document your own plugin

A third-party renderer uses the same `ResultRendererPlugin` contract. Add `icon` for tab artwork and `documentationUrl` for its usage guide. The selected view's book icon opens that URL in a new tab, preserving the query. Use an absolute HTTP(S) URL for a separately hosted guide, or a relative URL resolved against the application's document URL. Other URL schemes and invalid URLs are omitted.

```ts
import { createSvgIcon } from '@ldforge/core';
import type { ResultRendererPlugin } from '@ldforge/core';

const countRenderer: ResultRendererPlugin = {
  id: 'my-project.count',
  label: { en: 'Count', nl: 'Aantal' },
  icon: createSvgIcon(['M5 5h14M5 12h14M5 19h14']),
  documentationUrl: 'https://your-project.example/plugins/count',
  supports: (result) => result.kind === 'bindings',
  render(container, result) {
    if (result.kind === 'bindings')
      container.textContent = String(result.bindings.length);
  },
};
```

The built-in factories link to this guide on `https://ldforge.nl/plugins.html`. The hosted demo overrides those URLs with its local Plugins page, so links continue to work on your own domain or under a subdirectory. Hosts can replace `documentationUrl` by spreading an existing plugin object. Set `controls.rendererDocumentation: false` to hide the book icon; `controls.download: false` hides CSV export separately.

### Binding contracts for future plugins

When adding a plugin that interprets particular variables, its documentation must specify:

- Required and optional binding names, including exact spelling and case.
- Accepted RDF term types, datatypes, units and supported result kinds.
- Handling of missing, unbound, duplicate or invalid values, and any ordering/grouping rules.
- A complete SPARQL query using aliases such as `SELECT (?source AS ?requiredName)` where necessary.
- Any external services, resources or host configuration needed for rendering.

Explain validation failures in the renderer rather than silently guessing a different binding. Link the plugin to the relevant section with `documentationUrl`. See the [Plugin API](api/plugins.md) for icon factories, cleanup and rendering contracts, or the [Integration guide](../apps/demo/guide.html) for embedding examples.

## Tree

Register `createTreeRenderer()` from the optional `@ldforge/tree` package in `renderers`. No visualization dependency is required. See the [package README](https://github.com/mightymax/ldforge/tree/main/packages/tree#readme) for installation and host integration.

### Binding contract

SELECT results must declare `tree_id`; rows without a valid ID are skipped and counted in the diagnostic. No parent or label columns are required.

| Binding       | Meaning                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tree_id`     | Required nonempty URI or stable literal identifier. Blank nodes and whitespace-only values are rejected.                                                |
| `tree_parent` | Optional identifier using exactly the same matching rules. An unbound/invalid parent makes the row a root candidate. Invalid bound parents are counted. |
| `tree_label`  | Optional nonempty term value displayed as text; defaults to the original identifier value.                                                              |
| `tree_url`    | Optional absolute HTTP(S) term value; all other schemes and relative URLs are ignored. No automatic dereferencing.                                      |

Matching is exact and case-sensitive on lexical values, with URI and literal identities kept separate. No trimming, URL normalization, prefix expansion or numeric coercion is applied to IDs. Literal identity includes datatype and lowercased language tag. Plain literals and `xsd:string` match; `literal` and legacy `typed-literal` with the same datatype match. Language literals default to `rdf:langString`. The original ID term is preserved independently of the label and URL; for equivalent term encodings the first original term is retained.

Repeated IDs merge; repeated parent/child edges merge. Conflicting nonempty labels and valid URLs use the lexicographically smallest value (UTF-16 order), independent of result row order. Sorting uses the serialized identity key, not the label or browser locale. Missing parents are omitted, counted once per missing identifier, and their children become root candidates unless they also have a present parent.

### Shared children, cycles and large results

A deterministic iterative depth-first spanning forest assigns each resource one expandable occurrence. Start with sorted root candidates, then start any still-unvisited components at their smallest remaining key. A candidate already reached from another root stays there. Other incoming edges appear as terminal **(reference)** occurrences with the same original ID, link and inspector action. This avoids exponentially repeated subtrees. References do not expand or jump to another occurrence.

Back edges are counted under **Cycles** and rendered as references. This count is a diagnostic, not the number of all mathematical cycles. Cyclic-only datasets therefore remain visible, including self loops; no traversal or rendering uses recursive calls.

All branches start collapsed. Expanding creates only the visible rows; collapsing removes descendants. Rendering is O(visible nodes + visible edges), and the model is O(nodes + edges) after key sorting. This is lazy branch rendering, not viewport virtualization: a very wide expanded branch still creates every immediate child. Input results remain in memory. Indentation is capped visually after 30 levels while ARIA levels retain full depth.

### Options, accessibility and lifecycle

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

### Runnable local SKOS example

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

### Optional live SKOS example: Getty AAT

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
