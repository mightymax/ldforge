import type { Locale } from '@ldforge/core';

/** Resize the existing query view, using the public row/height settings. */
export function createEditorResize(host: {
  editor: HTMLElement;
  getRows(): number;
  getLocale(): Locale;
  resize(rows: number): void;
}) {
  const doc = host.editor.ownerDocument;
  const element = doc.createElement('div');
  element.className = 'ldforge-editor-resize';
  element.tabIndex = 0;
  element.setAttribute('role', 'separator');
  element.setAttribute('aria-orientation', 'horizontal');
  element.setAttribute('aria-controls', host.editor.id);
  element.setAttribute('aria-valuemin', '1');
  element.setAttribute('aria-valuemax', String(Number.MAX_SAFE_INTEGER));
  let dragging:
    | {
        pointer: number;
        y: number;
        height: number;
        line: number;
        padding: number;
      }
    | undefined;
  let oldCursor = '';
  let oldSelect = '';

  function measurements() {
    const scroller = host.editor.querySelector('.cm-scroller');
    const content = host.editor.querySelector('.cm-content');
    const style = scroller
      ? doc.defaultView?.getComputedStyle(scroller)
      : undefined;
    const contentStyle = content
      ? doc.defaultView?.getComputedStyle(content)
      : undefined;
    const line = Number.parseFloat(style?.lineHeight ?? '') || 18;
    const padding = contentStyle
      ? (Number.parseFloat(contentStyle.paddingTop) || 0) +
        (Number.parseFloat(contentStyle.paddingBottom) || 0)
      : 8;
    const height =
      host.editor.getBoundingClientRect().height ||
      host.getRows() * line + padding;
    return { height, line, padding };
  }
  function refresh(): void {
    const nl = host.getLocale() === 'nl';
    const { height, line, padding } = measurements();
    const rows = Math.max(1, Math.round((height - padding) / line));
    element.setAttribute(
      'aria-label',
      nl ? 'Editorhoogte aanpassen' : 'Resize query editor',
    );
    element.title = nl
      ? 'Sleep om de editorhoogte aan te passen. Gebruik de pijltoetsen voor één regel, Shift voor vijf regels.'
      : 'Drag to resize the editor. Use arrow keys for one line, Shift for five lines.';
    element.setAttribute('aria-valuenow', String(rows));
    element.setAttribute(
      'aria-valuetext',
      `${rows} ${nl ? 'regels' : 'lines'}`,
    );
  }
  function finish(): void {
    if (!dragging) return;
    const { pointer } = dragging;
    dragging = undefined;
    delete element.dataset.dragging;
    doc.body.style.cursor = oldCursor;
    doc.body.style.userSelect = oldSelect;
    if (element.hasPointerCapture?.(pointer))
      element.releasePointerCapture(pointer);
    refresh();
  }
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || dragging) return;
    event.preventDefault();
    element.focus({ preventScroll: true });
    dragging = {
      pointer: event.pointerId,
      y: event.clientY,
      ...measurements(),
    };
    element.setPointerCapture(event.pointerId);
    oldCursor = doc.body.style.cursor;
    oldSelect = doc.body.style.userSelect;
    doc.body.style.cursor = 'ns-resize';
    doc.body.style.userSelect = 'none';
    element.dataset.dragging = 'true';
  });
  element.addEventListener('pointermove', (event) => {
    if (
      !dragging ||
      dragging.pointer !== event.pointerId ||
      event.clientY === dragging.y
    )
      return;
    const height = dragging.height + event.clientY - dragging.y;
    host.resize(
      Math.max(
        1,
        Math.min(
          Number.MAX_SAFE_INTEGER,
          Math.round((height - dragging.padding) / dragging.line),
        ),
      ),
    );
    refresh();
  });
  element.addEventListener('pointerup', (event) => {
    if (dragging?.pointer === event.pointerId) finish();
  });
  element.addEventListener('pointercancel', (event) => {
    if (dragging?.pointer === event.pointerId) finish();
  });
  element.addEventListener('lostpointercapture', finish);
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      finish();
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    const { height, line, padding } = measurements();
    const rows = Math.round((height - padding) / line);
    const step = event.shiftKey ? 5 : 1;
    host.resize(
      event.key === 'Home'
        ? 1
        : Math.max(1, rows + (event.key === 'ArrowDown' ? step : -step)),
    );
    refresh();
  });
  const observer = doc.defaultView?.ResizeObserver
    ? new doc.defaultView.ResizeObserver(refresh)
    : undefined;
  observer?.observe(host.editor);
  refresh();
  return {
    element,
    refresh,
    destroy(): void {
      finish();
      observer?.disconnect();
    },
  };
}
