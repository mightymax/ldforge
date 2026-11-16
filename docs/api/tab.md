# QueryTabHandle

Obtain a handle from `editor.getTabs()[index]`, `getById`, `getByName`, `getActive`, or `addTab`. It represents a stable tab, regardless of which tab is active.

## Readonly properties

| Property    | Type      | Meaning                                                                       |
| ----------- | --------- | ----------------------------------------------------------------------------- |
| `id`        | `string`  | Stable identity. Remains readable after deletion.                             |
| `name`      | `string`  | Explicit name, or the current localized Query N fallback.                     |
| `isActive`  | `boolean` | Whether this tab currently supplies the editor text. False for a deleted tab. |
| `isDeleted` | `boolean` | Whether the handle's tab has been removed.                                    |

Properties other than `id` require a live editor. `name` throws for a deleted tab. Handles are frozen; use methods rather than property assignments.

## Methods

| Method                          | Returns                  | Behavior                                                                                                                                      |
| ------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `getQuery()`                    | `string`                 | Reads this tab's source, including inactive tabs.                                                                                             |
| `setQuery(query)`               | `void`                   | Replaces this tab's text. Active edits are undoable and emit both query/workspace callbacks; inactive edits emit only the workspace callback. |
| `formatQuery(options?)`         | `Promise<string>`        | Formats this tab without activating it. See [formatting behavior](editor.md#formatting-options).                                              |
| `getPrefixes()`                 | `Record<string, string>` | Detached snapshot of explicitly declared aliases and namespaces; excludes the completion catalog.                                             |
| `removePrefix(prefix)`          | `void`                   | Removes all declarations of this alias. A missing alias is a no-op.                                                                           |
| `addPrefix(prefix, namespace?)` | `string \| undefined`    | Adds a declaration and returns the actual alias. Resolves shorthand through the configured catalog when namespace is omitted.                 |
| `rename(name)`                  | `void`                   | Trims and persists the name. Empty/whitespace restores the automatic label. Names need not be unique.                                         |
| `activate()`                    | `void`                   | Makes this tab active. Calling it on the active tab is a no-op. Does not force keyboard focus.                                                |
| `delete()`                      | `boolean`                | Removes this tab; returns false if it is the only remaining tab.                                                                              |

Methods throw for deleted tabs or a destroyed editor. Formatting additionally rejects for invalid syntax or if this tab's text changes before the async format finishes. It never overwrites newer source. Deleting another tab does not invalidate this handle.

## Prefix behavior

```ts
const tab = editor.getTabs().getActive();
tab.addPrefix('sdo', 'https://schema.org/'); // Explicit namespace.
tab.addPrefix('dct'); // Catalog lookup; warns and returns undefined if unavailable.
tab.addPrefix('ex', 'https://example.org/');
```

`PrefixInput` is `{ readonly prefix: string; readonly namespace?: string }` for `tabs.addTab({ prefixes })`. String values are equivalent to objects with only `prefix`.

Existing namespaces are reused even under another alias. If `sdo` is already bound to a different namespace, LDForge chooses `sdo2`, then `sdo3`, and returns the chosen name. It does not rewrite existing query terms or overwrite declarations. Invalid explicit names/IRIs throw before mutation. An unknown shorthand produces an `EditorWarning` and no edit; no namespace is guessed.

The editor depends on `@ldforge/prefixes`, whose catalog includes both `schema`/`sdo` and `dcterms`/`dct`. Set `sparql.prefixes: false` to disable lookup or pass a namespace map to extend/override the catalog. Explicit namespace insertion works with lookup disabled.

## Example: update an inactive query

```ts
const tabs = editor.getTabs();
const tab = tabs.addTab({
  name: 'Catalog',
  query: 'ask {?s ?p ?o}',
  activate: false,
});
tab.addPrefix('dct');
await tab.formatQuery({ indentSize: 2 });
console.log(tab.getQuery());
// The previously active query remains displayed until this call:
tab.activate();
```

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
