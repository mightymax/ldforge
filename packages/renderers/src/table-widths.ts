/** Percentage widths only: never interpolate arbitrary query strings into CSS. */
export function validColumnWidths(widths: readonly number[]): boolean {
  return (
    widths.length > 0 &&
    widths.every(
      (width) => Number.isFinite(width) && width > 0 && width <= 100,
    ) &&
    Math.abs(widths.reduce((sum, width) => sum + width, 0) - 100) < 0.000001
  );
}
export function parseColumnWidths(value: string): number[] | undefined {
  const parts = value.split(',').map((part) => part.trim());
  if (parts.some((part) => !/^\d+(?:\.\d+)?%$/.test(part))) return undefined;
  const widths = parts.map((part) => Number(part.slice(0, -1)));
  return validColumnWidths(widths) ? widths : undefined;
}
