# Editor configuration

`createEditor(container, options)` accepts an `HTMLElement` and an `EditorOptions` object. Configuration is read at mount time. Recreate the editor to change result/settings plugin sets or built-in control visibility, except the plugin wizard and result plugin presentation, which also have runtime visibility methods. Toolbar actions and groups can also change through `editor.getToolBar()`. Query text, tabs and language have runtime methods.

## EditorOptions

| Property             | Type                                                                                                  | Default              | Behavior                                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prefixesCollapsed`  | `boolean`                                                                                             | `false`              | Initially folds PREFIX declarations on each tab. Fold state is view-only; see [ForgeEditor](editor.md#collapsible-prefix-declarations) for the runtime API.                                  |
| `themeMainColor`     | `string`                                                                                              | Existing green theme | Optional opaque `#RGB` or `#RRGGBB` accent; derives instance-scoped UI tokens. See [Theming](editor.md#theme-colors).                                                                        |
| `executor`           | `QueryExecutor`                                                                                       | Required             | Runs queries and receives an abort signal.                                                                                                                                                   |
| `query`              | `string`                                                                                              | `''`                 | Initial first-tab text when no valid workspace is restored.                                                                                                                                  |
| `workspace`          | `QueryWorkspace`                                                                                      | One tab              | Restored tabs and active ID. Takes precedence over `query`. Invalid runtime data falls back to the initial query. Validate persisted JSON with `parseQueryWorkspace`.                        |
| `controls`           | `EditorControls \| false`                                                                             | All controls enabled | Toggles built-in UI. `false` hides every built-in control, including tabs. Custom buttons remain visible.                                                                                    |
| `locale`             | `'auto' \| 'en' \| 'nl'`                                                                              | `'auto'`             | Project default. Auto uses the first supported browser language, then English.                                                                                                               |
| `userLocale`         | `'auto' \| 'en' \| 'nl'`                                                                              | `'auto'`             | Restored user override. Auto follows the project setting.                                                                                                                                    |
| `sparql`             | `SparqlOptions`                                                                                       | Built-in catalogs    | Namespace and predicate completion configuration.                                                                                                                                            |
| `toolbar`            | `ToolbarOptions`                                                                                      | `{}`                 | Optional custom group presentation and initial group actions. Existing groups stay adjacent buttons unless configured as dropdowns; see [Toolbar](toolbar.md).                               |
| `buttons`            | `readonly ButtonPlugin[]`                                                                             | Combined Run/Stop    | Replaces the default action list. Include createRunButton() to retain Run/Stop; createCancelButton() is optional.                                                                            |
| `editorRows`         | `number`                                                                                              | `15`                 | Query viewport in visual lines; minimum when growing. Positive safe integer.                                                                                                                 |
| `autoGrow`           | `boolean`                                                                                             | `true`               | Grow the query editor with content; false uses a fixed scrolling viewport. Demo explicitly uses false.                                                                                       |
| `onAutoGrowChange`   | `(enabled: boolean) => void`                                                                          | None                 | Called when the height mode changes via the checkbox or API.                                                                                                                                 |
| `onEditorRowsChange` | `(rows: number) => void`                                                                              | None                 | Called when the visible-row count changes via the API or resize handle.                                                                                                                      |
| `availablePlugins`   | `boolean`                                                                                             | `true`               | Show the dropdown of remaining registered result plugins.                                                                                                                                    |
| `visiblePlugins`     | `readonly (string \| ResultRendererPlugin)[]`                                                         | `['table', 'json']`  | Initially pinned registered plugins; an explicit array replaces the defaults.                                                                                                                |
| `renderers`          | `readonly ResultRendererPlugin[]`                                                                     | `[]`                 | Ordered result views. No implicit renderer is installed.                                                                                                                                     |
| `keyboardHelp`       | Keyboard-shortcut overview icon on the right. Defaults to true; hiding it does not disable shortcuts. |
| `settings`           | `readonly SettingsPlugin[]`                                                                           | `[]`                 | Host-owned panels under the gear button. Not mounted when `controls.settings` is false.                                                                                                      |
| `extensions`         | `readonly Extension[]`                                                                                | `[]`                 | Additional CodeMirror 6 extensions, recreated on a tab switch.                                                                                                                               |
| `onQueryChange`      | `(query: string) => void`                                                                             | None                 | Called when active text changes or another tab becomes active. Inactive text edits do not call it.                                                                                           |
| `onWorkspaceChange`  | `(workspace: QueryWorkspace) => void`                                                                 | None                 | Receives a detached snapshot after edits, prefix insertion/removal, formatting, rename, create, delete or selection changes. Initial mount does not emit unless a host plugin mutates state. |
| `onLocaleChange`     | `(preference: LocalePreference) => void`                                                              | None                 | Called after user/API language changes. The host can persist this preference.                                                                                                                |
| `onWarning`          | `(warning: EditorWarning) => void`                                                                    | `console.warn`       | Reports unknown shorthand prefixes without changing the query.                                                                                                                               |

`availablePlugins?: boolean` controls the result renderer dropdown and defaults to `true`.
`visiblePlugins?: readonly (string | ResultRendererPlugin)[]` sets the renderers pinned
on the result bar, defaulting to `['table', 'json']`. Supply registered IDs or plugin
objects. An explicit list replaces those defaults; unregistered IDs throw before mounting.
Pinned plugins remain disabled when `supports(result)` returns false. The active
renderer is always shown, even when it is not pinned. Visibility does not register,
select, execute or load a renderer. See [runtime methods](editor.md#result-plugin-visibility).

Callbacks are synchronous host code. Keep them short and handle storage failures inside your callback. Exceptions from host callbacks are not silently ignored.

## EditorControls

Every property is optional and defaults to `true`.

| Property                | Shows or hides                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `rendererDocumentation` | Book-icon link to the selected renderer’s usage guide, when its plugin provides a valid `documentationUrl`.                 |
| `download`              | CSV download icon in the result toolbar; shown only for successful results.                                                 |
| `run`                   | The action with reserved ID `run`, including `createRunButton()`.                                                           |
| `cancel`                | The action with reserved ID `cancel`, including `createCancelButton()`.                                                     |
| `prefixFolding`         | Gutter arrows to fold and unfold PREFIX declarations. Hiding these leaves the folding API and keyboard shortcuts available. |
| `prefixes`              | Prefix search icon and its entry point.                                                                                     |
| `autoGrow`              | Show the full query checkbox in settings; height APIs remain available when hidden.                                         |
| `resizeEditor`          | Show the draggable query-height handle, including keyboard resizing.                                                        |
| `fontSize`              | Query text-size field in settings; API remains available when hidden.                                                       |
| `loadingIndicator`      | Spinner in results while a query runs; defaults to true.                                                                    |
| `share`                 | Share-link icon in the right toolbar. Defaults to true; sharing APIs remain available when hidden.                          |
| `rendererWizard`        | Plugin wizard icon; defaults to true. API remains available when hidden.                                                    |
| `format`                | Format-query icon.                                                                                                          |
| `settings`              | Gear icon and settings plugin mounting. Hides access to the language selector too.                                          |
| `language`              | Built-in language field inside settings; other settings stay available.                                                     |
| `tabs`                  | Entire tab strip. Multiple tabs remain available through the API.                                                           |
| `addTab`                | Plus button in the tab strip.                                                                                               |
| `renameTab`             | Rename icon and double-click renaming.                                                                                      |
| `closeTab`              | Tab close buttons.                                                                                                          |

The core tools group is ordered **Format query → Prefixes → Plugin wizard → Share your query → Keyboard shortcuts → Settings**, with icons, localized accessible names and tooltips. Run/Stop is separate from custom project actions. Custom plugin buttons use their `group` identifier; a project cannot accidentally merge its buttons into the core action group just by using the same group name.

```ts
// Only hide these controls; all public methods remain available.
const controls = {
  prefixes: false,
  format: true,
  rendererWizard: false,
  settings: true,
  closeTab: false,
};
// Pass controls to createEditor. To hide all built-in controls: controls: false.
```

Ctrl/Cmd+Enter still runs a query when Run is hidden. A hidden control is not a security boundary. Only the host/backend can enforce permissions.

## SparqlOptions

| Property       | Type                                        | Default              | Behavior                                                                                                                                                                                                             |
| -------------- | ------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prefixes`     | `Readonly<Record<string, string>> \| false` | Compact catalog (32) | A map extends/overrides compact namespaces; import @ldforge/prefixes/extended and pass its map to opt in to 3,623 entries. `false` disables shorthand lookup and the catalog; explicit namespace methods still work. |
| `autoPrefixes` | `boolean`                                   | `true`               | Adds known missing declarations while typing or pasting prefixed terms. Set `false` to disable automatic insertion.                                                                                                  |
| `predicates`   | `readonly SparqlPredicate[]`                | Small RDF vocabulary | Replaces, rather than extends, built-in predicate suggestions. Each item has `iri` and optional `description`.                                                                                                       |

Prefix names and absolute IRIs are validated at creation. Invalid configuration throws before mounting. `@ldforge/prefixes` is an editor dependency, so its catalog is available by default; there is no runtime check for a global JavaScript variable. Unknown or disabled shorthand names produce `EditorWarning`, code `unknown-prefix`, and no edit. Use an explicit namespace to bypass lookup.

```ts
import { prefixes } from '@ldforge/prefixes/extended';
// Use /compact (or the root import) for 32 common prefixes instead.

const sparql = {
  prefixes: { ...prefixes, ex: 'https://example.org/' },
  predicates: [
    { iri: 'https://example.org/name', description: 'Resource name' },
  ],
};
```

Typing `schema:name` automatically inserts `PREFIX schema: <https://schema.org/>` into the query prologue. Insertion starts at the first character after the colon, preserves the cursor, and undoes with that typing or paste operation. Existing declarations are never replaced. Comments, strings, full IRIs and unknown prefixes do not trigger insertion. The configured catalog controls which namespaces are known; `prefixes: false` also disables automatic insertion. Programmatic `setQuery()` calls and restored queries keep their exact text.

```ts
// Pass to createEditor to require explicit prefix insertion instead.
const sparql = { autoPrefixes: false };
```

## Language precedence

**User choice → project `locale` → browser languages → English.** `editor.setLocale('auto')` clears the user override; it follows the project preference, which may itself be auto. Locale changes update labels in place and preserve queries and settings drafts. RDF values, variable names, SPARQL source and arbitrary endpoint errors are not translated.

## Example: a host-owned toolbar

```ts
import { createRunButton, createCancelButton } from '@ldforge/editor';

const buttons = [
  createRunButton(),
  createCancelButton(),
  {
    id: 'my-project.example',
    group: 'examples',
    label: { en: 'Load example', nl: 'Voorbeeld laden' },
    execute(context: import('@ldforge/core').EditorContext) {
      context.setQuery('ASK { ?s ?p ?o }');
    },
  },
];
```

## Responsive query actions

At viewport widths of 540px or less, the built-in Run action shows only its icon
with a 44px touch target, and Cancel is hidden. Run keeps its localized accessible
name and tooltip. Above that breakpoint both labels and Cancel are shown as
usual. A custom Run action without an icon retains its label. These styles apply
to the IDE's core actions, not custom button groups or dropdown menu items.

## Query text size

`EditorOptions.fontSize?: number` defaults to **12 px**, with integer values from
10 through 24. It applies only to the CodeMirror query area (including its line
numbers), keeping toolbar, settings and result fonts unchanged. The gear panel
provides smaller/larger buttons, a size selector and Reset (12 px). Hide the field
with `controls.fontSize: false`; `getFontSize()`/`setFontSize(size)` remain available.
The optional `onFontSizeChange(size)` callback supports host-owned persistence.
The demo restores/saves this preference in `localStorage` under
`ldforge.demo.font-size.v1`, without cookies. An existing saved choice overrides
the demo's default. Storage failures leave current-session controls usable.

`controls.loadingIndicator: false` disables the default query spinner. Runtime
methods are `isLoadingIndicatorEnabled()` and `setLoadingIndicatorEnabled(boolean)`.
These affect presentation only; running queries and the stop action remain active.

Prefix inspection/removal needs no configuration. `getPrefixes()` reads query
declarations, independently of the `sparql.prefixes` completion catalog (including
when that catalog is disabled). See [ForgeEditor](editor.md#inspecting-and-removing-prefixes).

`shareBaseUrl` optionally sets the absolute recipient page URL. By default sharing uses the current page URL, removes ordinary page fragments, preserves hash-based application routes, preserves its other parameters and replaces `query` with the encoded query. Hosts should read that parameter when initializing their editor; the demo opens the shared query without automatically executing it and preserves existing saved tabs.

`shareEndpoint` accepts an endpoint URL or a callback returning the current applied endpoint. When sharing, this is added as `# sparql-endpoint=…` if the query does not already declare one. The demo reads its active connection when opening the dialog or calling the copy API. Authentication headers are not part of the shared URL.

## Optional share URL shortening

`shortenShareUrl?: ShareUrlShortener` configures the existing share button and
`copyShareLink()`. The exported type is
`(url: string, query: string) => string | Promise<string>`. The first argument is
the complete generated URL (including encoded query, renderer, endpoint, route
and other parameters); the second is its unencoded query including share metadata.
Return an absolute HTTP(S) URL without surrounding whitespace. LDForge does not
choose or operate a provider; the host owns endpoints, authentication and parsing.

Without this option, the dialog offers full links and request examples without shortening. `getShareLink()` always synchronously
returns the full original URL and never invokes the integration. `copyShareLink()`
resolves to the URL actually copied. In the dialog, each short-link row exposes
loading with `aria-busy="true"` and remains unavailable for copying until ready.
A thrown/rejected error or invalid URL rejects the API call or shows a retryable
error on that dialog row; nothing is copied or edited. There is no automatic fallback. Hosts can implement timeouts with
`AbortSignal.timeout()` in their callback. A changed query document, active tab,
renderer, endpoint, base URL, destroyed editor or newer copy request makes the
pending result stale: it rejects before clipboard access. Clipboard failures also
reject. A query changed after clipboard writing starts is never overwritten.

See the [integration guide](../../apps/demo/guide.html#share-shortening) for a
complete callback and a standalone Prisma ORM service example.

## Query editor height

`editorRows?: number` sets the query viewport in visual lines (positive safe integer,
default **15**). Wrapped lines occupy additional visual rows. With `autoGrow: false`,
the height stays fixed and the query scrolls internally. Font size changes preserve
the configured visible-row count. With `autoGrow: true`, rows define the minimum
height and the editor grows with its content. Library default: `autoGrow: true`,
preserving the growing editor for existing integrations.

```ts
// In createEditor options:
// editorRows: 15,
// autoGrow: false,
// onAutoGrowChange: (enabled) => savePreference(enabled),
// onEditorRowsChange: (rows) => saveRowPreference(rows),
```

The demo explicitly starts with 15 rows and auto-grow off. The **Show the full query**
(**Hele query tonen**) checkbox is behind the gear button. Its preference
is restored from `localStorage` under `ldforge.demo.auto-grow.v1`; unavailable
storage leaves the current session usable. Hide only the checkbox with
`controls: { autoGrow: false }`; `controls.settings: false` hides the whole panel.
The height API remains available. Options apply to the query editor across tabs,
not the JSON result editor or other result renderers. Runtime methods and callbacks
are described in [ForgeEditor](editor.md#query-editor-height).

## Query sharing dialog

The share toolbar icon expands the **Share your query** panel below the toolbar (NL: **Deel je query**).
Opening and copying from this dialog never edits or executes the query. Each
read-only field has its own Copy button and status. Values are a snapshot of the
active tab, selected renderer and applied endpoint when opened; Refresh values
rebuilds them. If the source changes, copying refuses stale values until refreshed.
Escape or the toolbar icon collapses the panel and restores focus to the share icon.
`controls.share: false` hides the icon; the existing `getShareLink()` and
`copyShareLink()` APIs remain available with their existing semantics.

- Full editor URL preserves renderer and endpoint directives. Ordinary editor
  links remove the reserved `execute` parameter and never opt into execution.
- With `shortenShareUrl`, short links populate automatically on open, asynchronously.
  Each short entry has independent pending/error/retry state. The full URL stays
  available even when the service fails. No shortening provider is built in.
- `shareAutoRun?: boolean` defaults to false. Set true only when the recipient host
  supports the reserved `execute=true` URL parameter. Together with a shortener,
  it adds a clearly labelled **Short editor URL — opens and runs query** entry.
  The callback receives the full editor URL with `execute=true` for that entry.
  LDForge itself never runs a query when opening or copying the dialog. The host
  must read `query` and explicitly call `editor.run()` only for `execute=true`.
- SPARQL GET URL and GET/POST cURL commands use the original query and query-declared
  endpoint, falling back to `shareEndpoint`. Without an endpoint, these rows remain visible with disabled Copy buttons and a placeholder directing users to endpoint settings. SELECT/ASK request SPARQL Results JSON; CONSTRUCT/DESCRIBE
  request N-Triples with Turtle as a fallback, matching the HTTP executor.
  Request examples exclude connection headers, URL user/password and recognized
  credential parameters (`access_token`, `token`, `password`, `authorization`,
  `api_key`, `api-key`, `apikey`, `secret`, `signature`). Non-credential endpoint
  parameters such as `default-graph-uri` remain intact. cURL arguments are POSIX
  shell quoted; POST uses `--data-binary` to preserve multiline query text.
- The unescaped one-line query collapses only whitespace outside quoted strings.
  Comments are removed outside strings and IRIs. Long literals are converted to
  quoted strings with escaped newlines; unfinished literals retain the original
  source under a separate label.

For browser security, clipboard access requires a supported secure context and
user action. Failures are displayed next to the entry and can be retried.

The editor-link field is labelled **URL to this query in the editor**. Endpoint
entries include **cURL command line for POST request**. Unconfigured short-link entries are omitted. Request entries stay visible without an endpoint and show a short placeholder instead of a separate notice.
The one-line query removes comments outside strings/IRIs, compacts whitespace
outside literals and converts long literals to quoted strings with escaped
newlines, preserving their values. An unfinished literal uses a separately
labelled **Original query** fallback.

Prefixes, sharing, keyboard shortcuts and settings use the same inline toolbar panel styling. Only one is open at a time. Its toolbar icon is highlighted and exposes `aria-expanded=true`; click it again to close. Escape closes a focused panel and restores focus to its icon. These panels have no separate Close buttons.

The Prefixes panel also offers **Add missing prefixes** and **Remove unused
prefixes** (NL: **Voeg missende prefixes toe**, **Verwijder ongebruikte prefixes**).
The first adds declarations for names actually used in the query, using the
configured namespace catalog; unknown namespaces are reported without guessing.
The second removes declarations with no syntactic usages, preserving comments,
strings, full IRIs and declarations used in paths or datatypes. Syntax errors
block removal until corrected. Each action is one undoable edit and never runs
the query. The actions apply to the active tab, independent of the search filter.

The plugin wizard also uses the shared inline toolbar panel. Its icon toggles the
panel and highlights while open; opening any other toolbar panel collapses it.
Escape closes it and restores focus. The existing wizard API, steps, preview and
undoable Apply action remain available. Keyboard focus can move outside the panel.
