import type { PluginIcon } from '@ldforge/core';

/** Mount decorative plugin artwork without changing the control's accessible name. */
export function appendIcon(container: HTMLElement, icon?: PluginIcon): void {
  if (!icon) return;
  const node = icon(container.ownerDocument);
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('focusable', 'false');
  node.classList.add('ldforge-icon');
  container.prepend(node);
}
