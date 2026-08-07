/**
 * ⭐⭐ GECELİK OTOMATİK TEMİZLİK (Faz 3).
 *
 * **Bu dosya bir taahhüdün hesabını soruyor.** §9.1.2 *"çoklu hesap izleri 90 gün saklanır,
 * gizlilik metninde açıkça yazılır"* diyordu ve `CLEANUP_JOBS` aylardır duruyordu — ama yalnız
 * yönetici panelde düğmeye bastığında koşuyordu, yani pratikte hiç. **Kodu olmayan taahhüt
 * taahhüt değildir.**
 *
 * ⚠️ Testlerin çoğu silinen satırı değil **KALAN** satırı doğruluyor: otomatik bir silici için
 * asıl risk "az sildi" değil, "fazla sildi"dir ve bu geri alınamaz.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CLEANUP_JOBS, retentionOf, type OpsRetention } from '../src/admin/ops-jobs.ts';
import type { DbHandle } from '../src/db/client.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import {
  AUTO_JOBS, createCleanupHandler, ensureCleanupSchedule, nextCleanupAt,
} from '../src/ops/cleanup.handler.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { clearOutbox, createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;

const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();

/** Handler'ı scheduler üzerinden koşturur — gerçek transaction ve `ctx.audit` yolu dâhil. */
async function runCleanup(over: Partial<OpsRetention> = {}): Promise<void> {
  const registry = new HandlerRegistry().register(
    'ops_cleanup',
    createCleanupHandler(() => ({ ...retentionOf({}), ...over })),
  );
  const s = new SchedulerService(h.db, clock, registry, { worldId, workerId: 'c-test' });
  const r = await s.tick();
  expect(r.dead).toBe(0);
}

async function count(table: string, where = sql`TRUE`): Promise<number> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT COUNT(*)::int AS n FROM ${sql.raw(`"${table}"`)} WHERE ${where}
  `);
  return Number(rows[0]?.['n'] ?? 0);
}

/**
 * Vadesi GELMİŞ bir `ops_cleanup` satırı — zincirin ürettiğinin birebir aynısı, yalnız yuvası
 * geçmişte.
 *
 * ⚠️⚠️ İlk yazımda bunun yerine `ensureCleanupSchedule` + `UPDATE ... execute_at = now()`
 * kullanmıştım ve iki test kırıldı: `idempotency_key` hâlâ **yarınki** yuvayı gösteriyordu,
 * handler de aynı anahtarı üretip `ON CONFLICT DO NOTHING`e düşüyordu → zincir kopmuş göründü.
 *
 * ⭐ Kurgu yanlıştı, kod değil — ve bu ayrım önemli: üretimde `execute_at` **yuvanın kendisidir**.
 * Görev ancak `execute_at <= now()` iken alınıyor, yani handler koştuğunda gerçek şimdi daima
 * yuvaya eşit ya da ondan büyük; `nextCleanupAt` bu yüzden HER ZAMAN bir sonraki günü döndürüyor
 * ve anahtar hiç çakışmıyor. (Bakım kaydırması `execute_at`i ileri itse bile ilişki bozulmuyor.)
 * Test o değişmezi taklit etmeliydi, elle bozmamalıydı.
 */
async function seedDueCleanup(): Promise<void> {
  const at = new Date(Date.now() - 60_000);
  await h.db.execute(sql`
    INSERT INTO missions (world_id, type, status, execute_at, payload, idempotency_key)
    VALUES (${worldId}, 'ops_cleanup', 'scheduled', ${at.toISOString()}::timestamptz,
            '{}'::jsonb, ${`cleanup:${at.toISOString()}`})
  `);
}

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
}, 60_000);
afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  await clearOutbox(h);
  await h.db.execute(sql`DELETE FROM scheduler_samples`);
});

describe('zamanlama', () => {
  it('bir sonraki koşu ERTESİ günün penceresine düşer', () => {
    const at = nextCleanupAt(new Date('2026-08-07T05:00:00Z'), 4);
    expect(at.toISOString()).toBe('2026-08-08T04:00:00.000Z');
  });

  /**
   * ⚠️⚠️ Aynı günü hesaplasaydık `ctx.at` vadeye eşit olduğu için GEÇMİŞTE bir an dönerdi ve
   * görev anında yeniden ateşlenirdi — sonsuz döngü. Sınır tam olarak burada.
   */
  it('pencere saatinin TAM ÜSTÜNDE bile ertesi güne atlar (sonsuz döngü yok)', () => {
    const at = nextCleanupAt(new Date('2026-08-07T04:00:00Z'), 4);
    expect(at.toISOString()).toBe('2026-08-08T04:00:00.000Z');
  });

  it('pencereden ÖNCE ise aynı gün koşar', () => {
    const at = nextCleanupAt(new Date('2026-08-07T03:59:00Z'), 4);
    expect(at.toISOString()).toBe('2026-08-07T04:00:00.000Z');
  });

  it('ensureCleanupSchedule tek görev yazar, ikinci çağrı kopya üretmez', async () => {
    await ensureCleanupSchedule(h.db, worldId, 4);
    await ensureCleanupSchedule(h.db, worldId, 4);
    expect(await count('missions', sql`world_id = ${worldId} AND type = 'ops_cleanup'`)).toBe(1);
  });

  /**
   * ⭐⭐ ZİNCİR HER KOŞULDA İLERLER — ana anahtar KAPALIYKEN bile.
   *
   * ⚠️ Aksi hâlde `autoCleanup`u kapatmak zinciri KALICI olarak öldürürdü ve yeniden açmak
   * worker yeniden başlatmayı gerektirirdi. `ranking_snapshot` zinciri 2026-08-05'te canlıda
   * tam olarak bu sınıf bir kopmayla 15 saat ölü kaldı.
   */
  it('kapalıyken bile bir SONRAKİ görevi yazar (zincir kopmaz)', async () => {
    await seedDueCleanup();
    await runCleanup({ autoCleanup: false });

    const next = await count(
      'missions', sql`world_id = ${worldId} AND type = 'ops_cleanup' AND status = 'scheduled'`,
    );
    expect(next).toBe(1);
  });

  it('koşan görev zinciri sürdürür (done + yeni scheduled)', async () => {
    await seedDueCleanup();
    await runCleanup();

    expect(await count('missions', sql`world_id = ${worldId} AND type = 'ops_cleanup' AND status = 'done'`)).toBe(1);
    expect(await count('missions', sql`world_id = ${worldId} AND type = 'ops_cleanup' AND status = 'scheduled'`)).toBe(1);
  });
});

describe('ne siler, ne silmez', () => {
  /**
   * ⭐ TAAHHÜDÜN KENDİSİ: §9.1.2 çoklu hesap izleri için **90 gün**. Bu test, taahhüdün artık
   * bir kodu olduğunu ölçüyor.
   */
  it('90 günü geçmiş IP izi otomatik silinir, taze olan KALIR', async () => {
    // ⚠️ `createPlayer` yardımcısı — e-postayı RASTGELE üretiyor. Sabit yazsaydık dünya
    // kimlikleri her koşuda 100'den başladığı için ikinci koşuda tekillik çakışırdı (yaşandı).
    const player = await createPlayer(h, worldId, 'ipt');
    await h.db.execute(sql`
      INSERT INTO player_ips (player_id, ip, first_seen, last_seen, hits) VALUES
        (${player}, '203.0.113.9',  ${daysAgo(200)}::timestamptz, ${daysAgo(120)}::timestamptz, 1),
        (${player}, '203.0.113.10', ${daysAgo(200)}::timestamptz, ${daysAgo(3)}::timestamptz,   1)
    `);

    await seedDueCleanup();
    await runCleanup();

    const left = await h.db.execute<Record<string, unknown>>(sql`
      SELECT ip FROM player_ips WHERE player_id = ${player} ORDER BY ip
    `);
    // ⚠️ Ölçüt `last_seen`: hâlâ kullanılan bir cihaz, ilk görüldüğü gün eskidi diye silinmemeli.
    expect(left.map((r) => String(r['ip']))).toEqual(['203.0.113.10']);
  });

  it('teslim edilmiş eski outbox satırı gider, teslim EDİLMEMİŞ kalır', async () => {
    await h.db.execute(sql`
      INSERT INTO outbox (world_id, topic, payload, created_at, dispatched_at) VALUES
        (${worldId}, 'x:done',    '{}'::jsonb, ${daysAgo(30)}::timestamptz, ${daysAgo(30)}::timestamptz),
        (${worldId}, 'x:pending', '{}'::jsonb, ${daysAgo(30)}::timestamptz, NULL)
    `);

    await seedDueCleanup();
    await runCleanup();

    const left = await h.db.execute<Record<string, unknown>>(sql`
      SELECT topic FROM outbox WHERE world_id = ${worldId} AND topic LIKE 'x:%'
    `);
    // ⚠️ Bekleyen bir bildirimi kaybetmek, temizliğin üretebileceği EN KÖTÜ sonuç.
    expect(left.map((r) => String(r['topic']))).toEqual(['x:pending']);
  });

  /**
   * ⭐⭐ OYUNCUNUN KENDİ GEÇMİŞİNE OTOMATİK EL SÜRÜLMÜYOR. `messages` ve `chat` bilerek
   * `auto: false`: onlarda bir insanın kuru koşuyu görmesi gerekiyor.
   */
  it('postalar ve sohbet otomatik koşuda DIŞARIDA', () => {
    const autoIds = AUTO_JOBS.map((j) => j.id);
    expect(autoIds).not.toContain('messages');
    expect(autoIds).not.toContain('chat');
    // Ama gizlilik taahhüdü olanlar ve saf altyapı İÇERİDE olmak zorunda.
    for (const id of ['player_ips', 'player_devices', 'scheduler_samples', 'outbox', 'sessions']) {
      expect(autoIds).toContain(id);
    }
  });

  it('çok eski bir posta otomatik koşuda SİLİNMEZ', async () => {
    const player = await createPlayer(h, worldId, 'mt');
    await h.db.execute(sql`
      INSERT INTO messages (world_id, player_id, kind, subject, at, read_at, created_at)
      VALUES (${worldId}, ${player}, 'system', 'eski', ${daysAgo(900)}::timestamptz,
              ${daysAgo(900)}::timestamptz, ${daysAgo(900)}::timestamptz)
    `);

    await seedDueCleanup();
    await runCleanup();

    expect(await count('messages', sql`player_id = ${player}`)).toBe(1);
  });

  /** Faz 3'ün kendi tablosu dizginlenmeli: dakikada bir satır yazan bir izleyici var. */
  it('saklama penceresini geçmiş kuyruk örnekleri silinir, taze olanlar kalır', async () => {
    await h.db.execute(sql`
      INSERT INTO scheduler_samples (world_id, at) VALUES
        (${worldId}, ${daysAgo(120)}::timestamptz),
        (${worldId}, ${daysAgo(1)}::timestamptz)
    `);

    await seedDueCleanup();
    await runCleanup();

    expect(await count('scheduler_samples', sql`world_id = ${worldId}`)).toBe(1);
  });

  /** ⚠️ Ana anahtar kapalıyken HİÇBİR ŞEY silinmemeli — kapatmanın anlamı bu. */
  it('kapalıyken hiçbir satıra dokunmaz', async () => {
    await h.db.execute(sql`
      INSERT INTO scheduler_samples (world_id, at) VALUES (${worldId}, ${daysAgo(120)}::timestamptz)
    `);
    await seedDueCleanup();
    await runCleanup({ autoCleanup: false });

    expect(await count('scheduler_samples', sql`world_id = ${worldId}`)).toBe(1);
  });
});

describe('denetim kaydı', () => {
  /**
   * ⚠️ Kayıt **her koşuda**, sıfır satır silinse bile. Yalnız silme olduğunda yazsaydık
   * "zincir sessizce koptu" ile "silinecek bir şey yoktu" ayırt edilemezdi.
   */
  it('silme olmasa bile satır yazar', async () => {
    await seedDueCleanup();
    await runCleanup();

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT action, after FROM audit_log
       WHERE world_id = ${worldId} AND action = 'ops.cleanup.auto'
    `);
    expect(rows).toHaveLength(1);
    const after = rows[0]!['after'] as Record<string, unknown>;
    expect(after['enabled']).toBe(true);
    expect(after['deleted']).toBe(0);
    expect(String(after['nextAt'])).toMatch(/T04:00:00/);
  });

  it('kapalı koşu da kaydedilir ve enabled=false yazar', async () => {
    await seedDueCleanup();
    await runCleanup({ autoCleanup: false });

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT after FROM audit_log WHERE world_id = ${worldId} AND action = 'ops.cleanup.auto'
    `);
    expect((rows[0]!['after'] as Record<string, unknown>)['enabled']).toBe(false);
  });
});

describe('kayıt defteri bütünlüğü', () => {
  /** ⚠️ Yeni bir temizlik işi eklerken `auto` kararı UNUTULAMAZ — burada kırılır. */
  it('her işin auto kararı açıkça verilmiş', () => {
    for (const j of CLEANUP_JOBS) expect(typeof j.auto).toBe('boolean');
  });

  /** Varsayılan: saklama taahhüdü UYGULANIR. Kapalı varsayılan onu yine tıklamaya bağlardı. */
  it('ayar satırı hiç yokken otomatik temizlik AÇIK gelir', () => {
    expect(retentionOf({}).autoCleanup).toBe(true);
    expect(retentionOf({ autoCleanup: false }).autoCleanup).toBe(false);
    expect(retentionOf({}).autoCleanupHour).toBe(4);
  });

  /** Saat sınırları zorlanmalı: bozuk bir ayar `setUTCHours`u anlamsız bir yere sürüklemesin. */
  it('temizlik saati 0-23 aralığına kıstırılır', () => {
    expect(retentionOf({ autoCleanupHour: 99 }).autoCleanupHour).toBe(23);
    expect(retentionOf({ autoCleanupHour: -5 }).autoCleanupHour).toBe(0);
  });
});
