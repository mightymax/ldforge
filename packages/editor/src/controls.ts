/** Visibility controls only: hiding a control never disables its public API. */
export interface EditorControls {
  readonly run?: boolean;
  readonly cancel?: boolean;
  readonly prefixes?: boolean;
  readonly format?: boolean;
  readonly settings?: boolean;
  readonly language?: boolean;
  readonly tabs?: boolean;
  readonly addTab?: boolean;
  readonly renameTab?: boolean;
  readonly closeTab?: boolean;
}
export function resolveControls(
  input?: EditorControls | false,
): Required<EditorControls> {
  const defaults = {
    run: true,
    cancel: true,
    prefixes: true,
    format: true,
    settings: true,
    language: true,
    tabs: true,
    addTab: true,
    renameTab: true,
    closeTab: true,
  };
  return input === false
    ? (Object.fromEntries(
        Object.keys(defaults).map((key) => [key, false]),
      ) as Required<EditorControls>)
    : { ...defaults, ...input };
}
