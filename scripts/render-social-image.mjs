import { readFile, mkdir } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Rasterize our existing vector identity: crawlers receive a plain PNG.
const source = await readFile(
  new URL('../apps/demo/assets/social-card.svg', import.meta.url),
  'utf8',
);
const destination = new URL(
  '../examples/assets/ldforge-social-v1.png',
  import.meta.url,
);
await mkdir(new URL('.', destination), { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<html><body style="margin:0">${source}</body></html>`);
  await page.screenshot({ path: fileURLToPath(destination) });
} finally {
  await browser.close();
}
