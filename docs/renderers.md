# Plugins

LDForge result renderers turn normalized SELECT, ASK or RDF graph results into independent views. Choose a view through the icon tabs below the query editor. Only plugins supporting the current result appear. The download button always exports the complete result as CSV.

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

This query works without a dataset because it uses VALUES. Replace the image and destination URLs with your own. The demo's **Cards example** uses local sample images and a deterministic fixture, so it also works without an endpoint.

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

## Query headers

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

**Package:** `@ldforge/renderers` · **Factory:** `createTableRenderer()` · **ID:** `table`

Displays SELECT bindings or CONSTRUCT/DESCRIBE triples as a table. Graph results use subject/predicate/object columns. Column order follows the SELECT variable order, rows follow the endpoint's result order, and unbound values produce empty cells. RDF values are rendered as text, including URL-like values. Datatype and language information appear in cell tooltips. The table caption and result count follow the editor language.

**Binding contract:** supports `kind: 'bindings'` and `kind: 'graph'`. No special variable names are required: `?resource`, `?label`, `?price` or any other SELECT variables become columns. SELECT aliases determine the displayed column names.

```sparql
SELECT ?resource ?label WHERE {
  ?resource <http://www.w3.org/2000/01/rdf-schema#label> ?label .
  FILTER (lang(?label) = "en")
}
LIMIT 20
```

```ts
import { createTableRenderer } from '@ldforge/renderers';
const renderers = [createTableRenderer()];
// Pass renderers to createEditor().
```

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

Displays formatted JSON for debugging and inspecting RDF term metadata. This is LDForge's normalized `QueryResult` model, rather than the endpoint's raw JSON response. Literal text is never interpreted as HTML.

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
