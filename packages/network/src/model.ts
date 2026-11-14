import type { QueryResult } from '@ldforge/core';
export interface NetworkNode {
  id: string;
  label: string;
  group?: string;
  link?: string;
}
export interface NetworkEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}
export interface NetworkModel {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}
export class NetworkDataError extends Error {
  constructor(readonly row: number) {
    super(`Invalid network binding at row ${row}.`);
  }
}
export function buildNetworkModel(result: QueryResult): NetworkModel {
  const nodes = new Map<string, NetworkNode>();
  const edges = new Map<string, NetworkEdge>();
  if (result.kind !== 'bindings') return { nodes: [], edges: [] };
  for (const [index, row] of result.bindings.entries()) {
    for (const key of ['source', 'target'] as const) {
      const term = row[key];
      if (!term?.value.trim() || !['uri', 'bnode'].includes(term.type))
        throw new NetworkDataError(index + 1);
      // Prefix blank node IDs to avoid collisions with URI nodes.
      const id = JSON.stringify([term.type, term.value]);
      const label = row[`${key}Label`]?.value || term.value;
      const group = row[`${key}Group`]?.value;
      const previous = nodes.get(id);
      nodes.set(id, {
        id,
        label:
          previous?.label && previous.label !== term.value
            ? previous.label
            : label,
        ...(group
          ? { group }
          : previous?.group
            ? { group: previous.group }
            : {}),
        ...(term.type === 'uri' ? { link: term.value } : {}),
      });
    }
    const source = row.source;
    const target = row.target;
    if (!source || !target) throw new NetworkDataError(index + 1);
    const from = JSON.stringify([source.type, source.value]);
    const to = JSON.stringify([target.type, target.value]);
    const label = row.relationLabel?.value ?? '';
    const id = JSON.stringify([from, to, label]);
    edges.set(id, { id, from, to, label });
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
