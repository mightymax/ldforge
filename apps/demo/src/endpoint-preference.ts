const storageKey = 'ldforge.demo.active-endpoint.v1';
export function readActiveEndpoint(): string {
  try {
    const saved = localStorage.getItem(storageKey) ?? '';
    if (!saved) return '';
    const url = new URL(saved);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}
export function saveActiveEndpoint(endpoint: string): boolean {
  try {
    localStorage.setItem(storageKey, endpoint);
    return true;
  } catch {
    return false;
  }
}
