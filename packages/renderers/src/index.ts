import { translate, resolveLocale, createSvgIcon } from '@ldforge/core';
import type { ResultRendererPlugin } from '@ldforge/core';

export { createTableRenderer } from './table.js';
export type { TableRendererOptions } from './table.js';
export {
  createResourceInspector,
  createResourceLoader,
} from './resource-inspector.js';
export type {
  ResourceInspectorOptions,
  ResourceLoader,
} from './resource-inspector.js';

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
