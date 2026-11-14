import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

// Install real tarballs outside the workspace so aliases/symlinks cannot hide broken exports.
const directory = mkdtempSync(join(tmpdir(), 'ldforge-consumer-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
try {
  const archives = [
    'core',
    'prefixes',
    'editor',
    'renderers',
    'charts',
    'geo',
    'network',
    'timeline',
    'pivot',
  ].map((name) => {
    const [archive] = JSON.parse(
      execFileSync(
        npm,
        [
          'pack',
          '-w',
          `@ldforge/${name}`,
          '--pack-destination',
          directory,
          '--json',
        ],
        { encoding: 'utf8' },
      ),
    );
    const files = archive.files.map((file) => file.path);
    for (const path of [
      'LICENSE',
      'src/index.ts',
      'dist/index.js',
      'dist/index.d.ts',
    ])
      assert(files.includes(path), `${name} is missing ${path}`);
    if (name === 'editor') {
      assert(files.includes('dist/styles.css'));
      assert(files.includes('docs/api/configuration.md'));
      assert(files.includes('docs/api/tab.md'));
      assert(files.includes('docs/api/toolbar.md'));
    }
    return join(directory, archive.filename);
  });
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  execFileSync(
    npm,
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...archives],
    { cwd: directory, stdio: 'pipe' },
  );
  writeFileSync(
    join(directory, 'smoke.mjs'),
    `
    import assert from 'node:assert/strict';
    import { existsSync } from 'node:fs';
    import { parseRdfGraph, parseSparqlResults } from '@ldforge/core';
    import { createGeoRenderer } from '@ldforge/geo';
    import { createNetworkRenderer } from '@ldforge/network';
    import { createTimelineRenderer } from '@ldforge/timeline';
    import { createPivotRenderer } from '@ldforge/pivot';
    import { createChartRenderer } from '@ldforge/charts';
    import { createEditor, formatSparql } from '@ldforge/editor';
    import { prefixes, searchPrefixes } from '@ldforge/prefixes';
    import { prefixes as compact } from '@ldforge/prefixes/compact';
    import { prefixes as extended, prefixEntries as extendedEntries } from '@ldforge/prefixes/extended';
    import { createTableRenderer, createCardsRenderer } from '@ldforge/renderers';
    assert.equal(typeof createEditor, 'function');
    assert.equal(createChartRenderer().id, 'charts');
    assert.equal(createGeoRenderer().id, 'geo');
    assert.equal(createNetworkRenderer().id, 'network');
    assert.equal(createTimelineRenderer().id, 'timeline');
    assert.equal(createPivotRenderer().id, 'pivot');
    assert.equal((await parseRdfGraph('<https://example.org/s> <https://example.org/p> "value" .')).triples.length, 1);
    assert.equal(createCardsRenderer().id, 'cards');
    assert((await formatSparql('select * where {?s ?p ?o}')).includes('SELECT'));
    assert.equal(compact, prefixes);
    assert.equal(extendedEntries.length, 3623);
    assert.equal(extended.dbo, 'http://dbpedia.org/ontology/');
    assert.equal(prefixes.rdfs, 'http://www.w3.org/2000/01/rdf-schema#');
    assert.equal(searchPrefixes('prov')[0].prefix, 'prov');
    assert.equal(createTableRenderer().supports(parseSparqlResults({ boolean: true })), false);
    assert(existsSync(new URL(import.meta.resolve('@ldforge/editor/styles.css'))));
  `,
  );
  execFileSync(process.execPath, ['smoke.mjs'], {
    cwd: directory,
    stdio: 'inherit',
  });
  // Check declarations through a clean consumer, using the workspace compiler.
  writeFileSync(
    join(directory, 'consumer.ts'),
    `
    import { createEditor } from '@ldforge/editor';
    import { createHttpExecutor } from '@ldforge/core';
    import { createTableRenderer, createCardsRenderer } from '@ldforge/renderers';
    import { createGeoRenderer } from '@ldforge/geo';
    import { createNetworkRenderer } from '@ldforge/network';
    import { createTimelineRenderer } from '@ldforge/timeline';
    import { createPivotRenderer } from '@ldforge/pivot';
    const editor = createEditor(document.createElement('div'), {
      executor: createHttpExecutor({ endpoint: 'https://example.org/sparql' }),
      renderers: [createTableRenderer(), createGeoRenderer(), createNetworkRenderer(), createTimelineRenderer(), createPivotRenderer()],
    });
    editor.destroy();
  `,
  );
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  assert(manifest.private, 'The workspace root must remain private.');
  execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../node_modules/typescript/bin/tsc', import.meta.url),
      ),
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
  process.stdout.write(
    'All nine packages install, resolve and typecheck in an isolated consumer.\n',
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
