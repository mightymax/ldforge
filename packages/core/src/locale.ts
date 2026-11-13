export type Locale = 'en' | 'nl';
export type LocalePreference = Locale | 'auto';
export type LocalizedText = string | Readonly<Record<Locale, string>>;

/** Explicit preference wins; otherwise use the first supported browser language. */
export function resolveLocale(
  preference: LocalePreference = 'auto',
  languages: readonly string[] = typeof navigator === 'undefined'
    ? []
    : [...navigator.languages, navigator.language],
): Locale {
  if (preference !== 'auto') return preference;
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (base === 'nl' || base === 'en') return base;
  }
  return 'en';
}

export function localize(text: LocalizedText, locale: Locale): string {
  return typeof text === 'string' ? text : text[locale];
}

const en = {
  prefixCountLimited:
    'Showing {shown} of {count} namespaces. Refine your search.',
  formatQuery: 'Format query',
  formatting: 'Formatting query…',
  formatFailed: 'Could not format query: {message}',
  coreTools: 'Editor tools',
  extraActions: 'Project actions',
  prefixes: 'Prefixes',
  prefixSearch: 'Find a prefix',
  prefixSearchHint: 'Search by prefix or namespace…',
  prefixAdded: 'PREFIX {prefix} is available in your query.',
  prefixCount: '{count} namespaces',
  prefixNone: 'No matching namespaces.',
  prefixAdd: 'Add PREFIX {prefix}',
  queryExecution: 'Query execution',
  examples: 'Query examples',
  sparqlIncomplete:
    'Incomplete SPARQL syntax: an expected term or delimiter is missing.',
  sparqlUnexpected: 'Unexpected SPARQL syntax.',
  sparqlUnknownPrefix: 'Undeclared prefix: {prefix}',
  sparqlAddPrefix: 'Add PREFIX {prefix}',
  renameQueryTab: 'Rename {title}',
  queryTabName: 'Query name',
  renameHint: 'Double-click to rename',
  queryTabs: 'Queries',
  queryTab: 'Query {number}',
  newQueryTab: 'New query',
  closeQueryTab: 'Close {title}',
  editor: 'SPARQL editor',
  actions: 'Query actions',
  query: 'SPARQL query',
  results: 'Query results',
  resultView: 'Result view',
  ready: 'Ready.',
  running: 'Running query…',
  run: 'Run query',
  runTitle: 'Run query (Ctrl/Cmd+Enter)',
  cancel: 'Cancel',
  settings: 'IDE settings',
  language: 'Language',
  automatic: 'Project / browser default',
  languageHelp:
    'Your choice overrides the project language. Use the default to follow the project setup or browser.',
  emptyQuery: 'Enter a SPARQL query.',
  httpError: 'SPARQL endpoint returned HTTP {status}.',
  actionFailed: 'Action failed: {message}',
  rendererFailed: 'Renderer failed: {message}',
  settingsFailed: 'Settings failed: {message}',
  noRenderer: 'No renderer supports this result. Register a result renderer.',
  resultOne: '{count} result',
  resultMany: '{count} results',
  completed: '{summary} in {duration}',
  true: 'True',
  false: 'False',
  table: 'Table',
  boolean: 'Boolean',
  termLanguage: 'Language: {language}',
};
const nl: Record<keyof typeof en, string> = {
  prefixCountLimited:
    '{shown} van {count} namespaces getoond. Verfijn je zoekopdracht.',
  formatQuery: 'Query formatteren',
  formatting: 'Query wordt geformatteerd…',
  formatFailed: 'Query formatteren mislukt: {message}',
  coreTools: 'Editorgereedschap',
  extraActions: 'Projectacties',
  prefixes: 'Prefixes',
  prefixSearch: 'Zoek een prefix',
  prefixSearchHint: 'Zoek op prefix of namespace…',
  prefixAdded: 'PREFIX {prefix} is beschikbaar in je query.',
  prefixCount: '{count} namespaces',
  prefixNone: 'Geen overeenkomende namespaces.',
  prefixAdd: 'PREFIX {prefix} toevoegen',
  queryExecution: 'Query uitvoeren',
  examples: 'Queryvoorbeelden',
  sparqlIncomplete:
    'Onvolledige SPARQL-syntaxis: er ontbreekt een term of scheidingsteken.',
  sparqlUnexpected: 'Onverwachte SPARQL-syntaxis.',
  sparqlUnknownPrefix: 'Niet-gedeclareerde prefix: {prefix}',
  sparqlAddPrefix: 'PREFIX {prefix} toevoegen',
  renameQueryTab: '{title} hernoemen',
  queryTabName: 'Querynaam',
  renameHint: 'Dubbelklik om te hernoemen',
  queryTabs: 'Queries',
  queryTab: 'Query {number}',
  newQueryTab: 'Nieuwe query',
  closeQueryTab: '{title} sluiten',
  editor: 'SPARQL-editor',
  actions: 'Queryacties',
  query: 'SPARQL-query',
  results: 'Queryresultaten',
  resultView: 'Resultaatweergave',
  ready: 'Gereed.',
  running: 'Query wordt uitgevoerd…',
  run: 'Query uitvoeren',
  runTitle: 'Query uitvoeren (Ctrl/Cmd+Enter)',
  cancel: 'Annuleren',
  settings: 'IDE-instellingen',
  language: 'Taal',
  automatic: 'Project- / browserinstelling',
  languageHelp:
    'Je keuze gaat voor de projecttaal. Gebruik de standaard om de projectinstelling of browser te volgen.',
  emptyQuery: 'Voer een SPARQL-query in.',
  httpError: 'Het SPARQL-endpoint gaf HTTP {status} terug.',
  actionFailed: 'Actie mislukt: {message}',
  rendererFailed: 'Resultaatweergave mislukt: {message}',
  settingsFailed: 'Instellingen mislukt: {message}',
  noRenderer:
    'Geen renderer ondersteunt dit resultaat. Registreer een resultaatrenderer.',
  resultOne: '{count} resultaat',
  resultMany: '{count} resultaten',
  completed: '{summary} in {duration}',
  true: 'Waar',
  false: 'Onwaar',
  table: 'Tabel',
  boolean: 'Booleaans',
  termLanguage: 'Taal: {language}',
};

export function translate(
  locale: Locale,
  key: keyof typeof en,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return { en, nl }[locale][key].replace(
    /\{(\w+)\}/g,
    (placeholder: string, name: string) => String(values[name] ?? placeholder),
  );
}
