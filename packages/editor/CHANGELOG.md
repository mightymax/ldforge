# @ldforge/editor

## 1.2.1

### Patch Changes

- 5dea99e: Change the LDForge license from EUPL-1.2 to MIT. Update package license metadata, bundled LICENSE files and license documentation. Third-party dependencies retain their own licenses.
- Updated dependencies [5dea99e]
  - @ldforge/core@1.0.1
  - @ldforge/prefixes@1.0.1

## 1.2.0

### Minor Changes

- 6c49ebc: Add an icon-only keyboard-shortcut overview in the right toolbar. The localized modal automatically shows Mac or Windows/Linux combinations, supports Escape and focus return, and can be hidden with controls.keyboardHelp. Document the new control and toolbar order.

### Patch Changes

- 6c49ebc: Show tables at full height by default instead of inside a capped result panel. Add scroll: true and per-query table-scroll/table-height configuration, with Plugin wizard controls, to opt into a bounded viewport and large-result virtualization. Restore shared result-panel sizing when leaving the table. Update the renderer guide and packaged editor API documentation with defaults, validation, accessibility and performance considerations.
- 6c49ebc: Show the active platform's query-execution shortcut in Run tooltips (Command on Mac/iOS, Control on Windows/Linux), matching existing CodeMirror Mod bindings. Document keyboard shortcuts, focus scope, operating-system conflicts and host keymap extensions.

## 1.1.0

### Minor Changes

- 8baa24c: Add an accessible drag handle to resize the query editor, with keyboard controls and an option to hide it. Resizing switches to a fixed viewport and uses the existing row-count and auto-grow callbacks.
- 8a2dfbf: Complete variable names from the entire query, including variables used later in WHERE, while respecting subquery projections.

### Patch Changes

- 5d2a301: Style table search and filter inputs inside the embedded editor without relying on demo form styles.
