import { EditorState } from '@codemirror/state';
import {
  createEditor,
  type ForgeEditor,
  type QueryTabHandle,
  type QueryWorkspace,
} from '@ldforge/editor';
import {
  isGraphQuery,
  parseRdfGraph,
  parseSparqlResults,
  type QueryResult,
} from '@ldforge/core';
import {
  createTableRenderer,
  createBooleanRenderer,
  createJsonRenderer,
} from '@ldforge/renderers';

/** Event arguments follow Yasgui: instance first, then tab or tab ID. */
export type Listener = (...args: any[]) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
class Events {
  private listeners = new Map<string, Listener[]>();
  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }
  once(event: string, listener: Listener): this {
    const once: Listener = (...args) => {
      this.off(event, once);
      listener(...args);
    };
    return this.on(event, once);
  }
  off(event: string, listener: Listener): this {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((item) => item !== listener),
    );
    return this;
  }
  removeListener(event: string, listener: Listener): this {
    return this.off(event, listener);
  }
  removeAllListeners(event?: string): this {
    if (event === undefined) this.listeners.clear();
    else this.listeners.delete(event);
    return this;
  }
  emit(event: string, ...args: unknown[]): boolean {
    const listeners = this.listeners.get(event) ?? [];
    for (const listener of [...listeners]) listener(...args);
    return listeners.length > 0;
  }
}
export type Dynamic<T> = T | ((yasgui: Yasgui) => T);
export interface RequestConfig {
  endpoint?: Dynamic<string>;
  method?: Dynamic<'GET' | 'POST'>;
  headers?: Dynamic<Record<string, string>>;
  args?: Dynamic<{ name: string; value: string }[]>;
  defaultGraphs?: Dynamic<string[]>;
  namedGraphs?: Dynamic<string[]>;
  withCredentials?: Dynamic<boolean>;
  adjustQueryBeforeRequest?: (yasqe: Yasqe) => string;
}
export interface Config {
  requestConfig?: RequestConfig;
  yasqe?: { value?: string; readOnly?: boolean; showQueryButton?: boolean };
  autofocus?: boolean;
  autoAddOnInit?: boolean;
  copyEndpointOnNewTab?: boolean;
  tabName?: string;
  persistenceId?: string | null | ((yasgui: Yasgui) => string);
  /** URL import is opt-in in this facade. */
  populateFromUrl?: false;
  /** Injectable fetch and LDForge plugins are additive extensions. */
  fetch?: typeof globalThis.fetch;
}
export interface TabConfig {
  id?: string;
  name?: string;
  yasqe?: Config['yasqe'];
  requestConfig?: RequestConfig;
}
function checkKeys(
  object: object | undefined,
  allowed: string[],
  label: string,
): void {
  for (const key of Object.keys(object ?? {}))
    if (!allowed.includes(key))
      throw new Error(
        `Unsupported Yasgui compatibility option: ${label}${key}`,
      );
}
function validate(config: Config | TabConfig, tab = false): void {
  checkKeys(
    config,
    tab
      ? ['id', 'name', 'yasqe', 'requestConfig']
      : [
          'requestConfig',
          'yasqe',
          'autofocus',
          'autoAddOnInit',
          'copyEndpointOnNewTab',
          'tabName',
          'persistenceId',
          'populateFromUrl',
          'fetch',
        ],
    '',
  );
  checkKeys(config.yasqe, ['value', 'readOnly', 'showQueryButton'], 'yasqe.');
  checkKeys(
    config.requestConfig,
    [
      'endpoint',
      'method',
      'headers',
      'args',
      'defaultGraphs',
      'namedGraphs',
      'withCredentials',
      'adjustQueryBeforeRequest',
    ],
    'requestConfig.',
  );
  if ('populateFromUrl' in config && config.populateFromUrl !== false)
    throw new Error(
      'populateFromUrl is not supported; import the query explicitly.',
    );
}

/** Small Yasqe facade; not a CodeMirror 5 editor. */
export class Yasqe extends Events {
  constructor(private tab: Tab) {
    super();
  }
  getValue(): string {
    return this.tab.getQuery();
  }
  setValue(value: string): void {
    this.tab.setQuery(value);
  }
  query(): Promise<void> {
    return this.tab.query();
  }
  abortQuery(): void {
    this.tab.abortQuery();
  }
  focus(): void {
    this.tab.select();
    this.tab.editor.focus();
  }
  refresh(): void {
    /* CodeMirror 6 measures automatically. */
  }
}

export class Tab extends Events {
  private readonly yasqe: Yasqe;
  private closed = false;
  private request: RequestConfig;
  private lastResult: QueryResult | undefined;
  private background: AbortController | undefined;
  private snapshot: { name: string; query: string };
  constructor(
    readonly yasgui: Yasgui,
    readonly handle: QueryTabHandle,
    private id: string,
    config: TabConfig,
  ) {
    super();
    this.snapshot = { name: handle.name, query: handle.getQuery() };
    this.request = { ...yasgui.config.requestConfig, ...config.requestConfig };
    this.yasqe = new Yasqe(this);
  }
  /** All compatibility tabs share LDForge's single native editor. */
  get editor(): ForgeEditor {
    return this.yasgui.editor;
  }
  private assertAlive(): void {
    this.yasgui.assertAlive();
    if (this.closed) throw new Error('Tab has been closed.');
  }
  private value<T>(value: Dynamic<T> | undefined, fallback: T): T {
    return typeof value === 'function'
      ? (value as (gui: Yasgui) => T)(this.yasgui)
      : (value ?? fallback);
  }
  private async execute(
    query: string,
    signal: AbortSignal,
  ): Promise<QueryResult> {
    const request = this.request;
    query = request.adjustQueryBeforeRequest?.(this.yasqe) ?? query;
    const url = new URL(this.getEndpoint());
    if (!['http:', 'https:'].includes(url.protocol))
      throw new Error('Endpoint must use HTTP or HTTPS.');
    const method = this.value(request.method, 'POST');
    if (method !== 'POST' && method !== 'GET')
      throw new Error('Method must be GET or POST.');
    const params = new URLSearchParams();
    params.set('query', query);
    for (const { name, value } of this.value(request.args, []))
      params.append(name, value);
    for (const graph of this.value(request.defaultGraphs, []))
      params.append('default-graph-uri', graph);
    for (const graph of this.value(request.namedGraphs, []))
      params.append('named-graph-uri', graph);
    const graph = isGraphQuery(query);
    const headers = new Headers(this.value(request.headers, {}));
    if (!headers.has('Accept'))
      headers.set(
        'Accept',
        graph ? 'text/turtle' : 'application/sparql-results+json',
      );
    if (method === 'GET') {
      for (const [key, value] of params) url.searchParams.append(key, value);
    } else headers.set('Content-Type', 'application/x-www-form-urlencoded');
    const response = await (this.yasgui.config.fetch ?? globalThis.fetch)(
      url.href,
      {
        method,
        headers,
        signal,
        credentials: this.value(request.withCredentials, false)
          ? 'include'
          : 'same-origin',
        ...(method === 'POST' ? { body: params.toString() } : {}),
      },
    );
    if (!response.ok)
      throw new Error(`SPARQL endpoint returned HTTP ${response.status}.`);
    return graph
      ? parseRdfGraph(
          await response.text(),
          response.headers.get('Content-Type') ?? '',
          url.href,
        )
      : parseSparqlResults(await response.json());
  }
  getId(): string {
    return this.id;
  }
  name(): string {
    return this.getName();
  }
  getName(): string {
    return this.closed || this.handle.isDeleted
      ? this.snapshot.name
      : this.handle.name;
  }
  remember(): void {
    this.snapshot = { name: this.handle.name, query: this.handle.getQuery() };
  }
  setName(name: string): this {
    this.assertAlive();
    this.handle.rename(name);
    return this;
  }
  getQuery(): string {
    this.assertAlive();
    return this.handle.isDeleted ? this.snapshot.query : this.handle.getQuery();
  }
  setQuery(query: string): this {
    this.assertAlive();
    this.handle.setQuery(query);
    return this;
  }
  getEndpoint(): string {
    return this.value(this.request.endpoint, 'https://dbpedia.org/sparql');
  }
  setEndpoint(endpoint: string): this {
    this.assertAlive();
    this.request.endpoint = endpoint.trim();
    this.changed();
    this.emit('endpointChange', this, this.getEndpoint());
    return this;
  }
  getRequestConfig(): RequestConfig {
    return this.request;
  }
  getYasqe(): Yasqe {
    this.assertAlive();
    return this.yasqe;
  }
  getResult(): QueryResult | undefined {
    return this.lastResult;
  }
  select(): void {
    this.yasgui.selectTabId(this.id);
  }
  async executeRequest(
    query: string,
    signal: AbortSignal,
  ): Promise<QueryResult> {
    const aborted = () => {
      this.emit('queryAbort', this);
      this.yasgui.emit('queryAbort', this.yasgui, this);
      this.yasqe.emit('queryAbort', this.yasqe);
    };
    signal.addEventListener('abort', aborted, { once: true });
    try {
      this.emit('query', this);
      this.yasgui.emit('query', this.yasgui, this);
      this.yasqe.emit('query', this.yasqe);
      signal.throwIfAborted();
      const result = await this.execute(query, signal);
      if (!signal.aborted && !this.closed) this.lastResult = result;
      return result;
    } finally {
      signal.removeEventListener('abort', aborted);
      if (!signal.aborted && !this.closed) {
        this.emit('queryResponse', this);
        this.yasgui.emit('queryResponse', this.yasgui, this);
        this.yasqe.emit('queryResponse', this.yasqe);
      }
    }
  }
  async query(): Promise<void> {
    this.assertAlive();
    if (this.handle.isActive) {
      await this.editor.run();
      const state = this.editor.getState();
      if (state.status === 'error') throw state.error;
    } else {
      // Background API requests never replace the visible native editor/result.
      this.background?.abort();
      const controller = new AbortController();
      this.background = controller;
      try {
        await this.executeRequest(this.getQuery(), controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      } finally {
        if (this.background === controller) this.background = undefined;
      }
    }
  }
  abortQuery(): void {
    this.assertAlive();
    this.background?.abort();
    if (this.handle.isActive) this.editor.cancel();
  }
  getPersistedJson(): TabConfig {
    return {
      id: this.id,
      name: this.getName(),
      yasqe: { value: this.getQuery() },
      requestConfig: { ...this.request },
    };
  }
  changed(): void {
    this.yasqe.emit('change', this.yasqe);
    this.emit('change', this, this.getPersistedJson());
    this.yasgui.emit('tabChange', this.yasgui, this);
    this.yasgui.save();
  }
  close(): void {
    this.assertAlive();
    this.handle.delete();
  }
  dispose(): void {
    if (this.closed) return;
    this.background?.abort();
    this.closed = true;
    this.yasqe.removeAllListeners();
    this.removeAllListeners();
  }
}

export class Yasgui extends Events {
  static defaults: Config = {
    autofocus: true,
    autoAddOnInit: true,
    copyEndpointOnNewTab: true,
    tabName: 'Query',
    persistenceId: null,
  };
  static Tab = Tab;
  readonly config: Config;
  readonly editor: ForgeEditor;
  readonly rootEl: HTMLElement;
  private tabs = new Map<string, Tab>();
  private workspace: QueryWorkspace | undefined;
  private pending: TabConfig | undefined;
  private disposed = false;
  private storageId: string | undefined;
  constructor(parent: HTMLElement, config: Config = {}) {
    super();
    this.config = {
      ...Yasgui.defaults,
      ...config,
      requestConfig: {
        ...Yasgui.defaults.requestConfig,
        ...config.requestConfig,
      },
      yasqe: { ...Yasgui.defaults.yasqe, ...config.yasqe },
    };
    validate(this.config);
    if (this.config.autoAddOnInit === false)
      throw new Error(
        'LDForge always starts with one native query tab; autoAddOnInit: false is not supported.',
      );
    const persistence = this.config.persistenceId;
    const key =
      typeof persistence === 'function' ? persistence(this) : persistence;
    this.storageId = key ? `ldforge:yasgui:${key}` : undefined;
    let restored: { tabs: TabConfig[]; active?: string } | undefined;
    try {
      const raw =
        this.storageId &&
        parent.ownerDocument.defaultView?.localStorage.getItem(this.storageId);
      if (raw) {
        const data = JSON.parse(raw);
        if (
          data.version === 1 &&
          Array.isArray(data.tabs) &&
          data.tabs.length
        ) {
          for (const tab of data.tabs) {
            validate(tab, true);
            if (
              typeof tab.id !== 'string' ||
              !tab.id ||
              typeof tab.name !== 'string' ||
              typeof tab.yasqe?.value !== 'string'
            )
              throw new Error('Invalid stored tab');
          }
          if (
            new Set(data.tabs.map((tab: TabConfig) => tab.id)).size !==
            data.tabs.length
          )
            throw new Error('Duplicate stored tab');
          restored = data;
        }
      }
    } catch {
      /* Unavailable storage or invalid data leaves a usable fresh editor. */
    }
    const initialTabs = restored?.tabs ?? [
      {
        id: 'query-1',
        name: this.config.tabName ?? 'Query',
        yasqe: {
          value:
            this.config.yasqe?.value ?? 'SELECT * WHERE { ?s ?p ?o } LIMIT 10',
        },
      },
    ];
    const firstId = initialTabs[0]?.id ?? 'query-1';
    const initial: QueryWorkspace = {
      activeId: restored?.active ?? firstId,
      tabs: initialTabs.map((tab) => ({
        id: tab.id ?? firstId,
        query: tab.yasqe?.value ?? '',
        ...(tab.name !== undefined ? { title: tab.name } : {}),
      })),
    };
    this.editor = createEditor(parent, {
      workspace: initial,
      controls: { run: this.config.yasqe?.showQueryButton ?? true },
      extensions: [
        EditorState.readOnly.of(this.config.yasqe?.readOnly ?? false),
      ],
      renderers: [
        createTableRenderer(),
        createBooleanRenderer(),
        createJsonRenderer(),
      ],
      onWorkspaceChange: (workspace) => this.sync(workspace),
      executor: {
        execute: (request) => {
          const tab = this.getTab();
          if (!tab) throw new Error('No active query tab.');
          return tab.executeRequest(request.query, request.signal);
        },
      },
    });
    const root = parent.lastElementChild;
    if (!(root instanceof HTMLElement))
      throw new Error('LDForge editor did not mount.');
    this.rootEl = root;
    for (const handle of this.editor.getTabs()) {
      const config = initialTabs.find((tab) => tab.id === handle.id) ?? {};
      this.tabs.set(handle.id, new Tab(this, handle, handle.id, config));
    }
    this.workspace = this.editor.getWorkspace();
    if (this.config.autofocus) this.editor.focus();
    this.save();
  }
  private sync(workspace: QueryWorkspace): void {
    const previous = this.workspace;
    this.workspace = workspace;
    for (const handle of this.editor.getTabs()) {
      let tab = [...this.tabs.values()].find(
        (tab) => tab.handle.id === handle.id,
      );
      if (!tab) {
        const previousTab = [...this.tabs.values()].find(
          (tab) => tab.handle.id === previous?.activeId,
        );
        const config =
          this.pending ??
          (this.config.copyEndpointOnNewTab && previousTab
            ? { requestConfig: { endpoint: previousTab.getEndpoint() } }
            : {});
        tab = new Tab(
          this,
          handle,
          config.id ??
            (this.tabs.has(handle.id)
              ? `ldforge-${globalThis.crypto.randomUUID()}`
              : handle.id),
          config,
        );
        this.tabs.set(tab.getId(), tab);
        this.emit('tabAdd', this, tab.getId());
        this.emit('tabChange', this, tab);
      } else {
        tab.remember();
        const before = previous?.tabs.find((item) => item.id === handle.id);
        const after = workspace.tabs.find((item) => item.id === handle.id);
        if (
          before &&
          (before.query !== after?.query || before.title !== after?.title)
        )
          tab.changed();
      }
    }
    for (const [id, tab] of this.tabs) {
      if (!workspace.tabs.some((item) => item.id === tab.handle.id)) {
        this.tabs.delete(id);
        this.emit('tabClose', this, tab);
        tab.emit('close', tab);
        tab.dispose();
      }
    }
    if (previous?.activeId !== workspace.activeId)
      this.emit('tabSelect', this, this.getTab()?.getId());
    this.save();
  }
  assertAlive(): void {
    if (this.disposed) throw new Error('Yasgui has been destroyed.');
  }
  getTab(id?: string): Tab | undefined {
    this.assertAlive();
    return id !== undefined
      ? this.tabs.get(id)
      : [...this.tabs.values()].find(
          (tab) => tab.handle.id === this.workspace?.activeId,
        );
  }
  createTabName(name = this.config.tabName ?? 'Query'): string {
    let title = name;
    let index = 1;
    while (this.tabNameTaken(title)) title = `${name} ${index++}`;
    return title;
  }
  tabNameTaken(name: string): Tab | undefined {
    return [...this.tabs.values()].find((tab) => tab.getName() === name);
  }
  addTab(setActive = true, config: TabConfig = {}, options?: never): Tab {
    this.assertAlive();
    validate(config, true);
    if (options !== undefined)
      throw new Error(
        'Yasgui addTab options (third argument) are not supported.',
      );
    if (config.id && this.tabs.has(config.id))
      throw new Error('Duplicate tab ID');
    if (
      config.yasqe?.readOnly !== undefined &&
      config.yasqe.readOnly !== (this.config.yasqe?.readOnly ?? false)
    )
      throw new Error(
        'LDForge readOnly is configured per editor, not per tab.',
      );
    if (
      config.yasqe?.showQueryButton !== undefined &&
      config.yasqe.showQueryButton !==
        (this.config.yasqe?.showQueryButton ?? true)
    )
      throw new Error(
        'LDForge showQueryButton is configured per editor, not per tab.',
      );
    const current = this.getTab();
    if (
      !config.requestConfig?.endpoint &&
      this.config.copyEndpointOnNewTab &&
      current
    )
      config = {
        ...config,
        requestConfig: {
          ...config.requestConfig,
          endpoint: current.getEndpoint(),
        },
      };
    this.pending = config;
    try {
      const handle = this.editor.getTabs().addTab({
        name: config.name ?? this.createTabName(),
        query: config.yasqe?.value ?? this.config.yasqe?.value ?? '',
        activate: setActive,
      });
      const tab = [...this.tabs.values()].find(
        (tab) => tab.handle.id === handle.id,
      );
      if (!tab) throw new Error('Tab was not created.');
      return tab;
    } finally {
      this.pending = undefined;
    }
  }
  selectTabId(id: string): Tab | undefined {
    this.assertAlive();
    const previous = this.getTab();
    this.tabs.get(id)?.handle.activate();
    if (this.config.autofocus) this.editor.focus();
    return previous;
  }
  closeTab(id: string): void {
    this.assertAlive();
    this.tabs.get(id)?.close();
  }
  save(): void {
    if (!this.storageId || this.disposed || !this.workspace) return;
    try {
      this.rootEl.ownerDocument.defaultView?.localStorage.setItem(
        this.storageId,
        JSON.stringify({
          version: 1,
          active: this.getTab()?.getId(),
          tabs: [...this.tabs.values()].map((tab) => tab.getPersistedJson()),
        }),
      );
    } catch {
      /* Storage quotas and privacy settings must not interrupt editing. */
    }
  }
  destroy(): void {
    if (this.disposed) return;
    this.editor.destroy();
    for (const tab of this.tabs.values()) tab.dispose();
    this.disposed = true;
    this.tabs.clear();
    this.removeAllListeners();
  }
}
export default Yasgui;
