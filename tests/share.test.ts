import { afterEach, expect, it, vi } from 'vitest';
import { createEditor } from '@ldforge/editor';
import { createTableRenderer, createJsonRenderer } from '@ldforge/renderers';
import { parseQueryViewDirectives } from '@ldforge/core';
import {
  createShareLink,
  queryWithRenderer,
  queryWithEndpoint,
} from '../packages/editor/src/share.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
it('adds or updates only the renderer while preserving options, contracts and query text', () => {
  const source =
    '# view=table; columns="60%,40%"; host="a; b"\n# css=color: red; font-size: 12px\n# ldforge-bindings:start\n# My contract\n# ldforge-bindings:end\nSELECT * WHERE {}';
  const shared = queryWithRenderer(source, 'json');
  expect(parseQueryViewDirectives(shared)).toMatchObject({
    view: 'json',
    columns: '60%,40%',
    host: 'a; b',
    css: 'color: red; font-size: 12px',
  });
  expect(shared).toContain('# My contract');
  expect(shared).toContain('SELECT * WHERE {}');
  expect(shared.match(/view=/g)).toHaveLength(1);
  expect(queryWithRenderer(shared, 'json')).toBe(shared);
  expect(queryWithRenderer('SELECT * WHERE {}', 'table')).toBe(
    '# view=table\nSELECT * WHERE {}',
  );
  expect(queryWithRenderer('ASK {}')).toBe('ASK {}');
});
it('encodes the query once and retains the host route and other URL parameters', () => {
  const query = '# view=table\nSELECT * WHERE { ?s ?p "&é+#" }';
  const link = new URL(
    createShareLink(
      'https://example.org/editor?project=demo&query=old#plugins',
      query,
    ),
  );
  expect(link.pathname).toBe('/editor');
  expect(link.hash).toBe('');
  expect(link.searchParams.get('project')).toBe('demo');
  expect(link.searchParams.getAll('query')).toEqual([query]);
});
it('copies the active renderer even when the share control is hidden and leaves the query untouched on failure', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', {
    language: 'en',
    languages: ['en'],
    clipboard: { writeText },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const editor = createEditor(host, {
    query: 'SELECT * WHERE {}',
    executor: {
      execute: async () => ({
        kind: 'bindings',
        variables: ['value'],
        bindings: [],
      }),
    },
    renderers: [createTableRenderer(), createJsonRenderer()],
    controls: { share: false },
    shareBaseUrl: 'https://example.org/editor',
  });
  try {
    expect(host.querySelector('.ldforge-share-toggle')).toBeNull();
    await editor.run();
    host.querySelector<HTMLButtonElement>('[data-renderer-id=json]')?.click();
    const original = editor.getQuery();
    expect(new URL(editor.getShareLink()).searchParams.get('query')).toContain(
      '# view=json',
    );
    expect(editor.getQuery()).toBe(original);
    await editor.copyShareLink();
    expect(editor.getQuery()).toContain('# view=json');
    expect(writeText).toHaveBeenCalledWith(editor.getShareLink());
    host.querySelector<HTMLButtonElement>('[data-renderer-id=table]')?.click();
    await editor.copyShareLink();
    expect(editor.getQuery()).toContain('# view=table');
    expect(editor.getQuery()).not.toContain('# view=json');
    let complete: (() => void) | undefined;
    writeText.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const copying = editor.copyShareLink();
    editor.setQuery('ASK {}');
    complete?.();
    await copying;
    expect(editor.getQuery()).toBe('ASK {}');
    writeText.mockRejectedValue(new Error('Denied'));
    await expect(editor.copyShareLink()).rejects.toThrow('Denied');
    expect(editor.getQuery()).toBe('ASK {}');
  } finally {
    editor.destroy();
  }
});

it('includes the configured endpoint while respecting an explicit query endpoint', () => {
  const endpoint = 'https://example.org/sparql?graph=a&default=é';
  const shared = queryWithEndpoint('# view=geo\nSELECT * WHERE {}', endpoint);
  expect(parseQueryViewDirectives(shared)['sparql-endpoint']).toBe(endpoint);
  expect(queryWithEndpoint(shared, endpoint)).toBe(shared);
  expect(queryWithEndpoint(shared, 'https://other.org/sparql')).toBe(shared);
  expect(queryWithEndpoint('ASK {}', '')).toBe('ASK {}');
});

it('keeps hash router destinations while placing the query before the fragment', () => {
  const link = new URL(
    createShareLink(
      'https://example.org/fuseki/#/dataset/demo/query',
      'ASK {}',
    ),
  );
  expect(link.hash).toBe('#/dataset/demo/query');
  expect(link.searchParams.get('query')).toBe('ASK {}');
});
