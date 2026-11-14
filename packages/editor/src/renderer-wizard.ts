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
  const dialog = doc.createElement('dialog');
  dialog.className = 'ldforge-renderer-wizard';
  host.root.append(dialog);
  const heading = doc.createElement('h2');
  heading.id = `${host.root.querySelector('[role=tabpanel]')?.id ?? 'ldforge'}-renderer-wizard-${++wizardNumber}`;
  dialog.id = `${heading.id}-dialog`;
  button.setAttribute('aria-controls', dialog.id);
  dialog.setAttribute('aria-labelledby', heading.id);
  const content = doc.createElement('div');
  const footer = doc.createElement('div');
  footer.className = 'ldforge-wizard-actions';
  const error = doc.createElement('p');
  error.setAttribute('role', 'alert');
  dialog.append(heading, content, error, footer);
  function config(): RendererHeaderConfig {
    return { rendererId, options: values, includeBindings };
  }
  function close() {
    if (!opened) return;
    opened = false;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    button.setAttribute('aria-expanded', 'false');
    if (button.isConnected && !button.hidden) button.focus();
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
        dialog.querySelector<HTMLElement>('select,input,button')?.focus();
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
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      dialog.querySelector<HTMLElement>('select,input,button')?.focus();
    },
  });
  function draw() {
    const locale = host.getLocale();
    const text = messages[locale];
    heading.textContent = `${text.title} · ${text.step} ${step + 1}/3`;
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
      footer.append(control);
      return control;
    }
    if (!renderer) {
      const empty = doc.createElement('p');
      empty.textContent = text.none;
      content.append(empty);
      action(text.close, close);
      return;
    }
    if (step === 0) {
      const label = doc.createElement('label');
      label.textContent = text.renderer;
      const select = doc.createElement('select');
      select.setAttribute('aria-label', text.renderer);
      for (const item of renderers)
        select.append(new Option(localize(item.label, locale), item.id));
      select.value = rendererId;
      select.addEventListener('change', () => {
        rendererId = select.value;
        values = {};
        for (const option of renderers.find((item) => item.id === rendererId)
          ?.wizard?.options ?? [])
          values[option.key] =
            option.defaultValue ?? option.choices?.[0]?.value ?? '';
      });
      label.append(select);
      content.append(label);
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
    action(text.close, close);
    if (step > 0)
      action(text.back, () => {
        step--;
        draw();
        dialog.querySelector<HTMLElement>('select,input,button')?.focus();
      });
    if (step < 2)
      action(text.next, () => {
        step++;
        draw();
        dialog
          .querySelector<HTMLElement>('select,input,textarea,button')
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
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => api.open());
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    if (event.key === 'Tab') {
      const items = [
        ...dialog.querySelectorAll<HTMLElement>('select,input,textarea,button'),
      ].filter((item) => !item.hasAttribute('disabled'));
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  button.title = messages[host.getLocale()].title;
  button.setAttribute('aria-label', button.title);
  return {
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
