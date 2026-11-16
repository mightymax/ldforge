import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { keymap } from '@codemirror/view';
import { linter, lintGutter } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import type { Locale } from '@ldforge/core';
import { sparql, SparqlLanguage } from 'codemirror-lang-sparql';
import { createSparqlCompletion } from './completion.js';
import { automaticPrefixes } from './automatic-prefixes.js';
import { sparqlDiagnostics } from './diagnostics.js';
import type { SparqlOptions } from './vocabulary.js';

export { SparqlLanguage as sparqlLanguage };
export {
  getSparqlContext,
  previousVariables,
  queryVariables,
} from './analysis.js';
export type { SparqlCursorContext, SparqlPosition } from './analysis.js';
export { createSparqlCompletion, addPrefix } from './completion.js';
export { sparqlDiagnostics } from './diagnostics.js';
export { defaultPredicates, defaultPrefixes } from './vocabulary.js';
export type { SparqlOptions, SparqlPredicate } from './vocabulary.js';

/** Local Lezer parsing, completion and diagnostics; no server or worker is needed. */
export function sparqlSupport(
  options: SparqlOptions = {},
  locale: () => Locale = () => 'en',
): Extension {
  const source = createSparqlCompletion(options);
  return [
    sparql(),
    automaticPrefixes(options),
    autocompletion({ override: [source] }),
    keymap.of(completionKeymap),
    linter((view) => sparqlDiagnostics(view.state, locale(), options), {
      delay: 250,
    }),
    lintGutter(),
  ];
}

export { formatSparql } from './format.js';
export type { FormatOptions } from './format.js';
