import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { getReleasePlan } from '@changesets/get-release-plan';
import { assembleReleasePlan } from '@changesets/assemble-release-plan';
import { readConfig } from '@changesets/config';
import { getPackages } from '@manypkg/get-packages';
import semver from 'semver';

export const packagePaths = [
  'core',
  'prefixes',
  'renderers',
  'charts',
  'geo',
  'network',
  'timeline',
  'pivot',
  'tree',
  'editor',
  'yasgui',
].map((name) => `packages/${name}`);
export const dependencyFields = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'devDependencies',
];
export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
export function libraryManifests(root) {
  return packagePaths.map((directory) => ({
    directory,
    path: join(root, directory, 'package.json'),
    data: readJson(join(root, directory, 'package.json')),
  }));
}
export function dependencyOrder(entries) {
  const byName = new Map(entries.map((entry) => [entry.data.name, entry]));
  const result = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(entry) {
    if (visited.has(entry.data.name)) return;
    if (visiting.has(entry.data.name))
      throw new Error('Internal dependency cycle.');
    visiting.add(entry.data.name);
    for (const field of dependencyFields)
      for (const name of Object.keys(entry.data[field] ?? {}))
        if (byName.has(name)) visit(byName.get(name));
    visiting.delete(entry.data.name);
    visited.add(entry.data.name);
    result.push(entry);
  }
  for (const entry of entries) visit(entry);
  return result;
}
function ancestorRef(root, ref) {
  try {
    git(root, 'merge-base', '--is-ancestor', ref, 'HEAD');
    return ref;
  } catch {
    return undefined;
  }
}
export function packageBaseline(root, entry) {
  for (const tag of [
    `${entry.data.name}@${entry.data.version}`,
    `v${entry.data.version}`,
  ]) {
    if (ancestorRef(root, `refs/tags/${tag}`)) return `refs/tags/${tag}`;
  }
  try {
    return git(
      root,
      'describe',
      '--tags',
      '--abbrev=0',
      '--match',
      'release-*',
      '--match',
      'v[0-9]*',
      'HEAD',
    );
  } catch {
    return undefined;
  }
}
export function changedPackageInputs(root, entry) {
  const baseline = packageBaseline(root, entry);
  const inputs = [entry.directory];
  if (entry.data.name === '@ldforge/editor')
    inputs.push(
      'docs/api',
      'docs/renderers.md',
      'scripts/build-editor-assets.mjs',
    );
  const files = baseline
    ? git(root, 'diff', '--name-only', baseline, '--', ...inputs).split('\n')
    : git(root, 'ls-files', '--', ...inputs).split('\n');
  files.push(
    ...git(
      root,
      'ls-files',
      '--others',
      '--exclude-standard',
      '--',
      ...inputs,
    ).split('\n'),
  );
  return [
    ...new Set(files.filter((path) => path && !path.endsWith('/CHANGELOG.md'))),
  ];
}

/** Read-only: Changesets intent plus LDForge's embedded browser-bundle dependency rule. */
export async function planRelease(root, { checkCoverage = true } = {}) {
  const packages = await getPackages(root);
  const configResult = await readConfig(root, packages);
  if (!configResult.config)
    throw new Error(
      `Invalid Changesets configuration: ${configResult.errors.join('; ')}`,
    );
  const config = configResult.config;
  if (
    config.fixed.length ||
    config.linked.length ||
    config.ignore.length ||
    config.privatePackages.version
  )
    throw new Error(
      'LDForge releases independent public packages; fixed/linked/ignored/versioned-private groups are not supported.',
    );
  let changesetsPlan = await getReleasePlan(root);
  const libraries = libraryManifests(root);
  const ordered = dependencyOrder(libraries);
  const names = new Set(libraries.map((entry) => entry.data.name));
  for (const change of changesetsPlan.changesets)
    for (const release of change.releases)
      if (!names.has(release.name))
        throw new Error(
          `Changeset names an unknown/private package: ${release.name}`,
        );
  const bundleName = '@ldforge/yasgui';
  const bundleDependencies = new Set();
  function collect(name) {
    const entry = libraries.find((item) => item.data.name === name);
    for (const field of ['dependencies', 'optionalDependencies'])
      for (const dependency of Object.keys(entry?.data[field] ?? {}))
        if (names.has(dependency) && !bundleDependencies.has(dependency)) {
          bundleDependencies.add(dependency);
          collect(dependency);
        }
  }
  collect(bundleName);
  const embedded = changesetsPlan.releases.filter(
    (release) =>
      bundleDependencies.has(release.name) && release.type !== 'none',
  );
  const rank = { none: 0, patch: 1, minor: 2, major: 3 };
  const bundle = changesetsPlan.releases.find(
    (release) => release.name === bundleName,
  );
  if (embedded.length) {
    const type = embedded.reduce(
      (highest, release) =>
        rank[release.type] > rank[highest] ? release.type : highest,
      'patch',
    );
    if (!bundle || rank[bundle.type] < rank[type]) {
      const signature = createHash('sha256')
        .update(
          JSON.stringify(
            embedded.map(({ name, newVersion }) => [name, newVersion]),
          ),
        )
        .digest('hex')
        .slice(0, 12);
      const synthetic = {
        id: `ldforge-bundle-${signature}`,
        summary: `Rebuild the standalone Yasgui browser bundle with ${embedded.map((release) => `${release.name}@${release.newVersion}`).join(', ')}.`,
        releases: [{ name: bundleName, type }],
      };
      changesetsPlan = assembleReleasePlan(
        [...changesetsPlan.changesets, synthetic],
        packages,
        config,
        changesetsPlan.preState,
      );
    }
  }
  const releases = ordered.flatMap((entry) => {
    const release = changesetsPlan.releases.find(
      (item) => item.name === entry.data.name && item.type !== 'none',
    );
    if (!release) return [];
    const reasons = [];
    for (const change of changesetsPlan.changesets)
      if (change.releases.some((item) => item.name === release.name))
        reasons.push(`${change.id}: ${change.summary}`);
    for (const field of [
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
    ])
      for (const [name, range] of Object.entries(entry.data[field] ?? {})) {
        const dependency = changesetsPlan.releases.find(
          (item) => item.name === name,
        );
        if (dependency && !semver.satisfies(dependency.newVersion, range))
          reasons.push(
            `Required dependency update: ${name} ${range} → ${dependency.newVersion}`,
          );
      }
    if (release.name === bundleName && embedded.length)
      reasons.push(
        `Embedded bundle changes: ${embedded.map((item) => item.name).join(', ')}`,
      );
    return [{ ...release, reasons }];
  });
  if (checkCoverage) {
    const missing = libraries.filter(
      (entry) =>
        changedPackageInputs(root, entry).length &&
        !releases.some((release) => release.name === entry.data.name),
    );
    if (missing.length)
      throw new Error(
        `Published package inputs changed without a changeset: ${missing.map((entry) => entry.data.name).join(', ')}. Run npm run changeset. Include copied documentation/build inputs when relevant.`,
      );
  }
  return {
    schemaVersion: 2,
    baseCommit: git(root, 'rev-parse', 'HEAD'),
    changesets: changesetsPlan.changesets,
    releases,
    changesetsPlan,
    packages,
    config,
  };
}
export function releaseRecordPath(root, tag) {
  if (!/^release-\d{8}-\d{6}-[a-f0-9]{7,40}$/.test(tag))
    throw new Error('Expected a release-YYYYMMDD-HHMMSS-COMMIT batch tag.');
  const path = join(root, '.releases', `${tag}.json`);
  if (!existsSync(path))
    throw new Error(`Missing release batch record: ${tag}`);
  return path;
}
