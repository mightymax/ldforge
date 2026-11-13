# Testing

Tests must establish observable behavior, especially at package boundaries. Run `npm ci` first. No test relies on a public endpoint or private credentials.

| Suite           | Command                 | Coverage                                                                                                                                                                                                                                        |
| --------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit            | `npm test`              | Plugin identity/order, SELECT/ASK parsing, GET/POST and headers, query lifecycle/timing, locale precedence and query workspace validation, SPARQL grammar/cursor contexts, variable scope, prefix completion/undo and catalog search            |
| DOM integration | `npm test`              | Custom actions/settings, result selection, cleanup, locale switching, one-view virtual tabs, literal rendering and UI errors                                                                                                                    |
| Coverage        | `npm run test:coverage` | All library TypeScript files, including untested files; minimum 85% statements/lines/functions and 80% branches                                                                                                                                 |
| Browser         | `npm run test:e2e`      | CodeMirror keyboard execution, fixture SELECT/ASK, request configuration/authentication, NL/EN overrides, persisted/renamed tabs, live completion/diagnostics, prefix search, result-tab keyboard navigation, CSV downloads and mobile viewport |
| Release hooks   | `npm run test:release`  | Real temporary Git repositories verify root version synchronization, branch/clean-tree guards, unpushed commits, atomic pushes, tag checks and publication retry decisions. No npm publication occurs.                                          |
| Distribution    | `npm run build`         | Dependency-ordered ESM/declaration builds and production demo bundle                                                                                                                                                                            |

Install Chromium once with `npx playwright install chromium`. CI uses `--with-deps` to install browser system dependencies. Playwright starts its own local Vite server. Unit and DOM tests use Vitest and jsdom; actual CodeMirror layout and keyboard behavior are checked in Chromium.

The controller race tests deliberately resolve old requests after new ones and reject requests after cancellation. These cases catch stale-state bugs that ordinary successful endpoint tests cannot detect. Renderer tests include HTML-like text and unsafe-looking URIs to ensure data is rendered as text.

`npm run check` runs type checks, lint, formatting, coverage, builds, API documentation checks, package-consumer checks, and browser tests. Coverage HTML is written to `coverage/index.html`; Playwright retains traces on failure. GitHub runs this command only for release tags, and uploads test artifacts on failure. Ordinary branch pushes and pull requests do not start tests; run checks locally before merging.

When adding a button, test its effect through the editor context. When adding a renderer, test supported result types, empty/unbound values, safe handling of RDF text, and cleanup. When migrating LDMax behavior, reproduce the relevant user-facing behavior in a regression test.

Chart tests validate numeric bindings, series/category ordering, duplicate aggregation, asynchronous loading, retries and cleanup. Browser tests intercept the pinned CDN URL and serve the real Chart.js runtime from a development-only npm dependency, so charts render without relying on an external network. They assert no library request before activation and no repeat request when switching views. The published chart adapter has no Chart.js runtime dependency.

## Deployment checks

Deployment tooling is optional for library contributors. With Helm and Docker installed, run `npm run deploy:check`, `npm run deploy:image:build` and `npm run deploy:test`. These check Helm rendering and real Nginx containers, including non-root/read-only execution, correct asset caching/404 behavior and opt-in analytics. They do not publish an image or contact a Kubernetes cluster. The smoke test uses dummy tracking settings and removes its temporary containers. The ordinary `npm run check` remains usable without Helm or Docker.
