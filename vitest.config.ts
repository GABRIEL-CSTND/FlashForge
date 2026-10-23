import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  // Component tests opt into a browser-like DOM with `// @vitest-environment jsdom`.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    // .claude/ holds the Claude app's git worktrees (full copies of this
    // project); node_modules at any depth holds other packages' own tests.
    exclude: ['**/node_modules/**', '.next/**', '.claude/**'],
  },
});
