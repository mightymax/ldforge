type RGB = readonly [number, number, number];

function parseColor(value: string): RGB {
  if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value))
    throw new TypeError(
      'themeMainColor must be an opaque #RGB or #RRGGBB color.',
    );
  const hex =
    value.length === 4
      ? value
          .slice(1)
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : value.slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}
function mix(color: RGB, target: RGB, amount: number): RGB {
  const channel = (index: 0 | 1 | 2) =>
    Math.round(color[index] * (1 - amount) + target[index] * amount);
  return [channel(0), channel(1), channel(2)];
}
function hex(color: RGB): string {
  return (
    '#' + color.map((value) => value.toString(16).padStart(2, '0')).join('')
  );
}
function luminance(color: RGB): number {
  const linear = color.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (
    (linear[0] ?? 0) * 0.2126 +
    (linear[1] ?? 0) * 0.7152 +
    (linear[2] ?? 0) * 0.0722
  );
}
const white: RGB = [255, 255, 255];
const black: RGB = [0, 0, 0];

/** Per-instance tokens. Undefined restores stylesheet defaults and host CSS overrides. */
export function themeTokens(value?: string): Record<string, string> {
  if (value === undefined) return {};
  const main = parseColor(value);
  let ink = main;
  // A 7:1 white contrast leaves room for the tinted selected/hover surfaces.
  for (let step = 1; 1.05 / (luminance(ink) + 0.05) < 7 && step <= 20; step++)
    ink = mix(main, black, step / 20);
  const lightContrast = 1.05 / (luminance(main) + 0.05);
  const darkContrast = (luminance(main) + 0.05) / 0.05;
  return {
    accent: hex(main),
    'accent-fill': hex(main),
    'on-accent': lightContrast >= darkContrast ? '#ffffff' : '#000000',
    'accent-text': hex(ink),
    text: hex(mix(main, black, 0.8)),
    muted: hex(mix(ink, white, 0.12)),
    surface: '#ffffff',
    'surface-subtle': hex(mix(main, white, 0.97)),
    'surface-tinted': hex(mix(main, white, 0.94)),
    hover: hex(mix(main, white, 0.9)),
    selected: hex(mix(main, white, 0.85)),
    border: hex(mix(main, white, 0.72)),
    'border-strong': hex(mix(main, white, 0.4)),
    focus: hex(ink),
    shadow: hex(mix(main, black, 0.65)) + '26',
    backdrop: hex(mix(main, black, 0.65)) + '55',
  };
}

export function applyTheme(
  root: HTMLElement,
  previous: Record<string, string>,
  next: Record<string, string>,
): void {
  for (const name of Object.keys(previous))
    root.style.removeProperty('--ldforge-' + name);
  for (const [name, value] of Object.entries(next))
    root.style.setProperty('--ldforge-' + name, value);
}
