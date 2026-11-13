/* global document, window */
import assert from 'node:assert/strict';
import console from 'node:console';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { URL, fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Opt-in integration check: deliberately uses the published CDN packages and
// live Wikidata, not workspace aliases or mocked responses. Not part of CI.
const example = await readFile(
  new URL('../examples/wikidata-cats.html', import.meta.url),
);
const server = createServer((request, response) => {
  if (request.url !== '/wikidata-cats.html') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(example);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({
    locale: 'en-US',
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(60_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const request = page.waitForRequest((request) =>
    request.url().startsWith('https://query.wikidata.org/sparql?'),
  );
  const address = server.address();
  await page.goto(`http://127.0.0.1:${address.port}/wikidata-cats.html`, {
    waitUntil: 'domcontentloaded',
  });
  assert.equal((await request).method(), 'GET');
  await page.locator('.ldforge-card h3').first().waitFor();
  const cards = page.locator('.ldforge-card');
  assert.equal(await cards.count(), 12);
  assert.equal(await cards.locator('h3').count(), 12);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.ldforge-card img')].some(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  assert.match(
    await page.locator('.ldforge-status').innerText(),
    /^12 results in /,
  );
  assert.equal(await page.getByText('Loading LDForge…').count(), 0);
  assert.deepEqual(errors, []);
  await mkdir(new URL('../.local/', import.meta.url), { recursive: true });
  await page.locator('footer').scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.ldforge-card img')].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  await page.screenshot({
    path: fileURLToPath(new URL('../.local/cdn-example.png', import.meta.url)),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    'Example must fit a mobile viewport',
  );
  console.log(
    'CDN example passed: published modules, live Wikidata GET, 12 titled cards, loaded images, desktop and mobile layouts.',
  );
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
