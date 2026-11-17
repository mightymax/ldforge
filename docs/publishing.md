# Publishing LDForge

The public repository is [mightymax/ldforge](https://github.com/mightymax/ldforge).
The eleven public packages have independent semver versions. One central release
plan and workflow coordinates publication; private root/demo packages are not
published or version-bumped. Installation, builds and tests do not publish.

## Record a package change

```sh
npm run changeset
```

Choose affected packages and patch/minor/major, then describe the change. Commit
the generated `.changeset/<unique-name>.md` alongside code, tests and docs. Files
can also be written manually, for example `.changeset/resize-editor.md`:

```md
---
'@ldforge/editor': minor
---

Add a drag handle to resize the query editor.
```

The planner also includes `@ldforge/yasgui` because its standalone bundle embeds
editor code. It conservatively uses the largest bump among its changed embedded
core/prefix/editor/renderer dependencies, unless an explicit Yasgui changeset
requests a larger bump. A geo/charts/network/timeline/pivot/tree-only change does
not rebuild Yasgui: these plugins are not embedded in that facade.

Source changes require changesets, including new/untracked package files, package
README/build metadata, and copied editor inputs (`docs/api`, `docs/renderers.md`
and `scripts/build-editor-assets.mjs`). Changelogs are generated output. The planner
uses each package's current version tag as its baseline, falling back to historical
`vVERSION` tags, and checks coverage before changing anything.

Internal dependencies are updated when required by their declared ranges. Ranges
for packages being released can also raise their minimum to another package in
that batch, ensuring the advertised functionality is available. Compatible core
updates do not force every dependent to be released. For breaking dependency
changes, review every affected public API and add explicit major changesets where
needed; an automatic dependency bump cannot decide public API compatibility.

## Inspect a release plan

```sh
npm run release:plan
npm run release:plan -- --json
```

Planning is read-only and works on a development branch. It warns when the branch
is not `main` or the working tree contains staged, unstaged or untracked changes.
Warnings go to stderr, so `--json` output remains valid JSON. Preparing or pushing
a release rejects these states with an error. Committed changes on `main` do not
have to be pushed first.

The plan lists each package's
old/new version and the reason: explicit changeset, necessary dependency update,
or embedded bundle change. Multiple changesets accumulate into one release.
An editor minor starting from 1.0.0 normally plans editor 1.1.0 and Yasgui 1.1.0;
core and unrelated plugins remain at 1.0.0.

No package changesets means no npm release. Website-only work uses the separate
[website workflow](deployment.md#automated-website-releases), without dummy package
versions. Tests may still build every package; selective publication does not
weaken integration checks.

## Prepare and release, step by step

Commit/merge the intended changes and changesets to main. Install dependencies
and Chromium as needed, and run the full checks. If a new dependency minimum is not yet published, prepare
the batch locally first so its versioned tarball can be tested, then run the full
checks before pushing. Wait for an existing release,
including website deployment, to finish before starting another.

```sh
npm ci
npx playwright install chromium
npm run check
npm run release:plan
```

Prepare **locally**, from clean main with no untracked files:

```sh
npm run release:prepare
```

This checks branch, working tree, internal ranges and lockfile; fetches main and
rejects behind/diverged history; applies the Changesets plan; updates the lockfile;
and commits versions, changelogs and `.releases/release-<UTC timestamp>-<base SHA>.json`.
It also generates and commits `docs/releases/<batch-tag>.md`, used by the demo
release history and the GitHub release. Curate highlights, verified issue links
and migration examples in `docs/releases/editorial.json` before preparing.
The generator lists the exact old/new versions from the batch record; major
releases require an explicit project upgrade guide. Review the generated Markdown
alongside the release record. Older history is available under `docs/releases/`.
It creates an annotated batch tag and `<package name>@<version>` tags at that commit.
For example `@ldforge/editor@1.1.0`. Only participating packages are versioned.
It does **not** push or publish. Review before continuing:

```sh
git show --stat HEAD
git show HEAD:.releases/<batch-tag>.json
```

Push the exact prepared release when ready:

```sh
npm run release:push
```

Main and all batch/package tags are pushed atomically. The `release-*` batch tag
starts GitHub's Release workflow. Per-package tags do not start duplicate runs.
CI verifies the batch/source/main ancestry, runs all checks and packs exactly the
planned packages. A separate OIDC job publishes the checked tarballs in dependency
order, creates the GitHub release, and optionally deploys the website from that
same commit. Stable package versions use npm `latest`; prereleases use `next`.
Artifacts are retained for 14 days.

Once comfortable with the flow, the combined command prepares and pushes:

```sh
npm run release
```

**This starts a real release**, unlike `release:plan`. Do not use it as a smoke test.
If preparation fails before commit, inspect the local changes and resolve the
failure before retrying; no push or publication has occurred. If a prepared batch
exists, use `release:push` rather than preparing another bump.

## Direct version commands are blocked

Normal root and per-workspace `npm version patch/minor/major` calls fail in
`preversion`, before version files, commits or tags are changed. The old automatic
root `version`/`postversion` sync/push hooks are removed. Use changesets and the
controlled release commands instead. The changeset wrapper also rejects
`version`/`publish`; raw Changesets commands would skip LDForge's bundle and artifact
rules. A manually pushed legacy-style `v*` tag does not trigger the new Release
workflow. CI requires a valid batch record for new publications.

## Prereleases

```sh
npm run changeset -- pre enter beta
# Commit the mode file and normal changesets; inspect/prepare/push as above.
```

Changed packages receive their own `-beta.N` versions and publish with `next`.
The root version stays unchanged. To promote to stable:

```sh
npm run changeset -- pre exit
# Commit this mode change, then inspect/prepare/push the stable release.
```

Changesets tracks prerelease state in `.changeset/pre.json` and its prerelease
changeset files. Keep these in Git. The batch record declares whether the GitHub
release is a prerelease; the batch tag's timestamp is not a semver version.

## npm authentication and provenance

The `ldforge` organization and publishing account must allow public publication
of all eleven packages. Configure npm Trusted Publishing for GitHub owner
`mightymax`, repository `ldforge`, workflow filename `release.yml`, no environment,
and **Allow npm publish** enabled. Keep **Allow npm dist-tag** disabled.
Configure a second publisher for `retry-release.yml` for recovery.

A newly introduced npm package can require a first interactive local publication
before its publisher can be configured. Use a tested, committed build and publish
only that new workspace with `npm publish -w PACKAGE --access public`; this is a
bootstrap operation, not the normal release process.

Do not add CI npm tokens. Both workflows retain Node.js 24/npm 11, GitHub OIDC,
short-lived credentials and automatic provenance for eligible public packages.
`id-token: write` is restricted to the publishing job. Preserve existing trusted
publisher workflow filenames when upgrading. Follow npm's current
[trusted publishing instructions](https://docs.npmjs.com/trusted-publishers/),
including publisher activation deadlines.

## Recover a failed release

For a failed atomic push, fix connectivity/permissions and run `npm run release:push`.
Do not bump again. If main advanced meanwhile, resolve the history conflict first;
never force-push a published release or move its tags.

If checks failed because of a workflow/tooling defect before artifacts were
produced, fix the tooling on main and manually dispatch the **Release** workflow
from main with the existing `release_tag`. It checks out and verifies that exact
tag, reruns all checks and packs its original source before publishing. Recovery
normalizes generated release-record formatting during checks and restores the
exact tagged bytes before packing. It also uses the current demo browser test
harness, restoring the original tests before packing; package source is unchanged. Tags and versions
are never moved or bumped for this recovery. The website uses the verified source
commit as well.

For transient CI/publication failures, rerun failed jobs in the original Release
run. Every target package/version is checked before the first upload. Matching
registry integrity is skipped; different bytes stop the whole publication plan.
The publisher waits for registry visibility after upload instead of republishing.
Never overwrite/unpublish a released version to force recovery. A code defect in
an already published package requires a new changeset/version.

If the artifact expired, rerun its check job. If the original tag has older tooling,
use **Retry tested npm release** (`retry-release.yml`) on main, supplying its exact
batch tag and original artifact run ID. Recovery validates the original successful
check job and source SHA, downloads its original tarballs and uses current tooling
to publish those exact bytes. It never rebuilds or moves the release tag. Both
workflows use the same non-cancelling concurrency group.

The current verifier accepts schema-2 per-package artifact manifests and historical
single-version manifests from `vVERSION` releases, including the older ten-package
layout. Historical recovery uses the historical source's manifests; it does not
require migrating published tags or package versions. New normal releases accept
only the batch-tag/record model. Historical release logic remains isolated in
`scripts/release-legacy.mjs` for verification and regression tests.

If a recovery trusted publisher needs its first successful publication, set the
Actions variable `NPM_RELEASE_VIA_RETRY=true` before the next planned release. The
normal workflow still verifies/tests/packs it, but skips its publishing and website
jobs. Once checks pass, dispatch recovery using that run/tag, wait for publication
and website deployment, then remove the variable. No extra version bump is needed.
Skipping already published artifacts does not activate an unused trusted publisher.

## Compatibility and package checks

`npm run test:packages` installs all current tarballs in an isolated consumer and
checks imports, declarations and package contents. `npm run test:compatibility`
additionally installs current editor/plugins/Yasgui with the declared minimum
core/prefix/renderer versions from npm and checks runtime rendering, declarations
and a single compatible core copy. If a required minimum is introduced by the
unpublished batch, its local tarball is used; unavailable older minimums and
non-404 registry failures fail the check.

Release tests use temporary repositories and local bare remotes. They test plans,
versioning, tags, integrity and recovery without publishing to npm or pushing this
repository. Builds/checks do not perform an actual release.
