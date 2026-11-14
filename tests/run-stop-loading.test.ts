import { afterEach, expect, it } from 'vitest';
import {
  createEditor,
  createRunButton,
  createCancelButton,
} from '@ldforge/editor';
import type { ForgeEditor } from '@ldforge/editor';
import type { QueryResult } from '@ldforge/core';
const editors: ForgeEditor[] = [];
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.replaceChildren();
});
function mount(enabled = true) {
  const node = document.createElement('div');
  document.body.append(node);
  let resolve: (result: QueryResult) => void = () => {};
  const editor = createEditor(node, {
    query: 'ASK {}',
    controls: { loadingIndicator: enabled },
    executor: {
      execute: ({ signal }) =>
        new Promise<QueryResult>((done, reject) => {
          resolve = done;
          signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    },
  });
  editors.push(editor);
  return { node, editor, resolve: (result: QueryResult) => resolve(result) };
}
it('switches the default Run button to Stop, aborts the request and removes the default spinner', async () => {
  const { node, editor } = mount();
  expect(node.querySelector('[aria-label="Cancel"]')).toBeNull();
  const pending = editor.run();
  expect(node.querySelector('[aria-label="Stop query"]')).not.toBeNull();
  expect(node.querySelector('.ldforge-spinner')).not.toBeNull();
  expect(
    node.querySelector('.ldforge-results')?.getAttribute('aria-busy'),
  ).toBe('true');
  node.querySelector<HTMLButtonElement>('[aria-label="Stop query"]')?.click();
  await pending;
  expect(editor.getState().status).toBe('idle');
  expect(node.querySelector('.ldforge-spinner')).toBeNull();
  expect(node.querySelector('[aria-label="Run query"]')).not.toBeNull();
});
it('supports config/API toggles without cancelling a query and removes the spinner on success', async () => {
  const { node, editor, resolve } = mount(false);
  const pending = editor.run();
  expect(editor.isLoadingIndicatorEnabled()).toBe(false);
  expect(node.querySelector('.ldforge-spinner')).toBeNull();
  editor.setLoadingIndicatorEnabled(true);
  expect(node.querySelector('.ldforge-spinner')).not.toBeNull();
  editor.setLoadingIndicatorEnabled(false);
  expect(editor.getState().status).toBe('running');
  editor.setLoadingIndicatorEnabled(true);
  editor.setLocale('nl');
  expect(node.querySelector('[aria-label="Query stoppen"]')).not.toBeNull();
  resolve({ kind: 'boolean', value: true });
  await pending;
  expect(node.querySelector('.ldforge-spinner')).toBeNull();
  expect(node.querySelector('[aria-label="Query uitvoeren"]')).not.toBeNull();
  editor.destroy();
  expect(() => editor.setLoadingIndicatorEnabled(true)).toThrow('destroyed');
});
it('keeps an explicit standalone Cancel button available for hosts that request it', async () => {
  const node = document.createElement('div');
  document.body.append(node);
  const editor = createEditor(node, {
    query: 'ASK {}',
    buttons: [createRunButton(), createCancelButton()],
    executor: { execute: async () => ({ kind: 'boolean', value: true }) },
  });
  editors.push(editor);
  expect(node.querySelector('[aria-label="Cancel"]')).not.toBeNull();
});
