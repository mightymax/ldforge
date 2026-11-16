# LDForge API

Build an embeddable SPARQL IDE with explicit configuration, live query tabs and independent result renderers. This reference describes the public API shipped by the five `@ldforge/*` packages.

## Install

```sh
npm install @ldforge/core @ldforge/editor @ldforge/renderers @ldforge/prefixes @ldforge/charts
```

Use an ESM browser application with CSS imports, such as Vite. No UI framework is required. Repository development and release instructions are separate from consumer installation.

## Complete example

Add `<div id="query-editor"></div>` to your page. The following is a complete TypeScript module; replace the endpoint with your own.

<!-- typecheck -->

```ts
import { createHttpExecutor, createSvgIcon } from '@ldforge/core';
import { createChartRenderer } from '@ldforge/charts';
import { createEditor } from '@ldforge/editor';
import {
  createCardsRenderer,
  createTableRenderer,
  createBooleanRenderer,
  createJsonRenderer,
} from '@ldforge/renderers';
import { prefixes } from '@ldforge/prefixes';
import '@ldforge/editor/styles.css';

const container = document.querySelector<HTMLElement>('#query-editor');
if (!container) throw new Error('Missing editor container');

const editor = createEditor(container, {
  executor: createHttpExecutor({
    endpoint: 'https://your-endpoint.example/sparql',
  }),
  query: 'select * where { ?s ?p ?o } limit 10',
  locale: 'auto',
  themeMainColor: '#1a80b9',
  controls: { prefixes: true, format: true, settings: true, download: true },
  sparql: { prefixes },
  renderers: [
    {
      ...createTableRenderer(),
      icon: createSvgIcon(['M3 3h18v18H3zM3 9h18M9 9v12']),
      documentationUrl: 'https://your-project.example/plugins/table',
    },
    createCardsRenderer(),
    createChartRenderer(),
    createBooleanRenderer(),
    createJsonRenderer(),
  ],
  onWorkspaceChange(workspace) {
    // The host decides whether and where to persist query text and tab names.
    console.log(workspace.activeId);
  },
});

// Opt-in dropdowns and runtime toolbar actions:
const menuBar = editor.getToolBar();
const examples = menuBar.addButtonGroup({
  id: 'project.examples',
  type: 'dropdown',
  label: 'Example queries',
});
const ask = menuBar.createButton({
  id: 'project.ask',
  label: 'ASK example',
  execute(context) {
    context.setQuery('ASK { ?s ?p ?o }');
  },
});
examples.addButton(ask);

// Folding changes presentation only; the complete query stays intact.
editor.setPrefixesCollapsed(true);
console.log(editor.arePrefixesCollapsed());
editor.setPrefixesCollapsed(false);

const tabs = editor.getTabs();
const first = tabs[0];
if (first) {
  first.rename('My first query');
  first.addPrefix('sdo', 'https://schema.org/');
  first.addPrefix('dct');
  editor.setThemeMainColor('#1a80b9');
  console.log(editor.getThemeMainColor());
  console.log(editor.getPrefixes(), first.getPrefixes());
  first.removePrefix('dct');
  editor.removePrefix('unused');
}

const second = tabs.addTab({
  name: 'People',
  query: 'select ?person where { ?person a ?type } limit 10',
  prefixes: ['sdo', 'dct'],
});
await second.formatQuery();

const people = tabs.getByName('People');
people?.activate();
// Call editor.destroy() from your component's unmount/cleanup hook.
```

## Object model

| Object                                | Purpose                                                | Reference                             |
| ------------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| `EditorOptions`                       | Initial configuration, controls, plugins and callbacks | [Configuration](configuration.md)     |
| `ForgeEditor`                         | One mounted IDE with one CodeMirror view               | [Editor](editor.md)                   |
| `ToolbarApi` / button & group handles | Live actions, adjacent groups and dropdown menus       | [Toolbar](toolbar.md)                 |
| `TabCollection`                       | Live, indexable collection of query-tab handles        | [Tabs](tabs.md)                       |
| `QueryTabHandle`                      | A stable tab identity with query and prefix methods    | [Query tab](tab.md)                   |
| `QueryWorkspace`                      | Serializable plain data for host persistence           | [Tabs](tabs.md#persistence)           |
| `PrefixEntry` / namespace map         | Common vocabulary namespace data                       | [Prefixes](prefixes.md)               |
| Plugin contracts                      | Additional actions, result views and settings          | [Plugins](plugins.md)                 |
| Execution and results                 | HTTP transport, cancellation and RDF result data       | [Transport and results](transport.md) |

## Design rules

- UI visibility and capabilities are separate. Hiding a button never disables its public API or acts as an authorization check.
- There is one editor view. Inactive tabs retain strings and optional names, not hidden editor instances.
- The host owns persistence. The demo saves workspace data, language, endpoint URLs and methods. Authentication headers stay in memory.
- Methods that return promises, including formatting and execution, must be awaited or handled with `.catch()`.
- The formatter and parser work locally. Requests are only sent when executing a query or by host-supplied code.
