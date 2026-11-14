/** Query images are data: accept absolute web URLs and build DOM without HTML. */
export function createTimelineImage(
  doc: Document,
  value: string | undefined,
  label: string,
  thumbnail = false,
): HTMLImageElement | undefined {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return undefined;
  const image = doc.createElement('img');
  image.src = url.href;
  image.alt = thumbnail ? '' : label;
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.className = thumbnail
    ? 'ldforge-timeline-thumbnail'
    : 'ldforge-timeline-image';
  Object.assign(
    image.style,
    thumbnail
      ? {
          width: '32px',
          height: '32px',
          objectFit: 'cover',
          borderRadius: '3px',
          flexShrink: '0',
        }
      : {
          display: 'block',
          maxWidth: '100%',
          maxHeight: '200px',
          objectFit: 'contain',
          borderRadius: '5px',
          marginTop: '8px',
        },
  );
  image.addEventListener('error', () => image.remove(), { once: true });
  return image;
}
