/**
 * ⭐ BAKIM VE PERFORMANS (admin Faz 8).
 *
 * İki iddiayı ölçüyor:
 *   1. **Canlılık türetilemez, imzalanır.** Kuyruk boşken "gecikme yok" ile "worker öldü"
 *      aynı görünür; nabız satırı ikisini ayırır.
 *   2. **Temizlik neyi SİLMEDİĞİYLE tanımlanır.** Her görevin bir "koruma" kuralı var ve
 *      testlerin çoğu silinen satırı değil **kalan** satırı doğruluyor.
 *
 * ⚠️ Test satırları bilerek ÇOK eski (200–500 gün) tarihlerle yazılıyor: temizlik görevleri
 * dünya-kapsamlı değil (tüm tabloyu tarar) ve varsayılan saklama süreleri 7–365 gün. Taze
 * satırlar hiçbir eşiğe girmediği için diğer test dosyalarının verisi etkilenmiyor.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminOpsController } from '../src/admin/admin.ops.controller.ts';
import { CLEANUP_JOBS, JOBS_BY_ID } from '../src/admin/ops-jobs.ts';
import type { AdminRequest } from '../src/admin/admin.guard.ts';
import type { DbHandle } from '../src/db/client.ts';
import { OUTBOX_MAX_ATTEMPTS, OutboxDispatcher } from '../src/outbox/outbox.dispatcher.ts';
import { SettingsService } from '../src/settings/settings.service.ts';
import { Heartbeat } from '../src/worker/heartbeat.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let ops: AdminOpsController;
let settings: SettingsService;
let worldId: number;
let playerId: number;
let accountId: number;

const req = (): AdminRequest => ({
  player: { accountId, playerId, worldId, sessionId: '' },
  staff: { role: 'admin', elevated: true },
  headers: {},
} as unknown as AdminRequest);

/** `now() - n gün` — seed satırlarını eşiğin ötesine itmek için. */
const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();

interface JobPreview {
  id: string; matched: number; tableRows: number; oldest: unknown;
  keeps: string; description: string;
}

async function previewOf(id: string): Promise<JobPreview> {
  const out = await ops.cleanupPreview(req()) as { jobs: JobPreview[] };
  return out.jobs.find((j) => j.id === id)!;
}

beforeAll(async () => {
  h = await setupTestDb();
  settings = new SettingsService(h.db);
  await settings.load();
  ops = new AdminOpsController(h.db, settings);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  playerId = await createPlayer(h, worldId, 'ops');
  const [acc] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT account_id FROM players WHERE id = ${playerId}
  `);
  accountId = Number(acc!['account_id']);
  await h.db.execute(sql`DELETE FROM worker_heartbeats`);
});

/* ═══ 1. CANLILIK — türetilemeyen bilgi ═══════════════════════════════════════ */

describe('döngü nabzı', () => {
  it('nabız yoksa panel «sağlıklı» DEMEZ, «bilinmiyor» der', async () => {
    const out = await ops.health(req()) as Record<string, unknown>;
    // ⭐ Fazın gerekçesi: satır yokluğu sessizce "her şey yolunda"ya dönüşmemeli.
    expect(out['loopsKnown']).toBe(false);
    expect(out['loops']).toEqual([]);
  });

  it('scheduler ve dispatcher AYRI satır tutar', async () => {
    await new Heartbeat(h.db, 'scheduler', { workerId: 'w1', worldId }).beat({ done: 3 });
    await new Heartbeat(h.db, 'dispatcher', { workerId: 'w1', worldId }).beat({ dispatched: 7 });

    const out = await ops.health(req()) as { loops: Record<string, unknown>[]; loopsKnown: boolean };
    expect(out.loopsKnown).toBe(true);
    const kinds = out.loops.map((l) => l['kind']).sort();
    expect(kinds).toEqual(['dispatcher', 'scheduler']);
    // Tek satır tutsaydık dispatcher bloke olurken scheduler'ın nabzı onu gizlerdi.
    expect(out.loops.find((l) => l['kind'] === 'scheduler')!['detail']).toEqual({ done: 3 });
    expect(out.loops.find((l) => l['kind'] === 'dispatcher')!['detail']).toEqual({ dispatched: 7 });
  });

  it('bayat nabız ÖLÜ sayılır, taze nabız CANLI', async () => {
    await new Heartbeat(h.db, 'scheduler', { workerId: 'fresh', worldId }).beat({});
    await new Heartbeat(h.db, 'dispatcher', { workerId: 'stale', worldId }).beat({});
    // Eşik varsayılanı 30 sn; bu satırı 10 dakika geriye itiyoruz.
    await h.db.execute(sql`
      UPDATE worker_heartbeats SET at = now() - interval '10 minutes' WHERE worker_id = 'stale'
    `);

    const out = await ops.health(req()) as { loops: Record<string, unknown>[]; staleAfterS: number };
    expect(out.staleAfterS).toBe(30);
    expect(out.loops.find((l) => l['workerId'] === 'fresh')!['alive']).toBe(true);
    expect(out.loops.find((l) => l['workerId'] === 'stale')!['alive']).toBe(false);
    expect(Number(out.loops.find((l) => l['workerId'] === 'stale')!['ageS'])).toBeGreaterThan(500);
  });

  it('nabız KISITLANIYOR: aynı saniyedeki ikinci tur yazmaz ama tur sayar', async () => {
    let t = 1_000_000;
    const hb = new Heartbeat(h.db, 'scheduler', {
      workerId: 'throttle', worldId, minIntervalMs: 5_000, now: () => t,
    });
    await hb.beat({ n: 1 });                 // ilk çağrı daima yazar
    t += 1_000; await hb.beat({ n: 2 });     // kısıtlandı
    t += 1_000; await hb.beat({ n: 3 });     // kısıtlandı

    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT ticks, detail FROM worker_heartbeats WHERE worker_id = 'throttle'
    `);
    // 2. ve 3. tur DB'ye hiç dokunmadı: satır hâlâ ilk turun anlık görüntüsü.
    expect(row!['detail']).toEqual({ n: 1 });
    expect(Number(row!['ticks'])).toBe(1);

    t += 5_000; await hb.beat({ n: 4 });
    const [after] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT ticks, detail FROM worker_heartbeats WHERE worker_id = 'throttle'
    `);
    /**
     * ⭐ Asıl iddia burada: 4 tur, 2 yazım — ve sayaç **4** diyor, 2 değil. Sayaç YAZIM
     * sayısını değil TUR sayısını ölçüyor; aksi hâlde panel kısıtlama oranında yanlış bir
     * "tur hızı" gösterirdi.
     */
    expect(after!['detail']).toEqual({ n: 4 });
    expect(Number(after!['ticks'])).toBe(4);
  });

  it('⭐ süpürme AÇILIŞA ÖZEL DEĞİL — sonradan bayatlayan artık da temizlenir', async () => {
    /**
     * Canlı ölçümün yakaladığı açık: yeni süreç kalktığında selefinin satırı henüz 27
     * saniyelikti (1 saatlik eşiğin çok altında) → ilk nabızda süpürülmedi ve süpürme bir
     * kereye özel olduğu için panelde KALICI iki «ÖLÜ» satır kaldı.
     */
    let t = 5_000_000;
    await new Heartbeat(h.db, 'scheduler', { workerId: 'onceki', worldId }).beat({});
    const hb = new Heartbeat(h.db, 'scheduler', {
      workerId: 'sonraki', worldId, minIntervalMs: 0, sweepEveryMs: 60_000, now: () => t,
    });

    await hb.beat({});   // ilk nabız: selef henüz taze → süpürülmüyor (doğru)
    const first = await h.db.execute<Record<string, unknown>>(sql`
      SELECT worker_id FROM worker_heartbeats WHERE world_id = ${worldId} AND kind = 'scheduler'
    `);
    expect(first.length).toBe(2);

    // Selef bayatlıyor; süreç çalışmaya devam ediyor.
    await h.db.execute(sql`
      UPDATE worker_heartbeats SET at = now() - interval '3 hours' WHERE worker_id = 'onceki'
    `);
    t += 61_000;
    await hb.beat({});

    const after = await h.db.execute<Record<string, unknown>>(sql`
      SELECT worker_id FROM worker_heartbeats WHERE world_id = ${worldId} AND kind = 'scheduler'
    `);
    expect(after.map((r) => r['worker_id'])).toEqual(['sonraki']);
  });

  it('yeniden başlayan süreç ESKİ pid\'in artığını süpürür, canlı olanı bırakır', async () => {
    // Üç satır: aynı türden bayat bir artık, canlı bir komşu, ve BAŞKA türden bir bayat.
    await new Heartbeat(h.db, 'scheduler', { workerId: 'worker-111', worldId }).beat({});
    await new Heartbeat(h.db, 'scheduler', { workerId: 'worker-222', worldId }).beat({});
    await new Heartbeat(h.db, 'dispatcher', { workerId: 'worker-111', worldId }).beat({});
    await h.db.execute(sql`
      UPDATE worker_heartbeats SET at = now() - interval '3 hours' WHERE worker_id = 'worker-111'
    `);

    // Yeni süreç (yeni pid) kalkıyor.
    await new Heartbeat(h.db, 'scheduler', { workerId: 'worker-333', worldId }).beat({});

    const left = await h.db.execute<Record<string, unknown>>(sql`
      SELECT kind, worker_id FROM worker_heartbeats WHERE world_id = ${worldId}
       ORDER BY kind, worker_id
    `);
    /**
     * ⭐ Süpürme YALNIZ kendi türünü ve yalnız bayat olanı hedefliyor:
     *   • scheduler/worker-111 (3 saatlik artık) → silindi
     *   • scheduler/worker-222 (canlı komşu)     → duruyor  ⇒ çok worker'lı kurulum bozulmaz
     *   • dispatcher/worker-111 (başka tür)      → duruyor  ⇒ bir döngünün ölümü diğerini gizlemez
     */
    expect(left.map((r) => `${r['kind']}/${r['worker_id']}`)).toEqual([
      'dispatcher/worker-111', 'scheduler/worker-222', 'scheduler/worker-333',
    ]);
  });

  it('halefi olmayan ölü nabız KALIR — asıl görmek istediğimiz durum bu', async () => {
    await new Heartbeat(h.db, 'scheduler', { workerId: 'worker-olu', worldId }).beat({});
    await h.db.execute(sql`
      UPDATE worker_heartbeats SET at = now() - interval '3 hours' WHERE worker_id = 'worker-olu'
    `);
    // Kimse yerine geçmedi → kimse süpürmüyor. Panel «ÖLÜ» diyebilmeli.
    const out = await ops.health(req()) as { loops: Record<string, unknown>[] };
    const dead = out.loops.find((l) => l['workerId'] === 'worker-olu');
    expect(dead).toBeTruthy();
    expect(dead!['alive']).toBe(false);
  });

  it('nabız yazımı patlarsa döngü ETKİLENMEZ (hata yutulur)', async () => {
    const broken = { execute: () => Promise.reject(new Error('DB kapalı')) };
    const hb = new Heartbeat(broken as never, 'scheduler', { workerId: 'x' });
    // Atmamalı: izleme kaydının arızası izlediği sistemi durdurmamalı.
    await expect(hb.beat({})).resolves.toBeUndefined();
  });

  it('dispatcher turu nabzını kendi yazar', async () => {
    const dispatcher = new OutboxDispatcher(h.db, {
      heartbeat: new Heartbeat(h.db, 'dispatcher', { workerId: 'live', worldId }),
    });
    await dispatcher.tick();
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT detail FROM worker_heartbeats WHERE kind = 'dispatcher' AND worker_id = 'live'
    `);
    expect(row).toBeTruthy();
    expect((row!['detail'] as Record<string, unknown>)['pollIntervalMs']).toBe(500);
  });
});

/* ═══ 2. KUYRUKLAR ════════════════════════════════════════════════════════════ */

describe('kuyruk sağlığı', () => {
  it('ölü mektup ile yeniden denenen satır AYRI sayılır ve konusu görünür', async () => {
    await h.db.execute(sql`DELETE FROM outbox WHERE world_id = ${worldId}`);
    await h.db.execute(sql`
      INSERT INTO outbox (world_id, topic, payload, attempts, last_error) VALUES
        (${worldId}, 'mail:send', '{}'::jsonb, ${OUTBOX_MAX_ATTEMPTS}, 'Resend 401'),
        (${worldId}, 'mail:send', '{}'::jsonb, ${OUTBOX_MAX_ATTEMPTS}, 'Resend 401'),
        (${worldId}, 'battle:resolved', '{}'::jsonb, 3, 'gecici'),
        (${worldId}, 'battle:resolved', '{}'::jsonb, 0, NULL)
    `);
    const out = await ops.health(req()) as { outbox: Record<string, unknown> };
    expect(Number(out.outbox['dead'])).toBeGreaterThanOrEqual(2);
    expect(Number(out.outbox['retrying'])).toBeGreaterThanOrEqual(1);

    // ⭐ "10 satır bekliyor" eyleme dönüşmez; "hepsi mail:send" doğrudan anahtarı işaret eder.
    const topics = out.outbox['deadTopics'] as { topic: string; count: number; lastError: string }[];
    const mail = topics.find((t) => t.topic === 'mail:send')!;
    expect(mail.count).toBeGreaterThanOrEqual(2);
    expect(mail.lastError).toContain('Resend');
  });

  it('ölü mektup eşiği dispatcher ile AYNI kaynaktan geliyor', () => {
    // İki yerde 10 yazsaydık biri değişince panel "ölü" derken dispatcher denemeye devam ederdi.
    expect(new OutboxDispatcher(h.db).maxAttempts).toBe(OUTBOX_MAX_ATTEMPTS);
  });

  /**
   * ⭐⭐ BAKIMDA GECİKME DONAR — ve burada **gerçek bir hata yakalandı** (2026-08-07).
   *
   * Bu SQL'de `COALESCE(paused_at, …)` **eksikti**: hemen üstündeki yorum *"bakımdaki her dünya
   * saatlerce gecikmiş görünmesin"* diyordu ama kod tam olarak onu yapıyordu. Aynı metrik
   * `mission.repository.ts`te doğru hesaplanıyordu → iki yerde iki farklı sonuç, ve operatör
   * panele en çok baktığı anda (bakım sırasında) sahte bir kuyruk birikimi görüyordu.
   *
   * Eski test bunu göremezdi çünkü yalnız `clock_offset_ms` senaryosunu kuruyordu, `paused_at`i
   * hiç denemiyordu. Bu sürüm doğrudan bakım senaryosunu kuruyor.
   */
  it('görev gecikmesi bakımda DONAR (sahte alarm üretmez)', async () => {
    await h.db.execute(sql`
      INSERT INTO missions (world_id, type, status, execute_at)
      VALUES (${worldId}, 'echo', 'scheduled', now() - interval '3 hours')
    `);

    // Çalışan dünyada gecikme gerçek: ~3 saat.
    const calisan = await ops.health(req()) as { worlds: Record<string, unknown>[] };
    const wRun = calisan.worlds.find((x) => Number(x['worldId']) === worldId)!;
    expect(Number(wRun['scheduled'])).toBe(1);
    expect(Number(wRun['lagS'])).toBeGreaterThan(10_000);

    // Bakıma alıp duraklama anını 5 saat geriye çek: gerçek zamanda 5 saat daha geçmiş olsa
    // bile gecikme, duraklama ANINDAKİ değerde donmalı (5 saat eklenmemeli).
    await h.db.execute(sql`
      UPDATE worlds SET state = 'maintenance', paused_at = now() - interval '5 hours'
       WHERE id = ${worldId}
    `);
    const bakimda = await ops.health(req()) as { worlds: Record<string, unknown>[] };
    const wPaused = bakimda.worlds.find((x) => Number(x['worldId']) === worldId)!;

    /**
     * Vade 3 saat önce, donmuş saat 5 saat önce → görevin vadesi HENÜZ gelmemiş.
     * ⚠️ Controller negatif gecikmeyi `Math.max(0, …)` ile kırpıyor (`:187`), o yüzden
     * beklenen 0. Asıl kanıt bu: bozuk sürümde bu sayı **gerçek zamanla büyümeye devam
     * ederdi** (8 saat ve artan), şimdi donuyor.
     */
    expect(Number(wPaused['lagS'])).toBe(0);
  });

  it('bağlantı havuzu sunucu tarafını raporluyor', async () => {
    const out = await ops.health(req()) as { pool: Record<string, number> };
    expect(out.pool['maxConnections']).toBeGreaterThan(0);
    expect(out.pool['total']).toBeGreaterThan(0);
    expect(out.pool['total']).toBeLessThanOrEqual(out.pool['maxConnections']);
  });
});

/* ═══ 3. BOYUTLAR VE YAVAŞ SORGULAR ═══════════════════════════════════════════ */

describe('boyut ve sorgu ekranı', () => {
  it('tablolar büyükten küçüğe, indeks boyutu ayrı', async () => {
    const out = await ops.sizes() as { tables: Record<string, unknown>[]; databaseBytes: number };
    expect(out.databaseBytes).toBeGreaterThan(0);
    expect(out.tables.length).toBeGreaterThan(20);
    const bytes = out.tables.map((t) => Number(t['totalBytes']));
    expect([...bytes].sort((a, b) => b - a)).toEqual(bytes);

    const missions = out.tables.find((t) => t['table'] === 'missions')!;
    expect(Number(missions['totalBytes']))
      .toBe(Number(missions['tableBytes']) + Number(missions['indexBytes']));
    expect(Number(missions['indexCount'])).toBeGreaterThan(0);
  });

  it('hiç analiz edilmemiş tabloda satır sayısı 0 değil NULL', async () => {
    // ⚠️ reltuples −1 "bilinmiyor" demek. 0 gösterseydik "tablo boş" diye okunurdu.
    const out = await ops.sizes() as { tables: Record<string, unknown>[] };
    for (const t of out.tables) {
      expect(t['estRows'] === null || Number(t['estRows']) >= 0).toBe(true);
    }
  });

  it('pg_stat_statements yoksa 500 değil «available: false» döner', async () => {
    const out = await ops.slow() as Record<string, unknown>;
    expect(typeof out['available']).toBe('boolean');
    expect(Array.isArray(out['queries'])).toBe(true);
    if (out['available'] === false) expect(String(out['howTo'] ?? out['reason'])).toBeTruthy();
  });
});

/* ═══ 4. TEMİZLİK — asıl olan NE SİLİNMEDİĞİ ══════════════════════════════════ */

describe('temizlik görevleri', () => {
  it('kayıttaki her görevin tablosu gerçekten var ve zaman kolonu doğru', async () => {
    /**
     * ⭐ Faz 7'de aynı sınıftan bir test kayıttaki DÖRT yanlış kolon adını yakalamıştı.
     * Burada da elle yazılmış tablo/kolon adları `information_schema` ile karşılaştırılıyor.
     */
    for (const job of CLEANUP_JOBS) {
      const [row] = await h.db.execute<Record<string, unknown>>(sql`
        SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ${job.table}
           AND column_name = ${job.timeColumn}
      `);
      expect(row, `${job.id}: ${job.table}.${job.timeColumn} yok`).toBeTruthy();
      // ⚠️ Saklama GERÇEK zamanla ölçülür; oyun saatindeki kolonlara bakmak sapma üretir.
      expect(String(row!['data_type'])).toContain('timestamp');
    }
  });

  it('kuru koşu HİÇBİR ŞEY silmez', async () => {
    await h.db.execute(sql`
      INSERT INTO outbox (world_id, topic, payload, created_at, dispatched_at)
      VALUES (${worldId}, 'x', '{}'::jsonb, ${daysAgo(400)}::timestamptz, ${daysAgo(399)}::timestamptz)
    `);
    const before = await previewOf('outbox');
    expect(before.matched).toBeGreaterThanOrEqual(1);

    // `confirm` YOK → uç hata atmıyor, kuru koşu döndürüyor. Yanlış tıklama silmeye dönüşmesin.
    const dry = await ops.cleanupRun('outbox', {}, req()) as Record<string, unknown>;
    expect(dry['ran']).toBe(false);
    expect(dry['deleted']).toBe(0);
    expect((await previewOf('outbox')).matched).toBe(before.matched);
  });

  it('outbox: teslim EDİLMEMİŞ satır yaşı ne olursa olsun korunur', async () => {
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO outbox (world_id, topic, payload, created_at, dispatched_at, attempts)
      VALUES (${worldId}, 'teslim', '{}'::jsonb, ${daysAgo(400)}::timestamptz,
              ${daysAgo(399)}::timestamptz, 0),
             (${worldId}, 'olu-mektup', '{}'::jsonb, ${daysAgo(400)}::timestamptz,
              NULL, ${OUTBOX_MAX_ATTEMPTS})
      RETURNING id, topic
    `);
    const dead = rows.find((r) => r['topic'] === 'olu-mektup')!;

    await ops.cleanupRun('outbox', { confirm: true }, req());

    const left = await h.db.execute<Record<string, unknown>>(sql`
      SELECT topic FROM outbox WHERE world_id = ${worldId}
    `);
    /**
     * ⭐ Asıl iddia: 400 günlük bir ölü mektup bile silinmiyor. Bekleyen satır bir arıza
     * kanıtıdır; temizlemek arızayı görünmez yapar — temizliğin üretebileceği en kötü sonuç.
     */
    expect(left.map((r) => r['topic'])).toEqual(['olu-mektup']);
    expect(Number(dead['id'])).toBeGreaterThan(0);
  });

  it('postalar: OKUNMAMIŞ rapor saklama süresini geçse bile korunur', async () => {
    await h.db.execute(sql`
      INSERT INTO messages (world_id, player_id, kind, subject, at, created_at, read_at) VALUES
        (${worldId}, ${playerId}, 'battle_report', 'okunmus-eski', now(),
         ${daysAgo(200)}::timestamptz, ${daysAgo(200)}::timestamptz),
        (${worldId}, ${playerId}, 'battle_report', 'okunmamis-eski', now(),
         ${daysAgo(200)}::timestamptz, NULL),
        (${worldId}, ${playerId}, 'battle_report', 'okunmamis-cok-eski', now(),
         ${daysAgo(500)}::timestamptz, NULL)
    `);
    await ops.cleanupRun('messages', { confirm: true }, req());

    const left = await h.db.execute<Record<string, unknown>>(sql`
      SELECT subject FROM messages WHERE world_id = ${worldId} ORDER BY subject
    `);
    /**
     * 200 günlük OKUNMUŞ rapor gitti (eşik 60), 200 günlük OKUNMAMIŞ kaldı (tavan 365),
     * 500 günlük okunmamış tavanı da geçtiği için gitti.
     * ⭐ Oyuncunun hiç görmediği bir savaş raporunu silmek veriyi değil, ne olduğunu
     * öğrenme hakkını siler.
     */
    expect(left.map((r) => r['subject'])).toEqual(['okunmamis-eski']);
  });

  it('sohbet: sabitlenmiş mesaj korunur', async () => {
    const [ch] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO chat_channels (world_id, kind) VALUES (${worldId}, 'global') RETURNING id
    `);
    const channelId = Number(ch!['id']);
    await h.db.execute(sql`
      INSERT INTO chat_messages (channel_id, world_id, sender_id, body, is_pinned, created_at) VALUES
        (${channelId}, ${worldId}, ${playerId}, 'siradan', false, ${daysAgo(200)}::timestamptz),
        (${channelId}, ${worldId}, ${playerId}, 'kural',   true,  ${daysAgo(200)}::timestamptz)
    `);
    await ops.cleanupRun('chat', { confirm: true }, req());

    const left = await h.db.execute<Record<string, unknown>>(sql`
      SELECT body FROM chat_messages WHERE channel_id = ${channelId}
    `);
    // İttifak kuralları genelde sabitlenmiş bir mesajda durur.
    expect(left.map((r) => r['body'])).toEqual(['kural']);
  });

  it('oturumlar: CANLI zincir temizlikten etkilenmez', async () => {
    const live = randomUUID();
    const oldRevoked = randomUUID();
    const chain = randomUUID();
    await h.db.execute(sql`
      INSERT INTO sessions (id, account_id, refresh_hash, chain_id, expires_at, revoked_at, created_at)
      VALUES
        (${live}::uuid, ${accountId}, 'canli', ${chain}::uuid,
         now() + interval '30 days', NULL, ${daysAgo(300)}::timestamptz),
        (${oldRevoked}::uuid, ${accountId}, 'olu', ${chain}::uuid,
         ${daysAgo(200)}::timestamptz, ${daysAgo(200)}::timestamptz, ${daysAgo(300)}::timestamptz)
    `);
    await ops.cleanupRun('sessions', { confirm: true }, req());

    const left = await h.db.execute<Record<string, unknown>>(sql`
      SELECT refresh_hash FROM sessions WHERE account_id = ${accountId}
    `);
    /**
     * ⭐ 300 gün önce AÇILMIŞ ama hâlâ geçerli bir oturum silinmiyor: kriter satırın yaşı
     * değil ÖLÜ olup olmadığı. Aksi hâlde temizlik oyuncuları oturumundan düşürürdü.
     */
    expect(left.map((r) => r['refresh_hash'])).toEqual(['canli']);
  });

  it('push: eşiğin altındaki abonelik korunur', async () => {
    await h.db.execute(sql`
      INSERT INTO push_subscriptions (account_id, endpoint, p256dh, auth, fail_count, failed_at)
      VALUES
        (${accountId}, ${`https://x/${randomUUID()}`}, 'k', 'a', 9, ${daysAgo(200)}::timestamptz),
        (${accountId}, ${`https://x/${randomUUID()}`}, 'k', 'a', 2, ${daysAgo(200)}::timestamptz),
        (${accountId}, ${`https://x/${randomUUID()}`}, 'k', 'a', 0, NULL)
    `);
    await ops.cleanupRun('push', { confirm: true }, req());

    const left = await h.db.execute<Record<string, unknown>>(sql`
      SELECT fail_count FROM push_subscriptions WHERE account_id = ${accountId} ORDER BY fail_count
    `);
    expect(left.map((r) => Number(r['fail_count']))).toEqual([0, 2]);
  });

  it('e-posta jetonu: geçerli jeton korunur', async () => {
    await h.db.execute(sql`
      INSERT INTO email_tokens (account_id, purpose, token_hash, email, expires_at, created_at)
      VALUES
        (${accountId}, 'reset', ${randomUUID()}, 'a@b.c', ${daysAgo(200)}::timestamptz,
         ${daysAgo(200)}::timestamptz),
        (${accountId}, 'reset', ${randomUUID()}, 'a@b.c', now() + interval '1 day',
         ${daysAgo(200)}::timestamptz)
    `);
    await ops.cleanupRun('email_tokens', { confirm: true }, req());
    const [left] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM email_tokens
       WHERE account_id = ${accountId} AND expires_at > now()
    `);
    // Süresi geçmemiş jeton, satır 200 günlük olsa bile duruyor: jeton hâlâ işe yarıyor.
    expect(Number(left!['n'])).toBe(1);
  });

  it('sıralama: temizlenen tablo ranking_runs, rankings DEĞİL', async () => {
    await h.db.execute(sql`
      INSERT INTO ranking_runs (world_id, taken_at, entries, created_at)
      VALUES (${worldId}, now(), 5, ${daysAgo(200)}::timestamptz)
    `);
    await h.db.execute(sql`
      INSERT INTO rankings (world_id, kind, subject_id, rank, score, taken_at)
      VALUES (${worldId}, 'player', ${playerId}, 1, 100, ${daysAgo(200)}::timestamptz)
    `);
    await ops.cleanupRun('ranking_runs', { confirm: true }, req());

    const [runs] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM ranking_runs WHERE world_id = ${worldId}
    `);
    const [rank] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM rankings WHERE world_id = ${worldId}
    `);
    expect(Number(runs!['n'])).toBe(0);
    /**
     * ⭐ Plan "eski `rankings`" diyordu; ölçünce yanlış olduğu görüldü. `rankings` her anlık
     * görüntüde üzerine yazılıyor (unique world+kind+subject) → büyümüyor ve temizlenecek bir
     * şeyi yok. Sıralama ekranı bu satırı okuyor; silseydik sıralama boşalırdı.
     */
    expect(Number(rank!['n'])).toBe(1);
    expect(JOBS_BY_ID['ranking_runs']!.table).toBe('ranking_runs');
  });

  it('bilinmeyen görev 400, audit satırı yazılıyor', async () => {
    await expect(ops.cleanupRun('drop-everything', { confirm: true }, req())).rejects.toThrow();

    await h.db.execute(sql`
      INSERT INTO outbox (world_id, topic, payload, created_at, dispatched_at)
      VALUES (${worldId}, 'x', '{}'::jsonb, ${daysAgo(400)}::timestamptz, ${daysAgo(399)}::timestamptz)
    `);
    await h.db.execute(sql`DELETE FROM audit_log WHERE world_id = ${worldId}`);
    await ops.cleanupRun('outbox', { confirm: true }, req());

    const [log] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT action, entity, before, after FROM audit_log
       WHERE world_id = ${worldId} AND action = 'admin.ops.cleanup'
    `);
    expect(log).toBeTruthy();
    expect(String(log!['entity'])).toBe('outbox');
    // Saklama süreleri de kaydediliyor: "hangi eşikle silindi" sonradan sorulabilsin.
    expect((log!['before'] as Record<string, unknown>)['retention']).toBeTruthy();
    expect(Number((log!['after'] as Record<string, unknown>)['deleted'])).toBeGreaterThanOrEqual(1);
  });

  it('satır tavanı aşılırsa kalan bir sonraki koşuya bırakılıyor', async () => {
    await h.db.execute(sql`DELETE FROM outbox`);
    await h.db.execute(sql`
      INSERT INTO outbox (world_id, topic, payload, created_at, dispatched_at)
      SELECT ${worldId}, 'toplu', '{}'::jsonb, ${daysAgo(400)}::timestamptz,
             ${daysAgo(399)}::timestamptz
        FROM generate_series(1, 250)
    `);
    // Tavanı şemadaki en düşük değere (100) indir: 250 satır üç koşuda bitmeli.
    await settings.update({ worldId: 0, patch: { 'ops.cleanupBatch': 100 }, actorId: playerId });

    const first = await ops.cleanupRun('outbox', { confirm: true }, req()) as Record<string, unknown>;
    expect(first['deleted']).toBe(100);
    expect(first['remaining']).toBe(150);
    expect(first['capped']).toBe(true);

    // ⚠️ Milyonluk tek DELETE tabloyu kilitler ve oyunu durdurur; fren bilerek var.
    await ops.cleanupRun('outbox', { confirm: true }, req());
    const third = await ops.cleanupRun('outbox', { confirm: true }, req()) as Record<string, unknown>;
    expect(third['deleted']).toBe(50);
    expect(third['remaining']).toBe(0);
    expect(third['capped']).toBe(false);

    await settings.reset(0, ['ops.cleanupBatch']);
  });

  it('her görev NE SİLMEDİĞİNİ de anlatıyor', () => {
    // Panel "temizle" düğmesinin yanında bunu gösteriyor: karar tuzağı bilerek alınmalı.
    for (const job of CLEANUP_JOBS) {
      expect(job.keeps.length, job.id).toBeGreaterThan(20);
      expect(job.settings.length, job.id).toBeGreaterThan(0);
    }
  });
});
