import type { Locale } from '@ldforge/core';

const en = {
  saved: 'Saved endpoints',
  addEndpoint: 'Add endpoint',
  editEndpoint: 'Edit endpoint',
  newEndpoint: 'New endpoint',
  saveEndpoint: 'Save endpoint',
  cancel: 'Cancel',
  active: 'Active',
  savedStatus: 'Endpoint saved. Select it to use it.',
  duplicateEndpoint:
    'This endpoint is already saved. Edit the existing entry instead.',
  historyHelp:
    'Select an endpoint to use it, or edit its connection settings. URLs and methods are saved in this browser.',
  endpoint: 'SPARQL endpoint',
  placeholder: 'https://example.org/sparql',
  apply: 'Apply endpoint',
  requestOptions: 'Request options',
  method: 'Request method',
  methodHelp:
    'POST sends the query in the request body. GET sends it as a query parameter in the URL.',
  extraHeaders: 'Extra headers',
  addHeader: 'Add header',
  headerName: 'Header name',
  headerValue: 'Header value',
  remove: 'Remove header',
  headerHelp:
    'For example, Authorization with a Bearer token. Header values stay in memory for this page only and are never saved in browser storage. Each endpoint has its own headers. Accept and Content-Type are managed by LDForge; your endpoint must allow extra headers through CORS.',
  applyHelp:
    'Save your settings, then select the endpoint to use it. Changes to the active endpoint take effect when saved.',
  choose: 'Choose a saved endpoint',
  fixtureChoice: 'Local fixture (no endpoint)',
  fixtureStatus:
    'Fixture mode: SELECT returns three sample cities; queries with card bindings return three sample cards; chart bindings return three example values; CONSTRUCT/DESCRIBE return three example triples; ASK returns true. No network requests.',
  liveStatus:
    'Live endpoint: {endpoint} ({method}). SELECT, ASK, CONSTRUCT and DESCRIBE supported; endpoint must allow CORS.',
  storageUnavailable:
    'Browser storage is unavailable; saved endpoints will last for this session only.',
  missingName: 'Enter a name for each header.',
  reservedHeader: 'Accept and Content-Type are managed by LDForge.',
  duplicateHeader: 'Duplicate header: {name}',
};
const nl: Record<keyof typeof en, string> = {
  saved: 'Opgeslagen endpoints',
  addEndpoint: 'Endpoint toevoegen',
  editEndpoint: 'Endpoint bewerken',
  newEndpoint: 'Nieuw endpoint',
  saveEndpoint: 'Endpoint opslaan',
  cancel: 'Annuleren',
  active: 'Actief',
  savedStatus: 'Endpoint opgeslagen. Selecteer het om het te gebruiken.',
  duplicateEndpoint:
    'Dit endpoint is al opgeslagen. Bewerk het bestaande endpoint.',
  historyHelp:
    'Selecteer een endpoint om het te gebruiken, of bewerk de verbindingsinstellingen. URL’s en methoden worden in deze browser bewaard.',
  endpoint: 'SPARQL-endpoint',
  placeholder: 'https://example.org/sparql',
  apply: 'Endpoint toepassen',
  requestOptions: 'Requestinstellingen',
  method: 'Requestmethode',
  methodHelp:
    'POST verstuurt de query in de requestbody. GET verstuurt de query als parameter in de URL.',
  extraHeaders: 'Extra headers',
  addHeader: 'Header toevoegen',
  headerName: 'Headernaam',
  headerValue: 'Headerwaarde',
  remove: 'Header verwijderen',
  headerHelp:
    'Bijvoorbeeld Authorization met een Bearer-token. Headerwaarden blijven alleen in het geheugen van deze pagina en worden nooit in browseropslag bewaard. Elk endpoint heeft eigen headers. LDForge beheert Accept en Content-Type; je endpoint moet extra headers toestaan via CORS.',
  applyHelp:
    'Sla de instellingen op en selecteer daarna het endpoint. Wijzigingen aan het actieve endpoint worden bij opslaan toegepast.',
  choose: 'Kies een opgeslagen endpoint',
  fixtureChoice: 'Lokale voorbeelddata (geen endpoint)',
  fixtureStatus:
    'Voorbeeldmodus: SELECT geeft drie voorbeeldsteden; queries met card-bindings geven drie voorbeeldkaarten; grafiekbindings geven drie voorbeeldwaarden; CONSTRUCT/DESCRIBE geven drie voorbeeldtriples; ASK geeft waar. Er worden geen netwerkrequests gedaan.',
  liveStatus:
    'Actief endpoint: {endpoint} ({method}). SELECT, ASK, CONSTRUCT en DESCRIBE worden ondersteund; het endpoint moet CORS toestaan.',
  storageUnavailable:
    'Browseropslag is niet beschikbaar; opgeslagen endpoints blijven alleen tijdens deze sessie beschikbaar.',
  missingName: 'Vul voor elke header een naam in.',
  reservedHeader: 'LDForge beheert Accept en Content-Type.',
  duplicateHeader: 'Dubbele header: {name}',
};
export type EndpointMessage = keyof typeof en;
export function endpointText(
  locale: Locale,
  key: EndpointMessage,
  values: Readonly<Record<string, string>> = {},
): string {
  return { en, nl }[locale][key].replace(
    /\{(\w+)\}/g,
    (placeholder: string, key: string) => values[key] ?? placeholder,
  );
}
