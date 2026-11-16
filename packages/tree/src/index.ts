import { createSvgIcon } from '@ldforge/core';
import type { BindingTerm, ResultRendererPlugin } from '@ldforge/core';
import { buildTreeModel } from './model.js';
export { buildTreeModel, treeTermKey, safeTreeUrl } from './model.js';
export type { TreeModel, TreeNode } from './model.js';
export interface TreeRendererOptions {
  readonly title?: string;
  /** Host may forward the original URI term to createResourceInspector().open. */
  readonly onInspect?: (term: BindingTerm) => void;
}
export function createTreeRenderer(
  options: TreeRendererOptions = {},
): ResultRendererPlugin {
  return {
    id: 'tree',
    label: { en: 'Tree', nl: 'Boom' },
    documentationUrl: 'https://ldforge.nl/plugins.html#tree',
    icon: createSvgIcon(['M4 3v14h5M4 7h5M13 5h7v4h-7zM13 15h7v4h-7z']),
    wizard: {
      description: {
        en: 'Browse hierarchical data in an expandable tree.',
        nl: 'Verken hiërarchische gegevens in een uitklapbare boom.',
      },
      bindings: [
        {
          variable: 'tree_id',
          required: true,
          description: {
            en: 'Resource URI or stable literal identifier',
            nl: 'Resource-URI of stabiele letterlijke identificatie',
          },
        },
        {
          variable: 'tree_parent',
          description: {
            en: 'Parent identifier',
            nl: 'Identificatie van ouder',
          },
        },
        {
          variable: 'tree_label',
          description: { en: 'Display label', nl: 'Weergavenaam' },
        },
        {
          variable: 'tree_url',
          description: { en: 'HTTP(S) link', nl: 'HTTP(S)-link' },
        },
      ],
      options: [
        {
          key: 'tree-title',
          label: { en: 'Title', nl: 'Titel' },
          type: 'text',
          defaultValue: '',
        },
      ],
    },
    supports: (result) =>
      result.kind === 'bindings' && result.variables.includes('tree_id'),
    render(container, result, context) {
      const nl = context?.locale === 'nl';
      const title =
        context?.directives?.['tree-title'] ??
        options.title ??
        (nl ? 'Boom' : 'Tree');
      const model = buildTreeModel(result);
      const doc = container.ownerDocument;
      const section = doc.createElement('section');
      section.className = 'ldforge-tree';
      const style = doc.createElement('style');
      style.textContent =
        '.ldforge-tree [role=treeitem][aria-selected=true]{background:rgba(8,127,115,.12)}.ldforge-tree [role=treeitem]:focus-visible{outline:2px solid currentColor;outline-offset:-2px}';
      const heading = doc.createElement('h3');
      heading.textContent = title;
      const status = doc.createElement('p');
      status.setAttribute('role', 'status');
      const d = model.diagnostics;
      status.textContent = nl
        ? `Cycli: ${d.cycles}; ontbrekende ouders: ${d.missingParents}; ongeldige rijen: ${d.invalidRows}.`
        : `Cycles: ${d.cycles}; missing parents: ${d.missingParents}; invalid rows: ${d.invalidRows}.`;
      const tree = doc.createElement('div');
      tree.setAttribute('role', 'tree');
      tree.setAttribute('aria-label', title);
      tree.style.cssText =
        'max-height:520px;overflow:auto;overflow-wrap:anywhere';
      const details = doc.createElement('div');
      const inspect = doc.createElement('button');
      inspect.type = 'button';
      inspect.textContent = nl ? 'Resource verkennen' : 'Inspect resource';
      const link = doc.createElement('a');
      link.textContent = 'Open resource';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      details.append(inspect, ' ', link);
      section.append(style, heading, status, tree, details);
      container.replaceChildren(section);
      const expanded = new Set<string>();
      type Entry = {
        key: string;
        level: number;
        parent: number;
        reference: boolean;
        position: number;
        size: number;
      };
      let visible: Entry[] = [];
      let selected = 0;
      let disposed = false;
      function select(index: number, focus: boolean) {
        selected = index;
        const items = [...tree.children] as HTMLElement[];
        items.forEach((item, i) => {
          item.tabIndex = i === index ? 0 : -1;
          item.setAttribute('aria-selected', String(i === index));
        });
        const node = model.nodes.get(visible[index]?.key ?? '');
        inspect.hidden = !options.onInspect || node?.term.type !== 'uri';
        link.hidden = !node?.url;
        if (node?.url) link.href = node.url;
        else link.removeAttribute('href');
        if (focus) items[index]?.focus();
      }
      function draw(focus = false) {
        visible = [];
        const stack: Entry[] = model.roots
          .map((key, i) => ({
            key,
            level: 1,
            parent: -1,
            reference: false,
            position: i + 1,
            size: model.roots.length,
          }))
          .reverse();
        const fragment = doc.createDocumentFragment();
        while (stack.length) {
          const entry = stack.pop();
          if (!entry) break;
          const index = visible.length;
          visible.push(entry);
          const node = model.nodes.get(entry.key);
          if (!node) continue;
          const branch = !entry.reference && node.children.length > 0;
          const item = doc.createElement('div');
          item.setAttribute('role', 'treeitem');
          item.setAttribute('aria-level', String(entry.level));
          item.setAttribute('aria-posinset', String(entry.position));
          item.setAttribute('aria-setsize', String(entry.size));
          item.dataset.index = String(index);
          item.title = node.term.value;
          item.style.cssText = `padding:6px 8px;padding-inline-start:${8 + Math.min(entry.level - 1, 30) * 18}px;cursor:pointer`;
          if (branch)
            item.setAttribute('aria-expanded', String(expanded.has(entry.key)));
          item.textContent = `${branch ? (expanded.has(entry.key) ? '▾ ' : '▸ ') : ''}${node.label}${entry.reference ? (nl ? ' (verwijzing)' : ' (reference)') : ''}`;
          fragment.append(item);
          if (branch && expanded.has(entry.key))
            for (let i = node.children.length - 1; i >= 0; i--) {
              const key = node.children[i];
              if (key === undefined) continue;
              stack.push({
                key,
                level: entry.level + 1,
                parent: index,
                reference: model.parents.get(key) !== entry.key,
                position: i + 1,
                size: node.children.length,
              });
            }
        }
        tree.replaceChildren(fragment);
        if (!visible.length) {
          tree.textContent = nl
            ? 'Geen boomgegevens om te tonen.'
            : 'No tree data to display.';
          details.hidden = true;
        } else select(Math.min(selected, visible.length - 1), focus);
      }
      function toggle() {
        const entry = visible[selected];
        if (
          !entry ||
          entry.reference ||
          !model.nodes.get(entry.key)?.children.length
        )
          return;
        if (expanded.has(entry.key)) expanded.delete(entry.key);
        else expanded.add(entry.key);
        draw(true);
      }
      function click(event: MouseEvent) {
        const item = (event.target as HTMLElement).closest<HTMLElement>(
          '[data-index]',
        );
        if (!item) return;
        select(Number(item.dataset.index), true);
        toggle();
      }
      function keydown(event: KeyboardEvent) {
        const entry = visible[selected];
        if (!entry) return;
        let next = selected;
        switch (event.key) {
          case 'ArrowDown':
            next = Math.min(selected + 1, visible.length - 1);
            break;
          case 'ArrowUp':
            next = Math.max(selected - 1, 0);
            break;
          case 'Home':
            next = 0;
            break;
          case 'End':
            next = visible.length - 1;
            break;
          case 'ArrowRight':
            if (!entry.reference && !expanded.has(entry.key)) toggle();
            else if (visible[selected + 1]?.parent === selected) next++;
            break;
          case 'ArrowLeft':
            if (!entry.reference && expanded.has(entry.key)) toggle();
            else if (entry.parent >= 0) next = entry.parent;
            break;
          case 'Enter':
          case ' ':
            toggle();
            break;
          default:
            return;
        }
        event.preventDefault();
        select(next, true);
      }
      function inspectResource() {
        const node = model.nodes.get(visible[selected]?.key ?? '');
        if (!disposed && node?.term.type === 'uri')
          options.onInspect?.(node.term);
      }
      tree.addEventListener('click', click);
      tree.addEventListener('keydown', keydown);
      inspect.addEventListener('click', inspectResource);
      draw();
      return () => {
        disposed = true;
        tree.removeEventListener('click', click);
        tree.removeEventListener('keydown', keydown);
        inspect.removeEventListener('click', inspectResource);
        expanded.clear();
      };
    },
  };
}
