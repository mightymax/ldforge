import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  localize,
  QueryExecutionError,
  resolveLocale,
  translate,
} from '@ldforge/core';
import {
  formatDuration,
  formatQueryStatus,
} from '../packages/editor/src/query-status.js';
import {
  readUserLocale,
  saveUserLocale,
} from '../apps/demo/src/locale-preference.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe('locale resolution and messages', () => {
  it.each([
    [['nl-NL', 'en-US'], 'nl'],
    [['en-GB', 'nl-NL'], 'en'],
    [['fr-FR', 'nl-BE'], 'nl'],
    [['de-DE'], 'en'],
    [[], 'en'],
  ] as const)('resolves browser languages %j to %s', (languages, locale) => {
    expect(resolveLocale('auto', languages)).toBe(locale);
  });
  it('honors explicit choices and works without a browser', () => {
    expect(resolveLocale('en', ['nl-NL'])).toBe('en');
    expect(resolveLocale('nl', ['en-US'])).toBe('nl');
    vi.stubGlobal('navigator', undefined);
    expect(resolveLocale()).toBe('en');
  });
  it('supports localized plugin labels, Dutch numbers and known execution errors', () => {
    expect(localize('Custom', 'nl')).toBe('Custom');
    expect(localize({ en: 'Table', nl: 'Tabel' }, 'nl')).toBe('Tabel');
    expect(translate('nl', 'resultMany', { count: 3 })).toBe('3 resultaten');
    expect(formatDuration(1250, 'nl')).toBe('1,25 s');
    expect(formatDuration(3_600_000, 'nl')).toBe('1 u 0 min');
    expect(
      formatQueryStatus(
        {
          status: 'error',
          error: new QueryExecutionError('emptyQuery', 'Enter a SPARQL query.'),
        },
        'nl',
      ),
    ).toBe('Voer een SPARQL-query in.');
    expect(
      formatQueryStatus(
        {
          status: 'error',
          error: new QueryExecutionError('httpError', 'HTTP 401', 401),
        },
        'nl',
      ),
    ).toContain('HTTP 401');
  });
  it('persists only valid user choices and tolerates unavailable storage', () => {
    expect(readUserLocale()).toBe('auto');
    saveUserLocale('nl');
    expect(readUserLocale()).toBe('nl');
    saveUserLocale('auto');
    expect(readUserLocale()).toBe('auto');
    localStorage.setItem('ldforge.demo.locale.v1', 'fr');
    expect(readUserLocale()).toBe('auto');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Denied');
    });
    expect(readUserLocale()).toBe('auto');
    expect(() => saveUserLocale('en')).not.toThrow();
  });
});
