export const publishersTableQuery = `# view=table
# sparql-endpoint=https://datasetregister.netwerkdigitaalerfgoed.nl/sparql
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX schema: <https://schema.org/>

select ?publisher
       (sample(?pn) as ?publisherName)
       (sample(?dataset) as ?exampleDataset)
       (sample(?t) as ?exampleTitle)
       (count(distinct ?dataset) as ?datasetCount)
where {
  ?dataset a dcat:Dataset ;
    schema:subjectOf ?registration ;
    dct:title ?t ;
    dct:publisher ?publisher .

  ?registration schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .

  ?publisher foaf:name ?pn .
}
group by ?publisher
order by desc(?datasetCount)
limit 100`;

export const artistsNetworkQuery = `# view=network; network-title=Nederlandse schilders, leermeesters en kunststromingen
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?source ?sourceLabel ?target ?targetLabel ?relationLabel ?sourceGroup ?targetGroup WHERE {
  {
    SELECT DISTINCT ?source ?target ?relationLabel ?targetGroup WHERE {
      VALUES ?country { wd:Q55 wd:Q29999 }
      ?source wdt:P27 ?country ;
              wdt:P106/wdt:P279* wd:Q1028181 .
      {
        ?source wdt:P135 ?target .
        BIND("kunststroming" AS ?relationLabel)
        BIND("Kunststroming" AS ?targetGroup)
      }
      UNION
      {
        ?source wdt:P1066 ?target .
        BIND("leermeester" AS ?relationLabel)
        BIND("Kunstenaar" AS ?targetGroup)
      }
    }
    LIMIT 75
  }
  BIND("Kunstenaar" AS ?sourceGroup)
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "nl,en" .
    ?source rdfs:label ?sourceLabel .
    ?target rdfs:label ?targetLabel .
  }
}`;

export const paintersTimelineQuery = `# view=timeline; timeline-title=Levens van Nederlandse schilders
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>

SELECT ?timelineLabel ?timelineStart ?timelineEnd ?timelineGroup ?timelineDescription ?timelineImage (?person AS ?timelineLink) WHERE {
  {
    SELECT ?person (MIN(?birth) AS ?timelineStart) (MAX(?death) AS ?timelineEnd) (SAMPLE(?portrait) AS ?photo) WHERE {
      VALUES ?country { wd:Q55 wd:Q29999 }
      ?person wdt:P31 wd:Q5 ;
              wdt:P27 ?country ;
              wdt:P106 wd:Q1028181 ;
              wdt:P569 ?birth ;
              wdt:P570 ?death ;
              wdt:P18 ?portrait ;
              wikibase:sitelinks ?sitelinks .
      FILTER(?sitelinks >= 30)
    }
    GROUP BY ?person
    ORDER BY DESC(MAX(?sitelinks))
    LIMIT 35
  }
  BIND(IRI(CONCAT(REPLACE(STR(?photo), "^http:", "https:"), "?width=320")) AS ?timelineImage)
  BIND("Schilders" AS ?timelineGroup)
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "nl,en" .
    ?person rdfs:label ?timelineLabel ;
            schema:description ?timelineDescription .
  }
}
ORDER BY ?timelineStart`;

export const paintingsPivotQuery = `# view=pivot; pivot-title=Schilderijen per kunststroming en collectie; pivot-aggregate=sum; pivot-row-title=Kunststroming; pivot-column-title=Collectie
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?pivotRow ?pivotColumn ?pivotValue WHERE {
  {
    SELECT ?movement ?collection (COUNT(DISTINCT ?painting) AS ?pivotValue) WHERE {
      # Rijksmuseum, Van Gogh Museum, Mauritshuis
      VALUES ?collection { wd:Q190804 wd:Q224124 wd:Q221092 }
      ?painting wdt:P31 wd:Q3305213 ;
                wdt:P135 ?movement ;
                wdt:P195 ?collection .
    }
    GROUP BY ?movement ?collection
  }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "nl,en" .
    ?movement rdfs:label ?pivotRow .
    ?collection rdfs:label ?pivotColumn .
  }
}
ORDER BY ?pivotRow ?pivotColumn`;
