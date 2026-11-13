import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseDocument } from 'yaml';

function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function inside(root, path) {
  if (!path || isAbsolute(path) || path.split(/[\\/]/).includes('..'))
    throw new Error(
      'GitOps file must be a relative path inside the repository.',
    );
  const absolute = realpathSync(resolve(root, path));
  const rel = relative(realpathSync(root), absolute);
  if (rel.startsWith('..') || isAbsolute(rel) || rel.startsWith('.git/'))
    throw new Error('GitOps file escapes the working tree.');
  return absolute;
}
function document(path) {
  const doc = parseDocument(readFileSync(path, 'utf8'));
  if (doc.errors.length) throw new Error('GitOps YAML could not be parsed.');
  return doc;
}
const repositoryId = (url) =>
  url
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .toLowerCase();

/** Patch only image metadata and the matching chart source, preserving private settings. */
export function prepareGitOps(root, sourceRoot, config) {
  if (git(root, 'status', '--porcelain'))
    throw new Error('GitOps checkout must be clean.');
  if (!/^[a-f0-9]{40}$/.test(config.sourceSha))
    throw new Error('A full source SHA is required.');
  if (!/^sha256:[a-f0-9]{64}$/.test(config.digest))
    throw new Error('A SHA256 image digest is required.');
  if (!/^ghcr\.io\/[a-z0-9._-]+\/[a-z0-9._/-]+$/.test(config.image))
    throw new Error('Invalid GHCR image repository.');
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/.test(config.tag))
    throw new Error('Invalid image tag.');
  const path = inside(root, config.valuesFile);
  const values = document(path);
  const current = values.getIn(['image', 'sourceRevision']);
  if (current && current !== config.sourceSha && !config.allowRollback) {
    try {
      git(
        sourceRoot,
        'merge-base',
        '--is-ancestor',
        String(current),
        config.sourceSha,
      );
    } catch {
      throw new Error(
        'Refusing an older or divergent website commit. Use an explicit manual rollback to override.',
      );
    }
  }
  const changes = [];
  for (const [key, value] of Object.entries({
    repository: config.image,
    tag: config.tag,
    digest: config.digest,
    sourceRevision: config.sourceSha,
  }))
    values.setIn(['image', key], value);
  changes.push([config.valuesFile, path, values.toString({ lineWidth: 0 })]);
  if (config.applicationFile) {
    const appPath = inside(root, config.applicationFile);
    const app = document(appPath);
    const sources = app.toJS()?.spec?.sources;
    const index = Array.isArray(sources)
      ? sources.findIndex(
          (source) =>
            typeof source.repoURL === 'string' &&
            repositoryId(source.repoURL) ===
              repositoryId(config.sourceRepository) &&
            source.path === 'deploy/helm/ldforge-demo',
        )
      : -1;
    if (index < 0)
      throw new Error('Application has no matching LDForge Helm source.');
    app.setIn(['spec', 'sources', index, 'targetRevision'], config.sourceSha);
    changes.push([
      config.applicationFile,
      appPath,
      app.toString({ lineWidth: 0 }),
    ]);
  }
  // Validate every file before mutating either one.
  for (const [, file, text] of changes) writeFileSync(file, text);
  return changes.map(([path]) => path);
}
export function promoteGitOps(root, sourceRoot, config) {
  const files = prepareGitOps(root, sourceRoot, config);
  if (!git(root, 'diff', '--', ...files)) return false;
  git(root, 'config', 'user.name', 'LDForge website deployment');
  git(
    root,
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  );
  git(root, 'add', '--', ...files);
  git(
    root,
    'commit',
    '-m',
    `deploy(ldforge): ${config.sourceSha.slice(0, 12)}`,
  );
  // Never force-push. Nonconflicting concurrent edits can be rebased; conflicts fail safely.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      git(root, 'push', 'origin', `HEAD:refs/heads/${config.branch}`);
      return true;
    } catch (error) {
      if (attempt === 2)
        throw new Error(
          'GitOps push failed. Rerun the website workflow after resolving repository access or concurrent changes.',
          { cause: error },
        );
      git(root, 'fetch', 'origin', config.branch);
      try {
        git(root, 'rebase', `origin/${config.branch}`);
      } catch (cause) {
        git(root, 'rebase', '--abort');
        throw new Error(
          'Concurrent GitOps changes conflict; no deployment was overwritten.',
          { cause },
        );
      }
    }
  }
  return false;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const env = process.env;
  try {
    const changed = promoteGitOps(
      resolve(process.argv[2]),
      resolve(process.argv[3]),
      {
        valuesFile: env.WEBSITE_GITOPS_VALUES_FILE,
        applicationFile: env.WEBSITE_GITOPS_APPLICATION_FILE || undefined,
        branch: env.WEBSITE_GITOPS_BRANCH || 'main',
        image: env.WEBSITE_IMAGE,
        tag: env.WEBSITE_IMAGE_TAG,
        digest: env.WEBSITE_IMAGE_DIGEST,
        sourceSha: env.WEBSITE_SOURCE_SHA,
        sourceRepository: env.WEBSITE_SOURCE_REPOSITORY,
        allowRollback: env.WEBSITE_ALLOW_ROLLBACK === 'true',
      },
    );
    process.stdout.write(
      changed
        ? 'Website image and chart revision promoted in GitOps. Argo CD will reconcile the deployment.\n'
        : 'GitOps already contains this deployment.\n',
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
