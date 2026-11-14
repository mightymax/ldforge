# Architecture

## Dependency boundaries

```text
Demo / host application
  ├── @ldforge/editor ── @ldforge/core
  │       ├── CodeMirror 6 + SPARQL Lezer grammar
  │       └── @ldforge/prefixes
  └── @ldforge/renderers ── @ldforge/core (types and localization)
```

Core contains no UI framework and makes no network request until an executor is called. Its DOM-facing renderer contract is a TypeScript interface and disappears at runtime. The query controller can also be used in Node.js or another UI.

The editor owns one CodeMirror view and one query controller per mount. The host passes in transport and renderer plugins. The renderer package is optional; the editor does not choose defaults on behalf of the host. CSS is an explicit package export, scoped under `.ldforge`, with accent and border custom properties.

## Query lifecycle

`idle → running → success | error`. Cancel returns to idle and aborts the active request. Starting another query aborts the previous request. Controller identity checks discard late results and late errors even if an executor ignores its abort signal. Empty input produces an error without calling the executor. Destroy aborts pending work, unsubscribes the view, disposes rendering resources, destroys CodeMirror, and removes the mounted section.

Run is disabled while a request is active. The keyboard shortcut and public API can start a replacement query. The host can read state through `getState()` and query text through `getQuery()`. `onQueryChange` bridges edits into host state without binding LDForge to a framework.

## Build and distribution

The repository uses npm workspaces and a single committed lockfile. Libraries compile with TypeScript to ESM, declaration files and source maps; build order follows dependencies. Public entry points are constrained with package `exports`. Packages include original source alongside declarations and source maps. An isolated consumer check installs real tarballs and verifies both runtime exports and TypeScript declarations. The demo resolves workspace source files through Vite aliases so `npm ci && npm run dev` works without prebuilding libraries.

Strict compiler options include unchecked index access and exact optional properties. ESLint and Prettier enforce consistent conventions. Vitest tests source behavior; Playwright tests actual browser behavior. GitHub Actions runs the full check command only for release tags. Root npm version hooks synchronize all five package versions and push main plus the release tag atomically.

## Migration from LDMax

1. Inventory the current LDMax editor features and expected query/result behavior.
2. Move domain-independent behavior into the relevant package, covered by regression tests.
3. Represent LDMax-specific buttons and renderers as host-owned plugins.
4. Implement an LDMax executor adapter for its authentication/backend contracts.
5. Mount LDForge in LDMax and compare behavior before replacing the old editor.

No existing LDMax code or dependencies have been copied into this foundation. A feature inventory is needed before claiming compatibility. Avoid importing LDMax domain models, routes, environment variables, or framework stores into the library packages.

## Deliberate initial limits

SPARQL Results JSON and RDF graph responses are supported; SPARQL Update remains outside the current contract. Results are kept in memory; the table virtualizes rendering above 500 rows and filters/sorts the loaded data locally. The resource inspector uses local graph triples or a host-supplied cancellable loader. The demo keeps up to 20 recently applied endpoints in browser localStorage, with an in-memory fallback when storage is unavailable. Persistence belongs to the demo host; the library does not store endpoints. The demo also persists query text, tab titles, the active tab, and a user language preference. Authentication headers stay in memory only. There is no automatic retry or telemetry. Plugin registration is static per editor mount; instantiate a new editor to change the plugin set. The exported generic registry can be used independently by other host UIs.

## Dependency maintenance

The workspace temporarily overrides `minimatch` to `^11.0.1` to avoid the globparts amplification advisory GHSA-g3hv-75wg-m249 in the lint toolchain. Review and remove this override once the upstream ESLint and TypeScript ESLint dependency ranges include a fixed version. The complete check command validates compatibility with this override.

## Integrated settings and localization

Settings plugins render inside the editor's collapsible gear panel. They receive the editor context and may return cleanup functions. An optional `updateLocale` callback updates labels without remounting controls or losing drafts. A built-in language selector is always available.

Language precedence is explicit user preference (`userLocale` or `setLocale`) → project `locale` → browser language list → English. Choosing `auto` clears the user override and restores the project/browser default. Each editor owns its own resolved language. Host persistence is supplied through `onLocaleChange`; the library does not access localStorage. Plugin labels can be plain strings or `{ en, nl }` objects. RDF values, SPARQL code, and arbitrary backend errors are not translated.

## Virtual query tabs

One `EditorView` and one active `EditorState` serve all tabs. Inactive tabs store only identifiers, optional titles, and query strings. Switching saves text through `onWorkspaceChange`, cancels pending work, clears results, and replaces the active state via `view.setState`. Undo history resets on tab switches, preventing undo from crossing query boundaries and keeping inactive tabs lightweight. The host can restore a validated `QueryWorkspace` and read snapshots with `getWorkspace()`. The demo writes snapshots synchronously on edits, renames, closes, creates, and switches. Blocked or full browser storage falls back to session-only editing.

## Query timing

Successful query state includes `durationMs`, measured with the monotonic `performance.now()` clock around executor execution, including transport and result parsing. It excludes renderer work. The IDE formats counts and durations for its active locale; ASK displays its boolean value instead of a row count. Cancellation and stale replies do not publish a success summary.

## Local SPARQL language support

The editor replaces its former legacy stream highlighter with `codemirror-lang-sparql`'s SPARQL grammar. CodeMirror maintains the incremental syntax tree. Cursor analysis probes the recovered tree with an IRI at the completion range to distinguish subject, predicate/path, object, SERVICE target and expression positions while editing incomplete queries. No regex is used to guess triple positions from punctuation inside strings or comments.

Previous variable suggestions use Var nodes, exclude comments and strings, and respect subquery projections. They represent earlier syntactic names, not a proof of runtime binding. Predicate candidates come from the host vocabulary or a small built-in list. Namespace candidates come from the independent `@ldforge/prefixes` data package, with project overrides. Choosing a completion atomically inserts the term and any missing PREFIX, preserving existing aliases and resolving conflicting names.

Diagnostics expose Lezer recovery ranges and undeclared-prefix ranges, with a quick fix when a namespace is known. They do not perform endpoint-aware semantic validation or certify SPARQL conformance. Error recovery can produce several follow-on messages for one malformed construct. Grammar coverage, cursor contexts, scope handling, prefix edits/undo and actual browser completion are regression-tested.

## Public tab facade and formatting

`getTabs()` exposes a live readonly-array interface populated with stable, frozen tab handles. It is distinct from plain serialized workspace records. Handles address IDs, not tab indexes, and may edit inactive text without activating a document. Every mutation flows through the same workspace callbacks as UI changes. Deleted IDs are not reused during an editor lifetime.

Formatting uses the SPARQL formatter's parser/printer, imported lazily and directly without its global browser entry point or CLI imports. It preserves comments and literals. The async operation captures the original tab ID/text and refuses to overwrite a newer edit or deleted/destroyed document. Only the active query owns CodeMirror state; inactive operations update strings. Built-in tool visibility is configured independently of API capabilities.

## API documentation

Object-based Markdown reference pages under `docs/api/` are rendered directly into the demo API site. The complete example is typechecked against built public declarations during `npm run check`. Consumer documentation assumes npm installation; maintainer-only publication steps live in `docs/publishing.md` and are never invoked by normal checks.

## Prefix catalog variants

The prefix package's root and /compact entry points load the 32-entry compact map. /extended loads the separately generated 3,623-entry snapshot. Both use shared search behavior over prefix and namespace only; entries have no labels. No extended data is imported through the compact graph. Developers select the editor map through sparql.prefixes. Conflicting conventional bindings are preserved per data set. The picker searches the complete map but renders at most 50 matches, and does not populate its list while initially hidden.

## Query presentation metadata

The editor captures query text and parses leading comment directives at execution time. Renderer context receives that snapshot, so later text edits cannot change an existing result's presentation. The requested view is applied once per execution, preserving subsequent manual selection. Cards is an independent result plugin with explicit binding names and locally scoped, allowlisted card styles. Prefix insertion keeps comment headers ahead of the prologue.

## Optional chart runtime

`@ldforge/charts` is a separate adapter depending only on core. It uses an external runtime ESM import by default, with a pinned Chart.js version and injectable URL/loader. No static runtime import links the chart library to any LDForge package. The synchronous renderer contract returns cleanup immediately; asynchronous initialization checks disposal before constructing a chart and destroys each instance on unmount. Validation and an accessible data table do not require the external runtime.

## RDF graph results

CONSTRUCT/DESCRIBE execution negotiates N-Triples or Turtle and imports the self-contained N3 browser parser on demand. A graph result retains RDF terms in a deduplicated triple array. Table and CSV share a subject/predicate/object projection; JSON retains the graph discriminator. SELECT/ASK negotiation and payloads stay unchanged.
