# @ldforge/editor

## 1.5.2

### Patch Changes

- 69382bd: Add syntax-aware automatic indentation for nested and incomplete SPARQL blocks, and align closing delimiters as they are typed (#16). Enable Tab/Shift+Tab indentation and Cmd+/ (macOS) or Ctrl+/ (Windows/Linux) to toggle `#` comments on the current line or all selected lines. Update the localized keyboard help and embedding documentation, including Escape then Tab to move focus out of the editor.

## 1.5.1

### Patch Changes

- 3be85dc: Collapse the editor's action toolbar into an accessible dropdown with a hamburger icon and localized labels on screens up to 540 px wide. Restore inline action buttons on larger screens while preserving configured dropdowns.

## 1.5.0

### Minor Changes

- 78ac00b: Add an optional resultsContainer to createEditor() and setResultsContainer() to move the complete live results panel between host containers or restore the classic layout. Preserve renderer selection, status, loading, errors, documentation, downloads, theme, localization and accessible instance IDs, and clean up owned DOM from both hosts on destroy().

## 1.4.1

### Patch Changes

- b2b5313: Add shared SPARQL, RDF and linked-data npm keywords plus package-specific keywords to improve package discoverability.
- Updated dependencies [b2b5313]
  - @ldforge/core@1.0.2
  - @ldforge/prefixes@1.0.2

## 1.4.0

### Minor Changes

- 77e66a6: Add a subtle About LDForge icon to the editor footer with copyright, MIT license, GitHub, documentation and release-note links with matching icons, a miniature LDForge logo linking to the project website and an aligned copyright row at the bottom. The accessible popover supports outside-click and Escape dismissal. Hide it with controls.about: false.

## 1.3.0

### Minor Changes

- 113a664: Add an optional shortenShareUrl callback for host-owned synchronous or asynchronous URL shortening. Share actions wait for a valid HTTP(S) URL, report recoverable failures without copying, and discard stale results when the share context changes. Expose pending state for shortening and document integration and an ORM service example.
- 113a664: Display the plugin wizard as an inline toolbar panel using the same surface, active-icon highlight, toggle and Escape behavior as Prefixes, sharing, keyboard shortcuts and settings. Keep only one panel open, remove the separate Close button and modal focus trap, and preserve the public wizard API and undoable header application.
- 113a664: Add compact Add missing prefixes and Remove unused prefixes actions to the prefix panel, with Dutch labels and accessible feedback. Use syntax-aware analysis, preserve strings, comments and used aliases, add only namespaces from the configured catalog, and apply each batch as one undoable edit. Keep declarations intact when syntax errors make removal uncertain.
- 113a664: Expand the share toolbar action into a localized, responsive inline panel with individually copyable editor links, SPARQL GET URLs, shell-quoted POST/GET cURL commands and a one-line query representation. Populate host-shortened links automatically, optionally including an explicitly opted-in execution variant. Retain the full link during shortening failures, reject stale snapshots, and report retryable service and clipboard errors. Preserve getShareLink() and copyShareLink() semantics; opening or copying from the panel does not edit or execute the query. Related: #14 and #11.

  Use compact single-line fields and accessible clipboard icons that temporarily show an animated checkmark after copying, with reduced-motion support and screen-reader confirmation. Keep endpoint-dependent entries visible but disabled when no endpoint is configured. Safely remove comments and convert multiline literals for the one-line query, with an original-source fallback for incomplete literals.

  Match Prefixes, sharing, settings and keyboard shortcuts as mutually exclusive inline panels with consistent styling, highlighted toolbar toggles, Escape handling and focus restoration. The toolbar icon replaces separate Close buttons; keyboard help no longer opens a modal.

### Patch Changes

- 113a664: Move Format query to the first position in the editor tools group, before Prefixes.
- 113a664: Apply one shared hover overlay to every enabled editor button instead of separate button-specific treatments. Preserve neutral, selected and theme-colored primary backgrounds and leave disabled buttons unchanged.

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
