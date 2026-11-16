const key = 'ldforge.demo.auto-grow.v1';
export function readUserAutoGrow(): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}
export function saveUserAutoGrow(value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* The current session still works without persistent storage. */
  }
}
