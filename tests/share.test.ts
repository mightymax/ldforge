import { afterEach, expect, it, vi } from 'vitest';
import { createEditor, type ShareUrlShortener } from '@ldforge/editor';
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

function shorteningEditor(shortenShareUrl: ShareUrlShortener) {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', {
    language: 'en',
    languages: ['en'],
    clipboard: { writeText },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const editor = createEditor(host, {
    query: 'ASK {}',
    executor: { execute: async () => ({ kind: 'boolean', value: true }) },
    shareBaseUrl: 'https://example.org/editor?project=demo#/query',
    shareEndpoint: 'https://example.org/sparql',
    shortenShareUrl,
  });
  return { editor, host, writeText };
}

it('passes the complete URL and query to a synchronous host integration', async () => {
  const shorten = vi.fn(() => 'https://short.example/a');
  const { editor, writeText } = shorteningEditor(shorten);
  try {
    const full = editor.getShareLink();
    expect(await editor.copyShareLink()).toBe('https://short.example/a');
    expect(shorten).toHaveBeenCalledWith(
      full,
      new URL(full).searchParams.get('query'),
    );
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      'https://short.example/a',
    );
    expect(editor.getShareLink()).toBe(full);
  } finally {
    editor.destroy();
  }
});

it('automatically fills the short URL row asynchronously without copying or editing', async () => {
  let resolve!: (url: string) => void;
  const { editor, host, writeText } = shorteningEditor(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  try {
    host.querySelector<HTMLButtonElement>('.ldforge-share-toggle')?.click();
    const field = host.querySelector<HTMLTextAreaElement>(
      '[aria-label="Short editor URL"]',
    );
    expect(field?.value).toBe('');
    expect(
      host
        .querySelector('[aria-label="Copy Short editor URL"]')
        ?.hasAttribute('disabled'),
    ).toBe(true);
    expect(
      host.querySelector<HTMLTextAreaElement>(
        '[aria-label="URL to this query in the editor"]',
      )?.value,
    ).toBe(editor.getShareLink());
    expect(writeText).not.toHaveBeenCalled();
    resolve('https://short.example/async');
    await vi.waitFor(() =>
      expect(field?.value).toBe('https://short.example/async'),
    );
    host
      .querySelector<HTMLButtonElement>('[aria-label="Copy Short editor URL"]')
      ?.click();
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('https://short.example/async'),
    );
    expect(editor.getQuery()).toBe('ASK {}');
  } finally {
    editor.destroy();
  }
});

it.each([
  '',
  '/relative',
  'javascript:alert(1)',
  ' https://short.example/a',
  undefined,
  42,
])(
  'rejects invalid shortening output %s without copying or editing',
  async (value) => {
    const { editor, writeText } = shorteningEditor(() => value as string);
    try {
      await expect(editor.copyShareLink()).rejects.toThrow('invalid URL');
      expect(writeText).not.toHaveBeenCalled();
      expect(editor.getQuery()).toBe('ASK {}');
    } finally {
      editor.destroy();
    }
  },
);

it('shows service failures per row and allows retrying', async () => {
  const shorten = vi
    .fn()
    .mockRejectedValueOnce(new Error('Service unavailable'))
    .mockResolvedValue('https://short.example/retry');
  const { editor, host, writeText } = shorteningEditor(shorten);
  try {
    host.querySelector<HTMLButtonElement>('.ldforge-share-toggle')?.click();
    await vi.waitFor(() =>
      expect(host.textContent).toContain('Service unavailable'),
    );
    expect(writeText).not.toHaveBeenCalled();
    const retry = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Retry',
    );
    retry?.click();
    await vi.waitFor(() =>
      expect(
        host.querySelector<HTMLTextAreaElement>(
          '[aria-label="Short editor URL"]',
        )?.value,
      ).toBe('https://short.example/retry'),
    );
    expect(writeText).not.toHaveBeenCalled();
  } finally {
    editor.destroy();
  }
});

it.each(['query', 'tab', 'destroy', 'new request'])(
  'does not copy a stale result after %s changes',
  async (change) => {
    let resolve!: (url: string) => void;
    const shorten = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((r) => {
            resolve = r;
          }),
      )
      .mockReturnValue('https://short.example/new');
    const { editor, writeText } = shorteningEditor(shorten);
    try {
      const pending = editor.copyShareLink();
      const assertion = expect(pending).rejects.toThrow(
        'share context changed',
      );
      if (change === 'query') editor.setQuery('SELECT * WHERE {}');
      if (change === 'tab') editor.getTabs().addTab({ query: 'ASK {}' });
      if (change === 'destroy') editor.destroy();
      if (change === 'new request') await editor.copyShareLink();
      writeText.mockClear();
      resolve('https://short.example/old');
      await assertion;
      expect(writeText).not.toHaveBeenCalled();
    } finally {
      if (change !== 'destroy') editor.destroy();
    }
  },
);
