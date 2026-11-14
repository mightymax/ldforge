import { createSvgIcon } from '@ldforge/core';
import type { ResultRendererPlugin } from '@ldforge/core';
import { buildNetworkModel, NetworkDataError } from './model.js';
import type { NetworkNode, NetworkEdge } from './model.js';
import { control, lazyLoader, mountLazyView, safeLink } from './runtime.js';
import type { LazyOptions } from './runtime.js';
export { buildNetworkModel, NetworkDataError } from './model.js';
export type { NetworkModel, NetworkNode, NetworkEdge } from './model.js';
export type NetworkRendererOptions = LazyOptions;
export interface NetworkHandle {
  destroy(): void;
  fit(options?: { animation: boolean }): void;
  focus(id: string, options: { scale: number; animation: boolean }): void;
  moveTo(options: { scale: number }): void;
  getScale(): number;
  selectNodes(ids: string[], highlightEdges: boolean): void;
  unselectAll(): void;
  on(event: string, callback: (event: { nodes?: string[] }) => void): void;
}
export interface NetworkConstructor {
  new (
    container: HTMLElement,
    data: { nodes: NetworkNode[]; edges: NetworkEdge[] },
    options: Record<string, unknown>,
  ): NetworkHandle;
}
export const DEFAULT_NETWORK_LIBRARY_URL =
  'https://cdn.jsdelivr.net/npm/vis-network@10.1.5/standalone/esm/vis-network.min.mjs';
const messages = {
  en: {
    label: 'Network',
    loading: 'Loading network…',
    failed: 'Could not load or render the network.',
    retry: 'Retry loading network',
    data: 'Network data',
    empty: 'No network data to display.',
    invalid: 'Invalid network binding at row',
    find: 'Find a node',
    choose: 'Choose a node',
    fit: 'Fit network',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
  },
  nl: {
    label: 'Netwerk',
    loading: 'Netwerk laden…',
    failed: 'Het netwerk kon niet geladen of getoond worden.',
    retry: 'Netwerk opnieuw laden',
    data: 'Netwerkgegevens',
    empty: 'Geen netwerkgegevens om te tonen.',
    invalid: 'Ongeldige netwerkbinding op rij',
    find: 'Zoek een knoop',
    choose: 'Kies een knoop',
    fit: 'Alles tonen',
    zoomIn: 'Inzoomen',
    zoomOut: 'Uitzoomen',
  },
};
export function createNetworkRenderer(
  options: NetworkRendererOptions = {},
): ResultRendererPlugin {
  const load = lazyLoader(
    options,
    DEFAULT_NETWORK_LIBRARY_URL,
    undefined,
    'Network',
  );
  return {
    id: 'network',
    label: { en: 'Network', nl: 'Netwerk' },
    documentationUrl: 'https://ldforge.nl/plugins.html#network',
    icon: createSvgIcon([
      'M8 6l8 5M8 18l8-5M5 8v8',
      'M8 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
      'M8 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
      'M22 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    ]),
    supports: (result) =>
      result.kind === 'bindings' &&
      ['source', 'target'].every((key) => result.variables.includes(key)),
    render(container, result, context) {
      const text = messages[context?.locale ?? 'en'];
      const doc = container.ownerDocument;
      let model;
      try {
        model = buildNetworkModel(result);
      } catch (error) {
        const alert = doc.createElement('p');
        alert.setAttribute('role', 'alert');
        alert.textContent =
          error instanceof NetworkDataError
            ? `${text.invalid} ${error.row}.`
            : text.failed;
        container.replaceChildren(alert);
        return;
      }
      if (!model.edges.length) {
        container.textContent = text.empty;
        return;
      }
      const title = context?.directives?.['network-title'] ?? text.label;
      const list = doc.createElement('ul');
      list.style.overflowWrap = 'anywhere';
      const nodes = new Map(model.nodes.map((node) => [node.id, node]));
      for (const edge of model.edges) {
        const row = doc.createElement('li');
        const source = nodes.get(edge.from);
        const target = nodes.get(edge.to);
        if (source && target)
          row.append(
            safeLink(doc, source.label, source.link),
            ` — ${edge.label || '→'} — `,
            safeLink(doc, target.label, target.link),
          );
        list.append(row);
      }
      return mountLazyView(
        container,
        'network',
        title,
        text,
        list,
        load,
        (module, frame, controls) => {
          const exports = module as {
            Network?: unknown;
            default?: { Network?: unknown };
          } | null;
          const Constructor = exports?.Network ?? exports?.default?.Network;
          if (typeof Constructor !== 'function')
            throw new Error('Expected vis-network module.');
          let network: NetworkHandle | undefined;
          try {
            const groups = [
              ...new Set(
                model.nodes
                  .map((node) => node.group)
                  .filter((group): group is string => Boolean(group)),
              ),
            ];
            const palette = [
              '#087f73',
              '#b08332',
              '#537cac',
              '#a76e95',
              '#78a16e',
              '#bd765a',
            ];
            const styles = Object.fromEntries(
              groups.map((group, index) => [
                group,
                {
                  color: {
                    background: palette[index % palette.length],
                    border: '#fff',
                  },
                  font: { color: '#183c35' },
                },
              ]),
            );
            network = new (Constructor as NetworkConstructor)(frame, model, {
              autoResize: true,
              layout: { randomSeed: 17 },
              groups: styles,
              nodes: {
                shape: 'dot',
                scaling: { label: { drawThreshold: 0 } },
                size: 16,
                font: { size: 15, multi: false },
                borderWidth: 2,
                color: { background: '#087f73', border: '#fff' },
              },
              edges: {
                arrows: 'to',
                color: '#a8bbb5',
                font: { size: 10, align: 'middle', multi: false },
                smooth: { type: 'continuous' },
              },
              interaction: {
                hover: true,
                keyboard: { enabled: true, bindToWindow: false },
                selectConnectedEdges: true,
              },
              physics: {
                stabilization: { iterations: 150 },
                solver: 'barnesHut',
              },
            });
            frame.tabIndex = 0;
            const label = doc.createElement('label');
            label.textContent = `${text.find}: `;
            const select = doc.createElement('select');
            select.setAttribute('aria-label', text.find);
            select.style.maxWidth = '100%';
            select.append(new Option(text.choose, ''));
            for (const node of [...model.nodes].sort((a, b) =>
              a.label.localeCompare(b.label),
            ))
              select.append(new Option(node.label, node.id));
            label.append(select);
            controls.append(
              label,
              control(doc, text.fit, () => network?.fit({ animation: false })),
              control(doc, text.zoomIn, () =>
                network?.moveTo({ scale: network.getScale() * 1.3 }),
              ),
              control(doc, text.zoomOut, () =>
                network?.moveTo({ scale: network.getScale() / 1.3 }),
              ),
            );
            const selection = doc.createElement('div');
            selection.className = 'ldforge-network-selection';
            selection.setAttribute('role', 'status');
            selection.style.flexBasis = '100%';
            controls.append(selection);
            const show = (id: string | undefined) => {
              select.value = id ?? '';
              selection.replaceChildren();
              const node = id ? nodes.get(id) : undefined;
              if (!node) return;
              selection.append(safeLink(doc, node.label, node.link));
              if (node.group) selection.append(` · ${node.group}`);
            };
            select.addEventListener('change', () => {
              if (select.value) {
                network?.selectNodes([select.value], true);
                network?.focus(select.value, { scale: 1.2, animation: false });
                show(select.value);
              } else {
                network?.unselectAll();
                show(undefined);
              }
            });
            network.on('selectNode', (event) => show(event.nodes?.[0]));
            network.on('deselectNode', () => show(undefined));
            if (groups.length) {
              const legend = doc.createElement('div');
              legend.className = 'ldforge-network-legend';
              Object.assign(legend.style, {
                display: 'flex',
                gap: '14px',
                flexWrap: 'wrap',
                flexBasis: '100%',
                fontSize: '12px',
              });
              groups.forEach((group, index) => {
                const item = doc.createElement('span');
                const dot = doc.createElement('span');
                dot.textContent = '● ';
                dot.style.color = palette[index % palette.length] ?? '#087f73';
                item.append(dot, group);
                legend.append(item);
              });
              controls.append(legend);
            }
            return () => {
              network?.destroy();
              network = undefined;
            };
          } catch (error) {
            network?.destroy();
            throw error;
          }
        },
      );
    },
  };
}
