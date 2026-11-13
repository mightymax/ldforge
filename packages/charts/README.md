# @ldforge/charts

Optional LDForge result renderer for bar, line, pie and doughnut charts. The small plugin adapter depends only on `@ldforge/core`. Chart.js is not bundled or installed as a runtime dependency: the plugin imports a pinned external ESM module only when its result tab is activated.

```sh
npm install @ldforge/charts
```

```ts
import { createChartRenderer } from '@ldforge/charts';
const renderers = [createChartRenderer()];
// Pass renderers to createEditor().
```

Use `?chart_label`, numeric `?chart_value`, and optional `?chart_series`. Put these comments before your query:

```sparql
# view=charts; chart=bar; chart-title=My chart
SELECT ?chart_label ?chart_value WHERE {
  VALUES (?chart_label ?chart_value) { ("A" 10) ("B" 20) }
}
```

Default library URL: `https://cdn.jsdelivr.net/npm/chart.js@4.6.1/auto/+esm`. The host must permit that origin in its content security policy and have network access when first activating a chart. Set `libraryUrl` to your own HTTP(S) ESM URL, or inject a self-hosted lazy loader:

```ts
// With chart.js installed in the host application:
createChartRenderer({ loadLibrary: () => import('chart.js/auto') });
```

The latter allows bundlers to emit a separate local chunk; it still defers download until activation, but includes Chart.js in the application's build output. No mandatory CDN requests occur if you supply your own loader. Renderers immediately return cleanup functions and discard late module completions after tab changes. Each active chart is destroyed on cleanup.

See the [full chart guide](https://github.com/mightymax/ldforge/blob/main/docs/renderers.md#charts) for binding contracts, validation, duplicate aggregation, accessibility, module-loader API and deployment details. LDForge code is EUPL-1.2; Chart.js is independently MIT licensed.
