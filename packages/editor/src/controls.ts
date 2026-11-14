/** Visibility controls only: hiding a control never disables its public API. */
export interface EditorControls {
  readonly rendererDocumentation?: boolean;
  readonly download?: boolean;
  readonly run?: boolean;
  readonly cancel?: boolean;
  readonly prefixes?: boolean;
  readonly prefixFolding?: boolean;
  readonly format?: boolean;
  readonly rendererWizard?: boolean;
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
    rendererDocumentation: true,
    download: true,
    run: true,
    cancel: true,
    prefixes: true,
    prefixFolding: true,
    format: true,
    rendererWizard: true,
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
