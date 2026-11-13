import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChartRenderer } from '@ldforge/charts';
import type { QueryResult } from '@ldforge/core';
import {
  buildChartModel,
  ChartDataError,
} from '../packages/charts/src/model.js';

const result: QueryResult = {
  kind: 'bindings',
  variables: ['chart_label', 'chart_value'],
  bindings: [
    {
      chart_label: { type: 'literal', value: 'A' },
      chart_value: { type: 'literal', value: '12' },
    },
    {
      chart_label: { type: 'literal', value: 'B' },
      chart_value: { type: 'literal', value: '4.5' },
    },
  ],
};
afterEach(() => document.body.replaceChildren());
function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  return container;
}

describe('chart data mapping', () => {
  it('maps ordered labels, sums duplicates and leaves missing series points unbound', () => {
    const mapped = buildChartModel(
      {
        kind: 'bindings',
        variables: result.kind === 'bindings' ? result.variables : [],
        bindings: [
          {
            chart_label: { type: 'literal', value: 'A' },
            chart_value: { type: 'literal', value: '1e1' },
            chart_series: { type: 'literal', value: 'First' },
          },
          {
            chart_label: { type: 'literal', value: 'A' },
            chart_value: { type: 'literal', value: '2' },
            chart_series: { type: 'literal', value: 'First' },
          },
          {
            chart_label: { type: 'literal', value: 'B' },
            chart_value: { type: 'literal', value: '-3' },
            chart_series: { type: 'literal', value: 'Second' },
          },
        ],
      },
      { locale: 'nl', directives: { chart: 'line' } },
    );
    expect(mapped.type).toBe('line');
    expect(mapped.data.labels).toEqual(['A', 'B']);
    expect(mapped.data.datasets.map((entry) => entry.data)).toEqual([
      [12, null],
      [null, -3],
    ]);
    expect(mapped.options.locale).toBe('nl');
  });
  it.each(['pie', 'doughnut'])(
    'maps %s with per-category colors and no axes',
    (chart) => {
      const model = buildChartModel(result, {
        locale: 'en',
        directives: { chart },
      });
      expect(model.options.scales).toBeUndefined();
      expect(model.data.datasets[0]?.backgroundColor).toHaveLength(2);
    },
  );
  it.each(['NaN', 'Infinity', '0x10', '', '1,000', '1e999'])(
    'rejects invalid numeric lexical value %s',
    (value) => {
      expect(() =>
        buildChartModel({
          kind: 'bindings',
          variables: ['chart_label', 'chart_value'],
          bindings: [
            {
              chart_label: { type: 'literal', value: 'A' },
              chart_value: { type: 'literal', value },
            },
          ],
        }),
      ).toThrow(ChartDataError);
    },
  );
  it('rejects missing labels, URI values, unknown types, negative slices and multiple pie series', () => {
    expect(() =>
      buildChartModel(result, {
        locale: 'en',
        directives: { chart: 'unknown' },
      }),
    ).toThrow(ChartDataError);
    for (const row of [
      {},
      {
        chart_label: { type: 'literal' as const, value: 'A' },
        chart_value: { type: 'uri' as const, value: '12' },
      },
    ]) {
      expect(() =>
        buildChartModel({ kind: 'bindings', variables: [], bindings: [row] }),
      ).toThrow(ChartDataError);
    }
    const rows = {
      kind: 'bindings' as const,
      variables: [],
      bindings: [
        {
          chart_label: { type: 'literal' as const, value: 'A' },
          chart_value: { type: 'literal' as const, value: '-1' },
        },
      ],
    };
    expect(() =>
      buildChartModel(rows, { locale: 'en', directives: { chart: 'pie' } }),
    ).toThrow('negative');
    const first = rows.bindings[0];
    if (first) first.chart_value.value = '1';
    expect(() =>
      buildChartModel(
        {
          ...rows,
          bindings: [
            {
              ...rows.bindings[0],
              chart_series: { type: 'literal', value: 'A' },
            },
            {
              ...rows.bindings[0],
              chart_series: { type: 'literal', value: 'B' },
            },
          ],
        },
        { locale: 'en', directives: { chart: 'pie' } },
      ),
    ).toThrow('series');
  });
});

describe('lazy chart rendering lifecycle', () => {
  it('loads only on activation, reuses the module, renders fallback data and destroys instances', async () => {
    const destroy = vi.fn();
    const construct = vi.fn();
    class Chart {
      constructor(canvas: HTMLCanvasElement, config: unknown) {
        construct(canvas, config);
      }
      destroy = destroy;
    }
    const loadLibrary = vi.fn(async () => ({ Chart }));
    const plugin = createChartRenderer({ loadLibrary });
    expect(plugin.supports(result)).toBe(true);
    expect(plugin.supports({ kind: 'boolean', value: true })).toBe(false);
    expect(loadLibrary).not.toHaveBeenCalled();
    const container = mount();
    const cleanup = plugin.render(container, result, { locale: 'nl' });
    await vi.waitFor(() => expect(construct).toHaveBeenCalledOnce());
    expect(container.querySelector('canvas')?.getAttribute('aria-label')).toBe(
      'Grafieken',
    );
    expect(container.querySelector('table')?.textContent).toContain('4,5');
    expect(
      container.querySelector('[aria-busy]')?.getAttribute('aria-busy'),
    ).toBe('false');
    if (typeof cleanup === 'function') cleanup();
    expect(destroy).toHaveBeenCalledOnce();
    const next = plugin.render(container, result);
    await vi.waitFor(() => expect(construct).toHaveBeenCalledTimes(2));
    expect(loadLibrary).toHaveBeenCalledOnce();
    if (typeof next === 'function') next();
  });
  it('does not construct charts after the view is disposed while loading', async () => {
    const construct = vi.fn();
    let resolve: ((module: unknown) => void) | undefined;
    const plugin = createChartRenderer({
      loadLibrary: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    const cleanup = plugin.render(mount(), result);
    await vi.waitFor(() => expect(resolve).toBeDefined());
    if (typeof cleanup === 'function') cleanup();
    resolve?.({ Chart: construct });
    await new Promise((done) => setTimeout(done, 0));
    expect(construct).not.toHaveBeenCalled();
  });
  it('offers retry after a load failure and accepts a default export', async () => {
    class Chart {
      destroy() {}
    }
    const loadLibrary = vi
      .fn()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValue({ default: Chart });
    const container = mount();
    const cleanup = createChartRenderer({ loadLibrary }).render(
      container,
      result,
    );
    await vi.waitFor(() =>
      expect(container.textContent).toContain('Could not load or render'),
    );
    container.querySelector('button')?.click();
    await vi.waitFor(() => expect(loadLibrary).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(container.querySelector('button')?.hidden).toBe(true),
    );
    if (typeof cleanup === 'function') cleanup();
  });
  it('validates data before loading and shows errors or empty states without network requests', () => {
    const loadLibrary = vi.fn();
    const plugin = createChartRenderer({ loadLibrary });
    const container = mount();
    plugin.render(container, result, {
      locale: 'en',
      directives: { chart: 'unknown' },
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Unsupported chart type',
    );
    plugin.render(
      container,
      { kind: 'bindings', variables: [], bindings: [{}] },
      { locale: 'nl' },
    );
    expect(container.textContent).toContain(
      'Ongeldige grafiekbinding op rij 1',
    );
    plugin.render(container, {
      kind: 'bindings',
      variables: ['chart_label', 'chart_value'],
      bindings: [],
    });
    expect(container.textContent).toContain('No chart data');
    expect(loadLibrary).not.toHaveBeenCalled();
  });
  it('contains invalid module exports and disallowed module URLs', async () => {
    for (const options of [
      { libraryUrl: 'javascript:alert(1)' },
      { loadLibrary: async () => ({}) },
      { loadLibrary: async () => null },
    ]) {
      const container = mount();
      const cleanup = createChartRenderer(options).render(container, result);
      await vi.waitFor(() =>
        expect(container.textContent).toContain('Could not load or render'),
      );
      if (typeof cleanup === 'function') cleanup();
    }
  });
});
