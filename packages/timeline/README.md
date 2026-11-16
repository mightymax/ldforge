# @ldforge/timeline

**Package:** `@ldforge/timeline` (optional) · **Factory:** `createTimelineRenderer(options?)` · **ID:** `timeline`

Interactive dated points and ranges with vis-timeline 8.5.6, downloaded only when
the Timeline tab opens. Supports grouping, dragging through time, Ctrl + scroll
to zoom, explicit zoom buttons and a Fit action. Large overlapping sets can be
scrolled vertically. Events are read-only; dragging does not edit source data.

```ts
import { createTimelineRenderer } from '@ldforge/timeline';
const renderers = [createTableRenderer(), createTimelineRenderer()];
```

| Binding                | Required | Meaning                                                                                             |
| ---------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `?timelineLabel`       | Yes      | Nonempty plain-text event label.                                                                    |
| `?timelineStart`       | Yes      | Literal ISO year, year-month, calendar date, or timezone-qualified dateTime.                        |
| `?timelineEnd`         | No       | Same format; makes a range. Must not precede the start.                                             |
| `?timelineGroup`       | No       | Row/group name. Mixed grouped/ungrouped events use an Other row.                                    |
| `?timelineLink`        | No       | Absolute HTTP(S) URL on the label, opened with `noopener noreferrer`.                               |
| `?timelineDescription` | No       | Plain-text details shown on selection.                                                              |
| `?timelineImage`       | No       | Absolute HTTP(S) image URI or URL literal. Thumbnail on the timeline and larger image on selection. |

Use `# view=timeline; timeline-title=My timeline`. `buildTimelineModel` and
`parseTimelineDate` are exported for hosts that need to inspect normalized data.
Years/months start on January 1/the first of the month, at midnight UTC. Full
calendar dates and dateTimes are validated (including leap days); ambiguous locale
formats and reversed ranges report their row. Signed extended years and Wikidata's
leading plus are accepted. No imprecise year/month value is silently treated as an
exact source date: the display uses the first day of the given period. The example
uses available Wikidata date literals; date precision/uncertainty qualifiers are
not modeled. The fallback Timeline data table formats dates in UTC and remains
available during loading or failure. All labels/descriptions/group names use DOM
text; query values are never executable HTML.

Options: `libraryUrl` defaults to
`https://cdn.jsdelivr.net/npm/vis-timeline@8.5.6/standalone/esm/vis-timeline-graph2d.min.mjs`;
`stylesheetUrl` defaults to the same version's `styles/vis-timeline-graph2d.min.css`
(or `false` for host-supplied CSS). `loadLibrary` overrides the JS loader and must
export `Timeline` following `TimelineConstructor`/`TimelineHandle`. Library and CSS
failures can be retried, stale loads are discarded, and cleanup destroys the view.
vis-timeline is dual Apache-2.0/MIT licensed. Standalone builds own their internal
DataSets: these plugins pass plain arrays and do not exchange DataSet instances.

### Lives of Dutch painters example

Public endpoint: `https://query.wikidata.org/sparql` (GET). Up to 35 deceased
painters with a Wikidata image and at least 30 sitelinks, ranked by sitelinks, with birth/death ranges
and links. MIN/MAX collapse repeated birth/death statements per person; this is a
data demonstration, not an assessment of conflicting historical dates. Citizenship
includes the Netherlands and Kingdom of the Netherlands. Names/descriptions prefer
Dutch and fall back to English.

```sparql
# view=timeline; timeline-title=Levens van Nederlandse schilders
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
ORDER BY ?timelineStart
```

LDForge is MIT; the external visualization library retains its own license.

Timeline images load lazily, use no-referrer, and disappear on image errors. Unsafe or invalid image URLs are omitted without dropping events. The example samples one portrait per painter and requests a Commons thumbnail.
