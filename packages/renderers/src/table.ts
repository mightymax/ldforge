import { formatRdfTerm } from './rdf-term.js';
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
  /** Initially show RDF notation, language tags and datatypes. Defaults to false. */
  readonly showRdfDetails?: boolean;
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
  const detailPreferences = new WeakMap<HTMLElement, boolean>();
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
      let showRdfDetails =
        detailPreferences.get(container) ?? options.showRdfDetails ?? false;
      let expanded: Binding | undefined;
      let expandedVariable: string | undefined;
      let detailHeight = 0;
      let lastRange = '';
      const detailRow = doc.createElement('tr');
      detailRow.className = 'ldforge-table-detail';
      const detailCell = detailRow.insertCell();
      detailCell.colSpan = Math.max(1, data.variables.length);
      detailCell.style.cssText =
        'padding:0 12px 12px;background:var(--ldforge-surface-tinted, #f5f8f6)';
      const inspector = createResourceInspector(container, {
        locale,
        onClose(restoreFocus) {
          const button = body.querySelector<HTMLButtonElement>(
            '.ldforge-resource-info[aria-expanded="true"]',
          );
          button?.setAttribute('aria-expanded', 'false');
          if (restoreFocus) button?.focus({ preventScroll: true });
          expanded = undefined;
          expandedVariable = undefined;
          detailHeight = 0;
          detailRow.remove();
          lastRange = '';
        },
        ...(graph ? { graph } : {}),
        ...(options.loadResource ? { loadResource: options.loadResource } : {}),
      });
      inspector.element.style.marginTop = '8px';
      detailCell.append(inspector.element);
      const ResizeObserverClass = doc.defaultView?.ResizeObserver;
      const observer = ResizeObserverClass
        ? new ResizeObserverClass(() => {
            if (expanded && detailRow.isConnected) {
              detailHeight = detailRow.getBoundingClientRect().height;
            }
          })
        : undefined;
      observer?.observe(detailRow);
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
      const detailsToggle = doc.createElement('button');
      detailsToggle.type = 'button';
      detailsToggle.className = 'ldforge-table-rdf-details';
      detailsToggle.textContent =
        locale === 'nl' ? 'RDF-details' : 'RDF details';
      detailsToggle.title =
        locale === 'nl'
          ? 'Toon RDF-notatie, taallabels en datatypes'
          : 'Show RDF notation, language tags and datatypes';
      detailsToggle.style.cssText =
        'display:inline-flex;align-items:center;gap:6px;flex:0 0 auto';
      const detailsIcon = createSvgIcon([
        'm8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',
      ])(doc);
      detailsIcon.setAttribute('aria-hidden', 'true');
      detailsToggle.prepend(detailsIcon);
      function updateDetailsToggle(): void {
        detailsToggle.setAttribute('aria-pressed', String(showRdfDetails));
        detailsToggle.title =
          locale === 'nl'
            ? `${showRdfDetails ? 'Verberg' : 'Toon'} RDF-notatie, taallabels en datatypes`
            : `${showRdfDetails ? 'Hide' : 'Show'} RDF notation, language tags and datatypes`;
        table.dataset.rdfDetails = String(showRdfDetails);
        detailsToggle.style.background = showRdfDetails
          ? 'var(--ldforge-hover, #edf4f1)'
          : '';
        detailsToggle.style.color = showRdfDetails
          ? 'var(--ldforge-accent-text, #075e55)'
          : '';
      }
      detailsToggle.addEventListener('click', () => {
        showRdfDetails = !showRdfDetails;
        detailPreferences.set(container, showRdfDetails);
        updateDetailsToggle();
        lastRange = '';
        draw();
      });
      updateDetailsToggle();
      controls.append(search, detailsToggle);
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
      const sortIcons: (SVGElement | HTMLElement)[] = [];
      for (const [index, variable] of data.variables.entries()) {
        const cell = doc.createElement('th');
        cell.scope = 'col';
        cell.style.zIndex = '1';
        if (virtual) cell.style.top = '0';
        cell.style.overflowWrap = 'anywhere';
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'ldforge-table-sort';
        button.style.cssText =
          'display:flex;align-items:center;gap:6px;width:100%;min-width:0;padding:0;margin:0 0 8px;border:0;border-radius:0;background:transparent;box-shadow:none;color:inherit;font:inherit;text-align:left;cursor:pointer';
        const label = doc.createElement('span');
        label.style.cssText = 'min-width:0;overflow-wrap:anywhere';
        label.textContent = variable;
        const icon = createSvgIcon(['M7 9l5-5 5 5', 'M7 15l5 5 5-5'])(doc);
        icon.style.cssText = 'flex:0 0 16px;width:16px;height:16px';
        button.append(label, icon);
        sortIcons.push(icon);
        button.onclick = () => {
          direction = sortColumn === index ? -direction : 1;
          sortColumn = index;
          refresh();
        };
        cell.append(button);
        headers.push(cell);
        header.append(cell);
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
        cell.append(filter);
      }
      const body = table.createTBody();
      const rowHeight = 36;
      function draw() {
        const scrollTop = viewport.scrollTop;
        const expandedIndex = expanded ? rows.indexOf(expanded) : -1;
        const headerHeight = table.tHead?.offsetHeight ?? 0;
        const detailTop = headerHeight + (expandedIndex + 1) * rowHeight;
        const adjustedScroll =
          expandedIndex >= 0 && scrollTop > detailTop
            ? scrollTop - Math.min(detailHeight, scrollTop - detailTop)
            : scrollTop;
        const nextBody = doc.createElement('tbody');
        const start = virtual
          ? Math.max(
              0,
              Math.floor((adjustedScroll - headerHeight) / rowHeight) - 5,
            )
          : 0;
        const first = Math.min(start, rows.length);
        const end = virtual
          ? Math.min(rows.length, first + Math.ceil(height / rowHeight) + 12)
          : rows.length;
        const range = `${first}:${end}`;
        if (range === lastRange) return;
        lastRange = range;
        const focused = doc.activeElement;
        function spacer(size: number) {
          if (!size) return;
          const row = nextBody.insertRow();
          row.setAttribute('aria-hidden', 'true');
          const cell = row.insertCell();
          cell.colSpan = Math.max(1, data.variables.length);
          cell.style.cssText = `height:${size}px;padding:0;border:0;line-height:0`;
        }
        spacer(
          first * rowHeight +
            (expandedIndex >= 0 && expandedIndex < first ? detailHeight : 0),
        );
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
            value.className = 'ldforge-table-term';
            value.textContent = showRdfDetails
              ? formatRdfTerm(term)
              : (term?.value ?? '');
            if (term)
              value.title = showRdfDetails ? formatRdfTerm(term) : term.value;
            if (showRdfDetails) {
              value.style.fontFamily = 'ui-monospace, monospace';
              if (term?.type === 'literal' || term?.type === 'typed-literal') {
                const lexical = JSON.stringify(term.value);
                const suffix = formatRdfTerm(term).slice(lexical.length);
                value.textContent = lexical;
                if (suffix) {
                  const metadata = doc.createElement('sup');
                  metadata.className = 'ldforge-table-term-metadata';
                  metadata.textContent = suffix;
                  metadata.style.cssText =
                    'color:var(--ldforge-muted, #65756f);font-size:0.75em;line-height:0;vertical-align:super';
                  metadata.title = term['xml:lang'] ?? term.datatype ?? '';
                  value.append(metadata);
                }
              }
            }
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
              button.setAttribute(
                'aria-expanded',
                String(binding === expanded && variable === expandedVariable),
              );
              const infoIcon = createSvgIcon([
                'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
                'M12 11v6M12 7h.01',
              ])(doc);
              button.append(infoIcon);
              button.onclick = () => {
                if (
                  expanded === binding &&
                  expandedVariable === variable &&
                  !inspector.element.hidden
                ) {
                  inspector.close();
                  return;
                }
                body
                  .querySelectorAll('[aria-expanded="true"]')
                  .forEach((item) =>
                    item.setAttribute('aria-expanded', 'false'),
                  );
                expanded = binding;
                expandedVariable = variable;
                button.setAttribute('aria-expanded', 'true');
                row.after(detailRow);
                lastRange = '';
                void inspector.open(term);
                detailHeight = detailRow.getBoundingClientRect().height;
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
          if (binding === expanded) nextBody.append(detailRow);
        }
        spacer(
          (rows.length - end) * rowHeight +
            (expandedIndex >= end ? detailHeight : 0),
        );
        body.replaceChildren(...nextBody.childNodes);
        table.setAttribute('aria-rowcount', String(rows.length + 1));
        if (
          focused instanceof HTMLElement &&
          inspector.element.contains(focused)
        )
          focused.focus({ preventScroll: true });
        if (virtual) viewport.scrollTop = scrollTop;
      }
      function refresh() {
        if (expanded) inspector.close(false);
        lastRange = '';
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
        headers.forEach((cell, i) => {
          const active = i === sortColumn;
          cell.setAttribute(
            'aria-sort',
            active ? (direction === 1 ? 'ascending' : 'descending') : 'none',
          );
          const button = cell.querySelector('button');
          if (button)
            button.title =
              locale === 'nl'
                ? `Sorteer ${data.variables[i]} ${active && direction === 1 ? 'aflopend' : 'oplopend'}`
                : `Sort ${data.variables[i]} ${active && direction === 1 ? 'descending' : 'ascending'}`;
          sortIcons[i]?.querySelectorAll('path').forEach((path, arrow) => {
            path.setAttribute(
              'opacity',
              active
                ? arrow === (direction === 1 ? 0 : 1)
                  ? '1'
                  : '0.15'
                : '0.45',
            );
          });
        });
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
      if (virtual) viewport.onscroll = () => draw();
      refresh();
      if (invalid) {
        const warning = doc.createElement('p');
        warning.setAttribute('role', 'alert');
        warning.textContent =
          locale === 'nl'
            ? 'Ongeldige kolombreedtes: gebruik één positief percentage per kolom, samen 100%. Gelijke breedtes worden gebruikt.'
            : 'Invalid column widths: use one positive percentage per column, totaling 100%. Equal widths are used.';
        container.replaceChildren(warning, controls, viewport);
      } else container.replaceChildren(controls, viewport);
      return () => {
        viewport.onscroll = null;
        observer?.disconnect();
        inspector.destroy();
      };
    },
  };
}
