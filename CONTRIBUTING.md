# Contributing to LDForge

Use English for source comments, documentation, issues, and pull requests.

## Local workflow

1. Use Node.js 22.12+ and run `npm ci`.
2. Run `npm run dev` for the standalone demo.
3. Make a focused change in the package that owns the behavior.
4. Add or update behavior-focused tests where needed.
5. Run `npm run format`, install Chromium with `npx playwright install chromium`, and run `npm run check`.

Keep core independent of UI frameworks and LDMax-specific services. Add editor actions and result views through plugins. Public API changes must include documentation and examples. Do not introduce runtime dependencies without considering their browser impact and license.

Pull requests should explain the problem, resulting behavior, and validation performed. Report meaningful limitations. Never commit credentials or private endpoint data. Contributions are provided under the repository's MIT license; dependencies keep their own licenses.

GitHub runs checks only for release tags. Run `npm run check` locally before submitting changes. Maintainers release all six packages together using `npm version patch` (or another semver increment) from a clean `main` checkout at the repository root. The version hooks synchronize manifests, commit, tag and atomically push main and the tag; the release workflow tests before publishing. See [Publishing](docs/publishing.md) for authentication setup and recovery.

Public API changes must update the relevant object page under `docs/api/`, configuration defaults, the complete typed example and package declarations. The demo API site renders these same Markdown sources; do not maintain separate API prose in HTML. Follow `docs/publishing.md` for an explicitly requested release.
