import { setTimeout as delay } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';

export const packagePaths = [
  'packages/core',
  'packages/prefixes',
  'packages/renderers',
  'packages/charts',
  'packages/editor',
];
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const registry = 'https://registry.npmjs.org/';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
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
function npm(root, ...args) {
  // Use the CLI that invoked the lifecycle when possible, without a shell.
  if (process.env.npm_execpath)
    return command(root, process.execPath, [process.env.npm_execpath, ...args]);
  return command(root, 'npm', args);
}
function manifests(root) {
  return ['.', ...packagePaths, 'apps/demo'].map((directory) => ({
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

function assertMainClean(root) {
  if (git(root, 'branch', '--show-current') !== 'main')
    throw new Error(
      'Release only from main. Ordinary edits and commits are allowed on any branch.',
    );
  if (git(root, 'status', '--porcelain=v1', '--untracked-files=all'))
    throw new Error(
      'Release requires a clean working tree, including staged and untracked files. Commit or stash your edits first.',
    );
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

export function guardRelease(root) {
  if (
    Object.hasOwn(process.env, 'npm_config_git_tag_version') &&
    !['true', '1'].includes(process.env.npm_config_git_tag_version)
  )
    throw new Error(
      'Do not disable git-tag-version: root npm version creates and pushes the release tag.',
    );
  if (
    process.env.npm_package_json &&
    resolve(process.env.npm_package_json) !== join(root, 'package.json')
  )
    throw new Error(
      'Run npm version from the repository root, not from a workspace.',
    );
  assertMainClean(root);
  verifyVersions(root);
  git(root, 'remote', 'get-url', 'origin');
  git(
    root,
    'fetch',
    '--quiet',
    '--no-tags',
    'origin',
    'refs/heads/main:refs/remotes/origin/main',
  );
  try {
    git(
      root,
      'merge-base',
      '--is-ancestor',
      'refs/remotes/origin/main',
      'HEAD',
    );
  } catch {
    throw new Error(
      'Local main is behind or diverges from origin/main. Integrate remote changes before releasing. Unpushed local commits are allowed.',
    );
  }
  // Fail before bumping if the server rejects the intended branch push.
  git(root, 'push', '--dry-run', '--atomic', 'origin', 'HEAD:refs/heads/main');
}

export function syncVersions(root) {
  const entries = manifests(root);
  const version = validVersion(entries[0].data.version);
  const names = new Set(
    entries
      .filter((entry) => packagePaths.includes(entry.directory))
      .map((entry) => entry.data.name),
  );
  const lock = readJson(join(root, 'package-lock.json'));
  if (!lock.packages)
    throw new Error('A workspace package-lock v2/v3 is required.');
  for (const entry of entries) {
    const key = entry.directory === '.' ? '' : entry.directory;
    if (!lock.packages[key])
      throw new Error(`Missing lockfile workspace: ${key}`);
    if (packagePaths.includes(entry.directory)) entry.data.version = version;
    for (const field of dependencyFields) {
      for (const name of Object.keys(entry.data[field] ?? {}))
        if (names.has(name)) entry.data[field][name] = `^${version}`;
      if (entry.data[field])
        lock.packages[key][field] = { ...entry.data[field] };
    }
    if (entry.data.version !== undefined)
      lock.packages[key].version = entry.data.version;
  }
  lock.version = version;
  for (const entry of entries) writeJson(entry.path, entry.data);
  writeJson(join(root, 'package-lock.json'), lock);
  verifyVersions(root);
  git(
    root,
    'add',
    '--',
    'package.json',
    'package-lock.json',
    ...entries.slice(1).map((entry) => `${entry.directory}/package.json`),
  );
}

export function pushRelease(root) {
  assertMainClean(root);
  const version = verifyVersions(root);
  const tag = `v${version}`;
  if (
    git(root, 'rev-parse', `${tag}^{commit}`) !== git(root, 'rev-parse', 'HEAD')
  )
    throw new Error(`${tag} must point to the release commit at HEAD.`);
  git(
    root,
    'push',
    '--atomic',
    'origin',
    'refs/heads/main:refs/heads/main',
    `refs/tags/${tag}:refs/tags/${tag}`,
  );
  return tag;
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

export function packRelease(
  root,
  destination = join(root, 'release-artifacts'),
) {
  const version = verifyVersions(root);
  mkdirSync(destination, { recursive: true });
  const packages = packagePaths.map((directory) => {
    const [archive] = JSON.parse(
      npm(
        root,
        'pack',
        '--workspace',
        readJson(join(root, directory, 'package.json')).name,
        '--pack-destination',
        destination,
        '--json',
      ),
    );
    return {
      name: archive.name,
      version: archive.version,
      file: archive.filename,
      integrity: archive.integrity,
    };
  });
  const manifest = {
    version,
    commit: git(root, 'rev-parse', 'HEAD'),
    packages,
  };
  writeJson(join(destination, 'manifest.json'), manifest);
  verifyArtifacts(root, destination);
  return manifest;
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
  const libraries = packagePaths.map((directory) =>
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

export function publicationPlan(manifest, existing) {
  return manifest.packages.map((artifact) => {
    const integrity = existing[artifact.name];
    if (integrity !== undefined && integrity !== artifact.integrity)
      throw new Error(
        `${artifact.name}@${manifest.version} already exists with different bytes. Publish a new version; never overwrite an npm release.`,
      );
    return { ...artifact, skip: integrity !== undefined };
  });
}
function registryIntegrity(root, name, version) {
  const args = [
    'view',
    '--prefer-online',
    `${name}@${version}`,
    'dist.integrity',
    '--json',
    '--registry',
    registry,
  ];
  try {
    const data = JSON.parse(npm(root, ...args));
    if (typeof data !== 'string' || !data) throw new Error('Missing integrity');
    return data;
  } catch (error) {
    let data;
    try {
      data = JSON.parse(error.stdout?.toString() ?? '');
    } catch {
      /* Not a registry JSON error. */
    }
    if (data?.error?.code === 'E404') return undefined;
    throw new Error(
      `Could not verify existing registry version ${name}@${version}. Publication stopped before uploading.`,
      { cause: error },
    );
  }
}
/** npm can accept an upload before the version is visible to registry reads. */
export async function verifyPublishedIntegrity(lookup, expected, options = {}) {
  const attempts = options.attempts ?? 41;
  const sleep = options.sleep ?? delay;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const actual = await lookup();
    if (actual === expected) return;
    if (actual !== undefined)
      throw new Error(
        'Published version has different registry integrity; refusing to continue.',
      );
    if (attempt === attempts - 1) break;
    options.onPending?.(attempt + 1);
    await sleep(Math.min(1_000 * 2 ** attempt, 15_000));
  }
  throw new Error(
    'Upload was accepted but the version is not yet visible in the registry. Retry verification later; do not create another version or overwrite the existing release.',
  );
}
export async function publishRelease(
  root,
  destination = join(root, 'release-artifacts'),
) {
  const manifest = verifyArtifacts(root, destination);
  const existing = Object.fromEntries(
    manifest.packages.map((artifact) => [
      artifact.name,
      registryIntegrity(root, artifact.name, manifest.version),
    ]),
  );
  // Check the entire set before the first upload. A retry skips identical versions.
  const plan = publicationPlan(manifest, existing);
  const tag = versionPattern.exec(manifest.version)?.[4] ? 'next' : 'latest';
  for (const artifact of plan) {
    if (artifact.skip) {
      process.stdout.write(
        `Already published identical ${artifact.name}@${manifest.version}; skipping.\n`,
      );
      continue;
    }
    const args = [
      'publish',
      join(destination, artifact.file),
      '--access',
      'public',
      '--tag',
      tag,
      '--registry',
      registry,
    ];
    // Do not hide successful npm output: it can contain pending-publication diagnostics.
    if (process.env.npm_execpath)
      command(root, process.execPath, [process.env.npm_execpath, ...args], {
        stdio: 'inherit',
      });
    else command(root, 'npm', args, { stdio: 'inherit' });
    await verifyPublishedIntegrity(
      () => registryIntegrity(root, artifact.name, manifest.version),
      artifact.integrity,
      {
        onPending: (attempt) =>
          process.stdout.write(
            `Waiting for ${artifact.name}@${manifest.version} to become visible (${attempt}/40)…\n`,
          ),
      },
    );
    process.stdout.write(
      `Published ${artifact.name}@${manifest.version} (${tag}).\n`,
    );
  }
  return manifest;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const action = process.argv[2];
    if (action === 'preversion') guardRelease(rootDirectory);
    else if (action === 'sync') syncVersions(rootDirectory);
    else if (action === 'push')
      process.stdout.write(
        `Pushed ${pushRelease(rootDirectory)}; GitHub will test and publish this release.\n`,
      );
    else if (action === 'verify-tag')
      process.stdout.write(
        `Verified release ${verifyTag(rootDirectory, process.env.GITHUB_REF_NAME ?? process.argv[3])}.\n`,
      );
    else if (action === 'pack') {
      packRelease(rootDirectory);
      process.stdout.write('Packed all release artifacts.\n');
    } else if (action === 'publish') await publishRelease(rootDirectory);
    else if (action === 'reject-workspace')
      throw new Error(
        'Version all packages together: run npm version patch/minor/major from the repository root on a clean main.',
      );
    else throw new Error(`Unknown release action: ${action}`);
  } catch (error) {
    process.stderr.write(`Release stopped: ${error.message}\n`);
    process.exitCode = 1;
  }
}
