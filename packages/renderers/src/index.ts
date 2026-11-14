import {
  translate,
  resolveLocale,
  createSvgIcon,
  graphToBindings,
} from '@ldforge/core';
import type { ResultRendererPlugin } from '@ldforge/core';

export function createTableRenderer(): ResultRendererPlugin {
  return {
    id: 'table',
    wizard: {
      description: {
        en: 'Accepts SELECT bindings or RDF graph results.',
        nl: 'Voor SELECT-bindings of RDF-graafresultaten.',
      },
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
        cell.textContent = variable;
        header.append(cell);
      }
      const body = table.createTBody();
      for (const binding of result.bindings) {
        const row = body.insertRow();
        for (const variable of result.variables) {
          const cell = row.insertCell();
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
      container.replaceChildren(table);
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
