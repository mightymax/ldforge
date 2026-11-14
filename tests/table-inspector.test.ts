import { describe, expect, it, vi } from 'vitest';
import {
  createResourceInspector,
  createResourceLoader,
  createTableRenderer,
} from '@ldforge/renderers';
import type { QueryResult } from '@ldforge/core';
function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Missing test value');
  return value;
}
const uri = (value: string) => ({ type: 'uri' as const, value });
const literal = (value: string) => ({ type: 'literal' as const, value });

describe('interactive table', () => {
  it('combines filters, sorts numeric text, preserves input data and bounds DOM rows', () => {
    const container = document.createElement('div');
    const data: QueryResult = {
      kind: 'bindings',
      variables: ['name', 'value'],
      bindings: Array.from({ length: 10000 }, (_, i) => ({
        name: literal(i % 2 ? 'odd' : 'even'),
        value: literal(String(i)),
      })),
    };
    createTableRenderer().render(container, data);
    expect(container.querySelectorAll('tbody tr').length).toBeLessThan(40);
    const search = required(container.querySelector<HTMLInputElement>('input'));
    search.value = 'odd';
    search.dispatchEvent(new Event('input'));
    expect(container.querySelector('caption')?.textContent).toBe(
      '5000 / 10000 results',
    );
    const valueFilter = required(
      container.querySelector<HTMLInputElement>('[aria-label="Filter value"]'),
    );
    valueFilter.value = '99';
    valueFilter.dispatchEvent(new Event('input'));
    const sort = required(
      container.querySelectorAll<HTMLButtonElement>('th button')[1],
    );
    sort.click();
    sort.click();
    expect(
      container.querySelector('tbody tr td:nth-child(2)')?.textContent,
    ).toBe('9999');
    expect(data.bindings[0]?.value?.value).toBe('0');
  });
  it('opens local properties safely and follows related resources', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const graph: QueryResult = {
      kind: 'graph',
      triples: [
        {
          subject: uri('urn:a'),
          predicate: uri('urn:label'),
          object: literal('<img src=x>'),
        },
        {
          subject: uri('urn:a'),
          predicate: uri('urn:related'),
          object: uri('urn:b'),
        },
      ],
    };
    const cleanup = createTableRenderer().render(container, graph);
    const origin = required(
      container.querySelector<HTMLButtonElement>('tbody button'),
    );
    origin.focus();
    origin.click();
    const panel = required(
      container.querySelector<HTMLElement>('.ldforge-resource-inspector'),
    );
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('<img src=x>');
    expect(panel.querySelector('img')).toBeNull();
    required(
      [...panel.querySelectorAll('button')].find(
        (b) => b.textContent === 'urn:b',
      ),
    ).click();
    expect(panel.querySelector('h3')?.textContent).toBe('urn:b');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(origin);
    if (typeof cleanup === 'function') cleanup();
    container.remove();
  });
});

describe('resource loading', () => {
  it('ignores stale loads, aborts on close and cleanup, and renders errors', async () => {
    const host = document.createElement('div');
    const pending: {
      signal: AbortSignal;
      resolve: (value: QueryResult) => void;
    }[] = [];
    const inspector = createResourceInspector(host, {
      loadResource: (_iri, signal) =>
        new Promise((resolve) => pending.push({ signal, resolve })),
    });
    host.append(inspector.element);
    const first = inspector.open(uri('urn:a'));
    const second = inspector.open(uri('urn:b'));
    expect(required(pending[0]).signal.aborted).toBe(true);
    required(pending[0]).resolve({ kind: 'graph', triples: [] });
    await first;
    expect(inspector.element.textContent).toContain('Loading');
    inspector.close();
    expect(required(pending[1]).signal.aborted).toBe(true);
    required(pending[1]).resolve({ kind: 'graph', triples: [] });
    await second;
    expect(inspector.element.hidden).toBe(true);
    const third = inspector.open(uri('urn:c'));
    inspector.destroy();
    expect(required(pending[2]).signal.aborted).toBe(true);
    required(pending[2]).resolve({ kind: 'graph', triples: [] });
    await third;
    const failed = createResourceInspector(host, {
      loadResource: async () => {
        throw new Error('offline');
      },
    });
    await failed.open(uri('urn:a'));
    expect(failed.element.textContent).toContain('Loading failed: offline');
    failed.destroy();
  });
  it('uses the host transport and rejects query injection', async () => {
    const execute = vi.fn(async (): Promise<QueryResult> => ({
      kind: 'graph',
      triples: [],
    }));
    const load = createResourceLoader({ execute });
    const signal = new AbortController().signal;
    await load('https://example.org/a', signal);
    expect(execute).toHaveBeenCalledWith({
      query: expect.stringContaining('LIMIT 200'),
      signal,
    });
    await expect(load('urn:a> } UNION { ?s ?p ?o', signal)).rejects.toThrow(
      'Invalid',
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
