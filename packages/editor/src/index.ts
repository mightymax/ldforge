import {
  createFontSizeControl,
  DEFAULT_FONT_SIZE,
  validateFontSize,
} from './font-size.js';
import { createRendererWizard } from './renderer-wizard.js';
import type { RendererWizardApi } from './renderer-wizard.js';
export type {
  RendererWizardApi,
  RendererHeaderConfig,
} from './renderer-wizard.js';
import {
  prefixFolding,
  prefixFoldRanges,
  prefixesCollapsed,
  setPrefixesCollapsed,
} from './prefix-folding.js';
import { foldEffect, unfoldEffect, foldKeymap } from '@codemirror/language';
import { createToolbar } from './toolbar.js';
import type { ToolbarApi, ToolbarOptions } from './toolbar-types.js';
export { buttonGroupTypes } from './toolbar-types.js';
export type {
  ToolbarApi,
  ToolbarOptions,
  ToolbarButtonHandle,
  ToolbarButtonGroupHandle,
  ButtonGroupOptions,
  ButtonGroupType,
  ToolbarButtonInput,
  ToolbarButtonUpdate,
} from './toolbar-types.js';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  isolateHistory,
} from '@codemirror/commands';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import { sparqlSupport } from './sparql/index.js';
import { namespaceCatalog } from './sparql/vocabulary.js';
import { createPrefixPicker } from './prefix-picker.js';
import { resolveControls } from './controls.js';
import type { EditorControls } from './controls.js';
import { createTabApi } from './tab-api.js';
import type { TabCollection, EditorWarning } from './tab-api.js';
import type { FormatOptions } from './sparql/format.js';
export type { EditorControls } from './controls.js';
export type {
  TabCollection,
  QueryTabHandle,
  AddTabOptions,
  PrefixInput,
  EditorWarning,
} from './tab-api.js';
import type { SparqlOptions } from './sparql/index.js';
export * from './sparql/index.js';
import {
  parseQueryViewDirectives,
  createSvgIcon,
  PluginRegistry,
  QueryController,
  localize,
  resolveLocale,
  translate,
} from '@ldforge/core';
import { appendIcon } from './icons.js';
import { downloadResultsCsv } from './result-download.js';
import { formatQueryStatus } from './query-status.js';
import { QueryTabs, renderQueryTabs } from './query-tabs.js';
import type { QueryWorkspace } from './query-tabs.js';
export { parseQueryWorkspace } from './query-tabs.js';
export type { QueryWorkspace, QueryTab } from './query-tabs.js';
import type {
  ButtonPlugin,
  EditorContext,
  QueryExecutor,
  ResultRendererPlugin,
  SettingsPlugin,
  Locale,
  LocalePreference,
} from '@ldforge/core';

export type {
  ResultRendererContext,
  RendererWizardSchema,
  RendererWizardOption,
  RendererBindingContract,
  QueryViewDirectives,
  ButtonPlugin,
  PluginIcon,
  EditorContext,
  ResultRendererPlugin,
  SettingsPlugin,
  Locale,
  LocalePreference,
} from '@ldforge/core';

export interface EditorOptions {
  readonly executor: QueryExecutor;
  readonly query?: string;
  /** Initially collapse PREFIX declarations on each tab. Defaults to false. */
  readonly prefixesCollapsed?: boolean;
  /** Built-in UI visibility; all flags default to true. False hides all built-in controls. */
  readonly controls?: EditorControls | false;
  /** Unknown shorthand prefix notifications; defaults to console.warn. */
  readonly onWarning?: (warning: EditorWarning) => void;
  readonly sparql?: SparqlOptions;
  readonly workspace?: QueryWorkspace;
  /** Detached workspace after every tab/text mutation. The host owns persistence. */
  readonly onWorkspaceChange?: (workspace: QueryWorkspace) => void;
  /** Project preference. Defaults to browser detection, with English fallback. */
  readonly locale?: LocalePreference;
  /** Restored user choice, which takes precedence over the project preference. */
  readonly userLocale?: LocalePreference;
  readonly onLocaleChange?: (preference: LocalePreference) => void;
  /** CodeMirror query text size only, 10–24px. */
  readonly fontSize?: number;
  readonly onFontSizeChange?: (size: number) => void;
  /** Omit to use the combined Run/Stop button; provide an array to replace the toolbar. */
  readonly buttons?: readonly ButtonPlugin[];
  /** Optional dropdown presentation and additional declarative button groups. */
  readonly toolbar?: ToolbarOptions;
  readonly renderers?: readonly ResultRendererPlugin[];
  readonly settings?: readonly SettingsPlugin[];
  readonly extensions?: readonly Extension[];
  readonly onQueryChange?: (query: string) => void;
}
export interface ForgeEditor extends EditorContext {
  /** Whether every PREFIX group in the active query is folded. False if none. */
  arePrefixesCollapsed(): boolean;
  /** Changes presentation only; never edits the query. */
  setPrefixesCollapsed(collapsed: boolean): void;
  /** Returns the resulting collapsed state. False when no PREFIX exists. */
  togglePrefixes(): boolean;
  getToolBar(): ToolbarApi;
  /** Registered renderers only; does not load their external visual libraries. */
  getRenderers(): readonly ResultRendererPlugin[];
  getRendererWizard(): RendererWizardApi;
  getFontSize(): number;
  setFontSize(size: number): void;
  isLoadingIndicatorEnabled(): boolean;
  setLoadingIndicatorEnabled(enabled: boolean): void;
  getWorkspace(): QueryWorkspace;
  /** Live indexable collection; handles remain stable across edits and renaming. */
  getTabs(): TabCollection;
  /** Format the currently active tab; the async result never overwrites a newer edit. */
  formatQuery(options?: FormatOptions): Promise<string>;
  focus(): void;
  destroy(): void;
}

export function createRunButton(): ButtonPlugin {
  const label = { en: 'Run query', nl: 'Query uitvoeren' };
  const stopLabel = { en: 'Stop query', nl: 'Query stoppen' };
  const title = {
    en: 'Run query (Ctrl/Cmd+Enter)',
    nl: 'Query uitvoeren (Ctrl/Cmd+Enter)',
  };
  const icon = createSvgIcon(['m8 4 12 8-12 8z']);
  const stopIcon = createSvgIcon(['M6 6h12v12H6z']);
  return {
    id: 'run',
    group: 'query',
    label,
    title,
    icon,
    getLabel(context) {
      return context.getState().status === 'running' ? stopLabel : this.label;
    },
    getTitle(context) {
      return context.getState().status === 'running'
        ? stopLabel
        : (this.title ?? this.label);
    },
    getIcon(context) {
      return context.getState().status === 'running' ? stopIcon : this.icon;
    },
    execute(context) {
      if (context.getState().status === 'running') context.cancel();
      else return context.run();
    },
  };
}
export function createCancelButton(): ButtonPlugin {
  return {
    id: 'cancel',
    icon: createSvgIcon(['M6 6h12v12H6z']),
    group: 'query',
    label: { en: 'Cancel', nl: 'Annuleren' },
    isDisabled: (context) => context.getState().status !== 'running',
    execute: (context) => context.cancel(),
  };
}

let settingsPanelNumber = 0;

/** Mounts an isolated editor; destroy it before unmounting the host. */
export function createEditor(
  container: HTMLElement,
  options: EditorOptions,
): ForgeEditor {
  let fontSize = options.fontSize ?? DEFAULT_FONT_SIZE;
  validateFontSize(fontSize);
  const controls = resolveControls(options.controls);
  let loadingIndicatorEnabled = controls.loadingIndicator;
  const buttons = new PluginRegistry(
    (options.buttons ?? [createRunButton()]).filter(
      (button) =>
        (button.id !== 'run' || controls.run) &&
        (button.id !== 'cancel' || controls.cancel),
    ),
  );
  const renderers = new PluginRegistry(options.renderers);
  const settings = new PluginRegistry(options.settings);
  const catalog = namespaceCatalog(options.sparql ?? {});
  const settingsCleanups: (() => void)[] = [];
  const settingsViews: {
    plugin: SettingsPlugin;
    heading: HTMLElement;
    content: HTMLElement;
  }[] = [];
  let userLocale = options.userLocale ?? 'auto';
  let locale: Locale = resolveLocale(
    userLocale === 'auto' ? (options.locale ?? 'auto') : userLocale,
  );
  const localeCompartment = new Compartment();
  const controller = new QueryController(options.executor);
  const queryTabs = new QueryTabs(options.query, options.workspace);
  const doc = container.ownerDocument;
  const root = doc.createElement('section');
  root.className = 'ldforge';
  root.setAttribute('aria-label', 'SPARQL editor');
  const toolbar = doc.createElement('div');
  toolbar.className = 'ldforge-toolbar';
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Query actions');
  const coreActions = doc.createElement('div');
  coreActions.className = 'ldforge-core-actions';
  const customActions = doc.createElement('div');
  customActions.className = 'ldforge-custom-actions';
  customActions.setAttribute('role', 'group');
  const tools = doc.createElement('div');
  tools.className = 'ldforge-button-group ldforge-core-tools';
  tools.setAttribute('role', 'group');
  toolbar.append(coreActions, customActions, tools);
  const tabBar = doc.createElement('div');
  tabBar.className = 'ldforge-tabs';
  tabBar.hidden = !controls.tabs;
  const editorHost = doc.createElement('div');
  editorHost.className = 'ldforge-code';
  editorHost.style.setProperty('--ldforge-query-font-size', `${fontSize}px`);
  editorHost.id = `ldforge-query-${settingsPanelNumber + 1}`;
  editorHost.setAttribute('role', 'tabpanel');
  tabBar.dataset.panelId = editorHost.id;
  const status = doc.createElement('p');
  status.className = 'ldforge-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const resultToolbar = doc.createElement('div');
  resultToolbar.className = 'ldforge-result-toolbar';
  const resultTabs = doc.createElement('div');
  resultTabs.className = 'ldforge-result-tabs';
  resultTabs.setAttribute('role', 'tablist');
  resultTabs.hidden = true;
  const download = doc.createElement('button');
  download.type = 'button';
  download.className = 'ldforge-result-download';
  appendIcon(download, createSvgIcon(['M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5']));
  download.hidden = true;
  const loadingIndicator = doc.createElement('div');
  loadingIndicator.className = 'ldforge-loading-indicator';
  loadingIndicator.setAttribute('role', 'status');
  const spinner = doc.createElement('span');
  spinner.className = 'ldforge-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const loadingLabel = doc.createElement('span');
  loadingIndicator.append(spinner, loadingLabel);
  const rendererDocs = doc.createElement('a');
  rendererDocs.className = 'ldforge-renderer-docs';
  rendererDocs.target = '_blank';
  rendererDocs.rel = 'noopener noreferrer';
  rendererDocs.hidden = true;
  appendIcon(
    rendererDocs,
    createSvgIcon(['M4 3h7l1 2 1-2h7v16h-7l-1 2-1-2H4zM12 5v16']),
  );
  resultToolbar.append(resultTabs, status, rendererDocs, download);
  const output = doc.createElement('div');
  output.className = 'ldforge-results';
  output.id = `${editorHost.id}-results`;
  output.setAttribute('role', 'tabpanel');
  output.tabIndex = 0;
  output.setAttribute('aria-label', 'Query results');
  const settingsPanel = doc.createElement('div');
  settingsPanel.className = 'ldforge-settings';
  settingsPanel.id = `ldforge-settings-${++settingsPanelNumber}`;
  settingsPanel.hidden = true;
  settingsPanel.setAttribute('role', 'region');
  settingsPanel.setAttribute('aria-label', translate(locale, 'settings'));
  const languageLabel = doc.createElement('label');
  languageLabel.className = 'ldforge-language';
  const languageText = doc.createElement('span');
  const languageSelect = doc.createElement('select');
  const defaultLanguage = doc.createElement('option');
  defaultLanguage.value = 'auto';
  languageSelect.append(defaultLanguage);
  for (const [value, label] of [
    ['en', 'English'],
    ['nl', 'Nederlands'],
  ]) {
    const option = doc.createElement('option');
    option.value = value ?? '';
    option.textContent = label ?? '';
    languageSelect.append(option);
  }
  const languageHelp = doc.createElement('p');
  languageHelp.className = 'ldforge-language-help';
  languageLabel.append(languageText, languageSelect);
  languageLabel.hidden = !controls.language;
  languageHelp.hidden = !controls.language;
  settingsPanel.append(languageLabel, languageHelp);
  const fontSizeControl = createFontSizeControl(
    doc,
    () => fontSize,
    () => locale,
    (size) => context.setFontSize(size),
  );
  fontSizeControl.element.hidden = !controls.fontSize;
  settingsPanel.append(fontSizeControl.element);
  const toggle = doc.createElement('button');
  root.append(
    toolbar,
    settingsPanel,
    tabBar,
    editorHost,
    resultToolbar,
    output,
  );
  container.append(root);
  let disposed = false;
  let cleanup: (() => void) | undefined;
  let selectedRenderer: string | undefined;
  let formatting = false;
  let executedQuery = '';
  let executedDirectives = parseQueryViewDirectives('');
  let applyPreferredView = false;

  function assertAlive(): void {
    if (disposed) throw new Error('Editor has been destroyed.');
  }
  const prefixCollapseByTab = new Map<string, boolean>();
  const context: ForgeEditor = {
    arePrefixesCollapsed() {
      assertAlive();
      return prefixesCollapsed(view.state);
    },
    setPrefixesCollapsed(collapsed) {
      assertAlive();
      prefixCollapseByTab.set(queryTabs.snapshot().activeId, collapsed);
      setPrefixesCollapsed(view, collapsed);
    },
    togglePrefixes() {
      context.setPrefixesCollapsed(!context.arePrefixesCollapsed());
      return context.arePrefixesCollapsed();
    },
    getFontSize() {
      assertAlive();
      return fontSize;
    },
    setFontSize(size) {
      assertAlive();
      validateFontSize(size);
      if (size === fontSize) return;
      fontSize = size;
      editorHost.style.setProperty('--ldforge-query-font-size', `${size}px`);
      fontSizeControl.refresh();
      view.requestMeasure();
      options.onFontSizeChange?.(size);
    },
    isLoadingIndicatorEnabled() {
      assertAlive();
      return loadingIndicatorEnabled;
    },
    setLoadingIndicatorEnabled(enabled) {
      assertAlive();
      loadingIndicatorEnabled = enabled;
      refreshLoadingIndicator();
    },
    getRenderers() {
      assertAlive();
      return renderers.list();
    },
    getRendererWizard() {
      assertAlive();
      return rendererWizard.api;
    },
    getToolBar() {
      assertAlive();
      return toolbarView.api;
    },
    getTabs: () => {
      assertAlive();
      return tabApi.collection;
    },
    formatQuery: (formatOptions) =>
      tabApi.collection.getActive().formatQuery(formatOptions),
    addPrefix: (prefix, namespace) =>
      tabApi.collection.getActive().addPrefix(prefix, namespace),
    getWorkspace: () => queryTabs.snapshot(),
    getLocale: () => locale,
    setLocale(preference) {
      if (disposed) return;
      userLocale = preference;
      locale = resolveLocale(
        userLocale === 'auto' ? (options.locale ?? 'auto') : userLocale,
      );
      refreshLocale();
      options.onLocaleChange?.(preference);
    },
    getQuery: () => view.state.doc.toString(),
    setQuery(query) {
      if (disposed) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: query },
        annotations: isolateHistory.of('full'),
      });
    },
    getState: () => controller.state,
    run: () => {
      executedQuery = context.getQuery();
      executedDirectives = parseQueryViewDirectives(executedQuery);
      applyPreferredView = true;
      return controller.run(executedQuery);
    },
    cancel: () => controller.cancel(),
    focus: () => view.focus(),
    destroy() {
      if (disposed) return;
      rendererWizard.destroy();
      toolbarView.destroy();
      disposed = true;
      unsubscribe();
      controller.destroy();
      try {
        cleanup?.();
      } finally {
        try {
          for (const dispose of settingsCleanups) dispose();
        } finally {
          view.destroy();
          root.remove();
        }
      }
    },
  };

  function editorLocale(): Extension {
    return [
      EditorView.contentAttributes.of({
        'aria-label': translate(locale, 'query'),
      }),
      EditorState.phrases.of({
        'Fold line': translate(locale, 'foldLine'),
        'Unfold line': translate(locale, 'unfoldLine'),
        'folded code': translate(locale, 'foldedCode'),
        unfold: translate(locale, 'unfold'),
        'Folded lines': translate(locale, 'foldedLines'),
        'Unfolded lines': translate(locale, 'unfoldedLines'),
        to: translate(locale, 'toLine'),
      }),
    ];
  }

  function createState(query: string): EditorState {
    let state = EditorState.create({
      doc: query,
      extensions: [
        lineNumbers(),
        prefixFolding(controls.prefixFolding),
        history(),
        sparqlSupport(options.sparql, () => locale),
        syntaxHighlighting(defaultHighlightStyle),
        EditorView.lineWrapping,
        localeCompartment.of(editorLocale()),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              void context.run();
              return true;
            },
          },
          ...foldKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (
            update.transactions.some((transaction) =>
              transaction.effects.some(
                (effect) => effect.is(foldEffect) || effect.is(unfoldEffect),
              ),
            )
          )
            prefixCollapseByTab.set(
              queryTabs.snapshot().activeId,
              prefixesCollapsed(update.state),
            );
          if (update.docChanged) {
            queryTabs.update(update.state.doc.toString());
            options.onQueryChange?.(update.state.doc.toString());
            notifyWorkspace();
            refreshButtons();
          }
        }),
        ...(options.extensions ?? []),
      ],
    });
    if (
      prefixCollapseByTab.get(queryTabs.snapshot().activeId) ??
      options.prefixesCollapsed ??
      false
    )
      state = state.update({
        effects: prefixFoldRanges(state).map((range) => foldEffect.of(range)),
      }).state;
    return state;
  }
  const view = new EditorView({
    parent: editorHost,
    state: createState(queryTabs.query),
  });

  const tabApi = createTabApi({
    snapshot: () => queryTabs.snapshot(),
    locale: () => locale,
    assertAlive,
    catalog,
    warn:
      options.onWarning ??
      ((warning) => console.warn(`[LDForge] ${warning.message}`)),
    setQuery(id, query) {
      if (queryTabs.snapshot().activeId === id) context.setQuery(query);
      else {
        queryTabs.update(query, id);
        notifyWorkspace();
      }
    },
    rename(id, name) {
      queryTabs.rename(id, name);
      refreshTabs();
      notifyWorkspace();
    },
    activate(id) {
      if (queryTabs.select(id)) activateTab();
    },
    delete(id) {
      const before = queryTabs.snapshot().tabs.length;
      const changedActive = queryTabs.close(id);
      if (before === queryTabs.snapshot().tabs.length) return false;
      if (changedActive) activateTab();
      else {
        refreshTabs();
        notifyWorkspace();
      }
      return true;
    },
    add(tabOptions) {
      const id = queryTabs.add(tabOptions);
      if (tabOptions.activate) activateTab();
      else {
        refreshTabs();
        notifyWorkspace();
      }
      return id;
    },
  });
  tabApi.sync();
  function notifyWorkspace(): void {
    tabApi.sync();
    options.onWorkspaceChange?.(queryTabs.snapshot());
  }
  const formatButton = doc.createElement('button');
  formatButton.type = 'button';
  formatButton.className = 'ldforge-icon-button';
  formatButton.innerHTML =
    '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 5h11M9 10h8M9 15h11M9 20h8M3 9l3 3-3 3"/></svg>';
  formatButton.addEventListener('click', () => {
    formatting = true;
    refreshButtons();
    status.textContent = translate(locale, 'formatting');
    void context
      .formatQuery()
      .then(() => {
        if (!disposed)
          status.textContent = formatQueryStatus(controller.state, locale);
      })
      .catch((error: unknown) => {
        if (!disposed)
          status.textContent = translate(locale, 'formatFailed', {
            message: error instanceof Error ? error.message : String(error),
          });
      })
      .finally(() => {
        if (!disposed) {
          formatting = false;
          refreshButtons();
        }
      });
  });
  let toolbarView: ReturnType<typeof createToolbar>;
  try {
    toolbarView = createToolbar(
      {
        core: coreActions,
        custom: customActions,
        context,
        getLocale: () => locale,
        isVisible: (plugin) =>
          (plugin.id !== 'run' || controls.run) &&
          (plugin.id !== 'cancel' || controls.cancel),
        assertAlive,
        onError(error) {
          if (!disposed)
            status.textContent = translate(locale, 'actionFailed', {
              message: error instanceof Error ? error.message : String(error),
            });
        },
      },
      buttons.list(),
      options.toolbar,
    );
  } catch (error) {
    controller.destroy();
    view.destroy();
    root.remove();
    throw error;
  }

  const prefixPicker = createPrefixPicker(
    view,
    catalog,
    () => locale,
    () => {
      settingsPanel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    },
  );
  prefixPicker.panel.id = `${editorHost.id}-prefixes`;
  prefixPicker.toggle.setAttribute('aria-controls', prefixPicker.panel.id);
  if (controls.prefixes) tools.append(prefixPicker.toggle);
  if (controls.format) tools.append(formatButton);
  const rendererWizard = createRendererWizard({
    root,
    tools,
    visible: controls.rendererWizard,
    getLocale: () => locale,
    getRenderers: () => renderers.list(),
    getQuery: () => context.getQuery(),
    setQuery: (query) => context.setQuery(query),
    getTabId: () => queryTabs.snapshot().activeId,
    assertAlive,
    onOpen() {
      prefixPicker.close();
      settingsPanel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    },
  });
  root.insertBefore(prefixPicker.panel, tabBar);

  function refreshButtons(): void {
    formatButton.disabled =
      formatting ||
      controller.state.status === 'running' ||
      !context.getQuery().trim();
    toolbarView.refresh();
  }

  function refreshLoadingIndicator(): void {
    loadingLabel.textContent = translate(locale, 'running');
    if (loadingIndicatorEnabled && controller.state.status === 'running')
      output.append(loadingIndicator);
    else loadingIndicator.remove();
  }

  function renderResult(): void {
    const previousCleanup = cleanup;
    cleanup = undefined;
    try {
      previousCleanup?.();
      output.replaceChildren();
      resultTabs.replaceChildren();
      resultTabs.hidden = true;
      rendererDocs.hidden = true;
      rendererDocs.removeAttribute('href');
      output.removeAttribute('aria-labelledby');
      download.hidden =
        !controls.download || controller.state.status !== 'success';
      const state = controller.state;
      if (state.status !== 'success') {
        refreshLoadingIndicator();
        return;
      }
      const available = renderers
        .list()
        .filter((renderer) => renderer.supports(state.result));
      if (applyPreferredView) {
        if (available.some((plugin) => plugin.id === executedDirectives.view))
          selectedRenderer = executedDirectives.view;
        applyPreferredView = false;
      }
      const renderer =
        available.find((plugin) => plugin.id === selectedRenderer) ??
        available[0];
      resultTabs.hidden = available.length === 0;
      for (const [index, plugin] of available.entries()) {
        const tab = doc.createElement('button');
        tab.type = 'button';
        tab.id = `${output.id}-tab-${index}`;
        tab.dataset.rendererId = plugin.id;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', output.id);
        const selected = plugin === renderer;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        tab.textContent = localize(plugin.label, locale);
        appendIcon(tab, plugin.icon);
        if (selected) output.setAttribute('aria-labelledby', tab.id);
        tab.addEventListener('click', () => {
          if (selectedRenderer === plugin.id) return;
          selectedRenderer = plugin.id;
          renderResult();
          resultTabs
            .querySelector<HTMLButtonElement>('[aria-selected="true"]')
            ?.focus();
        });
        resultTabs.append(tab);
      }
      if (!renderer) {
        output.textContent = translate(locale, 'noRenderer');
        return;
      }
      selectedRenderer = renderer.id;
      if (controls.rendererDocumentation && renderer.documentationUrl) {
        try {
          const url = new URL(renderer.documentationUrl, doc.baseURI);
          if (url.protocol === 'https:' || url.protocol === 'http:') {
            rendererDocs.href = url.href;
            const label = translate(locale, 'rendererDocumentation', {
              renderer: localize(renderer.label, locale),
            });
            rendererDocs.setAttribute('aria-label', label);
            rendererDocs.title = label;
            rendererDocs.hidden = false;
          }
        } catch {
          /* Invalid documentation URLs are not exposed as links. */
        }
      }
      cleanup =
        renderer.render(output, state.result, {
          locale,
          query: executedQuery,
          directives: executedDirectives,
        }) ?? undefined;
    } catch (error) {
      output.textContent = translate(locale, 'rendererFailed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  resultTabs.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [
      ...resultTabs.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ];
    const current = tabs.indexOf(doc.activeElement as HTMLButtonElement);
    if (current < 0) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
            tabs.length;
    tabs[next]?.click();
    resultTabs
      .querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?.focus();
  });
  download.addEventListener('click', () => {
    const state = controller.state;
    if (state.status !== 'success') return;
    try {
      downloadResultsCsv(doc, state.result);
    } catch (error) {
      status.textContent = translate(locale, 'downloadFailed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  const unsubscribe = controller.subscribe((state) => {
    refreshButtons();
    output.setAttribute('aria-busy', String(state.status === 'running'));
    status.textContent = formatQueryStatus(state, locale);
    renderResult();
  });
  status.textContent = 'Ready.';
  refreshButtons();
  {
    toggle.type = 'button';
    toggle.className = 'ldforge-settings-toggle';
    toggle.title = 'IDE settings';
    toggle.setAttribute('aria-label', 'IDE settings');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', settingsPanel.id);
    toggle.innerHTML =
      '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 3-.5 2-2 1-2-.5-2 3 1.5 1.5v3L2.5 15l2 3 2-.5 2 1 .5 2h4l.5-2 2-1 2 .5 2-3-1.5-2v-3L20 8.5l-2-3-2 .5-2-1-.5-2z"/><circle cx="11.5" cy="12" r="3"/></svg>';
    function closeSettings(): void {
      settingsPanel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    }
    toggle.addEventListener('click', () => {
      if (!settingsPanel.hidden) {
        closeSettings();
        return;
      }
      prefixPicker.close();
      settingsPanel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      settingsPanel
        .querySelector<HTMLElement>('input, select, button, textarea')
        ?.focus();
    });
    settingsPanel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeSettings();
      }
    });
    if (controls.settings) tools.append(toggle);
    for (const plugin of controls.settings ? settings.list() : []) {
      const section = doc.createElement('section');
      const heading = doc.createElement('h2');
      heading.textContent = localize(plugin.label, locale);
      const content = doc.createElement('div');
      section.append(heading, content);
      settingsPanel.append(section);
      try {
        const dispose = plugin.render(content, context);
        if (dispose) settingsCleanups.push(dispose);
        settingsViews.push({ plugin, heading, content });
      } catch (error) {
        content.textContent = translate(locale, 'settingsFailed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  function refreshTabs(): void {
    renderQueryTabs(
      tabBar,
      queryTabs.snapshot(),
      locale,
      {
        select(id) {
          if (queryTabs.select(id)) activateTab(false);
        },
        add() {
          tabApi.collection.addTab();
          view.focus();
        },
        rename(id, title) {
          tabApi.collection.getById(id)?.rename(title);
          Array.from(tabBar.querySelectorAll<HTMLElement>('[role="tab"]'))
            .find((tab) => tab.dataset.tabId === id)
            ?.focus();
        },
        close(id) {
          tabApi.collection.getById(id)?.delete();
          tabBar
            .querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
            ?.focus();
        },
      },
      controls,
    );
    const active = tabBar.querySelector('[role="tab"][aria-selected="true"]');
    if (active?.id) editorHost.setAttribute('aria-labelledby', active.id);
  }
  function activateTab(redraw = true): void {
    // One view and one active state: inactive tabs contain only query text.
    controller.cancel();
    view.setState(createState(queryTabs.query));
    if (redraw) refreshTabs();
    else {
      const activeId = queryTabs.snapshot().activeId;
      for (const tab of tabBar.querySelectorAll<HTMLElement>('[role="tab"]')) {
        const selected = tab.dataset.tabId === activeId;
        tab.setAttribute('aria-selected', String(selected));
        if (tab.parentElement)
          tab.parentElement.dataset.active = String(selected);
        tab.tabIndex = selected ? 0 : -1;
        if (selected) editorHost.setAttribute('aria-labelledby', tab.id);
      }
    }
    options.onQueryChange?.(queryTabs.query);
    notifyWorkspace();
  }

  function refreshLocale(): void {
    fontSizeControl.refresh();
    rendererWizard.refreshLocale();
    prefixPicker.refreshLocale();
    tools.setAttribute('aria-label', translate(locale, 'coreTools'));
    customActions.setAttribute('aria-label', translate(locale, 'extraActions'));
    formatButton.title = translate(locale, 'formatQuery');
    formatButton.setAttribute('aria-label', translate(locale, 'formatQuery'));
    refreshTabs();
    root.lang = locale;
    root.setAttribute('aria-label', translate(locale, 'editor'));
    toolbar.setAttribute('aria-label', translate(locale, 'actions'));
    output.setAttribute('aria-label', translate(locale, 'results'));
    resultTabs.setAttribute('aria-label', translate(locale, 'resultView'));
    download.setAttribute('aria-label', translate(locale, 'downloadCsv'));
    download.title = translate(locale, 'downloadCsv');
    settingsPanel.setAttribute('aria-label', translate(locale, 'settings'));
    toggle.title = translate(locale, 'settings');
    toggle.setAttribute('aria-label', translate(locale, 'settings'));
    languageText.textContent = translate(locale, 'language');
    defaultLanguage.textContent = translate(locale, 'automatic');
    languageHelp.textContent = translate(locale, 'languageHelp');
    languageSelect.value = userLocale;
    status.textContent = formatQueryStatus(controller.state, locale);
    view.dispatch({
      effects: localeCompartment.reconfigure(editorLocale()),
    });
    refreshButtons();
    renderResult();
    for (const { plugin, heading, content } of settingsViews) {
      heading.textContent = localize(plugin.label, locale);
      try {
        plugin.updateLocale?.(content, context);
      } catch (error) {
        content.textContent = translate(locale, 'settingsFailed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  languageSelect.addEventListener('change', () => {
    const preference = languageSelect.value;
    if (preference === 'auto' || preference === 'en' || preference === 'nl')
      context.setLocale(preference);
  });
  refreshLocale();
  return context;
}
