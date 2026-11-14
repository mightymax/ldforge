import { parseColumnWidths, validColumnWidths } from './table-widths.js';
import {
  translate,
  resolveLocale,
  createSvgIcon,
  graphToBindings,
} from '@ldforge/core';
import type { ResultRendererPlugin, Binding } from '@ldforge/core';
import { createResourceInspector } from './resource-inspector.js';
import type { ResourceLoader } from './resource-inspector.js';
export interface TableRendererOptions {
  /** Optional endpoint-backed resource lookup; local graph triples work without it. */
  readonly loadResource?: ResourceLoader;
  readonly virtualizeThreshold?: number;
  readonly viewportHeight?: number;
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
      const graph = result.kind === 'graph' ? result : undefined;
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
      const data = result;
      const inspector = createResourceInspector(container, {
        locale,
        ...(graph ? { graph } : {}),
        ...(options.loadResource ? { loadResource: options.loadResource } : {}),
      });
      const controls = doc.createElement('div');
      controls.className = 'ldforge-table-controls';
      controls.style.cssText =
        'display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-bottom:12px';
      const search = doc.createElement('input');
      search.type = 'search';
      search.style.cssText =
        'flex:1 1 180px;min-width:0;max-width:100%;box-sizing:border-box';
      search.placeholder =
        locale === 'nl' ? 'Zoeken in alle kolommen' : 'Search all columns';
      search.setAttribute('aria-label', search.placeholder);
      controls.append(search);
      const viewport = doc.createElement('div');
      viewport.className = 'ldforge-table-viewport';
      const virtual =
        data.bindings.length > (options.virtualizeThreshold ?? 500);
      const height = Math.max(120, options.viewportHeight ?? 480);
      if (virtual) {
        viewport.style.maxHeight = `${height}px`;
        viewport.style.overflow = 'auto';
        viewport.style.overflowAnchor = 'none';
        viewport.tabIndex = 0;
        viewport.setAttribute(
          'aria-label',
          locale === 'nl' ? 'Resultaten' : 'Results',
        );
      }
      viewport.append(table);
      const header = table.createTHead().insertRow();
      const filters: HTMLInputElement[] = [];

      let sortColumn = -1;
      let direction = 1;
      let rows = [...data.bindings];
      const collator = new Intl.Collator(locale, { numeric: true });
      const headers: HTMLTableCellElement[] = [];
      for (const [index, variable] of data.variables.entries()) {
        const cell = doc.createElement('th');
        cell.scope = 'col';
        if (virtual) cell.style.top = '0';
        cell.style.overflowWrap = 'anywhere';
        const button = doc.createElement('button');
        button.type = 'button';
        button.textContent = variable;
        button.onclick = () => {
          direction = sortColumn === index ? -direction : 1;
          sortColumn = index;
          refresh();
        };
        cell.append(button);
        headers.push(cell);
        header.append(cell);
        const filterCell = doc.createElement('label');
        filterCell.textContent = variable;
        filterCell.style.cssText =
          'display:flex;flex-direction:column;flex:1 1 120px;min-width:0';
        controls.append(filterCell);
        const filter = doc.createElement('input');
        filter.type = 'search';
        filter.style.width = '100%';
        filter.style.minWidth = '0';
        filter.style.boxSizing = 'border-box';
        filter.setAttribute(
          'aria-label',
          `${locale === 'nl' ? 'Filter' : 'Filter'} ${variable}`,
        );
        filter.oninput = () => refresh();
        filters.push(filter);
        filterCell.append(filter);
      }
      const body = table.createTBody();
      const rowHeight = 36;
      function draw() {
        const scrollTop = viewport.scrollTop;
        const nextBody = doc.createElement('tbody');
        const start = virtual
          ? Math.max(
              0,
              Math.floor(
                (scrollTop - (table.tHead?.offsetHeight ?? 0)) / rowHeight,
              ) - 5,
            )
          : 0;
        const first = Math.min(start, rows.length);
        const end = virtual
          ? Math.min(rows.length, first + Math.ceil(height / rowHeight) + 12)
          : rows.length;
        function spacer(size: number) {
          if (!size) return;
          const row = nextBody.insertRow();
          row.setAttribute('aria-hidden', 'true');
          const cell = row.insertCell();
          cell.colSpan = Math.max(1, data.variables.length);
          cell.style.cssText = `height:${size}px;padding:0;border:0;line-height:0`;
        }
        spacer(first * rowHeight);
        for (let index = first; index < end; index++) {
          const binding = rows[index];
          if (!binding) continue;
          const row = nextBody.insertRow();
          row.setAttribute('aria-rowindex', String(index + 2));
          if (virtual) row.style.height = `${rowHeight}px`;
          for (const variable of data.variables) {
            const cell = row.insertCell();
            cell.style.overflowWrap = 'anywhere';
            cell.style.whiteSpace = 'pre-wrap';
            const term = binding[variable];
            const value = doc.createElement('span');
            value.textContent = term?.value ?? '';
            if (term) value.title = term.value;
            if (virtual) {
              cell.style.cssText +=
                ';height:36px;box-sizing:border-box;padding:5px 12px;line-height:25px';
              cell.style.whiteSpace = 'nowrap';
              cell.style.overflow = 'hidden';
              value.style.cssText =
                'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-height:28px';
            }
            if (term?.type === 'uri') {
              const button = doc.createElement('button');
              button.type = 'button';
              button.className = 'ldforge-resource-info';
              button.style.cssText =
                'display:inline-flex;align-items:center;justify-content:center;flex:0 0 24px;width:24px;height:24px;padding:3px;margin:0;border:0;border-radius:50%;background:transparent;color:inherit;box-shadow:none;cursor:pointer';
              const label = `${locale === 'nl' ? 'Informatie over' : 'Information about'} ${term.value}`;
              button.setAttribute('aria-label', label);
              button.title = label;
              const infoIcon = createSvgIcon([
                'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
                'M12 11v6M12 7h.01',
              ])(doc);
              button.append(infoIcon);
              button.onclick = () => {
                void inspector.open(term);
              };
              const resource = doc.createElement('span');
              resource.style.cssText =
                'display:flex;align-items:baseline;gap:4px;min-width:0';
              value.style.minWidth = '0';
              value.style.flex = '0 1 auto';
              button.style.alignSelf = 'center';
              resource.append(value, button);
              cell.append(resource);
            }
            if (term?.type !== 'uri') cell.append(value);
            if (term)
              cell.title = term['xml:lang']
                ? translate(locale, 'termLanguage', {
                    language: term['xml:lang'],
                  })
                : (term.datatype ?? term.type);
          }
        }
        spacer((rows.length - end) * rowHeight);
        body.replaceChildren(...nextBody.childNodes);
        table.setAttribute('aria-rowcount', String(rows.length + 1));
        if (virtual) viewport.scrollTop = scrollTop;
      }
      function refresh() {
        const query = search.value.toLocaleLowerCase(locale);
        rows = data.bindings.filter(
          (binding) =>
            data.variables.every((variable, i) =>
              (binding[variable]?.value ?? '')
                .toLocaleLowerCase(locale)
                .includes((filters[i]?.value ?? '').toLocaleLowerCase(locale)),
            ) &&
            (!query ||
              data.variables.some((variable) =>
                (binding[variable]?.value ?? '')
                  .toLocaleLowerCase(locale)
                  .includes(query),
              )),
        );
        const variable = data.variables[sortColumn];
        if (variable !== undefined) {
          rows.sort(
            (a: Binding, b: Binding) =>
              direction *
              collator.compare(
                a[variable]?.value ?? '',
                b[variable]?.value ?? '',
              ),
          );
        }
        headers.forEach((cell, i) =>
          cell.setAttribute(
            'aria-sort',
            i === sortColumn
              ? direction === 1
                ? 'ascending'
                : 'descending'
              : 'none',
          ),
        );
        caption.textContent =
          search.value || filters.some((f) => f.value)
            ? `${rows.length} / ${data.bindings.length} ${locale === 'nl' ? 'resultaten' : 'results'}`
            : translate(
                locale,
                rows.length === 1 ? 'resultOne' : 'resultMany',
                { count: new Intl.NumberFormat(locale).format(rows.length) },
              );
        viewport.scrollTop = 0;
        draw();
      }
      search.oninput = () => refresh();
      viewport.onscroll = () => draw();
      refresh();
      if (invalid) {
        const warning = doc.createElement('p');
        warning.setAttribute('role', 'alert');
        warning.textContent =
          locale === 'nl'
            ? 'Ongeldige kolombreedtes: gebruik één positief percentage per kolom, samen 100%. Gelijke breedtes worden gebruikt.'
            : 'Invalid column widths: use one positive percentage per column, totaling 100%. Equal widths are used.';
        container.replaceChildren(
          warning,
          controls,
          viewport,
          inspector.element,
        );
      } else container.replaceChildren(controls, viewport, inspector.element);
      return () => {
        viewport.onscroll = null;
        inspector.destroy();
      };
    },
  };
}
