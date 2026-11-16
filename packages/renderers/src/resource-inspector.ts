import { createSvgIcon } from '@ldforge/core';
import type { BindingTerm, QueryExecutor, QueryResult } from '@ldforge/core';

export type ResourceLoader = (
  iri: string,
  signal: AbortSignal,
) => Promise<QueryResult>;
export interface ResourceInspectorOptions {
  readonly locale?: 'en' | 'nl';
  readonly graph?: Extract<QueryResult, { kind: 'graph' }>;
  readonly loadResource?: ResourceLoader;
  readonly onClose?: (restoreFocus: boolean) => void;
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
    'margin-top:16px;border:1px solid var(--ldforge-border,#d9e3df);border-radius:12px;background:#fff;color:#263e37;box-shadow:0 4px 18px #183d2910;overflow-wrap:anywhere;font-size:13px;line-height:1.6;scroll-margin:16px';
  let controller: AbortController | undefined;
  let disposed = false;
  let origin: HTMLElement | null = null;
  function close(restoreFocus = true) {
    controller?.abort();
    element.hidden = true;
    if (restoreFocus) origin?.focus({ preventScroll: true });
    options.onClose?.(restoreFocus);
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
    const header = doc.createElement('div');
    header.style.cssText =
      'display:flex;align-items:flex-start;gap:16px;padding:18px 20px;border-bottom:1px solid var(--ldforge-border,#d9e3df);background:#f5f8f6;border-radius:12px 12px 0 0';
    const title = doc.createElement('div');
    title.style.cssText = 'flex:1;min-width:0';
    const eyebrow = doc.createElement('div');
    eyebrow.textContent = nl ? 'Resource verkennen' : 'Resource inspector';
    eyebrow.style.cssText =
      'font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#647a71;margin-bottom:4px';
    const heading = doc.createElement('h3');
    heading.textContent = term.value;
    heading.style.cssText =
      'font-size:14px;font-weight:600;line-height:1.6;margin:0;overflow-wrap:anywhere';
    const closeButton = doc.createElement('button');
    closeButton.type = 'button';
    closeButton.style.cssText =
      'display:inline-flex;align-items:center;justify-content:center;flex:0 0 30px;width:30px;height:30px;padding:5px;border:1px solid var(--ldforge-border,#d9e3df);border-radius:6px;background:#fff;color:inherit;cursor:pointer';
    closeButton.setAttribute('aria-label', nl ? 'Sluiten' : 'Close');
    closeButton.title = nl ? 'Sluiten' : 'Close';
    closeButton.append(createSvgIcon(['M6 6l12 12M6 18 18 6'])(doc));
    closeButton.onclick = () => close();
    const content = doc.createElement('div');
    content.setAttribute('role', 'status');
    content.style.cssText = 'padding:4px 20px 16px';
    content.textContent = nl ? 'Laden…' : 'Loading…';
    title.append(eyebrow, heading);
    header.append(title, closeButton);
    element.replaceChildren(header, content);
    if (/^https?:\/\//i.test(term.value)) {
      const link = doc.createElement('a');
      link.href = term.value;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = nl ? 'Open resource' : 'Open resource';
      link.style.cssText =
        'display:inline-flex;align-items:center;gap:5px;margin-top:8px;font-size:12px;font-weight:500;color:#216b50;text-decoration:underline;text-underline-offset:3px';
      link.append(createSvgIcon(['M14 3h7v7M21 3l-9 9M10 3H3v18h18v-7'])(doc));
      title.append(link);
    }
    element.focus({ preventScroll: true });
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
      list.style.cssText = 'margin:0';
      for (const triple of triples) {
        const incoming = triple.subject.value !== term.value;
        const row = doc.createElement('div');
        row.style.cssText =
          'display:flex;flex-wrap:wrap;gap:6px 20px;padding:14px 0;border-bottom:1px solid var(--ldforge-border,#e4ebe7)';
        const name = doc.createElement('dt');
        name.style.cssText =
          'flex:1 1 180px;min-width:0;font-size:12px;font-weight:500;color:#647a71';
        name.textContent = `${incoming ? '← ' : ''}${triple.predicate.value}`;
        const value = incoming ? triple.subject : triple.object;
        const description = doc.createElement('dd');
        description.style.cssText =
          'flex:2 1 260px;min-width:0;margin:0;white-space:pre-wrap';
        if (value.type === 'uri') {
          const button = doc.createElement('button');
          button.type = 'button';
          button.style.cssText =
            'padding:0;border:0;border-radius:2px;background:transparent;color:#216b50;font:inherit;text-align:left;text-decoration:underline;text-underline-offset:3px;white-space:normal;max-width:100%;cursor:pointer';
          button.textContent = value.value;
          button.style.overflowWrap = 'anywhere';
          button.onclick = () => {
            void open(value);
          };
          description.append(button);
        } else description.textContent = value.value;
        description.title = value['xml:lang'] ?? value.datatype ?? value.type;
        row.append(name, description);
        list.append(row);
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
