import { createSvgIcon } from '@ldforge/core';
import type { ResultRendererPlugin } from '@ldforge/core';
import {
  buildPivotModel,
  pivotAggregates,
  PivotDataError,
  transposePivotModel,
} from './model.js';
import type { PivotAggregate, PivotModel } from './model.js';
export {
  buildPivotModel,
  pivotAggregates,
  PivotDataError,
  transposePivotModel,
} from './model.js';
export type { PivotAggregate, PivotModel } from './model.js';
export interface PivotRendererOptions {
  readonly aggregate?: PivotAggregate;
  readonly heatmap?: boolean;
  /** 0–20, default 3. Raw values remain available as cell titles/data-value. */
  readonly maximumFractionDigits?: number;
  readonly rowTitle?: string;
  readonly columnTitle?: string;
}
type Sort = 'label-asc' | 'label-desc' | 'total-asc' | 'total-desc';
const messages = {
  en: {
    label: 'Pivot',
    empty: 'No pivot data to display.',
    invalid: 'Invalid pivot binding at row',
    aggregateError:
      'Unsupported pivot aggregate. Use sum, count, avg, min or max.',
    aggregate: 'Aggregate',
    sum: 'Sum',
    count: 'Count',
    avg: 'Average',
    min: 'Minimum',
    max: 'Maximum',
    swap: 'Swap axes',
    heatmap: 'Cell colors',
    row: 'Rows',
    column: 'Columns',
    total: 'Total',
    sortRows: 'Sort rows',
    sortColumns: 'Sort columns',
    asc: 'Label A–Z',
    desc: 'Label Z–A',
    low: 'Total low–high',
    high: 'Total high–low',
    missing: 'No observations',
  },
  nl: {
    label: 'Draaitabel',
    empty: 'Geen draaitabelgegevens om te tonen.',
    invalid: 'Ongeldige draaitabelbinding op rij',
    aggregateError:
      'Onbekende aggregatie. Gebruik sum, count, avg, min of max.',
    aggregate: 'Aggregatie',
    sum: 'Som',
    count: 'Aantal',
    avg: 'Gemiddelde',
    min: 'Minimum',
    max: 'Maximum',
    swap: 'Assen omwisselen',
    heatmap: 'Celkleuren',
    row: 'Rijen',
    column: 'Kolommen',
    total: 'Totaal',
    sortRows: 'Rijen sorteren',
    sortColumns: 'Kolommen sorteren',
    asc: 'Naam A–Z',
    desc: 'Naam Z–A',
    low: 'Totaal laag–hoog',
    high: 'Totaal hoog–laag',
    missing: 'Geen waarnemingen',
  },
};
/** A native, accessible table: this renderer needs no external visualization library. */
export function createPivotRenderer(
  options: PivotRendererOptions = {},
): ResultRendererPlugin {
  const digits = options.maximumFractionDigits ?? 3;
  if (!Number.isInteger(digits) || digits < 0 || digits > 20)
    throw new Error('maximumFractionDigits must be an integer from 0 to 20.');
  return {
    id: 'pivot',
    wizard: {
      description: {
        en: 'Group and summarize numeric results in a pivot table.',
        nl: 'Groepeer en vat numerieke resultaten samen in een draaitabel.',
      },
      bindings: [
        {
          variable: 'pivotRow',
          required: true,
          description: { en: 'Row category', nl: 'Rijcategorie' },
        },
        {
          variable: 'pivotColumn',
          required: true,
          description: { en: 'Column category', nl: 'Kolomcategorie' },
        },
        {
          variable: 'pivotValue',
          required: true,
          description: {
            en: 'Finite numeric value',
            nl: 'Eindige numerieke waarde',
          },
        },
      ],
      options: [
        {
          key: 'pivot-aggregate',
          label: { en: 'Aggregate', nl: 'Aggregatie' },
          type: 'select',
          defaultValue: 'sum',
          choices: [
            { value: 'sum', label: { en: 'Sum', nl: 'Som' } },
            { value: 'count', label: { en: 'Count', nl: 'Aantal' } },
            { value: 'avg', label: { en: 'Average', nl: 'Gemiddelde' } },
            { value: 'min', label: { en: 'Minimum', nl: 'Minimum' } },
            { value: 'max', label: { en: 'Maximum', nl: 'Maximum' } },
          ],
        },
        {
          key: 'pivot-title',
          label: { en: 'Title', nl: 'Titel' },
          type: 'text',
          defaultValue: '',
        },
        {
          key: 'pivot-row-title',
          label: { en: 'Row title', nl: 'Rijtitel' },
          type: 'text',
          defaultValue: '',
        },
        {
          key: 'pivot-column-title',
          label: { en: 'Column title', nl: 'Kolomtitel' },
          type: 'text',
          defaultValue: '',
        },
      ],
    },
    label: { en: 'Pivot', nl: 'Draaitabel' },
    documentationUrl: 'https://ldforge.nl/plugins.html#pivot',
    icon: createSvgIcon(['M3 3h18v18H3zM3 9h18M9 3v18M15 9v12M9 15h12']),
    supports: (result) =>
      result.kind === 'bindings' &&
      ['pivotRow', 'pivotColumn', 'pivotValue'].every((key) =>
        result.variables.includes(key),
      ),
    render(container, result, context) {
      const locale = context?.locale ?? 'en';
      const text = messages[locale];
      const doc = container.ownerDocument;
      let aggregate = (context?.directives?.['pivot-aggregate'] ??
        options.aggregate ??
        'sum') as PivotAggregate;
      let model: PivotModel;
      try {
        model = buildPivotModel(result, aggregate);
      } catch (error) {
        const alert = doc.createElement('p');
        alert.setAttribute('role', 'alert');
        alert.textContent =
          error instanceof PivotDataError && error.reason === 'row'
            ? `${text.invalid} ${error.row}.`
            : text.aggregateError;
        container.replaceChildren(alert);
        return;
      }
      if (!model.rows.length) {
        container.textContent = text.empty;
        return;
      }
      let swapped = false;
      let heatmap = options.heatmap ?? true;
      let rowSort: Sort = 'label-asc';
      let columnSort: Sort = 'label-asc';
      let disposed = false;
      const format = new Intl.NumberFormat(locale, {
        maximumFractionDigits: digits,
      });
      const title = context?.directives?.['pivot-title'] ?? text.label;
      const rowTitle =
        context?.directives?.['pivot-row-title'] ??
        options.rowTitle ??
        text.row;
      const columnTitle =
        context?.directives?.['pivot-column-title'] ??
        options.columnTitle ??
        text.column;
      const section = doc.createElement('section');
      section.className = 'ldforge-pivot';
      Object.assign(section.style, { minWidth: '0', maxWidth: '100%' });
      const style = doc.createElement('style');
      style.textContent = `.ldforge-pivot table{border-collapse:collapse;width:100%;font-size:13px}.ldforge-pivot caption{text-align:left;padding:0 0 10px;font-weight:600;color:var(--ldforge-muted, #405c57)}.ldforge-pivot th,.ldforge-pivot td{border:1px solid var(--ldforge-border, #d4dfdd);padding:9px 12px}.ldforge-pivot td{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.ldforge-pivot th{text-align:left;background:var(--ldforge-surface-tinted, #f0f5f1);max-width:200px;overflow-wrap:anywhere}.ldforge-pivot tfoot th,.ldforge-pivot tfoot td,.ldforge-pivot .ldforge-pivot-total{background:var(--ldforge-hover, #edf3ee);font-weight:650}.ldforge-pivot-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}.ldforge-pivot-controls label{display:inline-flex;gap:5px;align-items:center}.ldforge-pivot-controls select{max-width:100%}`;
      const heading = doc.createElement('h3');
      heading.textContent = title;
      const controls = doc.createElement('div');
      controls.className = 'ldforge-pivot-controls';
      const tableRegion = doc.createElement('div');
      tableRegion.className = 'ldforge-pivot-table';
      tableRegion.tabIndex = 0;
      tableRegion.setAttribute('role', 'region');
      tableRegion.setAttribute('aria-label', title);
      Object.assign(tableRegion.style, {
        overflow: 'auto',
        maxHeight: '520px',
        maxWidth: '100%',
      });
      const status = doc.createElement('p');
      status.setAttribute('role', 'status');
      status.style.fontSize = '12px';
      section.append(style, heading, controls, tableRegion, status);
      container.replaceChildren(section);
      function selector(
        label: string,
        choices: [string, string][],
        value: string,
        change: (value: string) => void,
      ): HTMLSelectElement {
        const wrapper = doc.createElement('label');
        wrapper.append(`${label}: `);
        const select = doc.createElement('select');
        select.setAttribute('aria-label', label);
        for (const [key, name] of choices) select.append(new Option(name, key));
        select.value = value;
        select.addEventListener('change', () => {
          if (!disposed) change(select.value);
        });
        wrapper.append(select);
        controls.append(wrapper);
        return select;
      }
      const aggregateControl = selector(
        text.aggregate,
        pivotAggregates.map((key) => [key, text[key]]),
        aggregate,
        (value) => {
          try {
            const next = value as PivotAggregate;
            model = buildPivotModel(result, next);
            aggregate = next;
            draw();
          } catch (error) {
            aggregateControl.value = aggregate;
            status.textContent =
              error instanceof PivotDataError && error.row
                ? `${text.invalid} ${error.row}.`
                : text.aggregateError;
          }
        },
      );
      const swap = doc.createElement('button');
      swap.type = 'button';
      swap.textContent = text.swap;
      swap.setAttribute('aria-pressed', 'false');
      swap.addEventListener('click', () => {
        if (disposed) return;
        swapped = !swapped;
        swap.setAttribute('aria-pressed', String(swapped));
        draw();
      });
      controls.append(swap);
      const heatLabel = doc.createElement('label');
      const heat = doc.createElement('input');
      heat.type = 'checkbox';
      heat.checked = heatmap;
      heat.addEventListener('change', () => {
        if (disposed) return;
        heatmap = heat.checked;
        draw();
      });
      heatLabel.append(heat, text.heatmap);
      controls.append(heatLabel);
      const sorts: [string, string][] = [
        ['label-asc', text.asc],
        ['label-desc', text.desc],
        ['total-asc', text.low],
        ['total-desc', text.high],
      ];
      selector(text.sortRows, sorts, rowSort, (value) => {
        rowSort = value as Sort;
        draw();
      });
      selector(text.sortColumns, sorts, columnSort, (value) => {
        columnSort = value as Sort;
        draw();
      });
      function order(
        names: string[],
        totals: (number | null)[],
        sort: Sort,
      ): number[] {
        return names
          .map((_, index) => index)
          .sort((a, b) => {
            const label = names[a]?.localeCompare(names[b] ?? '', locale) ?? 0;
            if (sort === 'label-asc') return label;
            if (sort === 'label-desc') return -label;
            return (
              ((totals[a] ?? 0) - (totals[b] ?? 0)) *
                (sort === 'total-asc' ? 1 : -1) || label
            );
          });
      }
      function draw(): void {
        const current = swapped ? transposePivotModel(model) : model;
        const rowOrder = order(current.rows, current.rowTotals, rowSort);
        const columnOrder = order(
          current.columns,
          current.columnTotals,
          columnSort,
        );
        const table = doc.createElement('table');
        table.createCaption().textContent = `${swapped ? columnTitle : rowTitle} × ${swapped ? rowTitle : columnTitle} · ${text[aggregate]}`;
        const header = table.createTHead().insertRow();
        const corner = doc.createElement('th');
        corner.scope = 'col';
        corner.textContent = swapped ? columnTitle : rowTitle;
        header.append(corner);
        for (const index of columnOrder) {
          const cell = doc.createElement('th');
          cell.scope = 'col';
          cell.textContent = current.columns[index] ?? '';
          header.append(cell);
        }
        const totalHead = doc.createElement('th');
        totalHead.scope = 'col';
        totalHead.textContent = text.total;
        header.append(totalHead);
        let max = 0;
        for (const row of current.cells)
          for (const value of row)
            if (value !== null) max = Math.max(max, Math.abs(value));
        function valueCell(
          row: HTMLTableRowElement,
          value: number | null,
          total = false,
        ): void {
          const cell = row.insertCell();
          cell.textContent = value === null ? '—' : format.format(value);
          cell.title = value === null ? text.missing : String(value);
          if (value !== null) cell.dataset.value = String(value);
          if (total) cell.className = 'ldforge-pivot-total';
          else if (heatmap && value !== null && max) {
            cell.style.backgroundColor = `rgba(${value < 0 ? '180, 87, 58' : '8, 127, 115'}, ${0.06 + (Math.abs(value) / max) * 0.28})`;
          }
        }
        const body = table.createTBody();
        for (const rowIndex of rowOrder) {
          const row = body.insertRow();
          const label = doc.createElement('th');
          label.scope = 'row';
          label.textContent = current.rows[rowIndex] ?? '';
          row.append(label);
          for (const columnIndex of columnOrder)
            valueCell(row, current.cells[rowIndex]?.[columnIndex] ?? null);
          valueCell(row, current.rowTotals[rowIndex] ?? null, true);
        }
        const footer = table.createTFoot().insertRow();
        const label = doc.createElement('th');
        label.scope = 'row';
        label.textContent = text.total;
        footer.append(label);
        for (const columnIndex of columnOrder)
          valueCell(footer, current.columnTotals[columnIndex] ?? null, true);
        valueCell(footer, current.grandTotal, true);
        tableRegion.replaceChildren(table);
        status.textContent = `${current.rows.length} ${text.row.toLowerCase()} × ${current.columns.length} ${text.column.toLowerCase()}`;
      }
      draw();
      return () => {
        disposed = true;
      };
    },
  };
}
