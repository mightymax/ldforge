import { translate, resolveLocale } from '@ldforge/core';
import type { ResultRendererPlugin } from '@ldforge/core';

export function createTableRenderer(): ResultRendererPlugin {
  return {
    id: 'table',
    label: { en: 'Table', nl: 'Tabel' },
    supports: (result) => result.kind === 'bindings',
    render(container, result, context) {
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
    label: { en: 'Boolean', nl: 'Booleaans' },
    supports: (result) => result.kind === 'boolean',
    render(container, result, context) {
      if (result.kind !== 'boolean') return;
      const output = container.ownerDocument.createElement('p');
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
    label: 'JSON',
    supports: () => true,
    render(container, result) {
      const pre = container.ownerDocument.createElement('pre');
      pre.textContent = JSON.stringify(result, null, 2);
      container.replaceChildren(pre);
    },
  };
}
