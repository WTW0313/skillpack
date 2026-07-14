import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    clean: true,
    deps: {
      skipNodeModulesBundle: true,
    },
    dts: {
      sourcemap: false,
    },
    entry: ['src/index.ts'],
    fixedExtension: false,
    format: ['esm'],
    minify: false,
    outDir: 'dist',
    platform: 'node',
    sourcemap: false,
    target: 'node18',
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
