import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@mobilwar/catalog': fileURLToPath(new URL('../../packages/catalog/src/index.ts', import.meta.url)),
      '@mobilwar/engine': fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)),
      '@mobilwar/contracts': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    // GERÇEK veritabanı kullanıyoruz: migration ve şema kurulumu yarışmasın.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
