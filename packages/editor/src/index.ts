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
  PluginRegistry,
  QueryController,
  localize,
  resolveLocale,
  translate,
} from '@ldforge/core';
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
  ButtonPlugin,
  EditorContext,
  ResultRendererPlugin,
  SettingsPlugin,
  Locale,
  LocalePreference,
} from '@ldforge/core';

export interface EditorOptions {
  readonly executor: QueryExecutor;
  readonly query?: string;
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
  /** Omit to use Run and Cancel; provide an array to replace the toolbar. */
  readonly buttons?: readonly ButtonPlugin[];
  readonly renderers?: readonly ResultRendererPlugin[];
  readonly settings?: readonly SettingsPlugin[];
  readonly extensions?: readonly Extension[];
  readonly onQueryChange?: (query: string) => void;
}
export interface ForgeEditor extends EditorContext {
  getWorkspace(): QueryWorkspace;
  /** Live indexable collection; handles remain stable across edits and renaming. */
  getTabs(): TabCollection;
  /** Format the currently active tab; the async result never overwrites a newer edit. */
  formatQuery(options?: FormatOptions): Promise<string>;
  focus(): void;
  destroy(): void;
}

export function createRunButton(): ButtonPlugin {
  return {
    id: 'run',
    group: 'query',
    label: { en: 'Run query', nl: 'Query uitvoeren' },
    title: {
      en: 'Run query (Ctrl/Cmd+Enter)',
      nl: 'Query uitvoeren (Ctrl/Cmd+Enter)',
    },
    isDisabled: (context) => context.getState().status === 'running',
    execute: (context) => context.run(),
  };
}
export function createCancelButton(): ButtonPlugin {
  return {
    id: 'cancel',
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
  const controls = resolveControls(options.controls);
  const buttons = new PluginRegistry(
    (options.buttons ?? [createRunButton(), createCancelButton()]).filter(
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
  editorHost.id = `ldforge-query-${settingsPanelNumber + 1}`;
  editorHost.setAttribute('role', 'tabpanel');
  tabBar.dataset.panelId = editorHost.id;
  const status = doc.createElement('p');
  status.className = 'ldforge-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const rendererLabel = doc.createElement('label');
  rendererLabel.textContent = 'Result view ';
  const selector = doc.createElement('select');
  selector.setAttribute('aria-label', 'Result view');
  rendererLabel.append(selector);
  rendererLabel.hidden = true;
  const output = doc.createElement('div');
  output.className = 'ldforge-results';
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
  const toggle = doc.createElement('button');
  root.append(
    toolbar,
    settingsPanel,
    tabBar,
    editorHost,
    status,
    rendererLabel,
    output,
  );
  container.append(root);
  let disposed = false;
  let cleanup: (() => void) | undefined;
  let selectedRenderer: string | undefined;
  let formatting = false;

  function assertAlive(): void {
    if (disposed) throw new Error('Editor has been destroyed.');
  }
  const context: ForgeEditor = {
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
    run: () => controller.run(context.getQuery()),
    cancel: () => controller.cancel(),
    focus: () => view.focus(),
    destroy() {
      if (disposed) return;
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

  function createState(query: string): EditorState {
    return EditorState.create({
      doc: query,
      extensions: [
        lineNumbers(),
        history(),
        sparqlSupport(options.sparql, () => locale),
        syntaxHighlighting(defaultHighlightStyle),
        EditorView.lineWrapping,
        localeCompartment.of(
          EditorView.contentAttributes.of({
            'aria-label': translate(locale, 'query'),
          }),
        ),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              void context.run();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
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
  const buttonGroups = new Map<string, HTMLElement>();
  const buttonElements = buttons.list().map((plugin) => {
    const groupId = plugin.group ?? 'actions';
    const core = plugin.id === 'run' || plugin.id === 'cancel';
    const groupKey = `${core ? 'core' : 'custom'}:${groupId}`;
    let group = buttonGroups.get(groupKey);
    if (!group) {
      group = doc.createElement('div');
      group.className = 'ldforge-button-group';
      group.dataset.buttonGroup = groupId;
      group.setAttribute('role', 'group');
      (core ? coreActions : customActions).append(group);
      buttonGroups.set(groupKey, group);
    }
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = localize(plugin.label, locale);
    if (plugin.title) button.title = localize(plugin.title, locale);
    button.addEventListener('click', () => {
      void Promise.resolve()
        .then(() => plugin.execute(context))
        .catch((error: unknown) => {
          if (!disposed)
            status.textContent = translate(locale, 'actionFailed', {
              message: error instanceof Error ? error.message : String(error),
            });
        });
    });
    group.append(button);
    return { plugin, button };
  });

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
  root.insertBefore(prefixPicker.panel, tabBar);

  function refreshButtons(): void {
    formatButton.disabled =
      formatting ||
      controller.state.status === 'running' ||
      !context.getQuery().trim();
    for (const group of buttonGroups.values()) {
      const id = group.dataset.buttonGroup;
      group.setAttribute(
        'aria-label',
        id === 'query'
          ? translate(locale, 'queryExecution')
          : id === 'examples'
            ? translate(locale, 'examples')
            : (id ?? 'actions'),
      );
    }
    for (const { plugin, button } of buttonElements) {
      button.textContent = localize(plugin.label, locale);
      if (plugin.title) button.title = localize(plugin.title, locale);
      button.disabled = plugin.isDisabled?.(context) ?? false;
    }
  }

  function renderResult(): void {
    const previousCleanup = cleanup;
    cleanup = undefined;
    try {
      previousCleanup?.();
      output.replaceChildren();
      selector.replaceChildren();
      rendererLabel.hidden = true;
      const state = controller.state;
      if (state.status !== 'success') return;
      const available = renderers
        .list()
        .filter((renderer) => renderer.supports(state.result));
      for (const renderer of available) {
        const option = doc.createElement('option');
        option.value = renderer.id;
        option.textContent = localize(renderer.label, locale);
        selector.append(option);
      }
      const renderer =
        available.find((plugin) => plugin.id === selectedRenderer) ??
        available[0];
      rendererLabel.hidden = available.length === 0;
      if (!renderer) {
        output.textContent = translate(locale, 'noRenderer');
        return;
      }
      selector.value = renderer.id;
      selectedRenderer = renderer.id;
      cleanup = renderer.render(output, state.result, { locale }) ?? undefined;
    } catch (error) {
      output.textContent = translate(locale, 'rendererFailed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  selector.addEventListener('change', () => {
    selectedRenderer = selector.value;
    renderResult();
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
    selector.setAttribute('aria-label', translate(locale, 'resultView'));
    if (rendererLabel.firstChild)
      rendererLabel.firstChild.textContent = `${translate(locale, 'resultView')} `;
    settingsPanel.setAttribute('aria-label', translate(locale, 'settings'));
    toggle.title = translate(locale, 'settings');
    toggle.setAttribute('aria-label', translate(locale, 'settings'));
    languageText.textContent = translate(locale, 'language');
    defaultLanguage.textContent = translate(locale, 'automatic');
    languageHelp.textContent = translate(locale, 'languageHelp');
    languageSelect.value = userLocale;
    status.textContent = formatQueryStatus(controller.state, locale);
    view.dispatch({
      effects: localeCompartment.reconfigure(
        EditorView.contentAttributes.of({
          'aria-label': translate(locale, 'query'),
        }),
      ),
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
