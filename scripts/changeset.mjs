import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';
const args = process.argv.slice(2);
if (!args.length) args.push('add');
if (!['add', 'pre'].includes(args[0])) {
  process.stderr.write(
    'Use npm run release:plan and npm run release:prepare/release:push for controlled versioning and publication. This command only adds changesets or enters/exits prerelease mode.\n',
  );
  process.exitCode = 1;
} else {
  const require = createRequire(import.meta.url);
  const cli = join(
    dirname(require.resolve('@changesets/cli/package.json')),
    'bin.js',
  );
  const result = spawnSync(process.execPath, [cli, ...args], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
