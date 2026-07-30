/**
 * ⭐ SIRALAMA ANLIK GÖRÜNTÜSÜ (Komuta Merkezi → Sıralamalar)
 *
 * Oyun sırayı **canlı hesaplamaz**, günde üç kez dondurur: **00:00 · 08:00 · 16:00** (oyun saati).
 * Bu bir performans hilesi değil, oyunun kendi ritmi: oyuncu sırasının saniye saniye oynamasını
 * değil, "bu sabahki listede kaçıncıydım, şimdi kaçıncıyım" karşılaştırmasını görür.
 *
 * ⚠️ **Değişim (▲2) TÜRETİLEMEZ.** Önceki sıra kaydedilmezse geriye dönük hesaplanamaz — bu
 * yüzden `rankings` satırı hem `rank` hem `prev_rank` taşır ve her anlık görüntüde eskisi
 * `prev_rank`'e kaydırılır. Anlık görüntü kaçırılırsa o dönemin değişimi sonsuza dek kaybolur.
 *
 * Zamanlama görevin kendisindedir (`ranking_snapshot`): her çalışma bir sonrakini yazar. Ayrı bir
 * cron yok — dünya bakımdayken oyun saati durduğu için sıralama takvimi de doğal olarak kayar,
 * gerçek saate bağlı bir cron ise bakımda tetiklenip yanlış ana damga atardı.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { Tx } from '../missions/handler-registry.ts';

type Runner = Db | Tx;

/** Oyun saatinde anlık görüntü saatleri (UTC). Doküman/ekran: günde 3 kez. */
export const SNAPSHOT_HOURS = [0, 8, 16] as const;

export type RankingKind = 'player' | 'alliance' | 'hero';

/** `from`'dan SONRAKİ ilk anlık görüntü anı. Tam saat üstünde ise bir sonrakini verir. */
export function nextSnapshotAt(from: Date): Date {
  const midnight = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  for (const h of SNAPSHOT_HOURS) {
    const t = midnight + h * 3_600_000;
    if (t > from.getTime()) return new Date(t);
  }
  return new Date(midnight + 24 * 3_600_000);
}

/** `at`'ten önceki (veya tam ona denk gelen) en son anlık görüntü anı. */
export function previousSnapshotAt(at: Date): Date {
  const midnight = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  let best = midnight - 8 * 3_600_000;       // bir önceki günün 16:00'sı
  for (const h of SNAPSHOT_HOURS) {
    const t = midnight + h * 3_600_000;
    if (t <= at.getTime()) best = t;
  }
  return new Date(best);
}

/**
 * Bir dünyanın sıralamasını `at` anına dondurur.
 *
 * Sıra hesabı ve önceki sıranın kaydırılması **tek `INSERT … ON CONFLICT`** ile yapılıyor:
 * `DO UPDATE SET prev_rank = rankings.rank` ifadesindeki `rankings.rank` satırın ESKİ değeridir,
 * yani okuma ile yazma arasında hiçbir aralık kalmıyor. İki adıma bölseydik araya giren ikinci
 * bir anlık görüntü "önceki sıra"yı kendi yazdığı değerle ezerdi.
 *
 * @returns kaç satır sıralandığı
 */
export async function takeSnapshot(runner: Runner, worldId: number, at: Date): Promise<number> {
  const ts = at.toISOString();

  // Silinmiş/yasaklı özneler listede kalmasın (sıra numaraları da onlarsız yeniden dizilir).
  await runner.execute(sql`
    DELETE FROM rankings r
     WHERE r.world_id = ${worldId} AND r.kind = 'player'
       AND NOT EXISTS (SELECT 1 FROM players p WHERE p.id = r.subject_id AND p.banned_at IS NULL)
  `);
  await runner.execute(sql`
    DELETE FROM rankings r
     WHERE r.world_id = ${worldId} AND r.kind = 'hero'
       AND NOT EXISTS (SELECT 1 FROM heroes h WHERE h.id = r.subject_id)
  `);
  // Dağıtılan ittifaklar sıralamadan düşer (kayıt silindiği için EXISTS bulamaz).
  await runner.execute(sql`
    DELETE FROM rankings r
     WHERE r.world_id = ${worldId} AND r.kind = 'alliance'
       AND NOT EXISTS (SELECT 1 FROM alliances a WHERE a.id = r.subject_id)
  `);

  const players = await runner.execute<Record<string, unknown>>(sql`
    WITH ordered AS (
      SELECT id, score, RANK() OVER (ORDER BY score DESC, id ASC) AS rank
        FROM players WHERE world_id = ${worldId} AND banned_at IS NULL
    )
    INSERT INTO rankings (world_id, kind, subject_id, rank, prev_rank, score, taken_at)
    SELECT ${worldId}, 'player', o.id, o.rank, NULL, o.score, ${ts}::timestamptz FROM ordered o
    ON CONFLICT (world_id, kind, subject_id) DO UPDATE
      SET prev_rank = rankings.rank,
          rank = EXCLUDED.rank,
          score = EXCLUDED.score,
          taken_at = EXCLUDED.taken_at
    RETURNING subject_id
  `);

  /**
   * ⭐ Kahraman sıralaması **seviye, sonra tecrübe**. Tek sayıya katlanıyor
   * (`seviye × 1e9 + tecrübe`) çünkü `rankings.score` tek sütun; 1e9 tavanı 80. seviyede bile
   * tecrübenin seviyeyi taşırmasını engelliyor (§13.11.4b tablosu bu büyüklüğe uzak).
   */
  const heroes = await runner.execute<Record<string, unknown>>(sql`
    WITH ordered AS (
      SELECT id,
             (level::bigint * 1000000000 + LEAST(xp, 999999999)) AS score,
             RANK() OVER (ORDER BY level DESC, xp DESC, id ASC) AS rank
        FROM heroes WHERE world_id = ${worldId}
    )
    INSERT INTO rankings (world_id, kind, subject_id, rank, prev_rank, score, taken_at)
    SELECT ${worldId}, 'hero', o.id, o.rank, NULL, o.score, ${ts}::timestamptz FROM ordered o
    ON CONFLICT (world_id, kind, subject_id) DO UPDATE
      SET prev_rank = rankings.rank,
          rank = EXCLUDED.rank,
          score = EXCLUDED.score,
          taken_at = EXCLUDED.taken_at
    RETURNING subject_id
  `);

  /**
   * ⭐ İTTİFAK SIRALAMASI (§13.15b, 2026-07-30) — puan = üyelerin puan TOPLAMI (kullanıcı
   * kuralı). Yasaklı oyuncular oyuncu sıralamasından düştüğü gibi toplamdan da düşer.
   * Üyesiz ittifak kalamaz (dağıtma siliyor) ama LEFT JOIN yine de 0 toplamla dayanıklı.
   */
  const alliances = await runner.execute<Record<string, unknown>>(sql`
    WITH totals AS (
      SELECT a.id, COALESCE(SUM(p.score) FILTER (WHERE p.banned_at IS NULL), 0) AS score
        FROM alliances a
        LEFT JOIN players p ON p.alliance_id = a.id
       WHERE a.world_id = ${worldId}
       GROUP BY a.id
    ), ordered AS (
      SELECT id, score, RANK() OVER (ORDER BY score DESC, id ASC) AS rank FROM totals
    )
    INSERT INTO rankings (world_id, kind, subject_id, rank, prev_rank, score, taken_at)
    SELECT ${worldId}, 'alliance', o.id, o.rank, NULL, o.score, ${ts}::timestamptz FROM ordered o
    ON CONFLICT (world_id, kind, subject_id) DO UPDATE
      SET prev_rank = rankings.rank,
          rank = EXCLUDED.rank,
          score = EXCLUDED.score,
          taken_at = EXCLUDED.taken_at
    RETURNING subject_id
  `);

  const entries = players.length + heroes.length + alliances.length;
  await runner.execute(sql`
    INSERT INTO ranking_runs (world_id, taken_at, entries)
    VALUES (${worldId}, ${ts}::timestamptz, ${entries})
    ON CONFLICT (world_id, taken_at) DO UPDATE SET entries = EXCLUDED.entries
  `);
  return entries;
}

/** Son anlık görüntünün zamanı (hiç alınmadıysa `null`). */
export async function lastSnapshotAt(runner: Runner, worldId: number): Promise<Date | null> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT MAX(taken_at) AS taken_at FROM ranking_runs WHERE world_id = ${worldId}
  `);
  const v = rows[0]?.['taken_at'];
  return v == null ? null : new Date(String(v));
}

/**
 * Bir sonraki `ranking_snapshot` görevini yazar (varsa dokunmaz).
 *
 * Tekillik anahtarı **anlık görüntü anıdır** (`ranking:<iso>`) → worker kaç kez yeniden başlarsa
 * başlasın aynı ana ikinci bir görev yazılamaz.
 */
export async function scheduleSnapshot(
  runner: Runner, worldId: number, gameNow: Date,
): Promise<Date> {
  const at = nextSnapshotAt(gameNow);
  await runner.execute(sql`
    INSERT INTO missions (world_id, type, status, execute_at, payload, idempotency_key)
    VALUES (${worldId}, 'ranking_snapshot', 'scheduled', ${at.toISOString()}::timestamptz,
            '{}'::jsonb, ${`ranking:${at.toISOString()}`})
    ON CONFLICT (world_id, idempotency_key) DO NOTHING
  `);
  return at;
}
