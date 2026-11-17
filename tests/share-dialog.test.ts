import { afterEach, expect, it, vi } from 'vitest';
import {
  createEditor,
  type EditorOptions,
  type ForgeEditor,
} from '@ldforge/editor';
import {
  oneLineQuery,
  requestExamples,
} from '../packages/editor/src/share-dialog.js';
import { createShareLink } from '../packages/editor/src/share.js';
import { execFileSync } from 'node:child_process';

const editors: ForgeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
function mount(options: Partial<EditorOptions> = {}) {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const execute = vi.fn().mockResolvedValue({ kind: 'boolean', value: true });
  vi.stubGlobal('navigator', {
    language: 'en',
    languages: ['en'],
    clipboard: { writeText },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const editor = createEditor(host, {
    query: 'ASK {}',
    executor: { execute },
    shareBaseUrl: 'https://editor.example/?execute=true',
    ...options,
  });
  editors.push(editor);
  const open = () =>
    host.querySelector<HTMLButtonElement>('.ldforge-share-toggle')?.click();
  const field = (name: string) =>
    host.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${name}"]`);
  const click = (name: string) =>
    host
      .querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
      ?.click();
  return { host, editor, writeText, execute, open, field, click };
}

it('opens a read-only snapshot without editing, executing or copying, and explains missing integrations', async () => {
  const { host, editor, execute, writeText, open, field, click } = mount();
  open();
  expect(host.textContent).not.toContain('no host shortening service');
  expect(host.textContent).not.toContain('require an active SPARQL endpoint');
  expect(field('URL to this query in the editor')?.readOnly).toBe(true);
  expect(field('cURL command line for POST request')?.placeholder).toContain(
    'Choose a SPARQL endpoint',
  );
  expect(
    host.querySelector<HTMLButtonElement>(
      '[aria-label="Copy cURL command line for POST request"]',
    )?.disabled,
  ).toBe(true);
  expect(
    new URL(
      field('URL to this query in the editor')?.value ?? '',
    ).searchParams.has('execute'),
  ).toBe(false);
  expect(editor.getQuery()).toBe('ASK {}');
  expect(execute).not.toHaveBeenCalled();
  expect(writeText).not.toHaveBeenCalled();
  click('Copy URL to this query in the editor');
  await vi.waitFor(() => expect(host.textContent).toContain('Copied'));
  expect(writeText).toHaveBeenCalledWith(editor.getShareLink());
  expect(editor.getQuery()).toBe('ASK {}');
});

it('shortens normal and explicit execution URLs independently and retains the full link on failure', async () => {
  const shorten = vi.fn((url: string) =>
    new URL(url).searchParams.has('execute')
      ? Promise.resolve('https://short.example/run')
      : Promise.reject(new Error('Offline')),
  );
  const { host, editor, open, field } = mount({
    shortenShareUrl: shorten,
    shareAutoRun: true,
  });
  open();
  await vi.waitFor(() =>
    expect(field('Short editor URL — opens and runs query')?.value).toBe(
      'https://short.example/run',
    ),
  );
  expect(host.textContent).toContain('Offline');
  expect(field('URL to this query in the editor')?.value).toBe(
    editor.getShareLink(),
  );
  expect(shorten).toHaveBeenCalledTimes(2);
  expect(
    new URL(shorten.mock.calls[0]?.[0] ?? '').searchParams.has('execute'),
  ).toBe(false);
  expect(
    new URL(shorten.mock.calls[1]?.[0] ?? '').searchParams.get('execute'),
  ).toBe('true');
});

it('does not offer automatic execution without host opt-in', async () => {
  const { open, field } = mount({
    shortenShareUrl: () => 'https://short.example/a',
  });
  open();
  await vi.waitFor(() =>
    expect(field('Short editor URL')?.value).toBe('https://short.example/a'),
  );
  expect(field('Short editor URL — opens and runs query')).toBeNull();
});

it('discards stale shortening results and refuses to copy changed context until refreshed', async () => {
  let complete!: (url: string) => void;
  const { host, editor, writeText, open, field, click } = mount({
    shortenShareUrl: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  });
  open();
  editor.setQuery('SELECT * WHERE {}');
  complete('https://short.example/old');
  await vi.waitFor(() =>
    expect(host.textContent).toContain('changed. Refresh'),
  );
  expect(field('Short editor URL')?.value).toBe('');
  click('Copy URL to this query in the editor');
  await vi.waitFor(() =>
    expect(host.textContent).toContain('changed. Refresh'),
  );
  expect(writeText).not.toHaveBeenCalled();
  [...host.querySelectorAll('button')]
    .find((button) => button.textContent === 'Refresh values')
    ?.click();
  expect(field('URL to this query in the editor')?.value).toBe(
    editor.getShareLink(),
  );
});

it('shows clipboard failures with recoverable feedback and localizes the dialog', async () => {
  const { host, editor, writeText, open, click } = mount();
  open();
  writeText.mockRejectedValueOnce(new Error('Clipboard denied'));
  click('Copy URL to this query in the editor');
  await vi.waitFor(() =>
    expect(host.textContent).toContain('Clipboard denied'),
  );
  expect(
    host.querySelector<HTMLButtonElement>('.ldforge-share-copy')?.dataset
      .copied,
  ).toBe('false');
  click('Copy URL to this query in the editor');
  await vi.waitFor(() => expect(host.textContent).toContain('Copied'));
  editor.setLocale('nl');
  expect(
    host.querySelector('.ldforge-share-dialog')?.getAttribute('aria-label'),
  ).toBe('Deel je query');
  expect(host.textContent).toContain('URL naar deze query in de editor');
});

it('encodes GET URLs and shell-quotes POST and GET arguments without including connection credentials', () => {
  const query = 'SELECT * WHERE { ?s ?p "O\'Brien & é\\n" }\n# end';
  const examples = requestExamples(
    query,
    'https://user:password@endpoint.example/sparql?default-graph-uri=https%3A%2F%2Fgraph.example%2F&token=secret&query=old',
  );
  const url = new URL(examples.getUrl);
  expect(url.searchParams.get('query')).toBe(query);
  expect(url.searchParams.get('default-graph-uri')).toBe(
    'https://graph.example/',
  );
  for (const command of [examples.get, examples.post]) {
    expect(command).not.toMatch(/password|secret/);
    // Parse shell arguments with a harmless curl replacement; never contact an endpoint.
    const args = JSON.parse(
      execFileSync(
        '/bin/sh',
        [
          '-c',
          `curl() { node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' -- "$@"; }; ${command}`,
        ],
        { encoding: 'utf8' },
      ),
    ) as string[];
    expect(args).toContain('Accept: application/sparql-results+json');
    if (command === examples.post) {
      expect(args[args.indexOf('--data-binary') + 1]).toBe(query);
      expect(args).toContain('Content-Type: application/sparql-query');
    } else expect(args.at(-1)).toBe(examples.getUrl);
  }
  expect(
    requestExamples(
      'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }',
      'https://endpoint.example/',
    ).post,
  ).toContain('Accept: application/n-triples');
  expect(
    requestExamples(
      'DESCRIBE <https://example.org/>',
      'https://endpoint.example/',
    ).get,
  ).toContain('text/turtle;q=0.9');
});

it('preserves literal whitespace and falls back for unfinished literals', () => {
  expect(oneLineQuery('SELECT  *\nWHERE { ?s ?p "a  b" }')).toEqual({
    value: 'SELECT * WHERE { ?s ?p "a  b" }',
    fallback: false,
  });
  for (const query of ['SELECT * WHERE { ?s ?p "unfinished\n  text']) {
    expect(oneLineQuery(query)).toEqual({ value: query, fallback: true });
  }
  expect(
    new URL(
      createShareLink('https://editor.example/?execute=true', 'ASK {}'),
    ).searchParams.has('execute'),
  ).toBe(false);
});

it('encodes GET and shell-escapes POST without credentials and selects response types', () => {
  const query = `SELECT * WHERE { ?s ?p "O'Brien & é" }\n# keep comment\nLIMIT 1`;
  const examples = requestExamples(
    query,
    'https://user:secret@endpoint.example/sparql?default-graph-uri=https%3A%2F%2Fgraph.example&token=secret&query=old',
  );
  const url = new URL(examples.getUrl);
  expect(url.searchParams.get('query')).toBe(query);
  expect(url.searchParams.get('default-graph-uri')).toBe(
    'https://graph.example',
  );
  expect(url.username).toBe('');
  expect(url.password).toBe('');
  expect(url.searchParams.has('token')).toBe(false);
  const args = execFileSync(
    '/bin/sh',
    ['-c', `curl() { printf '%s\\0' "$@"; }; ${examples.post}`],
    { encoding: 'utf8' },
  ).split('\0');
  expect(args[args.indexOf('--data-binary') + 1]).toBe(query);
  expect(args).toContain('Content-Type: application/sparql-query');
  expect(args).toContain('Accept: application/sparql-results+json');
  expect(
    requestExamples(
      'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }',
      'https://endpoint.example',
    ).get,
  ).toContain('application/n-triples, text/turtle;q=0.9');
  expect(() => requestExamples(query, 'file:///tmp/query')).toThrow('HTTP(S)');
});

it('collapses query whitespace while preserving hashes in IRIs and literal spacing', () => {
  expect(
    oneLineQuery(
      'PREFIX ex: <https://example.org/#>\nSELECT * WHERE { ?s ex:p "two  spaces # value" }',
    ).value,
  ).toBe(
    'PREFIX ex: <https://example.org/#> SELECT * WHERE { ?s ex:p "two  spaces # value" }',
  );
});

it('copies every representation completely from the active tab and explicit query endpoint', async () => {
  const query =
    '# sparql-endpoint=https://declared.example/sparql\nSELECT * WHERE { ?s ?p "é & quote\'" }';
  const { host, editor, writeText, execute, open } = mount({
    query: 'ASK {}',
    shareEndpoint: 'https://applied.example/sparql',
    shortenShareUrl: () => 'https://short.example/value',
  });
  editor.getTabs().addTab({ query });
  open();
  await vi.waitFor(() =>
    expect(
      host.querySelector<HTMLTextAreaElement>('[aria-label="Short editor URL"]')
        ?.value,
    ).toBe('https://short.example/value'),
  );
  const get =
    host.querySelector<HTMLTextAreaElement>(
      '[aria-label="SPARQL GET request URL"]',
    )?.value ?? '';
  expect(new URL(get).origin).toBe('https://declared.example');
  expect(new URL(get).searchParams.get('query')).toBe(query);
  for (const row of host.querySelectorAll('.ldforge-share-row')) {
    const field = row.querySelector('textarea');
    row.querySelector('button')?.click();
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith(field?.value),
    );
  }
  expect(editor.getQuery()).toBe(query);
  expect(execute).not.toHaveBeenCalled();
});

it('invalidates pending dialog links when the applied endpoint changes and ignores closed dialogs', async () => {
  let endpoint = 'https://first.example/sparql';
  let resolve!: (value: string) => void;
  const { host, open, writeText } = mount({
    shareEndpoint: () => endpoint,
    shortenShareUrl: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  open();
  endpoint = 'https://second.example/sparql';
  resolve('https://short.example/old');
  await vi.waitFor(() =>
    expect(host.textContent).toContain('changed. Refresh'),
  );
  host.querySelector<HTMLButtonElement>('.ldforge-share-toggle')?.click();
  open();
  host.querySelector<HTMLButtonElement>('.ldforge-share-toggle')?.click();
  resolve('https://short.example/closed');
  await Promise.resolve();
  expect(
    host.querySelector<HTMLTextAreaElement>('[aria-label="Short editor URL"]')
      ?.value,
  ).toBe('');
  expect(writeText).not.toHaveBeenCalled();
});

it('puts comments and multiline literals on one line without changing literal values', () => {
  const source =
    '# view=table\nPREFIX ex: <https://example.org/#>\nSELECT * WHERE {\n?s ex:p """first\nsecond "quoted" # literal""" . # comment\n}';
  const compact = oneLineQuery(source);
  expect(compact.fallback).toBe(false);
  expect(compact.value).not.toMatch(/[\r\n]/);
  expect(compact.value).toContain('<https://example.org/#>');
  expect(compact.value).toContain('"first\\nsecond \\"quoted\\" # literal"');
  expect(compact.value).not.toContain('# view=table');
  expect(compact.value).not.toContain('# comment');
  expect(
    oneLineQuery("ASK { ?s ?p '''first\r\nsecond 'quote' ''' }").value,
  ).toContain("'first\\r\\nsecond \\'quote\\' '");
});
