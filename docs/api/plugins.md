# Plugin objects

Plugins are trusted host code, registered per editor instance. IDs must be unique and non-empty within each category. Recreate an editor to change result/settings plugin registration. Toolbar actions can also be added, moved, updated or deleted through the [Toolbar API](toolbar.md).

## ButtonPlugin

| Property     | Type                                                | Description                                                                                                        |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`         | `string`                                            | Required identifier. run and cancel are reserved IDs for built-in controls.                                        |
| `label`      | `LocalizedText`                                     | String or `{ en: string, nl: string }`.                                                                            |
| `group`      | `string?`                                           | Controls grouping inside project actions. Groups follow first registration; buttons preserve order within a group. |
| `icon`       | `PluginIcon?`                                       | Decorative icon before the label. Existing plugins can omit it.                                                    |
| `title`      | `LocalizedText?`                                    | Optional tooltip.                                                                                                  |
| `isDisabled` | `(context: EditorContext) => boolean`               | Pure synchronous predicate, evaluated on edits and execution state updates.                                        |
| `execute`    | `(context: EditorContext) => void \| Promise<void>` | Action. Rejections are shown in editor status.                                                                     |

`createRunButton()` and `createCancelButton()` are exported by `@ldforge/editor`. Built-in tools occupy their own icon group; custom actions are separated visually and structurally.

## EditorContext

The context passed to actions/settings is the active-query subset of `ForgeEditor`: `getQuery`, `setQuery`, `formatQuery`, `addPrefix`, `getState`, `run`, `cancel`, `getLocale`, and `setLocale`. Toolbar access, tab collections, mounting and destruction are on the host's `ForgeEditor` handle. See [Editor](editor.md) for method semantics. `formatQuery` returns a promise and must be returned or awaited by an action.

## ResultRendererPlugin

| Member                                | Type                   | Description                                                                                                                                                                                            |
| ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`, `label`                         | string / LocalizedText | Identity and visible result-tab label.                                                                                                                                                                 |
| `icon`                                | `PluginIcon?`          | Optional decorative tab icon.                                                                                                                                                                          |
| `documentationUrl`                    | `string?`              | HTTP(S) or relative usage-guide URL. The selected result view exposes a book-icon link, opening a new tab. Invalid URLs and other schemes are hidden. Relative URLs resolve against the host document. |
| `supports(result)`                    | `boolean`              | Whether this renderer can display the result.                                                                                                                                                          |
| `render(container, result, context?)` | `void \| (() => void)` | Synchronous render. Optional context is `ResultRendererContext` (see below). Return cleanup for listeners or framework roots.                                                                          |

Only supported renderers appear in the result tabs, in registration order. Tabs retain the selected renderer across successful queries when it still supports the result, otherwise the first supported renderer is selected. Arrow keys wrap between tabs; Home/End select the first/last tab. Only the selected tab is in the normal Tab sequence. Labels remain visible and accessible with or without icons. The previous renderer is cleaned up before another view/state is rendered or the editor is destroyed. Render RDF with `textContent`, not HTML. Renderer-owned asynchronous work must be cancelled in its cleanup function.

Use `documentationUrl` to describe required bindings, accepted term types, configuration and complete example queries. The built-in renderers link to their usage guides on `https://ldforge.nl/plugins.html`; the demo overrides these links to its local Plugins page. Existing plugins without a URL show no documentation control. Set `controls.rendererDocumentation: false` to hide it globally.

## ResultRendererContext and QueryViewDirectives

`ResultRendererContext` is exported by core and re-exported as a type by the editor. It contains `locale: Locale`, optional `query: string` and optional `directives: QueryViewDirectives`. The IDE always supplies the exact executed query and parsed leading comment headers. The fields are optional so direct renderer calls supplying only a locale continue to work.

`QueryViewDirectives` is a readonly map of string keys to `string | undefined`, with optional `view` and `css` properties. Core's `parseQueryViewDirectives(query)` reads the leading comment block and returns a frozen map. Plugin settings can share a semicolon-separated line, such as `# view=charts; chart=bar; chart-title=Example city populations`. CSS must occupy its own `# css=...` line so its declaration separators are preserved. The editor applies `view` once per successful execution if a supported registered renderer has that ID. Manual tab switching remains available. CSS and custom keys are interpreted by individual plugins, never injected globally by the editor. See the [query header and Cards guide](../../docs/renderers.md) for syntax, supported CSS and examples.

## PluginIcon and createSvgIcon

`PluginIcon` is exported by `@ldforge/core` and re-exported as a type by `@ldforge/editor`:

```ts
type PluginIcon = (document: Document) => SVGElement | HTMLElement;
```

Return a **fresh node** for each call, using the supplied document. A factory can be called again when results, actions or language change. It must be synchronous and should not register listeners or allocate resources requiring cleanup. The editor marks the artwork `aria-hidden="true"` and nonfocusable; the control label supplies its accessible name. Use `currentColor` to match active, disabled and theme colors. Do not return interactive children.

Core's `createSvgIcon(paths: readonly string[]): PluginIcon` builds an 18px outline SVG with a 24×24 view box, rounded strokes and no HTML parsing. You can also return artwork from your existing icon system; no icon library is required by LDForge.

```ts
import { createSvgIcon } from '@ldforge/core';
import type { ResultRendererPlugin } from '@ldforge/core';

const renderer: ResultRendererPlugin = {
  id: 'my-project.count',
  label: { en: 'Count', nl: 'Aantal' },
  icon: createSvgIcon(['M5 5h14M5 12h14M5 19h14']),
  supports: (result) => result.kind === 'bindings',
  render(container, result) {
    if (result.kind === 'bindings')
      container.textContent = String(result.bindings.length);
  },
};
```

The same `icon` property works on `ButtonPlugin`. Run and Cancel include icons by default and retain their text labels. Icons do not change execution, disabled state, plugin grouping or cleanup semantics.

## SettingsPlugin

| Member                             | Type                   | Description                                                                        |
| ---------------------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| `id`, `label`                      | string / LocalizedText | Identity and panel heading.                                                        |
| `render(container, context)`       | `void \| (() => void)` | Mount once inside the gear panel and optionally return cleanup.                    |
| `updateLocale(container, context)` | `void`                 | Optional label refresh. Preserve input values and avoid registering new listeners. |

Settings plugins are not mounted when `controls.settings` is false. They are cleaned up during destruction. The host is responsible for their state and transport integration. See `apps/demo/src/endpoint-settings.ts` in the repository for a working example.

## PluginRegistry

The generic `PluginRegistry<T extends { id: string }>` is exported by core. Construct it with an optional ordered list; `register(plugin)` returns an unregister function; `list()` returns an ordered array snapshot. Duplicate and blank IDs throw. It is independent of editor mounting and does not dynamically update an already mounted IDE.

## Wizard metadata

A result renderer can declare optional `wizard: RendererWizardSchema` metadata.
It belongs to the plugin: the editor has no global catalogue of unregistered
renderers. Schemas are plain data and do not load visualization libraries.

```ts
const wizard = {
  description: {
    en: 'Requires SELECT bindings.',
    nl: 'Vereist SELECT-bindings.',
  },
  bindings: [
    {
      variable: 'value',
      required: true,
      description: { en: 'Numeric value', nl: 'Numerieke waarde' },
    },
  ],
  options: [
    {
      key: 'my-title',
      label: { en: 'Title', nl: 'Titel' },
      type: 'text',
      defaultValue: '',
    },
    {
      key: 'my-mode',
      label: 'Mode',
      type: 'select',
      defaultValue: 'bar',
      choices: [{ value: 'bar', label: 'Bar' }],
    },
  ],
} satisfies import('@ldforge/core').RendererWizardSchema;
// Add wizard to a ResultRendererPlugin descriptor.
```

`RendererBindingContract` has `variable` (without `?`), optional `required`, and a
localized `description`. `RendererWizardOption` has a lowercase directive `key`,
localized `label`, `type: 'text' | 'select'`, optional `aliases` for legacy query keys, optional `defaultValue` and select
`choices` (`value`/localized `label`). Omitted select defaults use their first
choice. Empty option values are omitted from the header. `view` and `css` are
reserved. Values are quoted/escaped for header parsing; multiline values and
unknown options/choices are rejected. A schema's optional description becomes a
localized comment alongside its binding declarations. These types are exported
from core and re-exported by editor.

## State-dependent button presentation

Optional `ButtonPlugin.getLabel(context)`, `getTitle(context)` and `getIcon(context)`
callbacks override their static counterparts when toolbar state refreshes. The
built-in Run factory uses these to become **Stop query** while running, without
being disabled. `createCancelButton()` remains available as an explicit secondary
action. The `icon` property already works on both buttons and `ButtonGroupOptions`;
the demo's Examples dropdown uses a decorative book icon.
