import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import {
  prepareGitOps,
  promoteGitOps,
} from '../scripts/update-website-gitops.mjs';
function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'ldforge-gitops-'));
  const source = join(base, 'source');
  const root = join(base, 'gitops');
  const remote = join(base, 'remote.git');
  for (const path of [source, root]) {
    mkdirSync(path);
    git(path, 'init', '-b', 'main');
    git(path, 'config', 'user.name', 'Test');
    git(path, 'config', 'user.email', 'test@example.org');
    git(path, 'config', 'commit.gpgsign', 'false');
    git(path, 'config', 'core.hooksPath', join(path, '.git/hooks'));
  }
  writeFileSync(join(source, 'code'), 'first');
  git(source, 'add', '.');
  git(source, 'commit', '-m', 'first');
  const old = git(source, 'rev-parse', 'HEAD');
  writeFileSync(join(source, 'code'), 'second');
  git(source, 'commit', '-am', 'second');
  const sha = git(source, 'rev-parse', 'HEAD');
  writeFileSync(
    join(root, 'values.yaml'),
    `# Operator settings\nimage:\n  repository: ghcr.io/example/site\n  tag: old\n  sourceRevision: ${old}\nanalytics:\n  websiteId: private-test-value\ningress:\n  host: demo.example.org\n`,
  );
  writeFileSync(
    join(root, 'app.yaml'),
    'spec:\n  sources:\n    - repoURL: https://github.com/example/site.git\n      path: deploy/helm/ldforge-demo\n      targetRevision: old\n    - repoURL: git@github.com:example/private.git\n      ref: values\n',
  );
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'initial');
  git(base, 'init', '--bare', remote);
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', '-u', 'origin', 'main');
  return {
    root,
    source,
    old,
    sha,
    remote,
    dispose: () => rmSync(base, { recursive: true, force: true }),
    config: {
      valuesFile: 'values.yaml',
      applicationFile: 'app.yaml',
      image: 'ghcr.io/example/site',
      tag: 'sha-new-1',
      digest: `sha256:${'a'.repeat(64)}`,
      sourceSha: sha,
      sourceRepository: 'https://github.com/example/site',
      branch: 'main',
      allowRollback: false,
    },
  };
}
test('promotes image digest and matching chart source while preserving private configuration', () => {
  const f = fixture();
  try {
    assert.equal(promoteGitOps(f.root, f.source, f.config), true);
    const text = readFileSync(join(f.root, 'values.yaml'), 'utf8');
    const values = parse(text);
    assert(text.startsWith('# Operator settings'));
    assert.equal(values.analytics.websiteId, 'private-test-value');
    assert.equal(values.ingress.host, 'demo.example.org');
    assert.equal(values.image.digest, f.config.digest);
    const app = parse(readFileSync(join(f.root, 'app.yaml'), 'utf8'));
    assert.equal(app.spec.sources[0].targetRevision, f.sha);
    assert.equal(app.spec.sources[1].ref, 'values');
    assert.equal(
      git(f.root, 'rev-parse', 'HEAD'),
      git(f.remote, 'rev-parse', 'refs/heads/main'),
    );
    assert.equal(promoteGitOps(f.root, f.source, f.config), false);
  } finally {
    f.dispose();
  }
});
test('refuses an older source by default but permits an explicit rollback', () => {
  const f = fixture();
  try {
    promoteGitOps(f.root, f.source, f.config);
    assert.throws(
      () => prepareGitOps(f.root, f.source, { ...f.config, sourceSha: f.old }),
      /older or divergent/,
    );
    prepareGitOps(f.root, f.source, {
      ...f.config,
      sourceSha: f.old,
      allowRollback: true,
    });
    assert.equal(
      parse(readFileSync(join(f.root, 'values.yaml'), 'utf8')).image
        .sourceRevision,
      f.old,
    );
  } finally {
    f.dispose();
  }
});
test('validates all paths and application identity before changing any private files', () => {
  const f = fixture();
  try {
    const before = readFileSync(join(f.root, 'values.yaml'), 'utf8');
    for (const config of [
      { ...f.config, applicationFile: '../outside.yaml' },
      { ...f.config, sourceRepository: 'https://github.com/wrong/repo' },
      { ...f.config, digest: 'latest' },
    ])
      assert.throws(() => prepareGitOps(f.root, f.source, config));
    assert.equal(readFileSync(join(f.root, 'values.yaml'), 'utf8'), before);
  } finally {
    f.dispose();
  }
});
