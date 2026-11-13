import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Resolve source in the workspace: no prebuild or watch process is needed for the demo.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        demo: fileURLToPath(new URL('./index.html', import.meta.url)),
        guide: fileURLToPath(new URL('./guide.html', import.meta.url)),
        api: fileURLToPath(new URL('./api.html', import.meta.url)),
      },
    },
  },
  resolve: {
    alias: [
      ...['compact', 'extended'].map((variant) => ({
        find: `@ldforge/prefixes/${variant}`,
        replacement: fileURLToPath(
          new URL(`../../packages/prefixes/src/${variant}.ts`, import.meta.url),
        ),
      })),
      {
        find: '@ldforge/editor/styles.css',
        replacement: fileURLToPath(
          new URL('../../packages/editor/src/styles.css', import.meta.url),
        ),
      },
      ...['core', 'editor', 'renderers', 'prefixes'].map((name) => ({
        find: `@ldforge/${name}`,
        replacement: fileURLToPath(
          new URL(`../../packages/${name}/src/index.ts`, import.meta.url),
        ),
      })),
    ],
  },
});
