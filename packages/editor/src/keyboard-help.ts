import { createSvgIcon, type Locale } from '@ldforge/core';
import { runShortcutLabel } from './keyboard.js';

export function createKeyboardHelp(host: {
  root: HTMLElement;
  tools: HTMLElement;
  visible: boolean;
  getLocale(): Locale;
}) {
  const doc = host.root.ownerDocument;
  const platform = doc.defaultView?.navigator.platform ?? '';
  const mac = /Mac|iP(hone|ad|od)/.test(platform);
  const linux = /Linux/.test(platform);
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ldforge-keyboard-toggle';
  toggle.setAttribute('aria-haspopup', 'dialog');
  toggle.append(
    createSvgIcon([
      'M3 5h18v14H3z',
      'M6 9h1m3 0h1m3 0h1m3 0h1M6 12h1m3 0h1m3 0h1m3 0h1M7 15h10',
    ])(doc),
  );
  const dialog = doc.createElement('dialog');
  dialog.className = 'ldforge-keyboard-help';
  const header = doc.createElement('div');
  header.className = 'ldforge-keyboard-header';
  const title = doc.createElement('h2');
  const close = doc.createElement('button');
  close.type = 'button';
  header.append(title, close);
  const body = doc.createElement('div');
  const note = doc.createElement('p');
  dialog.append(header, body, note);
  host.root.append(dialog);
  if (host.visible) host.tools.append(toggle);

  function hide() {
    if (typeof dialog.close === 'function') dialog.close();
    else {
      dialog.removeAttribute('open');
      toggle.focus();
    }
  }
  close.addEventListener('click', hide);
  dialog.addEventListener('close', () => toggle.focus());
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      hide();
    }
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) hide();
  });
  toggle.addEventListener('click', () => {
    refreshLocale();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    close.focus();
  });

  function refreshLocale() {
    const nl = host.getLocale() === 'nl';
    const label = nl ? 'Sneltoetsen' : 'Keyboard shortcuts';
    toggle.title = label;
    toggle.setAttribute('aria-label', label);
    title.textContent = label;
    dialog.setAttribute('aria-label', label);
    close.textContent = nl ? 'Sluiten' : 'Close';
    const rows = [
      [nl ? 'Query uitvoeren' : 'Run query', runShortcutLabel(platform)],
      [nl ? 'Aanvullen' : 'Completion', mac ? 'Control+Space' : 'Ctrl+Space'],
      [nl ? 'Ongedaan maken' : 'Undo', mac ? '⌘Z' : 'Ctrl+Z'],
      [
        nl ? 'Opnieuw toepassen' : 'Redo',
        mac ? '⌘Shift+Z' : linux ? 'Ctrl+Y / Ctrl+Shift+Z' : 'Ctrl+Y',
      ],
      [nl ? 'Code inklappen' : 'Fold code', mac ? '⌘Option+[' : 'Ctrl+Shift+['],
      [
        nl ? 'Code uitklappen' : 'Unfold code',
        mac ? '⌘Option+]' : 'Ctrl+Shift+]',
      ],
    ];
    const list = doc.createElement('dl');
    for (const [action, keys] of rows) {
      const row = doc.createElement('div');
      const name = doc.createElement('dt');
      name.textContent = action ?? '';
      const value = doc.createElement('dd');
      const shortcut = doc.createElement('kbd');
      shortcut.textContent = keys ?? '';
      value.append(shortcut);
      row.append(name, value);
      list.append(row);
    }
    body.replaceChildren(list);
    note.textContent = nl
      ? 'Deze sneltoetsen werken als de queryeditor focus heeft. Menu’s: pijltjestoetsen, Enter en Escape. Je besturingssysteem kan combinaties zoals Control+Space onderscheppen.'
      : 'These shortcuts apply while the query editor has focus. Menus: arrow keys, Enter and Escape. Your operating system may reserve combinations such as Control+Space.';
  }
  refreshLocale();
  return {
    refreshLocale,
    destroy() {
      dialog.remove();
      toggle.remove();
    },
  };
}
