import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

const coreEntry = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));

export default defineConfig({
  pack: {
    alias: {
      '@skillpack/core': coreEntry,
    },
    clean: true,
    deps: {
      alwaysBundle: ['acorn'],
      neverBundle: ['yaml'],
      onlyBundle: ['acorn'],
    },
    dts: false,
    entry: ['bin/skillpack.ts'],
    fixedExtension: false,
    format: ['esm'],
    hash: false,
    minify: false,
    outDir: 'dist',
    platform: 'node',
    sourcemap: false,
    target: 'node18',
  },
  resolve: {
    alias: {
      '@skillpack/core': coreEntry,
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
