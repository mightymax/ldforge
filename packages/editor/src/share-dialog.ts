import { createSvgIcon, isGraphQuery, type Locale } from '@ldforge/core';
import { validateShortUrl } from './share.js';

export interface ShareSnapshot {
  query: string;
  sharedQuery: string;
  fullUrl: string;
  endpoint?: string | undefined;
  isCurrent(): boolean;
}

export function requestExamples(query: string, endpoint: string) {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Expected an HTTP(S) endpoint.');
  // Connection headers are never read. Remove embedded credentials as well.
  url.username = '';
  url.password = '';
  for (const key of [...url.searchParams.keys()]) {
    if (
      /^(access_token|token|password|authorization|api[_-]?key|secret|signature)$/i.test(
        key,
      )
    )
      url.searchParams.delete(key);
  }
  url.hash = '';
  url.searchParams.delete('query');
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  const accept = isGraphQuery(query)
    ? 'application/n-triples, text/turtle;q=0.9'
    : 'application/sparql-results+json';
  const post = `curl -X POST -H ${quote(`Accept: ${accept}`)} -H 'Content-Type: application/sparql-query' --data-binary ${quote(query)} ${quote(url.href)}`;
  url.searchParams.set('query', query);
  return {
    getUrl: url.href,
    post,
    get: `curl -H ${quote(`Accept: ${accept}`)} ${quote(url.href)}`,
  };
}

/** Remove comments and compact whitespace while preserving RDF literal values. */
export function oneLineQuery(query: string): {
  value: string;
  fallback: boolean;
} {
  let value = '';
  for (let index = 0; index < query.length;) {
    const char = query[index] ?? '';
    const iri =
      char === '<' ? /^<[^<>\s]*>/.exec(query.slice(index))?.[0] : undefined;
    if (iri) {
      value += iri;
      index += iri.length;
    } else if (char === '#') {
      while (index < query.length && !/[\r\n]/.test(query[index] ?? ''))
        index++;
      value += ' ';
    } else if (char === '"' || char === "'") {
      const long = query.slice(index, index + 3) === char.repeat(3);
      const delimiter = char.repeat(long ? 3 : 1);
      index += delimiter.length;
      let literal = char;
      let closed = false;
      while (index < query.length) {
        if (query.slice(index, index + delimiter.length) === delimiter) {
          index += delimiter.length;
          closed = true;
          break;
        }
        const next = query[index++] ?? '';
        if (next === '\\') {
          const escaped = query[index++];
          if (escaped === undefined || /[\r\n]/.test(escaped))
            return { value: query, fallback: true };
          literal += next + escaped;
        } else if (!long && /[\r\n]/.test(next))
          return { value: query, fallback: true };
        else if (next === '\n') literal += '\\n';
        else if (next === '\r') literal += '\\r';
        else if (next === char) literal += '\\' + char;
        else literal += next;
      }
      if (!closed) return { value: query, fallback: true };
      value += literal + char;
    } else if (/\s/.test(char)) {
      while (index < query.length && /\s/.test(query[index] ?? '')) index++;
      value += ' ';
    } else {
      value += char;
      index++;
    }
  }
  return { value: value.trim(), fallback: false };
}

export function createShareDialog(host: {
  root: HTMLElement;
  tools: HTMLElement;
  panelId: string;
  visible: boolean;
  getLocale(): Locale;
  snapshot(): ShareSnapshot;
  onOpen(): void;
  shorten?:
    ((url: string, query: string) => string | Promise<string>) | undefined;
  autoRun: boolean;
}) {
  const doc = host.root.ownerDocument;
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ldforge-share-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.append(
    createSvgIcon([
      'M12 16V3m-5 5 5-5 5 5',
      'M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7',
    ])(doc),
  );
  const dialog = doc.createElement('section');
  dialog.hidden = true;
  dialog.setAttribute('role', 'region');
  dialog.id = host.panelId;
  toggle.setAttribute('aria-controls', dialog.id);
  dialog.className = 'ldforge-share-dialog ldforge-tool-panel';
  const header = doc.createElement('div');
  header.className = 'ldforge-share-header';
  const title = doc.createElement('h2');
  const body = doc.createElement('div');
  const refresh = doc.createElement('button');
  refresh.type = 'button';
  header.append(title);
  dialog.append(header, body, refresh);
  host.root.append(dialog);
  if (host.visible) host.tools.append(toggle);
  let generation = 0;
  let disposed = false;
  const feedbackTimers = new Set<ReturnType<typeof setTimeout>>();
  function clearFeedbackTimers() {
    for (const timer of feedbackTimers) clearTimeout(timer);
    feedbackTimers.clear();
  }
  const text = (en: string, nl: string) =>
    host.getLocale() === 'nl' ? nl : en;
  const errorText = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
  function hide(restoreFocus = false) {
    generation++;
    clearFeedbackTimers();
    dialog.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus();
  }
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      hide(true);
    }
  });
  function populate() {
    clearFeedbackTimers();
    const currentGeneration = ++generation;
    const snapshot = host.snapshot();
    body.replaceChildren();
    const current = () => !disposed && generation === currentGeneration;
    const assertCurrent = () => {
      if (!snapshot.isCurrent())
        throw new Error(
          text(
            'The query or connection changed. Refresh the dialog.',
            'De query of verbinding is gewijzigd. Vernieuw het dialoogvenster.',
          ),
        );
    };
    function row(en: string, nl: string, initial: string, note = '') {
      const section = doc.createElement('section');
      section.className = 'ldforge-share-row';
      const label = doc.createElement('label');
      label.textContent = text(en, nl);
      const field = doc.createElement('textarea');
      field.readOnly = true;
      field.rows = 1;
      field.wrap = 'off';
      field.value = initial;
      field.setAttribute('aria-label', text(en, nl));
      const copy = doc.createElement('button');
      copy.type = 'button';
      copy.className = 'ldforge-share-copy';
      const copyLabel = `${text('Copy', 'Kopieer')} ${text(en, nl)}`;
      let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
      function renderCopyIcon(copied: boolean) {
        copy.dataset.copied = String(copied);
        copy.title = copied ? text('Copied', 'Gekopieerd') : copyLabel;
        copy.replaceChildren(
          createSvgIcon(
            copied
              ? ['M5 12l4 4L19 6']
              : [
                  'M9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3',
                  'M9 3h6v4H9z',
                ],
          )(doc),
        );
      }
      renderCopyIcon(false);
      copy.setAttribute(
        'aria-label',
        `${text('Copy', 'Kopieer')} ${text(en, nl)}`,
      );
      const status = doc.createElement('p');
      status.setAttribute('role', 'status');
      status.textContent = note;
      label.append(field);
      section.append(label, copy, status);
      body.append(section);
      copy.disabled = !initial;
      copy.onclick = async () => {
        copy.disabled = true;
        status.classList.remove('ldforge-sr-only');
        status.textContent = note;
        if (feedbackTimer !== undefined) {
          clearTimeout(feedbackTimer);
          feedbackTimers.delete(feedbackTimer);
        }
        renderCopyIcon(false);
        try {
          assertCurrent();
          const clipboard = doc.defaultView?.navigator.clipboard;
          if (!clipboard)
            throw new Error(
              text(
                'Clipboard is not available.',
                'Klembord is niet beschikbaar.',
              ),
            );
          await clipboard.writeText(field.value);
          if (current()) {
            status.classList.add('ldforge-sr-only');
            status.textContent = text('Copied', 'Gekopieerd');
            renderCopyIcon(true);
            feedbackTimer = setTimeout(() => {
              if (feedbackTimer !== undefined)
                feedbackTimers.delete(feedbackTimer);
              if (current()) renderCopyIcon(false);
            }, 1600);
            feedbackTimers.add(feedbackTimer);
          }
        } catch (error) {
          if (current()) status.textContent = errorText(error);
        } finally {
          if (current()) copy.disabled = !field.value;
        }
      };
      return { field, copy, status, section };
    }
    function shortRow(en: string, nl: string, url: string) {
      const entry = row(en, nl, '', text('Shortening…', 'Link verkorten…'));
      entry.section.setAttribute('aria-busy', 'true');
      const retry = doc.createElement('button');
      retry.type = 'button';
      retry.textContent = text('Retry', 'Opnieuw proberen');
      retry.hidden = true;
      entry.section.append(retry);
      async function load() {
        retry.hidden = true;
        entry.status.textContent = text('Shortening…', 'Link verkorten…');
        entry.section.setAttribute('aria-busy', 'true');
        try {
          assertCurrent();
          const value = await host.shorten?.(url, snapshot.sharedQuery);
          if (!current()) return;
          assertCurrent();
          validateShortUrl(value, host.getLocale());
          entry.field.value = value as string;
          entry.copy.disabled = false;
          entry.status.textContent = '';
        } catch (error) {
          if (current()) {
            entry.status.textContent = errorText(error);
            retry.hidden = false;
          }
        } finally {
          if (current()) entry.section.removeAttribute('aria-busy');
        }
      }
      retry.onclick = () => {
        void load();
      };
      void load();
    }
    if (host.shorten) {
      shortRow('Short editor URL', 'Verkorte editor-URL', snapshot.fullUrl);
      if (host.autoRun) {
        const autoUrl = new URL(snapshot.fullUrl);
        autoUrl.searchParams.set('execute', 'true');
        shortRow(
          'Short editor URL — opens and runs query',
          'Verkorte editor-URL — opent en voert query uit',
          autoUrl.href,
        );
      }
    }
    row(
      'URL to this query in the editor',
      'URL naar deze query in de editor',
      snapshot.fullUrl,
    );
    let examples: ReturnType<typeof requestExamples> | undefined;
    let endpointNote = text(
      'Choose a SPARQL endpoint in settings to generate this request.',
      'Kies een SPARQL-endpoint bij de instellingen om dit request te genereren.',
    );
    if (snapshot.endpoint) {
      try {
        examples = requestExamples(snapshot.query, snapshot.endpoint);
      } catch (error) {
        endpointNote = errorText(error);
      }
    }
    for (const [en, nl, value] of [
      ['SPARQL GET request URL', 'SPARQL GET-request-URL', examples?.getUrl],
      [
        'cURL command line for POST request',
        'cURL-opdrachtregel voor POST-request',
        examples?.post,
      ],
      ['cURL GET command', 'cURL GET-commando', examples?.get],
    ]) {
      const entry = row(en ?? '', nl ?? '', value ?? '');
      if (!value) {
        entry.field.placeholder = endpointNote;
        entry.field.setAttribute('aria-disabled', 'true');
      }
    }
    const oneLine = oneLineQuery(snapshot.query);
    const queryRow = row(
      oneLine.fallback ? 'Original query' : 'Unescaped query on one line',
      oneLine.fallback ? 'Originele query' : 'Ongeëscapete query op één regel',
      oneLine.value,
      oneLine.fallback
        ? text(
            'Incomplete literal: original query retained.',
            'Onvolledige literal: originele query behouden.',
          )
        : '',
    );
    if (!oneLine.fallback) {
      queryRow.field.wrap = 'off';
      queryRow.field.rows = 1;
    }
  }
  refresh.onclick = populate;
  function refreshLocale() {
    const label = text('Share your query', 'Deel je query');
    title.textContent = label;
    toggle.title = label;
    toggle.setAttribute('aria-label', label);
    dialog.setAttribute('aria-label', label);
    refresh.textContent = text('Refresh values', 'Waarden vernieuwen');
    if (!dialog.hidden) populate();
  }
  toggle.onclick = () => {
    if (!dialog.hidden) {
      hide(true);
      return;
    }
    host.onOpen();
    refreshLocale();
    populate();
    dialog.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    dialog.querySelector<HTMLElement>('textarea, button')?.focus();
  };
  refreshLocale();
  return {
    panel: dialog,
    close: hide,
    refreshLocale,
    destroy() {
      disposed = true;
      clearFeedbackTimers();
      generation++;
      dialog.remove();
      toggle.remove();
    },
  };
}
