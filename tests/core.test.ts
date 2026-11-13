import { describe, expect, it, vi } from 'vitest';
import {
  createHttpExecutor,
  parseSparqlResults,
  PluginRegistry,
  QueryController,
} from '@ldforge/core';
import type { QueryRequest, QueryResult } from '@ldforge/core';

const result: QueryResult = { kind: 'boolean', value: true };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('plugin registry', () => {
  it('preserves order and rejects duplicate or blank identifiers', () => {
    const registry = new PluginRegistry([{ id: 'one' }]);
    const unregister = registry.register({ id: 'two' });
    expect(registry.list().map((p) => p.id)).toEqual(['one', 'two']);
    expect(() => registry.register({ id: 'one' })).toThrow('Duplicate');
    expect(() => registry.register({ id: ' ' })).toThrow('empty');
    unregister();
    registry.register({ id: 'two' });
    unregister();
    expect(registry.list()).toHaveLength(2);
  });
});

describe('query lifecycle', () => {
  it('emits running and success; unsubscribes listeners', async () => {
    const controller = new QueryController({
      execute: vi.fn().mockResolvedValue(result),
    });
    const listener = vi.fn();
    expect(controller.state.status).toBe('idle');
    const unsubscribe = controller.subscribe(listener);
    await controller.run('ASK {}');
    expect(listener.mock.calls.map(([state]) => state.status)).toEqual([
      'running',
      'success',
    ]);
    expect(controller.state).toEqual({
      status: 'success',
      result,
      durationMs: expect.any(Number),
    });
    unsubscribe();
    controller.cancel();
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it('rejects empty queries without contacting the executor', async () => {
    const execute = vi.fn();
    const controller = new QueryController({ execute });
    await controller.run('  ');
    expect(execute).not.toHaveBeenCalled();
    expect(controller.state.status).toBe('error');
  });
  it.each([new Error('Offline'), 'Offline'])(
    'normalizes executor errors: %s',
    async (error) => {
      const controller = new QueryController({
        execute: vi.fn().mockRejectedValue(error),
      });
      await controller.run('SELECT * {}');
      expect(controller.state).toEqual({
        status: 'error',
        error: new Error('Offline'),
      });
    },
  );
  it('aborts earlier requests and ignores their late successful results', async () => {
    const first = deferred<QueryResult>();
    const second = deferred<QueryResult>();
    const requests: QueryRequest[] = [];
    const controller = new QueryController({
      execute: (request) => {
        requests.push(request);
        return requests.length === 1 ? first.promise : second.promise;
      },
    });
    const a = controller.run('ASK { ?a ?b ?c }');
    const b = controller.run('ASK {}');
    expect(requests[0]?.signal.aborted).toBe(true);
    second.resolve(result);
    await b;
    first.resolve({ kind: 'boolean', value: false });
    await a;
    expect(controller.state).toEqual({
      status: 'success',
      result,
      durationMs: expect.any(Number),
    });
  });
  it('ignores late errors after cancellation', async () => {
    const request = deferred<QueryResult>();
    const controller = new QueryController({ execute: () => request.promise });
    const pending = controller.run('ASK {}');
    controller.cancel();
    request.reject(new Error('Late error'));
    await pending;
    expect(controller.state.status).toBe('idle');
  });
  it('aborts on destroy and refuses new queries', async () => {
    const request = deferred<QueryResult>();
    let signal: AbortSignal | undefined;
    const controller = new QueryController({
      execute: (r) => {
        signal = r.signal;
        return request.promise;
      },
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    const pending = controller.run('ASK {}');
    controller.destroy();
    expect(signal?.aborted).toBe(true);
    request.resolve(result);
    await pending;
    expect(listener).toHaveBeenCalledTimes(1);
    await expect(controller.run('ASK {}')).rejects.toThrow('destroyed');
  });
});

describe('SPARQL Results JSON', () => {
  it('parses ASK false and SELECT with unbound variables and RDF metadata', () => {
    expect(parseSparqlResults({ head: {}, boolean: false })).toEqual({
      kind: 'boolean',
      value: false,
    });
    const bindings = [
      { x: { type: 'literal', value: 'Amsterdam', 'xml:lang': 'en' } },
      {},
    ];
    expect(
      parseSparqlResults({ head: { vars: ['x'] }, results: { bindings } }),
    ).toEqual({ kind: 'bindings', variables: ['x'], bindings });
  });
  it.each([
    null,
    [],
    {},
    { boolean: 'false' },
    { head: { vars: [42] }, results: { bindings: [] } },
    {
      head: { vars: ['x'] },
      results: { bindings: [{ x: { type: 'script', value: 'bad' } }] },
    },
    {
      head: { vars: ['x'] },
      results: { bindings: [{ x: { type: 'literal', value: 5 } }] },
    },
    {
      head: { vars: ['x'] },
      results: {
        bindings: [{ x: { type: 'literal', value: 'a', datatype: 42 } }],
      },
    },
    {
      head: { vars: ['x'] },
      results: {
        bindings: [{ x: { type: 'literal', value: 'a', 'xml:lang': 42 } }],
      },
    },
  ])('rejects malformed endpoint data %#', (data) => {
    expect(() => parseSparqlResults(data)).toThrow('Invalid SPARQL');
  });
});

describe('HTTP executor', () => {
  it('sends direct POST, negotiates results and forwards cancellation and host headers', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ boolean: true })));
    const signal = new AbortController().signal;
    const executor = createHttpExecutor({
      endpoint: 'https://example.org/sparql',
      fetch,
      headers: { Authorization: 'Bearer test' },
    });
    expect(await executor.execute({ query: 'ASK {}', signal })).toEqual(result);
    expect(fetch).toHaveBeenCalledWith('https://example.org/sparql', {
      method: 'POST',
      body: 'ASK {}',
      signal,
      headers: new Headers({
        Authorization: 'Bearer test',
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/sparql-query',
      }),
    });
  });
  it('reports HTTP failures', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('Unavailable', { status: 503 }));
    await expect(
      createHttpExecutor({ endpoint: 'https://example.org', fetch }).execute({
        query: 'ASK {}',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('HTTP 503');
  });
  it('uses host fetch by default and rejects non-HTTP endpoints', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ boolean: false })));
    vi.stubGlobal('fetch', fetch);
    try {
      await createHttpExecutor({ endpoint: 'https://example.org' }).execute({
        query: 'ASK {}',
        signal: new AbortController().signal,
      });
      expect(fetch).toHaveBeenCalledOnce();
      expect(() => createHttpExecutor({ endpoint: 'file:///private' })).toThrow(
        'HTTP',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('HTTP request methods', () => {
  it('encodes GET queries without a body and preserves endpoint parameters across calls', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify({ boolean: true })),
      );
    const signal = new AbortController().signal;
    const executor = createHttpExecutor({
      endpoint:
        'https://example.org/sparql?default-graph-uri=https%3A%2F%2Fexample.org%2Fgraph&query=old',
      method: 'GET',
      headers: {
        Authorization: 'Bearer test',
        accept: 'text/html',
        'content-type': 'text/plain',
      },
      fetch,
    });
    const query = 'ASK { ?s ?p "é & + #" }';
    await executor.execute({ query, signal });
    await executor.execute({ query: 'ASK {}', signal });
    const [url, init] = fetch.mock.calls[0] ?? [];
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get('query')).toBe(query);
    expect(parsed.searchParams.getAll('query')).toHaveLength(1);
    expect(parsed.searchParams.get('default-graph-uri')).toBe(
      'https://example.org/graph',
    );
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
    expect(init?.signal).toBe(signal);
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer test');
    expect(headers.get('accept')).toBe('application/sparql-results+json');
    expect(headers.has('content-type')).toBe(false);
    expect(
      new URL(String(fetch.mock.calls[1]?.[0])).searchParams.get('query'),
    ).toBe('ASK {}');
  });
  it('uses protocol headers case-insensitively for POST', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ boolean: true })));
    await createHttpExecutor({
      endpoint: 'https://example.org',
      method: 'POST',
      headers: {
        accept: 'text/html',
        'content-type': 'text/plain',
        'X-Api-Key': 'test',
      },
      fetch,
    }).execute({ query: 'ASK {}', signal: new AbortController().signal });
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get('content-type')).toBe('application/sparql-query');
    expect(headers.get('accept')).toBe('application/sparql-results+json');
    expect(headers.get('x-api-key')).toBe('test');
  });
});

it('records elapsed executor time using a monotonic clock', async () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(100);
  try {
    const controller = new QueryController({
      execute: async () => {
        clock.mockReturnValue(225);
        return result;
      },
    });
    await controller.run('ASK {}');
    expect(controller.state).toEqual({
      status: 'success',
      result,
      durationMs: 125,
    });
  } finally {
    clock.mockRestore();
  }
});
