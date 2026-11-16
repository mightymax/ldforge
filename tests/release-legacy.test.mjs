import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  packagePaths,
  verifyArtifacts,
  verifyTag,
  publicationPlan,
} from '../scripts/release.mjs';
function run(root, executable, args) {
  return execFileSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function git(root, ...args) {
  return run(root, 'git', args);
}
function json(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

for (const count of [10, 11]) {
  test(`historical ${count}-package manifests and tags remain recoverable without the old release hooks`, () => {
    const directory = mkdtempSync(
      join(tmpdir(), 'ldforge-historical-release-'),
    );
    try {
      const root = join(directory, 'source');
      const remote = join(directory, 'remote.git');
      mkdirSync(root);
      run(directory, 'git', [
        'init',
        '--bare',
        '--initial-branch=main',
        remote,
      ]);
      git(root, 'init', '--initial-branch=main');
      git(root, 'config', 'user.name', 'Release test');
      git(root, 'config', 'user.email', 'release@example.org');
      git(root, 'config', 'commit.gpgsign', 'false');
      git(root, 'config', 'tag.gpgsign', 'false');
      git(root, 'config', 'core.hooksPath', join(root, '.git/hooks'));
      git(remote, 'config', 'core.hooksPath', join(remote, 'hooks'));
      const paths = packagePaths.slice(0, count);
      const version = count === 10 ? '0.1.6' : '1.0.0';
      const packages = {};
      for (const path of ['', ...paths, 'apps/demo']) {
        mkdirSync(join(root, path), { recursive: true });
        const library = paths.includes(path);
        const data = {
          name: library
            ? `@ldforge/${path.split('/')[1]}`
            : path
              ? '@ldforge/demo'
              : 'legacy-root',
          private: !library,
          ...(library || !path ? { version } : {}),
          ...(!path ? { workspaces: ['packages/*', 'apps/*'] } : {}),
          ...(library ? { publishConfig: { access: 'public' } } : {}),
        };
        json(join(root, path, 'package.json'), data);
        packages[path] = {
          name: data.name,
          ...(data.version ? { version } : {}),
        };
      }
      json(join(root, 'package-lock.json'), {
        version,
        lockfileVersion: 3,
        packages,
      });
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'Historical source');
      git(root, 'tag', `v${version}`);
      git(root, 'remote', 'add', 'origin', remote);
      git(root, 'push', '-u', 'origin', 'main', '--tags');
      assert.equal(
        verifyTag(root, `v${version}`, { allowLegacy: true }),
        version,
      );
      assert.throws(() => verifyTag(root, `v${version}`), /batch tag/);
      const destination = join(root, 'release-artifacts');
      mkdirSync(destination);
      const archives = paths.map((path) => {
        const name = JSON.parse(
          readFileSync(join(root, path, 'package.json')),
        ).name;
        const [archive] = JSON.parse(
          run(root, 'npm', [
            'pack',
            '--workspace',
            name,
            '--pack-destination',
            destination,
            '--json',
          ]),
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
        packages: archives,
      };
      json(join(destination, 'manifest.json'), manifest);
      assert.deepEqual(verifyArtifacts(root, destination), manifest);
      assert.equal(
        publicationPlan(manifest, {
          [archives[0].name]: archives[0].integrity,
        })[0].skip,
        true,
      );
      const forged = { ...manifest, commit: 'wrong-source' };
      json(join(destination, 'manifest.json'), forged);
      assert.throws(() => verifyArtifacts(root, destination), /source commit/);
      json(join(destination, 'manifest.json'), manifest);
      appendFileSync(join(destination, archives[0].file), 'tampered');
      assert.throws(
        () => verifyArtifacts(root, destination),
        /integrity mismatch/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
