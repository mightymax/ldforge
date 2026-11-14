import { createGeoRenderer } from '@ldforge/geo';
import { createChartRenderer } from '@ldforge/charts';
import cardImageUrl from '../assets/logo-mark.svg?no-inline';
import { mountSiteChrome } from './site-chrome.js';
import {
  createEditor,
  createRunButton,
  createCancelButton,
  buttonGroupTypes,
} from '@ldforge/editor';
import { isGraphQuery } from '@ldforge/core';
import type { QueryExecutor, QueryResult } from '@ldforge/core';
import {
  createCardsRenderer,
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

const chartQuery = `# view=charts; chart=bar; chart-title=Example city populations
SELECT ?chart_label ?chart_value WHERE {
  VALUES (?chart_label ?chart_value) {
    ("Amsterdam" 934526)
    ("Rotterdam" 671125)
    ("Utrecht" 374374)
  }
}`;
const chartResult: QueryResult = {
  kind: 'bindings',
  variables: ['chart_label', 'chart_value'],
  bindings: [
    ['Amsterdam', '934526'],
    ['Rotterdam', '671125'],
    ['Utrecht', '374374'],
  ].map(([label, value]) => ({
    chart_label: { type: 'literal' as const, value: label ?? '' },
    chart_value: {
      type: 'literal' as const,
      value: value ?? '',
      datatype: 'http://www.w3.org/2001/XMLSchema#integer',
    },
  })),
};

const cardImage = new URL(cardImageUrl, document.baseURI).href;
// Same standalone query as examples/wikidata-cats.html.
const cardsQuery = `# view=cards
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>

SELECT ?card_title ?card_text
       ?card_image ("Meet this cat" AS ?card_button) (?cat AS ?card_button_url)
WHERE {
  # Limit the work before looking up labels. Q146 = domestic cat, P18 = image.
  {
    SELECT ?cat ?sitelinks (SAMPLE(?image) AS ?photo) WHERE {
      ?cat wdt:P31 wd:Q146; wdt:P18 ?image; wikibase:sitelinks ?sitelinks.
    }
    GROUP BY ?cat ?sitelinks
    ORDER BY DESC(?sitelinks)
    LIMIT 12
  }
  BIND(IRI(CONCAT(REPLACE(STR(?photo), "^http:", "https:"), "?width=600")) AS ?card_image)
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    ?cat rdfs:label ?card_title; schema:description ?card_text.
  }
}`;
const cardsResult: QueryResult = {
  kind: 'bindings',
  variables: [
    'card_title',
    'card_text',
    'card_image',
    'card_button',
    'card_button_url',
  ],
  bindings: [
    [
      'Linked data',
      'Explore connected knowledge with LDMax.',
      'Explore LDMax',
      'https://ldmax.nl/',
    ],
    [
      'Make it yours',
      'Add your own actions and result renderers.',
      'Plugin guide',
      'https://github.com/mightymax/ldforge/blob/main/docs/renderers.md',
    ],
    [
      'Open source',
      'Build with composable TypeScript packages.',
      'View source',
      'https://github.com/mightymax/ldforge',
    ],
  ].map(([title, text, button, url]) => ({
    card_title: { type: 'literal' as const, value: title ?? '' },
    card_text: { type: 'literal' as const, value: text ?? '' },
    card_image: { type: 'uri' as const, value: cardImage },
    card_button: { type: 'literal' as const, value: button ?? '' },
    card_button_url: { type: 'uri' as const, value: url ?? '' },
  })),
};

/** A deterministic fixture, not a SPARQL engine; see the banner in the demo. */
const fixtureExecutor: QueryExecutor = {
  async execute({ query, signal }): Promise<QueryResult> {
    signal.throwIfAborted();
    if (isGraphQuery(query))
      return {
        kind: 'graph',
        triples: ['Amsterdam', 'Rotterdam', 'Utrecht'].map((name) => ({
          subject: {
            type: 'uri',
            value: `https://example.org/${name.toLowerCase()}`,
          },
          predicate: {
            type: 'uri',
            value: 'http://www.w3.org/2000/01/rdf-schema#label',
          },
          object: { type: 'literal', value: name, 'xml:lang': 'en' },
        })),
      };
    if (/\bchart_(label|value)\b/.test(query)) return chartResult;
    if (/\bcard_(title|text|image|button|button_url)\b/.test(query))
      return cardsResult;
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
  <header><a class="wordmark" href="./">LD<span>Forge</span><span class="badge">DEVELOPER PREVIEW</span></a><nav aria-label="Main navigation"><a href="./" aria-current="page">Demo</a><a href="./guide.html">Integration guide</a><a href="./api.html">API reference</a><a href="./plugins.html">Plugins</a></nav></header>
  <section class="intro"><p class="eyebrow">COMPOSABLE LINKED DATA TOOLS</p><h1>A home for your<br><span>next SPARQL query.</span></h1><p>An embeddable editor. Your actions. Your result views.<br>Built to fit the application you are building.</p></section>

  <div id="editor"></div>
  <footer><span>01 / Write a query</span><span>02 / Run or press ⌘ / Ctrl + Enter</span><span>03 / Choose a result view</span></footer>
  <aside><h2>Small pieces. Clear boundaries.</h2><div class="modules"><article><code>@ldforge/core</code><p>Query lifecycle, HTTP transport and typed plugin contracts.</p></article><article><code>@ldforge/editor</code><p>CodeMirror, accessible controls and your own button plugins.</p></article><article><code>@ldforge/prefixes</code><p>A searchable catalog of common namespaces, ready to import.</p></article><article><code>@ldforge/renderers</code><p>Independent table, cards, boolean and JSON result plugins.</p></article><article><code>@ldforge/charts</code><p>Chart views with an external library loaded only when opened.</p></article></div></aside>`;

const connection = createEndpointSettings(fixtureExecutor);
const mount = document.querySelector<HTMLElement>('#editor');
if (!mount) throw new Error('Editor mount point is missing.');
const restoredWorkspace = readQueryWorkspace();
const editor = createEditor(mount, {
  ...(restoredWorkspace ? { workspace: restoredWorkspace } : {}),
  onWorkspaceChange: saveQueryWorkspace,
  query: selectQuery,
  prefixesCollapsed: true,
  executor: connection.executor,
  settings: [connection.plugin],
  userLocale: readUserLocale(),
  onLocaleChange: saveUserLocale,
  buttons: [createRunButton(), createCancelButton()],
  renderers: [
    createTableRenderer(),
    createCardsRenderer(),
    createChartRenderer(),
    createGeoRenderer(),
    createBooleanRenderer(),
    createJsonRenderer(),
  ].map((renderer) => ({
    ...renderer,
    documentationUrl: `./plugins.html#${renderer.id}`,
  })),
});

function loadExampleQuery(query: string): void {
  editor.setQuery(query);
  editor.setPrefixesCollapsed(true);
}

// The public demo opts into menus through the runtime API; library defaults stay inline.
const menuBar = editor.getToolBar();
const queryExamples = menuBar.addButtonGroup({
  id: 'examples',
  type: buttonGroupTypes.dropdown,
  label: { en: 'Query Examples', nl: 'Queryvoorbeelden' },
});
queryExamples.addButton({
  id: 'example-select',
  label: { en: 'SELECT example', nl: 'SELECT-voorbeeld' },
  execute() {
    loadExampleQuery(selectQuery);
  },
});
queryExamples.addButton({
  id: 'example-construct',
  label: { en: 'CONSTRUCT example', nl: 'CONSTRUCT-voorbeeld' },
  execute() {
    loadExampleQuery('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o } LIMIT 10');
  },
});
queryExamples.addButton({
  id: 'example-ask',
  label: { en: 'ASK example', nl: 'ASK-voorbeeld' },
  execute() {
    loadExampleQuery('ASK { ?subject ?predicate ?object }');
  },
});
const pluginExamples = menuBar.addButtonGroup({
  id: 'views',
  type: buttonGroupTypes.dropdown,
  label: { en: 'Plugin Examples', nl: 'Pluginvoorbeelden' },
});
pluginExamples.addButton({
  id: 'example-cards',
  label: { en: 'Cards example', nl: 'Kaartenvoorbeeld' },
  execute() {
    connection.setEndpoint('https://query.wikidata.org/sparql', 'GET');
    loadExampleQuery(cardsQuery);
  },
});
pluginExamples.addButton({
  id: 'example-geo',
  label: { en: 'Map example (Wikidata)', nl: 'Kaartvoorbeeld (Wikidata)' },
  execute() {
    connection.setEndpoint('https://query.wikidata.org/sparql', 'GET');
    loadExampleQuery(`# view=geo; geo-title=Nederlandse plaatsen
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX bd: <http://www.bigdata.com/rdf#>
SELECT ?place ?geometryLabel ?geometry WHERE {
  VALUES ?place { wd:Q727 wd:Q36600 wd:Q9920 wd:Q803 wd:Q34370 }
  ?place wdt:P625 ?geometry .
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "nl,en" .
    ?place rdfs:label ?geometryLabel .
  }
}
`);
  },
});
pluginExamples.addButton({
  id: 'example-charts',
  label: { en: 'Charts example', nl: 'Grafiekvoorbeeld' },
  execute() {
    loadExampleQuery(chartQuery);
  },
});

if (import.meta.hot) import.meta.hot.dispose(() => editor.destroy());

mountSiteChrome();
