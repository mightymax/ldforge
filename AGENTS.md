# Development server

Keep the LDForge demo development server running throughout development and after
finishing a task, unless the user explicitly asks to stop it.

- Use `http://127.0.0.1:4173/` as the persistent preview URL.
- Before starting a server, check whether that URL already serves LDForge and reuse
  it when available.
- If needed, start `npm run dev -- --host 127.0.0.1 --port 4173 --strictPort` from
  the repository root in a persistent background process. Keep its output in a log
  outside the repository, such as `/tmp/ldforge-dev-server.log`.
- Do not rely on Playwright's temporary web server for the user's preview. Keep
  the persistent server running so Playwright can reuse it without stopping it.
- After checks or builds, verify that the preview still responds; restart it if
  necessary. Do not stop unrelated processes or other development servers.

# Changesets and releases

Every change affecting a published package must include a changeset in
`.changeset/` in the same commit or pull request as its code, tests and docs.
Before committing, check that every package change is covered and that all new
user-facing behavior is described; do not rely on another feature's changeset
merely because it bumps the same package.

- Run `npm run changeset`, or create `.changeset/<unique-name>.md` manually with
  the affected package names, semver bump types and a clear release description.
- Use patch for compatible fixes, minor for compatible new features, and major
  for breaking public API changes. Include all directly affected packages.
- Package README/build metadata and documentation copied into published packages
  also require coverage. See [Publishing](docs/publishing.md) for the exact scope.
- The planner automatically includes the standalone Yasgui bundle when its
  embedded packages change; unrelated packages should not receive dummy bumps.
- Demo-only, website-only and repository tooling changes do not require a package
  changeset unless they also affect published package contents or behavior.
- Run `npm run release:plan` to check coverage and planned versions. It is
  read-only and warns for uncommitted changes or a branch other than `main`.
- Do not use `npm version` or manually bump package versions. Preparation and
  publication use the documented release workflow from clean `main`; unpushed
  commits are allowed. Do not release or publish unless the user requests it.

See [Changeset instructions](.changeset/README.md) and
[Publishing](docs/publishing.md) for examples and the release commands.

# Developer experience and project release notes

A clear, consistent developer experience is a primary LDForge goal. Keep public
APIs, configuration, examples, accessibility and migration guidance coherent.

Every release must include project-wide Markdown notes in `docs/releases/`, in
addition to package changelogs. The demo release page and GitHub release use these
same notes. Document updated package versions, user-facing changes, related GitHub
issues where known, and upgrade steps for API or behavior changes. Do not invent
issue links or migration guarantees for historical releases.

`release:prepare` generates and commits the version table and release notes from
the release record. Write a curated narrative and upgrade examples in
`docs/releases/editorial.json`, matched to a changeset ID, before preparation.
Review the generated Markdown before pushing. Never describe unpublished tags as
successful releases. See `docs/publishing.md` for the release workflow.
