import { createSvgIcon } from '@ldforge/core';
import type { Locale, ResultRendererPlugin } from '@ldforge/core';
import { buildChartModel, ChartDataError } from './model.js';
import type { ChartRendererConfig } from './model.js';
export type { ChartKind, ChartRendererConfig } from './model.js';

export const DEFAULT_CHART_LIBRARY_URL =
  'https://cdn.jsdelivr.net/npm/chart.js@4.6.1/auto/+esm';
export interface ChartRendererOptions {
  /** External ESM URL; defaults to a pinned Chart.js CDN module. Loaded only on activation. */
  readonly libraryUrl?: string;
  /** Supply a self-hosted dynamic import instead. Must resolve to a Chart.js ESM module. */
  readonly loadLibrary?: () => Promise<unknown>;
}
export interface ChartHandle {
  destroy(): void;
}
export interface ChartConstructor {
  new (canvas: HTMLCanvasElement, config: ChartRendererConfig): ChartHandle;
}
const messages = {
  en: {
    label: 'Charts',
    loading: 'Loading chart library…',
    retry: 'Retry loading chart',
    failed: 'Could not load or render the chart.',
    empty: 'No chart data to display.',
    data: 'Chart data',
    category: 'Label',
    type: 'Unsupported chart type. Use bar, line, pie or doughnut.',
    row: 'Invalid chart binding at row',
    series: 'Pie and doughnut charts require a single series.',
    negative: 'Pie and doughnut charts require nonnegative values. Invalid row',
  },
  nl: {
    label: 'Grafieken',
    loading: 'Grafiekbibliotheek laden…',
    retry: 'Grafiek opnieuw laden',
    failed: 'De grafiek kon niet geladen of getoond worden.',
    empty: 'Geen grafiekgegevens om te tonen.',
    data: 'Grafiekgegevens',
    category: 'Label',
    type: 'Onbekend grafiektype. Gebruik bar, line, pie of doughnut.',
    row: 'Ongeldige grafiekbinding op rij',
    series: 'Taart- en ringdiagrammen vereisen één reeks.',
    negative:
      'Taart- en ringdiagrammen vereisen niet-negatieve waarden. Ongeldige rij',
  },
};
const externalModules = new Map<string, Promise<unknown>>();
function externalLibrary(url: string): Promise<unknown> {
  let pending = externalModules.get(url);
  if (!pending) {
    pending = import(/* @vite-ignore */ url).catch((error: unknown) => {
      externalModules.delete(url);
      throw error;
    });
    externalModules.set(url, pending);
  }
  return pending;
}
function chartConstructor(module: unknown): ChartConstructor {
  if (!module || typeof module !== 'object')
    throw new Error('Expected a Chart.js ESM module.');
  const exports = module as { Chart?: unknown; default?: unknown };
  const constructor = exports.Chart ?? exports.default;
  if (typeof constructor !== 'function')
    throw new Error('Chart.js module does not export Chart or default.');
  return constructor as ChartConstructor;
}

/** No chart code or network access until render() activates the plugin. */
export function createChartRenderer(
  options: ChartRendererOptions = {},
): ResultRendererPlugin {
  let loaded: Promise<ChartConstructor> | undefined;
  function load(base: string): Promise<ChartConstructor> {
    if (!loaded)
      loaded = Promise.resolve()
        .then(() => {
          if (options.loadLibrary) return options.loadLibrary();
          const url = new URL(
            options.libraryUrl ?? DEFAULT_CHART_LIBRARY_URL,
            base,
          );
          if (!['https:', 'http:'].includes(url.protocol))
            throw new Error('Chart module URL must use HTTP or HTTPS.');
          return externalLibrary(url.href);
        })
        .then(chartConstructor)
        .catch((error: unknown) => {
          loaded = undefined;
          throw error;
        });
    return loaded;
  }
  return {
    id: 'charts',
    wizard: {
      description: {
        en: 'Pie and doughnut require one nonnegative series.',
        nl: 'Taart- en ringdiagrammen vereisen \u00e9\u00e9n niet-negatieve reeks.',
      },
      bindings: [
        {
          variable: 'chart_label',
          required: true,
          description: { en: 'Category label', nl: 'Categorielabel' },
        },
        {
          variable: 'chart_value',
          required: true,
          description: {
            en: 'Finite numeric value',
            nl: 'Eindige numerieke waarde',
          },
        },
        {
          variable: 'chart_series',
          required: false,
          description: { en: 'Series name', nl: 'Reeksnaam' },
        },
      ],
      options: [
        {
          key: 'chart',
          label: { en: 'Chart type', nl: 'Grafiektype' },
          type: 'select',
          defaultValue: 'bar',
          choices: [
            { value: 'bar', label: { en: 'Bar', nl: 'Bar' } },
            { value: 'line', label: { en: 'Line', nl: 'Line' } },
            { value: 'pie', label: { en: 'Pie', nl: 'Pie' } },
            { value: 'doughnut', label: { en: 'Doughnut', nl: 'Doughnut' } },
          ],
        },
        {
          key: 'chart-title',
          label: { en: 'Title', nl: 'Titel' },
          type: 'text',
          defaultValue: '',
        },
      ],
    },
    label: { en: 'Charts', nl: 'Grafieken' },
    documentationUrl: 'https://ldforge.nl/plugins.html#charts',
    icon: createSvgIcon(['M4 3v18h17M8 16v-5M13 16V6M18 16v-8']),
    supports: (result) =>
      result.kind === 'bindings' &&
      ['chart_label', 'chart_value'].every((name) =>
        result.variables.includes(name),
      ),
    render(container, result, context) {
      const locale: Locale = context?.locale ?? 'en';
      const text = messages[locale];
      const doc = container.ownerDocument;
      let model: ChartRendererConfig;
      try {
        model = buildChartModel(result, context);
      } catch (error) {
        const message = doc.createElement('p');
        message.setAttribute('role', 'alert');
        message.textContent =
          error instanceof ChartDataError
            ? `${text[error.reason]}${error.row ? ` ${error.row}.` : ''}`
            : text.failed;
        container.replaceChildren(message);
        return;
      }
      if (!model.data.labels.length) {
        container.textContent = text.empty;
        return;
      }
      const section = doc.createElement('section');
      section.className = 'ldforge-chart';
      const title = context?.directives?.['chart-title'] ?? text.label;
      const heading = doc.createElement('h3');
      heading.textContent = title;
      const frame = doc.createElement('div');
      frame.className = 'ldforge-chart-frame';
      // Standalone renderer hosts need no additional stylesheet for canvas sizing.
      frame.style.position = 'relative';
      frame.style.height = '320px';
      const canvas = doc.createElement('canvas');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', title);
      frame.append(canvas);
      const status = doc.createElement('p');
      status.setAttribute('role', 'status');
      const retry = doc.createElement('button');
      retry.type = 'button';
      retry.textContent = text.retry;
      retry.hidden = true;
      const details = doc.createElement('details');
      const summary = doc.createElement('summary');
      summary.textContent = text.data;
      const table = doc.createElement('table');
      const caption = table.createCaption();
      caption.textContent = title;
      const head = table.createTHead().insertRow();
      for (const label of [
        text.category,
        ...model.data.datasets.map((dataset) => dataset.label),
      ]) {
        const cell = doc.createElement('th');
        cell.scope = 'col';
        cell.textContent = label;
        head.append(cell);
      }
      const body = table.createTBody();
      for (const [index, label] of model.data.labels.entries()) {
        const row = body.insertRow();
        row.insertCell().textContent = label;
        for (const dataset of model.data.datasets) {
          const value = dataset.data[index];
          row.insertCell().textContent =
            value == null ? '' : new Intl.NumberFormat(locale).format(value);
        }
      }
      details.append(summary, table);
      section.append(heading, frame, status, retry, details);
      container.replaceChildren(section);
      let disposed = false;
      let chart: ChartHandle | undefined;
      async function activate(): Promise<void> {
        retry.hidden = true;
        status.textContent = text.loading;
        frame.hidden = true;
        section.setAttribute('aria-busy', 'true');
        try {
          const Chart = await load(doc.baseURI);
          if (disposed) return;
          frame.hidden = false;
          chart = new Chart(canvas, model);
          status.textContent = '';
        } catch {
          if (disposed) return;
          frame.hidden = true;
          status.textContent = text.failed;
          retry.hidden = false;
        } finally {
          if (!disposed) section.setAttribute('aria-busy', 'false');
        }
      }
      retry.addEventListener('click', () => {
        void activate();
      });
      void activate();
      return () => {
        disposed = true;
        chart?.destroy();
      };
    },
  };
}
