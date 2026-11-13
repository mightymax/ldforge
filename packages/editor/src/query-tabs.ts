import { translate } from '@ldforge/core';
import type { EditorControls } from './controls.js';
import type { Locale } from '@ldforge/core';

export interface QueryTab {
  readonly id: string;
  readonly query: string;
  readonly title?: string;
}
export interface QueryWorkspace {
  readonly activeId: string;
  readonly tabs: readonly QueryTab[];
}

/** Validate host-owned persisted data before passing it into the editor. */
export function parseQueryWorkspace(
  value: unknown,
): QueryWorkspace | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.tabs) || data.tabs.length === 0) return undefined;
  const tabs: QueryTab[] = [];
  const ids = new Set<string>();
  for (const value of data.tabs as unknown[]) {
    if (typeof value !== 'object' || value === null) return undefined;
    const tab = value as Record<string, unknown>;
    if (
      typeof tab.id !== 'string' ||
      !tab.id ||
      ids.has(tab.id) ||
      typeof tab.query !== 'string' ||
      (tab.title !== undefined && typeof tab.title !== 'string')
    )
      return undefined;
    ids.add(tab.id);
    tabs.push({
      id: tab.id,
      query: tab.query,
      ...(typeof tab.title === 'string' ? { title: tab.title } : {}),
    });
  }
  return {
    tabs,
    activeId:
      typeof data.activeId === 'string' && ids.has(data.activeId)
        ? data.activeId
        : (tabs[0]?.id ?? ''),
  };
}

/** Inactive tabs retain strings only, never CodeMirror views or editor states. */
export class QueryTabs {
  #workspace: QueryWorkspace;
  #number = 0;
  constructor(query = '', workspace?: QueryWorkspace) {
    this.#workspace = parseQueryWorkspace(workspace) ?? {
      activeId: 'query-1',
      tabs: [{ id: 'query-1', query }],
    };
    this.#number = Math.max(
      0,
      ...this.#workspace.tabs.map((tab) =>
        Number(tab.id.match(/^query-(\d+)$/)?.[1] ?? 0),
      ),
    );
  }
  snapshot(): QueryWorkspace {
    return {
      activeId: this.#workspace.activeId,
      tabs: this.#workspace.tabs.map((tab) => ({ ...tab })),
    };
  }
  get query(): string {
    return (
      this.#workspace.tabs.find((tab) => tab.id === this.#workspace.activeId)
        ?.query ?? ''
    );
  }
  update(query: string, id = this.#workspace.activeId): void {
    this.#workspace = {
      ...this.#workspace,
      tabs: this.#workspace.tabs.map((tab) =>
        tab.id === id ? { ...tab, query } : tab,
      ),
    };
  }
  select(id: string): boolean {
    if (
      id === this.#workspace.activeId ||
      !this.#workspace.tabs.some((tab) => tab.id === id)
    )
      return false;
    this.#workspace = { ...this.#workspace, activeId: id };
    return true;
  }
  add(
    options: { name?: string; query?: string; activate?: boolean } = {},
  ): string {
    let id: string;
    do {
      id = `query-${++this.#number}`;
    } while (this.#workspace.tabs.some((tab) => tab.id === id));
    this.#workspace = {
      activeId: options.activate === false ? this.#workspace.activeId : id,
      tabs: [
        ...this.#workspace.tabs,
        {
          id,
          query: options.query ?? '',
          ...(options.name?.trim() ? { title: options.name.trim() } : {}),
        },
      ],
    };
    return id;
  }
  rename(id: string, title: string): void {
    const trimmed = title.trim();
    this.#workspace = {
      ...this.#workspace,
      tabs: this.#workspace.tabs.map((tab) =>
        tab.id === id
          ? {
              id: tab.id,
              query: tab.query,
              ...(trimmed ? { title: trimmed } : {}),
            }
          : tab,
      ),
    };
  }
  close(id: string): boolean {
    const index = this.#workspace.tabs.findIndex((tab) => tab.id === id);
    if (index < 0 || this.#workspace.tabs.length === 1) return false;
    const tabs = this.#workspace.tabs.filter((tab) => tab.id !== id);
    const activeChanged = id === this.#workspace.activeId;
    this.#workspace = {
      tabs,
      activeId: activeChanged
        ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? '')
        : this.#workspace.activeId,
    };
    return activeChanged;
  }
}

export function renderQueryTabs(
  container: HTMLElement,
  workspace: QueryWorkspace,
  locale: Locale,
  actions: {
    select(id: string): void;
    add(): void;
    close(id: string): void;
    rename(id: string, title: string): void;
  },
  controls: EditorControls = {},
): void {
  const doc = container.ownerDocument;
  const list = doc.createElement('div');
  list.className = 'ldforge-tablist';
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', translate(locale, 'queryTabs'));
  for (const [index, tab] of workspace.tabs.entries()) {
    const wrapper = doc.createElement('div');
    wrapper.className = 'ldforge-tab';
    wrapper.dataset.active = String(workspace.activeId === tab.id);
    const button = doc.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.dataset.tabId = tab.id;
    button.id = `${container.dataset.panelId ?? 'query-panel'}-tab-${index + 1}`;
    if (container.dataset.panelId)
      button.setAttribute('aria-controls', container.dataset.panelId);
    button.title = translate(locale, 'renameHint');
    button.textContent =
      tab.title ?? translate(locale, 'queryTab', { number: index + 1 });
    button.setAttribute('aria-selected', String(workspace.activeId === tab.id));
    button.tabIndex = workspace.activeId === tab.id ? 0 : -1;
    button.addEventListener('click', () => actions.select(tab.id));
    button.addEventListener('keydown', (event) => {
      let target: number;
      if (event.key === 'ArrowRight')
        target = (index + 1) % workspace.tabs.length;
      else if (event.key === 'ArrowLeft')
        target = (index - 1 + workspace.tabs.length) % workspace.tabs.length;
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = workspace.tabs.length - 1;
      else return;
      event.preventDefault();
      const next = workspace.tabs[target];
      if (next) actions.select(next.id);
      container
        .querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        ?.focus();
    });
    function startRename(): void {
      if (wrapper.querySelector('input')) return;
      const input = doc.createElement('input');
      input.type = 'text';
      input.className = 'ldforge-tab-name';
      input.value = tab.title ?? button.textContent ?? '';
      input.setAttribute('aria-label', translate(locale, 'queryTabName'));
      let finished = false;
      function finish(save: boolean): void {
        if (finished) return;
        finished = true;
        if (save) actions.rename(tab.id, input.value);
        else {
          input.replaceWith(button);
          button.focus();
        }
      }
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          finish(event.key === 'Enter');
        }
      });
      input.addEventListener('blur', () => finish(true));
      button.replaceWith(input);
      input.focus();
      input.select();
    }
    if (controls.renameTab !== false)
      button.addEventListener('dblclick', startRename);
    const rename = doc.createElement('button');
    rename.type = 'button';
    rename.className = 'ldforge-tab-rename';
    rename.textContent = '✎';
    rename.setAttribute(
      'aria-label',
      translate(locale, 'renameQueryTab', { title: button.textContent }),
    );
    rename.title = translate(locale, 'renameQueryTab', {
      title: button.textContent,
    });
    rename.addEventListener('click', startRename);
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'ldforge-tab-close';
    close.textContent = '×';
    close.setAttribute(
      'aria-label',
      translate(locale, 'closeQueryTab', { title: button.textContent }),
    );
    close.disabled = workspace.tabs.length === 1;
    close.addEventListener('click', () => actions.close(tab.id));
    wrapper.append(button);
    if (controls.renameTab !== false) wrapper.append(rename);
    if (controls.closeTab !== false) wrapper.append(close);
    list.append(wrapper);
  }
  const add = doc.createElement('button');
  add.type = 'button';
  add.className = 'ldforge-tab-add';
  add.textContent = '+';
  add.setAttribute('aria-label', translate(locale, 'newQueryTab'));
  add.addEventListener('click', actions.add);
  container.replaceChildren(list, ...(controls.addTab === false ? [] : [add]));
}
