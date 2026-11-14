import type { QueryResult } from '@ldforge/core';
export type PivotAggregate = 'sum' | 'count' | 'avg' | 'min' | 'max';
export const pivotAggregates: readonly PivotAggregate[] = [
  'sum',
  'count',
  'avg',
  'min',
  'max',
];
export interface PivotModel {
  aggregate: PivotAggregate;
  rows: string[];
  columns: string[];
  cells: (number | null)[][];
  rowTotals: (number | null)[];
  columnTotals: (number | null)[];
  grandTotal: number | null;
}
export class PivotDataError extends Error {
  constructor(
    readonly reason: 'aggregate' | 'row',
    readonly row?: number,
  ) {
    super(
      reason === 'row'
        ? `Invalid pivot binding at row ${row}.`
        : 'Unsupported pivot aggregate.',
    );
  }
}
interface Stats {
  sum: number;
  count: number;
  mean: number;
  min: number;
  max: number;
}
const stats = (): Stats => ({
  sum: 0,
  count: 0,
  mean: 0,
  min: Infinity,
  max: -Infinity,
});
function add(
  target: Stats,
  value: number,
  aggregate: PivotAggregate,
  row: number,
): void {
  target.count++;
  target.sum += value;
  const difference = value - target.mean;
  target.mean = Number.isFinite(difference)
    ? target.mean + difference / target.count
    : target.mean * (1 - 1 / target.count) + value / target.count;
  target.min = Math.min(target.min, value);
  target.max = Math.max(target.max, value);
  if (
    (aggregate === 'sum' && !Number.isFinite(target.sum)) ||
    (aggregate === 'avg' && !Number.isFinite(target.mean))
  )
    throw new PivotDataError('row', row);
}
function evaluate(
  target: Stats | undefined,
  aggregate: PivotAggregate,
): number | null {
  if (!target?.count) return null;
  switch (aggregate) {
    case 'sum':
      return target.sum;
    case 'count':
      return target.count;
    case 'avg':
      return target.mean;
    case 'min':
      return target.min;
    case 'max':
      return target.max;
  }
}
/** Totals aggregate source observations, not displayed averages or extrema. */
export function buildPivotModel(
  result: QueryResult,
  aggregate: PivotAggregate = 'sum',
): PivotModel {
  if (!pivotAggregates.includes(aggregate))
    throw new PivotDataError('aggregate');
  const cells = new Map<string, Map<string, Stats>>();
  const rows = new Map<string, Stats>();
  const columns = new Map<string, Stats>();
  const total = stats();
  if (result.kind === 'bindings')
    for (const [index, row] of result.bindings.entries()) {
      const rowName = row.pivotRow?.value;
      const columnName = row.pivotColumn?.value;
      const term = row.pivotValue;
      const raw = term?.value.trim() ?? '';
      const value = Number(raw);
      if (
        !rowName?.trim() ||
        !columnName?.trim() ||
        !term ||
        !['literal', 'typed-literal'].includes(term.type) ||
        !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) ||
        !Number.isFinite(value)
      )
        throw new PivotDataError('row', index + 1);
      let rowStats = rows.get(rowName);
      if (!rowStats) {
        rowStats = stats();
        rows.set(rowName, rowStats);
      }
      let columnStats = columns.get(columnName);
      if (!columnStats) {
        columnStats = stats();
        columns.set(columnName, columnStats);
      }
      let rowCells = cells.get(rowName);
      if (!rowCells) {
        rowCells = new Map();
        cells.set(rowName, rowCells);
      }
      let cell = rowCells.get(columnName);
      if (!cell) {
        cell = stats();
        rowCells.set(columnName, cell);
      }
      for (const target of [cell, rowStats, columnStats, total])
        add(target, value, aggregate, index + 1);
    }
  const rowNames = [...rows.keys()];
  const columnNames = [...columns.keys()];
  return {
    aggregate,
    rows: rowNames,
    columns: columnNames,
    cells: rowNames.map((row) =>
      columnNames.map((column) =>
        evaluate(cells.get(row)?.get(column), aggregate),
      ),
    ),
    rowTotals: [...rows.values()].map((value) => evaluate(value, aggregate)),
    columnTotals: [...columns.values()].map((value) =>
      evaluate(value, aggregate),
    ),
    grandTotal: evaluate(total, aggregate),
  };
}
export function transposePivotModel(model: PivotModel): PivotModel {
  return {
    ...model,
    rows: model.columns,
    columns: model.rows,
    cells: model.columns.map((_, column) =>
      model.rows.map((_, row) => model.cells[row]?.[column] ?? null),
    ),
    rowTotals: model.columnTotals,
    columnTotals: model.rowTotals,
  };
}
