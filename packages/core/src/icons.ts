/** Return a fresh node for each use. Icons are decorative; the host supplies labels. */
export type PluginIcon = (document: Document) => SVGElement | HTMLElement;

/** Framework-free 24×24 outline icon, using SVG path data rather than HTML. */
export function createSvgIcon(paths: readonly string[]): PluginIcon {
  return (document) => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    for (const [name, value] of Object.entries({
      viewBox: '0 0 24 24',
      width: '18',
      height: '18',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.7',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    }))
      svg.setAttribute(name, value);
    for (const d of paths) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  };
}
