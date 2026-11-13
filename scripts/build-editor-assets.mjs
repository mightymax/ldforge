import { URL } from 'node:url';
import { copyFileSync, cpSync, mkdirSync } from 'node:fs';

const editor = new URL('../packages/editor/', import.meta.url);
copyFileSync(
  new URL('src/styles.css', editor),
  new URL('dist/styles.css', editor),
);
mkdirSync(new URL('docs/', editor), { recursive: true });
cpSync(new URL('../docs/api/', import.meta.url), new URL('docs/api/', editor), {
  recursive: true,
});
