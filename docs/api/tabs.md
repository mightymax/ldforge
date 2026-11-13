# TabCollection

`editor.getTabs(): TabCollection` returns a **live collection** with readonly array semantics. It supports `tabs[0]`, `length`, `at`, iteration, `map`, `find`, `filter`, and `forEach`. Creating or deleting a tab updates the same collection instance. Do not mutate it using JavaScript array mutators; use `addTab()` and `tab.delete()`.

Handles are stable across edits and renaming. A handle's `id` is the lookup key; names may change and are not unique.

## Properties and methods

| Member             | Returns                       | Behavior                                                                                                                                                   |
| ------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `length`           | `number`                      | Current tab count, always at least one.                                                                                                                    |
| `[index]`          | `QueryTabHandle \| undefined` | Handle in current display order; check out-of-range access.                                                                                                |
| `getById(id)`      | `QueryTabHandle \| undefined` | Finds a stable ID.                                                                                                                                         |
| `getByName(name)`  | `QueryTabHandle \| undefined` | First exact, case-sensitive display-name match in order. Unnamed tabs use their localized default name, such as Query 1. Prefer IDs for stored references. |
| `getActive()`      | `QueryTabHandle`              | Current active tab.                                                                                                                                        |
| `addTab(options?)` | `QueryTabHandle`              | Adds and returns a new tab. Activates it by default.                                                                                                       |

Lookup and mutation methods throw after editor destruction. A deleted handle is removed from the live collection; an external reference can still inspect `isDeleted` while the editor is alive.

## AddTabOptions

| Property   | Type                                 | Default           | Behavior                                                                                             |
| ---------- | ------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------- |
| `name`     | `string`                             | Localized Query N | Stored after trimming. Empty/whitespace uses the automatic name.                                     |
| `query`    | `string`                             | `''`              | Initial source text.                                                                                 |
| `prefixes` | `readonly (string \| PrefixInput)[]` | `[]`              | Shorthand names use the configured namespace catalog. Explicit objects are `{ prefix, namespace? }`. |
| `activate` | `boolean`                            | `true`            | False creates a tab without changing active text, results or focus.                                  |

```ts
const tabs = editor.getTabs();
const tab = tabs.addTab({
  name: 'People',
  query: 'select ?person where { ?person a ?type } limit 10',
  prefixes: ['sdo', 'dct', { prefix: 'ex', namespace: 'https://example.org/' }],
  activate: false,
});
await tab.formatQuery();
tab.activate();
```

Prefixes are resolved before the tab is created. Invalid explicit namespaces throw and do not create a partial tab. Unknown shorthand names warn and are skipped; valid entries and the tab are still created. New tabs do not allocate another CodeMirror view.

## Persistence

`QueryWorkspace` is a plain, serializable object:

```ts
interface QueryWorkspace {
  readonly activeId: string;
  readonly tabs: readonly QueryTab[];
}
interface QueryTab {
  readonly id: string;
  readonly query: string;
  readonly title?: string;
}
```

`QueryTab` is a **data record**, not `QueryTabHandle`. Its `title` is the stored name; `handle.name` is the resolved display name. Never serialize the handle collection as your persistence format. Use `getWorkspace()` or the callback snapshot.

```ts
import { parseQueryWorkspace } from '@ldforge/editor';

function restoreWorkspace() {
  try {
    return parseQueryWorkspace(
      JSON.parse(localStorage.getItem('my-app.queries') ?? 'null'),
    );
  } catch {
    return undefined;
  }
}
// Supply workspace only when restoreWorkspace() returns a value.
// onWorkspaceChange: (snapshot) => {
//   try { localStorage.setItem('my-app.queries', JSON.stringify(snapshot)); }
//   catch { /* Keep editing when storage is unavailable or full. */ }
// }
```

`parseQueryWorkspace(value: unknown)` returns a validated, detached workspace or undefined. It rejects malformed records and duplicate/empty IDs. If a valid workspace's active ID is absent, it selects the first tab. No automatic migration or network access occurs.

## Switching and deletion

Switching cancels the current request, clears its result, saves host workspace state and loads the next query into the same editor view. Undo history resets to avoid undo crossing query boundaries. Inactive tabs retain strings only. Closing the active tab selects an adjacent tab; the last tab cannot be deleted. IDs are not recycled during the editor lifetime, so deleted handles cannot target a newly created tab.
