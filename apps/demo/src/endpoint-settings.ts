import {
  readActiveEndpoint,
  saveActiveEndpoint,
} from './endpoint-preference.js';
import { createHttpExecutor, createQueryEndpointExecutor } from '@ldforge/core';
import type { QueryExecutor, SettingsPlugin } from '@ldforge/core';
import { createEndpointHistory } from './endpoint-history.js';
import type { EndpointSettings } from './endpoint-history.js';
import { endpointText } from './endpoint-messages.js';
import type { EndpointMessage } from './endpoint-messages.js';

export function createEndpointSettings(
  fixtureExecutor: QueryExecutor,
  onEndpointChange?: (label: string) => void,
): {
  executor: QueryExecutor;
  plugin: SettingsPlugin;
  /** Demo-owned example actions can configure the same visible endpoint panel. */
  setEndpoint(endpoint: string, method?: 'GET' | 'POST'): void;
} {
  let executor = fixtureExecutor;
  let updateLabels = () => {};
  let configureEndpoint:
    | ((
        endpoint: string,
        method: 'GET' | 'POST',
        cancelCurrent?: boolean,
      ) => void)
    | undefined;
  return {
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
          <form id="connection">
            <label for="saved-endpoints" data-i18n="saved"></label>
            <select id="saved-endpoints" aria-describedby="endpoint-history-help"></select>
            <p id="endpoint-history-help" data-i18n="historyHelp"></p>
            <label for="endpoint" data-i18n="endpoint"></label>
            <div class="connection-row"><input id="endpoint" type="url" /><button type="submit" data-i18n="apply"></button></div>
            <fieldset><legend data-i18n="requestOptions"></legend>
              <label for="endpoint-method" data-i18n="method"></label>
              <select id="endpoint-method"><option value="POST">POST</option><option value="GET">GET</option></select>
              <p class="settings-help" data-i18n="methodHelp"></p>
              <div class="headers-heading"><h2 data-i18n="extraHeaders"></h2><button id="add-header" type="button" data-i18n="addHeader"></button></div>
              <div id="header-rows"></div>
              <p class="settings-help" data-i18n="headerHelp"></p>
              <p class="settings-help" data-i18n="applyHelp"></p>
            </fieldset>
            <p id="connection-status" role="status"></p>
          </form>`;
        const text = (
          key: EndpointMessage,
          values?: Readonly<Record<string, string>>,
        ) => endpointText(context.getLocale(), key, values);
        let activeEndpoint = '';
        let activeMethod = 'POST';
        let storageAvailable = true;
        let errorMessage: string | undefined;
        const endpointHistory = createEndpointHistory();
        function requireControl<T extends HTMLElement>(selector: string): T {
          const element = container.querySelector<T>(selector);
          if (!element)
            throw new Error(`Connection control is missing: ${selector}`);
          return element;
        }
        const input = requireControl<HTMLInputElement>('#endpoint');
        const savedEndpoints =
          requireControl<HTMLSelectElement>('#saved-endpoints');
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
        // Do not carry authentication headers from one URL to another.
        input.addEventListener('input', () => loadSettings(input.value.trim()));

        function refreshEndpointChoices(selected = 'choose'): void {
          const placeholder = new Option(text('choose'), 'choose');
          placeholder.disabled = true;
          savedEndpoints.replaceChildren(
            placeholder,
            new Option(text('fixtureChoice'), ''),
            ...endpointHistory
              .list()
              .map((endpoint) => new Option(endpoint, endpoint)),
          );
          savedEndpoints.value = selected;
        }

        function applyEndpoint(value: string, cancelCurrent = true): boolean {
          try {
            const endpoint = value.trim();
            const settings = endpoint
              ? readSettings()
              : { method: 'POST' as const, headers: {} };
            const next = endpoint
              ? createHttpExecutor({ endpoint, ...settings })
              : fixtureExecutor;
            if (cancelCurrent) context.cancel();
            executor = next;
            input.value = endpoint;
            const persisted = endpoint
              ? endpointHistory.remember(endpoint, settings)
              : true;
            refreshEndpointChoices(endpoint ? new URL(endpoint).href : '');
            activeEndpoint = endpoint;
            activeMethod = settings.method;
            storageAvailable = saveActiveEndpoint(endpoint) && persisted;
            errorMessage = undefined;
            refreshStatus();
            return true;
          } catch (error) {
            errorMessage =
              error instanceof Error ? error.message : String(error);
            refreshStatus();
            return false;
          }
        }

        configureEndpoint = (endpoint, method, cancelCurrent = true) => {
          input.value = endpoint;
          methodInput.value = method;
          // Public examples must never inherit another connection's credentials.
          headerRows.replaceChildren();
          if (!applyEndpoint(endpoint, cancelCurrent))
            throw new Error(errorMessage ?? 'Could not configure endpoint.');
        };

        function refreshStatus(): void {
          onEndpointChange?.(
            activeEndpoint
              ? `Endpoint: ${activeEndpoint}`
              : text('fixtureChoice'),
          );
          message.textContent =
            errorMessage ??
            (activeEndpoint
              ? text('liveStatus', {
                  endpoint: activeEndpoint,
                  method: activeMethod,
                }) + (storageAvailable ? '' : ` ${text('storageUnavailable')}`)
              : text('fixtureStatus'));
        }
        updateLabels = () => {
          for (const element of container.querySelectorAll<HTMLElement>(
            '[data-i18n]',
          )) {
            element.textContent = text(element.dataset.i18n as EndpointMessage);
          }
          input.placeholder = text('placeholder');
          refreshEndpointChoices(
            savedEndpoints.options.length ? savedEndpoints.value : 'choose',
          );
          refreshStatus();
        };
        updateLabels();
        refreshEndpointChoices();
        savedEndpoints.addEventListener('change', () => {
          loadSettings(savedEndpoints.value);
          applyEndpoint(savedEndpoints.value);
        });
        container
          .querySelector('#connection')
          ?.addEventListener('submit', (event) => {
            event.preventDefault();
            applyEndpoint(input.value);
          });

        const restoredEndpoint = readActiveEndpoint();
        if (restoredEndpoint) {
          loadSettings(restoredEndpoint);
          applyEndpoint(restoredEndpoint);
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
