import { URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';

const image = process.argv[2] ?? 'ldforge-demo:local';
const containers = [];
function docker(...args) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
async function start(environment = []) {
  const id = docker(
    'run',
    '--detach',
    '--rm',
    '--read-only',
    '--tmpfs',
    '/tmp:uid=101,gid=101,mode=1777',
    '--cap-drop=ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--publish',
    '127.0.0.1::8080',
    ...environment.flatMap((value) => ['--env', value]),
    image,
  );
  containers.push(id);
  const port = docker('port', id, '8080/tcp').split(':').at(-1);
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if ((await globalThis.fetch(`${base}/healthz`)).ok) return { id, base };
    } catch {
      /* Container startup in progress. */
    }
    await delay(100);
  }
  throw new Error(`Container did not become ready: ${docker('logs', id)}`);
}
try {
  const plain = await start();
  assert.equal(docker('exec', plain.id, 'id', '-u'), '101');
  assert.equal(
    docker('inspect', '--format', '{{.HostConfig.ReadonlyRootfs}}', plain.id),
    'true',
  );
  assert.notEqual(
    spawnSync('docker', ['exec', plain.id, 'sh', '-c', 'command -v node'])
      .status,
    0,
    'Node must not be present in the runtime',
  );
  for (const path of [
    '/',
    '/guide.html',
    '/api.html?page=toolbar',
    '/plugins.html',
  ]) {
    const response = await globalThis.fetch(`${plain.base}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert(
      !(await response.text()).includes('data-website-id='),
      'Public image must have no tracking by default',
    );
  }
  assert.equal(
    (await globalThis.fetch(`${plain.base}/missing.html`)).status,
    404,
  );
  const html = await (await globalThis.fetch(plain.base)).text();
  const asset =
    html.match(/src="([^"]+\/assets\/[^" ]+\.js)"/)?.[1] ??
    html.match(/src="(\.\/assets\/[^" ]+\.js)"/)?.[1];
  assert(asset, 'Missing built JavaScript entry');
  const assetResponse = await globalThis.fetch(
    new URL(asset, `${plain.base}/`),
  );
  assert.equal(assetResponse.status, 200);
  assert.match(assetResponse.headers.get('cache-control') ?? '', /immutable/);
  assert.match(assetResponse.headers.get('content-type') ?? '', /javascript/);

  const tracked = await start([
    'LDFORGE_ANALYTICS_SCRIPT_URL=https://analytics.example.org/script.js?a=1&b=2',
    'LDFORGE_ANALYTICS_WEBSITE_ID=test-site-id',
  ]);
  for (const path of ['/', '/guide.html', '/api.html', '/plugins.html']) {
    const body = await (
      await globalThis.fetch(`${tracked.base}${path}`)
    ).text();
    assert(
      body.includes(
        '<script defer src="https://analytics.example.org/script.js?a=1&amp;b=2" data-website-id="test-site-id"></script>',
      ),
    );
    assert.equal(
      body.match(/data-website-id=/g)?.length,
      1,
      'Inject exactly one tracker per page',
    );
  }
  const invalid = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--read-only',
      '--tmpfs',
      '/tmp:uid=101,gid=101,mode=1777',
      '--env',
      'LDFORGE_ANALYTICS_SCRIPT_URL=https://analytics.example.org/script.js',
      image,
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(invalid.status, 0, 'Reject partial tracking configuration');
  assert.match(invalid.stderr, /requires both/);
  process.stdout.write(
    'Deployment smoke checks passed: non-root/read-only runtime, no Node, four pages, cache rules, optional escaped analytics, and fail-fast configuration.\n',
  );
} finally {
  for (const id of containers)
    spawnSync('docker', ['rm', '--force', id], { stdio: 'ignore' });
}
