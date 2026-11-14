import { expect, it, vi } from 'vitest';
import { createHttpExecutor, createQueryEndpointExecutor } from '@ldforge/core';
const response = () =>
  new Response(JSON.stringify({ boolean: true }), {
    headers: { 'Content-Type': 'application/sparql-results+json' },
  });
it('routes a leading endpoint header and otherwise uses the supplied executor', async () => {
  const fallback = {
    execute: vi.fn(async () => ({ kind: 'boolean' as const, value: false })),
  };
  const fetcher = vi.fn<typeof fetch>(async () => response());
  const onEndpoint = vi.fn();
  const executor = createQueryEndpointExecutor({
    executor: fallback,
    fetch: fetcher,
    onEndpoint,
  });
  const signal = new AbortController().signal;
  await expect(executor.execute({ query: 'ASK {}', signal })).resolves.toEqual({
    kind: 'boolean',
    value: false,
  });
  expect(fetcher).not.toHaveBeenCalled();
  await expect(
    executor.execute({
      query:
        '# view=table\n# sparql-endpoint=https://public.example/sparql\nASK {}',
      signal,
    }),
  ).resolves.toEqual({ kind: 'boolean', value: true });
  expect(onEndpoint).toHaveBeenCalledWith(
    'https://public.example/sparql',
    'GET',
  );
  expect(new URL(String(fetcher.mock.calls[0]?.[0])).origin).toBe(
    'https://public.example',
  );
  expect(fallback.execute).toHaveBeenCalledTimes(1);
});
it('does not carry fallback endpoint credentials to a shared query endpoint', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => response());
  const fallback = createHttpExecutor({
    endpoint: 'https://private.example/sparql',
    headers: { Authorization: 'Bearer private' },
    fetch: fetcher,
  });
  const executor = createQueryEndpointExecutor({
    executor: fallback,
    fetch: fetcher,
  });
  const signal = new AbortController().signal;
  await executor.execute({ query: 'ASK {}', signal });
  expect(
    new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization'),
  ).toBe('Bearer private');
  await executor.execute({
    query: '# sparql-endpoint=https://public.example/sparql\nASK {}',
    signal,
  });
  expect(
    new Headers(fetcher.mock.calls[1]?.[1]?.headers).has('authorization'),
  ).toBe(false);
  expect(fetcher.mock.calls[1]?.[1]?.signal).toBe(signal);
});
it('rejects invalid URLs before notification or fallback and ignores non-leading metadata', async () => {
  const fallback = {
    execute: vi.fn(async () => ({ kind: 'boolean' as const, value: false })),
  };
  const onEndpoint = vi.fn();
  const executor = createQueryEndpointExecutor({
    executor: fallback,
    onEndpoint,
  });
  const signal = new AbortController().signal;
  for (const endpoint of ['javascript:alert(1)', 'not-a-url'])
    expect(() =>
      executor.execute({
        query: `# sparql-endpoint=${endpoint}\nASK {}`,
        signal,
      }),
    ).toThrow();
  expect(onEndpoint).not.toHaveBeenCalled();
  expect(fallback.execute).not.toHaveBeenCalled();
  await executor.execute({
    query: 'ASK {}\n# sparql-endpoint=https://ignored.example/',
    signal,
  });
  expect(fallback.execute).toHaveBeenCalledTimes(1);
});
