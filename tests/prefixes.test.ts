import { describe, expect, it } from 'vitest';
import { prefixes, prefixEntries, searchPrefixes } from '@ldforge/prefixes';
import * as compact from '@ldforge/prefixes/compact';
import * as extended from '@ldforge/prefixes/extended';
import { createEditor } from '@ldforge/editor';
import { sparqlDiagnostics } from '@ldforge/editor';
import { EditorState } from '@codemirror/state';

describe('prefix catalog', () => {
  it('exposes unique, absolute namespace entries and an equivalent importable map', () => {
    expect(new Set(prefixEntries.map((entry) => entry.prefix)).size).toBe(
      prefixEntries.length,
    );
    for (const entry of prefixEntries) {
      expect(prefixes[entry.prefix]).toBe(entry.namespace);
      expect(new URL(entry.namespace).protocol).toMatch(/^https?:$/);
      expect(Object.keys(entry)).toEqual(['prefix', 'namespace']);
    }
    expect(prefixes.rdf).toBe('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
  });
  it('searches prefix names and namespaces with a result limit', () => {
    expect(searchPrefixes(' RDFS ')[0]?.prefix).toBe('rdfs');
    expect(searchPrefixes('prov')[0]?.prefix).toBe('prov');
    expect(searchPrefixes('http://purl.org/dc/terms/')[0]?.prefix).toBe(
      'dcterms',
    );
    expect(searchPrefixes('', 2)).toHaveLength(2);
    expect(searchPrefixes('', -1)).toEqual([]);
    expect(searchPrefixes('no-such-prefix')).toEqual([]);
  });
});

it('searches and adds prefixes in the IDE, preserves drafts and avoids namespace collisions', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = createEditor(host, {
    query:
      'PREFIX skos: <https://different.example/> SELECT * WHERE { ?s ?p ?o }',
    executor: { execute: async () => ({ kind: 'boolean', value: true }) },
    sparql: { prefixes },
  });
  try {
    const toggle = host.querySelector<HTMLButtonElement>(
      '[aria-controls$="-prefixes"]',
    );
    const panel = host.querySelector<HTMLElement>('.ldforge-prefix-picker');
    expect(panel?.hidden).toBe(true);
    toggle?.click();
    const search = panel?.querySelector('input');
    if (!search) throw new Error('Missing search');
    search.value = 'skos';
    search.dispatchEvent(new Event('input'));
    panel
      ?.querySelector<HTMLButtonElement>('[aria-label="Add PREFIX skos"]')
      ?.click();
    expect(editor.getQuery()).toContain(
      'PREFIX skos2: <http://www.w3.org/2004/02/skos/core#>',
    );
    panel
      ?.querySelector<HTMLButtonElement>('[aria-label="Add PREFIX skos"]')
      ?.click();
    expect(editor.getQuery().match(/PREFIX skos2:/g)).toHaveLength(1);
    editor.setLocale('nl');
    expect(search.value).toBe('skos');
    expect(panel?.querySelector('label')?.textContent).toBe('Zoek een prefix');
    search.value = 'no-match';
    search.dispatchEvent(new Event('input'));
    expect(panel?.textContent).toContain('Geen overeenkomende namespaces.');
    panel?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(panel?.hidden).toBe(true);
    toggle?.click();
    toggle?.click();
    expect(panel?.hidden).toBe(true);
    expect(
      sparqlDiagnostics(EditorState.create({ doc: editor.getQuery() })),
    ).toEqual([]);
  } finally {
    editor.destroy();
    host.remove();
  }
});

it('exposes independent compact and extended catalogs without changing source namespace bindings', () => {
  expect(compact.prefixes).toBe(prefixes);
  expect(compact.prefixEntries).toHaveLength(32);
  expect(extended.prefixEntries).toHaveLength(3623);
  expect(extended.prefixes.dbo).toBe('http://dbpedia.org/ontology/');
  expect(extended.prefixes.madsrdf).toBe('http://www.loc.gov/mads/rdf/v1#');
  expect(compact.prefixes.geo).toBe('http://www.w3.org/2003/01/geo/wgs84_pos#');
  expect(extended.prefixes.geo).toBe('http://www.opengis.net/ont/geosparql#');
  expect(compact.prefixes.schema).toBe('https://schema.org/');
  expect(extended.prefixes.schema).toBe('http://schema.org/');
  expect(extended.prefixes.da).toBe(
    'https://www.wowman.org/index.php?id=1&type=get#',
  );
  expect(extended.searchPrefixes('madsrdf')[0]?.namespace).toBe(
    extended.prefixes.madsrdf,
  );
  expect(compact.searchPrefixes('madsrdf')).toEqual([]);
  for (const entry of extended.prefixEntries) {
    expect(Object.keys(entry)).toEqual(['prefix', 'namespace']);
    expect(new URL(entry.namespace).protocol).toMatch(/^https?:$/);
  }
});

it('uses the developer-selected extended catalog and limits rendered search results', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = createEditor(host, {
    query: 'ASK {}',
    executor: { execute: async () => ({ kind: 'boolean', value: true }) },
    sparql: { prefixes: extended.prefixes },
  });
  try {
    const panel = host.querySelector<HTMLElement>('.ldforge-prefix-picker');
    expect(panel?.querySelectorAll('li')).toHaveLength(0);
    host
      .querySelector<HTMLButtonElement>('[aria-controls$="-prefixes"]')
      ?.click();
    expect(panel?.querySelectorAll('li')).toHaveLength(50);
    expect(panel?.textContent).toContain('Showing 50 of 3623 namespaces');
    const search = panel?.querySelector('input');
    if (!search) throw new Error('Missing search');
    search.value = 'madsrdf';
    search.dispatchEvent(new Event('input'));
    panel
      ?.querySelector<HTMLButtonElement>('[aria-label="Add PREFIX madsrdf"]')
      ?.click();
    expect(editor.getQuery()).toContain(
      'PREFIX madsrdf: <http://www.loc.gov/mads/rdf/v1#>',
    );
    expect(editor.addPrefix('geo')).toBe('geo');
    expect(editor.getQuery()).toContain(
      'PREFIX geo: <http://www.opengis.net/ont/geosparql#>',
    );
  } finally {
    editor.destroy();
    host.remove();
  }
});
