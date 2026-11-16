# Package changesets

Run `npm run changeset` to describe a package change, or commit a Markdown file
here with a unique name, package names and semver bump types:

```md
---
'@ldforge/editor': minor
---

Add a drag handle to resize the query editor.
```

Commit the file with its code, tests and documentation. Multiple changesets can
accumulate before one release. The release planner automatically includes the
standalone Yasgui bundle for changes to its embedded core/prefix/editor/renderer
code. You can explicitly request a larger Yasgui bump when appropriate.

- `npm run release:plan`: read-only package versions and reasons.
- `npm run release:plan -- --json`: machine-readable plan.
- `npm run release:prepare`: on clean main, consume changesets, update versions,
  changelogs/lockfile, commit a batch record and create local tags. No push.
- `npm run release:push`: push the prepared commit and tags atomically; CI then
  checks and publishes only that batch.
- `npm run release`: prepare and push in one command.

Direct root/workspace `npm version` and `npm run changeset -- version/publish` are
blocked. Keep versioning and publication on the controlled release path.
For prereleases use `npm run changeset -- pre enter beta` and later
`npm run changeset -- pre exit`, committing the mode changes before preparation.
See [Publishing](../docs/publishing.md) for recovery, compatibility and website-only
releases. Do not run any release command merely to test installation.
