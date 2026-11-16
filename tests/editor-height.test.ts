import { afterEach, expect, it, vi } from 'vitest';
import { createEditor } from '@ldforge/editor';
import {
  readUserAutoGrow,
  saveUserAutoGrow,
} from '../apps/demo/src/auto-grow-preference.js';

const executor = {
  execute: async () => ({ kind: 'boolean' as const, value: true }),
};
afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

it('configures query rows and auto-grow, synchronizes settings and preserves the editor and query', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const onAutoGrowChange = vi.fn();
  const onEditorRowsChange = vi.fn();
  const onQueryChange = vi.fn();
  const editor = createEditor(host, {
    executor,
    query: 'ASK {}',
    editorRows: 15,
    autoGrow: false,
    onAutoGrowChange,
    onEditorRowsChange,
    onQueryChange,
  });
  const code = host.querySelector<HTMLElement>('.ldforge-code');
  const originalView = code?.querySelector('.cm-editor');
  expect(editor.getEditorRows()).toBe(15);
  expect(editor.isAutoGrowEnabled()).toBe(false);
  expect(code?.dataset.autoGrow).toBe('false');
  const checkbox = host.querySelector<HTMLInputElement>(
    '.ldforge-auto-grow input',
  );
  checkbox?.click();
  expect(editor.isAutoGrowEnabled()).toBe(true);
  expect(onAutoGrowChange).toHaveBeenCalledExactlyOnceWith(true);
  editor.setAutoGrow(false);
  expect(checkbox?.checked).toBe(false);
  editor.setAutoGrow(false);
  expect(onAutoGrowChange).toHaveBeenCalledTimes(2);
  editor.setEditorRows(20);
  expect(code?.style.getPropertyValue('--ldforge-query-rows')).toBe('20');
  expect(onEditorRowsChange).toHaveBeenCalledExactlyOnceWith(20);
  editor.setEditorRows(20);
  expect(onEditorRowsChange).toHaveBeenCalledTimes(1);
  for (const invalid of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    expect(() => editor.setEditorRows(invalid)).toThrow(RangeError);
  expect(editor.getEditorRows()).toBe(20);
  editor.setLocale('nl');
  expect(host.textContent).toContain('Hele query tonen');
  expect(code?.querySelector('.cm-editor')).toBe(originalView);
  expect(editor.getQuery()).toBe('ASK {}');
  expect(onQueryChange).not.toHaveBeenCalled();
  editor.destroy();
  expect(() => editor.getEditorRows()).toThrow('destroyed');
  expect(() => editor.setEditorRows(10)).toThrow('destroyed');
  expect(() => editor.isAutoGrowEnabled()).toThrow('destroyed');
  expect(() => editor.setAutoGrow(true)).toThrow('destroyed');
});

it('preserves default growth and lets hosts hide the checkbox without disabling the API', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = createEditor(host, {
    executor,
    controls: { autoGrow: false },
  });
  expect(editor.getEditorRows()).toBe(15);
  expect(editor.isAutoGrowEnabled()).toBe(true);
  expect(host.querySelector<HTMLElement>('.ldforge-auto-grow')?.hidden).toBe(
    true,
  );
  editor.setAutoGrow(false);
  expect(editor.isAutoGrowEnabled()).toBe(false);
  editor.destroy();
  expect(() => createEditor(host, { executor, editorRows: 0 })).toThrow(
    RangeError,
  );
  expect(host.children).toHaveLength(0);
});

it('persists the demo checkbox and tolerates unavailable or invalid storage', () => {
  expect(readUserAutoGrow()).toBe(false);
  saveUserAutoGrow(true);
  expect(readUserAutoGrow()).toBe(true);
  saveUserAutoGrow(false);
  expect(readUserAutoGrow()).toBe(false);
  localStorage.setItem('ldforge.demo.auto-grow.v1', 'bad');
  expect(readUserAutoGrow()).toBe(false);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(readUserAutoGrow()).toBe(false);
  expect(() => saveUserAutoGrow(true)).not.toThrow();
});
