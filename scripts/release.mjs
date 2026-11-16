import { setTimeout as delay } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import semver from 'semver';
import { applyReleasePlan } from '@changesets/apply-release-plan';
import {
  packagePaths,
  dependencyFields,
  git,
  readJson,
  libraryManifests,
  dependencyOrder,
  planRelease,
  releaseRecordPath,
} from './release-plan.mjs';
import {
  verifyTag as verifyLegacyTag,
  verifyArtifacts as verifyLegacyArtifacts,
} from './release-legacy.mjs';
export { packagePaths, planRelease } from './release-plan.mjs';
const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
const registry = 'https://registry.npmjs.org/';
function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
function command(root, executable, args, options = {}) {
  return (
    execFileSync(executable, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })?.trim() ?? ''
  );
}
function npm(root, ...args) {
  return process.env.npm_execpath
    ? command(root, process.execPath, [process.env.npm_execpath, ...args])
    : command(root, 'npm', args);
}
export function rejectDirectVersion() {
  throw new Error(
    'Direct npm version is disabled. Use npm run changeset, npm run release:plan, then npm run release (or release:prepare followed by release:push).',
  );
}
/** Validate each package/lock entry independently, including real dependency minimums. */
export function verifyVersions(
  root,
  { checkDependencies = true, dependencyVersions = new Map() } = {},
) {
  const libraries = libraryManifests(root);
  const byName = new Map(
    libraries.map((entry) => [entry.data.name, entry.data]),
  );
  const lock = readJson(join(root, 'package-lock.json'));
  const entries = [
    { directory: '', data: readJson(join(root, 'package.json')) },
    ...libraries,
    {
      directory: 'apps/demo',
      data: readJson(join(root, 'apps/demo/package.json')),
    },
  ];
  if (!entries[0].data.private || !entries.at(-1).data.private)
    throw new Error('Workspace root and demo must stay private.');
  for (const entry of entries) {
    const locked = lock.packages?.[entry.directory];
    if (!locked || locked.version !== entry.data.version)
      throw new Error(
        `Lockfile version differs for ${entry.directory || 'root'}.`,
      );
    if (entry.data.version !== undefined && !semver.valid(entry.data.version))
      throw new Error(`Invalid package version: ${entry.data.name}`);
    if (
      byName.has(entry.data.name) &&
      (entry.data.private || entry.data.publishConfig?.access !== 'public')
    )
      throw new Error(`${entry.data.name} must be public.`);
    for (const field of dependencyFields)
      for (const [name, range] of Object.entries(entry.data[field] ?? {})) {
        if (!byName.has(name)) continue;
        if (
          !semver.validRange(range) ||
          (checkDependencies &&
            !semver.satisfies(byName.get(name).version, range) &&
            !semver.satisfies(
              dependencyVersions.get(name) ?? byName.get(name).version,
              range,
            ))
        )
          throw new Error(
            `Internal dependency ${name} in ${entry.directory || 'root'} does not accept ${byName.get(name).version}: ${range}`,
          );
        if (locked[field]?.[name] !== range)
          throw new Error(
            `Lockfile dependency differs for ${entry.directory}: ${name}`,
          );
      }
  }
  if (lock.version !== entries[0].data.version)
    throw new Error('Root lockfile version differs.');
  dependencyOrder(libraries);
  return libraries;
}
export function guardRelease(
  root,
  { fetch = true, checkDependencies = true } = {},
) {
  if (git(root, 'branch', '--show-current') !== 'main')
    throw new Error('Release only from main.');
  if (git(root, 'status', '--porcelain=v1', '--untracked-files=all'))
    throw new Error(
      'Release requires a clean working tree, including untracked files.',
    );
  verifyVersions(root, { checkDependencies });
  if (fetch)
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
    throw new Error('Local main is behind or diverges from origin/main.');
  }
}
function ensureTag(root, tag) {
  let existing;
  try {
    existing = git(root, 'rev-parse', '--verify', `refs/tags/${tag}^{commit}`);
  } catch {
    /* New tag. */
  }
  const head = git(root, 'rev-parse', 'HEAD');
  if (existing && existing !== head)
    throw new Error(`Tag ${tag} already points to another commit.`);
  if (!existing) git(root, 'tag', '-a', tag, '-m', tag);
}
function recordAtHead(root) {
  const subject = git(root, 'log', '-1', '--format=%s');
  if (!subject.startsWith('chore(release): release-'))
    throw new Error(
      'HEAD is not a prepared release. Run npm run release:prepare first.',
    );
  const tag = subject.slice('chore(release): '.length);
  return readJson(releaseRecordPath(root, tag));
}
function verifyRecord(root, record) {
  if (
    record.schemaVersion !== 2 ||
    typeof record.baseCommit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(record.baseCommit)
  )
    throw new Error('Invalid release batch record.');
  releaseRecordPath(root, record.releaseTag);
  if (!record.baseCommit.startsWith(record.releaseTag.split('-').at(-1)))
    throw new Error('Release tag differs from its source base.');
  if (git(root, 'rev-parse', 'HEAD^') !== record.baseCommit)
    throw new Error('Release base must be the release commit parent.');
  const libraries = verifyVersions(root);
  const orderedNames = dependencyOrder(libraries).map(
    (entry) => entry.data.name,
  );
  if (!Array.isArray(record.releases) || !record.releases.length)
    throw new Error('A release batch needs at least one package.');
  const names = record.releases.map((release) => release.name);
  if (
    new Set(names).size !== names.length ||
    JSON.stringify(names) !==
      JSON.stringify(orderedNames.filter((name) => names.includes(name)))
  )
    throw new Error('Invalid or unordered release packages.');
  for (const entry of libraries) {
    const before = JSON.parse(
      git(root, 'show', `${record.baseCommit}:${entry.directory}/package.json`),
    );
    const release = record.releases.find(
      (item) => item.name === entry.data.name,
    );
    if (!release) {
      if (entry.data.version !== before.version)
        throw new Error(`Unplanned version change: ${entry.data.name}`);
      continue;
    }
    if (
      release.oldVersion !== before.version ||
      release.newVersion !== entry.data.version ||
      !semver.gt(release.newVersion, release.oldVersion) ||
      !['patch', 'minor', 'major'].includes(release.type) ||
      !Array.isArray(release.reasons) ||
      !release.reasons.length
    )
      throw new Error(`Invalid planned version: ${entry.data.name}`);
  }
  for (const release of record.releases) {
    if (
      !semver.prerelease(release.oldVersion) &&
      !semver.prerelease(release.newVersion) &&
      semver.inc(release.oldVersion, release.type) !== release.newVersion
    )
      throw new Error(
        `Version increment does not match its release type: ${release.name}`,
      );
  }
  const allowed = new Set([
    'package.json',
    'package-lock.json',
    'apps/demo/package.json',
    `.releases/${record.releaseTag}.json`,
    ...libraries.flatMap((entry) => [
      `${entry.directory}/package.json`,
      `${entry.directory}/CHANGELOG.md`,
    ]),
  ]);
  for (const path of git(
    root,
    'diff',
    '--name-only',
    record.baseCommit,
    'HEAD',
  ).split('\n'))
    if (
      !allowed.has(path) &&
      !/^\.changeset\/(?:pre\/)?[a-zA-Z0-9_.-]+\.(md|json)$/.test(path)
    )
      throw new Error(
        `Release commit contains an unexpected source change: ${path}`,
      );
  return record;
}
function syncWorkspaceLock(root) {
  const lockPath = join(root, 'package-lock.json');
  const lock = readJson(lockPath);
  for (const directory of ['', ...packagePaths, 'apps/demo']) {
    const data = readJson(join(root, directory, 'package.json'));
    const locked = lock.packages?.[directory];
    if (!locked) throw new Error(`Missing workspace lock entry: ${directory}`);
    if (data.version === undefined) delete locked.version;
    else locked.version = data.version;
    for (const field of dependencyFields) {
      if (data[field]) locked[field] = { ...data[field] };
      else delete locked[field];
    }
  }
  writeJson(lockPath, lock);
}

export async function prepareRelease(
  root,
  { now = new Date(), fetch = true } = {},
) {
  guardRelease(root, { fetch, checkDependencies: false });
  const plan = await planRelease(root);
  verifyVersions(root, {
    dependencyVersions: new Map(
      plan.releases.map((release) => [release.name, release.newVersion]),
    ),
  });
  if (!plan.releases.length)
    throw new Error(
      'No package releases planned. Add a changeset, or deploy website-only changes using the website workflow.',
    );
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15);
  const releaseTag = `release-${timestamp}-${plan.baseCommit.slice(0, 7)}`;
  const tags = [
    releaseTag,
    ...plan.releases.map((release) => `${release.name}@${release.newVersion}`),
  ];
  for (const tag of tags) {
    try {
      git(root, 'show-ref', '--verify', '--quiet', `refs/tags/${tag}`);
    } catch {
      continue;
    }
    throw new Error(`Release tag already exists: ${tag}`);
  }
  await applyReleasePlan(
    plan.changesetsPlan,
    plan.packages,
    plan.config,
    undefined,
    root,
  );
  // Private apps are not versioned, but must keep resolving local prerelease/major dependencies.
  const versions = new Map(
    libraryManifests(root).map((entry) => [
      entry.data.name,
      entry.data.version,
    ]),
  );
  for (const directory of ['', 'apps/demo']) {
    const path = join(root, directory, 'package.json');
    const data = readJson(path);
    for (const field of dependencyFields)
      for (const [name, range] of Object.entries(data[field] ?? {}))
        if (versions.has(name) && !semver.satisfies(versions.get(name), range))
          data[field][name] = `^${versions.get(name)}`;
    writeJson(path, data);
  }
  syncWorkspaceLock(root);
  npm(
    root,
    'install',
    '--package-lock-only',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  );
  syncWorkspaceLock(root);
  verifyVersions(root);
  const record = {
    schemaVersion: 2,
    releaseTag,
    baseCommit: plan.baseCommit,
    changesets: plan.changesets,
    releases: plan.releases,
    prerelease: plan.releases.some((release) =>
      Boolean(semver.prerelease(release.newVersion)),
    ),
  };
  mkdirSync(join(root, '.releases'), { recursive: true });
  writeJson(join(root, '.releases', `${releaseTag}.json`), record);
  git(
    root,
    'add',
    '-A',
    '--',
    '.changeset',
    '.releases',
    'package.json',
    'package-lock.json',
    'apps/demo/package.json',
    ...packagePaths,
  );
  git(root, 'commit', '-m', `chore(release): ${releaseTag}`);
  for (const tag of tags) ensureTag(root, tag);
  verifyRecord(root, record);
  return record;
}
export function pushRelease(root, { fetch = true } = {}) {
  guardRelease(root, { fetch });
  const record = verifyRecord(root, recordAtHead(root));
  const tags = [
    record.releaseTag,
    ...record.releases.map(
      (release) => `${release.name}@${release.newVersion}`,
    ),
  ];
  for (const tag of tags) ensureTag(root, tag);
  git(
    root,
    'push',
    '--atomic',
    'origin',
    'refs/heads/main:refs/heads/main',
    ...tags.map((tag) => `refs/tags/${tag}:refs/tags/${tag}`),
  );
  return record.releaseTag;
}
export function verifyTag(root, tag, { allowLegacy = false } = {}) {
  if (allowLegacy && /^v\d/.test(tag)) return verifyLegacyTag(root, tag);
  const record = readJson(releaseRecordPath(root, tag));
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
  verifyRecord(root, record);
  if (record.releaseTag !== tag)
    throw new Error('Release record/tag mismatch.');
  return tag;
}
export function packRelease(
  root,
  destination = join(root, 'release-artifacts'),
) {
  if (git(root, 'status', '--porcelain=v1', '--untracked-files=all'))
    throw new Error('Pack releases only from clean, tested source.');
  const record = verifyRecord(root, recordAtHead(root));
  mkdirSync(destination, { recursive: true });
  const packages = record.releases.map((release) => {
    const [archive] = JSON.parse(
      npm(
        root,
        'pack',
        '--workspace',
        release.name,
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
    schemaVersion: 2,
    releaseTag: record.releaseTag,
    commit: git(root, 'rev-parse', 'HEAD'),
    packages,
  };
  writeJson(join(destination, 'manifest.json'), manifest);
  verifyArtifacts(root, destination);
  return manifest;
}
export function verifyArtifacts(root, destination) {
  const manifest = readJson(join(destination, 'manifest.json'));
  if (
    manifest.schemaVersion === undefined &&
    typeof manifest.version === 'string'
  )
    return verifyLegacyArtifacts(root, destination);
  if (
    manifest.schemaVersion !== 2 ||
    manifest.commit !== git(root, 'rev-parse', 'HEAD')
  )
    throw new Error(
      'Release artifacts belong to another source commit/schema.',
    );
  const record = verifyRecord(
    root,
    readJson(releaseRecordPath(root, manifest.releaseTag)),
  );
  if (
    !Array.isArray(manifest.packages) ||
    manifest.packages.length !== record.releases.length
  )
    throw new Error('Artifact set differs from planned packages.');
  for (const [index, artifact] of manifest.packages.entries()) {
    const release = record.releases[index];
    if (
      artifact.name !== release.name ||
      artifact.version !== release.newVersion ||
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
    const expected = libraryManifests(root).find(
      (entry) => entry.data.name === release.name,
    ).data;
    if (
      data.name !== release.name ||
      data.version !== release.newVersion ||
      data.private
    )
      throw new Error(`Unexpected package metadata in ${artifact.file}`);
    for (const field of dependencyFields)
      if (
        JSON.stringify(data[field] ?? {}) !==
        JSON.stringify(expected[field] ?? {})
      )
        throw new Error(`Unexpected dependency metadata in ${artifact.file}`);
  }
  return manifest;
}
export function publicationPlan(manifest, existing) {
  return manifest.packages.map((artifact) => {
    const integrity = existing[artifact.name];
    if (integrity !== undefined && integrity !== artifact.integrity)
      throw new Error(
        `${artifact.name}@${artifact.version} already exists with different bytes. Publish a new version; never overwrite an npm release.`,
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
  {
    lookup = (name, version) => registryIntegrity(root, name, version),
    upload,
  } = {},
) {
  const manifest = verifyArtifacts(root, destination);
  const existing = Object.fromEntries(
    manifest.packages.map((artifact) => [
      artifact.name,
      lookup(artifact.name, artifact.version),
    ]),
  );
  // Check the entire set before the first upload. A retry skips identical versions.
  const plan = publicationPlan(manifest, existing);
  for (const artifact of plan) {
    const tag = /-/.test(artifact.version) ? 'next' : 'latest';
    if (artifact.skip) {
      process.stdout.write(
        `Already published identical ${artifact.name}@${artifact.version}; skipping.\n`,
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
    if (upload) await upload(artifact, tag);
    else if (process.env.npm_execpath)
      command(root, process.execPath, [process.env.npm_execpath, ...args], {
        stdio: 'inherit',
      });
    else command(root, 'npm', args, { stdio: 'inherit' });
    await verifyPublishedIntegrity(
      () => lookup(artifact.name, artifact.version),
      artifact.integrity,
      {
        onPending: (attempt) =>
          process.stdout.write(
            `Waiting for ${artifact.name}@${artifact.version} to become visible (${attempt}/40)…\n`,
          ),
      },
    );
    process.stdout.write(
      `Published ${artifact.name}@${artifact.version} (${tag}).\n`,
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
    const extra = process.argv.slice(3);
    if (
      !(action === 'plan'
        ? extra.length <= 1 && extra.every((arg) => arg === '--json')
        : action === 'verify-tag'
          ? extra.length <= 1 && extra.every((arg) => !arg.startsWith('--'))
          : extra.length === 0)
    )
      throw new Error(
        'Unexpected release arguments. Use release:plan to inspect without changing versions or publishing.',
      );
    if (['preversion', 'sync', 'reject-workspace'].includes(action))
      rejectDirectVersion();
    else if (action === 'plan') {
      const plan = await planRelease(rootDirectory);
      if (process.argv.includes('--json'))
        process.stdout.write(
          `${JSON.stringify({ schemaVersion: plan.schemaVersion, baseCommit: plan.baseCommit, releases: plan.releases }, null, 2)}\n`,
        );
      else if (!plan.releases.length)
        process.stdout.write(
          'No package releases planned. Website-only deployment remains available.\n',
        );
      else
        for (const release of plan.releases)
          process.stdout.write(
            `${release.name}: ${release.oldVersion} → ${release.newVersion} (${release.type})\n${release.reasons.map((reason) => `  - ${reason}`).join('\n')}\n`,
          );
    } else if (action === 'prepare') {
      const record = await prepareRelease(rootDirectory);
      process.stdout.write(
        `Prepared ${record.releaseTag} locally. No push/publication performed. Review, then run npm run release:push.\n`,
      );
    } else if (action === 'release') {
      await prepareRelease(rootDirectory);
      process.stdout.write(
        `Pushed ${pushRelease(rootDirectory)}; GitHub will verify and publish only the planned packages.\n`,
      );
    } else if (action === 'push')
      process.stdout.write(`Pushed ${pushRelease(rootDirectory)}.\n`);
    else if (action === 'verify-tag')
      process.stdout.write(
        `Verified ${verifyTag(rootDirectory, process.env.GITHUB_REF_NAME ?? process.argv[3])}.\n`,
      );
    else if (action === 'pack') {
      packRelease(rootDirectory);
      process.stdout.write('Packed the planned release artifacts.\n');
    } else if (action === 'publish') await publishRelease(rootDirectory);
    else throw new Error(`Unknown release action: ${action}`);
  } catch (error) {
    process.stderr.write(`Release stopped: ${error.message}\n`);
    process.exitCode = 1;
  }
}
