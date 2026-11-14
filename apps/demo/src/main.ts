import { prefixes as extendedPrefixes } from '@ldforge/prefixes/extended';
import { readUserFontSize, saveUserFontSize } from './font-size-preference.js';
import { createPivotRenderer } from '@ldforge/pivot';
import { createNetworkRenderer } from '@ldforge/network';
import { createTimelineRenderer } from '@ldforge/timeline';
import {
  publishersTableQuery,
  artistsNetworkQuery,
  paintersTimelineQuery,
  paintingsPivotQuery,
} from './renderer-examples.js';
import { createGeoRenderer } from '@ldforge/geo';
import { createChartRenderer } from '@ldforge/charts';
import cardImageUrl from '../assets/logo-mark.svg?no-inline';
import { mountSiteChrome } from './site-chrome.js';
import {
  createEditor,
  createRunButton,
  buttonGroupTypes,
} from '@ldforge/editor';
import { isGraphQuery, createSvgIcon } from '@ldforge/core';
import type { QueryExecutor, QueryResult } from '@ldforge/core';
import {
  createCardsRenderer,
  createTableRenderer,
  createResourceLoader,
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

const chartQuery = `# view=charts; chart=bar; chart-title=Top 10 grootste steden van Nederland
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?chart_label ?chart_value WHERE {
  {
    SELECT ?city (MAX(?population) AS ?chart_value) WHERE {
      ?city wdt:P31/wdt:P279* wd:Q515 ;
            wdt:P17 wd:Q55 ;
            wdt:P1082 ?population .
    }
    GROUP BY ?city
    ORDER BY DESC(?chart_value)
    LIMIT 10
  }

  OPTIONAL {
    ?city wdt:P131+ ?province .
    ?province wdt:P31 wd:Q134390 ;
              wdt:P300 ?provinceCode .
    FILTER(STRSTARTS(?provinceCode, "NL-"))
  }

  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "nl,en" .
    ?city rdfs:label ?cityLabel .
  }

  BIND(
    CONCAT(
      STR(?cityLabel),
      IF(
        BOUND(?provinceCode),
        CONCAT(" (", STRAFTER(?provinceCode, "NL-"), ")"),
        ""
      )
    ) AS ?chart_label
  )
}
ORDER BY DESC(?chart_value)`;
const artMovementsQuery = `# view=charts; chart=pie; chart-title=Kunststromingen in Nederlandse collecties
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>


SELECT ?chart_label ?chart_value WHERE {
  {
    SELECT ?movement (COUNT(?painting) AS ?chart_value) WHERE {
      ?painting wdt:P31 wd:Q3305213 ;
                wdt:P135 ?movement ;
                wdt:P195 ?collection .

      ?collection wdt:P17 wd:Q55 .
    }
    GROUP BY ?movement
    ORDER BY DESC(?chart_value)
    LIMIT 12
  }

  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "nl,en" .
    ?movement rdfs:label ?chart_label .
  }
}
ORDER BY DESC(?chart_value)`;
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
    if (/\bDESCRIBE\b/i.test(query)) {
      const subject = {
        type: 'uri' as const,
        value:
          /\bDESCRIBE\s+<([^>]+)>/i.exec(query)?.[1] ??
          'https://example.org/dataset',
      };
      return {
        kind: 'graph',
        triples: [
          {
            subject,
            predicate: {
              type: 'uri',
              value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
            },
            object: { type: 'uri', value: 'http://www.w3.org/ns/dcat#Dataset' },
          },
          {
            subject,
            predicate: {
              type: 'uri',
              value: 'http://www.w3.org/2000/01/rdf-schema#label',
            },
            object: {
              type: 'literal',
              value: 'Lokale DESCRIBE-demodataset',
              'xml:lang': 'nl',
            },
          },
          {
            subject,
            predicate: {
              type: 'uri',
              value: 'http://purl.org/dc/terms/description',
            },
            object: {
              type: 'literal',
              value:
                'Dit zijn lokale voorbeeldgegevens om een DESCRIBE-resultaat te tonen zonder een SPARQL-endpoint te benaderen. '.repeat(
                  5,
                ),
              'xml:lang': 'nl',
            },
          },
        ],
      };
    }
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
  <p id="active-endpoint" class="active-endpoint" role="status"></p>
  <footer><span>01 / Write a query</span><span>02 / Run or press ⌘ / Ctrl + Enter</span><span>03 / Choose a result view</span></footer>
  <aside><h2>Small pieces. Clear boundaries.</h2><div class="modules"><article><code>@ldforge/core</code><p>Query lifecycle, HTTP transport and typed plugin contracts.</p></article><article><code>@ldforge/editor</code><p>CodeMirror, accessible controls and your own button plugins.</p></article><article><code>@ldforge/prefixes</code><p>A searchable catalog of common namespaces, ready to import.</p></article><article><code>@ldforge/renderers</code><p>Independent table, cards, boolean and JSON result plugins.</p></article><article><code>@ldforge/charts</code><p>Chart views with an external library loaded only when opened.</p></article></div></aside>`;

const endpointIndicator =
  document.querySelector<HTMLElement>('#active-endpoint');
const connection = createEndpointSettings(fixtureExecutor, (label) => {
  if (endpointIndicator) {
    endpointIndicator.textContent = label;
    endpointIndicator.title = label;
  }
});
const mount = document.querySelector<HTMLElement>('#editor');
if (!mount) throw new Error('Editor mount point is missing.');
const restoredWorkspace = readQueryWorkspace();
const restoredFontSize = readUserFontSize();
const editor = createEditor(mount, {
  ...(restoredWorkspace ? { workspace: restoredWorkspace } : {}),
  onWorkspaceChange: saveQueryWorkspace,
  query: selectQuery,
  prefixesCollapsed: true,
  sparql: { prefixes: extendedPrefixes },
  executor: connection.executor,
  settings: [connection.plugin],
  userLocale: readUserLocale(),
  ...(restoredFontSize !== undefined ? { fontSize: restoredFontSize } : {}),
  onFontSizeChange: saveUserFontSize,
  onLocaleChange: saveUserLocale,
  buttons: [createRunButton()],
  renderers: [
    createTableRenderer({
      loadResource: createResourceLoader(connection.executor),
    }),
    createCardsRenderer(),
    createChartRenderer(),
    createGeoRenderer(),
    createNetworkRenderer(),
    createTimelineRenderer(),
    createPivotRenderer(),
    createBooleanRenderer(),
    createJsonRenderer(),
  ].map((renderer) => ({
    ...renderer,
    documentationUrl: `./plugins.html#${renderer.id}`,
  })),
});

function loadExampleQuery(query: string, endpoint: string | null): void {
  connection.setEndpoint(endpoint ?? '', 'GET');
  editor.setQuery(endpoint ? `# sparql-endpoint=${endpoint}\n${query}` : query);
  editor.setPrefixesCollapsed(true);
}

// The public demo opts into menus through the runtime API; library defaults stay inline.
const menuBar = editor.getToolBar();
const queryExamples = menuBar.addButtonGroup({
  id: 'examples',
  dropdownWidth: 300,
  icon: createSvgIcon([
    'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zM12 5v15',
  ]),
  type: buttonGroupTypes.dropdown,
  label: { en: 'Examples', nl: 'Voorbeelden' },
});
queryExamples.addButton({
  id: 'example-select',
  label: { en: 'SELECT example', nl: 'SELECT-voorbeeld' },
  execute() {
    loadExampleQuery(selectQuery, null);
  },
});
queryExamples.addButton({
  id: 'example-construct',
  label: { en: 'CONSTRUCT example', nl: 'CONSTRUCT-voorbeeld' },
  execute() {
    loadExampleQuery(
      'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o } LIMIT 10',
      null,
    );
  },
});
queryExamples.addButton({
  id: 'example-ask',
  label: { en: 'ASK example', nl: 'ASK-voorbeeld' },
  execute() {
    loadExampleQuery('ASK { ?subject ?predicate ?object }', null);
  },
});
queryExamples.addButton({
  id: 'example-describe',
  label: { en: 'DESCRIBE example', nl: 'DESCRIBE-voorbeeld' },
  execute() {
    loadExampleQuery('DESCRIBE <https://n2t.net/ark:/72166/dataset>', null);
  },
});
queryExamples.addButton({
  id: 'example-table-publishers',
  label: { en: 'Dataset publishers (table)', nl: 'Datasetuitgevers (tabel)' },
  execute() {
    connection.setEndpoint(
      'https://datasetregister.netwerkdigitaalerfgoed.nl/sparql',
      'GET',
    );
    editor.setQuery(publishersTableQuery);
    editor.setPrefixesCollapsed(true);
  },
});
queryExamples.addButton({
  id: 'example-cards',
  label: { en: 'Gallery', nl: 'Kattenplaatjes (gallery)' },
  execute() {
    loadExampleQuery(cardsQuery, 'https://query.wikidata.org/sparql');
  },
});
queryExamples.addButton({
  id: 'example-geo',
  label: {
    en: 'Castles in the Netherlands (Geo)',
    nl: 'Kastelen in Nederland (Geo)',
  },
  execute() {
    loadExampleQuery(
      `# view=geo; geo-title=Kastelen in Noord-Holland
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>

SELECT ?place ?geometryLabel ?geoDescription ?geoImage ?geometry ?geoLink WHERE {
  ?place wdt:P31 wd:Q23413 ;
         wdt:P17 wd:Q55 ;
         wdt:P131+ wd:Q701 ;
         wdt:P625 ?geometry ;
         wdt:P18 ?image .

  ?geoLink schema:about ?place ;
           schema:isPartOf <https://nl.wikipedia.org/> .

  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "nl,en" .
    ?place rdfs:label ?geometryLabel ;
           schema:description ?geoDescription .
  }

  BIND(IRI(CONCAT(REPLACE(STR(?image), "^http:", "https:"), "?width=480")) AS ?geoImage)
}
LIMIT 250`,
      'https://query.wikidata.org/sparql',
    );
  },
});
queryExamples.addButton({
  id: 'example-palace',
  label: { en: 'Paleis het Loo (Geo 3D)', nl: 'Paleis het Loo (Geo 3D)' },
  execute() {
    loadExampleQuery(
      `# view=geo; mode=3d; geo-title=Paleis het Loo
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX osmt: <https://data.osm.pldn.nl/wiki/Key:>
SELECT * WHERE {
  ?gebouw osmt:building ?building .
  ?gebouw skos:prefLabel ?geometryLabel .
  ?gebouw geo:hasGeometry/geo:asWKT ?geometry .
  BIND(10 AS ?geometryHeight)
  FILTER(?geometryLabel = "Paleis het Loo")
}`,
      'https://api.triplydb.com/datasets/osm/osm/services/osm/sparql',
    );
  },
});
queryExamples.addButton({
  id: 'example-charts',
  label: {
    en: 'Top 10 largest cities (bar chart)',
    nl: 'Top 10 grootste steden (staafdiagram)',
  },
  execute() {
    loadExampleQuery(chartQuery, 'https://query.wikidata.org/sparql');
  },
});

queryExamples.addButton({
  id: 'example-art-movements',
  label: {
    en: 'Art movements in Dutch collections (pie chart)',
    nl: 'Kunststromingen in Nederlandse collecties (taartdiagram)',
  },
  execute() {
    loadExampleQuery(artMovementsQuery, 'https://query.wikidata.org/sparql');
  },
});

queryExamples.addButton({
  id: 'example-network',
  label: {
    en: 'Dutch painters and their connections (network)',
    nl: 'Nederlandse schilders en hun relaties (netwerk)',
  },
  execute() {
    loadExampleQuery(artistsNetworkQuery, 'https://query.wikidata.org/sparql');
  },
});
queryExamples.addButton({
  id: 'example-timeline',
  label: {
    en: 'Lives of Dutch painters (timeline)',
    nl: 'Levens van Nederlandse schilders (tijdlijn)',
  },
  execute() {
    loadExampleQuery(
      paintersTimelineQuery,
      'https://query.wikidata.org/sparql',
    );
  },
});
queryExamples.addButton({
  id: 'example-pivot',
  label: {
    en: 'Art movements by collection (pivot)',
    nl: 'Kunststromingen per collectie (draaitabel)',
  },
  execute() {
    loadExampleQuery(paintingsPivotQuery, 'https://query.wikidata.org/sparql');
  },
});
queryExamples.addSeparator('example-table-publishers');

if (import.meta.hot) import.meta.hot.dispose(() => editor.destroy());

mountSiteChrome();
