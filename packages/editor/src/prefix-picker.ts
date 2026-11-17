import type { EditorView } from '@codemirror/view';
import type { Locale } from '@ldforge/core';
import { translate, createSvgIcon } from '@ldforge/core';
import { maintainPrefixes } from './sparql/prefix-maintenance.js';
import { addPrefix } from './sparql/completion.js';

export function createPrefixPicker(
  view: EditorView,
  catalog: Readonly<Record<string, string>>,
  locale: () => Locale,
  onOpen: () => void,
) {
  const doc = view.dom.ownerDocument;
  const group = doc.createElement('div');
  group.className = 'ldforge-button-group';
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  group.append(toggle);
  const panel = doc.createElement('section');
  panel.className = 'ldforge-prefix-picker ldforge-tool-panel';
  panel.hidden = true;
  const label = doc.createElement('label');
  const labelText = doc.createElement('span');
  const search = doc.createElement('input');
  search.type = 'search';
  search.autocomplete = 'off';
  label.append(labelText, search);
  const list = doc.createElement('ul');
  const status = doc.createElement('p');
  status.setAttribute('role', 'status');
  const actions = doc.createElement('div');
  actions.className = 'ldforge-prefix-actions';
  const addMissing = doc.createElement('button');
  const removeUnused = doc.createElement('button');
  for (const button of [addMissing, removeUnused]) button.type = 'button';
  actions.append(addMissing, removeUnused);
  panel.append(actions, label, list, status);
  function maintain(action: 'add' | 'remove') {
    const result = maintainPrefixes(view, catalog, action);
    const nl = locale() === 'nl';
    status.textContent =
      action === 'remove' && result.incomplete
        ? nl
          ? 'Herstel eerst de syntaxfouten om prefixes veilig te verwijderen.'
          : 'Fix syntax errors before removing unused prefixes safely.'
        : action === 'add'
          ? nl
            ? `${result.count} ontbrekende prefixes toegevoegd.`
            : `Added ${result.count} missing prefixes.`
          : nl
            ? `${result.count} ongebruikte prefixes verwijderd.`
            : `Removed ${result.count} unused prefixes.`;
    if (action === 'add' && result.unknown.length)
      status.textContent += nl
        ? ` Niet in de catalogus: ${result.unknown.map((prefix) => prefix + ':').join(', ')}.`
        : ` Not in the catalog: ${result.unknown.map((prefix) => prefix + ':').join(', ')}.`;
  }
  addMissing.onclick = () => maintain('add');
  removeUnused.onclick = () => maintain('remove');

  function render(): void {
    const query = search.value.trim().toLowerCase();
    const entries = Object.entries(catalog).filter(([prefix, iri]) =>
      `${prefix} ${iri}`.toLowerCase().includes(query),
    );
    list.replaceChildren();
    for (const [prefix, iri] of entries.slice(0, 50)) {
      const item = doc.createElement('li');
      const button = doc.createElement('button');
      button.type = 'button';
      button.setAttribute(
        'aria-label',
        translate(locale(), 'prefixAdd', { prefix }),
      );
      const name = doc.createElement('strong');
      name.textContent = `${prefix}:`;
      const namespace = doc.createElement('span');
      namespace.textContent = iri;
      button.append(name, namespace);
      button.addEventListener('click', () => {
        const inserted = addPrefix(view, prefix, iri);
        status.textContent = translate(locale(), 'prefixAdded', {
          prefix: inserted,
        });
        search.focus();
      });
      item.append(button);
      list.append(item);
    }
    status.textContent = translate(
      locale(),
      entries.length > 50
        ? 'prefixCountLimited'
        : entries.length
          ? 'prefixCount'
          : 'prefixNone',
      { shown: 50, count: entries.length },
    );
  }
  function close(): void {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
  toggle.addEventListener('click', () => {
    if (!panel.hidden) {
      close();
      return;
    }
    onOpen();
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    render();
    search.focus();
  });
  search.addEventListener('input', render);
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      toggle.focus();
    }
  });
  function refreshLocale(): void {
    toggle.title = translate(locale(), 'prefixes');
    toggle.setAttribute('aria-label', translate(locale(), 'prefixes'));
    toggle.innerHTML =
      '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 5H5v14h3M16 5h3v14h-3M9 9h6M9 13h6M9 17h4"/></svg>';
    const nl = locale() === 'nl';
    addMissing.replaceChildren(
      createSvgIcon(['M12 5v14m-7-7h14'])(doc),
      doc.createTextNode(
        nl ? 'Voeg missende prefixes toe' : 'Add missing prefixes',
      ),
    );
    removeUnused.replaceChildren(
      createSvgIcon(['M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5'])(doc),
      doc.createTextNode(
        nl ? 'Verwijder ongebruikte prefixes' : 'Remove unused prefixes',
      ),
    );
    labelText.textContent = translate(locale(), 'prefixSearch');
    search.placeholder = translate(locale(), 'prefixSearchHint');
    if (!panel.hidden) render();
  }
  return { group, panel, toggle, close, refreshLocale };
}
