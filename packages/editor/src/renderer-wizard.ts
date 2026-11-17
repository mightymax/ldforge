import { localize, parseQueryViewDirectives } from '@ldforge/core';
import type { Locale, ResultRendererPlugin } from '@ldforge/core';
import {
  applyRendererHeader,
  generateRendererHeader,
} from './renderer-header.js';
import type { RendererHeaderConfig } from './renderer-header.js';
export type { RendererHeaderConfig } from './renderer-header.js';
export interface RendererWizardApi {
  readonly isOpen: boolean;
  readonly isVisible: boolean;
  open(): void;
  close(): void;
  setVisible(visible: boolean): void;
  getRenderers(): readonly ResultRendererPlugin[];
  generate(config: RendererHeaderConfig): string;
  apply(config: RendererHeaderConfig): void;
}
interface Host {
  root: HTMLElement;
  tools: HTMLElement;
  visible: boolean;
  getLocale(): Locale;
  getRenderers(): readonly ResultRendererPlugin[];
  getQuery(): string;
  setQuery(query: string): void;
  getTabId(): string;
  assertAlive(): void;
  onOpen(): void;
}
const messages = {
  en: {
    title: 'Plugin wizard',
    choose: 'Choose a renderer',
    options: 'Choose options',
    preview: 'Review header',
    renderer: 'Renderer',
    next: 'Next',
    back: 'Back',
    close: 'Close',
    apply: 'Apply to query',
    include: 'Include binding contract comments',
    header: 'Generated header',
    none: 'No registered renderers.',
    noOptions: 'This renderer has no header options.',
    noContract: 'This renderer does not declare a binding contract.',
    changed: 'The active query changed. Reopen the wizard to apply a header.',
    step: 'Step',
    hint: 'Choose how to display your query results.',
    bindings: 'Query variables',
    required: 'Required',
    optional: 'Optional',
  },
  nl: {
    title: 'Plugin wizard',
    choose: 'Kies een renderer',
    options: 'Kies de opties',
    preview: 'Controleer de header',
    renderer: 'Renderer',
    next: 'Volgende',
    back: 'Terug',
    close: 'Sluiten',
    apply: 'Toepassen op query',
    include: 'Bindingcontracten als commentaar toevoegen',
    header: 'Gegenereerde header',
    none: 'Geen geregistreerde renderers.',
    noOptions: 'Deze renderer heeft geen headeropties.',
    noContract: 'Deze renderer heeft geen bindingcontract opgegeven.',
    changed:
      'De actieve query is gewijzigd. Open de wizard opnieuw om een header toe te passen.',
    step: 'Stap',
    hint: 'Kies hoe je de resultaten van je query wilt weergeven.',
    bindings: 'Queryvariabelen',
    required: 'Verplicht',
    optional: 'Optioneel',
  },
};
export function createRendererWizard(host: Host) {
  const doc = host.root.ownerDocument;
  let visible = host.visible;
  let opened = false;
  let disposed = false;
  let step = 0;
  let rendererId = '';
  let values: Record<string, string> = {};
  let includeBindings = true;
  let tabId = '';
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'ldforge-icon-button ldforge-wizard-toggle';
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m4 20 12-12 4 4L8 24M13 3v4M11 5h4M20 2v4M18 4h4M3 8v4M1 10h4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  button.hidden = !visible;
  if (visible) host.tools.append(button);
  const dialog = doc.createElement('section');
  dialog.hidden = true;
  dialog.tabIndex = -1;
  dialog.setAttribute('role', 'region');
  dialog.className = 'ldforge-renderer-wizard ldforge-tool-panel';
  host.root.append(dialog);
  const heading = doc.createElement('h2');
  heading.id = `${host.root.querySelector('[role=tabpanel]')?.id ?? 'ldforge'}-renderer-wizard-${++wizardNumber}`;
  dialog.id = `${heading.id}-dialog`;
  button.setAttribute('aria-controls', dialog.id);
  dialog.setAttribute('aria-labelledby', heading.id);
  const progress = doc.createElement('ol');
  progress.className = 'ldforge-wizard-progress';
  const content = doc.createElement('div');
  content.className = 'ldforge-wizard-content';
  const footer = doc.createElement('div');
  footer.className = 'ldforge-wizard-actions';
  const error = doc.createElement('p');
  error.setAttribute('role', 'alert');
  dialog.append(heading, progress, content, error, footer);
  function config(): RendererHeaderConfig {
    return { rendererId, options: values, includeBindings };
  }
  function focusStep() {
    const target =
      content.querySelector<HTMLElement>('input[type=radio]:checked') ??
      content.querySelector<HTMLElement>('select,input,textarea,button') ??
      footer.querySelector<HTMLElement>('button');
    (target ?? dialog).focus();
  }
  function close(restoreFocus = true) {
    if (!opened) return;
    opened = false;
    dialog.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus && button.isConnected && !button.hidden) button.focus();
  }
  const api: RendererWizardApi = Object.freeze<RendererWizardApi>({
    get isOpen() {
      return opened && !disposed;
    },
    get isVisible() {
      return visible && !disposed;
    },
    getRenderers() {
      host.assertAlive();
      return host.getRenderers();
    },
    generate(config) {
      host.assertAlive();
      return generateRendererHeader(
        host.getRenderers(),
        config,
        host.getLocale(),
      );
    },
    apply(config) {
      host.assertAlive();
      host.setQuery(
        applyRendererHeader(
          host.getQuery(),
          api.generate(config),
          host.getRenderers(),
        ),
      );
    },
    close() {
      host.assertAlive();
      close();
    },
    setVisible(value) {
      host.assertAlive();
      visible = value;
      button.hidden = !value;
      if (value)
        host.tools.insertBefore(
          button,
          host.tools.querySelector('.ldforge-settings-toggle'),
        );
      else {
        button.remove();
        close();
      }
    },
    open() {
      host.assertAlive();
      if (opened) {
        focusStep();
        return;
      }
      host.onOpen();
      step = 0;
      tabId = host.getTabId();
      const directives = parseQueryViewDirectives(host.getQuery());
      const renderers = host.getRenderers();
      rendererId =
        renderers.find((renderer) => renderer.id === directives.view)?.id ??
        renderers[0]?.id ??
        '';
      values = {};
      for (const option of renderers.find(
        (renderer) => renderer.id === rendererId,
      )?.wizard?.options ?? []) {
        const value =
          directives[option.key] ??
          option.aliases
            ?.map((alias) => directives[alias])
            .find((value) => value !== undefined) ??
          option.defaultValue ??
          option.choices?.[0]?.value ??
          '';
        values[option.key] =
          option.type === 'select' &&
          !option.choices?.some((choice) => choice.value === value)
            ? (option.defaultValue ?? option.choices?.[0]?.value ?? '')
            : value;
      }
      opened = true;
      button.setAttribute('aria-expanded', 'true');
      draw();
      dialog.hidden = false;
      focusStep();
    },
  });
  function draw() {
    const locale = host.getLocale();
    const text = messages[locale];
    heading.textContent = text.title;
    progress.setAttribute('aria-label', text.step);
    progress.replaceChildren();
    [text.choose, text.options, text.preview].forEach((label, index) => {
      const item = doc.createElement('li');
      if (index === step) item.setAttribute('aria-current', 'step');
      item.dataset.complete = String(index < step);
      const number = doc.createElement('span');
      number.textContent = String(index + 1);
      item.append(number, label);
      progress.append(item);
    });
    button.title = text.title;
    button.setAttribute('aria-label', text.title);
    content.replaceChildren();
    footer.replaceChildren();
    error.textContent = '';
    const title = doc.createElement('h3');
    title.textContent =
      [text.choose, text.options, text.preview][step] ?? text.choose;
    content.append(title);
    const renderers = host.getRenderers();
    const renderer = renderers.find((renderer) => renderer.id === rendererId);
    function action(label: string, run: () => void) {
      const control = doc.createElement('button');
      control.type = 'button';
      control.textContent = label;
      control.addEventListener('click', run);
      if (label === text.next || label === text.apply)
        control.className = 'ldforge-wizard-primary';
      footer.append(control);
      return control;
    }
    if (!renderer) {
      const empty = doc.createElement('p');
      empty.textContent = text.none;
      content.append(empty);
      return;
    }
    if (step === 0) {
      const hint = doc.createElement('p');
      hint.className = 'ldforge-wizard-hint';
      hint.textContent = text.hint;
      const choices = doc.createElement('div');
      choices.className = 'ldforge-wizard-renderers';
      choices.setAttribute('role', 'radiogroup');
      choices.setAttribute('aria-label', text.renderer);
      for (const item of renderers) {
        const card = doc.createElement('label');
        card.className = 'ldforge-wizard-renderer';
        const input = doc.createElement('input');
        input.type = 'radio';
        input.name = `${dialog.id}-renderer`;
        input.value = item.id;
        input.checked = rendererId === item.id;
        input.setAttribute('aria-label', localize(item.label, locale));
        input.addEventListener('change', () => {
          rendererId = item.id;
          values = {};
          for (const option of item.wizard?.options ?? [])
            values[option.key] =
              option.defaultValue ?? option.choices?.[0]?.value ?? '';
        });
        const icon = doc.createElement('span');
        icon.className = 'ldforge-wizard-renderer-icon';
        icon.setAttribute('aria-hidden', 'true');
        if (item.icon) icon.append(item.icon(doc));
        const body = doc.createElement('span');
        const name = doc.createElement('strong');
        name.textContent = localize(item.label, locale);
        body.append(name);
        if (item.wizard?.description) {
          const description = doc.createElement('span');
          description.className = 'ldforge-wizard-renderer-description';
          description.textContent = localize(item.wizard.description, locale);
          body.append(description);
        }
        card.append(input, icon, body);
        choices.append(card);
      }
      content.append(hint, choices);
    }
    if (step === 1) {
      if (renderer.wizard?.description) {
        const description = doc.createElement('p');
        description.textContent = localize(renderer.wizard.description, locale);
        content.append(description);
      }
      const options = renderer.wizard?.options ?? [];
      if (!options.length) {
        const message = doc.createElement('p');
        message.textContent = text.noOptions;
        content.append(message);
      }
      for (const option of options) {
        const label = doc.createElement('label');
        label.textContent = localize(option.label, locale);
        const input =
          option.type === 'select'
            ? doc.createElement('select')
            : doc.createElement('input');
        if (
          input instanceof
          (doc.defaultView?.HTMLSelectElement ?? HTMLSelectElement)
        )
          for (const choice of option.choices ?? [])
            input.append(
              new Option(localize(choice.label, locale), choice.value),
            );
        else (input as HTMLInputElement).type = 'text';
        input.setAttribute('aria-label', localize(option.label, locale));
        input.value =
          values[option.key] ??
          option.defaultValue ??
          option.choices?.[0]?.value ??
          '';
        input.addEventListener('input', () => {
          values[option.key] = input.value;
        });
        input.addEventListener('change', () => {
          values[option.key] = input.value;
        });
        label.append(input);
        content.append(label);
      }
      if (renderer.wizard?.bindings.length) {
        const contract = doc.createElement('section');
        contract.className = 'ldforge-wizard-bindings';
        const heading = doc.createElement('h4');
        heading.textContent = text.bindings;
        const list = doc.createElement('dl');
        for (const binding of renderer.wizard.bindings) {
          const row = doc.createElement('div');
          const name = doc.createElement('dt');
          const code = doc.createElement('code');
          code.textContent = `?${binding.variable}`;
          const badge = doc.createElement('span');
          badge.textContent = binding.required ? text.required : text.optional;
          badge.dataset.required = String(binding.required);
          name.append(code, badge);
          const description = doc.createElement('dd');
          description.textContent = localize(binding.description, locale);
          row.append(name, description);
          list.append(row);
        }
        contract.append(heading, list);
        content.append(contract);
      }
    }
    if (step === 2) {
      const label = doc.createElement('label');
      label.className = 'ldforge-wizard-checkbox';
      const include = doc.createElement('input');
      include.type = 'checkbox';
      include.checked = includeBindings;
      label.append(include, text.include);
      content.append(label);
      const preview = doc.createElement('textarea');
      preview.readOnly = true;
      preview.rows = 12;
      preview.setAttribute('aria-label', text.header);
      function refresh() {
        try {
          preview.value = api.generate(config());
          error.textContent = '';
        } catch (problem) {
          error.textContent =
            problem instanceof Error ? problem.message : String(problem);
        }
      }
      include.addEventListener('change', () => {
        includeBindings = include.checked;
        refresh();
      });
      content.append(preview);
      if (!renderer.wizard?.bindings.length && !renderer.wizard?.description) {
        const message = doc.createElement('p');
        message.textContent = text.noContract;
        content.append(message);
      }
      refresh();
    }
    if (step > 0)
      action(text.back, () => {
        step--;
        draw();
        focusStep();
      });
    if (step < 2)
      action(text.next, () => {
        step++;
        draw();
        dialog
          .querySelector<HTMLElement>(
            'input:checked,select,input,textarea,button',
          )
          ?.focus();
      });
    else
      action(text.apply, () => {
        try {
          if (tabId !== host.getTabId()) throw new Error(text.changed);
          api.apply(config());
          close();
        } catch (problem) {
          error.textContent =
            problem instanceof Error ? problem.message : String(problem);
        }
      });
  }
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => {
    if (opened) close();
    else api.open();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  button.title = messages[host.getLocale()].title;
  button.setAttribute('aria-label', button.title);
  return {
    panel: dialog,
    close: () => close(false),
    api,
    refreshLocale() {
      if (opened) draw();
      else {
        button.title = messages[host.getLocale()].title;
        button.setAttribute('aria-label', button.title);
      }
    },
    destroy() {
      close();
      disposed = true;
      dialog.remove();
      button.remove();
    },
  };
}
let wizardNumber = 0;
