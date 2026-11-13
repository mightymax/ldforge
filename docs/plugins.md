# Plugin authoring

Plugins are ordinary TypeScript objects registered per editor instance. Identifiers must be non-empty and unique within their plugin category. Registration order determines toolbar and view-selector order. There is no global registry or automatic discovery.

## Button plugins

Provide `buttons` to replace the default toolbar. Include the built-in factories to retain Run and Cancel.

```ts
import {
  createEditor,
  createRunButton,
  createCancelButton,
} from '@ldforge/editor';
import type { ButtonPlugin } from '@ldforge/core';

const exampleButton: ButtonPlugin = {
  id: 'my-project.example',
  label: 'Load example',
  title: 'Replace the current query with an example',
  isDisabled: (context) => context.getState().status === 'running',
  execute(context) {
    context.setQuery('ASK { ?subject ?predicate ?object }');
    // context.run(), context.cancel(), context.getQuery() and
    // context.getState() are also available.
  },
};

// Inside your createEditor options:
// buttons: [createRunButton(), createCancelButton(), exampleButton]
```

`execute` may return a promise. Rejected actions are displayed in the editor status. `isDisabled` must be a pure, synchronous function; it is reevaluated after query edits and execution state changes. The host owns any external state. Toolbar plugins do not get unrestricted access to the editor DOM or the CodeMirror instance.

## Result renderer plugins

A result renderer has an identifier, a label, a support predicate, and a render function. The selector shows only renderers supporting the current result. The last selected view is retained when it also supports the next result; otherwise the first supported renderer is selected.

```ts
import type { ResultRendererPlugin } from '@ldforge/core';

export const countRenderer: ResultRendererPlugin = {
  id: 'my-project.count',
  label: 'Count',
  supports: (result) => result.kind === 'bindings',
  render(container, result) {
    if (result.kind !== 'bindings') return;
    const paragraph = container.ownerDocument.createElement('p');
    paragraph.textContent = `${result.bindings.length} rows`;
    container.replaceChildren(paragraph);
    // Return a function to clean up listeners, charts, or framework roots.
    return () => paragraph.remove();
  },
};

// Inside your createEditor options:
// renderers: [countRenderer, createTableRenderer(), createJsonRenderer()]
```

The editor clears the result container between renders and calls the previous cleanup function before switching views, changing query state, or destroying the editor. Rendering is synchronous; renderers with asynchronous work must manage their own cancellation in the cleanup function. Use `textContent` for RDF values. Plugins are trusted application code, not sandboxed extensions.

`QueryResult` is a discriminated union: `bindings` has ordered variable names and binding rows; `boolean` has a boolean value. Unbound variables are absent from a binding row. RDF term type, datatype, and language are retained. JSON view shows this normalized model, not the endpoint's raw response.

## CodeMirror extensions

Supply CodeMirror 6 extensions through the `extensions` option to configure themes, completions, or additional editor behavior. Core and renderer packages have no CodeMirror dependency. The built-in SPARQL extension provides Lezer-based highlighting, contextual completion and syntax diagnostics. Use `sparql.prefixes` and `sparql.predicates` in editor options to supply namespace and predicate catalogs.

## Transport integration

Implement `QueryExecutor.execute({ query, signal })` to integrate an existing backend. Return a normalized `QueryResult`; reject on errors. Forward the abort signal to network calls. Even when an executor ignores cancellation, the controller prevents obsolete results from replacing the current state. A cancelled operation may still continue on the server.

The HTTP executor defaults to direct POST with `application/sparql-query`. Set `method: 'GET'` to encode the query in the URL without a request body. Both methods request `application/sparql-results+json`; Accept and Content-Type are managed case-insensitively by the adapter. It supports SELECT and ASK only. Authentication policy, request limits, and endpoint configuration belong to the host application.

## Integrated settings plugins

Provide `settings` in the editor options to add host-owned controls inside the built-in gear panel:

```ts
import type { SettingsPlugin } from '@ldforge/core';

const settings: SettingsPlugin = {
  id: 'my-project.settings',
  label: { en: 'Project settings', nl: 'Projectinstellingen' },
  render(container, context) {
    const paragraph = container.ownerDocument.createElement('p');
    paragraph.textContent =
      context.getLocale() === 'nl'
        ? 'Je projectinstellingen'
        : 'Your project settings';
    container.append(paragraph);
    return () => paragraph.remove();
  },
  updateLocale(container, context) {
    const paragraph = container.querySelector('p');
    if (paragraph)
      paragraph.textContent =
        context.getLocale() === 'nl'
          ? 'Je projectinstellingen'
          : 'Your project settings';
  },
};
// In createEditor options: settings: [settings]
```

Keep endpoint authentication policy in the host. The demo's `createEndpointSettings` shows how to couple the HTTP executor and settings panel without placing credentials into persistent storage. It is an example host integration, not a library export.

## Language and workspace configuration

```ts
// Inside your createEditor options:
// locale: 'nl',             // Project default; omit or use 'auto' for browser detection.
// userLocale: 'en',         // Optional restored user choice, overriding the project.
// onLocaleChange: saveUserPreference,
// workspace: restoredWorkspace,
// onWorkspaceChange: saveWorkspace,

editor.setLocale('nl');
editor.setLocale('auto'); // Restore the project/browser default.
editor.getLocale();
editor.getWorkspace();
```

Button, renderer, and settings labels accept either strings or `{ en, nl }` translations. Renderer `render` receives an optional third argument `{ locale }`. Existing two-argument renderers remain supported. `SettingsPlugin.updateLocale` updates labels in place; it must preserve entered values and should not register new listeners. The host owns persistence, and should validate restored workspaces with `parseQueryWorkspace`.

## Action groups and language catalogs

Set `ButtonPlugin.group` to group related controls, for example `group: 'examples'`. Groups appear in order of their first registration; buttons preserve registration order within a group. The built-in Run and Cancel actions use the `query` group.

```ts
import { prefixes, searchPrefixes } from '@ldforge/prefixes';

const matches = searchPrefixes('schema');
// In createEditor options:
// sparql: {
//   prefixes: { ...prefixes, ex: 'https://example.org/' },
//   predicates: [
//     { iri: 'https://example.org/name', description: 'Resource name' },
//   ],
// }
```

The Prefixes button searches the effective namespace catalog. `addPrefix(view, prefix, namespace)` is also exported for CodeMirror integrations; it reuses existing namespaces or chooses a free alias. `sparqlLanguage`, `sparqlSupport`, `getSparqlContext`, `previousVariables`, `createSparqlCompletion` and `sparqlDiagnostics` are exported for hosts building their own editor UI. Queries are parsed locally; no endpoint is queried to obtain completion candidates.
