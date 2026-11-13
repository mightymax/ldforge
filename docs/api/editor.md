# ForgeEditor

Returned by `createEditor(container: HTMLElement, options: EditorOptions): ForgeEditor`. One handle owns one IDE, one CodeMirror view and a live collection of query tabs. The caller owns the container and calls `destroy()` before unmounting it.

## Methods

| Method                          | Returns               | Behavior                                                                                                                                                      |
| ------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getTabs()`                     | `TabCollection`       | The same live, indexable collection each time. Throws after destruction.                                                                                      |
| `getToolBar()`                  | `ToolbarApi`          | Live toolbar API for standalone buttons, adjacent groups and dropdowns. See [Toolbar](toolbar.md).                                                            |
| `getWorkspace()`                | `QueryWorkspace`      | Detached plain-data snapshot for persistence.                                                                                                                 |
| `getQuery()`                    | `string`              | Active tab's current text.                                                                                                                                    |
| `setQuery(query)`               | `void`                | Replaces active text in one undoable edit and emits host callbacks. A no-op after destruction.                                                                |
| `formatQuery(options?)`         | `Promise<string>`     | Formats the tab active when called. Equivalent to `getTabs().getActive().formatQuery(options)`.                                                               |
| `addPrefix(prefix, namespace?)` | `string \| undefined` | Adds to the active tab and returns the actual alias; undefined means unknown shorthand.                                                                       |
| `getState()`                    | `QueryState`          | Latest execution state. See [Transport and results](transport.md).                                                                                            |
| `run()`                         | `Promise<void>`       | Executes active text. Resolves after the request settles; failures are recorded in state instead of rejecting. Throws/rejects if the controller is destroyed. |
| `cancel()`                      | `void`                | Aborts pending work and resets execution state to idle.                                                                                                       |
| `getLocale()`                   | `'en' \| 'nl'`        | Resolved language for this IDE.                                                                                                                               |
| `setLocale(preference)`         | `void`                | Sets user override; auto restores the project/browser default. Calls `onLocaleChange`. A no-op after destruction.                                             |
| `focus()`                       | `void`                | Focuses CodeMirror. Use only while mounted.                                                                                                                   |
| `destroy()`                     | `void`                | Idempotent. Aborts requests, disposes result/settings resources and CodeMirror, and removes the IDE section. Does not remove the caller's container.          |

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
