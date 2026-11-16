# @ldforge/yasgui

A separate Yasgui 4 compatibility facade backed by LDForge. Existing integrations
using the supported API keep their constructor, options, tab calls and event
listeners. The interface is the native LDForge editor: the same toolbar, virtual
query tabs, settings and result views. The compatibility module only translates the
developer API; it adds no Yasgui-style UI, endpoint field, tab bar or custom CSS.
No Yasgui, Yasqe, Yasr or CodeMirror 5 runtime is loaded.

```sh
npm install @ldforge/yasgui
```

Change the imports (including the stylesheet):

```js
import Yasgui from '@ldforge/yasgui';
import '@ldforge/yasgui/styles.css';

const yasgui = new Yasgui(document.getElementById('yasgui'), {
  requestConfig: { endpoint: 'https://dbpedia.org/sparql' },
  yasqe: { value: 'SELECT * WHERE { ?s ?p ?o } LIMIT 10' },
});
yasgui.getTab().getYasqe().setValue('ASK { ?s ?p ?o }');
yasgui.on('queryResponse', (instance, tab) => console.log(tab.getResult()));
await yasgui.getTab().query();
// On unmount:
yasgui.destroy();
```

For script-tag integrations, replace the Yasgui JS and CSS URLs with the
`dist/yasgui.min.js` and `dist/yasgui.css` files from this package. The standalone
bundle exposes `window.Yasgui`, so `new Yasgui(element, options)` stays the same.
See [the standalone example](../../examples/yasgui/index.html).

## Supported surface

- `new Yasgui(parent, config)`, mutable `Yasgui.defaults`, `Yasgui.Tab`, `rootEl`,
  `config`, `destroy()` (idempotent).
- `getTab(id?)`, `addTab(setActive = true, partialTabConfig?)`,
  `selectTabId(id)`, `createTabName(name?)`, `tabNameTaken(name)`.
  `selectTabId` returns the previously active tab, like upstream.
- Tab: `getId()`, `name()`, `getName()`, `setName(name)`, `getQuery()`,
  `setQuery(query)`, `getEndpoint()`, `setEndpoint(endpoint)`,
  `getRequestConfig()`, `getPersistedJson()`, `select()`, `close()`, `query()`.
- `getYasqe()`: `getValue()`, `setValue()`, `query()`, `abortQuery()`,
  `focus()`, `refresh()`; `refresh()` needs no work in CodeMirror 6.
- Options: `autofocus`, `autoAddOnInit`, `copyEndpointOnNewTab`, `tabName`,
  `yasqe.value`, `yasqe.readOnly`, `yasqe.showQueryButton`.
- Request options: `endpoint`, `method` (GET/POST), `headers`, `args` (name/value
  pairs), `defaultGraphs`, `namedGraphs`, `withCredentials`. Each also accepts a
  function receiving the Yasgui instance. `adjustQueryBeforeRequest(yasqe)` can
  return replacement text. POST uses SPARQL Protocol form encoding.
- SELECT, ASK and RDF graph results use LDForge's table, boolean and JSON renderers.
- `on`, `once`, `off`, `removeListener`, `removeAllListeners`, `emit` on the
  instance, tab and Yasqe facade.
- Instance events: `tabAdd(instance, id)`, `tabSelect(instance, id)`,
  `tabClose(instance, tab)`, `tabChange(instance, tab)`, `query(instance, tab)`,
  `queryAbort(instance, tab)`, `queryResponse(instance, tab)`.
- Tab events: `change(tab, config)`, `close(tab)`, `endpointChange(tab, endpoint)`,
  `query(tab)`, `queryAbort(tab)`, `queryResponse(tab)`.
- Yasqe events: `change(yasqe)`, `query(yasqe)`, `queryAbort(yasqe)`,
  `queryResponse(yasqe)`.

All tabs share one native LDForge editor and CodeMirror view. Each tab retains
its own text, endpoint and last API result. Native tab actions and compatibility
calls update the same workspace and emit the same compatibility events. Native
LDForge functionality is accessible through `yasgui.editor` (also `tab.editor`).
`tab.getResult()` returns LDForge's typed result, not a Yasr parser.

Queries on the active tab run through the native editor and display results and
errors there. Queries on an inactive tab execute in the background without
changing the selection or visible result; use `getResult()` to read their result.
`query()` rejects on request errors. Switching native tabs cancels the active
editor request, as in LDForge.

Native tab behavior is preserved: at least one tab remains open, and
`autoAddOnInit: false` is unsupported. `yasqe.readOnly` and
`yasqe.showQueryButton` apply to the shared editor; conflicting per-tab overrides
are rejected. Configure endpoints through `requestConfig` or `setEndpoint()`;
the adapter does not add endpoint UI.

## Persistence and compatibility boundaries

Set `persistenceId: 'my-editor'` to persist tab text, names, request configuration
and selection in localStorage. The default is `null` (disabled). Function IDs
receive the instance. Storage uses `ldforge:yasgui:<id>` with a versioned schema;
existing Yasgui storage is not imported or overwritten. Request configuration
functions, credentials supplied by functions, and results are not persisted.
Reapply dynamic request configuration in the constructor. Storage failures do not
prevent editing.

This is a supported subset of the upstream
[Yasgui API](https://github.com/TriplyDB/Yasgui/tree/master/packages/yasgui/src),
not a complete emulation. Unknown configuration keys throw a descriptive error
before mounting. In particular, Yasr plugins/configuration, `getYasr()`, the
CodeMirror 5 API, custom Yasqe completers, endpoint catalogues/history, CORS proxies,
URL share/import helpers, fullscreen, tab reordering/restore and `addTab`'s third
argument are not implemented. Do not pass these options unchanged. `populateFromUrl`
only accepts `false`. DOM classes and visual appearance follow LDForge; old Yasgui
CSS customizations require migration. `fetch` is an additive option for host
integration and tests. LDForge's native plugin API remains available separately.

License: MIT.
