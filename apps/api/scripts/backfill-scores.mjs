/**
 * Puan tabanını mevcut varlıklardan bir kez yeniden kurar.
 *
 * ⚠️ **Tek seferlik bakım aracı.** Normal oyunda puan harcama anında işlenir; bu betik yalnız
 * puanlama devreye girmeden ÖNCE oynanmış hesaplar için (ve ileride bir denge değişikliği
 * maliyetleri kaydırırsa) çalıştırılır. Her oyuncunun sahip olduğu yapı · teknik · savaşçı ·
 * savunma bedeli toplanıp `score_base` olarak yazılır.
 *
 * Kullanım (önce `pnpm build`):
 *   node --env-file=../../.env apps/api/scripts/backfill-scores.mjs [worldId]
 */
import { createDb } from '../dist/db/client.js';
import { recomputeScoreBaseFromHoldings } from '../dist/scoring/score.service.js';

const worldId = process.argv[2] ? Number(process.argv[2]) : null;
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL tanimsiz.');

const h = createDb(url, { max: 2 });
const rows = worldId
  ? await h.sql`SELECT id, username, world_id FROM players WHERE world_id = ${worldId} ORDER BY id`
  : await h.sql`SELECT id, username, world_id FROM players ORDER BY id`;

console.log(`${rows.length} oyuncu icin puan tabani yeniden kuruluyor...`);
for (const p of rows) {
  const base = await recomputeScoreBaseFromHoldings(h.db, Number(p.id));
  console.log(
    `  d${p.world_id} ${p.username}: ${Math.round(base).toLocaleString('tr-TR')} kaynak `
    + `-> ${Math.floor(base / 1000).toLocaleString('tr-TR')} puan`,
  );
}
await h.close();
console.log('bitti.');
