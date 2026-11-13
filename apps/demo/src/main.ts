import {
  createEditor,
  createRunButton,
  createCancelButton,
} from '@ldforge/editor';
import type { QueryExecutor, QueryResult } from '@ldforge/core';
import {
  createTableRenderer,
  createBooleanRenderer,
  createJsonRenderer,
} from '@ldforge/renderers';
import '@ldforge/editor/styles.css';
import './style.css';
import { createEndpointSettings } from './endpoint-settings.js';
import { readUserLocale, saveUserLocale } from './locale-preference.js';
import { readQueryWorkspace, saveQueryWorkspace } from './query-storage.js';

const selectQuery = `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?resource ?label
WHERE {
  ?resource rdfs:label ?label .
  FILTER (lang(?label) = "en")
}
LIMIT 10`;

/** A deterministic fixture, not a SPARQL engine; see the banner in the demo. */
const fixtureExecutor: QueryExecutor = {
  async execute({ query, signal }): Promise<QueryResult> {
    signal.throwIfAborted();
    if (/\bASK\s*\{/i.test(query)) return { kind: 'boolean', value: true };
    return {
      kind: 'bindings',
      variables: ['resource', 'label'],
      bindings: [
        {
          resource: { type: 'uri', value: 'https://example.org/amsterdam' },
          label: { type: 'literal', value: 'Amsterdam', 'xml:lang': 'en' },
        },
        {
          resource: { type: 'uri', value: 'https://example.org/rotterdam' },
          label: { type: 'literal', value: 'Rotterdam', 'xml:lang': 'en' },
        },
        {
          resource: { type: 'uri', value: 'https://example.org/utrecht' },
          label: { type: 'literal', value: 'Utrecht', 'xml:lang': 'en' },
        },
      ],
    };
  },
};

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Demo mount point is missing.');
app.innerHTML = `
  <header><a class="wordmark" href="./">LD<span>Forge</span><span class="badge">DEVELOPER PREVIEW</span></a><nav aria-label="Main navigation"><a href="./" aria-current="page">Demo</a><a href="./guide.html">Integration guide</a><a href="./api.html">API reference</a></nav></header>
  <section class="intro"><p class="eyebrow">COMPOSABLE LINKED DATA TOOLS</p><h1>A home for your<br><span>next SPARQL query.</span></h1><p>An embeddable editor. Your actions. Your result views.<br>Built to fit the application you are building.</p></section>

  <div id="editor"></div>
  <footer><span>01 / Write a query</span><span>02 / Run or press ⌘ / Ctrl + Enter</span><span>03 / Choose a result view</span></footer>
  <aside><h2>Small pieces. Clear boundaries.</h2><div class="modules"><article><code>@ldforge/core</code><p>Query lifecycle, HTTP transport and typed plugin contracts.</p></article><article><code>@ldforge/editor</code><p>CodeMirror, accessible controls and your own button plugins.</p></article><article><code>@ldforge/prefixes</code><p>A searchable catalog of common namespaces, ready to import.</p></article><article><code>@ldforge/renderers</code><p>Independent table, boolean and JSON result plugins.</p></article></div></aside>`;

const connection = createEndpointSettings(fixtureExecutor);
const mount = document.querySelector<HTMLElement>('#editor');
if (!mount) throw new Error('Editor mount point is missing.');
const restoredWorkspace = readQueryWorkspace();
const editor = createEditor(mount, {
  ...(restoredWorkspace ? { workspace: restoredWorkspace } : {}),
  onWorkspaceChange: saveQueryWorkspace,
  query: selectQuery,
  executor: connection.executor,
  settings: [connection.plugin],
  userLocale: readUserLocale(),
  onLocaleChange: saveUserLocale,
  buttons: [
    createRunButton(),
    createCancelButton(),
    {
      id: 'example-ask',
      group: 'examples',
      label: { en: 'ASK example', nl: 'ASK-voorbeeld' },
      execute(context) {
        context.setQuery('ASK { ?subject ?predicate ?object }');
      },
    },
    {
      id: 'example-select',
      group: 'examples',
      label: { en: 'SELECT example', nl: 'SELECT-voorbeeld' },
      execute(context) {
        context.setQuery(selectQuery);
      },
    },
  ],
  renderers: [
    createTableRenderer(),
    createBooleanRenderer(),
    createJsonRenderer(),
  ],
});

if (import.meta.hot) import.meta.hot.dispose(() => editor.destroy());
