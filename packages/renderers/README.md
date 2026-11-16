# @ldforge/renderers

Independent Table, Cards, Boolean and JSON plugins implementing `ResultRendererPlugin`. English and Dutch labels follow the editor locale. Register only the views your application needs.

```ts
import {
  createCardsRenderer,
  createTableRenderer,
  createJsonRenderer,
} from '@ldforge/renderers';
import '@ldforge/editor/styles.css';
const renderers = [
  createTableRenderer(),
  createCardsRenderer(),
  createJsonRenderer(),
];
// Pass renderers to createEditor().
```

Cards maps `card_title`, `card_text`, `card_image`, `card_button` and `card_button_url` to one card per row. Put `# view=cards` before the query to select this view. `# css=max-width: 320px;` styles individual cards using supported declarations; set `createCardsRenderer({ allowQueryStyles: false })` to disable query styling. The button needs both a label and a valid URL. All text is rendered literally.

See the [complete renderer and binding guide](https://github.com/mightymax/ldforge/blob/main/docs/renderers.md) for queries, optional fields, URL behavior, header syntax and CSS support. See `docs/plugins.md` for custom renderers. Licensed under EUPL-1.2; see LICENSE.

## Table column widths

Table columns default to equal `100 / n` percent widths, with fixed layout and
wrapping for long RDF values. Set `createTableRenderer({ columnWidths: [40, 40, 20] })`
or add `# view=table; columns=40%,40%,20%` to the query. The spelling `colums` also
works. Use one positive percentage per column, totaling 100; query values override
host defaults. Invalid query widths show a warning and fall back to equal widths.
The Plugin wizard exposes the option for registered table renderers.

The table shows all loaded rows at full height by default, including long values,
without a nested vertical scrollbar. Sorting and global/per-column filters work in
both modes. Opt into a bounded table with
`createTableRenderer({ scroll: true, viewportHeight: 480 })`, or per query with
`# view=table; table-scroll=true; table-height=480`. The Plugin wizard exposes both
options. In scroll mode only, results above `virtualizeThreshold` (default 500)
use virtual scrolling. `table-scroll=false` overrides a host scroll default.
`viewportHeight` must be a positive finite number (minimum 120 pixels); invalid
query options show a warning and fall back to host defaults. Full-height mode
renders every row, so use scroll mode or a query LIMIT for very large results. URI buttons open a reusable resource inspector. Pass
`loadResource: createResourceLoader(executor)` for endpoint-backed properties; graph
results can use their own triples. See the [table guide](../../docs/renderers.md#table)
for options, lifecycle, accessibility and limitations.

## JSON view

JSON uses a read-only CodeMirror editor with JSON syntax highlighting and line numbers. Its copy button copies the complete normalized result, briefly showing a checkmark and confirmation after success. Clipboard failures appear beside the button. The renderer destroys its editor and clears feedback timers during cleanup.

## RDF details in Table

The **RDF details** (**RDF-details**) toggle switches between lexical values and
RDF notation: `<https://example.org>`, `_:b1`, `"Hallo wereld"@nl`, and
`"42"^^xsd:integer`. Language tags and datatypes appear in smaller superscript,
using the theme's muted text color. Standard XML Schema and RDF datatypes use
`xsd:` and `rdf:`; other datatype IRIs are shown in full. Plain literals are quoted,
and unbound cells stay empty. Endpoint lexical values are retained exactly,
including large integers, floating-point notation and timezone text.

Use `createTableRenderer({ showRdfDetails: true })` to start in this mode.
The default is false. A user's toggle choice is retained per result container for
that renderer instance, including subsequent results and view switches. It does
not affect another editor using the same plugin object. Switching keeps filters,
sorting, virtual scroll position and resource inspection. Filtering, sorting and
CSV exports continue to use original lexical values; this is presentation only.
