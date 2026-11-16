import type { Locale } from '@ldforge/core';

export const DEFAULT_EDITOR_ROWS = 15;
let controlNumber = 0;

export function validateEditorRows(rows: number): void {
  if (!Number.isSafeInteger(rows) || rows < 1)
    throw new RangeError('editorRows must be a positive safe integer.');
}

export function createAutoGrowControl(
  doc: Document,
  current: () => boolean,
  locale: () => Locale,
  onChange: (enabled: boolean) => void,
) {
  const element = doc.createElement('label');
  element.className = 'ldforge-auto-grow';
  const checkbox = doc.createElement('input');
  checkbox.type = 'checkbox';
  const copy = doc.createElement('span');
  const text = doc.createElement('span');
  text.id = `ldforge-auto-grow-label-${++controlNumber}`;
  const description = doc.createElement('small');
  description.id = `${text.id}-description`;
  checkbox.setAttribute('aria-labelledby', text.id);
  checkbox.setAttribute('aria-describedby', description.id);
  copy.append(text, description);
  element.append(checkbox, copy);
  checkbox.addEventListener('change', () => onChange(checkbox.checked));
  function refresh(): void {
    text.textContent =
      locale() === 'nl' ? 'Hele query tonen' : 'Show the full query';
    description.textContent =
      locale() === 'nl'
        ? 'De editor wordt automatisch hoger, zodat je niet binnen de query hoeft te scrollen.'
        : 'The editor expands automatically so you don’t have to scroll within the query.';
    checkbox.checked = current();
  }
  refresh();
  return { element, refresh };
}
