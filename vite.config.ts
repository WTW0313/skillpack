import { defineConfig } from 'vite-plus';

const generatedPatterns = ['**/coverage/**', '**/dist/**', '**/*.snap', '**/*.tsbuildinfo', 'pnpm-lock.yaml'];

export default defineConfig({
  fmt: {
    ignorePatterns: [...generatedPatterns, '**/*.md', '.agents/**'],
    printWidth: 120,
    semi: true,
    singleQuote: true,
    sortImports: false,
    sortPackageJson: true,
    trailingComma: 'all',
  },
  lint: {
    env: {
      node: true,
    },
    ignorePatterns: generatedPatterns,
    options: {
      typeAware: true,
      typeCheck: true,
    },
    plugins: ['typescript'],
    overrides: [
      {
        files: ['packages/tui/src/**/*.{ts,tsx}', 'packages/tui/bin/**/*.{ts,tsx}'],
        plugins: ['typescript', 'react'],
      },
      {
        files: ['packages/core/tests/**/*.ts'],
        plugins: ['typescript', 'vitest'],
        rules: {
          'vitest/no-disabled-tests': 'error',
        },
      },
      {
        files: ['packages/tui/tests/**/*.{ts,tsx}'],
        plugins: ['typescript', 'react', 'vitest'],
        rules: {
          'vitest/no-disabled-tests': 'error',
        },
      },
    ],
  },
  run: {
    cache: false,
  },
});
