import { afterEach, expect, it, vi } from 'vitest';
import { createEditor } from '@ldforge/editor';
import {
  readUserFontSize,
  saveUserFontSize,
} from '../apps/demo/src/font-size-preference.js';
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it('sets only the CodeMirror host size, validates the API, and keeps the settings optional', () => {
  const node = document.createElement('div');
  const onFontSizeChange = vi.fn();
  const editor = createEditor(node, {
    query: 'ASK {}',
    executor: { execute: async () => ({ kind: 'boolean', value: true }) },
    fontSize: 18,
    onFontSizeChange,
    controls: { fontSize: false },
  });
  expect(editor.getFontSize()).toBe(18);
  expect(
    node
      .querySelector<HTMLElement>('.ldforge-code')
      ?.style.getPropertyValue('--ldforge-query-font-size'),
  ).toBe('18px');
  expect(
    node
      .querySelector<HTMLElement>('.ldforge')
      ?.style.getPropertyValue('--ldforge-query-font-size'),
  ).toBe('');
  expect(node.querySelector<HTMLElement>('.ldforge-font-size')?.hidden).toBe(
    true,
  );
  editor.setFontSize(20);
  expect(onFontSizeChange).toHaveBeenCalledWith(20);
  for (const value of [9, 25, 14.5, NaN])
    expect(() => editor.setFontSize(value)).toThrow('10 to 24');
  editor.setLocale('nl');
  expect(node.textContent).toContain('Tekstgrootte');
  editor.destroy();
  expect(() => editor.getFontSize()).toThrow('destroyed');
});
it('stores valid font preferences and tolerates missing, invalid or blocked storage', () => {
  expect(readUserFontSize()).toBeUndefined();
  saveUserFontSize(20);
  expect(readUserFontSize()).toBe(20);
  localStorage.setItem('ldforge.demo.font-size.v1', 'bad');
  expect(readUserFontSize()).toBeUndefined();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw Error('Blocked');
  });
  expect(readUserFontSize()).toBeUndefined();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw Error('Blocked');
  });
  expect(() => saveUserFontSize(18)).not.toThrow();
});
