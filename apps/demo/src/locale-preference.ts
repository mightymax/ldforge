import type { LocalePreference } from '@ldforge/core';

const storageKey = 'ldforge.demo.locale.v1';
export function readUserLocale(): LocalePreference {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved === 'nl' || saved === 'en' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}
export function saveUserLocale(preference: LocalePreference): void {
  try {
    localStorage.setItem(storageKey, preference);
  } catch {
    /* The selected language still applies for this editor session. */
  }
}
