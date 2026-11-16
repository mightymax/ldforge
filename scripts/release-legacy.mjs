// Read-only compatibility verifier for historical synchronized releases.
// New releases must use release.mjs; this module never versions, pushes or publishes.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
export const packagePaths = [
  'packages/core',
  'packages/prefixes',
  'packages/renderers',
  'packages/charts',
  'packages/geo',
  'packages/network',
  'packages/timeline',
  'packages/pivot',
  'packages/tree',
  'packages/editor',
  'packages/yasgui',
];
function legacyPaths(root) {
  return packagePaths.filter((path) =>
    existsSync(join(root, path, 'package.json')),
  );
}

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function command(root, executable, args, options = {}) {
  const output = execFileSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  return output?.trim() ?? '';
}
function git(root, ...args) {
  return command(root, 'git', args);
}

function manifests(root) {
  return ['.', ...legacyPaths(root), 'apps/demo'].map((directory) => ({
    directory,
    path: join(root, directory, 'package.json'),
    data: readJson(join(root, directory, 'package.json')),
  }));
}
function validVersion(version) {
  const match =
    typeof version === 'string' ? versionPattern.exec(version) : null;
  if (
    !match ||
    match[4]
      ?.split('.')
      .some(
        (part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'),
      )
  )
    throw new Error(`Invalid release version: ${version}`);
  return version;
}

export function verifyVersions(root) {
  const entries = manifests(root);
  const version = validVersion(entries[0].data.version);
  const libraries = entries.filter((entry) =>
    packagePaths.includes(entry.directory),
  );
  if (!entries[0].data.private || !entries.at(-1).data.private)
    throw new Error('Workspace root and demo must stay private.');
  const names = new Set(libraries.map((entry) => entry.data.name));
  for (const entry of libraries) {
    if (entry.data.version !== version)
      throw new Error(`${entry.data.name} must have root version ${version}.`);
    if (entry.data.private || entry.data.publishConfig?.access !== 'public')
      throw new Error(
        `${entry.data.name} must be a public publishable package.`,
      );
  }
  const lock = readJson(join(root, 'package-lock.json'));
  if (lock.version !== version || lock.packages?.['']?.version !== version)
    throw new Error(
      'Root package-lock version differs from the release version.',
    );
  for (const entry of entries) {
    const locked =
      lock.packages[entry.directory === '.' ? '' : entry.directory];
    if (!locked)
      throw new Error(`Missing lockfile workspace: ${entry.directory}`);
    if (
      entry.data.version !== undefined &&
      locked.version !== entry.data.version
    )
      throw new Error(`Lockfile version differs for ${entry.directory}.`);
    for (const field of dependencyFields)
      for (const [name, range] of Object.entries(entry.data[field] ?? {})) {
        if (!names.has(name)) continue;
        if (range !== `^${version}` || locked[field]?.[name] !== range)
          throw new Error(
            `Internal dependency ${name} in ${entry.directory} must be ^${version}, including its lockfile entry.`,
          );
      }
  }
  return version;
}

export function verifyTag(root, tag) {
  if (typeof tag !== 'string' || !tag.startsWith('v'))
    throw new Error('A v-prefixed release tag is required.');
  const version = validVersion(tag.slice(1));
  if (verifyVersions(root) !== version)
    throw new Error(
      'Release tag must exactly match root and library package versions.',
    );
  if (
    git(root, 'rev-parse', `${tag}^{commit}`) !== git(root, 'rev-parse', 'HEAD')
  )
    throw new Error('Checked-out source differs from the release tag.');
  try {
    git(
      root,
      'merge-base',
      '--is-ancestor',
      'HEAD',
      'refs/remotes/origin/main',
    );
  } catch {
    throw new Error(
      'A release tag must point to a commit in origin/main history.',
    );
  }
  return version;
}

export function verifyArtifacts(root, destination) {
  const version = verifyVersions(root);
  const manifest = readJson(join(destination, 'manifest.json'));
  if (
    manifest.version !== version ||
    manifest.commit !== git(root, 'rev-parse', 'HEAD')
  )
    throw new Error(
      'Release artifacts belong to another version or source commit.',
    );
  const libraries = legacyPaths(root).map((directory) =>
    readJson(join(root, directory, 'package.json')),
  );
  if (
    !Array.isArray(manifest.packages) ||
    manifest.packages.length !== libraries.length
  )
    throw new Error(`Expected exactly ${libraries.length} release packages.`);
  for (const [index, artifact] of manifest.packages.entries()) {
    if (
      artifact.name !== libraries[index].name ||
      artifact.version !== version ||
      typeof artifact.file !== 'string' ||
      artifact.file !== basename(artifact.file) ||
      !artifact.file.endsWith('.tgz')
    )
      throw new Error('Invalid release package manifest.');
    const path = join(destination, artifact.file);
    const integrity = `sha512-${createHash('sha512').update(readFileSync(path)).digest('base64')}`;
    if (integrity !== artifact.integrity)
      throw new Error(`Release artifact integrity mismatch: ${artifact.file}`);
    const data = JSON.parse(
      command(root, 'tar', ['-xOf', path, 'package/package.json']),
    );
    if (data.name !== artifact.name || data.version !== version || data.private)
      throw new Error(`Unexpected package metadata in ${artifact.file}`);
  }
  return manifest;
}
