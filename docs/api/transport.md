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

Both methods request SPARQL Results JSON and support SELECT/ASK only. GET preserves endpoint query parameters and replaces its query parameter. HTTP failures reject with `QueryExecutionError`, code `httpError`, and status. Invalid JSON/result shapes reject. `parseSparqlResults(data: unknown): QueryResult` validates and normalizes endpoint results independently.

## QueryResult

A discriminated union:

```ts
type QueryResult =
  | {
      readonly kind: 'bindings';
      readonly variables: readonly string[];
      readonly bindings: readonly Binding[];
    }
  | { readonly kind: 'boolean'; readonly value: boolean };
```

`Binding` maps variable names without sigils to `BindingTerm`. Unbound variables are absent. A term has readonly `type` (uri, bnode, literal or typed-literal), `value: string`, optional `datatype: string`, and optional `'xml:lang': string`.

`@ldforge/renderers` exports `createTableRenderer()`, `createBooleanRenderer()`, and `createJsonRenderer()`. JSON renders the normalized result model, not the endpoint's raw response. Table cells use text, and boolean/table captions follow editor locale.

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
