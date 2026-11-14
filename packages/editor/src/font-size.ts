import type { Locale } from '@ldforge/core';
export const DEFAULT_FONT_SIZE = 12;
export function validateFontSize(value: number): void {
  if (!Number.isInteger(value) || value < 10 || value > 24)
    throw new RangeError('fontSize must be an integer from 10 to 24.');
}
export function createFontSizeControl(
  doc: Document,
  current: () => number,
  locale: () => Locale,
  onChange: (size: number) => void,
) {
  const element = doc.createElement('fieldset');
  element.className = 'ldforge-font-size';
  const legend = doc.createElement('legend');
  const smaller = doc.createElement('button');
  smaller.type = 'button';
  smaller.textContent = 'A−';
  const larger = doc.createElement('button');
  larger.type = 'button';
  larger.textContent = 'A+';
  const reset = doc.createElement('button');
  reset.type = 'button';
  const select = doc.createElement('select');
  for (let size = 10; size <= 24; size++)
    select.append(new Option(`${size} px`, String(size)));
  element.append(legend, smaller, select, larger, reset);
  smaller.addEventListener('click', () =>
    onChange(Math.max(10, current() - 1)),
  );
  larger.addEventListener('click', () => onChange(Math.min(24, current() + 1)));
  reset.addEventListener('click', () => onChange(DEFAULT_FONT_SIZE));
  select.addEventListener('change', () => onChange(Number(select.value)));
  function refresh() {
    const nl = locale() === 'nl';
    legend.textContent = nl ? 'Tekstgrootte' : 'Text size';
    select.setAttribute('aria-label', legend.textContent);
    select.value = String(current());
    smaller.setAttribute(
      'aria-label',
      nl ? 'Tekst verkleinen' : 'Decrease text size',
    );
    larger.setAttribute(
      'aria-label',
      nl ? 'Tekst vergroten' : 'Increase text size',
    );
    reset.textContent = nl ? 'Herstellen' : 'Reset';
    reset.setAttribute(
      'aria-label',
      nl ? 'Tekstgrootte herstellen' : 'Reset text size',
    );
    smaller.disabled = current() === 10;
    larger.disabled = current() === 24;
  }
  refresh();
  return { element, refresh };
}
