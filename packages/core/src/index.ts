import type { Locale, LocalePreference, LocalizedText } from './locale.js';
export { resolveLocale, localize, translate } from './locale.js';
export type { Locale, LocalePreference, LocalizedText } from './locale.js';

/** SPARQL Results JSON terms. RDF values are data, never HTML. */
export interface BindingTerm {
  readonly type: 'uri' | 'bnode' | 'literal' | 'typed-literal';
  readonly value: string;
  readonly datatype?: string;
  readonly 'xml:lang'?: string;
}
export type Binding = Readonly<Record<string, BindingTerm>>;
export type QueryResult =
  | {
      readonly kind: 'bindings';
      readonly variables: readonly string[];
      readonly bindings: readonly Binding[];
    }
  | { readonly kind: 'boolean'; readonly value: boolean };

export interface QueryRequest {
  readonly query: string;
  readonly signal: AbortSignal;
}
export interface QueryExecutor {
  execute(request: QueryRequest): Promise<QueryResult>;
}
export type QueryState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | {
      readonly status: 'success';
      readonly result: QueryResult;
      readonly durationMs: number;
    }
  | { readonly status: 'error'; readonly error: Error };

export interface EditorContext {
  formatQuery(): Promise<string>;
  addPrefix(prefix: string, namespace?: string): string | undefined;
  getLocale(): Locale;
  setLocale(preference: LocalePreference): void;
  getQuery(): string;
  setQuery(query: string): void;
  getState(): QueryState;
  run(): Promise<void>;
  cancel(): void;
}
export interface ButtonPlugin {
  /** Actions sharing a group are displayed together as a button group. */
  readonly group?: string;
  readonly id: string;
  readonly label: LocalizedText;
  readonly title?: LocalizedText;
  readonly isDisabled?: (context: EditorContext) => boolean;
  execute(context: EditorContext): void | Promise<void>;
}
export interface ResultRendererPlugin {
  readonly id: string;
  readonly label: LocalizedText;
  supports(result: QueryResult): boolean;
  /** Return a cleanup function when allocating listeners or other resources. */
  render(
    container: HTMLElement,
    result: QueryResult,
    context?: { readonly locale: Locale },
  ): void | (() => void);
}

/** Host-owned settings mounted inside the IDE's settings panel. */
export interface SettingsPlugin {
  readonly id: string;
  readonly label: LocalizedText;
  render(container: HTMLElement, context: EditorContext): void | (() => void);
  /** Update labels without remounting inputs or losing drafts. */
  updateLocale?(container: HTMLElement, context: EditorContext): void;
}

/** Ordered, explicit registration: duplicate identifiers fail early. */
export class PluginRegistry<T extends { readonly id: string }> {
  readonly #plugins = new Map<string, T>();

  constructor(plugins: readonly T[] = []) {
    for (const plugin of plugins) this.register(plugin);
  }

  register(plugin: T): () => void {
    if (!plugin.id.trim())
      throw new Error('Plugin identifiers must not be empty.');
    if (this.#plugins.has(plugin.id))
      throw new Error(`Duplicate plugin: ${plugin.id}`);
    this.#plugins.set(plugin.id, plugin);
    return () => {
      if (this.#plugins.get(plugin.id) === plugin)
        this.#plugins.delete(plugin.id);
    };
  }

  list(): readonly T[] {
    return [...this.#plugins.values()];
  }
}

/** Owns cancellation and prevents stale requests from overwriting newer results. */
export class QueryController {
  #state: QueryState = { status: 'idle' };
  #request: AbortController | undefined;
  #listeners = new Set<(state: QueryState) => void>();
  #disposed = false;

  constructor(private readonly executor: QueryExecutor) {}

  get state(): QueryState {
    return this.#state;
  }

  subscribe(listener: (state: QueryState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #update(state: QueryState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener(state);
  }

  async run(query: string): Promise<void> {
    if (this.#disposed) throw new Error('Query controller has been destroyed.');
    this.#request?.abort();
    const request = new AbortController();
    this.#request = request;
    if (!query.trim()) {
      this.#update({
        status: 'error',
        error: new QueryExecutionError('emptyQuery', 'Enter a SPARQL query.'),
      });
      return;
    }
    this.#update({ status: 'running' });
    const startedAt = performance.now();
    try {
      const result = await this.executor.execute({
        query,
        signal: request.signal,
      });
      if (this.#request === request && !request.signal.aborted)
        this.#update({
          status: 'success',
          result,
          durationMs: performance.now() - startedAt,
        });
    } catch (cause) {
      if (this.#request === request && !request.signal.aborted) {
        this.#update({
          status: 'error',
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
      }
    }
  }

  cancel(): void {
    this.#request?.abort();
    this.#request = undefined;
    this.#update({ status: 'idle' });
  }

  destroy(): void {
    this.#request?.abort();
    this.#request = undefined;
    this.#listeners.clear();
    this.#disposed = true;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isTerm(value: unknown): value is BindingTerm {
  return (
    isObject(value) &&
    ['uri', 'bnode', 'literal', 'typed-literal'].includes(String(value.type)) &&
    typeof value.value === 'string' &&
    (value.datatype === undefined || typeof value.datatype === 'string') &&
    (value['xml:lang'] === undefined || typeof value['xml:lang'] === 'string')
  );
}

export function parseSparqlResults(data: unknown): QueryResult {
  if (!isObject(data)) throw new Error('Invalid SPARQL Results JSON.');
  if (typeof data.boolean === 'boolean')
    return { kind: 'boolean', value: data.boolean };
  if (
    isObject(data.head) &&
    Array.isArray(data.head.vars) &&
    data.head.vars.every((v) => typeof v === 'string') &&
    isObject(data.results) &&
    Array.isArray(data.results.bindings) &&
    data.results.bindings.every(
      (row: unknown) => isObject(row) && Object.values(row).every(isTerm),
    )
  ) {
    return {
      kind: 'bindings',
      variables: data.head.vars as string[],
      bindings: data.results.bindings as Binding[],
    };
  }
  throw new Error(
    'Invalid SPARQL Results JSON. Expected SELECT bindings or an ASK boolean.',
  );
}

/** Stable codes allow UI adapters to translate known execution errors. */
export class QueryExecutionError extends Error {
  constructor(
    readonly code: 'emptyQuery' | 'httpError',
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'QueryExecutionError';
  }
}

export interface HttpExecutorOptions {
  readonly endpoint: string;
  /** Defaults to direct POST; GET encodes the query in the URL. */
  readonly method?: 'GET' | 'POST';
  readonly headers?: Readonly<Record<string, string>>;
  /** Inject fetch for authentication, host integration, and deterministic tests. */
  readonly fetch?: typeof globalThis.fetch;
}

/** Executes SELECT/ASK using SPARQL Protocol GET or direct POST. */
export function createHttpExecutor(
  options: HttpExecutorOptions,
): QueryExecutor {
  const endpoint = new URL(options.endpoint);
  if (!['http:', 'https:'].includes(endpoint.protocol))
    throw new Error('Endpoint must use HTTP or HTTPS.');
  const method = options.method ?? 'POST';
  if (method !== 'GET' && method !== 'POST')
    throw new Error('Method must be GET or POST.');
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/sparql-results+json');
  if (method === 'POST')
    headers.set('Content-Type', 'application/sparql-query');
  else headers.delete('Content-Type');
  const fetcher = options.fetch ?? globalThis.fetch;
  return {
    async execute({ query, signal }) {
      const url = new URL(endpoint);
      if (method === 'GET') url.searchParams.set('query', query);
      const response = await fetcher(url.href, {
        method,
        headers: new Headers(headers),
        ...(method === 'POST' ? { body: query } : {}),
        signal,
      });
      if (!response.ok)
        throw new QueryExecutionError(
          'httpError',
          `SPARQL endpoint returned HTTP ${response.status}.`,
          response.status,
        );
      return parseSparqlResults(await response.json());
    },
  };
}
