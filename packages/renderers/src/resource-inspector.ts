import type { BindingTerm, QueryExecutor, QueryResult } from '@ldforge/core';

export type ResourceLoader = (
  iri: string,
  signal: AbortSignal,
) => Promise<QueryResult>;
export interface ResourceInspectorOptions {
  readonly locale?: 'en' | 'nl';
  readonly graph?: Extract<QueryResult, { kind: 'graph' }>;
  readonly loadResource?: ResourceLoader;
}
/** Uses the host transport, credentials and cancellation; never dereferences arbitrary URLs. */
export function createResourceLoader(executor: QueryExecutor): ResourceLoader {
  return (iri, signal) => {
    if (
      !iri ||
      [...iri].some((character) => character.charCodeAt(0) <= 32) ||
      /[<>"{}|^`\\]/u.test(iri) ||
      !/^[a-z][a-z\d+.-]*:/i.test(iri)
    )
      return Promise.reject(new Error('Invalid resource IRI.'));
    return executor.execute({
      query: `CONSTRUCT { <${iri}> ?p ?o . ?s ?incoming <${iri}> } WHERE { { <${iri}> ?p ?o } UNION { ?s ?incoming <${iri}> } } LIMIT 200`,
      signal,
    });
  };
}
/** A reusable inline panel for tables, cards, networks and maps. */
export function createResourceInspector(
  container: HTMLElement,
  options: ResourceInspectorOptions = {},
) {
  const doc = container.ownerDocument;
  const nl = options.locale === 'nl';
  const element = doc.createElement('section');
  element.className = 'ldforge-resource-inspector';
  element.hidden = true;
  element.setAttribute(
    'aria-label',
    nl ? 'Resource verkennen' : 'Resource inspector',
  );
  element.tabIndex = -1;
  element.style.cssText =
    'padding:12px;border:1px solid currentColor;overflow-wrap:anywhere;font-size:12px;line-height:1.5';
  let controller: AbortController | undefined;
  let disposed = false;
  let origin: HTMLElement | null = null;
  function close() {
    controller?.abort();
    element.hidden = true;
    origin?.focus();
  }
  async function open(term: BindingTerm) {
    if (disposed || term.type !== 'uri') return;
    if (element.hidden)
      origin =
        doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    controller?.abort();
    const current = new AbortController();
    controller = current;
    element.hidden = false;
    const heading = doc.createElement('h3');
    heading.textContent = term.value;
    heading.style.cssText = 'font-size:13px;line-height:1.5;margin:0 0 8px';
    const closeButton = doc.createElement('button');
    closeButton.type = 'button';
    closeButton.style.fontSize = 'inherit';
    closeButton.textContent = nl ? 'Sluiten' : 'Close';
    closeButton.onclick = close;
    const content = doc.createElement('div');
    content.setAttribute('role', 'status');
    content.textContent = nl ? 'Laden…' : 'Loading…';
    element.replaceChildren(heading, closeButton, content);
    if (/^https?:\/\//i.test(term.value)) {
      const link = doc.createElement('a');
      link.href = term.value;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = nl ? 'Open resource' : 'Open resource';
      element.append(link);
    }
    element.focus();
    try {
      const matches = (triple: { subject: BindingTerm; object: BindingTerm }) =>
        (triple.subject.type === 'uri' &&
          triple.subject.value === term.value) ||
        (triple.object.type === 'uri' && triple.object.value === term.value);
      const local = options.graph?.triples.filter(matches);
      const result = local?.length
        ? { kind: 'graph' as const, triples: local }
        : await options.loadResource?.(term.value, current.signal);
      if (disposed || current.signal.aborted) return;
      content.replaceChildren();
      const triples =
        result?.kind === 'graph' ? result.triples.filter(matches) : [];
      if (!triples.length) {
        content.textContent = nl
          ? 'Geen eigenschappen beschikbaar in deze gegevens.'
          : 'No properties available in this data.';
        return;
      }
      const list = doc.createElement('dl');
      for (const triple of triples) {
        const incoming = triple.subject.value !== term.value;
        const name = doc.createElement('dt');
        name.textContent = `${incoming ? '← ' : ''}${triple.predicate.value}`;
        const value = incoming ? triple.subject : triple.object;
        const description = doc.createElement('dd');
        if (value.type === 'uri') {
          const button = doc.createElement('button');
          button.type = 'button';
          button.style.fontSize = 'inherit';
          button.textContent = value.value;
          button.style.overflowWrap = 'anywhere';
          button.onclick = () => {
            void open(value);
          };
          description.append(button);
        } else description.textContent = value.value;
        description.title = value['xml:lang'] ?? value.datatype ?? value.type;
        list.append(name, description);
      }
      content.append(list);
    } catch (error) {
      if (!disposed && !current.signal.aborted)
        content.textContent = `${nl ? 'Laden mislukt' : 'Loading failed'}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  element.onkeydown = (event) => {
    if (event.key === 'Escape') close();
  };
  return {
    element,
    open,
    close,
    destroy() {
      disposed = true;
      controller?.abort();
      element.remove();
    },
  };
}
