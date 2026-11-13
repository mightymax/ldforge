import { EditorState } from '@codemirror/state';
import type { Locale } from '@ldforge/core';
import { translate } from '@ldforge/core';
import { prefixDeclarations } from './sparql/analysis.js';
import { prefixEdit } from './sparql/completion.js';
import { namespaceCatalog } from './sparql/vocabulary.js';
import { formatSparql } from './sparql/format.js';
import type { FormatOptions } from './sparql/format.js';
import type { QueryTab, QueryWorkspace } from './query-tabs.js';

export interface PrefixInput {
  readonly prefix: string;
  readonly namespace?: string;
}
export interface AddTabOptions {
  readonly name?: string;
  readonly query?: string;
  readonly prefixes?: readonly (string | PrefixInput)[];
  /** New tabs become active unless false. */
  readonly activate?: boolean;
}
export interface QueryTabHandle {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly isDeleted: boolean;
  /** Current text for this ID, including inactive tabs. Throws after deletion/destruction. */
  getQuery(): string;
  /** Replace text and emit persistence callbacks without activating this tab. */
  setQuery(query: string): void;
  /** Lazy local formatting. Rejects on invalid syntax, deletion or newer text edits. */
  formatQuery(options?: FormatOptions): Promise<string>;
  /** Returns the actual alias, or undefined for an unknown shorthand (with a warning). */
  addPrefix(prefix: string, namespace?: string): string | undefined;
  /** Trim and store a name; an empty name restores the localized default. */
  rename(name: string): void;
  /** Switch the one editor view to this tab, cancelling pending query execution. */
  activate(): void;
  /** The last remaining tab cannot be deleted. */
  delete(): boolean;
}
/** Live readonly array of stable handles. Use addTab/delete instead of array mutation. */
export interface TabCollection extends ReadonlyArray<QueryTabHandle> {
  getById(id: string): QueryTabHandle | undefined;
  /** Names are not unique; returns the first match in tab order. */
  getByName(name: string): QueryTabHandle | undefined;
  getActive(): QueryTabHandle;
  addTab(options?: AddTabOptions): QueryTabHandle;
}
export interface EditorWarning {
  readonly code: 'unknown-prefix';
  readonly message: string;
  readonly prefix: string;
}
export interface TabAdapter {
  snapshot(): QueryWorkspace;
  locale(): Locale;
  assertAlive(): void;
  setQuery(id: string, query: string): void;
  rename(id: string, name: string): void;
  activate(id: string): void;
  delete(id: string): boolean;
  add(options: { name?: string; query: string; activate: boolean }): string;
  readonly catalog: Readonly<Record<string, string>>;
  readonly warn: (warning: EditorWarning) => void;
}

export function queryWithPrefix(
  query: string,
  preferred: string,
  namespace: string,
): { query: string; prefix: string } {
  namespaceCatalog({ prefixes: { [preferred]: namespace } });
  const state = EditorState.create({ doc: query });
  const declared = prefixDeclarations(state);
  const existing = declared.find((entry) => entry.iri === namespace);
  if (existing) return { query, prefix: existing.prefix };
  let prefix = preferred;
  let number = 2;
  while (declared.some((entry) => entry.prefix === prefix))
    prefix = `${preferred || 'ns'}${number++}`;
  const edit = prefixEdit(state, prefix, namespace);
  return {
    query: query.slice(0, edit.from) + edit.insert + query.slice(edit.from),
    prefix,
  };
}

export function createTabApi(adapter: TabAdapter): {
  collection: TabCollection;
  sync(): void;
} {
  const items: QueryTabHandle[] = [];
  const handles = new Map<string, QueryTabHandle>();
  function record(id: string): QueryTab {
    adapter.assertAlive();
    const tab = adapter.snapshot().tabs.find((tab) => tab.id === id);
    if (!tab) throw new Error(`Query tab has been deleted: ${id}`);
    return tab;
  }
  function name(id: string): string {
    const tab = record(id);
    return (
      tab.title ??
      translate(adapter.locale(), 'queryTab', {
        number: adapter.snapshot().tabs.findIndex((tab) => tab.id === id) + 1,
      })
    );
  }
  function resolve(prefix: string, namespace?: string): string | undefined {
    const iri = namespace ?? adapter.catalog[prefix];
    if (iri === undefined)
      adapter.warn({
        code: 'unknown-prefix',
        prefix,
        message: `Unknown prefix "${prefix}". Supply a namespace or configure sparql.prefixes from @ldforge/prefixes.`,
      });
    return iri;
  }
  function handle(id: string): QueryTabHandle {
    let tab = handles.get(id);
    if (tab) return tab;
    tab = Object.freeze({
      id,
      get name() {
        return name(id);
      },
      get isActive() {
        adapter.assertAlive();
        return adapter.snapshot().activeId === id;
      },
      get isDeleted() {
        adapter.assertAlive();
        return !adapter.snapshot().tabs.some((tab) => tab.id === id);
      },
      getQuery: () => record(id).query,
      setQuery(query: string) {
        record(id);
        adapter.setQuery(id, query);
      },
      async formatQuery(options?: FormatOptions) {
        const original = record(id).query;
        const formatted = await formatSparql(original, options);
        if (record(id).query !== original)
          throw new Error(
            'Query changed while formatting. Retry with the current query.',
          );
        if (formatted !== original) adapter.setQuery(id, formatted);
        return formatted;
      },
      addPrefix(prefix: string, namespace?: string) {
        const original = record(id).query;
        const iri = resolve(prefix, namespace);
        if (iri === undefined) return undefined;
        const result = queryWithPrefix(original, prefix, iri);
        if (result.query !== original) adapter.setQuery(id, result.query);
        return result.prefix;
      },
      rename(title: string) {
        record(id);
        adapter.rename(id, title);
      },
      activate() {
        record(id);
        adapter.activate(id);
      },
      delete() {
        record(id);
        return adapter.delete(id);
      },
    });
    handles.set(id, tab);
    return tab;
  }
  const collection = Object.defineProperties(items, {
    getById: {
      value(id: string) {
        adapter.assertAlive();
        return adapter.snapshot().tabs.some((tab) => tab.id === id)
          ? handle(id)
          : undefined;
      },
    },
    getByName: {
      value(title: string) {
        adapter.assertAlive();
        const tab = adapter
          .snapshot()
          .tabs.find((tab) => name(tab.id) === title);
        return tab ? handle(tab.id) : undefined;
      },
    },
    getActive: {
      value() {
        adapter.assertAlive();
        return handle(adapter.snapshot().activeId);
      },
    },
    addTab: {
      value(options: AddTabOptions = {}) {
        adapter.assertAlive();
        let query = options.query ?? '';
        for (const value of options.prefixes ?? []) {
          const entry = typeof value === 'string' ? { prefix: value } : value;
          const iri = resolve(entry.prefix, entry.namespace);
          if (iri !== undefined)
            query = queryWithPrefix(query, entry.prefix, iri).query;
        }
        const id = adapter.add({
          ...(options.name !== undefined ? { name: options.name } : {}),
          query,
          activate: options.activate ?? true,
        });
        return handle(id);
      },
    },
  }) as unknown as TabCollection;
  return {
    collection,
    sync() {
      const tabs = adapter.snapshot().tabs;
      items.splice(0, items.length, ...tabs.map((tab) => handle(tab.id)));
      for (const id of handles.keys())
        if (!tabs.some((tab) => tab.id === id)) handles.delete(id);
    },
  };
}
