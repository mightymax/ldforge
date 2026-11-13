import { QueryExecutionError, translate } from '@ldforge/core';
import type { Locale, QueryState } from '@ldforge/core';

/** Compact human-readable elapsed time; round before choosing the unit. */
export function formatDuration(
  durationMs: number,
  locale: Locale = 'en',
): string {
  const milliseconds = Math.max(0, Math.round(durationMs));
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  if (milliseconds < 60_000)
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(milliseconds / 1_000)} s`;
  const seconds = Math.floor(milliseconds / 1_000);
  if (seconds < 3_600)
    return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  return `${Math.floor(seconds / 3_600)} ${locale === 'nl' ? 'u' : 'h'} ${Math.floor((seconds % 3_600) / 60)} min`;
}

export function formatQueryStatus(
  state: QueryState,
  locale: Locale = 'en',
): string {
  switch (state.status) {
    case 'idle':
      return translate(locale, 'ready');
    case 'running':
      return translate(locale, 'running');
    case 'error':
      return state.error instanceof QueryExecutionError
        ? translate(locale, state.error.code, {
            status: state.error.status ?? '',
          })
        : state.error.message;
    case 'success': {
      const count =
        state.result.kind === 'graph'
          ? state.result.triples.length
          : state.result.kind === 'bindings'
            ? state.result.bindings.length
            : 0;
      const summary =
        state.result.kind === 'boolean'
          ? translate(locale, state.result.value ? 'true' : 'false')
          : translate(
              locale,
              state.result.kind === 'graph'
                ? count === 1
                  ? 'tripleOne'
                  : 'tripleMany'
                : count === 1
                  ? 'resultOne'
                  : 'resultMany',
              {
                count: new Intl.NumberFormat(locale).format(count),
              },
            );
      return translate(locale, 'completed', {
        summary,
        duration: formatDuration(state.durationMs, locale),
      });
    }
  }
}
