/** Match CodeMirror's Mod-key convention, including iPad external keyboards. */
export function runShortcutLabel(
  platform = typeof navigator === 'undefined' ? '' : navigator.platform,
): string {
  return /Mac|iP(hone|ad|od)/.test(platform) ? '⌘Enter' : 'Ctrl+Enter';
}
