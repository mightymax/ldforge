import process from 'node:process';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  rmSync,
  appendFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parse as parseYaml } from 'yaml';
import { format } from 'prettier';
import {
  packagePaths,
  planRelease,
  prepareRelease,
  pushRelease,
  verifyVersions,
  verifyTag,
  packRelease,
  verifyArtifacts,
  publicationPlan,
  publishRelease,
  verifyPublishedIntegrity,
} from '../scripts/release.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
function run(root, binary, args) {
  return execFileSync(binary, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function git(root, ...args) {
  return run(root, 'git', args);
}
function json(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ldforge-independent-release-'));
  const root = join(directory, 'checkout');
  const remote = join(directory, 'remote.git');
  mkdirSync(root);
  run(directory, 'git', ['init', '--bare', '--initial-branch=main', remote]);
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.name', 'Release test');
  git(root, 'config', 'user.email', 'release@example.org');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'tag.gpgsign', 'false');
  git(root, 'config', 'core.hooksPath', join(root, '.git/hooks'));
  git(remote, 'config', 'core.hooksPath', join(remote, 'hooks'));
  for (const folder of ['scripts', '.changeset', '.releases'])
    mkdirSync(join(root, folder));
  for (const name of [
    'release.mjs',
    'release-plan.mjs',
    'release-legacy.mjs',
    'project-release-notes.mjs',
  ])
    copyFileSync(
      join(repository, 'scripts', name),
      join(root, 'scripts', name),
    );
  copyFileSync(
    join(repository, '.changeset/config.json'),
    join(root, '.changeset/config.json'),
  );
  mkdirSync(join(root, 'node_modules'));
  mkdirSync(join(root, 'node_modules/.bin'));
  symlinkSync(
    join(repository, 'node_modules/.bin/prettier'),
    join(root, 'node_modules/.bin/prettier'),
  );
  for (const name of [
    '@changesets',
    '@manypkg',
    'semver',
    'prettier',
    'import-meta-resolve',
  ])
    symlinkSync(
      join(repository, 'node_modules', name),
      join(root, 'node_modules', name),
      'dir',
    );
  writeFileSync(
    join(root, '.gitignore'),
    'node_modules/\nrelease-artifacts/\n',
  );
  const packages = {};
  for (const path of ['', ...packagePaths, 'apps/demo']) {
    mkdirSync(join(root, path), { recursive: true });
    const library = packagePaths.includes(path);
    const name = library
      ? `@ldforge/${path.split('/')[1]}`
      : path
        ? '@ldforge/demo'
        : 'release-fixture';
    const data = {
      name,
      ...(library || !path ? { version: '1.0.0' } : {}),
      private: !library,
      ...(library ? { publishConfig: { access: 'public' } } : {}),
      ...(!path
        ? {
            workspaces: ['packages/*', 'apps/*'],
            scripts: { preversion: 'node scripts/release.mjs preversion' },
          }
        : {
            scripts: {
              preversion: 'node ../../scripts/release.mjs reject-workspace',
            },
          }),
    };
    if (library && !['@ldforge/core', '@ldforge/prefixes'].includes(name))
      data.dependencies = { '@ldforge/core': '^1.0.0' };
    if (name === '@ldforge/editor')
      data.dependencies['@ldforge/prefixes'] = '^1.0.0';
    if (name === '@ldforge/yasgui')
      Object.assign(data.dependencies, {
        '@ldforge/editor': '^1.0.0',
        '@ldforge/renderers': '^1.0.0',
      });
    if (path === 'apps/demo')
      data.dependencies = {
        '@ldforge/editor': '^1.0.0',
        '@ldforge/core': '^1.0.0',
      };
    json(join(root, path, 'package.json'), data);
    packages[path] = {
      name,
      ...(data.version ? { version: data.version } : {}),
      ...(data.dependencies ? { dependencies: data.dependencies } : {}),
    };
    if (library) {
      mkdirSync(join(root, path, 'src'));
      writeFileSync(
        join(root, path, 'src/index.js'),
        'export const value = 1;\n',
      );
    }
  }
  json(join(root, 'package-lock.json'), {
    name: 'release-fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    packages,
  });
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'Initial fixture');
  git(root, 'tag', 'v1.0.0');
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', '-u', 'origin', 'main', '--tags');
  return {
    root,
    remote,
    dispose: () => rmSync(directory, { recursive: true, force: true }),
  };
}
function change(project, name = 'editor', bump = 'minor') {
  appendFileSync(
    join(project.root, `packages/${name}/src/index.js`),
    'export const feature = true;\n',
  );
  writeFileSync(
    join(project.root, '.changeset/feature.md'),
    `---\n"@ldforge/${name}": ${bump}\n---\n\nAdd a feature.\n`,
  );
  if (bump === 'major') {
    mkdirSync(join(project.root, 'docs/releases'), { recursive: true });
    json(join(project.root, 'docs/releases/editorial.json'), [
      {
        changeset: 'feature',
        migration:
          'Update the dependent package API for the new major version.',
      },
    ]);
  }
  git(project.root, 'add', '.');
  git(project.root, 'commit', '-m', 'Add feature');
}
const date = new Date('2026-11-16T12:00:00Z');

test('editor changes plan only editor and its embedded Yasgui bundle, without mutation', async () => {
  const project = fixture();
  try {
    change(project);
    const head = git(project.root, 'rev-parse', 'HEAD');
    const plan = await planRelease(project.root);
    assert.deepEqual(
      plan.releases.map(({ name, newVersion, type }) => ({
        name,
        newVersion,
        type,
      })),
      [
        { name: '@ldforge/editor', newVersion: '1.1.0', type: 'minor' },
        { name: '@ldforge/yasgui', newVersion: '1.1.0', type: 'minor' },
      ],
    );
    assert(
      plan.releases[1].reasons.some((reason) =>
        reason.includes('Embedded bundle'),
      ),
    );
    assert.equal(git(project.root, 'rev-parse', 'HEAD'), head);
    assert.equal(git(project.root, 'status', '--porcelain'), '');
  } finally {
    project.dispose();
  }
});

test('a geo patch does not release editor, core, other visualizations or Yasgui', async () => {
  const project = fixture();
  try {
    change(project, 'geo', 'patch');
    assert.deepEqual(
      (await planRelease(project.root)).releases.map((release) => release.name),
      ['@ldforge/geo'],
    );
  } finally {
    project.dispose();
  }
});

test('uncovered new files and copied editor documentation require changesets', async () => {
  const project = fixture();
  try {
    writeFileSync(
      join(project.root, 'packages/core/src/new.js'),
      'export const missing = true;',
    );
    await assert.rejects(
      planRelease(project.root),
      /without a changeset.*core/,
    );
    rmSync(join(project.root, 'packages/core/src/new.js'));
    mkdirSync(join(project.root, 'docs/api'), { recursive: true });
    writeFileSync(join(project.root, 'docs/api/editor.md'), '# Updated API');
    await assert.rejects(
      planRelease(project.root),
      /without a changeset.*editor/,
    );
  } finally {
    project.dispose();
  }
});

test('website/tooling-only work needs no npm versions and cannot prepare an empty release', async () => {
  const project = fixture();
  try {
    writeFileSync(join(project.root, 'apps/demo/index.html'), 'Website');
    git(project.root, 'add', '.');
    git(project.root, 'commit', '-m', 'Website');
    assert.equal((await planRelease(project.root)).releases.length, 0);
    await assert.rejects(
      prepareRelease(project.root, { now: date }),
      /No package releases planned/,
    );
  } finally {
    project.dispose();
  }
});

test('prepare is local, publishes only planned artifacts and atomically pushes all release tags when requested', async () => {
  const project = fixture();
  try {
    change(project);
    const beforeRemote = git(project.remote, 'rev-parse', 'main');
    const record = await prepareRelease(project.root, { now: date });
    const recordPath = join(
      project.root,
      '.releases',
      `${record.releaseTag}.json`,
    );
    const recordSource = readFileSync(recordPath, 'utf8');
    const projectNotes = readFileSync(
      join(project.root, 'docs/releases', `${record.releaseTag}.md`),
      'utf8',
    );
    assert.match(projectNotes, /## Updated packages/);
    assert.match(projectNotes, /@ldforge\/editor/);
    assert.match(projectNotes, /1\.1\.0/);
    assert.equal(
      git(project.root, 'status', '--porcelain'),
      '',
      'Generated project notes must be committed during preparation',
    );
    assert.equal(
      recordSource,
      await format(recordSource, { filepath: recordPath }),
    );

    assert.equal(
      git(project.remote, 'rev-parse', 'main'),
      beforeRemote,
      'Preparation must never push',
    );
    const libraries = verifyVersions(project.root);
    assert.equal(
      libraries.find((entry) => entry.data.name === '@ldforge/editor').data
        .version,
      '1.1.0',
    );
    assert.equal(
      libraries.find((entry) => entry.data.name === '@ldforge/core').data
        .version,
      '1.0.0',
    );
    assert.equal(
      libraries.find((entry) => entry.data.name === '@ldforge/yasgui').data
        .dependencies['@ldforge/editor'],
      '^1.1.0',
    );
    assert.equal(git(project.root, 'status', '--porcelain'), '');
    const explicitTag = spawnSync(
      process.execPath,
      ['scripts/release.mjs', 'verify-tag', record.releaseTag],
      {
        cwd: project.root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_REF_NAME: 'main' },
      },
    );
    // Tag verification also checks that the tagged commit is on origin/main.
    assert.match(explicitTag.stderr, /origin\/main history/);
    const manifest = packRelease(project.root);
    assert.equal(manifest.schemaVersion, 2);
    assert.deepEqual(
      manifest.packages.map((artifact) => artifact.name),
      ['@ldforge/editor', '@ldforge/yasgui'],
    );
    assert.deepEqual(
      verifyArtifacts(project.root, join(project.root, 'release-artifacts')),
      manifest,
    );
    pushRelease(project.root);
    assert.equal(verifyTag(project.root, record.releaseTag), record.releaseTag);
    assert.equal(
      git(project.remote, 'rev-parse', 'main'),
      git(project.root, 'rev-parse', 'HEAD'),
    );
    assert.equal(
      git(project.remote, 'rev-parse', '@ldforge/editor@1.1.0^{commit}'),
      git(project.root, 'rev-parse', 'HEAD'),
    );
    assert.throws(() => verifyTag(project.root, 'v1.1.0'), /batch tag/);
    appendFileSync(
      join(project.root, 'release-artifacts', manifest.packages[0].file),
      'tampered',
    );
    assert.throws(
      () =>
        verifyArtifacts(project.root, join(project.root, 'release-artifacts')),
      /integrity mismatch/,
    );
  } finally {
    project.dispose();
  }
});

test('direct root/workspace npm version is rejected before any versions, commits or tags change', () => {
  const project = fixture();
  try {
    const before = git(project.root, 'rev-parse', 'HEAD');
    for (const directory of ['', 'packages/editor']) {
      const result = spawnSync('npm', ['version', 'minor'], {
        cwd: join(project.root, directory),
        encoding: 'utf8',
      });
      assert.notEqual(result.status, 0);
      assert.match(
        result.stdout + result.stderr,
        /Direct npm version is disabled/,
      );
      assert.equal(git(project.root, 'rev-parse', 'HEAD'), before);
      assert.equal(git(project.root, 'status', '--porcelain'), '');
      verifyVersions(project.root);
    }
  } finally {
    project.dispose();
  }
});

test('atomic push failure keeps a recoverable local batch without a partial remote update', async () => {
  const project = fixture();
  try {
    change(project);
    const record = await prepareRelease(project.root, { now: date });
    const before = git(project.remote, 'rev-parse', 'main');
    writeFileSync(
      join(project.remote, 'hooks/pre-receive'),
      '#!/bin/sh\nwhile read old new ref; do case "$ref" in refs/tags/release-*) exit 1;; esac; done\n',
      { mode: 0o755 },
    );
    assert.throws(() => pushRelease(project.root));
    assert.equal(git(project.remote, 'rev-parse', 'main'), before);
    assert.equal(git(project.remote, 'tag', '--list', 'release-*'), '');
    rmSync(join(project.remote, 'hooks/pre-receive'));
    assert.equal(pushRelease(project.root), record.releaseTag);
  } finally {
    project.dispose();
  }
});

test('major dependencies update necessary dependents, but root version stays unchanged', async () => {
  const project = fixture();
  try {
    change(project, 'core', 'major');
    const record = await prepareRelease(project.root, { now: date });
    assert(
      record.releases.some((release) => release.name === '@ldforge/editor'),
    );
    const editor = JSON.parse(
      readFileSync(join(project.root, 'packages/editor/package.json')),
    );
    assert.equal(editor.dependencies['@ldforge/core'], '^2.0.0');
    assert.equal(
      JSON.parse(readFileSync(join(project.root, 'package.json'))).version,
      '1.0.0',
    );
    verifyVersions(project.root);
  } finally {
    project.dispose();
  }
});

test('independent artifact versions are retained and conflicts stop the whole publication plan', async () => {
  const manifest = {
    schemaVersion: 2,
    packages: [
      { name: '@ldforge/core', version: '2.0.0', integrity: 'sha512-a' },
      { name: '@ldforge/editor', version: '1.1.0', integrity: 'sha512-b' },
    ],
  };
  assert.deepEqual(
    publicationPlan(manifest, { '@ldforge/core': 'sha512-a' }).map(
      (entry) => entry.skip,
    ),
    [true, false],
  );
  assert.throws(
    () => publicationPlan(manifest, { '@ldforge/editor': 'different' }),
    /editor@1.1.0.*different bytes/,
  );
  const values = [undefined, 'expected'];
  await verifyPublishedIntegrity(() => values.shift(), 'expected', {
    sleep: async () => {},
  });
  await assert.rejects(
    verifyPublishedIntegrity(() => 'different', 'expected'),
    /different registry integrity/,
  );
});

test('CI publishes only batch tags and keeps trusted recovery for historical tags', () => {
  const release = parseYaml(
    readFileSync(join(repository, '.github/workflows/release.yml'), 'utf8'),
  );
  const retry = parseYaml(
    readFileSync(
      join(repository, '.github/workflows/retry-release.yml'),
      'utf8',
    ),
  );
  assert.deepEqual(release.on.push.tags, ['release-*']);
  assert.equal(release.on.workflow_dispatch.inputs.release_tag.required, true);
  assert.equal(
    release.jobs.website.with.source_ref,
    '${{ needs.check.outputs.source_sha }}',
  );
  const checkSteps = release.jobs.check.steps;
  const restoreIndex = checkSteps.findIndex(
    (step) => step.name === 'Restore exact tagged metadata before packing',
  );
  assert(
    restoreIndex > checkSteps.findIndex((step) => step.run === 'npm run check'),
  );
  assert(
    restoreIndex <
      checkSteps.findIndex(
        (step) => step.name === 'Pack tested release artifacts',
      ),
  );
  assert.equal(
    checkSteps[restoreIndex].if,
    "always() && github.event_name == 'workflow_dispatch'",
  );
  assert(release.jobs.check.steps.some((step) => step.run === 'npm run check'));
  assert.equal(release.jobs.publish['permissions']['id-token'], 'write');
  assert.equal(release.concurrency.group, retry.concurrency.group);
  assert.equal(release.concurrency['cancel-in-progress'], false);
  assert(
    retry.jobs.publish.steps.some((step) =>
      step.run?.includes('allowLegacy: true'),
    ),
  );
  assert(
    retry.jobs.publish.steps.some(
      (step) => step.run === 'npm ci --prefix tooling --ignore-scripts',
    ),
  );
});

test('prerelease batches keep per-package beta versions and can promote to stable', async () => {
  const project = fixture();
  try {
    run(project.root, 'node', [
      join(repository, 'node_modules/@changesets/cli/bin.js'),
      'pre',
      'enter',
      'beta',
    ]);
    git(project.root, 'add', '.changeset');
    git(project.root, 'commit', '-m', 'Enter beta');
    change(project);
    const beta = await prepareRelease(project.root, { now: date });
    assert.equal(beta.prerelease, true);
    assert.deepEqual(
      beta.releases.map((release) => release.newVersion),
      ['1.1.0-beta.0', '1.1.0-beta.0'],
    );
    verifyVersions(project.root);
    run(project.root, 'node', [
      join(repository, 'node_modules/@changesets/cli/bin.js'),
      'pre',
      'exit',
    ]);
    git(project.root, 'add', '.changeset');
    git(project.root, 'commit', '-m', 'Exit beta');
    const stable = await prepareRelease(project.root, {
      now: new Date('2026-11-16T13:00:00Z'),
    });
    assert.equal(stable.prerelease, false);
    assert.deepEqual(
      stable.releases.map((release) => release.newVersion),
      ['1.1.0', '1.1.0'],
    );
  } finally {
    project.dispose();
  }
});

test('an independent second release uses per-package baselines without re-releasing unrelated packages', async () => {
  const project = fixture();
  try {
    change(project);
    await prepareRelease(project.root, { now: date });
    appendFileSync(
      join(project.root, 'packages/editor/src/index.js'),
      'export const next = true;\n',
    );
    writeFileSync(
      join(project.root, '.changeset/next.md'),
      '---\n"@ldforge/editor": patch\n---\n\nFix the editor.\n',
    );
    git(project.root, 'add', '.');
    git(project.root, 'commit', '-m', 'Editor fix');
    const plan = await planRelease(project.root);
    assert.deepEqual(
      plan.releases.map(({ name, newVersion }) => [name, newVersion]),
      [
        ['@ldforge/editor', '1.1.1'],
        ['@ldforge/yasgui', '1.1.1'],
      ],
    );
  } finally {
    project.dispose();
  }
});

for (const mutation of ['branch', 'dirty', 'staged', 'untracked', 'behind']) {
  test(`preparation rejects ${mutation} state without changing versions`, async () => {
    const project = fixture();
    try {
      change(project);
      if (mutation === 'branch') git(project.root, 'switch', '-c', 'feature');
      if (mutation === 'dirty')
        appendFileSync(join(project.root, '.gitignore'), '# modified\n');
      if (mutation === 'staged') {
        appendFileSync(join(project.root, '.gitignore'), '# staged\n');
        git(project.root, 'add', '.gitignore');
      }
      if (mutation === 'untracked')
        writeFileSync(join(project.root, 'untracked.txt'), 'user work');
      if (mutation === 'behind') {
        git(project.root, 'push', 'origin', 'main');
        git(project.root, 'reset', '--hard', 'HEAD~1');
      }
      const before = git(project.root, 'rev-parse', 'HEAD');
      await assert.rejects(prepareRelease(project.root, { now: date }));
      assert.equal(git(project.root, 'rev-parse', 'HEAD'), before);
      assert.equal(
        JSON.parse(
          readFileSync(join(project.root, 'packages/editor/package.json')),
        ).version,
        '1.0.0',
      );
    } finally {
      project.dispose();
    }
  });
}

test('declared future dependency minimums must be satisfied by this plan before any version mutation', async () => {
  const project = fixture();
  try {
    change(project, 'core', 'minor');
    const editorPath = join(project.root, 'packages/editor/package.json');
    const editor = JSON.parse(readFileSync(editorPath));
    editor.dependencies['@ldforge/core'] = '^1.1.0';
    json(editorPath, editor);
    const lockPath = join(project.root, 'package-lock.json');
    const lock = JSON.parse(readFileSync(lockPath));
    lock.packages['packages/editor'].dependencies['@ldforge/core'] = '^1.1.0';
    json(lockPath, lock);
    writeFileSync(
      join(project.root, '.changeset/editor.md'),
      '---\n"@ldforge/editor": patch\n---\n\nUse the new core API.\n',
    );
    git(project.root, 'add', '.');
    git(project.root, 'commit', '-m', 'Require core minor');
    await prepareRelease(project.root, { now: date });
    verifyVersions(project.root);
  } finally {
    project.dispose();
  }
});

test('publisher preflights all independent versions, uploads in plan order and resumes identical artifacts', async () => {
  const project = fixture();
  try {
    change(project);
    writeFileSync(
      join(project.root, '.changeset/geo.md'),
      '---\n"@ldforge/geo": patch\n---\n\nFix geo.\n',
    );
    git(project.root, 'add', '.');
    git(project.root, 'commit', '-m', 'Include geo fix');
    await prepareRelease(project.root, { now: date });
    const directory = join(project.root, 'release-artifacts');
    const manifest = packRelease(project.root, directory);
    const existing = new Map();
    const lookups = [];
    const uploads = [];
    const options = {
      lookup(name, version) {
        lookups.push([name, version]);
        return existing.get(`${name}@${version}`);
      },
      upload(artifact, tag) {
        assert(
          lookups.length >= manifest.packages.length,
          'Preflight every target before the first upload',
        );
        uploads.push([artifact.name, artifact.version, tag]);
        existing.set(
          `${artifact.name}@${artifact.version}`,
          artifact.integrity,
        );
      },
    };
    await publishRelease(project.root, directory, options);
    assert.deepEqual(uploads, [
      ['@ldforge/geo', '1.0.1', 'latest'],
      ['@ldforge/editor', '1.1.0', 'latest'],
      ['@ldforge/yasgui', '1.1.0', 'latest'],
    ]);
    uploads.length = 0;
    await publishRelease(project.root, directory, options);
    assert.equal(uploads.length, 0);
    existing.set('@ldforge/yasgui@1.1.0', 'conflicting');
    await assert.rejects(
      publishRelease(project.root, directory, options),
      /different bytes/,
    );
    assert.equal(uploads.length, 0);
  } finally {
    project.dispose();
  }
});

for (const mutation of ['clean', 'dirty', 'staged', 'untracked', 'branch']) {
  test(`plan warns for unsafe Git state but remains read-only: ${mutation}`, () => {
    const project = fixture();
    try {
      change(project);
      if (mutation === 'branch') git(project.root, 'switch', '-c', 'feature');
      if (mutation === 'dirty' || mutation === 'staged') {
        appendFileSync(join(project.root, '.gitignore'), '# modified\n');
        if (mutation === 'staged') git(project.root, 'add', '.gitignore');
      }
      if (mutation === 'untracked')
        writeFileSync(join(project.root, 'untracked.txt'), 'work');
      const before = git(project.root, 'status', '--porcelain');
      const head = git(project.root, 'rev-parse', 'HEAD');
      const result = spawnSync(
        process.execPath,
        ['scripts/release.mjs', 'plan', '--json'],
        {
          cwd: project.root,
          encoding: 'utf8',
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.ok(JSON.parse(result.stdout).releases.length);
      if (mutation === 'clean') assert.equal(result.stderr, '');
      else
        assert.match(
          result.stderr,
          mutation === 'branch'
            ? /Warning: Release only from main/
            : /Warning: Release requires a clean working tree/,
        );
      assert.equal(git(project.root, 'status', '--porcelain'), before);
      assert.equal(git(project.root, 'rev-parse', 'HEAD'), head);
    } finally {
      project.dispose();
    }
  });
}
