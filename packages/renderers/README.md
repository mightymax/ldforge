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

The table includes column sorting, global and per-column filters, and virtual scrolling
above 500 rows. URI buttons open a reusable resource inspector. Pass
`loadResource: createResourceLoader(executor)` for endpoint-backed properties; graph
results can use their own triples. See the [table guide](../../docs/renderers.md#table)
for options, lifecycle, accessibility and limitations.
