export interface PrefixEntry {
  readonly prefix: string;
  readonly namespace: string;
}

/** Shared catalog behavior; the data sets remain separate import graphs. */
export function createPrefixCatalog(source: Readonly<Record<string, string>>) {
  const prefixes: Readonly<Record<string, string>> = Object.freeze({
    ...source,
  });
  const prefixEntries: readonly PrefixEntry[] = Object.freeze(
    Object.entries(prefixes).map(([prefix, namespace]) =>
      Object.freeze({ prefix, namespace }),
    ),
  );
  function searchPrefixes(query: string, limit = 50): readonly PrefixEntry[] {
    const text = query.trim().toLowerCase();
    return prefixEntries
      .filter((entry) =>
        `${entry.prefix} ${entry.namespace}`.toLowerCase().includes(text),
      )
      .slice(0, Math.max(0, Math.floor(limit)));
  }
  return { prefixes, prefixEntries, searchPrefixes };
}
