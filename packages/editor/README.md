# @ldforge/editor

An embeddable CodeMirror 6 SPARQL IDE with one editor view, virtual query tabs, NL/EN localization, syntax diagnostics, contextual completion and automatic PREFIX insertion. Includes independent action, result and settings plugins.

```sh
npm install @ldforge/editor @ldforge/core @ldforge/renderers @ldforge/prefixes
```

```ts
import { createEditor } from '@ldforge/editor';
import { createHttpExecutor } from '@ldforge/core';
import { createTableRenderer, createBooleanRenderer } from '@ldforge/renderers';
import '@ldforge/editor/styles.css';

const element = document.querySelector<HTMLElement>('#editor');
if (!element) throw new Error('Missing editor container');
const editor = createEditor(element, {
  executor: createHttpExecutor({
    endpoint: 'https://your-endpoint.example/sparql',
  }),
  query: 'select * where {?s ?p ?o} limit 10',
  controls: { prefixes: true, format: true, settings: true },
  renderers: [createTableRenderer(), createBooleanRenderer()],
});

const tabs = editor.getTabs();
const other = tabs.addTab({
  name: 'People',
  query: 'ask {?s ?p ?o}',
  prefixes: ['sdo', 'dct'],
});
await other.formatQuery();
other.addPrefix('ex', 'https://example.org/');
// editor.destroy() on host unmount.
```

## Collapsible prefixes

Click the gutter arrow beside PREFIX declarations to collapse or expand them.
Set `prefixesCollapsed: true` to start collapsed, or call
`editor.setPrefixesCollapsed(true)`, `editor.setPrefixesCollapsed(false)`,
`editor.togglePrefixes()` and `editor.arePrefixesCollapsed()` at runtime.
`controls.prefixFolding: false` hides gutter arrows while retaining the API.
Folding only changes presentation: execution and saved query text stay complete.
See [ForgeEditor](docs/api/editor.md#collapsible-prefix-declarations) for tab and
persistence behavior.

## API reference

The full object-based reference is included in the npm package and rendered by the demo site:

- [Configuration and every control default](docs/api/configuration.md)
- [Toolbar, reusable buttons and dropdown groups](docs/api/toolbar.md)
- [ForgeEditor lifecycle and methods](docs/api/editor.md)
- [TabCollection and serializable workspaces](docs/api/tabs.md)
- [QueryTabHandle properties and functions](docs/api/tab.md)
- [Prefixes and low-level language tools](docs/api/prefixes.md)
- [Plugin contracts](docs/api/plugins.md)
- [Transport and results](docs/api/transport.md)

Formatting returns a promise and loads its parser/printer on demand. Inactive tab operations do not allocate another editor view. Persistence is host-owned through onWorkspaceChange. controls only changes visibility; it does not disable public API methods. License: EUPL-1.2.

## Plugin wizard

The **Plugin wizard** icon is enabled by default in the right toolbar. It offers
only registered renderers and builds a query header with their options and binding
contract comments. Hide it with `controls.rendererWizard: false` or
`editor.getRendererWizard().setVisible(false)`. Use `generate()` for a header
without editing, or `apply()` to update the active query. See the
[API and preservation rules](docs/api/editor.md#plugin-wizard) and
[renderer-owned wizard metadata](docs/api/plugins.md#wizard-metadata).

## Query execution and appearance

Run becomes Stop while a query is pending. A result-area spinner is enabled by
default; disable it with `controls.loadingIndicator: false` or
`editor.setLoadingIndicatorEnabled(false)`. A separate Cancel button is optional.

The gear panel offers query-text size controls (10–24 px, default/reset **12 px**).
Only CodeMirror text changes; toolbar/settings/results fonts stay unchanged. Use
`fontSize`/`onFontSizeChange` and `getFontSize()`/`setFontSize(size)` in hosts. The
demo persists the choice in localStorage. `controls.fontSize: false` hides the field.

Configure `themeMainColor: "#1a80b9"` for a coordinated instance theme, or call
`editor.setThemeMainColor(color)` at runtime (omit the argument to reset). Opaque
`#RGB`/`#RRGGBB` colors are supported. Plugins inherit the documented
[theme CSS variables](../../docs/api/editor.md#theme-colors).

## Query editor height

Configure `editorRows: 15, autoGrow: false` for a fixed viewport that scrolls when
the query exceeds 15 visual lines. `autoGrow: true` grows with the query, using
`editorRows` as its minimum height. Defaults are 15 rows and auto-grow enabled;
the demo explicitly disables auto-grow and remembers the checkbox preference.

Drag the handle below the query editor to change its height. It switches to a
fixed scrolling viewport and updates `editorRows`. The focused handle also accepts
Arrow Up/Down (one row), Shift+Arrow Up/Down (five rows) and Home (one row).
Set `controls: { resizeEditor: false }` to hide it. The demo remembers the chosen
row count as well as the auto-grow preference.

The gear panel includes a **Show the full query** checkbox. Set
`controls: { autoGrow: false }` to hide it. Runtime methods are
`getEditorRows()`, `setEditorRows(rows)`, `isAutoGrowEnabled()` and
`setAutoGrow(enabled)`. Optional `onEditorRowsChange` and `onAutoGrowChange`
callbacks support host-owned persistence. Row counts must be positive safe integers.
These settings affect query tabs, leaving JSON and other result renderers alone.
See the [configuration guide](https://github.com/mightymax/ldforge/blob/main/docs/api/configuration.md#query-editor-height).

## Result view presentation

By default, registered Table and JSON views stay on the bar. The active renderer
is also visible, with remaining plugins in Choose view. Unsupported choices are
disabled; information buttons show each dropdown plugin's `wizard.bindings` and
description. This uses the same public metadata for built-in and third-party plugins.
Query-header requests for unsupported renderers show a warning with any missing
required bindings declared by the plugin.

Set `availablePlugins: false` to hide the dropdown, or `visiblePlugins: ['table',
'json', 'geo']` to pin additional registered views. Runtime methods are
`showAvailablePlugins()`, `hideAvailablePlugins()`, `showPlugin(idOrPlugin)` and
`hidePlugin(idOrPlugin)`. Presentation changes preserve the selected view and do
not remount the result or execute queries. An explicit visiblePlugins array
replaces the defaults; unknown plugin IDs are rejected. See the
[API guide](docs/api/editor.md#result-plugin-visibility).

Variable completion searches the entire query, so typing `?` in `SELECT` also suggests variables used later in `WHERE`. It respects subquery projections and ignores variables inside comments, strings and IRIs. Type a variable name to filter the suggestions; use Ctrl+Space to request completion explicitly.
