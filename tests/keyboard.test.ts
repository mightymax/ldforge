import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRunButton, createEditor } from '@ldforge/editor';
import { runShortcutLabel } from '../packages/editor/src/keyboard.js';

afterEach(() => vi.restoreAllMocks());

describe('platform-aware keyboard hints', () => {
  it.each(['MacIntel', 'MacPPC', 'iPad', 'iPhone', 'iPod'])(
    'uses Command on %s',
    (platform) => {
      expect(runShortcutLabel(platform)).toBe('⌘Enter');
    },
  );
  it.each(['Win32', 'Linux x86_64', ''])('uses Control on %s', (platform) => {
    expect(runShortcutLabel(platform)).toBe('Ctrl+Enter');
  });
  it('localizes the Run hint for the detected keyboard platform', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(createRunButton().title).toEqual({
      en: 'Run query (⌘Enter)',
      nl: 'Query uitvoeren (⌘Enter)',
    });
  });
});

it('opens the localized shortcut overview from the right toolbar and restores focus', () => {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  const container = document.createElement('div');
  document.body.append(container);
  const editor = createEditor(container, {
    locale: 'nl',
    executor: { execute: async () => ({ kind: 'boolean', value: true }) },
  });
  const toggle = container.querySelector<HTMLButtonElement>(
    '.ldforge-keyboard-toggle',
  );
  const dialog = container.querySelector<HTMLDialogElement>(
    '.ldforge-keyboard-help',
  );
  if (!toggle || !dialog) throw new Error('Missing shortcut controls');
  expect(toggle.closest('.ldforge-core-tools')).not.toBeNull();
  expect(toggle.title).toBe('Sneltoetsen');
  toggle.click();
  expect(dialog.open).toBe(true);
  expect(dialog.textContent).toContain('⌘Enter');
  expect(dialog.textContent).not.toContain('Ctrl+Enter');
  editor.setLocale('en');
  expect(dialog.getAttribute('aria-label')).toBe('Keyboard shortcuts');
  dialog.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  expect(dialog.open).toBe(false);
  // Native close events are queued by the browser; dispatch to check the handler.
  dialog.dispatchEvent(new Event('close'));
  expect(document.activeElement).toBe(toggle);
  editor.destroy();
  expect(container.querySelector('dialog')).toBeNull();
  container.remove();
});

it('can hide shortcut help without disabling the editor', () => {
  const container = document.createElement('div');
  const editor = createEditor(container, {
    controls: { keyboardHelp: false },
    executor: { execute: async () => ({ kind: 'boolean', value: true }) },
  });
  expect(container.querySelector('.ldforge-keyboard-toggle')).toBeNull();
  expect(editor.getQuery()).toBeDefined();
  editor.destroy();
});
