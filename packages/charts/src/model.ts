import type { QueryResult, ResultRendererContext } from '@ldforge/core';

export type ChartKind = 'bar' | 'line' | 'pie' | 'doughnut';
export interface ChartRendererConfig {
  type: ChartKind;
  data: {
    labels: string[];
    datasets: {
      label: string;
      data: (number | null)[];
      backgroundColor: string | string[];
      borderColor: string;
      borderWidth: number;
    }[];
  };
  options: {
    responsive: boolean;
    maintainAspectRatio: boolean;
    animation: false;
    locale: string;
    plugins: { legend: { display: boolean; position: 'bottom' } };
    scales?: { y: { beginAtZero: boolean } };
  };
}
export class ChartDataError extends Error {
  constructor(
    readonly reason: 'type' | 'row' | 'series' | 'negative',
    readonly row?: number,
  ) {
    super(reason);
  }
}
const palette = [
  '#087f73',
  '#d6a346',
  '#537cac',
  '#a76e95',
  '#78a16e',
  '#bd765a',
];

export function buildChartModel(
  result: QueryResult,
  context?: ResultRendererContext,
): ChartRendererConfig {
  const type = context?.directives?.chart ?? 'bar';
  if (!['bar', 'line', 'pie', 'doughnut'].includes(type))
    throw new ChartDataError('type');
  const round = type === 'pie' || type === 'doughnut';
  const labels: string[] = [];
  const knownLabels = new Set<string>();
  const series = new Map<string, Map<string, number>>();
  if (result.kind === 'bindings')
    for (const [index, row] of result.bindings.entries()) {
      const label = row.chart_label?.value;
      const term = row.chart_value;
      const lexical = term?.value.trim() ?? '';
      const value = Number(lexical);
      if (
        !label?.trim() ||
        !term ||
        !['literal', 'typed-literal'].includes(term.type) ||
        !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(lexical) ||
        !Number.isFinite(value)
      )
        throw new ChartDataError('row', index + 1);
      if (round && value < 0) throw new ChartDataError('negative', index + 1);
      if (!knownLabels.has(label)) {
        knownLabels.add(label);
        labels.push(label);
      }
      const name = row.chart_series?.value ?? '';
      let points = series.get(name);
      if (!points) {
        points = new Map();
        series.set(name, points);
      }
      const total = (points.get(label) ?? 0) + value;
      if (!Number.isFinite(total)) throw new ChartDataError('row', index + 1);
      points.set(label, total);
    }
  if (round && series.size > 1) throw new ChartDataError('series');
  return {
    type: type as ChartKind,
    data: {
      labels,
      datasets: [...series].map(([name, points], index) => ({
        label: name || (context?.locale === 'nl' ? 'Waarde' : 'Value'),
        data: labels.map((label) => points.get(label) ?? null),
        backgroundColor: round
          ? labels.map(
              (_, index) =>
                palette[index % palette.length] ?? palette[0] ?? '#087f73',
            )
          : (palette[index % palette.length] ?? '#087f73'),
        borderColor: palette[index % palette.length] ?? '#087f73',
        borderWidth: 2,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      locale: context?.locale ?? 'en',
      plugins: {
        legend: { display: round || series.size > 1, position: 'bottom' },
      },
      ...(!round ? { scales: { y: { beginAtZero: true } } } : {}),
    },
  };
}
