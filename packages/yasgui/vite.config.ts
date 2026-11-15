import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    lib: {
      entry: 'src/browser.ts',
      name: 'Yasgui',
      formats: ['iife'],
      fileName: () => 'yasgui.min.js',
      cssFileName: 'yasgui',
    },
  },
});
