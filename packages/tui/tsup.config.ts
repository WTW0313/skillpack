import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['bin/skillpack.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  noExternal: ['@skillpack/core'],
  external: ['yaml', 'glob'],
});
