/** Small local runtime: optional renderer packages do not depend on one another. */
export interface LazyOptions {
  readonly libraryUrl?: string;
  readonly loadLibrary?: () => Promise<unknown>;
  readonly stylesheetUrl?: string | false;
}
const modules = new Map<string, Promise<unknown>>();
const styles = new WeakMap<Document, Map<string, Promise<void>>>();
export function safeLink(
  doc: Document,
  text: string,
  value?: string,
): HTMLElement {
  let url: URL | undefined;
  try {
    if (value) url = new URL(value);
  } catch {
    /* Invalid values remain plain text. */
  }
  if (url && ['https:', 'http:'].includes(url.protocol)) {
    const link = doc.createElement('a');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = text;
    return link;
  }
  const label = doc.createElement('span');
  label.textContent = text;
  return label;
}
function httpUrl(value: string, base: string): string {
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Expected HTTP(S) asset URL.');
  return url.href;
}
function stylesheet(doc: Document, url: string): Promise<void> {
  let cache = styles.get(doc);
  if (!cache) {
    cache = new Map();
    styles.set(doc, cache);
  }
  let pending = cache.get(url);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      const timeout = setTimeout(fail, 15000);
      function fail() {
        clearTimeout(timeout);
        cache?.delete(url);
        link.remove();
        reject(new Error('Stylesheet failed.'));
      }
      link.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      link.onerror = fail;
      doc.head.append(link);
    });
    cache.set(url, pending);
  }
  return pending;
}
export function lazyLoader(
  options: LazyOptions,
  defaultUrl: string,
  defaultStylesheet?: string,
  exportName?: string,
) {
  let loaded: Promise<unknown> | undefined;
  return (doc: Document): Promise<unknown> => {
    loaded ??= Promise.resolve()
      .then(async () => {
        const url = options.loadLibrary
          ? undefined
          : httpUrl(options.libraryUrl ?? defaultUrl, doc.baseURI);
        let module: Promise<unknown>;
        if (options.loadLibrary) module = options.loadLibrary();
        else {
          module =
            modules.get(url ?? '') ??
            import(/* @vite-ignore */ url ?? '').catch((error: unknown) => {
              modules.delete(url ?? '');
              throw error;
            });
          modules.set(url ?? '', module);
        }
        const css =
          options.stylesheetUrl === false
            ? undefined
            : (options.stylesheetUrl ?? defaultStylesheet);
        const [result] = await Promise.all([
          module,
          css ? stylesheet(doc, httpUrl(css, doc.baseURI)) : Promise.resolve(),
        ]);
        const exports = result as Record<string, unknown> | null;
        const fallback = exports?.default as
          Record<string, unknown> | undefined;
        if (
          exportName &&
          typeof (exports?.[exportName] ?? fallback?.[exportName]) !==
            'function'
        ) {
          if (url) modules.delete(url);
          throw new Error(`Missing ${exportName} export.`);
        }
        return result;
      })
      .catch((error: unknown) => {
        loaded = undefined;
        throw error;
      });
    return loaded;
  };
}
export interface ViewText {
  loading: string;
  failed: string;
  retry: string;
  data: string;
}
export function mountLazyView(
  container: HTMLElement,
  kind: string,
  title: string,
  text: ViewText,
  data: HTMLElement,
  load: (doc: Document) => Promise<unknown>,
  mount: (
    module: unknown,
    frame: HTMLElement,
    controls: HTMLElement,
  ) => () => void,
): () => void {
  const doc = container.ownerDocument;
  const section = doc.createElement('section');
  section.className = `ldforge-${kind}`;
  const heading = doc.createElement('h3');
  heading.textContent = title;
  const controls = doc.createElement('div');
  controls.className = `ldforge-${kind}-controls`;
  Object.assign(controls.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '12px',
  });
  const frame = doc.createElement('div');
  frame.className = `ldforge-${kind}-frame`;
  frame.setAttribute('role', 'region');
  frame.setAttribute('aria-label', title);
  Object.assign(frame.style, {
    height: '420px',
    position: 'relative',
    border: '1px solid #d4dfdd',
    borderRadius: '8px',
    overflow: 'hidden',
    background: '#f8faf7',
  });
  const status = doc.createElement('p');
  status.setAttribute('role', 'status');
  const retry = doc.createElement('button');
  retry.type = 'button';
  retry.textContent = text.retry;
  retry.hidden = true;
  const details = doc.createElement('details');
  const summary = doc.createElement('summary');
  summary.textContent = text.data;
  details.append(summary, data);
  section.append(heading, controls, frame, status, retry, details);
  container.replaceChildren(section);
  let disposed = false;
  let cleanup: (() => void) | undefined;
  let pending = false;
  async function activate() {
    if (pending || disposed) return;
    pending = true;
    status.textContent = text.loading;
    retry.hidden = true;
    frame.hidden = true;
    section.setAttribute('aria-busy', 'true');
    try {
      const module = await load(doc);
      if (disposed) return;
      cleanup?.();
      cleanup = undefined;
      frame.replaceChildren();
      controls.replaceChildren();
      frame.hidden = false;
      cleanup = mount(module, frame, controls);
      status.textContent = '';
    } catch {
      if (disposed) return;
      frame.hidden = true;
      controls.replaceChildren();
      status.textContent = text.failed;
      retry.hidden = false;
    } finally {
      pending = false;
      if (!disposed) section.setAttribute('aria-busy', 'false');
    }
  }
  retry.addEventListener('click', () => {
    void activate();
  });
  void activate();
  return () => {
    disposed = true;
    cleanup?.();
  };
}
export function control(
  doc: Document,
  label: string,
  execute: () => void,
): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', execute);
  return button;
}
