/**
 * ⭐ FAZ 1 ÇIKIŞ KRİTERİ TESTLERİ (SİSTEM PLANI §12)
 *
 * "Worker'ı savaşın ortasında öldür → tekrar başlat → görev kaybolmadan, ÇİFT ÇALIŞMADAN,
 *  DOĞRU SIRAYLA tamamlanıyor. Bakıma al → 1 saat bekle → aç → geri sayımlar 1 saat ötelenmiş."
 *
 * Gerçek Postgres kullanılıyor: SKIP LOCKED, advisory lock ve transaction geri alma taklit edilemez.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/db/client.ts';
import { echoHandler } from '../src/missions/echo.handler.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { MissionRepository } from '../src/missions/mission.repository.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, echoEffects, enqueue, freshWorldId, missionRow, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;
let registry: HandlerRegistry;

const ago = (ms: number): Date => new Date(Date.now() - ms);

function scheduler(overrides: Partial<{ workerId: string; staleLockMs: number; maxAttempts: number; batchSize: number }> = {}): SchedulerService {
  return new SchedulerService(h.db, clock, registry, {
    worldId,
    workerId: overrides.workerId ?? 'test-worker',
    staleLockMs: overrides.staleLockMs ?? 60_000,
    maxAttempts: overrides.maxAttempts ?? 3,
    retryBackoffMs: 0,
    batchSize: overrides.batchSize ?? 50,
  });
}

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  registry = new HandlerRegistry().register('echo', echoHandler);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
});

describe('görev alma ve uygulama', () => {
  it('vadesi gelen görev işlenir, gelmeyen beklemede kalır', async () => {
    const due = await enqueue(h, { worldId, executeAt: ago(5_000), label: 'vadesi-gelmis' });
    const future = await enqueue(h, { worldId, executeAt: new Date(Date.now() + 3_600_000), label: 'gelecek' });

    const r = await scheduler().tick();

    expect(r.claimed).toBe(1);
    expect(r.done).toBe(1);
    expect((await missionRow(h, due)).status).toBe('done');
    expect((await missionRow(h, future)).status).toBe('scheduled');
  });

  it('handler "şimdi" olarak mission.executeAt görür — now() DEĞİL', async () => {
    const executeAt = ago(120_000);   // 2 dk geç işleniyor
    await enqueue(h, { worldId, executeAt, label: 'zaman' });

    await scheduler().tick();

    const [eff] = await echoEffects(h, worldId);
    // Handler'ın gördüğü an, görevin vadesi olmalı (gecikme kaynak/zincir kaydırmaz).
    expect(eff!.sawAt.getTime()).toBe(executeAt.getTime());
  });

  it('SIRA kesin: execute_at, sonra id', async () => {
    const t = Date.now() - 60_000;
    // Kasten ters sırada ekliyoruz.
    await enqueue(h, { worldId, executeAt: new Date(t + 2_000), label: 'ucuncu' });
    await enqueue(h, { worldId, executeAt: new Date(t), label: 'birinci' });
    await enqueue(h, { worldId, executeAt: new Date(t + 1_000), label: 'ikinci' });
    // Eşit zaman: önce oluşturulan (küçük id) kazanır.
    const a = await enqueue(h, { worldId, executeAt: new Date(t + 3_000), label: 'dorduncu-a' });
    const b = await enqueue(h, { worldId, executeAt: new Date(t + 3_000), label: 'besinci-b' });
    expect(a).toBeLessThan(b);

    await scheduler().tick();

    const labels = (await echoEffects(h, worldId)).map((e) => e.label);
    expect(labels).toEqual(['birinci', 'ikinci', 'ucuncu', 'dorduncu-a', 'besinci-b']);
  });

  it('catch-up: worker uzun süre kapalı kaldıysa birikmişleri sırayla işler', async () => {
    const t = Date.now() - 3 * 3_600_000;   // 3 saat önce başlayan zincir
    for (let i = 0; i < 20; i++) {
      await enqueue(h, { worldId, executeAt: new Date(t + i * 60_000), label: `g${String(i).padStart(2, '0')}` });
    }
    const r = await scheduler().tick();
    expect(r.done).toBe(20);
    const labels = (await echoEffects(h, worldId)).map((e) => e.label);
    expect(labels).toEqual([...labels].sort());   // sıra bozulmamış
  });
});

describe('⭐ crash kurtarma (çıkış kriteri)', () => {
  it('worker görevi aldıktan sonra ölürse görev KAYBOLMAZ, yeni worker tamamlar', async () => {
    const id = await enqueue(h, { worldId, executeAt: ago(1_000), label: 'crash' });

    // 1) "Ölen" worker görevi kilitler ama uygulamaz (crash'i böyle taklit ediyoruz).
    const repo = new MissionRepository(h.db);
    const claimed = await repo.claimDue({
      worldId, gameNow: new Date(), limit: 10, workerId: 'olen-worker',
    });
    expect(claimed).toHaveLength(1);
    expect((await missionRow(h, id)).status).toBe('running');

    // 2) Kilit bayatlar (worker geri dönmedi).
    await h.db.execute(sql`UPDATE missions SET locked_at = now() - interval '5 minutes' WHERE id = ${id}`);

    // 3) Yeni worker açılır: bayat kilidi kurtarır ve görevi tamamlar.
    const r = await scheduler({ workerId: 'yeni-worker', staleLockMs: 60_000 }).tick();

    expect(r.reaped).toBe(1);
    expect(r.done).toBe(1);
    expect((await missionRow(h, id)).status).toBe('done');
    // ÇİFT ÇALIŞMA YOK: tek etki satırı.
    expect(await echoEffects(h, worldId)).toHaveLength(1);
  });

  it('taze kilit KURTARILMAZ (çalışan worker elinden görev çalınmaz)', async () => {
    const id = await enqueue(h, { worldId, executeAt: ago(1_000), label: 'taze' });
    const repo = new MissionRepository(h.db);
    await repo.claimDue({ worldId, gameNow: new Date(), limit: 10, workerId: 'calisan-worker' });

    const r = await scheduler({ workerId: 'baska-worker', staleLockMs: 60_000 }).tick();

    expect(r.reaped).toBe(0);
    expect(r.claimed).toBe(0);
    expect((await missionRow(h, id)).status).toBe('running');
  });

  it('handler transaction ortasında patlarsa hiçbir etki kalmaz (atomiklik)', async () => {
    const id = await enqueue(h, { worldId, executeAt: ago(1_000), label: 'patlak', payload: { fail: true } });

    const r = await scheduler({ maxAttempts: 3 }).tick();

    expect(r.done).toBe(0);
    expect(r.retried).toBe(1);
    expect(await echoEffects(h, worldId)).toHaveLength(0);   // yarım iş YOK
    const m = await missionRow(h, id);
    expect(m.status).toBe('scheduled');                     // geri kuyruğa
    expect(m.attempts).toBe(1);
    expect(m.lastError).toMatch(/kasten başarısız/);
  });

  it('deneme hakkı tükenince görev ölü mektuba düşer', async () => {
    const id = await enqueue(h, { worldId, executeAt: ago(1_000), payload: { fail: true } });
    const s = scheduler({ maxAttempts: 3 });

    await s.tick();
    await s.tick();
    const last = await s.tick();

    expect(last.dead).toBe(1);
    const m = await missionRow(h, id);
    expect(m.status).toBe('failed');
    expect(m.attempts).toBe(3);
  });

  it('iki worker aynı anda çalışsa da her görev BİR KEZ işlenir (SKIP LOCKED)', async () => {
    for (let i = 0; i < 30; i++) {
      await enqueue(h, { worldId, executeAt: ago(10_000 - i), label: `p${i}` });
    }

    const [a, b] = await Promise.all([
      scheduler({ workerId: 'w-a', batchSize: 30 }).tick(),
      scheduler({ workerId: 'w-b', batchSize: 30 }).tick(),
    ]);

    expect(a.done + b.done).toBe(30);
    const effects = await echoEffects(h, worldId);
    expect(effects).toHaveLength(30);
    expect(new Set(effects.map((e) => e.missionId)).size).toBe(30);   // hiçbiri iki kez değil
  });
});

describe('⭐ bakım modu (çıkış kriteri)', () => {
  it('bakımda yeni görev ALINMAZ', async () => {
    await enqueue(h, { worldId, executeAt: ago(5_000), label: 'bakimda' });
    await clock.pause(worldId);

    const r = await scheduler().tick();

    expect(r.skippedPaused).toBe(true);
    expect(r.claimed).toBe(0);
    expect(await echoEffects(h, worldId)).toHaveLength(0);
  });

  it('bakım süresi oyun saatine YANSIMAZ → geri sayımlar bakım kadar ötelenir', async () => {
    const realStart = new Date('2026-07-26T10:00:00.000Z');
    const oneHourLater = new Date('2026-07-26T11:00:00.000Z');

    // Bakıma al (gerçek zaman 10:00) → oyun saati donar.
    await clock.pause(worldId, realStart);
    const paused = await clock.read(worldId, realStart);
    expect(paused.gameNow.getTime()).toBe(realStart.getTime());

    // 1 saat sonra hâlâ bakımda: oyun saati AYNI kalmalı.
    const stillPaused = await clock.read(worldId, oneHourLater);
    expect(stillPaused.gameNow.getTime()).toBe(realStart.getTime());

    // Bakımdan çık (gerçek zaman 11:00): offset += 1 saat.
    await clock.resume(worldId, oneHourLater);
    const resumed = await clock.read(worldId, oneHourLater);
    expect(resumed.paused).toBe(false);
    expect(resumed.clockOffsetMs).toBe(3_600_000);
    // Oyun saati bakımın BAŞLADIĞI andan devam ediyor → tüm vadeler 1 saat ötelendi.
    expect(resumed.gameNow.getTime()).toBe(realStart.getTime());
  });

  it('bakım sırasında vadesi gelen görev, bakımdan sonra oyun saatine göre işlenir', async () => {
    const realStart = new Date(Date.now() - 3_600_000);       // 1 saat önce bakıma alındı
    const gameDue = new Date(realStart.getTime() + 600_000);   // bakımdan 10 dk SONRAsına vadeli
    const id = await enqueue(h, { worldId, executeAt: gameDue, label: 'bakim-sonrasi' });

    await clock.pause(worldId, realStart);
    expect((await scheduler().tick()).skippedPaused).toBe(true);
    await clock.resume(worldId, new Date());

    // Oyun saati bakımın başladığı ana geri döndü → görev HÂLÂ vadesi gelmemiş olmalı.
    const afterResume = await scheduler().tick();
    expect(afterResume.claimed).toBe(0);
    expect((await missionRow(h, id)).status).toBe('scheduled');
  });

  it('resume iki kez çağrılsa da süre iki kez eklenmez (idempotent)', async () => {
    const t0 = new Date(Date.now() - 60_000);
    await clock.pause(worldId, t0);
    const now = new Date();
    await clock.resume(worldId, now);
    const first = (await clock.read(worldId)).clockOffsetMs;
    await clock.resume(worldId, new Date(now.getTime() + 60_000));
    expect((await clock.read(worldId)).clockOffsetMs).toBe(first);
  });
});

describe('idempotency ve denetim', () => {
  it('aynı idempotency anahtarıyla ikinci görev yazılamaz (çift tıklama)', async () => {
    await enqueue(h, { worldId, executeAt: ago(1_000), idempotencyKey: 'saldiri-42' });
    await expect(
      enqueue(h, { worldId, executeAt: ago(1_000), idempotencyKey: 'saldiri-42' }),
    ).rejects.toThrow();
  });

  it('outbox satırı görev etkisiyle AYNI transaction’da yazılır', async () => {
    await enqueue(h, { worldId, executeAt: ago(1_000), label: 'outbox' });
    await scheduler().tick();

    const rows = await h.db.execute<{ topic: string; dispatched_at: Date | null }>(sql`
      SELECT topic, dispatched_at FROM outbox WHERE world_id = ${worldId}
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.topic).toBe('echo:done');
    expect(rows[0]!.dispatched_at).toBeNull();   // henüz teslim edilmedi ama KAYIP DEĞİL
  });

  it('başarısız görev outbox satırı BIRAKMAZ (geri alındı)', async () => {
    await enqueue(h, { worldId, executeAt: ago(1_000), payload: { fail: true } });
    await scheduler().tick();

    const rows = await h.db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM outbox WHERE world_id = ${worldId}
    `);
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('denetim kaydı yazılır', async () => {
    await enqueue(h, { worldId, executeAt: ago(1_000), label: 'denetim' });
    await scheduler().tick();

    const rows = await h.db.execute<{ action: string; trace_id: string }>(sql`
      SELECT action, trace_id FROM audit_log WHERE world_id = ${worldId}
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('echo.applied');
    expect(rows[0]!.trace_id).toMatch(/^mission:\d+$/);
  });

  it('kayıtlı olmayan görev tipi görevi öldürmez, ölü mektuba düşürür', async () => {
    const id = await enqueue(h, { worldId, executeAt: ago(1_000), type: 'bilinmeyen' });
    const s = scheduler({ maxAttempts: 1 });
    const r = await s.tick();
    expect(r.dead).toBe(1);
    expect((await missionRow(h, id)).lastError).toMatch(/Kayıtlı handler yok/);
  });
});

describe('metrikler (§8)', () => {
  it('görev gecikmesi ölçülür', async () => {
    await enqueue(h, { worldId, executeAt: ago(30_000) });
    const repo = new MissionRepository(h.db);
    const lag = await repo.lagMs(worldId, new Date());
    expect(lag).toBeGreaterThanOrEqual(29_000);
    expect(lag).toBeLessThan(60_000);
  });

  it('durum sayaçları', async () => {
    await enqueue(h, { worldId, executeAt: ago(1_000) });
    await enqueue(h, { worldId, executeAt: new Date(Date.now() + 3_600_000) });
    await scheduler().tick();

    const counts = await new MissionRepository(h.db).countByStatus(worldId);
    expect(counts['done']).toBe(1);
    expect(counts['scheduled']).toBe(1);
  });

  it('bir sonraki vade bilinir (scheduler ne kadar uyuyacağını hesaplar)', async () => {
    const soon = new Date(Date.now() + 120_000);
    await enqueue(h, { worldId, executeAt: new Date(Date.now() + 600_000) });
    await enqueue(h, { worldId, executeAt: soon });
    const next = await new MissionRepository(h.db).nextDueAt(worldId);
    expect(next?.getTime()).toBe(soon.getTime());
  });
});
