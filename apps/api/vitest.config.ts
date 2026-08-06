import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Worker sayısı: çekirdek sayısı ile **6** arasındaki küçük olan.
 *
 * ⚠️ Üst sınır bağlantı bütçesinden geliyor: her worker kendi veritabanına 5 bağlantılık
 * havuz açıyor ve Postgres varsayılanı `max_connections = 100`.
 * ⚠️ Alt sınır CI için: runner'lar çoğu zaman 2-4 çekirdek. Sabit 6 yazılsaydı orada hem
 * çekirdekler boğulur hem de gereksiz yere 6 ayrı test veritabanı kurulup migration
 * koşturulurdu.
 */
const WORKERS = Math.max(1, Math.min(6, cpus().length));

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
    /**
     * ⭐ PARALEL (2026-08-07). Eskiden `false` idi ve yorumu *"migration ve şema kurulumu
     * yarışmasın"* diyordu — doğruydu ama sebep tek değildi: dünya kimlikleri de, dünya
     * kapsamı olmayan `DELETE`ler de çakışıyordu. Üçü birden `test/helpers/db.ts` içinde
     * **worker başına ayrı veritabanı** ile çözüldü; gerekçe orada yazılı.
     *
     * ⚠️ İşçi sayısı `WORKERS` ile sınırlı (yukarı bak) — bağlantı bütçesi ve CI için.
     *
     * ⭐ Ölçüldü (8 çekirdek, 2026-08-07): **410 sn → 112 sn**, 911 test.
     */
    fileParallelism: true,
    /**
     * ⚠️ `minWorkers` da yazılmalı: varsayılanı ÇEKİRDEK SAYISINDAN geliyor ve yalnız
     * `maxWorkers` düşürülünce Tinypool "minThreads and maxThreads must not conflict"
     * diyerek daha ilk saniyede patlıyor (8 çekirdekli makinede birebir yaşandı).
     */
    minWorkers: 1,
    maxWorkers: WORKERS,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
