# Plugin objects

Plugins are trusted host code, registered per editor instance. IDs must be unique and non-empty within each category. Recreate an editor to change plugin registration.

## ButtonPlugin

| Property     | Type                                                | Description                                                                                                        |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`         | `string`                                            | Required identifier. run and cancel are reserved IDs for built-in controls.                                        |
| `label`      | `LocalizedText`                                     | String or `{ en: string, nl: string }`.                                                                            |
| `group`      | `string?`                                           | Controls grouping inside project actions. Groups follow first registration; buttons preserve order within a group. |
| `title`      | `LocalizedText?`                                    | Optional tooltip.                                                                                                  |
| `isDisabled` | `(context: EditorContext) => boolean`               | Pure synchronous predicate, evaluated on edits and execution state updates.                                        |
| `execute`    | `(context: EditorContext) => void \| Promise<void>` | Action. Rejections are shown in editor status.                                                                     |

`createRunButton()` and `createCancelButton()` are exported by `@ldforge/editor`. Built-in tools occupy their own icon group; custom actions are separated visually and structurally.

## EditorContext

The context passed to actions/settings is the active-query subset of `ForgeEditor`: `getQuery`, `setQuery`, `formatQuery`, `addPrefix`, `getState`, `run`, `cancel`, `getLocale`, and `setLocale`. Tab collections, mounting and destruction are on the host's `ForgeEditor` handle. See [Editor](editor.md) for method semantics. `formatQuery` returns a promise and must be returned or awaited by an action.

## ResultRendererPlugin

| Member                                | Type                   | Description                                                                                                          |
| ------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`, `label`                         | string / LocalizedText | Identity and selector label.                                                                                         |
| `supports(result)`                    | `boolean`              | Whether this renderer can display the result.                                                                        |
| `render(container, result, context?)` | `void \| (() => void)` | Synchronous render. Optional context is `{ locale: 'en' \| 'nl' }`. Return cleanup for listeners or framework roots. |

Only supported renderers appear in the result selector. The previous renderer is cleaned up before another view/state is rendered or the editor is destroyed. Render RDF with `textContent`, not HTML. Renderer-owned asynchronous work must be cancelled in its cleanup function.

## SettingsPlugin

| Member                             | Type                   | Description                                                                        |
| ---------------------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| `id`, `label`                      | string / LocalizedText | Identity and panel heading.                                                        |
| `render(container, context)`       | `void \| (() => void)` | Mount once inside the gear panel and optionally return cleanup.                    |
| `updateLocale(container, context)` | `void`                 | Optional label refresh. Preserve input values and avoid registering new listeners. |

Settings plugins are not mounted when `controls.settings` is false. They are cleaned up during destruction. The host is responsible for their state and transport integration. See `apps/demo/src/endpoint-settings.ts` in the repository for a working example.

## PluginRegistry

The generic `PluginRegistry<T extends { id: string }>` is exported by core. Construct it with an optional ordered list; `register(plugin)` returns an unregister function; `list()` returns an ordered array snapshot. Duplicate and blank IDs throw. It is independent of editor mounting and does not dynamically update an already mounted IDE.
