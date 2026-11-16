import { createSvgIcon, parseQueryViewDirectives } from '@ldforge/core';
import type { Locale } from '@ldforge/core';

/** Keep existing options/comments and make the selected renderer authoritative. */
export function queryWithRenderer(query: string, rendererId?: string): string {
  return queryWithDirective(query, 'view', rendererId);
}

export function queryWithEndpoint(query: string, endpoint?: string): string {
  if (parseQueryViewDirectives(query)['sparql-endpoint']) return query;
  return queryWithDirective(query, 'sparql-endpoint', endpoint);
}

function queryWithDirective(
  query: string,
  key: string,
  value?: string,
): string {
  if (!value || parseQueryViewDirectives(query)[key] === value) return query;
  const lines = query.replace(/^\uFEFF/, '').split(/\r?\n/);
  let end = 0;
  while (
    end < lines.length &&
    (!lines[end]?.trim() || lines[end]?.trimStart().startsWith('#'))
  )
    end++;
  const quote = (value: string) =>
    /^[\w.-]+$/.test(value) ? value : JSON.stringify(value);
  let replaced = false;
  for (let index = 0; index < end; index++) {
    const directives = parseQueryViewDirectives(lines[index] ?? '');
    if (directives[key] === undefined) continue;
    lines[index] =
      '# ' +
      Object.entries(directives)
        .map(
          ([name, existing]) =>
            `${name}=${quote(name === key ? value : (existing ?? ''))}`,
        )
        .join('; ');
    replaced = true;
  }
  if (!replaced) lines.splice(end, 0, `# ${key}=${quote(value)}`);
  return lines.join('\n');
}

export function createShareLink(baseUrl: string, query: string): string {
  const url = new URL(baseUrl);
  if (!url.hash.startsWith('#/')) url.hash = '';
  url.searchParams.set('query', query);
  return url.href;
}

export function createShareControl(host: {
  tools: HTMLElement;
  visible: boolean;
  getLocale(): Locale;
  copy(): Promise<string>;
  onError(error: unknown): void;
}) {
  const doc = host.tools.ownerDocument;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'ldforge-share-toggle';
  const live = doc.createElement('span');
  live.className = 'ldforge-sr-only';
  live.setAttribute('role', 'status');
  let copied = false;
  let pending = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function refreshLocale() {
    const nl = host.getLocale() === 'nl';
    const label = copied
      ? nl
        ? 'Link gekopieerd'
        : 'Link copied'
      : nl
        ? 'Deellink kopiëren'
        : 'Copy share link';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.dataset.copied = String(copied);
    const icon = createSvgIcon(
      copied
        ? ['M5 12l4 4L19 6']
        : [
            'M12 16V3m-5 5 5-5 5 5',
            'M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7',
          ],
    )(doc);
    button.replaceChildren(icon);
    live.textContent = copied ? label : '';
  }
  button.onclick = async () => {
    if (pending) return;
    pending = true;
    try {
      await host.copy();
      if (disposed) return;
      copied = true;
      refreshLocale();
      clearTimeout(timer);
      timer = setTimeout(() => {
        copied = false;
        refreshLocale();
      }, 1800);
    } catch (error) {
      if (!disposed) host.onError(error);
    } finally {
      pending = false;
    }
  };
  if (host.visible) host.tools.append(button, live);
  refreshLocale();
  return {
    refreshLocale,
    destroy() {
      disposed = true;
      clearTimeout(timer);
      button.remove();
      live.remove();
    },
  };
}
