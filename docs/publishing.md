# Publishing LDForge

The public repository is [mightymax/ldforge](https://github.com/mightymax/ldforge). Consumer documentation uses npm packages. Normal installation, builds and tests never publish anything.

## One version for the project

Release from the repository root. `@ldforge/core`, `@ldforge/prefixes`, `@ldforge/renderers`, `@ldforge/charts` and `@ldforge/editor` share one version and one `vVERSION` Git tag. The private root coordinates releases; the demo remains private. Internal dependency ranges are synchronized automatically.

This keeps compatible package combinations easy to identify and avoids five separate release commands. A change to one package releases all five, including unchanged packages. Independent versioning would reduce those releases but require dependency-specific version management; it is unnecessary for the current tightly integrated project.

## One-time npm authentication

The `ldforge` npm organization must own the package scope, and the publishing account must have write access to all five packages. The workflow publishes public packages.

For the first publication, the packages do not yet exist and cannot have trusted publishers configured. Create an npm granular access token with the required package/scope write permissions and permission to publish from CI without an interactive 2FA challenge. Add it in GitHub under **Settings → Secrets and variables → Actions → New repository secret**, named `NPM_TOKEN`. Do not put tokens in source files or release commands. An expired or read-only token cannot publish.

After the first successful publication, configure **Trusted publishing** in the npm settings of each of the five packages:

| Field                 | Value                                                  |
| --------------------- | ------------------------------------------------------ |
| Provider              | GitHub Actions                                         |
| Organization or user  | `mightymax`                                            |
| Repository            | `ldforge`                                              |
| Workflow filename     | `release.yml`                                          |
| Environment           | Leave empty; this workflow does not use an environment |
| Publishing permission | Allow publishing, rather than staging only             |

Remove the GitHub `NPM_TOKEN` secret once every package has its trusted publisher. The workflow then authenticates through GitHub OIDC with short-lived credentials. It uses Node.js 24 and npm 11, with `id-token: write` only in the publishing job. Public GitHub repositories and public packages qualify for automatic provenance with trusted publishing. Follow the current [npm trusted publishing instructions](https://docs.npmjs.com/trusted-publishers/), including any activation deadline shown when configuring a publisher.

## Make a release

Make and commit changes on any branch. Run `npm ci`, install Chromium once with `npx playwright install chromium`, then run `npm run check` locally. Merge or commit the intended changes onto `main` and ensure the working tree is clean, including untracked files.

From the root:

```sh
npm version patch
# Or: npm version minor
# Or: npm version major
# Or: npm version prerelease --preid=beta
```

Do not run all examples: each command creates a release. Starting from `0.1.0`, `npm version patch` releases `0.1.1`.

The lifecycle hooks:

1. Require the repository root, branch `main`, a clean working tree, matching package versions and an accessible `origin`. They fetch remote main and reject behind/diverged history. Local commits ahead of remote main are allowed; no preliminary push is needed.
2. Update all package versions, internal dependency ranges and the lockfile. npm creates the release commit and annotated `vVERSION` tag.
3. Atomically push main and that tag. Both remote updates succeed together or neither does.
4. Start GitHub's **Release** workflow for the tag. Ordinary branch pushes and pull requests do not run GitHub tests.

Use standard npm lifecycle hooks and tag creation. Do not bypass them with `--ignore-scripts`, `--force`, custom tag prefixes or `--no-git-tag-version`. Per-workspace `npm version` commands are rejected. Wait for a release to finish before starting the next one.

The GitHub check job verifies the tag, main ancestry and versions; runs type checking, lint, formatting, coverage, release-hook tests, builds, documentation checks, isolated package installation and Chromium tests; then packs the five packages. Only after success does a separate job publish those exact checked tarballs, in dependency order, and create a GitHub release with the tarballs attached. Artifacts are retained for 14 days. Stable versions use npm's `latest` tag; prereleases use `next`.

When website deployment is configured, a final job calls the reusable website workflow after successful npm publication. Website failures do not roll back already published npm packages. See [Deployment](deployment.md#automated-website-releases) for setup and website-only retries.

## Recover a failed release

If the preversion guard fails, fix the reported condition and rerun the intended command. No version has changed.

If the final push fails, npm may already have created the local release commit and tag. Fix connectivity or remote permissions and retry without another version bump:

```sh
npm run release:push
```

If GitHub checks find a code defect, fix it on main, run local checks and make a new version. Never move a published release tag. For transient infrastructure or authentication failures, fix the cause and rerun the failed workflow jobs in GitHub. If the tarball artifact has expired, rerun the check job too.

Publishing five npm packages is not atomic. The publisher checks every target version before uploading and compares registry integrity hashes to the artifact manifest. A retry skips versions already published with identical bytes and continues the remaining packages. An existing version with different bytes stops the release; resolve it with a new version, never overwrite or unpublish it to force a retry. Registry lookup failures also stop publication before uploading.

## Inspect package contents

```sh
npm run build
npm pack --workspace @ldforge/core --dry-run
npm pack --workspace @ldforge/prefixes --dry-run
npm pack --workspace @ldforge/renderers --dry-run
npm pack --workspace @ldforge/editor --dry-run
npm pack --workspace @ldforge/charts --dry-run
```

Review JavaScript, declarations, source maps, source, README, LICENSE, editor CSS and API documentation. `npm run test:packages` installs actual tarballs in an isolated consumer and checks their public entry points. Release tests use temporary Git repositories and never push this repository or publish to npm.
