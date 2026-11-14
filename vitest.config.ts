import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: Object.fromEntries([
      ...['compact', 'extended'].map((variant) => [
        `@ldforge/prefixes/${variant}`,
        fileURLToPath(
          new URL(`./packages/prefixes/src/${variant}.ts`, import.meta.url),
        ),
      ]),
      ...[
        'core',
        'editor',
        'renderers',
        'prefixes',
        'charts',
        'geo',
        'network',
        'timeline',
        'pivot',
      ].map((name) => [
        `@ldforge/${name}`,
        fileURLToPath(
          new URL(`./packages/${name}/src/index.ts`, import.meta.url),
        ),
      ]),
    ]),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { statements: 85, branches: 80, functions: 85, lines: 85 },
    },
  },
});
