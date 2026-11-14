# Toolbar objects

`editor.getToolBar(): ToolbarApi` returns the same live toolbar API for an editor instance. It manages custom actions independently of the built-in Prefixes/Format/Settings tools. Existing `buttons` configuration and `ButtonPlugin.group` keep their behavior unless you opt a group into a dropdown.

## Configure dropdowns at creation

```ts
import { buttonGroupTypes, createEditor } from '@ldforge/editor';

// Inside createEditor() options:
const toolbar = {
  groups: [
    {
      id: 'examples',
      type: buttonGroupTypes.dropdown,
      label: { en: 'Example queries', nl: 'Voorbeeldqueries' },
    },
  ],
};
// Existing buttons with group: 'examples' appear in this menu.
// Other groups remain ordinary button groups.
```

`EditorOptions.toolbar?: ToolbarOptions` defaults to `{}`. `ToolbarOptions.groups?: readonly ButtonGroupOptions[]` describes presentation for existing button groups and can also add groups with their own `buttons`. Initial `EditorOptions.buttons` keeps its existing replacement semantics: omit it to retain the combined Run/Stop action, or include its factory when supplying your own array. Configuring toolbar groups does not itself remove default actions.

[Try the demo](./). The demo website explicitly creates two dropdowns using the runtime API: Query Examples (SELECT → CONSTRUCT → ASK) and Plugin Examples (Cards → Charts). This is host configuration; library groups still default to adjacent buttons.

## ToolbarApi

| Method                    | Returns                                 | Behavior                                                                                                                                                                                                                |
| ------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addButton(button)`       | `ToolbarButtonHandle`                   | Mount a standalone action. Accepts a `ButtonPlugin` or a same-toolbar handle; an existing handle is moved, never duplicated. The descriptor's `group` is ignored here: choose a group explicitly using its `addButton`. |
| `createButton(plugin)`    | `ToolbarButtonHandle`                   | Register a detached reusable action; no button appears until attached. IDs are reserved immediately.                                                                                                                    |
| `addButtonGroup(options)` | `ToolbarButtonGroupHandle`              | Create a custom group, optionally with initial buttons. IDs must be unique and nonempty.                                                                                                                                |
| `getButton(id)`           | `ToolbarButtonHandle \| undefined`      | Find a registered button, including detached ones.                                                                                                                                                                      |
| `getButtonGroup(id)`      | `ToolbarButtonGroupHandle \| undefined` | Find a custom group.                                                                                                                                                                                                    |
| `getButtons()`            | `readonly ToolbarButtonHandle[]`        | Snapshot of registered live handles in creation order, including detached buttons.                                                                                                                                      |
| `getGroups()`             | `readonly ToolbarButtonGroupHandle[]`   | Snapshot of custom group handles in creation order.                                                                                                                                                                     |

The method names use lower camel case: `addButtonGroup`, not `AddButtonGroup`. The editor accessor is `getToolBar()`.

```ts
import { buttonGroupTypes } from '@ldforge/editor';

const menuBar = editor.getToolBar();
menuBar.addButton({
  id: 'my-project.reset',
  label: 'Reset',
  execute(context) {
    context.setQuery('SELECT * WHERE { ?s ?p ?o } LIMIT 10');
  },
});

const group = menuBar.addButtonGroup({
  id: 'my-project.examples',
  type: buttonGroupTypes.dropdown,
  label: 'Example queries',
});
group.addButton({
  id: 'my-project.ask',
  label: 'ASK example',
  execute(context) {
    context.setQuery('ASK { ?s ?p ?o }');
  },
});

const button = menuBar.createButton({
  id: 'my-project.select',
  label: 'SELECT example',
  execute(context) {
    context.setQuery('SELECT * WHERE { ?s ?p ?o } LIMIT 10');
  },
});
const group2 = menuBar.addButtonGroup({
  id: 'my-project.inline',
  label: 'More examples',
  buttons: [button],
});
group2.addButton({
  id: 'my-project.construct',
  label: 'CONSTRUCT example',
  execute(context) {
    context.setQuery('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o } LIMIT 10');
  },
});
// Move the same SELECT handle into the dropdown later:
group.addButton(button);
```

## ButtonGroupOptions

| Property  | Type                             | Default / meaning                                                                                                                                                                         |
| --------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | `string`                         | Required unique, nonempty custom group ID.                                                                                                                                                |
| `type`    | `'buttons' \| 'dropdown'`        | `'buttons'`: the current adjacent button-group appearance.                                                                                                                                |
| `label`   | `LocalizedText?`                 | Visible dropdown label and accessible group/menu name. Defaults to the localized Example queries label for `examples`, otherwise the ID. Explicit labels may be a string or `{ en, nl }`. |
| `icon`    | `PluginIcon?`                    | Optional leading icon on a dropdown trigger, with the same factory contract as button icons.                                                                                              |
| `buttons` | `readonly ToolbarButtonInput[]?` | Initial actions: descriptors or same-toolbar handles, in order.                                                                                                                           |

`buttonGroupTypes` is a frozen exported constant: `{ buttons: 'buttons', dropdown: 'dropdown' }`. `ButtonGroupType` is the union of those values. You can use the strings directly or import the constants. There is no automatic overflow conversion: dropdowns are an explicit developer choice.

For initial configuration, groups receiving existing `buttons` appear where their first member was registered. Additional groups are appended in configuration order. Within a group, actions preserve insertion order. Runtime standalone actions and new groups append to project actions. The core query-action group and built-in tools remain separate; reserved `run` and `cancel` actions cannot be moved into custom groups.

## ToolbarButtonGroupHandle

| Member                | Type / result                        | Behavior                                                                                                 |
| --------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `id`, `type`, `label` | Readonly group identity/presentation | Live properties.                                                                                         |
| `isDeleted`           | `boolean`                            | True after group deletion or editor destruction.                                                         |
| `addButton(button)`   | `ToolbarButtonHandle`                | Append or move a descriptor/handle into the group.                                                       |
| `getButtons()`        | `readonly ToolbarButtonHandle[]`     | Detached array of the group's live handles in visual order.                                              |
| `setType(type)`       | `void`                               | Switch between adjacent buttons and a dropdown without changing actions or queries. Closes an open menu. |
| `setLabel(label)`     | `void`                               | Update the visible/accessibility label, supporting localization.                                         |
| `delete()`            | `void`                               | Remove the group and delete all actions still contained in it. Buttons moved elsewhere remain alive.     |

## ToolbarButtonHandle

| Member            | Type / result                  | Behavior                                                                                                                                  |
| ----------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `label`     | Readonly action identity/label | Live properties.                                                                                                                          |
| `groupId`         | `string \| undefined`          | Owning custom group ID; undefined for standalone, detached or core actions.                                                               |
| `isAttached`      | `boolean`                      | Whether mounted in a toolbar/group; false for detached/deleted handles and after editor destruction.                                      |
| `isDeleted`       | `boolean`                      | Whether deleted or its editor has been destroyed.                                                                                         |
| `getPlugin()`     | `ButtonPlugin`                 | Shallow descriptor snapshot; callbacks/icon factories retain identity.                                                                    |
| `update(changes)` | `void`                         | Change `label`, `title`, `icon`, `isDisabled` or `execute` through `ToolbarButtonUpdate`. IDs/group ownership are not changed by updates. |
| `delete()`        | `void`                         | Remove the action, release its ID and hide an empty group.                                                                                |

`ToolbarButtonInput` is `ButtonPlugin | ToolbarButtonHandle`. `ToolbarButtonUpdate` is `Partial<Omit<ButtonPlugin, 'id' | 'group'>>`. A handle belongs to exactly one toolbar. Foreign/deleted handles, duplicate IDs, empty IDs and unsupported group types throw. Deleting a button permits a new action with that ID; the old handle remains deleted. Handle mutation methods throw after deletion or editor destruction. Call `getToolBar()` only on a mounted IDE.

## Execution, localization and accessibility

Actions use the existing `ButtonPlugin` contract: `execute(context)`, icons, localized labels/tooltips and `isDisabled(context)`. Disabled state refreshes on edits and execution changes. Promise rejections and thrown actions appear in the IDE status. Hidden built-in controls remain governed by `controls` even if their actions are later registered through this API. An all-disabled dropdown has a disabled trigger; an empty group is hidden.

Dropdowns use native button/menu semantics and the browser's top layer when Popover is available. A fixed-position fallback is used otherwise. Menus stay within the viewport, scroll when needed, and reposition on scrolling/resizing. They do not allocate CodeMirror instances.

- Enter/Space or click toggles the trigger. ArrowDown opens at the first enabled action; ArrowUp opens at the last.
- ArrowUp/ArrowDown, Home/End and typed label prefixes move through enabled actions.
- Escape closes and restores trigger focus. Selecting an action also closes the menu.
- Tab closes and continues normal focus navigation; clicking outside dismisses the menu.
- Only one toolbar menu is open per editor. Locale changes update labels in place. Destroying the editor closes its menu and removes document/window listeners.

Custom toolbar configuration is host-owned, rather than part of the serializable query workspace. Reapply it when creating an editor; do not store handles in localStorage. `EditorContext` remains the query-focused context supplied to plugins; hosts use the `ForgeEditor` handle to access the toolbar.

## Dropdown width and separators

Set `dropdownWidth` on `ButtonGroupOptions` to a positive finite pixel width.
The default is at least 200 px or the trigger width. Configured widths are
clamped to the viewport with an 8 px margin on either side.

```ts
const examples = editor.getToolBar().addButtonGroup({
  id: 'examples',
  type: 'dropdown',
  label: 'Examples',
  dropdownWidth: 300,
  buttons: [selectButton, askButton, galleryButton],
});
examples.addSeparator(galleryButton.id);
```

`addSeparator(beforeButtonId)` inserts a horizontal divider before an existing
button in that group. Unknown button IDs throw; repeated calls for the same
button do not duplicate the divider. Dividers are shown only in dropdown mode,
are skipped by keyboard navigation, and do not appear in `getButtons()`. A divider
is removed when its following button is moved or deleted. It is hidden when that
button is hidden or there are no preceding visible buttons.
