const storageKey = 'ldforge.demo.endpoints.v1';
const maximumEndpoints = 20;

type HistoryStorage = Pick<Storage, 'getItem' | 'setItem'>;
export interface EndpointSettings {
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
}
interface SavedEndpoint {
  readonly endpoint: string;
  readonly method: 'GET' | 'POST';
}

function normalizeEndpoint(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Demo-owned preferences. Header values stay in memory and never enter storage. */
export function createEndpointHistory(
  getStorage: () => HistoryStorage = () => window.localStorage,
) {
  let endpoints: SavedEndpoint[] = [];
  const sessionHeaders = new Map<string, Readonly<Record<string, string>>>();
  try {
    const data: unknown = JSON.parse(getStorage().getItem(storageKey) ?? '[]');
    if (Array.isArray(data)) {
      for (const value of data as unknown[]) {
        const entry =
          typeof value === 'object' && value !== null
            ? (value as Record<string, unknown>)
            : undefined;
        // Accept the original URL-only history without losing existing choices.
        const endpoint = normalizeEndpoint(entry ? entry.endpoint : value);
        if (endpoint && !endpoints.some((item) => item.endpoint === endpoint)) {
          endpoints.push({
            endpoint,
            method: entry?.method === 'GET' ? 'GET' : 'POST',
          });
        }
        if (endpoints.length === maximumEndpoints) break;
      }
    }
  } catch {
    // Corrupt or unavailable storage falls back to an empty session history.
  }

  return {
    list: (): readonly string[] => endpoints.map((item) => item.endpoint),
    settings(value: string): EndpointSettings {
      const endpoint = normalizeEndpoint(value) ?? '';
      return {
        method:
          endpoints.find((item) => item.endpoint === endpoint)?.method ??
          'POST',
        headers: { ...sessionHeaders.get(endpoint) },
      };
    },
    replace(
      previous: string,
      value: string,
      settings: EndpointSettings,
    ): boolean {
      const oldEndpoint = normalizeEndpoint(previous);
      const endpoint = normalizeEndpoint(value);
      if (!endpoint) throw new Error('Endpoint must use HTTP or HTTPS.');
      if (
        !oldEndpoint ||
        !endpoints.some((item) => item.endpoint === oldEndpoint)
      )
        throw new Error('Unknown saved endpoint.');
      if (
        endpoint !== oldEndpoint &&
        endpoints.some((item) => item.endpoint === endpoint)
      )
        throw new Error('Endpoint already exists.');
      endpoints = endpoints.map((item) =>
        item.endpoint === oldEndpoint
          ? { endpoint, method: settings.method }
          : item,
      );
      sessionHeaders.delete(oldEndpoint);
      sessionHeaders.set(endpoint, { ...settings.headers });
      try {
        getStorage().setItem(storageKey, JSON.stringify(endpoints));
        return true;
      } catch {
        return false;
      }
    },
    remember(
      value: string,
      settings: EndpointSettings = { method: 'POST', headers: {} },
    ): boolean {
      const endpoint = normalizeEndpoint(value);
      if (!endpoint) throw new Error('Endpoint must use HTTP or HTTPS.');
      endpoints = [
        { endpoint, method: settings.method },
        ...endpoints.filter((item) => item.endpoint !== endpoint),
      ].slice(0, maximumEndpoints);
      sessionHeaders.set(endpoint, { ...settings.headers });
      for (const key of sessionHeaders.keys()) {
        if (!endpoints.some((item) => item.endpoint === key))
          sessionHeaders.delete(key);
      }
      try {
        getStorage().setItem(storageKey, JSON.stringify(endpoints));
        return true;
      } catch {
        return false;
      }
    },
  };
}
