import { describe, expect, it } from 'vitest';
import type { Binding, QueryResult } from '@ldforge/core';
import {
  buildPivotModel,
  createPivotRenderer,
  transposePivotModel,
} from '@ldforge/pivot';
import type { PivotAggregate } from '@ldforge/pivot';
const term = (value: string, type: 'literal' | 'uri' = 'literal') => ({
  type,
  value,
});
const row = (r: string, c: string, v: string): Binding => ({
  pivotRow: term(r),
  pivotColumn: term(c),
  pivotValue: term(v),
});
const result = (rows: Binding[]): QueryResult => ({
  kind: 'bindings',
  variables: ['pivotRow', 'pivotColumn', 'pivotValue'],
  bindings: rows,
});
const data = result([
  row('A', 'X', '10'),
  row('A', 'X', '20'),
  row('A', 'Y', '30'),
  row('B', 'Y', '100'),
]);
describe('pivot aggregation', () => {
  it.each([
    [
      'sum',
      [
        [30, 30],
        [null, 100],
      ],
      [60, 100],
      [30, 130],
      160,
    ],
    [
      'count',
      [
        [2, 1],
        [null, 1],
      ],
      [3, 1],
      [2, 2],
      4,
    ],
    [
      'avg',
      [
        [15, 30],
        [null, 100],
      ],
      [20, 100],
      [15, 65],
      40,
    ],
    [
      'min',
      [
        [10, 30],
        [null, 100],
      ],
      [10, 100],
      [10, 30],
      10,
    ],
    [
      'max',
      [
        [20, 30],
        [null, 100],
      ],
      [30, 100],
      [20, 100],
      100,
    ],
  ] as const)(
    'aggregates %s with mathematically correct row/column/grand totals',
    (aggregate, cells, rowTotals, columnTotals, total) => {
      const model = buildPivotModel(data, aggregate);
      expect(model.rows).toEqual(['A', 'B']);
      expect(model.columns).toEqual(['X', 'Y']);
      expect(model.cells).toEqual(cells);
      expect(model.rowTotals).toEqual(rowTotals);
      expect(model.columnTotals).toEqual(columnTotals);
      expect(model.grandTotal).toBe(total);
    },
  );
  it('transposes axes without losing totals, missing cells or source model', () => {
    const model = buildPivotModel(data);
    const swapped = transposePivotModel(model);
    expect(swapped.cells).toEqual([
      [30, null],
      [30, 100],
    ]);
    expect(swapped.rows).toEqual(['X', 'Y']);
    expect(swapped.rowTotals).toEqual(model.columnTotals);
    expect(transposePivotModel(swapped)).toEqual(model);
  });
  it('distinguishes missing cells, actual zero, negative values and prototype-like labels', () => {
    const model = buildPivotModel(
      result([
        row('__proto__', 'constructor', '0'),
        row('other', 'else', '-5'),
      ]),
    );
    expect(model.cells).toEqual([
      [0, null],
      [null, -5],
    ]);
    expect(model.grandTotal).toBe(-5);
  });
  it.each(['bad', '', 'NaN', 'Infinity', '0x10', '1e999'])(
    'rejects invalid numeric literal %s',
    (value) =>
      expect(() => buildPivotModel(result([row('A', 'X', value)]))).toThrow(
        'row 1',
      ),
  );
  it.each([
    { pivotRow: term(' '), pivotColumn: term('X'), pivotValue: term('10') },
    { pivotRow: term('A'), pivotColumn: term(' '), pivotValue: term('10') },
    {
      pivotRow: term('A'),
      pivotColumn: term('X'),
      pivotValue: term('10', 'uri'),
    },
    {},
  ])('rejects missing/invalid bindings', (value) =>
    expect(() => buildPivotModel(result([value]))).toThrow('row 1'),
  );
  it('rejects unsupported aggregates and sum overflow but allows valid extrema and averages', () => {
    expect(() => buildPivotModel(data, 'median' as PivotAggregate)).toThrow(
      'Unsupported',
    );
    const large = result([row('A', 'X', '1e308'), row('A', 'X', '1e308')]);
    expect(() => buildPivotModel(large)).toThrow('row 2');
    expect(buildPivotModel(large, 'avg').grandTotal).toBe(1e308);
    expect(buildPivotModel(large, 'min').grandTotal).toBe(1e308);
    expect(
      buildPivotModel(
        result([row('A', 'X', '1e308'), row('A', 'X', '-1e308')]),
        'avg',
      ).grandTotal,
    ).toBe(0);
  });
  it('returns empty models for non-bindings and empty results', () => {
    expect(
      buildPivotModel({ kind: 'boolean', value: true }).grandTotal,
    ).toBeNull();
    expect(buildPivotModel(result([])).rows).toEqual([]);
  });
});
function change(select: HTMLSelectElement | null, value: string) {
  if (!select) throw new Error('Missing control');
  select.value = value;
  select.dispatchEvent(new Event('change'));
}
describe('pivot renderer', () => {
  it('supports the contract, uses safe DOM, and localizes headings/values', () => {
    const plugin = createPivotRenderer();
    expect(plugin.supports(data)).toBe(true);
    expect(plugin.supports({ kind: 'boolean', value: true })).toBe(false);
    expect(plugin.supports(result([]))).toBe(true);
    const node = document.createElement('div');
    plugin.render(
      node,
      result([row('<img src=x>', '<b>Column</b>', '1234.5')]),
      {
        locale: 'nl',
        directives: {
          'pivot-title': 'My pivot',
          'pivot-row-title': 'Kunststroming',
          'pivot-column-title': 'Collectie',
        },
      },
    );
    expect(node.querySelector('h3')?.textContent).toBe('My pivot');
    expect(node.querySelector('caption')?.textContent).toContain(
      'Kunststroming × Collectie',
    );
    expect(node.querySelector('img,b')).toBeNull();
    expect(node.querySelector('td')?.textContent).toBe('1.234,5');
    expect(node.querySelector('th')?.scope).toBe('col');
    expect(node.querySelector<HTMLTableCellElement>('tbody th')?.scope).toBe(
      'row',
    );
  });
  it('sorts axes, switches aggregate, swaps, and toggles colors without losing totals', () => {
    const node = document.createElement('div');
    const cleanup = createPivotRenderer().render(node, data, { locale: 'en' });
    expect(node.querySelector('tfoot td:last-child')?.textContent).toBe('160');
    expect(
      node.querySelector('td[data-value="30"]')?.getAttribute('style'),
    ).toContain('background-color');
    change(node.querySelector('[aria-label="Sort rows"]'), 'total-desc');
    expect(node.querySelector('tbody th')?.textContent).toBe('B');
    change(node.querySelector('[aria-label="Sort columns"]'), 'label-desc');
    expect(node.querySelectorAll('thead th')[1]?.textContent).toBe('Y');
    change(node.querySelector('[aria-label="Aggregate"]'), 'avg');
    expect(node.querySelector('tfoot td:last-child')?.textContent).toBe('40');
    node.querySelector<HTMLButtonElement>('button')?.click();
    expect(node.querySelector('button')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(node.querySelector('caption')?.textContent).toContain(
      'Columns × Rows',
    );
    const heat = node.querySelector<HTMLInputElement>('input');
    if (!heat) throw new Error('Missing heat control');
    heat.checked = false;
    heat.dispatchEvent(new Event('change'));
    expect(node.querySelector('tbody td')?.getAttribute('style')).toBeNull();
    if (typeof cleanup === 'function') cleanup();
    node.querySelector<HTMLButtonElement>('button')?.click();
    expect(node.querySelector('button')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    heat.checked = true;
    heat.dispatchEvent(new Event('change'));
    change(node.querySelector('[aria-label="Aggregate"]'), 'sum');
    expect(node.querySelector('tfoot td:last-child')?.textContent).toBe('40');
  });
  it('reports invalid data/directives, handles empty results, and validates precision', () => {
    const node = document.createElement('div');
    createPivotRenderer().render(node, result([{}]), { locale: 'nl' });
    expect(node.querySelector('[role=alert]')?.textContent).toContain('rij 1');
    createPivotRenderer().render(node, data, {
      locale: 'en',
      directives: { 'pivot-aggregate': 'median' },
    });
    expect(node.textContent).toContain('Unsupported');
    createPivotRenderer().render(node, result([]));
    expect(node.textContent).toContain('No pivot');
    for (const maximumFractionDigits of [-1, 21, 1.5, NaN])
      expect(() => createPivotRenderer({ maximumFractionDigits })).toThrow(
        '0 to 20',
      );
  });
  it('retains the last valid aggregate if a later operation overflows', () => {
    const node = document.createElement('div');
    createPivotRenderer({ aggregate: 'min', heatmap: false }).render(
      node,
      result([row('A', 'X', '1e308'), row('A', 'X', '1e308')]),
    );
    change(node.querySelector('[aria-label="Aggregate"]'), 'sum');
    expect(
      node.querySelector<HTMLSelectElement>('[aria-label="Aggregate"]')?.value,
    ).toBe('min');
    expect(node.querySelector('[role=status]')?.textContent).toContain('row 2');
    expect(node.querySelector('caption')?.textContent).toContain('Minimum');
  });
});
