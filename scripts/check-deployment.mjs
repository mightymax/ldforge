import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';

const chart = 'deploy/helm/ldforge-demo';
execFileSync('helm', ['lint', chart, '--strict'], { stdio: 'inherit' });
function render(...args) {
  return execFileSync('helm', ['template', 'ldforge-demo', chart, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
const defaults = render();
assert(
  !defaults.includes('LDFORGE_ANALYTICS_'),
  'Tracking must be absent from public defaults',
);
assert(!defaults.includes('kind: Ingress'), 'Ingress must be opt-in');
const example = render('--values', 'deploy/values.example.yaml');
assert(example.includes('kind: Ingress'));
assert(example.includes('demo.example.org'));
const tracked = render(
  '--set',
  'analytics.enabled=true',
  '--set-string',
  'analytics.scriptUrl=https://analytics.example.org/script.js',
  '--set-string',
  'analytics.websiteId=test-site',
);
assert(tracked.includes('LDFORGE_ANALYTICS_SCRIPT_URL'));
assert(tracked.includes('LDFORGE_ANALYTICS_WEBSITE_ID'));
const invalid = spawnSync(
  'helm',
  ['template', 'ldforge-demo', chart, '--set', 'analytics.enabled=true'],
  { encoding: 'utf8' },
);
assert.notEqual(
  invalid.status,
  0,
  'Enabled analytics must require its configuration',
);
process.stdout.write(
  'Helm checks passed: public defaults, optional ingress/analytics and required values.\n',
);
