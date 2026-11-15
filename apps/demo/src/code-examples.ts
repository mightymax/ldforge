import { EditorState } from '@codemirror/state';
import { Decoration, EditorView, lineNumbers } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { sparqlLanguage } from '@ldforge/editor';
import { javascript } from '@codemirror/lang-javascript';
import { tags } from '@lezer/highlight';
import './code-examples.css';

const highlighting = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier], color: '#7040a0' },
  { tag: [tags.string, tags.regexp], color: '#20623b' },
  { tag: [tags.number, tags.bool, tags.null], color: '#9b4019' },
  { tag: [tags.typeName, tags.className], color: '#285c91' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: '#255a92',
  },
  { tag: tags.comment, color: '#586a75', fontStyle: 'italic' },
  { tag: [tags.variableName, tags.propertyName], color: '#213747' },
]);

/** Small read-only CodeMirror views: no history, completion or query diagnostics. */
export function mountCodeExamples(container: Element): () => void {
  const views: EditorView[] = [];
  for (const pre of container.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    const text = (code ?? pre).textContent?.replace(/\n$/, '') ?? '';
    const language =
      code?.className.match(/language-([\w-]+)/)?.[1] ??
      (/^(import|const|\/\/|type|interface)\b/m.test(text) ? 'ts' : 'text');
    const diff = language === 'diff';
    const copyText = diff
      ? text
          .split('\n')
          .filter((line) => !line.startsWith('-'))
          .map((line) => (/^[ +]/.test(line) ? line.slice(1) : line))
          .join('\n')
      : text;
    const decorations = [];
    let offset = 0;
    if (diff)
      for (const line of text.split('\n')) {
        if (/^[+-]/.test(line))
          decorations.push(
            Decoration.line({
              class: line.startsWith('+')
                ? 'code-diff-added'
                : 'code-diff-removed',
            }).range(offset),
          );
        offset += line.length + 1;
      }
    const wrapper = document.createElement('div');
    wrapper.className = 'code-example';
    const bar = document.createElement('div');
    bar.className = 'code-example-toolbar';
    const caption = document.createElement('span');
    caption.textContent = diff
      ? 'HTML diff'
      : ['ts', 'typescript'].includes(language)
        ? 'TypeScript'
        : ['js', 'javascript'].includes(language)
          ? 'JavaScript'
          : language.toUpperCase();
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = diff ? 'Copy HTML' : 'Copy';
    copy.setAttribute(
      'aria-label',
      diff ? 'Copy migrated HTML' : 'Copy code example',
    );
    copy.addEventListener('click', () => {
      void navigator.clipboard
        .writeText(copyText)
        .then(() => {
          copy.textContent = 'Copied';
        })
        .catch(() => {
          copy.textContent = 'Select code to copy';
        });
    });
    bar.append(caption, copy);
    wrapper.append(bar);
    pre.replaceWith(wrapper);
    views.push(
      new EditorView({
        parent: wrapper,
        state: EditorState.create({
          doc: text,
          extensions: [
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
            EditorView.contentAttributes.of({
              tabindex: '0',
              'aria-label': `${caption.textContent} code example`,
            }),
            lineNumbers(),
            ...(diff
              ? [EditorView.decorations.of(Decoration.set(decorations))]
              : []),
            ...(['ts', 'typescript', 'js', 'javascript'].includes(language)
              ? [
                  javascript({
                    typescript: ['ts', 'typescript'].includes(language),
                  }),
                ]
              : []),
            ...(language === 'sparql' ? [sparqlLanguage] : []),
            syntaxHighlighting(highlighting),
            EditorView.theme({
              '&': {
                color: '#213747',
                backgroundColor: '#ffffff',
                fontSize: '13px',
              },
              '.cm-scroller': {
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                overflow: 'auto',
                maxHeight: '560px',
                lineHeight: '1.7',
              },
              '.cm-content': { padding: '14px 0', minWidth: '100%' },
              '.cm-line': { padding: '0 16px' },
              '.cm-gutters': {
                backgroundColor: '#f7f9fa',
                color: '#687985',
                borderRight: '1px solid #e1e7eb',
              },
              '&.cm-focused': {
                outline: '2px solid #528eeb',
                outlineOffset: '-2px',
              },
            }),
          ],
        }),
      }),
    );
  }
  return () => {
    for (const view of views) view.destroy();
  };
}
