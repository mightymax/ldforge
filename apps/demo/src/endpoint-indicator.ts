import { createSvgIcon } from '@ldforge/core';
import type { Locale } from '@ldforge/core';

/** The indicator copies only the endpoint URL, never request headers or query text. */
export function createEndpointIndicator(container: HTMLElement) {
  const doc = container.ownerDocument;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let disposed = false;
  return {
    update(label: string, endpoint: string, locale: Locale): void {
      clearTimeout(timer);
      const version = ++generation;
      container.replaceChildren();
      container.title = label;
      if (!endpoint) {
        container.textContent = label;
        return;
      }
      const code = doc.createElement('code');
      code.textContent = endpoint;
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'endpoint-copy';
      const normalLabel =
        locale === 'nl' ? 'Endpoint-URL kopiëren' : 'Copy endpoint URL';
      const copiedLabel =
        locale === 'nl' ? 'Endpoint-URL gekopieerd' : 'Endpoint URL copied';
      function show(copied: boolean): void {
        button.dataset.copied = String(copied);
        button.setAttribute('aria-label', copied ? copiedLabel : normalLabel);
        button.title = copied ? copiedLabel : normalLabel;
        const icon = createSvgIcon(
          copied
            ? ['m5 12 4 4L19 6']
            : [
                'M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3',
                'M9 2h6v5H9z',
              ],
        )(doc);
        icon.setAttribute('aria-hidden', 'true');
        button.replaceChildren(icon);
      }
      show(false);
      button.setAttribute('aria-live', 'polite');
      button.addEventListener('click', async () => {
        try {
          const clipboard = doc.defaultView?.navigator.clipboard;
          if (!clipboard) throw new Error('Clipboard unavailable');
          await clipboard.writeText(endpoint);
          if (disposed || generation !== version) return;
          show(true);
          clearTimeout(timer);
          timer = setTimeout(() => show(false), 1800);
        } catch {
          if (disposed || generation !== version) return;
          const failed =
            locale === 'nl'
              ? 'Kopiëren mislukt'
              : 'Could not copy endpoint URL';
          button.setAttribute('aria-label', failed);
          button.title = failed;
        }
      });
      container.append('Endpoint: ', code, button);
    },
    destroy(): void {
      disposed = true;
      generation++;
      clearTimeout(timer);
    },
  };
}
