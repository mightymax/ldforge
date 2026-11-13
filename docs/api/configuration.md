# Editor configuration

`createEditor(container, options)` accepts an `HTMLElement` and an `EditorOptions` object. Configuration is read at mount time. Recreate the editor to change plugin sets or control visibility. Query text, tabs and language have runtime methods.

## EditorOptions

| Property            | Type                                     | Default              | Behavior                                                                                                                                                                             |
| ------------------- | ---------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `executor`          | `QueryExecutor`                          | Required             | Runs queries and receives an abort signal.                                                                                                                                           |
| `query`             | `string`                                 | `''`                 | Initial first-tab text when no valid workspace is restored.                                                                                                                          |
| `workspace`         | `QueryWorkspace`                         | One tab              | Restored tabs and active ID. Takes precedence over `query`. Invalid runtime data falls back to the initial query. Validate persisted JSON with `parseQueryWorkspace`.                |
| `controls`          | `EditorControls \| false`                | All controls enabled | Toggles built-in UI. `false` hides every built-in control, including tabs. Custom buttons remain visible.                                                                            |
| `locale`            | `'auto' \| 'en' \| 'nl'`                 | `'auto'`             | Project default. Auto uses the first supported browser language, then English.                                                                                                       |
| `userLocale`        | `'auto' \| 'en' \| 'nl'`                 | `'auto'`             | Restored user override. Auto follows the project setting.                                                                                                                            |
| `sparql`            | `SparqlOptions`                          | Built-in catalogs    | Namespace and predicate completion configuration.                                                                                                                                    |
| `buttons`           | `readonly ButtonPlugin[]`                | Run and Cancel       | Replaces the default action list. Include the built-in factories to retain those actions.                                                                                            |
| `renderers`         | `readonly ResultRendererPlugin[]`        | `[]`                 | Ordered result views. No implicit renderer is installed.                                                                                                                             |
| `settings`          | `readonly SettingsPlugin[]`              | `[]`                 | Host-owned panels under the gear button. Not mounted when `controls.settings` is false.                                                                                              |
| `extensions`        | `readonly Extension[]`                   | `[]`                 | Additional CodeMirror 6 extensions, recreated on a tab switch.                                                                                                                       |
| `onQueryChange`     | `(query: string) => void`                | None                 | Called when active text changes or another tab becomes active. Inactive text edits do not call it.                                                                                   |
| `onWorkspaceChange` | `(workspace: QueryWorkspace) => void`    | None                 | Receives a detached snapshot after edits, prefix insertion, formatting, rename, create, delete or selection changes. Initial mount does not emit unless a host plugin mutates state. |
| `onLocaleChange`    | `(preference: LocalePreference) => void` | None                 | Called after user/API language changes. The host can persist this preference.                                                                                                        |
| `onWarning`         | `(warning: EditorWarning) => void`       | `console.warn`       | Reports unknown shorthand prefixes without changing the query.                                                                                                                       |

Callbacks are synchronous host code. Keep them short and handle storage failures inside your callback. Exceptions from host callbacks are not silently ignored.

## EditorControls

Every property is optional and defaults to `true`.

| Property    | Shows or hides                                                                     |
| ----------- | ---------------------------------------------------------------------------------- |
| `run`       | The action with reserved ID `run`, including `createRunButton()`.                  |
| `cancel`    | The action with reserved ID `cancel`, including `createCancelButton()`.            |
| `prefixes`  | Prefix search icon and its entry point.                                            |
| `format`    | Format-query icon.                                                                 |
| `settings`  | Gear icon and settings plugin mounting. Hides access to the language selector too. |
| `language`  | Built-in language field inside settings; other settings stay available.            |
| `tabs`      | Entire tab strip. Multiple tabs remain available through the API.                  |
| `addTab`    | Plus button in the tab strip.                                                      |
| `renameTab` | Rename icon and double-click renaming.                                             |
| `closeTab`  | Tab close buttons.                                                                 |

The core tools group is ordered **Prefixes → Format query → Settings**, with icons, localized accessible names and tooltips. Run/Cancel are separate from custom project actions. Custom plugin buttons use their `group` identifier; a project cannot accidentally merge its buttons into the core action group just by using the same group name.

```ts
// Only hide these controls; all public methods remain available.
const controls = {
  prefixes: false,
  format: true,
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
