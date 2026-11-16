import {
  readActiveEndpoint,
  saveActiveEndpoint,
} from './endpoint-preference.js';
import { createHttpExecutor, createQueryEndpointExecutor } from '@ldforge/core';
import type { Locale, QueryExecutor, SettingsPlugin } from '@ldforge/core';
import { createEndpointHistory } from './endpoint-history.js';
import type { EndpointSettings } from './endpoint-history.js';
import { endpointText } from './endpoint-messages.js';
import type { EndpointMessage } from './endpoint-messages.js';

export function createEndpointSettings(
  fixtureExecutor: QueryExecutor,
  onEndpointChange?: (label: string, endpoint: string, locale: Locale) => void,
): {
  executor: QueryExecutor;
  getEndpoint(): string;
  plugin: SettingsPlugin;
  /** Demo-owned example actions can configure the same visible endpoint panel. */
  setEndpoint(endpoint: string, method?: 'GET' | 'POST'): void;
} {
  let executor = fixtureExecutor;
  let activeEndpoint = '';
  let updateLabels = () => {};
  let configureEndpoint:
    | ((
        endpoint: string,
        method: 'GET' | 'POST',
        cancelCurrent?: boolean,
      ) => void)
    | undefined;
  return {
    getEndpoint: () => activeEndpoint,
    setEndpoint(endpoint, method = 'GET') {
      if (!configureEndpoint)
        throw new Error('Endpoint settings are not mounted.');
      configureEndpoint(endpoint, method);
    },
    executor: createQueryEndpointExecutor({
      executor: { execute: (request) => executor.execute(request) },
      onEndpoint(endpoint, method) {
        configureEndpoint?.(endpoint, method, false);
      },
    }),
    plugin: {
      id: 'demo.endpoints',
      label: { en: 'Endpoint settings', nl: 'Endpointinstellingen' },
      updateLocale() {
        updateLabels();
      },
      render(container, context) {
        container.innerHTML = `
          <div class="endpoint-overview">
            <div class="endpoint-manager-heading"><h3 data-i18n="saved"></h3><button id="new-endpoint" type="button" data-i18n="addEndpoint"></button></div>
            <p id="endpoint-history-help" class="settings-help" data-i18n="historyHelp"></p>
            <div id="saved-endpoints" role="radiogroup" aria-describedby="endpoint-history-help"></div>
          </div>
          <form id="connection" class="endpoint-editor" hidden>
            <h3 id="endpoint-editor-title"></h3>
            <label for="endpoint" data-i18n="endpoint"></label>
            <input id="endpoint" type="url" required autocomplete="url" />
            <fieldset><legend data-i18n="requestOptions"></legend>
              <label for="endpoint-method" data-i18n="method"></label>
              <select id="endpoint-method"><option value="POST">POST</option><option value="GET">GET</option></select>
              <p class="settings-help" data-i18n="methodHelp"></p>
              <div class="headers-heading"><h2 data-i18n="extraHeaders"></h2><button id="add-header" type="button" data-i18n="addHeader"></button></div>
              <div id="header-rows"></div>
              <p class="settings-help" data-i18n="headerHelp"></p>
            </fieldset>
            <p class="settings-help" data-i18n="applyHelp"></p>
            <div class="endpoint-editor-actions"><button type="submit" data-i18n="saveEndpoint"></button><button id="cancel-endpoint" type="button" data-i18n="cancel"></button></div>
          </form>
          <p id="connection-status" role="status"></p>`;
        const text = (
          key: EndpointMessage,
          values?: Readonly<Record<string, string>>,
        ) => endpointText(context.getLocale(), key, values);
        let activeMethod = 'POST';
        let storageAvailable = true;
        let errorMessage: string | undefined;
        let savedMessage = false;
        let editingEndpoint: string | undefined;
        let headerEndpoint = '';
        const endpointHistory = createEndpointHistory();
        function requireControl<T extends HTMLElement>(selector: string): T {
          const element = container.querySelector<T>(selector);
          if (!element)
            throw new Error(`Connection control is missing: ${selector}`);
          return element;
        }
        const input = requireControl<HTMLInputElement>('#endpoint');
        const overview = requireControl<HTMLElement>('.endpoint-overview');
        const form = requireControl<HTMLFormElement>('#connection');
        const title = requireControl<HTMLElement>('#endpoint-editor-title');
        const addEndpoint = requireControl<HTMLButtonElement>('#new-endpoint');
        const savedEndpoints = requireControl<HTMLElement>('#saved-endpoints');
        const message = requireControl<HTMLElement>('#connection-status');
        const methodInput =
          requireControl<HTMLSelectElement>('#endpoint-method');
        const headerRows = requireControl<HTMLDivElement>('#header-rows');
        let headerNumber = 0;

        function addHeader(name = '', value = ''): void {
          const row = document.createElement('div');
          row.className = 'header-row';
          const number = ++headerNumber;
          const nameLabel = document.createElement('label');
          const nameText = document.createElement('span');
          nameText.dataset.i18n = 'headerName';
          nameText.textContent = text('headerName');
          nameLabel.append(nameText);
          const nameInput = document.createElement('input');
          nameInput.id = `header-name-${number}`;
          nameInput.className = 'header-name';
          nameInput.placeholder = 'Authorization';
          nameInput.value = name;
          nameInput.autocomplete = 'off';
          nameInput.spellcheck = false;
          nameLabel.htmlFor = nameInput.id;
          nameLabel.append(nameInput);
          const valueLabel = document.createElement('label');
          const valueText = document.createElement('span');
          valueText.dataset.i18n = 'headerValue';
          valueText.textContent = text('headerValue');
          valueLabel.append(valueText);
          const valueInput = document.createElement('input');
          valueInput.id = `header-value-${number}`;
          valueInput.className = 'header-value';
          valueInput.placeholder = 'Bearer …';
          valueInput.value = value;
          valueInput.autocomplete = 'off';
          valueInput.spellcheck = false;
          valueLabel.htmlFor = valueInput.id;
          valueLabel.append(valueInput);
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.dataset.i18n = 'remove';
          remove.textContent = text('remove');
          remove.addEventListener('click', () => row.remove());
          row.append(nameLabel, valueLabel, remove);
          headerRows.append(row);
        }

        function loadSettings(endpoint: string): void {
          const settings = endpointHistory.settings(endpoint);
          methodInput.value = settings.method;
          headerRows.replaceChildren();
          for (const [name, value] of Object.entries(settings.headers))
            addHeader(name, value);
        }

        function readSettings(): EndpointSettings {
          const headers = new Headers();
          for (const row of headerRows.querySelectorAll('.header-row')) {
            const name =
              row
                .querySelector<HTMLInputElement>('.header-name')
                ?.value.trim() ?? '';
            const value =
              row.querySelector<HTMLInputElement>('.header-value')?.value ?? '';
            if (!name && !value) continue;
            if (!name) throw new Error(text('missingName'));
            if (['accept', 'content-type'].includes(name.toLowerCase()))
              throw new Error(text('reservedHeader'));
            if (headers.has(name))
              throw new Error(text('duplicateHeader', { name }));
            headers.set(name, value);
          }
          return {
            method: methodInput.value === 'GET' ? 'GET' : 'POST',
            headers: Object.fromEntries(headers),
          };
        }

        requireControl<HTMLButtonElement>('#add-header').addEventListener(
          'click',
          () => {
            addHeader();
            headerRows.lastElementChild?.querySelector('input')?.focus();
          },
        );
        // A changed URL is a different recipient: never transfer credentials implicitly.
        input.addEventListener('input', () => {
          if (input.value.trim() !== headerEndpoint)
            headerRows.replaceChildren();
          headerEndpoint = input.value.trim();
        });

        function refreshEndpointChoices(): void {
          savedEndpoints.replaceChildren();
          savedEndpoints.setAttribute('aria-label', text('saved'));
          for (const endpoint of ['', ...endpointHistory.list()]) {
            const row = document.createElement('div');
            row.className = 'endpoint-choice';
            row.dataset.active = String(endpoint === activeEndpoint);
            const label = document.createElement('label');
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'demo-endpoint';
            radio.value = endpoint;
            radio.checked = endpoint === activeEndpoint;
            radio.setAttribute('aria-label', endpoint || text('fixtureChoice'));
            radio.addEventListener('change', () => {
              if (radio.checked)
                activateEndpoint(endpoint, endpointHistory.settings(endpoint));
            });
            const details = document.createElement('span');
            details.className = 'endpoint-choice-details';
            const name = document.createElement(endpoint ? 'code' : 'span');
            name.textContent = endpoint || text('fixtureChoice');
            const meta = document.createElement('small');
            meta.textContent = [
              endpoint ? endpointHistory.settings(endpoint).method : '',
              endpoint === activeEndpoint ? text('active') : '',
            ]
              .filter(Boolean)
              .join(' · ');
            details.append(name, meta);
            label.append(radio, details);
            row.append(label);
            if (endpoint) {
              const edit = document.createElement('button');
              edit.type = 'button';
              edit.className = 'endpoint-edit-button';
              edit.textContent = text('editEndpoint');
              edit.setAttribute(
                'aria-label',
                `${text('editEndpoint')}: ${endpoint}`,
              );
              edit.addEventListener('click', () => openEditor(endpoint));
              row.append(edit);
            }
            savedEndpoints.append(row);
          }
        }

        function openEditor(endpoint?: string): void {
          editingEndpoint = endpoint;
          input.value = endpoint ?? '';
          headerEndpoint = input.value;
          loadSettings(endpoint ?? '');
          title.textContent = text(endpoint ? 'editEndpoint' : 'newEndpoint');
          errorMessage = undefined;
          savedMessage = false;
          overview.hidden = true;
          form.hidden = false;
          refreshStatus();
          input.focus();
        }
        function closeEditor(): void {
          form.hidden = true;
          overview.hidden = false;
          editingEndpoint = undefined;
          // Remove any credential drafts when leaving the editor.
          headerRows.replaceChildren();
          input.value = '';
        }
        addEndpoint.addEventListener('click', () => openEditor());
        requireControl<HTMLButtonElement>('#cancel-endpoint').addEventListener(
          'click',
          () => {
            closeEditor();
            errorMessage = undefined;
            savedMessage = false;
            refreshStatus();
            addEndpoint.focus();
          },
        );

        function activateEndpoint(
          value: string,
          settings: EndpointSettings,
          cancelCurrent = true,
        ): void {
          const endpoint = value ? new URL(value).href : '';
          const next = endpoint
            ? createHttpExecutor({ endpoint, ...settings })
            : fixtureExecutor;
          if (cancelCurrent) context.cancel();
          executor = next;
          activeEndpoint = endpoint;
          activeMethod = settings.method;
          storageAvailable = saveActiveEndpoint(endpoint) && storageAvailable;
          errorMessage = undefined;
          savedMessage = false;
          refreshEndpointChoices();
          refreshStatus();
        }

        form.addEventListener('submit', (event) => {
          event.preventDefault();
          try {
            const endpoint = new URL(input.value.trim()).href;
            const settings = readSettings();
            // Validate the complete connection before saving anything.
            createHttpExecutor({ endpoint, ...settings });
            if (
              endpoint !== editingEndpoint &&
              endpointHistory.list().includes(endpoint)
            )
              throw new Error(text('duplicateEndpoint'));
            const wasActive = editingEndpoint === activeEndpoint;
            storageAvailable = editingEndpoint
              ? endpointHistory.replace(editingEndpoint, endpoint, settings)
              : endpointHistory.remember(endpoint, settings);
            if (wasActive) activateEndpoint(endpoint, settings);
            closeEditor();
            savedMessage = !wasActive;
            errorMessage = undefined;
            refreshEndpointChoices();
            refreshStatus();
            savedEndpoints
              .querySelector<HTMLInputElement>('input:checked')
              ?.focus();
          } catch (error) {
            errorMessage =
              error instanceof Error ? error.message : String(error);
            refreshStatus();
          }
        });

        configureEndpoint = (endpoint, method, cancelCurrent = true) => {
          const settings: EndpointSettings = { method, headers: {} };
          if (endpoint) {
            createHttpExecutor({ endpoint, ...settings });
            storageAvailable = endpointHistory.remember(endpoint, settings);
          }
          activateEndpoint(endpoint, settings, cancelCurrent);
          if (cancelCurrent) closeEditor();
        };

        function refreshStatus(): void {
          onEndpointChange?.(
            activeEndpoint
              ? `Endpoint: ${activeEndpoint}`
              : text('fixtureChoice'),
            activeEndpoint,
            context.getLocale(),
          );
          message.textContent =
            errorMessage ??
            (savedMessage
              ? text('savedStatus')
              : activeEndpoint
                ? text('liveStatus', {
                    endpoint: activeEndpoint,
                    method: activeMethod,
                  })
                : text('fixtureStatus'));
          if (!storageAvailable)
            message.textContent += ` ${text('storageUnavailable')}`;
        }
        updateLabels = () => {
          for (const element of container.querySelectorAll<HTMLElement>(
            '[data-i18n]',
          ))
            element.textContent = text(element.dataset.i18n as EndpointMessage);
          input.placeholder = text('placeholder');
          title.textContent = text(
            editingEndpoint ? 'editEndpoint' : 'newEndpoint',
          );
          refreshEndpointChoices();
          refreshStatus();
        };
        updateLabels();
        const restoredEndpoint = readActiveEndpoint();
        if (restoredEndpoint) {
          if (!endpointHistory.list().includes(restoredEndpoint))
            storageAvailable = endpointHistory.remember(restoredEndpoint);
          activateEndpoint(
            restoredEndpoint,
            endpointHistory.settings(restoredEndpoint),
            false,
          );
        }
        return () => {
          configureEndpoint = undefined;
          updateLabels = () => {};
          container.replaceChildren();
        };
      },
    },
  };
}
