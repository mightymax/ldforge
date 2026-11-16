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

const rowsKey = 'ldforge.demo.editor-rows.v1';
export function readUserEditorRows(): number {
  try {
    const value = Number(localStorage.getItem(rowsKey));
    return Number.isSafeInteger(value) && value > 0 ? value : 15;
  } catch {
    return 15;
  }
}
export function saveUserEditorRows(rows: number): void {
  try {
    localStorage.setItem(rowsKey, String(rows));
  } catch {
    /* The current session still works without persistent storage. */
  }
}
