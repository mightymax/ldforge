# Transport and results

## QueryExecutor and QueryRequest

`QueryExecutor` exposes `execute(request: QueryRequest): Promise<QueryResult>`. A request has readonly `query: string` and `signal: AbortSignal`. Forward the signal to fetch or your host backend. The host owns endpoint configuration, authentication, CORS and authorization.

## HttpExecutorOptions

`createHttpExecutor(options: HttpExecutorOptions): QueryExecutor` is exported by core.

| Property   | Type                               | Default    | Meaning                                                                                                      |
| ---------- | ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `endpoint` | `string`                           | Required   | Absolute HTTP/HTTPS endpoint. Other protocols reject during creation.                                        |
| `method`   | `'GET' \| 'POST'`                  | `'POST'`   | GET encodes query in the URL; POST sends it as application/sparql-query.                                     |
| `headers`  | `Readonly<Record<string, string>>` | `{}`       | Extra headers such as Authorization. Accept and Content-Type are managed case-insensitively by the executor. |
| `fetch`    | `typeof globalThis.fetch`          | Host fetch | Inject for custom transport/authentication or testing.                                                       |

Both methods support SELECT/ASK using SPARQL Results JSON, and CONSTRUCT/DESCRIBE using RDF. Graph queries request `application/n-triples, text/turtle;q=0.9`. The query form is recognized after leading comments and BASE/PREFIX declarations. GET preserves endpoint query parameters and replaces its query parameter. HTTP failures reject with `QueryExecutionError`, code `httpError`, and status. Invalid JSON/result shapes reject. `parseSparqlResults(data: unknown): QueryResult` validates and normalizes endpoint results independently.

## QueryResult

A discriminated union:

```ts
type QueryResult =
  | {
      readonly kind: 'bindings';
      readonly variables: readonly string[];
      readonly bindings: readonly Binding[];
    }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'graph'; readonly triples: readonly RdfTriple[] };
```

`Binding` maps variable names without sigils to `BindingTerm`. Unbound variables are absent. A term has readonly `type` (uri, bnode, literal or typed-literal), `value: string`, optional `datatype: string`, and optional `'xml:lang': string`.

`@ldforge/renderers` exports `createTableRenderer()`, `createCardsRenderer(options?)`, `createBooleanRenderer()`, and `createJsonRenderer()`. JSON shows the normalized result model in a read-only CodeMirror editor with syntax highlighting and a copy button with confirmation; it does not show the endpoint's raw response. Table cells use text, and boolean/table captions follow editor locale. Its RDF details toggle adds URI/blank-node notation, literal quoting and themed superscript datatype/language metadata without converting endpoint lexical values. Configure the initial mode with `createTableRenderer({ showRdfDetails: true })`; the default is false. See the [Table guide](../../docs/renderers.md#rdf-details).

## RDF graph execution

CONSTRUCT and DESCRIBE return `kind: 'graph'`, with a readonly `triples` array. `RdfTriple` has `subject`, `predicate` and `object` fields, each represented as a `BindingTerm`. Subjects are URI or blank-node terms, predicates are URIs, and objects can also be literals. Language tags and literal datatypes are retained. Duplicate triples are removed. Blank-node labels are local to the parsed response.

```sparql
CONSTRUCT { ?s ?p ?o }
WHERE { ?s ?p ?o }
LIMIT 10
```

The Table renderer displays `subject`, `predicate` and `object` columns; JSON exposes the normalized graph. Status reports the triple count and execution duration. CSV exports those three columns using the existing lexical-value rules. Cards and Charts do not interpret graph results as their named SELECT bindings.

Core exports:

- `isGraphQuery(query: string): boolean`: recognizes CONSTRUCT/DESCRIBE after leading comments, whitespace and BASE/PREFIX declarations.
- `parseRdfGraph(source: string, mediaType?: string, baseIRI?: string): Promise<Extract<QueryResult, { kind: 'graph' }>>`: parses Turtle (default) or N-Triples, rejects invalid RDF and unsupported media types, and uses the optional base IRI to resolve relative IRIs.
- `graphToBindings(result)`: projects a graph result to normalized SELECT-style bindings with `subject`, `predicate`, `object` columns without losing term metadata.

The HTTP executor uses the RDF response's Content-Type to choose the parser. It accepts `text/turtle` (including common Turtle MIME aliases), `application/n-triples`, and `text/plain` as N-Triples. A missing MIME type is parsed as Turtle, which also accepts N-Triples syntax. RDF/XML and JSON-LD are not accepted; the endpoint should honor the advertised Turtle/N-Triples formats. Named-graph datasets and quoted triple terms are outside this graph result model.

The N3 browser parser is dynamically imported only for RDF graph responses. Bundlers emit a separate lazy chunk; it is not part of initial SELECT/ASK loading. Unlike the optional chart CDN runtime, this parser dependency is installed with core and self-hosted by the application build. Parsing includes RDF validation and does not fetch linked IRIs.

## CSV export

The result toolbar provides an icon button labeled **Download CSV** (**CSV downloaden** in Dutch). It downloads `results.csv` locally, with UTF-8 content and media type `text/csv;charset=utf-8`. It appears only for a successful result, independently of whether a renderer supports it. Starting another query, cancelling, errors or changing query tabs clears the previous result and hides the download. Set `controls: { download: false }` to hide it.

The export always includes the complete result, regardless of the selected renderer. Graph results use subject/predicate/object columns. SELECT uses the declared variable order as column headers, one row per binding, empty fields for unbound values, absolute URI values and `_:`-prefixed blank-node identifiers. Commas, double quotes and line breaks are escaped with CSV quoting; records use CRLF. Empty results still include their headers. ASK exports a `boolean` column with one `true` or `false` row; these machine values are not localized.

CSV retains lexical values but does not encode datatype or language metadata. Values are exported unchanged, including spreadsheet formula-like text. Use the normalized JSON model when RDF term metadata is required.

`serializeResultsCsv(result: QueryResult): string` is exported by `@ldforge/core` for host-owned downloads or server use. It performs no DOM or network operations:

```ts
import { serializeResultsCsv } from '@ldforge/core';
const csv = serializeResultsCsv({ kind: 'boolean', value: true });
// "boolean\r\ntrue\r\n"
```

## QueryState

| Status    | Additional readonly data                    |
| --------- | ------------------------------------------- |
| `idle`    | None                                        |
| `running` | None                                        |
| `success` | `result: QueryResult`, `durationMs: number` |
| `error`   | `error: Error`                              |

Elapsed duration uses a monotonic clock around executor execution, including transport and result parsing, before rendering. The IDE status shows row count or ASK truth value with a localized duration.

## QueryController

Framework-independent core class, constructed with a QueryExecutor. `state` reads current state; `subscribe(listener)` returns unsubscribe; `run(query)` executes; `cancel()` returns to idle; `destroy()` aborts work and removes listeners. A run resolves after success/failure, recording errors in state. Running after destruction rejects.

A newer request cancels the previous request. Cancellation and identity checks suppress late replies/errors even when a transport ignores its signal. Tab switches cancel execution. Aborting fetch does not guarantee server-side query cancellation.

`QueryExecutionError` extends Error and exposes readonly `code` (emptyQuery or httpError) and optional `status`. Known codes can be translated by UI adapters; other backend error text is preserved.

## Portable endpoint headers

The demo honors a `sparql-endpoint` directive in the leading query-comment block.
It selects the endpoint on **Run**, updates the active connection and saved endpoint list,
and uses GET. Pasting or loading a query alone does not execute a request.

```sparql
# view=table
# sparql-endpoint=https://datasetregister.netwerkdigitaalerfgoed.nl/sparql
DESCRIBE <https://n2t.net/ark:/72166/dataset>
```

Embedded hosts enable the same behavior with the core adapter:

```ts
import { createHttpExecutor, createQueryEndpointExecutor } from '@ldforge/core';
const executor = createQueryEndpointExecutor({
  executor: createHttpExecutor({ endpoint: 'https://example.org/default' }),
  method: 'GET', // default; POST is also supported
});
// Pass executor to createEditor().
```

`QueryEndpointExecutorOptions` requires a fallback `executor`. Optional `method`,
`fetch` and `onEndpoint(endpoint, method)` configure header-directed requests.
Only absolute HTTP(S) URLs are accepted. Invalid values fail before a request;
without a leading endpoint directive, execution uses the supplied fallback.
Header-directed requests use a fresh HTTP executor with protocol headers rather
than inheriting fallback Authorization/custom headers. The same cancellation
signal reaches fetch. The notification runs after validation and before the HTTP
request; host callbacks should update connection UI without cancelling that request.

Each demo example explicitly declares either a public endpoint or local fixture
execution. All four basic examples choose local data. Live examples prepend their
own `sparql-endpoint` comment so a copied query carries its connection with it.
Adding such a header manually to a basic query opts into that live endpoint.
The Plugin wizard preserves this transport directive while updating renderers.

## Demo endpoint manager

The demo's gear panel lists saved endpoints with their HTTP method and current
selection. Add endpoint opens a blank URL/method/header form; Save endpoint adds
the profile without switching the connection. Select a saved endpoint or the
local fixture to activate it. Edit endpoint opens a separate draft; Cancel discards
it. Saving an active profile applies its changes, while saving another profile
keeps the active selection. Changing a profile URL clears its draft headers and
renames the saved entry on successful save. Duplicate saved URLs are rejected.

The demo persists URLs and methods and restores the active endpoint without
executing a query. Header values stay in memory per URL and are not restored after
reload. Public examples and `# sparql-endpoint` queries select their own connection
without inheriting stored session headers. The active URL below the editor has a
clipboard button with a brief copied checkmark. This manager is demo-owned host
code, not automatic persistence or credential management in `createHttpExecutor`.
