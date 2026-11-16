import { localize, translate } from '@ldforge/core';
import type { Locale, ResultRendererPlugin } from '@ldforge/core';

/** Shared metadata contract for built-in and host-provided renderers. */
export function renderRendererInfo(
  panel: HTMLElement,
  plugin: ResultRendererPlugin,
  locale: Locale,
  close: () => void,
): void {
  const doc = panel.ownerDocument;
  panel.replaceChildren();
  const heading = doc.createElement('strong');
  heading.textContent = translate(locale, 'rendererBindingContract', {
    renderer: localize(plugin.label, locale),
  });
  const dismiss = doc.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'ldforge-renderer-info-close';
  dismiss.textContent = '×';
  dismiss.setAttribute('aria-label', translate(locale, 'rendererInfoClose'));
  dismiss.addEventListener('click', close);
  panel.append(heading, dismiss);
  if (plugin.wizard?.description) {
    const description = doc.createElement('p');
    description.textContent = localize(plugin.wizard.description, locale);
    panel.append(description);
  }
  if (plugin.wizard?.bindings.length) {
    const list = doc.createElement('dl');
    for (const binding of plugin.wizard.bindings) {
      const term = doc.createElement('dt');
      const variable = doc.createElement('code');
      variable.textContent = `?${binding.variable}`;
      term.append(
        variable,
        ` · ${translate(locale, binding.required ? 'rendererBindingRequired' : 'rendererBindingOptional')}`,
      );
      const description = doc.createElement('dd');
      description.textContent = localize(binding.description, locale);
      list.append(term, description);
    }
    panel.append(list);
  } else {
    const empty = doc.createElement('p');
    empty.textContent = translate(
      locale,
      plugin.wizard ? 'rendererNoNamedBindings' : 'rendererNoBindingContract',
    );
    panel.append(empty);
  }
}
