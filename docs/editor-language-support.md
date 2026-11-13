# Editor and SPARQL language support evaluation

Status: investigation and recommendation, not a Monaco or LSP migration. Inspected on 2026-11-13. LDForge now uses local Lezer-based SPARQL parsing, contextual completion, syntax diagnostics and PREFIX assistance. No language server has been integrated.

## Existing LDMax implementation

The local `platform.ldmax.nl` implementation uses Monaco through `monaco-languageclient` and the Codingame Monaco/VS Code API compatibility layer. The package manifest declares version 37.5.0 for the compatibility packages, monaco-languageclient 11.0.2, and qlue-ls ^3.11.1. These describe the inspected checkout, not upstream latest versions.

Evidence in that repository:

- `src/lib/client/sparql/qlue/init.ts`: starts the VS Code API wrapper, a language client, and an editor application; exposes document formatting and disposal.
- `src/lib/client/sparql/qlue/config/config.ts`: registers SPARQL TextMate grammars, themes, editor options and a worker-backed LSP connection with diagnostics on change.
- `src/lib/client/sparql/qlue/config/languageServer.worker.ts`: initializes qlue-ls WebAssembly and bridges LSP messages to the browser.
- `src/lib/client/sparql/qlue/editor.svelte.test.ts`: browser test for worker startup, editing, syntax colors, document formatting and disposal.

This is an embedded Monaco setup with VS Code services, rather than a full VS Code application. No LDMax source was copied or modified during this investigation.

## Separate editor UI from language intelligence

Syntax highlighting colors text. A language server analyzes it and supplies completion, diagnostics, formatting and related capabilities. Replacing the editor alone does not provide SPARQL intelligence.

[Qlue-ls](https://github.com/qlever-dev/qlue-ls) provides SPARQL completion, formatting, diagnostics, code actions and hover information. Backend-powered term suggestions require completion queries configured for the knowledge graph. A WASM worker can handle local language analysis without a separately hosted language-server backend; endpoint-backed suggestions still involve endpoint requests.

CodeMirror has an [LSP client](https://github.com/codemirror/lsp-client) that accepts a custom transport, including worker/WASM arrangements. Its source repository moved to the location linked in its README; the archived GitHub mirror does not mean the project was simply abandoned. Connecting the existing Qlue worker to CodeMirror is a viable integration direction, but compatibility and behavior have not yet been tested in LDForge.

## Tradeoffs for LDForge

| Concern             | CodeMirror plus Qlue                                                                | Monaco plus existing LDMax stack                                                    |
| ------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Existing LDForge UI | Preserves current editor, plugins, settings, tabs and localization                  | Requires replacing the editor integration and retesting those boundaries            |
| Reuse from LDMax    | Reuse worker approach and language-server configuration, write a new client adapter | More direct reuse of current Monaco/LSP integration                                 |
| Embedding           | Fits the current small, modular host setup                                          | Existing LDMax stack includes VS Code services, TextMate setup and multiple workers |
| SPARQL capability   | Supplied by Qlue; adapter must verify supported LSP operations                      | Supplied by Qlue through the established LDMax client                               |
| Virtual tabs        | One editor view, switching the active document                                      | Also supports one editor with switched models; no need for one editor per tab       |
| Browser targets     | Current LDForge browser/mobile smoke tests can be retained                          | Monaco's own FAQ does not claim mobile-browser support                              |
| Resource cost       | Retains current dependency baseline; WASM still adds load                           | Reuses known stack but includes its service and worker configuration                |

The resource comparison is an architectural assessment, not a measured performance benchmark. Compare production transfer size, startup, heap and repeated tab switches before committing to either full language-enabled configuration. See [Monaco's concepts and FAQ](https://github.com/microsoft/monaco-editor) for models, providers, disposal, mobile support and the distinction from VS Code extensions.

## Recommendation

For LDForge's stated aim—an embeddable open-source component—retain CodeMirror initially and evaluate an optional Qlue integration. If immediate, close parity with the existing LDMax editor becomes the overriding goal, Monaco is the more direct migration path. Keep transport, results, persistence and the IDE shell independent of the language adapter. Do not maintain two editor implementations before there is a concrete need.

A focused next experiment should verify keyword/variable completion, valid and invalid SPARQL diagnostics, formatting, endpoint/auth configuration, stale diagnostics after tab changes, worker teardown, and browser builds. Use one language-server worker per IDE where supported and document URIs derived from stable tab IDs. Tab switches must not start another worker. Gate the final choice on measured resource use and actual Qlue/client compatibility.
