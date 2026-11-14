import { parseColumnWidths, validColumnWidths } from './table-widths.js';
import {
  translate,
  resolveLocale,
  createSvgIcon,
  graphToBindings,
} from '@ldforge/core';
import type { ResultRendererPlugin } from '@ldforge/core';

export interface TableRendererOptions {
  /** Percentages in result-variable order; must be positive and total 100. */
  readonly columnWidths?: readonly number[];
}
export function createTableRenderer(
  options: TableRendererOptions = {},
): ResultRendererPlugin {
  if (options.columnWidths && !validColumnWidths(options.columnWidths))
    throw new Error(
      'columnWidths must contain positive percentages totaling 100.',
    );
  return {
    id: 'table',
    wizard: {
      description: {
        en: 'Accepts SELECT bindings or RDF graph results.',
        nl: 'Voor SELECT-bindings of RDF-graafresultaten.',
      },
      options: [
        {
          key: 'columns',
          aliases: ['colums'],
          label: {
            en: 'Column widths (e.g. 40%,40%,20%)',
            nl: 'Kolombreedtes (bijv. 40%,40%,20%)',
          },
          type: 'text',
          defaultValue: '',
        },
      ],
      bindings: [],
    },
    documentationUrl: 'https://ldforge.nl/plugins.html#table',
    icon: createSvgIcon(['M3 3h18v18H3zM3 9h18M9 9v12']),
    label: { en: 'Table', nl: 'Tabel' },
    supports: (result) => result.kind === 'bindings' || result.kind === 'graph',
    render(container, result, context) {
      if (result.kind === 'graph') result = graphToBindings(result);
      if (result.kind !== 'bindings') return;
      const doc = container.ownerDocument;
      const table = doc.createElement('table');
      table.className = 'ldforge-table';
      table.style.tableLayout = 'fixed';
      table.style.width = '100%';
      const configured =
        context?.directives?.columns ?? context?.directives?.colums;
      const requested =
        configured === undefined
          ? options.columnWidths
          : parseColumnWidths(configured);
      const invalid =
        (configured !== undefined && !requested) ||
        (requested !== undefined &&
          requested.length !== result.variables.length);
      const widths =
        !invalid && requested
          ? requested
          : result.variables.map(() => 100 / result.variables.length);
      const columns = doc.createElement('colgroup');
      for (const width of widths) {
        const column = doc.createElement('col');
        column.style.width = `${width}%`;
        columns.append(column);
      }
      table.append(columns);
      const caption = table.createCaption();
      const locale = context?.locale ?? resolveLocale();
      caption.textContent = translate(
        locale,
        result.bindings.length === 1 ? 'resultOne' : 'resultMany',
        { count: new Intl.NumberFormat(locale).format(result.bindings.length) },
      );
      const header = table.createTHead().insertRow();
      for (const variable of result.variables) {
        const cell = doc.createElement('th');
        cell.scope = 'col';
        cell.style.overflowWrap = 'anywhere';
        cell.textContent = variable;
        header.append(cell);
      }
      const body = table.createTBody();
      for (const binding of result.bindings) {
        const row = body.insertRow();
        for (const variable of result.variables) {
          const cell = row.insertCell();
          cell.style.overflowWrap = 'anywhere';
          cell.style.whiteSpace = 'pre-wrap';
          const term = binding[variable];
          cell.textContent = term?.value ?? '';
          if (term)
            cell.title = term['xml:lang']
              ? translate(locale, 'termLanguage', {
                  language: term['xml:lang'],
                })
              : (term.datatype ?? term.type);
        }
      }
      if (invalid) {
        const warning = doc.createElement('p');
        warning.setAttribute('role', 'alert');
        warning.textContent =
          locale === 'nl'
            ? 'Ongeldige kolombreedtes: gebruik één positief percentage per kolom, samen 100%. Gelijke breedtes worden gebruikt.'
            : 'Invalid column widths: use one positive percentage per column, totaling 100%. Equal widths are used.';
        container.replaceChildren(warning, table);
      } else container.replaceChildren(table);
    },
  };
}

export function createBooleanRenderer(): ResultRendererPlugin {
  return {
    id: 'boolean',
    wizard: {
      description: {
        en: 'Requires a boolean ASK result.',
        nl: 'Vereist een boolean ASK-resultaat.',
      },
      bindings: [],
    },
    documentationUrl: 'https://ldforge.nl/plugins.html#boolean',
    icon: createSvgIcon(['m5 12 4 4L19 6']),
    label: { en: 'Boolean', nl: 'Booleaans' },
    supports: (result) => result.kind === 'boolean',
    render(container, result, context) {
      if (result.kind !== 'boolean') return;
      const output = container.ownerDocument.createElement('p');
      output.className = 'ldforge-boolean';
      output.dataset.value = String(result.value);
      output.textContent = translate(
        context?.locale ?? resolveLocale(),
        result.value ? 'true' : 'false',
      );
      container.replaceChildren(output);
    },
  };
}

export function createJsonRenderer(): ResultRendererPlugin {
  return {
    id: 'json',
    wizard: {
      description: {
        en: 'Accepts any query result.',
        nl: 'Geschikt voor elk queryresultaat.',
      },
      bindings: [],
    },
    documentationUrl: 'https://ldforge.nl/plugins.html#json',
    icon: createSvgIcon(['M8 3H6v7l-3 2 3 2v7h2M16 3h2v7l3 2-3 2v7h-2']),
    label: 'JSON',
    supports: () => true,
    render(container, result) {
      const pre = container.ownerDocument.createElement('pre');
      pre.textContent = JSON.stringify(result, null, 2);
      container.replaceChildren(pre);
    },
  };
}

export { createCardsRenderer } from './cards.js';
export type { CardsRendererOptions } from './cards.js';
