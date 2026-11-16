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

export { createJsonRenderer } from './json.js';

export { createCardsRenderer } from './cards.js';
export type { CardsRendererOptions } from './cards.js';
