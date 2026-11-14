# @ldforge/editor

An embeddable CodeMirror 6 SPARQL IDE with one editor view, virtual query tabs, NL/EN localization, syntax diagnostics, contextual completion and automatic PREFIX insertion. Includes independent action, result and settings plugins.

```sh
npm install @ldforge/editor @ldforge/core @ldforge/renderers @ldforge/prefixes
```

```ts
import { createEditor } from '@ldforge/editor';
import { createHttpExecutor } from '@ldforge/core';
import { createTableRenderer, createBooleanRenderer } from '@ldforge/renderers';
import '@ldforge/editor/styles.css';

const element = document.querySelector<HTMLElement>('#editor');
if (!element) throw new Error('Missing editor container');
const editor = createEditor(element, {
  executor: createHttpExecutor({
    endpoint: 'https://your-endpoint.example/sparql',
  }),
  query: 'select * where {?s ?p ?o} limit 10',
  controls: { prefixes: true, format: true, settings: true },
  renderers: [createTableRenderer(), createBooleanRenderer()],
});

const tabs = editor.getTabs();
const other = tabs.addTab({
  name: 'People',
  query: 'ask {?s ?p ?o}',
  prefixes: ['sdo', 'dct'],
});
await other.formatQuery();
other.addPrefix('ex', 'https://example.org/');
// editor.destroy() on host unmount.
```

## Collapsible prefixes

Click the gutter arrow beside PREFIX declarations to collapse or expand them.
Set `prefixesCollapsed: true` to start collapsed, or call
`editor.setPrefixesCollapsed(true)`, `editor.setPrefixesCollapsed(false)`,
`editor.togglePrefixes()` and `editor.arePrefixesCollapsed()` at runtime.
`controls.prefixFolding: false` hides gutter arrows while retaining the API.
Folding only changes presentation: execution and saved query text stay complete.
See [ForgeEditor](docs/api/editor.md#collapsible-prefix-declarations) for tab and
persistence behavior.

## API reference

The full object-based reference is included in the npm package and rendered by the demo site:

- [Configuration and every control default](docs/api/configuration.md)
- [Toolbar, reusable buttons and dropdown groups](docs/api/toolbar.md)
- [ForgeEditor lifecycle and methods](docs/api/editor.md)
- [TabCollection and serializable workspaces](docs/api/tabs.md)
- [QueryTabHandle properties and functions](docs/api/tab.md)
- [Prefixes and low-level language tools](docs/api/prefixes.md)
- [Plugin contracts](docs/api/plugins.md)
- [Transport and results](docs/api/transport.md)

Formatting returns a promise and loads its parser/printer on demand. Inactive tab operations do not allocate another editor view. Persistence is host-owned through onWorkspaceChange. controls only changes visibility; it does not disable public API methods. License: EUPL-1.2.

## Plugin wizard

The **Plugin wizard** icon is enabled by default in the right toolbar. It offers
only registered renderers and builds a query header with their options and binding
contract comments. Hide it with `controls.rendererWizard: false` or
`editor.getRendererWizard().setVisible(false)`. Use `generate()` for a header
without editing, or `apply()` to update the active query. See the
[API and preservation rules](docs/api/editor.md#plugin-wizard) and
[renderer-owned wizard metadata](docs/api/plugins.md#wizard-metadata).
