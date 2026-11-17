import { parseQueryViewDirectives } from '@ldforge/core';
import type { Locale } from '@ldforge/core';

/** Keep existing options/comments and make the selected renderer authoritative. */
export function queryWithRenderer(query: string, rendererId?: string): string {
  return queryWithDirective(query, 'view', rendererId);
}

export function queryWithEndpoint(query: string, endpoint?: string): string {
  if (parseQueryViewDirectives(query)['sparql-endpoint']) return query;
  return queryWithDirective(query, 'sparql-endpoint', endpoint);
}

function queryWithDirective(
  query: string,
  key: string,
  value?: string,
): string {
  if (!value || parseQueryViewDirectives(query)[key] === value) return query;
  const lines = query.replace(/^\uFEFF/, '').split(/\r?\n/);
  let end = 0;
  while (
    end < lines.length &&
    (!lines[end]?.trim() || lines[end]?.trimStart().startsWith('#'))
  )
    end++;
  const quote = (value: string) =>
    /^[\w.-]+$/.test(value) ? value : JSON.stringify(value);
  let replaced = false;
  for (let index = 0; index < end; index++) {
    const directives = parseQueryViewDirectives(lines[index] ?? '');
    if (directives[key] === undefined) continue;
    lines[index] =
      '# ' +
      Object.entries(directives)
        .map(
          ([name, existing]) =>
            `${name}=${quote(name === key ? value : (existing ?? ''))}`,
        )
        .join('; ');
    replaced = true;
  }
  if (!replaced) lines.splice(end, 0, `# ${key}=${quote(value)}`);
  return lines.join('\n');
}

export function createShareLink(baseUrl: string, query: string): string {
  const url = new URL(baseUrl);
  if (!url.hash.startsWith('#/')) url.hash = '';
  url.searchParams.delete('execute');
  url.searchParams.set('query', query);
  return url.href;
}

export function validateShortUrl(
  value: unknown,
  locale: Locale,
): asserts value is string {
  if (typeof value === 'string' && value.trim() === value) {
    try {
      if (['http:', 'https:'].includes(new URL(value).protocol)) return;
    } catch {
      /* Invalid host response. */
    }
  }
  throw new Error(
    locale === 'nl'
      ? 'De verkortingsservice gaf een ongeldige URL terug.'
      : 'The shortening service returned an invalid URL.',
  );
}
