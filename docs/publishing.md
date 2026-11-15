# Publishing LDForge

The public repository is [mightymax/ldforge](https://github.com/mightymax/ldforge). Consumer documentation uses npm packages. Normal installation, builds and tests never publish anything.

## One version for the project

Release from the repository root. `@ldforge/core`, `@ldforge/prefixes`, `@ldforge/renderers`, `@ldforge/charts`, `@ldforge/geo`, `@ldforge/network`, `@ldforge/timeline`, `@ldforge/pivot`, `@ldforge/tree` and `@ldforge/editor` share one version and one `vVERSION` Git tag. The private root coordinates releases; the demo remains private. Internal dependency ranges are synchronized automatically.

This keeps compatible package combinations easy to identify and avoids ten separate release commands. A change to one package releases all ten, including unchanged packages. Independent versioning would reduce those releases but require dependency-specific version management; it is unnecessary for the current tightly integrated project.

## One-time npm authentication

The `ldforge` npm organization must own the package scope, and the publishing account must have write access to all ten packages. The workflow publishes public packages.

New packages such as `@ldforge/network`, `@ldforge/timeline`, `@ldforge/pivot` and `@ldforge/tree` require a first interactive local publication (`npm login`, then `npm publish -w PACKAGE --access public`) before their npm Trusted Publishers can be configured. Do this from a tested, committed build; do not add CI npm tokens. Both publication workflows authenticate exclusively through GitHub OIDC; no npm access token is configured in CI. Configure **Trusted publishing** in the npm settings of each of the ten packages:

| Field                 | Value                                                               |
| --------------------- | ------------------------------------------------------------------- |
| Provider              | GitHub Actions                                                      |
| Organization or user  | `mightymax`                                                         |
| Repository            | `ldforge`                                                           |
| Workflow filename     | `release.yml`                                                       |
| Environment           | Leave empty; this workflow does not use an environment              |
| Publishing permission | Enable **Allow npm publish**; leave **Allow npm dist-tag** disabled |

Remove any old GitHub `NPM_TOKEN` secret. After a successful OIDC publication, revoke the old npm token on npmjs.com. The workflows authenticate through GitHub OIDC with short-lived credentials. It uses Node.js 24 and npm 11, with `id-token: write` only in the publishing job. Public GitHub repositories and public packages qualify for automatic provenance with trusted publishing. Follow the current [npm trusted publishing instructions](https://docs.npmjs.com/trusted-publishers/), including any activation deadline shown when configuring a publisher.

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

The GitHub check job verifies the tag, main ancestry and versions; runs type checking, lint, formatting, coverage, release-hook tests, builds, documentation checks, isolated package installation and Chromium tests; then packs the ten packages. Only after success does a separate job publish those exact checked tarballs, in dependency order, and create a GitHub release with the tarballs attached. Artifacts are retained for 14 days. Stable versions use npm's `latest` tag; prereleases use `next`.

When website deployment is configured, a final job calls the reusable website workflow after successful npm publication. Website failures do not roll back already published npm packages. See [Deployment](deployment.md#automated-website-releases) for setup and website-only retries.

## Recover a failed release

If the preversion guard fails, fix the reported condition and rerun the intended command. No version has changed.

If the final push fails, npm may already have created the local release commit and tag. Fix connectivity or remote permissions and retry without another version bump:

```sh
npm run release:push
```

If GitHub checks find a code defect, fix it on main, run local checks and make a new version. Never move a published release tag. For transient infrastructure or authentication failures, fix the cause and rerun the failed workflow jobs in GitHub. If the tarball artifact has expired, rerun the check job too.

Publishing ten npm packages is not atomic. The publisher checks every target version before uploading and compares registry integrity hashes to the artifact manifest. A retry skips versions already published with identical bytes and continues the remaining packages. An existing version with different bytes stops the release; resolve it with a new version, never overwrite or unpublish it to force a retry. Registry lookup failures also stop publication before uploading.

## Validate the recovery workflow's trusted publisher

Each trusted publisher must publish successfully within its own activation window.
Running the retry workflow against already-published artifacts skips every upload
and does not validate an unused publisher.

When a new publication through `retry-release.yml` is needed:

1. Wait for any current release, including website deployment, to finish.
2. Set the repository Actions variable `NPM_RELEASE_VIA_RETRY` to `true`.
3. Make the next ordinary root release with `npm version patch`. The Release
   workflow still verifies, tests and packs the exact tagged source; its normal
   publishing job and dependent website job are skipped.
4. Once the check job succeeds, dispatch `retry-release.yml` on `main` with the
   new `release_tag` and the original Release run's `artifact_run_id`.
5. Wait for recovery publication and website deployment to complete. Remove
   `NPM_RELEASE_VIA_RETRY` so subsequent releases publish normally.

Both workflows share the same concurrency group. Do not bypass version,
source-commit or artifact-integrity checks, republish an existing version, or
change a release tag to validate a publisher.

## Inspect package contents

```sh
npm run build
npm pack --workspace @ldforge/core --dry-run
npm pack --workspace @ldforge/prefixes --dry-run
npm pack --workspace @ldforge/renderers --dry-run
npm pack --workspace @ldforge/editor --dry-run
npm pack --workspace @ldforge/charts --dry-run
npm pack --workspace @ldforge/geo --dry-run
npm pack --workspace @ldforge/network --dry-run
npm pack --workspace @ldforge/timeline --dry-run
npm pack --workspace @ldforge/pivot --dry-run
npm pack --workspace @ldforge/tree --dry-run
```

Review JavaScript, declarations, source maps, source, README, LICENSE, editor CSS and API documentation. `npm run test:packages` installs actual tarballs in an isolated consumer and checks their public entry points. Release tests use temporary Git repositories and never push this repository or publish to npm.

### Recovering a delayed or partially published release

npm may accept a new package before its version becomes visible to registry
reads. The publisher prints npm's upload output and waits up to approximately ten
minutes per package for the exact expected integrity to appear. A different
integrity always stops publication immediately. A retry skips versions whose
integrity already matches; it never overwrites published packages.

Normally, retry the failed publication job in the original **Release** run. If
that tag contains older publication tooling, use **Retry tested npm release**
from `main`, supplying the existing tag and the original Release run ID. This
workflow verifies that the original release checks succeeded and that the
artifacts belong to the exact tagged commit, then publishes those same tarballs
using the current tooling. It does not rebuild packages or move the tag. On
success it creates the GitHub release and deploys the website, like a normal
release. Artifacts must still be within their 14-day retention period.

Add a separate trusted publisher for `retry-release.yml` on all ten packages,
using the same GitHub owner and repository, leaving the environment empty and
enabling **Allow npm publish** only. Keep the `release.yml` publisher in place;
authorization for one workflow filename does not authorize the other. Configure
this before running recovery; the recovery workflow also uses OIDC without an npm token.

## First manual publication of @ldforge/tree

After the feature PR is merged, publish just the new package at the current workspace version (`0.1.6` when introduced). Existing packages need no republishing. Use a clean main checkout and Node.js 24/npm 11:

```sh
git switch main
git pull --ff-only origin main
npm ci
npx playwright install chromium
npm run check
npm pack --workspace @ldforge/tree --dry-run
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm publish --workspace @ldforge/tree --access public --registry=https://registry.npmjs.org/
npm view @ldforge/tree version --registry=https://registry.npmjs.org/
```

Complete the browser login and any npm 2FA challenge. The account must have permission to create public packages in `@ldforge`. Check the workspace version before publication; never overwrite an existing published version. Do not run `npm version` for this bootstrap: it pushes a release tag and starts automated publication of all packages before this new package's trusted publisher is configured.

Once the package is visible, open [@ldforge/tree settings](https://www.npmjs.com/package/@ldforge/tree/access). Add GitHub Actions trusted publishers for owner `mightymax`, repository `ldforge`, first workflow `release.yml`, then `retry-release.yml`. Leave environment empty and enable **Allow npm publish**. Follow any activation instructions/deadline displayed by npm. See the [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/). After setup, future project releases use the ordinary root `npm version patch/minor/major` flow and include this tenth package automatically.
