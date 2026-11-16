# ForgeEditor

Returned by `createEditor(container: HTMLElement, options: EditorOptions): ForgeEditor`. One handle owns one IDE, one CodeMirror view and a live collection of query tabs. The caller owns the container and calls `destroy()` before unmounting it.

## Methods

| Method                                              | Returns                           | Behavior                                                                                                                                                              |
| --------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setPrefixesCollapsed(collapsed)`                   | `void`                            | Collapses or expands every PREFIX group in the active query. Presentation only; source, execution and persistence retain every declaration. Throws after destruction. |
| `arePrefixesCollapsed()`                            | `boolean`                         | True when every PREFIX group is folded; false for expanded/partially folded queries or queries without declarations. Throws after destruction.                        |
| `togglePrefixes()`                                  | `boolean`                         | Toggles all PREFIX groups and returns the resulting collapsed state. Returns false when no declarations exist. Throws after destruction.                              |
| `getTabs()`                                         | `TabCollection`                   | The same live, indexable collection each time. Throws after destruction.                                                                                              |
| `getToolBar()`                                      | `ToolbarApi`                      | Live toolbar API for standalone buttons, adjacent groups and dropdowns. See [Toolbar](toolbar.md).                                                                    |
| `getWorkspace()`                                    | `QueryWorkspace`                  | Detached plain-data snapshot for persistence.                                                                                                                         |
| `getRenderers()`                                    | `readonly ResultRendererPlugin[]` | Registered renderers in registration order, without loading their external libraries.                                                                                 |
| `showAvailablePlugins()` / `hideAvailablePlugins()` | `void`                            | Show or hide the result renderer dropdown.                                                                                                                            |
| `showPlugin(plugin)` / `hidePlugin(plugin)`         | `void`                            | Pin or unpin a registered ID or renderer descriptor. The active renderer remains visible.                                                                             |
| `getEditorRows()` / `setEditorRows(rows)`           | `number` / `void`                 | Read or set the query viewport's positive safe-integer row count.                                                                                                     |
| `isAutoGrowEnabled()` / `setAutoGrow(enabled)`      | `boolean` / `void`                | Read or change query height mode; the Show the full query checkbox stays synchronized.                                                                                |
| `getShareLink()`                                    | `string`                          | Returns the active query URL with the selected renderer in its header, without editing.                                                                               |
| `copyShareLink()`                                   | `Promise<string>`                 | Copies the URL to the clipboard; after success, saves its renderer header in one undoable edit if the active query is unchanged. Requires browser clipboard access.   |
| `getQuery()`                                        | `string`                          | Active tab's current text.                                                                                                                                            |
| `setQuery(query)`                                   | `void`                            | Replaces active text in one undoable edit and emits host callbacks. A no-op after destruction.                                                                        |
| `formatQuery(options?)`                             | `Promise<string>`                 | Formats the tab active when called. Equivalent to `getTabs().getActive().formatQuery(options)`.                                                                       |
| `getPrefixes()`                                     | `Record<string, string>`          | Detached snapshot of explicitly declared aliases and namespaces; excludes the completion catalog.                                                                     |
| `removePrefix(prefix)`                              | `void`                            | Removes all declarations of this alias. A missing alias is a no-op.                                                                                                   |
| `addPrefix(prefix, namespace?)`                     | `string \| undefined`             | Adds to the active tab and returns the actual alias; undefined means unknown shorthand.                                                                               |
| `getState()`                                        | `QueryState`                      | Latest execution state. See [Transport and results](transport.md).                                                                                                    |
| `run()`                                             | `Promise<void>`                   | Executes active text. Resolves after the request settles; failures are recorded in state instead of rejecting. Throws/rejects if the controller is destroyed.         |
| `cancel()`                                          | `void`                            | Aborts pending work and resets execution state to idle.                                                                                                               |
| `getLocale()`                                       | `'en' \| 'nl'`                    | Resolved language for this IDE.                                                                                                                                       |
| `setLocale(preference)`                             | `void`                            | Sets user override; auto restores the project/browser default. Calls `onLocaleChange`. A no-op after destruction.                                                     |
| `focus()`                                           | `void`                            | Focuses CodeMirror. Use only while mounted.                                                                                                                           |
| `destroy()`                                         | `void`                            | Idempotent. Aborts requests, disposes result/settings resources and CodeMirror, and removes the IDE section. Does not remove the caller's container.                  |

Use a handle only while mounted. In particular, tab methods deliberately throw after destruction rather than recreating detached state. A formatting operation pending during deletion/destruction rejects without writing back.

## Formatting options

`FormatOptions` has one property: `indentSize?: number`, default `2`, an integer from `1` through `8`. Other values reject with `RangeError`.

Formatting loads its parser/printer on the first call, preserves comments and literal content, and does not execute the query. Invalid syntax rejects and leaves source text unchanged. If the target tab changes before formatting completes, it rejects instead of overwriting a newer edit. A tab switch alone is safe: the original target is formatted without forcing it active.

The toolbar icon reports a rejected format operation in the status line. API callers must handle the promise themselves.

```ts
try {
  const formatted = await editor.formatQuery({ indentSize: 4 });
  console.log(formatted);
} catch (error) {
  console.error('Formatting failed', error);
}
```

## Warnings

`EditorWarning` has readonly properties `code: 'unknown-prefix'`, `prefix: string`, and `message: string`. The default handler uses `console.warn`. Set `onWarning` to integrate host notifications. A warning does not add text or choose an invented namespace.

## Lifecycle and persistence

The library never writes localStorage itself. Pass `onWorkspaceChange` and `onLocaleChange` to store host state. The demo additionally restores the last applied endpoint and method without automatically running a query; authentication headers are deliberately not persisted.

## Collapsible PREFIX declarations

The gutter arrow beside a PREFIX group collapses its declarations into a
`PREFIX …` placeholder. Click the placeholder or arrow to expand it.
Keyboard users can fold at the cursor with Ctrl+Shift+[ and unfold with
Ctrl+Shift+] (Cmd+Alt+[ and Cmd+Alt+] on macOS).

```ts
const editor = createEditor(container, {
  executor,
  prefixesCollapsed: true, // default: false
  controls: { prefixFolding: true }, // default: true; gutter visibility only
});
editor.setPrefixesCollapsed(true);
editor.setPrefixesCollapsed(false);
const collapsed = editor.togglePrefixes();
console.log(editor.arePrefixesCollapsed());
```

These methods target the active tab. Each tab remembers its expanded/collapsed
preference during this editor's lifetime; a newly opened tab uses
`prefixesCollapsed`. Partial manual folds are expanded when returning to that
tab. Fold state is not part of `QueryWorkspace`, is not saved to localStorage,
and resets to configuration after recreating the IDE. Hiding the gutter leaves
the API and keyboard shortcuts available.

Only parsed, complete PREFIX declarations are grouped. Comments and blank lines
between them can fold with the group; BASE declarations and executable query text
are never hidden by the PREFIX API. Separate PREFIX groups fold independently in
the gutter; the API operates on all of them. With no declarations, toggling is a
no-op returning false. Folding never changes query text, undo history, results,
or `onQueryChange`/`onWorkspaceChange` callbacks. Executing, copying with
`getQuery()` and saving `getWorkspace()` always use the complete query.

## Plugin wizard

The icon-only **Plugin wizard** control is shown by default in the right toolbar.
Set `controls.rendererWizard: false` (or `controls: false`) to hide it. This hides
only the entry point; the API remains available.

```ts
const registered = editor.getRenderers(); // exactly the plugins passed in renderers
const wizard = editor.getRendererWizard();
wizard.setVisible(false);
wizard.setVisible(true);
wizard.open();
wizard.close();
const header = wizard.generate({
  rendererId: 'charts',
  options: { chart: 'bar', 'chart-title': 'My chart' },
  includeBindings: true,
}); // no query mutation
wizard.apply({ rendererId: 'geo', options: { mode: '3d' } });
```

`RendererWizardApi` exposes readonly `isVisible`, `isOpen`, `getRenderers()`,
`generate(config)` and `apply(config)` plus the methods above. `RendererHeaderConfig`
requires `rendererId`, with optional string-valued `options` and `includeBindings`
(default true). Only registered IDs and declared options are accepted. Methods
throw after editor destruction. No renderer imports or visualization downloads
occur when listing plugins or using the wizard.

The three steps select a registered renderer, configure its declared header
options, and preview a copyable header before choosing **Apply to query**.
Closing the wizard leaves the query unchanged. Applying uses a single query edit
and never runs the query. The UI checks that the active query tab did not change
while the dialog was open. Programmatic `apply()` targets the current active tab.
Existing leading renderer directives and generated `ldforge-bindings:start/end`
comments are replaced. Query body, unrelated comments, unknown host metadata and
`# css=...` lines are retained. Repeated application does not duplicate a contract.
Binding comments describe required variables; they do not rewrite SELECT bindings
or validate whether the query will return the required result.

`editor.getRenderers()` and `wizard.getRenderers()` return readonly lists of the
registered `ResultRendererPlugin` objects in registration order, including their
optional `wizard` metadata. Here “available” means registered, not whether a lazy
external visualization library has already downloaded. Plugins without metadata
remain selectable with a view-only header; the UI explains that no contract or
options have been declared.

## Run/Stop, loading and query text size

The default action is a combined Run/Stop button. It displays **Run query** when
idle and **Stop query** with a stop icon while executing. Stopping aborts the
pending request and restores the Run action. Hosts may explicitly add
`createCancelButton()` if they want an additional Cancel action.

A spinner appears in the result area during execution and disappears on success,
error or cancellation. Set `controls.loadingIndicator: false`, or use:

```ts
editor.setLoadingIndicatorEnabled(false);
editor.setLoadingIndicatorEnabled(true);
const enabled = editor.isLoadingIndicatorEnabled();
editor.setFontSize(16); // CodeMirror only, integer 10–24
const size = editor.getFontSize();
```

The text-size field is under the gear button; default and Reset are 12 px. The
host can supply `fontSize` and `onFontSizeChange` for persistence. The demo uses
localStorage. Text-size and spinner API methods throw after editor destruction.

## Inspecting and removing prefixes

Declarations are parsed structurally: PREFIX-like text in comments, literals and
IRIs is ignored. With duplicate alias declarations, the last declaration wins in
the snapshot; removal deletes all declarations of that alias. The empty string
addresses the default prefix. Namespaces are returned as written inside the IRI
brackets, without resolving BASE or decoding escapes.

Removal deletes the whole line, including its line ending, when a declaration
is alone on that line. On shared lines it removes only the declaration, retaining
comments and other statements. Existing blank separator lines and the query body
are preserved. Uses of the removed alias are left intact, so the query may need a
replacement declaration before execution. Active edits participate in undo/redo
and emit the normal query/workspace callbacks. Inactive tab edits emit only the
workspace callback and never select the tab. As with other tab edits, inactive
tabs store text only; undo history resets on tab switches. Manual edits and tab
switches invoke the normal callbacks, where hosts can read a fresh snapshot.

```ts
const tab = editor.getTabs().getActive();
const declared = tab.getPrefixes();
if (declared.ex !== undefined) tab.removePrefix('ex');
else tab.addPrefix('ex', 'https://example.org/');
console.log(editor.getPrefixes()); // Current active query declarations.
```

## Theme colors

`EditorOptions.themeMainColor?: string` sets an instance's main color. Supply an
opaque hex color (`#RGB` or `#RRGGBB`); names, alpha colors, CSS expressions and
other formats throw `TypeError`. Validation occurs before mounting, and invalid
runtime changes leave the current theme intact. No additional dependencies load.

```ts
const editor = createEditor(container, {
  executor,
  themeMainColor: '#1a80b9',
});
editor.setThemeMainColor('#743ca6');
console.log(editor.getThemeMainColor()); // Last configured value, or undefined.
editor.setThemeMainColor(); // Restore the existing stylesheet/host CSS theme.
```

`getThemeMainColor(): string | undefined` and
`setThemeMainColor(color?: string): void` throw after destruction. Changing a
theme never changes query text, history, execution, or persistence callbacks.
Hosts own persistence. Multiple editors can use different colors on one page.

With no option, the existing green styling is retained. A supplied color derives
light surfaces, borders, hover/selected backgrounds, focus and text colors on the
editor root. Filled actions use the exact main color and whichever of black or
white has the higher contrast (at least 4.5:1). Accent text is darkened separately
for readability on light surfaces. This is a light UI theme; syntax colors,
semantic error/warning colors and visualization data palettes remain independent.
Host-authored result CSS and external visualization widgets may supply their own
colors.

### Shared CSS variables

Renderer/settings plugins mounted inside the editor inherit these variables,
including in the modal wizard. They update automatically after a runtime change.

| Variable                                               | Purpose                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `--ldforge-accent`                                     | Exact main color; filled actions and accents. Default `#075e55`.                            |
| `--ldforge-accent-fill`                                | Main color for secondary filled controls; falls back to legacy component greens when unset. |
| `--ldforge-on-accent`                                  | Black or white foreground on the main color.                                                |
| `--ldforge-accent-text`                                | Readable accent text on light surfaces.                                                     |
| `--ldforge-text`, `--ldforge-muted`                    | Main and secondary UI text.                                                                 |
| `--ldforge-surface`                                    | White base surface.                                                                         |
| `--ldforge-surface-subtle`, `--ldforge-surface-tinted` | Coordinated light surfaces.                                                                 |
| `--ldforge-hover`, `--ldforge-selected`                | Hover and selection surfaces.                                                               |
| `--ldforge-border`, `--ldforge-border-strong`          | Regular and emphasized borders. Default regular border `#d6dedd`.                           |
| `--ldforge-focus`                                      | Focus outline on light surfaces.                                                            |
| `--ldforge-shadow`, `--ldforge-backdrop`               | Translucent shadow/backdrop colors.                                                         |

The configuration writes tokens inline on the `.ldforge` root. Reset removes
these inline tokens and restores CSS overrides/defaults. Without a configured
theme, tokens other than the existing accent and border may be unset: use
fallbacks to retain your plugin's current appearance, for example:

```css
.my-settings-panel {
  color: var(--ldforge-text, #182e2b);
  background: var(--ldforge-surface-tinted, #f2f6f4);
  border: 1px solid var(--ldforge-border, #d6dedd);
}
.my-settings-panel a {
  color: var(--ldforge-accent-text, var(--ldforge-accent, #075e55));
}
```

A manual override of only `--ldforge-accent` remains supported but does not derive
the complete palette; use `themeMainColor` for coordinated colors. Plugin content
ported outside the editor root must explicitly inherit/copy these variables.

## Result plugin visibility

```ts
const maps = createGeoRenderer(); // import from @ldforge/geo
const editor = createEditor(container, {
  executor,
  renderers: [createTableRenderer(), createJsonRenderer(), maps],
  availablePlugins: true, // Default: show the dropdown.
  visiblePlugins: ['table', 'json', maps],
});
editor.hideAvailablePlugins();
editor.showAvailablePlugins();
editor.showPlugin(maps); // Also accepts the registered ID: 'geo'.
editor.hidePlugin('geo');
```

`showAvailablePlugins()` / `hideAvailablePlugins()` control only the dropdown.
`showPlugin(plugin)` pins a registered renderer on the bar; `hidePlugin(plugin)`
returns it to the dropdown. Both accept a registered ID or a plugin descriptor.
The active renderer remains visible after unpinning until another view is selected.
An unavailable pinned renderer is visible but disabled according to `supports(result)`.
These methods do not execute the query, remount the result, change the selected view,
or load visualization libraries. Calls are idempotent; unknown renderer IDs throw
`TypeError`, and all four methods throw after destruction. Defaults pin Table and JSON;
`visiblePlugins` replaces that initial list. Dropdown visibility defaults to `true`.
No built-in catalogue is used: third-party renderers follow the same rules.

## Query editor height

```ts
const editor = createEditor(container, {
  executor,
  editorRows: 15,
  autoGrow: false,
  onAutoGrowChange: (enabled) => console.log('Auto-grow:', enabled),
  onEditorRowsChange: (rows) => console.log('Visible rows:', rows),
});
editor.setEditorRows(20);
editor.getEditorRows(); // 20
editor.setAutoGrow(true);
editor.isAutoGrowEnabled(); // true
```

`getEditorRows()` / `setEditorRows(rows)` read or set the viewport's visual-row
count. Values must be positive safe integers; invalid values throw `RangeError`
and leave the current value intact. `isAutoGrowEnabled()` / `setAutoGrow(enabled)`
read or set growth behavior. When disabled, scrolling stays inside a fixed query
viewport; when enabled, `editorRows` is the minimum and the editor grows to fit.
The **Show the full query** (**Hele query tonen**) checkbox under Settings stays synchronized with API changes. All four methods
throw after destruction. Row count defaults to 15; library auto-grow defaults to
true. The demo explicitly uses false and persists the user's checkbox choice.

Changes preserve query text, selection, history, folds, tabs, execution and results;
they resize the same CodeMirror view. The settings are per editor instance and
apply to all its query tabs, including wrapped lines. Result renderers keep their
own height behavior. `onAutoGrowChange(enabled)` and `onEditorRowsChange(rows)`
run only when the corresponding value changes, not on initial mount. Persistence
belongs to the host. Hide the checkbox with `controls: { autoGrow: false }` while
retaining all methods.

The resize handle below the query editor is shown by default. Dragging it or using
its keyboard controls disables auto-grow and sets `editorRows`, invoking the same
change callbacks as the API. Arrow Up/Down changes one row, Shift changes five,
and Home reduces the viewport to one row. Set `controls: { resizeEditor: false }`
to hide the handle. The demo persists the chosen row count across reloads.
