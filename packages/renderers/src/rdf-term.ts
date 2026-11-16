import type { BindingTerm } from '@ldforge/core';

function iri(value: string): string {
  const escaped = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 0x20 || '<>"{}|^`\\'.includes(character)
      ? `\\u${code.toString(16).padStart(4, '0')}`
      : character;
  }).join('');
  return `<${escaped}>`;
}

/** Display notation only: retain endpoint lexical values without numeric/date conversion. */
export function formatRdfTerm(term: BindingTerm | undefined): string {
  if (!term) return '';
  if (term.type === 'uri') return iri(term.value);
  if (term.type === 'bnode')
    return term.value.startsWith('_:') ? term.value : `_:${term.value}`;
  const value = JSON.stringify(term.value);
  if (term['xml:lang']) return `${value}@${term['xml:lang']}`;
  if (!term.datatype) return value;
  const namespaces = [
    ['http://www.w3.org/2001/XMLSchema#', 'xsd:'],
    ['http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'rdf:'],
  ] as const;
  for (const [namespace, prefix] of namespaces) {
    const local = term.datatype.startsWith(namespace)
      ? term.datatype.slice(namespace.length)
      : '';
    if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(local))
      return `${value}^^${prefix}${local}`;
  }
  return `${value}^^${iri(term.datatype)}`;
}
