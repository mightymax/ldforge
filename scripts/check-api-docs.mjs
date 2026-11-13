import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';
import process from 'node:process';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = mkdtempSync(`${root}.tmp-api-docs-`);
try {
  const source = readFileSync(
    new URL('../docs/api/overview.md', import.meta.url),
    'utf8',
  );
  const match = source.match(/<!-- typecheck -->\s*```ts\n([\s\S]*?)```/);
  if (!match?.[1]) throw new Error('Missing complete typed API example.');
  writeFileSync(`${directory}/example.ts`, match[1]);
  execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../node_modules/typescript/bin/tsc', import.meta.url),
      ),
      '--noEmit',
      '--strict',
      '--noUncheckedIndexedAccess',
      '--exactOptionalPropertyTypes',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--target',
      'ES2022',
      '--lib',
      'ES2022,DOM,DOM.Iterable',
      `${directory}/example.ts`,
    ],
    { stdio: 'inherit' },
  );
  process.stdout.write(
    'Complete API documentation example typechecks against built package declarations.\n',
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
