import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Test sırasında kardeş paketi build almadan, doğrudan kaynaktan çöz.
      '@mobilwar/catalog': fileURLToPath(new URL('../catalog/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
