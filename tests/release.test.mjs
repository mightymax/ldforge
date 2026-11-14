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
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { test } from 'node:test';
import {
  packagePaths,
  verifyVersions,
  verifyTag,
  publicationPlan,
  verifyPublishedIntegrity,
  packRelease,
  verifyArtifacts,
} from '../scripts/release.mjs';

const npmCli = process.env.npm_execpath;
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
  const directory = mkdtempSync(join(tmpdir(), 'ldforge-release-'));
  const remote = join(directory, 'remote.git');
  const root = join(directory, 'checkout');
  mkdirSync(root);
  run(directory, 'git', ['init', '--bare', '--initial-branch=main', remote]);
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.name', 'Release test');
  git(root, 'config', 'user.email', 'release@example.org');
  git(root, 'config', 'core.hooksPath', join(root, '.git/hooks'));
  git(remote, 'config', 'core.hooksPath', join(remote, 'hooks'));
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'tag.gpgsign', 'false');
  mkdirSync(join(root, 'scripts'));
  copyFileSync(
    fileURLToPath(new URL('../scripts/release.mjs', import.meta.url)),
    join(root, 'scripts/release.mjs'),
  );
  const packages = {};
  const names = {};
  for (const directory of packagePaths)
    names[directory] = `@ldforge/${directory.split('/')[1]}`;
  const entries = ['.', ...packagePaths, 'apps/demo'];
  for (const directory of entries) {
    const path = directory === '.' ? root : join(root, directory);
    mkdirSync(path, { recursive: true });
    const core = directory === '.';
    const library = packagePaths.includes(directory);
    const data = {
      name: core ? 'test-root' : library ? names[directory] : '@ldforge/demo',
      private: !library,
      ...(library || core ? { version: '0.1.0' } : {}),
      ...(core ? { workspaces: ['packages/*', 'apps/*'] } : {}),
      ...(library ? { publishConfig: { access: 'public' } } : {}),
      scripts: core
        ? {
            preversion: 'node scripts/release.mjs preversion',
            version: 'node scripts/release.mjs sync',
            postversion: 'node scripts/release.mjs push',
          }
        : { preversion: 'node ../../scripts/release.mjs reject-workspace' },
    };
    if (directory === 'packages/editor' || directory === 'apps/demo')
      data.dependencies = {
        '@ldforge/core': '^0.1.0',
        '@ldforge/prefixes': '^0.1.0',
      };
    json(join(path, 'package.json'), data);
    packages[core ? '' : directory] = {
      name: data.name,
      ...(data.version ? { version: data.version } : {}),
      ...(data.dependencies ? { dependencies: data.dependencies } : {}),
    };
  }
  json(join(root, 'package-lock.json'), {
    name: 'test-root',
    version: '0.1.0',
    lockfileVersion: 3,
    packages,
  });
  writeFileSync(
    join(root, '.npmrc'),
    'git-tag-version=true\ntag-version-prefix=v\nmessage=chore(release): %s\n',
  );
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'Initial fixture');
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', '-u', 'origin', 'main');
  return {
    root,
    remote,
    dispose: () => rmSync(directory, { recursive: true, force: true }),
  };
}
function version(root, args = ['patch']) {
  return spawnSync(
    npmCli ? process.execPath : 'npm',
    npmCli ? [npmCli, 'version', ...args] : ['version', ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, npm_config_update_notifier: 'false' },
    },
  );
}
function errorText(result) {
  return `${result.stdout}\n${result.stderr}`;
}

test('root npm version updates every package and pushes previously unpushed main commits and the tag atomically', () => {
  const project = fixture();
  try {
    writeFileSync(join(project.root, 'feature.txt'), 'Unpushed work\n');
    git(project.root, 'add', '.');
    git(project.root, 'commit', '-m', 'Local unpushed edit');
    const result = version(project.root);
    assert.equal(result.status, 0, errorText(result));
    assert.equal(verifyVersions(project.root), '0.1.1');
    assert.equal(git(project.root, 'status', '--porcelain'), '');
    assert.equal(
      git(project.root, 'rev-parse', 'HEAD'),
      git(project.remote, 'rev-parse', 'refs/heads/main'),
    );
    assert.equal(
      git(project.root, 'rev-parse', 'v0.1.1^{commit}'),
      git(project.remote, 'rev-parse', 'v0.1.1^{commit}'),
    );
    assert.equal(verifyTag(project.root, 'v0.1.1'), '0.1.1');
    const demo = JSON.parse(
      readFileSync(join(project.root, 'apps/demo/package.json'), 'utf8'),
    );
    assert.equal(demo.dependencies['@ldforge/core'], '^0.1.1');
    const prerelease = version(project.root, ['prerelease', '--preid=beta']);
    assert.equal(prerelease.status, 0, errorText(prerelease));
    assert.equal(verifyVersions(project.root), '0.1.2-beta.0');
  } finally {
    project.dispose();
  }
});

for (const mutation of [
  'branch',
  'dirty',
  'untracked',
  'staged',
  'workspace',
  'no-tag',
  'behind',
]) {
  test(`rejects ${mutation} release attempts before changing package versions`, () => {
    const project = fixture();
    try {
      let root = project.root;
      let args = ['patch'];
      if (mutation === 'branch') git(root, 'checkout', '-b', 'feature');
      if (mutation === 'dirty')
        appendFileSync(join(root, '.npmrc'), '# user edit\n');
      if (mutation === 'untracked' || mutation === 'staged') {
        writeFileSync(join(root, 'new-file.txt'), 'edit');
        if (mutation === 'staged') git(root, 'add', '.');
      }
      if (mutation === 'workspace') root = join(root, 'packages/core');
      if (mutation === 'no-tag') args.push('--no-git-tag-version');
      if (mutation === 'behind') {
        writeFileSync(join(root, 'remote.txt'), 'remote edit');
        git(root, 'add', '.');
        git(root, 'commit', '-m', 'New remote main');
        git(root, 'push', 'origin', 'main');
        git(root, 'reset', '--hard', 'HEAD~1');
      }
      const result = version(root, args);
      assert.notEqual(result.status, 0, errorText(result));
      for (const path of ['.', ...packagePaths])
        assert.equal(
          JSON.parse(
            readFileSync(join(project.root, path, 'package.json'), 'utf8'),
          ).version,
          '0.1.0',
        );
      assert.equal(git(project.remote, 'tag', '--list'), '');
    } finally {
      project.dispose();
    }
  });
}

test('atomic push failure retains a recoverable local release without pushing a partial main update', () => {
  const project = fixture();
  try {
    writeFileSync(
      join(project.remote, 'hooks/pre-receive'),
      '#!/bin/sh\nwhile read old new ref; do\n case "$ref" in refs/tags/*) echo "Tag publication disabled in test" >&2; exit 1;; esac\ndone\n',
      { mode: 0o755 },
    );
    const oldMain = git(project.remote, 'rev-parse', 'main');
    const result = version(project.root);
    assert.notEqual(result.status, 0, errorText(result));
    assert.match(errorText(result), /Tag publication disabled in test/);
    assert.equal(verifyVersions(project.root), '0.1.1', errorText(result));
    assert.notEqual(git(project.root, 'rev-parse', 'main'), oldMain);
    assert.equal(git(project.remote, 'rev-parse', 'main'), oldMain);
    assert.equal(git(project.remote, 'tag', '--list'), '');
    rmSync(join(project.remote, 'hooks/pre-receive'));
    run(project.root, process.execPath, ['scripts/release.mjs', 'push']);
    assert.equal(
      git(project.remote, 'rev-parse', 'v0.1.1^{commit}'),
      git(project.root, 'rev-parse', 'HEAD'),
    );
  } finally {
    project.dispose();
  }
});

test('tag validation rejects mismatched versions and commits outside main', () => {
  const project = fixture();
  try {
    git(project.root, 'tag', 'v9.9.9');
    assert.throws(() => verifyTag(project.root, 'v9.9.9'), /exactly match/);
    assert.throws(() => verifyTag(project.root, 'branch'), /release tag/);
    git(project.root, 'checkout', '-b', 'unmerged');
    writeFileSync(join(project.root, 'feature.txt'), 'feature');
    git(project.root, 'add', '.');
    git(project.root, 'commit', '-m', 'Not on main');
    git(project.root, 'tag', 'v0.1.0');
    assert.throws(() => verifyTag(project.root, 'v0.1.0'), /origin\/main/);
  } finally {
    project.dispose();
  }
});

test('publication retries skip identical artifacts and reject conflicts before any upload', () => {
  const manifest = {
    version: '0.1.1',
    packages: [
      { name: '@ldforge/core', integrity: 'sha512-first' },
      { name: '@ldforge/editor', integrity: 'sha512-second' },
    ],
  };
  assert.deepEqual(
    publicationPlan(manifest, { '@ldforge/core': 'sha512-first' }).map(
      (entry) => entry.skip,
    ),
    [true, false],
  );
  assert.throws(
    () => publicationPlan(manifest, { '@ldforge/editor': 'sha512-different' }),
    /different bytes/,
  );
});

test('packed artifacts retain package identities and reject tampered tarballs', () => {
  const project = fixture();
  try {
    const destination = join(project.root, 'release-artifacts');
    const manifest = packRelease(project.root, destination);
    assert.equal(manifest.packages.length, packagePaths.length);
    assert.deepEqual(verifyArtifacts(project.root, destination), manifest);
    appendFileSync(join(destination, manifest.packages[0].file), 'tampered');
    assert.throws(
      () => verifyArtifacts(project.root, destination),
      /integrity mismatch/,
    );
  } finally {
    project.dispose();
  }
});

test('registry verification waits for visibility without republishing or weakening integrity checks', async () => {
  const values = [undefined, undefined, 'sha512-expected'];
  let lookups = 0;
  const waits = [];
  await verifyPublishedIntegrity(() => values[lookups++], 'sha512-expected', {
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  assert.equal(lookups, 3);
  assert.deepEqual(waits, [1000, 2000]);
  await assert.rejects(
    verifyPublishedIntegrity(() => 'sha512-different', 'sha512-expected'),
    /different registry integrity/,
  );
  await assert.rejects(
    verifyPublishedIntegrity(() => undefined, 'sha512-expected', {
      attempts: 2,
      sleep: async () => {},
    }),
    /not yet visible/,
  );
});
