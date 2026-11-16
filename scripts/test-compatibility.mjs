import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import semver from 'semver';
import {
  libraryManifests,
  git,
  readJson,
  releaseRecordPath,
} from './release-plan.mjs';

// Test current editor/plugins against declared minimum core/prefix/renderer versions.
// Those versions come from npm unless this batch introduces that exact minimum.
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'ldforge-minimum-consumer-'));
const libraries = libraryManifests(root);
const minimumNames = new Set([
  '@ldforge/core',
  '@ldforge/prefixes',
  '@ldforge/renderers',
]);
const registry = 'https://registry.npmjs.org/';
let preparedBatch;
const subject = git(root, 'log', '-1', '--format=%s');
if (subject.startsWith('chore(release): release-')) {
  const record = readJson(
    releaseRecordPath(root, subject.slice('chore(release): '.length)),
  );
  if (record.baseCommit === git(root, 'rev-parse', 'HEAD^'))
    preparedBatch = record;
}

function npm(...args) {
  return execFileSync('npm', args, {
    cwd: directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
try {
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  const inputs = [];
  for (const entry of libraries) {
    if (minimumNames.has(entry.data.name)) {
      const ranges = libraries.flatMap((item) =>
        ['dependencies', 'optionalDependencies', 'peerDependencies'].flatMap(
          (field) =>
            item.data[field]?.[entry.data.name]
              ? [item.data[field][entry.data.name]]
              : [],
        ),
      );
      const minimum =
        ranges
          .map((range) => semver.minVersion(range)?.version)
          .filter(Boolean)
          .sort(semver.rcompare)[0] ?? entry.data.version;
      assert(
        ranges.every((range) => semver.satisfies(minimum, range)),
        `No common minimum for ${entry.data.name}`,
      );
      let published = false;
      try {
        const version = JSON.parse(
          npm(
            'view',
            `${entry.data.name}@${minimum}`,
            'version',
            '--json',
            '--registry',
            registry,
          ),
        );
        assert.equal(version, minimum);
        published = true;
      } catch (error) {
        let data;
        try {
          data = JSON.parse(error.stdout?.toString() ?? '');
        } catch {
          /* Preserve non-404 failures. */
        }
        if (data?.error?.code !== 'E404') throw error;
      }
      if (published) {
        inputs.push(`${entry.data.name}@${minimum}`);
        process.stdout.write(
          `Compatibility minimum: ${entry.data.name}@${minimum} from npm\n`,
        );
        continue;
      }
      assert(
        preparedBatch?.releases.some(
          (release) =>
            release.name === entry.data.name && release.newVersion === minimum,
        ) && minimum === entry.data.version,
        `Unavailable published minimum ${entry.data.name}@${minimum}; only a minimum introduced by the prepared batch may use a local tarball`,
      );
      process.stdout.write(
        `Compatibility minimum: ${entry.data.name}@${minimum} from this un-published batch\n`,
      );
    }
    const [archive] = JSON.parse(
      execFileSync(
        'npm',
        [
          'pack',
          '--workspace',
          entry.data.name,
          '--pack-destination',
          directory,
          '--json',
        ],
        { cwd: root, encoding: 'utf8' },
      ),
    );
    inputs.push(join(directory, archive.filename));
  }
  npm(
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--registry',
    registry,
    ...inputs,
  );
  const jsdom = pathToFileURL(join(root, 'node_modules/jsdom/lib/api.js')).href;
  writeFileSync(
    join(directory, 'smoke.mjs'),
    `
import assert from 'node:assert/strict';
import { resolve } from ${JSON.stringify(pathToFileURL(join(root, 'node_modules/import-meta-resolve/index.js')).href)};
import { JSDOM } from ${JSON.stringify(jsdom)};
const dom = new JSDOM('<main id="host"></main>', { pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'Option', 'MutationObserver', 'HTMLElement', 'Element', 'Node', 'DOMRect', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'])
  Object.defineProperty(globalThis, key, { configurable: true, value: typeof dom.window[key] === 'function' && key.endsWith('AnimationFrame') ? dom.window[key].bind(dom.window) : dom.window[key] });
const core = await import('@ldforge/core');
const { createEditor } = await import('@ldforge/editor');
const { createTableRenderer } = await import('@ldforge/renderers');
const { default: Yasgui } = await import('@ldforge/yasgui');
assert.equal(typeof Yasgui, 'function');
const expectedCore = import.meta.resolve('@ldforge/core');
for (const name of ${JSON.stringify(libraries.filter((entry) => entry.data.dependencies?.['@ldforge/core']).map((entry) => entry.data.name))}) {
  const resolved = resolve('@ldforge/core', import.meta.resolve(name));
  assert.equal(expectedCore, resolved, name + ' installed a conflicting core copy');
}
for (const [name, factory] of [['charts','createChartRenderer'],['geo','createGeoRenderer'],['network','createNetworkRenderer'],['timeline','createTimelineRenderer'],['pivot','createPivotRenderer'],['tree','createTreeRenderer']]) {
  const module = await import('@ldforge/' + name);
  assert(module[factory]().supports({ kind: 'boolean', value: true }) === false);
}
const editor = createEditor(document.getElementById('host'), {
  executor: { execute: async () => core.parseSparqlResults({ head: { vars: ['value'] }, results: { bindings: [{ value: { type: 'literal', value: 'mixed versions work' } }] } }) },
  query: 'SELECT ?value WHERE {}', renderers: [createTableRenderer()],
});
await editor.run();
assert.equal(editor.getState().status, 'success');
assert(document.querySelector('tbody').textContent.includes('mixed versions work'));
editor.destroy(); dom.window.close();
`,
  );
  execFileSync(process.execPath, ['smoke.mjs'], {
    cwd: directory,
    stdio: 'inherit',
  });
  const consumer = `import { createEditor } from '@ldforge/editor';
import { createHttpExecutor } from '@ldforge/core';
import { createTableRenderer } from '@ldforge/renderers';
import Yasgui from '@ldforge/yasgui';
const editor = createEditor(document.createElement('div'), { executor: createHttpExecutor({ endpoint: 'https://example.org/sparql' }), renderers: [createTableRenderer()] });
editor.getRendererWizard().generate({ rendererId: 'table', options: {} });
editor.destroy();
const compat = new Yasgui(document.createElement('div'), { persistenceId: null }); compat.destroy();`;
  writeFileSync(join(directory, 'consumer.ts'), consumer);
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--lib',
      'ES2022,DOM,DOM.Iterable',
      'consumer.ts',
    ],
    { cwd: directory, stdio: 'inherit' },
  );
  assert(existsSync(join(directory, 'node_modules/@ldforge/core')));
  process.stdout.write(
    'Current packages pass runtime and declaration checks with minimum core/prefix/renderer dependencies.\n',
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
