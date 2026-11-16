import { createSvgIcon, resolveLocale, translate } from '@ldforge/core';
import type { ResultRendererPlugin } from '@ldforge/core';
import { json } from '@codemirror/lang-json';
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';

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
    render(container, result, context) {
      const doc = container.ownerDocument;
      const locale = context?.locale ?? resolveLocale();
      const value = JSON.stringify(result, null, 2);
      const wrapper = doc.createElement('div');
      wrapper.className = 'ldforge-json';
      const toolbar = doc.createElement('div');
      toolbar.style.cssText =
        'display:flex;justify-content:flex-end;padding:6px;gap:8px;align-items:center';
      const feedback = doc.createElement('span');
      feedback.setAttribute('role', 'status');
      const copy = doc.createElement('button');
      copy.type = 'button';
      copy.className = 'ldforge-json-copy';
      copy.setAttribute('aria-live', 'polite');
      copy.style.cssText =
        'display:inline-flex;align-items:center;gap:6px;transition:background-color 160ms, color 160ms';
      const label = doc.createElement('span');
      const reset = () => {
        copy.replaceChildren();
        const icon = createSvgIcon(['M9 9h11v12H9zM5 15H3V3h11v2'])(doc);
        icon.setAttribute('aria-hidden', 'true');
        copy.append(icon, label);
        label.textContent = translate(locale, 'jsonCopy');
        copy.removeAttribute('data-copied');
        copy.style.backgroundColor = '';
        copy.style.color = '';
      };
      reset();
      toolbar.append(feedback, copy);
      const host = doc.createElement('div');
      wrapper.append(toolbar, host);
      container.replaceChildren(wrapper);
      const view = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: value,
          extensions: [
            json(),
            lineNumbers(),
            syntaxHighlighting(defaultHighlightStyle),
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
            EditorView.contentAttributes.of({
              'aria-label': 'JSON',
              tabindex: '0',
            }),
            EditorView.theme({
              '&': {
                backgroundColor: 'var(--ldforge-surface, #fff)',
                color: 'var(--ldforge-text, #182e2b)',
              },
              '.cm-scroller': {
                overflow: 'auto',
                maxHeight: '600px',
                fontSize: '12px',
              },
              '.cm-gutters': {
                backgroundColor: 'var(--ldforge-surface-tinted, #f5f8f7)',
                color: 'var(--ldforge-muted, #65756f)',
                borderColor: 'var(--ldforge-border, #d6dedd)',
              },
            }),
          ],
        }),
      });
      let disposed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onCopy = async () => {
        try {
          await doc.defaultView?.navigator.clipboard.writeText(value);
          if (disposed) return;
          if (!doc.defaultView?.navigator.clipboard)
            throw new Error('Clipboard unavailable');
          clearTimeout(timer);
          copy.dataset.copied = 'true';
          copy.style.backgroundColor = 'var(--ldforge-hover, #edf4f1)';
          copy.style.color = 'var(--ldforge-accent-text, #075e55)';
          const check = createSvgIcon(['m5 12 4 4L19 6'])(doc);
          check.setAttribute('aria-hidden', 'true');
          label.textContent = translate(locale, 'jsonCopied');
          copy.replaceChildren(check, label);
          feedback.textContent = '';
          timer = setTimeout(() => {
            reset();
            feedback.textContent = '';
          }, 1800);
        } catch {
          if (!disposed)
            feedback.textContent = translate(locale, 'jsonCopyFailed');
        }
      };
      copy.addEventListener('click', onCopy);
      return () => {
        disposed = true;
        clearTimeout(timer);
        copy.removeEventListener('click', onCopy);
        view.destroy();
      };
    },
  };
}
