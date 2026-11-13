# ForgeEditor

Returned by `createEditor(container: HTMLElement, options: EditorOptions): ForgeEditor`. One handle owns one IDE, one CodeMirror view and a live collection of query tabs. The caller owns the container and calls `destroy()` before unmounting it.

## Methods

| Method                            | Returns               | Behavior                                                                                                                                                              |
| --------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setPrefixesCollapsed(collapsed)` | `void`                | Collapses or expands every PREFIX group in the active query. Presentation only; source, execution and persistence retain every declaration. Throws after destruction. |
| `arePrefixesCollapsed()`          | `boolean`             | True when every PREFIX group is folded; false for expanded/partially folded queries or queries without declarations. Throws after destruction.                        |
| `togglePrefixes()`                | `boolean`             | Toggles all PREFIX groups and returns the resulting collapsed state. Returns false when no declarations exist. Throws after destruction.                              |
| `getTabs()`                       | `TabCollection`       | The same live, indexable collection each time. Throws after destruction.                                                                                              |
| `getToolBar()`                    | `ToolbarApi`          | Live toolbar API for standalone buttons, adjacent groups and dropdowns. See [Toolbar](toolbar.md).                                                                    |
| `getWorkspace()`                  | `QueryWorkspace`      | Detached plain-data snapshot for persistence.                                                                                                                         |
| `getQuery()`                      | `string`              | Active tab's current text.                                                                                                                                            |
| `setQuery(query)`                 | `void`                | Replaces active text in one undoable edit and emits host callbacks. A no-op after destruction.                                                                        |
| `formatQuery(options?)`           | `Promise<string>`     | Formats the tab active when called. Equivalent to `getTabs().getActive().formatQuery(options)`.                                                                       |
| `addPrefix(prefix, namespace?)`   | `string \| undefined` | Adds to the active tab and returns the actual alias; undefined means unknown shorthand.                                                                               |
| `getState()`                      | `QueryState`          | Latest execution state. See [Transport and results](transport.md).                                                                                                    |
| `run()`                           | `Promise<void>`       | Executes active text. Resolves after the request settles; failures are recorded in state instead of rejecting. Throws/rejects if the controller is destroyed.         |
| `cancel()`                        | `void`                | Aborts pending work and resets execution state to idle.                                                                                                               |
| `getLocale()`                     | `'en' \| 'nl'`        | Resolved language for this IDE.                                                                                                                                       |
| `setLocale(preference)`           | `void`                | Sets user override; auto restores the project/browser default. Calls `onLocaleChange`. A no-op after destruction.                                                     |
| `focus()`                         | `void`                | Focuses CodeMirror. Use only while mounted.                                                                                                                           |
| `destroy()`                       | `void`                | Idempotent. Aborts requests, disposes result/settings resources and CodeMirror, and removes the IDE section. Does not remove the caller's container.                  |

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
