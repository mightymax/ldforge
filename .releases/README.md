# Release batches

`npm run release:prepare` writes a reviewed batch record here and commits it with
package versions, changelogs and the lockfile. The release commit is tagged with
`release-<UTC timestamp>-<base commit>`. Each participating package also receives
its own `<package name>@<version>` tag at that commit.

Records contain the source base commit, each package's old/new version and release
reasons. CI verifies records against the tagged source and packs only their listed
packages. Artifact manifests add the exact source commit and tarball integrity.
Do not edit a prepared batch, move a published tag or replace registry artifacts.
