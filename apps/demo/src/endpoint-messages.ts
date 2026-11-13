import type { Locale } from '@ldforge/core';

const en = {
  saved: 'Saved endpoints',
  historyHelp:
    'Applied endpoints and methods are remembered in this browser. Choosing one applies it immediately.',
  endpoint: 'SPARQL endpoint',
  placeholder: 'Leave empty to use the local fixture',
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
  applyHelp: 'Select Apply endpoint to use these settings.',
  choose: 'Choose a saved endpoint',
  fixtureChoice: 'Local fixture (no endpoint)',
  fixtureStatus:
    'Fixture mode: SELECT returns three sample cities; ASK returns true. No network requests.',
  liveStatus:
    'Live endpoint: {endpoint} ({method}). SELECT and ASK supported; endpoint must allow CORS.',
  storageUnavailable:
    'Browser storage is unavailable; saved endpoints will last for this session only.',
  missingName: 'Enter a name for each header.',
  reservedHeader: 'Accept and Content-Type are managed by LDForge.',
  duplicateHeader: 'Duplicate header: {name}',
};
const nl: Record<keyof typeof en, string> = {
  saved: 'Opgeslagen endpoints',
  historyHelp:
    'Gebruikte endpoints en methoden worden in deze browser bewaard. Een keuze wordt direct toegepast.',
  endpoint: 'SPARQL-endpoint',
  placeholder: 'Laat leeg voor de lokale voorbeelddata',
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
  applyHelp: 'Kies Endpoint toepassen om deze instellingen te gebruiken.',
  choose: 'Kies een opgeslagen endpoint',
  fixtureChoice: 'Lokale voorbeelddata (geen endpoint)',
  fixtureStatus:
    'Voorbeeldmodus: SELECT geeft drie voorbeeldsteden; ASK geeft waar. Er worden geen netwerkrequests gedaan.',
  liveStatus:
    'Actief endpoint: {endpoint} ({method}). SELECT en ASK worden ondersteund; het endpoint moet CORS toestaan.',
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
