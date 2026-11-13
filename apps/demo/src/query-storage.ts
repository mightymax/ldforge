import { parseQueryWorkspace } from '@ldforge/editor';
import type { QueryWorkspace } from '@ldforge/editor';

const storageKey = 'ldforge.demo.queries.v1';
export function readQueryWorkspace(): QueryWorkspace | undefined {
  try {
    return parseQueryWorkspace(
      JSON.parse(localStorage.getItem(storageKey) ?? 'null'),
    );
  } catch {
    return undefined;
  }
}
export function saveQueryWorkspace(workspace: QueryWorkspace): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(workspace));
  } catch {
    /* Query editing remains available when storage is blocked or full. */
  }
}
