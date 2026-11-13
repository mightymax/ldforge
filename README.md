# LDForge

Composable, framework-independent SPARQL tooling, designed to bring the LDMax editor into other applications. This repository establishes the standalone architecture; the existing LDMax implementation has **not yet been migrated**.

LDForge separates query execution, editor actions, and result presentation. It uses TypeScript in strict mode, CodeMirror 6 for query editing, and explicit plugin registration without global state.

## Try the demo

Requires Node.js 22.12 or newer and npm. No backend, account, environment variables, or external endpoint is required.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Run the example SELECT query, switch between Table and JSON, or use the ASK example button. Fixture mode returns deterministic sample data; it does not evaluate SPARQL.

Use the **gear button inside the IDE** to configure an endpoint, choose GET/POST, add headers, or change the language. Applied endpoints and request methods are saved in browser localStorage. Header values remain in memory for this page only and are isolated per endpoint. Browser CORS rules still apply. The demo restores the last applied endpoint and method after a refresh, without automatically running a query. Choose the local fixture to return to example data. SELECT and ASK results are supported.

Create queries with **+**, switch tabs, and rename a tab by double-clicking its name or using its pencil button. Enter or leaving the name field saves it; Escape cancels. Query text, titles, and the active tab are saved to localStorage when editing or switching. There is one CodeMirror view and one active editor state: inactive tabs store plain text only. Switching cancels a running query and resets undo history and results.

The IDE follows the first supported browser language (English or Dutch), with English fallback. A project can set `locale`; a user choice under the gear button takes precedence and is remembered by the demo. Demo introduction and integration documentation remain in English. Query completion reports a compact count and elapsed execution time, such as `3 results in 124 ms` or `3 resultaten in 1,25 s`.

## Packages

| Package              | Responsibility                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@ldforge/core`      | RDF result types, plugin contracts, registry, query lifecycle, and HTTP executor; no DOM runtime dependency |
| `@ldforge/editor`    | CodeMirror editor, button plugins, keyboard shortcut, result plugin selection, lifecycle and styles         |
| `@ldforge/prefixes`  | Curated common namespace catalog, ready-to-use map and search helper                                        |
| `@ldforge/renderers` | Independent table, boolean, and normalized JSON renderers                                                   |
| `apps/demo`          | Minimal Vite host with fixture/live execution and custom action plugins                                     |

The editor depends only on core and CodeMirror. Default result renderers are supplied by the host, so another application can use its own rendering stack.

## Embed the editor

Install the public ESM packages from npm:

```sh
npm install @ldforge/core @ldforge/editor @ldforge/renderers @ldforge/prefixes
```

Use a browser bundler with CSS imports. Complete configuration and object references are available in the demo's **API reference** and in [docs/api](docs/api/overview.md). Maintainers should follow the separate [npm publishing guide](docs/publishing.md).

```ts
import { createHttpExecutor } from '@ldforge/core';
import { createEditor } from '@ldforge/editor';
import {
  createTableRenderer,
  createBooleanRenderer,
  createJsonRenderer,
} from '@ldforge/renderers';
import '@ldforge/editor/styles.css';

const container = document.querySelector<HTMLElement>('#query-editor');
if (!container) throw new Error('Missing editor container');

const editor = createEditor(container, {
  query: 'SELECT * WHERE { ?s ?p ?o } LIMIT 10',
  executor: createHttpExecutor({
    endpoint: 'https://your-endpoint.example/sparql',
  }),
  renderers: [
    createTableRenderer(),
    createBooleanRenderer(),
    createJsonRenderer(),
  ],
});

// Call when your host component unmounts:
// editor.destroy();
```

The host owns endpoint configuration and authentication. Inject a `QueryExecutor` for a backend proxy, fixtures, or custom transport. Inject `fetch` or headers into `createHttpExecutor` for host-specific HTTP behavior. Never put private server credentials in a browser bundle.

## SPARQL assistance and prefixes

The editor uses a SPARQL Lezer grammar for syntax trees, highlighting, local diagnostics and completion. Press **Ctrl+Space** for suggestions. Predicates are offered in predicate/path positions, variables come from previous syntactic occurrences in the visible query scope, and comments, strings and IRI contents are excluded. SERVICE, FILTER, nested triples, semicolon and comma positions are recognized structurally. These are local editor features, not a language-server integration or a guarantee of semantic query correctness.

Choosing a predicate completion inserts any missing PREFIX in the same undoable edit. Existing aliases are reused; conflicting names receive a suffix. Known undeclared prefixes have a diagnostic quick fix. Use **Prefixes** in the toolbar to search and insert namespaces without completing a predicate.

```ts
import { prefixes, searchPrefixes } from '@ldforge/prefixes';

searchPrefixes('prov');
// In createEditor options:
// sparql: {
//   prefixes: { ...prefixes, ex: 'https://example.org/' },
//   autoPrefixes: false, // Optional: disable automatic declarations while typing.
//   predicates: [{ iri: 'https://example.org/name', description: 'Name' }],
// }
```

The prefix package has a compact catalog (32 mappings, the default) and an extended catalog (3,623 mappings). Import `prefixes` from `@ldforge/prefixes/compact` or `@ldforge/prefixes/extended` and pass it as `sparql: { prefixes }`. Entries contain only prefix and namespace, without labels. Compact imports do not load the extended data. Neither catalog makes network requests. Omit `predicates` to use the small built-in RDF vocabulary, or provide your own project vocabulary. Prefix names and namespace HTTP/HTTPS identifiers are preserved exactly. Toolbar actions can set a `group` identifier to form compact button groups. Prefix search, formatting and settings are icon-only core tools on the right; host actions are separated. Use `controls` to toggle every built-in control without disabling its API.

## Development and tests

```sh
npm run typecheck      # Strict TypeScript across packages, demo and tests
npm run lint           # ESLint
npm run format:check   # Prettier
npm test               # Unit and DOM integration tests
npm run test:coverage  # Enforced coverage thresholds and HTML report
npm run build          # ESM libraries, declarations, source maps and demo
npm run test:docs      # Typecheck the complete documented API example
npm run test:packages  # Install real tarballs and typecheck an isolated consumer
npx playwright install chromium
npm run test:e2e       # Real-browser demo tests
npm run check          # All of the above checks (browser must be installed)
```

See the [configuration reference](docs/api/configuration.md), [editor API](docs/api/editor.md), [tab API](docs/api/tab.md), [npm publishing guide](docs/publishing.md), [plugin authoring](docs/plugins.md), [architecture](docs/architecture.md), [language and editor evaluation](docs/editor-language-support.md), [testing](docs/testing.md), and [contributing](CONTRIBUTING.md).

## Current scope

This is a working foundation, not feature parity with LDMax. SELECT/ASK, cancellation, syntax highlighting, history, Lezer-based syntax diagnostics and contextual completion, custom buttons, settings plugins, EN/NL localization, virtual query tabs, execution timing, and interchangeable result renderers are included. CONSTRUCT/DESCRIBE execution, SPARQL Update execution, endpoint-backed vocabulary discovery, full semantic query validation, virtualization, and migration of LDMax-specific behavior are follow-up work. The table renderer targets small and medium result sets; the host should limit queries or register a paginated/virtualized renderer for large results.

## License

Licensed under the [European Union Public Licence 1.2](LICENSE), SPDX identifier `EUPL-1.2`. Full license text is included in each library package. See the [official EUPL versions](https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12). Third-party dependencies retain their own licenses.
