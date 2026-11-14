const key = 'ldforge.demo.font-size.v1';
export function readUserFontSize(): number | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 10 && value <= 24
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
export function saveUserFontSize(value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* Current-session settings still work when storage is unavailable. */
  }
}
