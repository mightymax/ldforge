import { describe, expect, it } from 'vitest';
import { createEndpointHistory } from '../apps/demo/src/endpoint-history.js';

function storage(initial: string | null = null) {
  let data = initial;
  return {
    getItem: () => data,
    setItem: (_key: string, value: string) => {
      data = value;
    },
  };
}

describe('demo endpoint history', () => {
  it('persists normalized endpoints, deduplicates and puts the most recent first', () => {
    const saved = storage();
    const history = createEndpointHistory(() => saved);
    history.remember('https://example.org');
    history.remember('https://other.example/sparql');
    history.remember('https://example.org/');
    expect(createEndpointHistory(() => saved).list()).toEqual([
      'https://example.org/',
      'https://other.example/sparql',
    ]);
  });
  it.each(['invalid JSON', '{}', 'null'])(
    'recovers from malformed data: %s',
    (data) => {
      const saved = storage(data);
      const history = createEndpointHistory(() => saved);
      expect(history.list()).toEqual([]);
      expect(history.remember('https://example.org')).toBe(true);
    },
  );
  it('filters invalid saved values and bounds history to 20 endpoints', () => {
    const saved = storage(
      JSON.stringify([
        null,
        42,
        'javascript:alert(1)',
        'broken',
        'https://example.org',
        'https://example.org/',
      ]),
    );
    const history = createEndpointHistory(() => saved);
    expect(history.list()).toEqual(['https://example.org/']);
    for (let index = 0; index < 25; index++)
      history.remember(`https://example.org/${index}`);
    expect(history.list()).toHaveLength(20);
    expect(history.list()[0]).toBe('https://example.org/24');
    expect(() => history.remember('file:///private')).toThrow('HTTP');
  });
  it('retains session choices if access to storage or writing is blocked', () => {
    const inaccessible = createEndpointHistory(() => {
      throw new Error('Denied');
    });
    expect(inaccessible.remember('https://example.org')).toBe(false);
    expect(inaccessible.list()).toEqual(['https://example.org/']);
    const unwritable = createEndpointHistory(() => ({
      getItem: () => '["https://saved.example/"]',
      setItem: () => {
        throw new Error('Full');
      },
    }));
    expect(unwritable.remember('https://example.org')).toBe(false);
    expect(unwritable.list()).toHaveLength(2);
  });
});

it('stores the method per endpoint while keeping authentication headers in memory only', () => {
  const saved = storage('["https://legacy.example/sparql"]');
  const history = createEndpointHistory(() => saved);
  expect(history.settings('https://legacy.example/sparql')).toEqual({
    method: 'POST',
    headers: {},
  });
  history.remember('https://example.org/sparql', {
    method: 'GET',
    headers: { Authorization: 'Bearer secret' },
  });
  history.remember('https://other.example/sparql');
  expect(history.settings('https://example.org/sparql')).toEqual({
    method: 'GET',
    headers: { Authorization: 'Bearer secret' },
  });
  expect(saved.getItem()).not.toContain('secret');
  const restored = createEndpointHistory(() => saved);
  expect(restored.settings('https://example.org/sparql')).toEqual({
    method: 'GET',
    headers: {},
  });
  expect(restored.list()).toContain('https://legacy.example/sparql');
});

it('stores the active endpoint separately and ignores malformed or unavailable preferences', async () => {
  const { readActiveEndpoint, saveActiveEndpoint } =
    await import('../apps/demo/src/endpoint-preference.js');
  localStorage.clear();
  expect(readActiveEndpoint()).toBe('');
  expect(saveActiveEndpoint('https://example.org')).toBe(true);
  expect(readActiveEndpoint()).toBe('https://example.org/');
  saveActiveEndpoint('javascript:alert(1)');
  expect(readActiveEndpoint()).toBe('');
  saveActiveEndpoint('bad URL');
  expect(readActiveEndpoint()).toBe('');
  saveActiveEndpoint('');
  expect(readActiveEndpoint()).toBe('');
  localStorage.clear();
});

it('replaces saved endpoints atomically, including session headers and renamed URLs', () => {
  const saved = storage();
  const history = createEndpointHistory(() => saved);
  history.remember('https://one.example/sparql', {
    method: 'POST',
    headers: { Authorization: 'Bearer old' },
  });
  history.remember('https://two.example/sparql');
  expect(() =>
    history.replace(
      'https://one.example/sparql',
      'https://two.example/sparql',
      { method: 'GET', headers: {} },
    ),
  ).toThrow('already exists');
  expect(history.settings('https://one.example/sparql').headers).toEqual({
    Authorization: 'Bearer old',
  });
  history.replace(
    'https://one.example/sparql',
    'https://renamed.example/sparql',
    { method: 'GET', headers: { 'X-Project': 'catalogue' } },
  );
  expect(history.list()).not.toContain('https://one.example/sparql');
  expect(history.settings('https://renamed.example/sparql')).toEqual({
    method: 'GET',
    headers: { 'X-Project': 'catalogue' },
  });
  expect(history.settings('https://one.example/sparql').headers).toEqual({});
  const restored = createEndpointHistory(() => saved);
  expect(restored.settings('https://renamed.example/sparql')).toEqual({
    method: 'GET',
    headers: {},
  });
  expect(saved.getItem()).not.toContain('catalogue');
  expect(() =>
    history.replace('https://unknown.example', 'https://new.example', {
      method: 'POST',
      headers: {},
    }),
  ).toThrow('Unknown');
});
