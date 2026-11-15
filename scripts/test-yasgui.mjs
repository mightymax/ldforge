/* global window */
import assert from 'node:assert/strict';
import console from 'node:console';
import { URL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

const assets = new Map(
  await Promise.all(
    [
      ['/examples/yasgui/index.html', 'text/html'],
      ['/packages/yasgui/dist/yasgui.min.js', 'text/javascript'],
      ['/packages/yasgui/dist/yasgui.css', 'text/css'],
    ].map(async ([path, type]) => [
      path,
      { type, body: await readFile(new URL(`..${path}`, import.meta.url)) },
    ]),
  ),
);
const server = createServer((request, response) => {
  const asset = assets.get(request.url);
  if (!asset) return response.writeHead(404).end();
  response.writeHead(200, { 'Content-Type': asset.type });
  response.end(asset.body);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://dbpedia.org/sparql', (route) =>
    route.fulfill({
      contentType: 'application/sparql-results+json',
      body: JSON.stringify({ boolean: true }),
    }),
  );
  await page.goto(
    `http://127.0.0.1:${server.address().port}/examples/yasgui/index.html`,
  );
  assert.equal(await page.evaluate(() => typeof window.Yasgui), 'function');
  await page.getByRole('tab', { name: 'Ask', exact: true }).click();
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await page.locator('.ldforge-results .ldforge-boolean').waitFor();
  await page.getByRole('button', { name: 'New query', exact: true }).click();
  assert.equal(await page.locator('.ldforge-tabs [role="tab"]').count(), 3);
  await page.getByRole('button', { name: 'Close Ask', exact: true }).click();
  assert.equal(await page.locator('.ldforge-tabs [role="tab"]').count(), 2);
  assert.equal(await page.locator('.cm-editor').count(), 1);
  assert.equal(await page.locator('[class*="yasgui"]').count(), 0);
  assert.equal(await page.locator('input[type="url"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    'Yasgui standalone bundle: constructor, styles, tabs, query and rendering passed.',
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
