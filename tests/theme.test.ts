import { afterEach, expect, it, vi } from 'vitest';
import { createEditor, type ForgeEditor } from '@ldforge/editor';
import { themeTokens } from '../packages/editor/src/theme.js';

const editors: ForgeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});
function mount(themeMainColor?: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const onQueryChange = vi.fn();
  const onWorkspaceChange = vi.fn();
  const editor = createEditor(host, {
    executor: { execute: async () => ({ kind: 'boolean', value: true }) },
    ...(themeMainColor === undefined ? {} : { themeMainColor }),
    onQueryChange,
    onWorkspaceChange,
  });
  editors.push(editor);
  const root = host.querySelector<HTMLElement>('.ldforge');
  if (!root) throw new Error('Missing editor root');
  return {
    editor,
    root,
    onQueryChange,
    onWorkspaceChange,
  };
}
it('isolates themes, supports runtime replacement/reset without query mutations, and validates atomically', () => {
  const blue = mount('#1a80b9');
  const red = mount('#b31');
  const standard = mount();
  expect(blue.root.style.getPropertyValue('--ldforge-accent')).toBe('#1a80b9');
  expect(red.root.style.getPropertyValue('--ldforge-accent')).toBe('#bb3311');
  expect(standard.root.style.getPropertyValue('--ldforge-accent')).toBe('');
  const workspace = blue.editor.getWorkspace();
  blue.editor.setThemeMainColor('#fff');
  expect(blue.root.style.getPropertyValue('--ldforge-on-accent')).toBe(
    '#000000',
  );
  expect(blue.editor.getThemeMainColor()).toBe('#fff');
  for (const color of [
    '',
    'red',
    '#1234',
    '#12345678',
    'var(--brand)',
    'transparent',
  ]) {
    expect(() => blue.editor.setThemeMainColor(color)).toThrow(
      'themeMainColor',
    );
    expect(blue.editor.getThemeMainColor()).toBe('#fff');
  }
  blue.editor.setThemeMainColor();
  expect(blue.root.style.length).toBe(0);
  expect(blue.editor.getThemeMainColor()).toBeUndefined();
  expect(blue.editor.getWorkspace()).toEqual(workspace);
  expect(blue.onQueryChange).not.toHaveBeenCalled();
  expect(blue.onWorkspaceChange).not.toHaveBeenCalled();
  expect(red.editor.getThemeMainColor()).toBe('#b31');
  blue.editor.destroy();
  expect(() => blue.editor.setThemeMainColor('#123')).toThrow('destroyed');
  expect(() => blue.editor.getThemeMainColor()).toThrow('destroyed');
  expect(() => mount('invalid')).toThrow('themeMainColor');
});

function luminance(hex: string): number {
  const values = (hex.slice(1).match(/../g) ?? []).map((part) => {
    const n = parseInt(part, 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return (
    (values[0] ?? 0) * 0.2126 +
    (values[1] ?? 0) * 0.7152 +
    (values[2] ?? 0) * 0.0722
  );
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return ((values[1] ?? 0) + 0.05) / ((values[0] ?? 0) + 0.05);
}
it('keeps readable foregrounds for dark, bright and saturated accents', () => {
  for (const color of [
    '#000',
    '#fff',
    '#ff0',
    '#0ff',
    '#f0f',
    '#00f',
    '#1a80b9',
    '#075e55',
  ]) {
    const tokens = themeTokens(color);
    expect(
      contrast(tokens.accent ?? '', tokens['on-accent'] ?? ''),
    ).toBeGreaterThanOrEqual(4.5);
    for (const surface of [
      'surface',
      'surface-subtle',
      'surface-tinted',
      'hover',
      'selected',
    ]) {
      for (const foreground of ['text', 'muted', 'accent-text'])
        expect(
          contrast(tokens[foreground] ?? '', tokens[surface] ?? ''),
        ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(tokens.focus ?? '', tokens[surface] ?? ''),
      ).toBeGreaterThanOrEqual(3);
    }
  }
});
