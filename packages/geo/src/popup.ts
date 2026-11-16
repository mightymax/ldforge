/** Trusted host DOM factory; result literals are never executable markup. */
export type GeoPopupRenderer = (
  document: Document,
  properties: GeoPopupProperties,
) => HTMLElement | undefined;
export interface GeoPopupProperties {
  label?: unknown;
  height?: unknown;
  image?: unknown;
  description?: unknown;
  link?: unknown;
}

/** Build identical safe, compact popup content for Leaflet and MapLibre. */
export function createGeoPopup(
  doc: Document,
  properties: GeoPopupProperties = {},
  onContentChange?: () => void,
): HTMLElement {
  function httpUrl(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
    } catch {
      return undefined;
    }
  }
  const popup = doc.createElement('div');
  popup.className = 'ldforge-geo-popup';
  Object.assign(popup.style, { maxWidth: '260px', overflowWrap: 'anywhere' });
  const title = doc.createElement('strong');
  const label = typeof properties.label === 'string' ? properties.label : '';
  const href = httpUrl(properties.link);
  if (href) {
    const link = doc.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    title.append(link);
  } else title.textContent = label;
  if (typeof properties.height === 'number')
    title.append(` (${properties.height} m)`);
  popup.append(title);
  const src = httpUrl(properties.image);
  if (src) {
    popup.style.width = '240px';
    const image = doc.createElement('img');
    image.src = src;
    image.alt = label;
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    Object.assign(image.style, {
      display: 'block',
      width: '100%',
      maxHeight: '160px',
      objectFit: 'cover',
      borderRadius: '4px',
      marginTop: '8px',
    });
    image.addEventListener('load', () => onContentChange?.(), { once: true });
    image.addEventListener(
      'error',
      () => {
        image.remove();
        onContentChange?.();
      },
      { once: true },
    );
    popup.append(image);
  }
  if (
    typeof properties.description === 'string' &&
    properties.description.trim()
  ) {
    const description = doc.createElement('p');
    description.textContent = properties.description;
    Object.assign(description.style, {
      margin: '8px 0 0',
      whiteSpace: 'pre-line',
    });
    popup.append(description);
  }
  return popup;
}
