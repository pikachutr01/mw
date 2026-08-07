/**
 * ⭐⭐ KAYDIRMA DEĞİŞMEZLİĞİ — planın T2/T6/T9/T10 ölçümleri.
 *
 * `maintenance.test.ts` kaydırmanın **bir** sütun için (kuyruk) çalıştığını ölçüyor.
 * Bu dosya asıl soruyu soruyor: **kayıt defterindeki HER SINIF için kalan süre korunuyor mu?**
 *
 * ⚠️ Neden ayrı bir dosya: kaydırma tek bir transaction'da 15 sütuna birden dokunuyor ve
 * hatanın şekli her sınıfta farklı. Vade kaymazsa görev erken ateşlenir; ÇIPA kaymazsa
 * oyuncuya bakım süresi kadar **bedava kaynak/asker** gider. İkincisi hiçbir yerde hata
 * üretmez — yalnız bu tür bir test yakalar.
 *
 * ⚠️ Ölçüm yöntemi `maintenance.test.ts`ten devralındı: gerçekten 10 dakika beklemek yerine
 * `paused_at` geriye alınıyor. `resumeAndShift` kaydırmayı `now() − paused_at` ile hesapladığı
 * için bu, uzun bir bakımla **bit-bit aynı kod yolunu** koşturuyor.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/db/client.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { TIME_SHIFT_REGISTRY } from '../src/world/time-registry.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;
let playerId: number;
let cityId: number;

const PAUSE_MIN = 10;

/**
 * Duraklar ve duraklama anını geriye alır → uzun bir bakımı taklit eder.
 *
 * ⚠️⚠️ **ÖLÇÜM SIRASI KRİTİK ve ilk yazımda yanlış yaptım.** Değişmez şu DEĞİL:
 * *"duraklamadan önceki kalan süre = devam sonrası kalan süre"*. Öyle olsaydı 10 dakika bekleyen
 * oyuncu 10 dakikayı bedavaya kazanırdı. Doğru değişmez:
 *
 *   **oyuncunun DONMUŞ ekranda gördüğü kalan süre = devam ettikten sonra gördüğü kalan süre**
 *
 * Yani `before` ölçümü duraklamadan SONRA, donmuş saate (`paused_at`) göre alınmalı. İlk yazımda
 * duraklamadan önce ölçüyordum ve test 600 sn'lik bir "sapma" bildirdi — o sapma gerçekti ama
 * hatanın değil, **yanlış sorunun** sonucuydu: sahte bakımda gerçek saat ilerlemediği için
 * `now()` kıpırdamıyor, vadeler ise kayıyordu.
 */
async function pause(): Promise<void> {
  await clock.pause(worldId);
  await h.db.execute(sql`
    UPDATE worlds SET paused_at = paused_at - (${PAUSE_MIN} * interval '1 minute')
     WHERE id = ${worldId}
  `);
}

async function pauseAndResume(): Promise<{ shiftMs: number; rows: Record<string, number> }> {
  await pause();
  const out = await clock.resume(worldId);
  return { shiftMs: out.shiftMs, rows: out.rowsByTable };
}

/** Bir sütunun `gameNow`a göre kalan/geçen süresi (sn). */
async function offsetOf(table: string, column: string, where: string): Promise<number | null> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT EXTRACT(EPOCH FROM (
             ${sql.raw(`"${column}"`)} - COALESCE(w.paused_at, now())
           )) AS d
      FROM ${sql.raw(`"${table}"`)} t JOIN worlds w ON w.id = t.world_id
     WHERE ${sql.raw(where)} AND t.world_id = ${worldId}
     LIMIT 1
  `);
  return rows[0]?.['d'] == null ? null : Number(rows[0]['d']);
}

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
}, 60_000);
afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  playerId = await createPlayer(h, worldId, 'shift');
  const c = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO cities (world_id, player_id, name, k, d, s, resources_at)
    VALUES (${worldId}, ${playerId}, 'kaydirma', 1, 1, ${900 + (worldId % 90)},
            now() - interval '20 minutes')
    RETURNING id
  `);
  cityId = Number(c[0]!['id']);
});

/* ═══ T2 — her sınıf için kalan süre korunuyor ═════════════════════════════ */

describe('T2 — kalan süre bakım boyunca korunur (tüm sınıflar)', () => {
  /**
   * ⭐⭐ ASIL ÖLÇÜM. Beş ayrı vade + iki çıpa aynı anda kuruluyor, bakım yapılıyor, sonra
   * hepsinin `gameNow`a göre farkı tekrar ölçülüyor. Değişmez: **fark aynı kalmalı.**
   *
   * ⚠️ Tolerans 2 sn: kaydırma `now()` ile hesaplanıyor ve ölçüm ayrı bir gidiş-dönüş.
   * Ölçülen sapma (kaymasaydı) **10 dakika** olurdu — tolerans onu gizleyemez.
   */
  it('vadeler ve çıpalar birlikte kayıyor, farklar sabit', async () => {
    await h.db.execute(sql`
      UPDATE players SET protected_until = now() + interval '2 hours',
                         vacation_since  = now() - interval '3 hours',
                         vacation_until  = now() + interval '5 hours',
                         merit_granted_at = now() - interval '1 hour',
                         merit_expires_at = now() + interval '6 hours'
       WHERE id = ${playerId}
    `);
    await h.db.execute(sql`
      UPDATE cities SET teleport_ready_at  = now() + interval '90 minutes',
                        cave_repair_until  = now() + interval '40 minutes',
                        wall_repair_from   = now() - interval '10 minutes',
                        wall_repair_until  = now() + interval '50 minutes'
       WHERE id = ${cityId}
    `);
    await h.db.execute(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, status, revive_until)
      VALUES (${worldId}, ${playerId}, ${cityId}, 'kahraman', 'reviving', now() + interval '3 hours')
    `);
    await h.db.execute(sql`
      INSERT INTO missions (world_id, type, status, execute_at)
      VALUES (${worldId}, 'echo', 'scheduled', now() + interval '4 hours')
    `);

    const probes: [string, string, string][] = [
      ['players', 'protected_until', `t.id = ${playerId}`],
      ['players', 'vacation_until', `t.id = ${playerId}`],
      ['players', 'vacation_since', `t.id = ${playerId}`],
      ['players', 'merit_expires_at', `t.id = ${playerId}`],
      ['players', 'merit_granted_at', `t.id = ${playerId}`],
      ['cities', 'teleport_ready_at', `t.id = ${cityId}`],
      ['cities', 'cave_repair_until', `t.id = ${cityId}`],
      ['cities', 'wall_repair_until', `t.id = ${cityId}`],
      ['cities', 'wall_repair_from', `t.id = ${cityId}`],
      // ⚠️ Kaynak çıpası KOŞULSUZ kayıyor: tek bir şehir atlanırsa oyuncuya bakım süresi
      // kadar bedava altın/yemek gider ve hiçbir yerde hata çıkmaz.
      ['cities', 'resources_at', `t.id = ${cityId}`],
      ['heroes', 'revive_until', `t.player_id = ${playerId}`],
      ['missions', 'execute_at', `t.type = 'echo'`],
    ];

    /**
     * ⭐ Ölçüm DURAKLAMADAN SONRA: `offsetOf` `COALESCE(paused_at, now())` kullanıyor, yani
     * burada donmuş saate göre okuyor — tam olarak oyuncunun perde arkasında gördüğü değer.
     */
    await pause();
    const before = new Map<string, number>();
    for (const [tbl, col, w] of probes) {
      const v = await offsetOf(tbl, col, w);
      expect(v, `${tbl}.${col} tohumlanmamış`).not.toBeNull();
      before.set(`${tbl}.${col}`, v!);
    }

    const out = await clock.resume(worldId);
    expect(out.shiftMs).toBeGreaterThanOrEqual(PAUSE_MIN * 60_000);

    for (const [tbl, col, w] of probes) {
      const after = await offsetOf(tbl, col, w);
      const key = `${tbl}.${col}`;
      expect(
        Math.abs(after! - before.get(key)!),
        `${key} KAYMADI — bakım süresi kadar sapma var (${before.get(key)} → ${after})`,
      ).toBeLessThan(2);
    }
  });

  /** Kayıt defterindeki her giriş gerçekten satır kaydırdı mı — kapsamın nesnel kanıtı. */
  it('rowsByTable her tohumlanmış girişi sayıyor (0 = yüklem bozuk)', async () => {
    await h.db.execute(sql`
      UPDATE players SET protected_until = now() + interval '2 hours' WHERE id = ${playerId}
    `);
    const { rows } = await pauseAndResume();
    expect(rows['players.protected_until']).toBe(1);
    // Koşulsuz giriş: şehir her hâlükârda kaymalı.
    expect(rows['cities.resources_at']).toBe(1);
  });
});

/* ═══ T10 — süresi dolmuş vade DİRİLMEZ ═══════════════════════════════════ */

describe('T10 — geçmiş vadeler kaydırmayla yeniden kilitlenmiyor', () => {
  /**
   * ⚠️⚠️ Yüklemler `> ref` kullanıyor ve sebebi tam olarak bu. Süresi çoktan dolmuş bir
   * teleport bekleme süresi kaydırılsaydı **yeniden kilitlenirdi**: oyuncu kullanabildiği bir
   * yeteneği bakımdan sonra kullanamaz hâle gelirdi. Aynısı sur/mağara onarımı için de geçerli.
   */
  it('dolmuş teleport / onarım süreleri OLDUĞU GİBİ kalır', async () => {
    await h.db.execute(sql`
      UPDATE cities SET teleport_ready_at = now() - interval '2 hours',
                        cave_repair_until = now() - interval '3 hours',
                        wall_repair_until = now() - interval '4 hours',
                        wall_repair_from  = now() - interval '5 hours'
       WHERE id = ${cityId}
    `);
    const [pre] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT teleport_ready_at, cave_repair_until, wall_repair_until, wall_repair_from
        FROM cities WHERE id = ${cityId}
    `);

    await pauseAndResume();

    const [post] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT teleport_ready_at, cave_repair_until, wall_repair_until, wall_repair_from
        FROM cities WHERE id = ${cityId}
    `);
    for (const k of ['teleport_ready_at', 'cave_repair_until', 'wall_repair_until', 'wall_repair_from']) {
      expect(String(post![k]), `${k} DİRİLDİ — geçmiş bir vade kaydırıldı`).toBe(String(pre![k]));
    }
  });

  /** Biten görev de kaymamalı — yalnız bekleyenler ve saldırı penceresindekiler kayar. */
  it('tamamlanmış eski görev kaydırılmaz', async () => {
    const m = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO missions (world_id, type, status, execute_at, finished_at)
      VALUES (${worldId}, 'echo', 'done', now() - interval '10 days', now() - interval '10 days')
      RETURNING id, execute_at
    `);
    const id = Number(m[0]!['id']);
    const pre = String(m[0]!['execute_at']);

    await pauseAndResume();

    const [post] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT execute_at FROM missions WHERE id = ${id}
    `);
    expect(String(post!['execute_at'])).toBe(pre);
  });
});

/* ═══ T6 — atomiklik ══════════════════════════════════════════════════════ */

describe('T6 — kaydırma ya tamamen olur ya hiç', () => {
  /**
   * ⭐⭐ "Yarısı kaymış dünya" **tespit edilemez** bir durumdur: hangi sütunun kaydığını
   * söyleyen hiçbir kayıt olmaz. Tek transaction onu var olamaz kılıyor.
   *
   * Kurgu: kaydırma sırasında bir tabloyu yazılamaz hâle getiriyoruz (`heroes` üzerinde
   * ihlal edilecek bir CHECK). Kaydırma patlar → hiçbir tablo kaymamış olmalı, dünya
   * **hâlâ bakımda** kalmalı (`paused_at = NULL` en son ve aynı transaction'da).
   */
  it('ortada patlarsa hiçbir satır kaymaz ve dünya bakımda kalır', async () => {
    await h.db.execute(sql`
      UPDATE players SET protected_until = now() + interval '2 hours' WHERE id = ${playerId}
    `);
    await h.db.execute(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, status, revive_until)
      VALUES (${worldId}, ${playerId}, ${cityId}, 'patlayan', 'reviving', now() + interval '1 hour')
    `);
    const [pre] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT protected_until FROM players WHERE id = ${playerId}
    `);
    const preCity = await h.db.execute<Record<string, unknown>>(sql`
      SELECT resources_at FROM cities WHERE id = ${cityId}
    `);

    // ⚠️ Kaydırmanın `heroes.revive_until` UPDATE'ini imkânsız kılan bir kısıt.
    await h.db.execute(sql`
      ALTER TABLE heroes ADD CONSTRAINT heroes_shift_bomb
        CHECK (revive_until IS NULL OR revive_until < '2000-01-01'::timestamptz) NOT VALID
    `);
    try {
      await clock.pause(worldId);
      await h.db.execute(sql`
        UPDATE worlds SET paused_at = paused_at - interval '10 minutes' WHERE id = ${worldId}
      `);
      await expect(clock.resume(worldId)).rejects.toThrow();

      // Hiçbir şey kaymamış olmalı.
      const [postP] = await h.db.execute<Record<string, unknown>>(sql`
        SELECT protected_until FROM players WHERE id = ${playerId}
      `);
      expect(String(postP!['protected_until'])).toBe(String(pre!['protected_until']));

      const postCity = await h.db.execute<Record<string, unknown>>(sql`
        SELECT resources_at FROM cities WHERE id = ${cityId}
      `);
      expect(String(postCity[0]!['resources_at'])).toBe(String(preCity[0]!['resources_at']));

      // ⭐ Dünya HÂLÂ bakımda: `paused_at = NULL` kaydırmayla aynı transaction'da ve EN SON.
      expect((await clock.read(worldId)).paused).toBe(true);

      // Ve defterde "uygulandı" diyen bir satır kalmamalı.
      const shifts = await h.db.execute<Record<string, unknown>>(sql`
        SELECT COUNT(*)::int AS n FROM time_shifts WHERE world_id = ${worldId}
      `);
      expect(Number(shifts[0]!['n'])).toBe(0);
    } finally {
      await h.db.execute(sql`ALTER TABLE heroes DROP CONSTRAINT IF EXISTS heroes_shift_bomb`);
    }
  });
});

/* ═══ T9 — sıralama zinciri ═══════════════════════════════════════════════ */

describe('T9 — sıralama zinciri kaydırmadan sonra kopmuyor', () => {
  /**
   * ⚠️ `ranking_snapshot` görevi de bir `missions` satırı, yani kaydırılıyor. Kaydırılmasaydı
   * bakımdan çıkar çıkmaz ateşlenir ve **yuvasından erken** bir anlık görüntü alırdı —
   * 2026-08-03'te canlıda tam olarak bu oldu ve `prev_rank` geri alınamaz biçimde kaydı.
   *
   * ⚠️ `ranking_runs.taken_at` ise kaydırılmıyor (geçmiş olay). Bu bilinçli asimetri burada
   * kilitleniyor: bekleyen GÖREV kayar, alınmış KAYIT kaymaz.
   */
  it('bekleyen anlık görüntü görevi kayar, alınmış koşu kaymaz', async () => {
    const m = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO missions (world_id, type, status, execute_at, idempotency_key)
      VALUES (${worldId}, 'ranking_snapshot', 'scheduled', now() + interval '3 hours',
              ${`rank:${worldId}`})
      RETURNING id, execute_at
    `);
    const mid = Number(m[0]!['id']);
    const preDue = new Date(String(m[0]!['execute_at'])).getTime();

    const run = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO ranking_runs (world_id, taken_at, entries)
      VALUES (${worldId}, now() - interval '1 hour', 5)
      RETURNING id, taken_at
    `);
    const preTaken = String(run[0]!['taken_at']);

    const { shiftMs } = await pauseAndResume();

    const [postM] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT execute_at FROM missions WHERE id = ${mid}
    `);
    const postDue = new Date(String(postM!['execute_at'])).getTime();
    expect(postDue - preDue).toBeGreaterThanOrEqual(shiftMs - 1_000);

    const [postRun] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT taken_at FROM ranking_runs WHERE id = ${Number(run[0]!['id'])}
    `);
    // ⭐ Geçmiş olay damgası KAYMAZ — kaydırmak tarihi çarpıtırdı.
    expect(String(postRun!['taken_at'])).toBe(preTaken);

    // Zincir hâlâ tek ve bekliyor.
    const pending = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM missions
       WHERE world_id = ${worldId} AND type = 'ranking_snapshot' AND status = 'scheduled'
    `);
    expect(Number(pending[0]!['n'])).toBe(1);
  });
});

/* ═══ Kapsam bekçisi ══════════════════════════════════════════════════════ */

describe('kapsam', () => {
  /**
   * ⚠️ Yukarıdaki T2 testi kayıt defterindeki girişleri ELLE sayıyor. Defter büyüdüğünde bu
   * liste geride kalabilir — o zaman yeni sütun ölçülmeden geçer. Bu bekçi sayıyı kilitliyor:
   * defter değişince burası kırılır ve T2'ye yeni bir prob eklenmesi gerektiği anlaşılır.
   */
  it('kayıt defterinin boyutu T2 kapsamıyla uyumlu', () => {
    expect(
      TIME_SHIFT_REGISTRY.length,
      'kayıt defteri değişti — T2 prob listesine yeni sütunu ekle',
    ).toBe(15);
  });
});
