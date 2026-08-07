/**
 * ⭐⭐ GÖZLEMLENEBİLİRLİK (Faz 3) — görev künyesi, hata geçmişi, bakımda outbox, derin sağlık.
 *
 * Dört ayrı boşluğun kapandığını ölçüyor; dördü de 06.08.2026 olayının tanı sürecinde bizzat
 * eksikliği hissedilen şeyler:
 *   1. **Görev künyesi** — "kuyrukta mı bekledi, yoksa handler mı yavaştı" sorusu tek bir
 *      farka (`finished_at − execute_at`) sıkışmıştı ve ayırt edilemiyordu.
 *   2. **Hata geçmişi** — `last_error` üzerine yazıyor; tanı için gereken İLK hata kayboluyordu.
 *   3. **Bakımda outbox** — dispatcher bakımı hiç görmüyordu; oyun donmuşken bildirim gidiyordu.
 *   4. **Derin sağlık** — `/healthz` süreç ayakta oldukça daima 200 dönüyordu. 06.08'de API
 *      sapasağlamdı, uç yeşildi ve kuyruk 9,5 saattir durmuştu.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/db/client.ts';
import { HealthController } from '../src/health/health.controller.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { echoHandler } from '../src/missions/echo.handler.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import {
  MAINTENANCE_PASSTHROUGH_TOPICS, OutboxDispatcher,
} from '../src/outbox/outbox.dispatcher.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { clearOutbox, createWorld, enqueue, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;

const ago = (ms: number): Date => new Date(Date.now() - ms);

function scheduler(over: { maxAttempts?: number; workerId?: string } = {}): SchedulerService {
  const registry = new HandlerRegistry()
    .register('echo', echoHandler)
    .register('boom', () => { throw new Error('handler patladı'); });
  return new SchedulerService(h.db, clock, registry, {
    worldId,
    workerId: over.workerId ?? 'w-test',
    maxAttempts: over.maxAttempts ?? 2,
    retryBackoffMs: 0,
  });
}

async function row(id: number): Promise<Record<string, unknown>> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT * FROM missions WHERE id = ${id}
  `);
  return rows[0]!;
}

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
}, 60_000);
afterAll(async () => { await h?.close(); });

/**
 * ⚠️⚠️ **BU DOSYA İKİ DÜNYA-KAPSAMSIZ MEKANİZMAYI ÖLÇÜYOR** — ve bu bir kusur değil, tasarım:
 *   • `OutboxDispatcher` tüm tabloyu tarar (dünya-üstü olaylar var, `world_id` NULL).
 *   • `/healthz?deep=1` SUNUCU sağlığını söyler; tek bir dünyaya bakan bir sağlık ucu, ölmüş
 *     ikinci bir dünyayı görmezdi.
 *
 * Sonuç: aynı worker'da daha önce koşmuş dosyaların artıkları bu iki ölçümü kirletir (ilk
 * yazımda tam olarak bu oldu — 100 outbox satırı ve başka dünyaların vadesi geçmiş görevleri).
 * Yalıtım bu yüzden dünya seviyesinde DEĞİL, tablo seviyesinde kuruluyor. Güvenli: aynı worker
 * içinde test DOSYALARI sıralı koşuyor, yani temizlenen her şey bitmiş bir dosyaya ait.
 */
beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  await clearOutbox(h);
  await h.db.execute(sql`
    DELETE FROM missions WHERE status = 'scheduled' AND execute_at < now() - interval '1 minute'
  `);
});

describe('görev zaman künyesi', () => {
  /**
   * ⚠️ Bugüne kadar gecikme `finished_at − execute_at` ile çıkarılmaya çalışılıyordu ve bu iki
   * ayrı şeyi topluyordu: kuyrukta bekleme (altyapı arızası) + handler süresi (performans).
   * Ayrılınca ikisi de tek başına okunabilir hâle geliyor.
   */
  it('lag_ms kuyrukta beklemeyi, duration_ms handler süresini ölçer', async () => {
    const id = await enqueue(h, { worldId, executeAt: ago(30_000) });
    await scheduler().tick();

    const m = await row(id);
    expect(m['status']).toBe('done');
    expect(m['claimed_at']).not.toBeNull();
    // ~30 sn geride bir vade → gecikme 30 sn civarı (test makinesi yavaşsa biraz üstü).
    expect(Number(m['lag_ms'])).toBeGreaterThanOrEqual(29_000);
    expect(Number(m['lag_ms'])).toBeLessThan(120_000);
    // Echo handler'ı milisaniyeler sürüyor — ikisi karışmış olsaydı bu da 30 sn olurdu.
    expect(Number(m['duration_ms'])).toBeLessThan(5_000);
  });

  /** ⚠️ `locked_by` bitişte NULL'lanmak zorunda (kilit alanı) → "kim işledi" ancak bununla. */
  it('completed_by kalıcı, locked_by temizlenmiş olur', async () => {
    const id = await enqueue(h, { worldId, executeAt: ago(1_000) });
    await scheduler({ workerId: 'worker-42' }).tick();

    const m = await row(id);
    expect(m['locked_by']).toBeNull();
    expect(m['completed_by']).toBe('worker-42');
  });

  /**
   * ⭐ `claimed_at` yeniden denemede KORUNUYOR (`COALESCE`): "kuyrukta ne kadar bekledi"
   * sorusunun cevabı İLK alım anındadır. Her denemede üzerine yazsaydık, beş kez denenen bir
   * görev sonunda "hiç beklememiş" görünürdü.
   */
  it('yeniden denemede claimed_at ilk alım anını korur', async () => {
    const id = await enqueue(h, { worldId, executeAt: ago(1_000), type: 'boom' });
    const s = scheduler({ maxAttempts: 5 });

    await s.tick();
    const first = await row(id);
    expect(first['status']).toBe('scheduled');          // yeniden kuyruğa alındı
    const claimedAt = String(first['claimed_at']);

    await s.tick();
    expect(String((await row(id))['claimed_at'])).toBe(claimedAt);
  });
});

describe('hata geçmişi (mission_errors)', () => {
  /**
   * ⭐⭐ Asıl iddia: `last_error` üzerine yazılırken hata TABLOSU birikiyor. Beş kez denenip ölen
   * bir görevde tanı için gereken genelde İLK hatadır; sonrakiler çoğu zaman onun yan etkisidir.
   */
  it('her deneme ayrı satır bırakır, son akıbet kaydedilir', async () => {
    const id = await enqueue(h, { worldId, executeAt: ago(1_000), type: 'boom' });
    const s = scheduler({ maxAttempts: 2 });

    await s.tick();
    await s.tick();

    const errs = await h.db.execute<Record<string, unknown>>(sql`
      SELECT * FROM mission_errors WHERE mission_id = ${id} ORDER BY id
    `);
    expect(errs).toHaveLength(2);
    expect(String(errs[0]!['outcome'])).toBe('retry');
    expect(String(errs[1]!['outcome'])).toBe('dead');
    expect(String(errs[0]!['error'])).toContain('handler patladı');
    expect(String(errs[0]!['mission_type'])).toBe('boom');
    expect(String(errs[0]!['worker_id'])).toBe('w-test');
    expect(Number(errs[0]!['attempt'])).toBeLessThan(Number(errs[1]!['attempt']));

    // Ve görevin kendisi gerçekten ölmüş olmalı (kayıt, durumu değiştirmemeli).
    expect((await row(id))['status']).toBe('failed');
  });

  /** ⚠️ Görev silinirse hatası da gitsin: öksüz satır kalmamalı (`ON DELETE CASCADE`). */
  it('görev silinince hataları da gider', async () => {
    const id = await enqueue(h, { worldId, executeAt: ago(1_000), type: 'boom' });
    await scheduler({ maxAttempts: 5 }).tick();
    await h.db.execute(sql`DELETE FROM missions WHERE id = ${id}`);

    const errs = await h.db.execute(sql`SELECT 1 FROM mission_errors WHERE mission_id = ${id}`);
    expect(errs).toHaveLength(0);
  });
});

describe('bakımda outbox', () => {
  /**
   * ⭐⭐ Kullanıcı kararı: *"bildirimler dursun, e-posta hariç"*. Bugüne kadar dispatcher bakımı
   * HİÇ görmüyordu — oyun donmuşken oyuncuya "savaşın bitti" bildirimi gidiyordu.
   */
  it('bakımda oyun olayı bekler, mail:send GEÇER', async () => {
    await h.db.execute(sql`
      INSERT INTO outbox (world_id, topic, payload) VALUES
        (${worldId}, 'mission:completed', '{}'::jsonb),
        (${worldId}, 'mail:send', '{}'::jsonb)
    `);
    await h.db.execute(sql`UPDATE worlds SET state = 'maintenance', paused_at = now() WHERE id = ${worldId}`);

    const seen: string[] = [];
    const d = new OutboxDispatcher(h.db).on('*', async (r) => { seen.push(r.topic); });
    await d.tick();

    expect(seen).toEqual(['mail:send']);
  });

  it('bakım bitince bekleyen olay teslim edilir', async () => {
    await h.db.execute(sql`
      INSERT INTO outbox (world_id, topic, payload) VALUES (${worldId}, 'mission:completed', '{}'::jsonb)
    `);
    await h.db.execute(sql`UPDATE worlds SET state = 'maintenance', paused_at = now() WHERE id = ${worldId}`);

    const seen: string[] = [];
    const d = new OutboxDispatcher(h.db).on('*', async (r) => { seen.push(r.topic); });
    await d.tick();
    expect(seen).toHaveLength(0);

    await h.db.execute(sql`UPDATE worlds SET state = 'running', paused_at = NULL WHERE id = ${worldId}`);
    await d.tick();
    expect(seen).toEqual(['mission:completed']);
  });

  /** ⚠️ `world_id` NULL olan satırlar hiçbir dünyaya bağlı değil → bakımdan hiç etkilenmemeli. */
  it('dünyasız satır bakımdan etkilenmez', async () => {
    await h.db.execute(sql`INSERT INTO outbox (world_id, topic, payload) VALUES (NULL, 'test:global', '{}'::jsonb)`);
    await h.db.execute(sql`UPDATE worlds SET state = 'maintenance', paused_at = now() WHERE id = ${worldId}`);

    const seen: string[] = [];
    const d = new OutboxDispatcher(h.db).on('test:global', async (r) => { seen.push(r.topic); });
    await d.tick();
    expect(seen).toEqual(['test:global']);
  });

  /** Muafiyet listesi "hesap erişimi + operasyon" ile sınırlı kalmalı; büyürse burada görünür. */
  it('muafiyet listesi bilinçli olarak KISA', () => {
    expect([...MAINTENANCE_PASSTHROUGH_TOPICS].sort())
      .toEqual(['admin:abuse_report', 'mail:send']);
  });
});

describe('/healthz?deep=1', () => {
  const reply = (): { status: (c: number) => unknown; code: number | null } => {
    const r = { code: null as number | null, status(c: number) { r.code = c; return r; } };
    return r;
  };

  /** ⚠️ Sığ hâli DEĞİŞMEDİ: sorgusuz, anlık, daima 200 — mevcut yoklayıcılar kırılmasın. */
  it('parametresiz hâli sorgusuz ve 200', async () => {
    const res = reply();
    const out = await new HealthController(h.db).health(undefined, res);
    expect(out['status']).toBe('ok');
    expect(out['deep']).toBeUndefined();
    expect(res.code).toBeNull();
  });

  it('derin kontrol sağlıklıyken 200 ve kontrol dökümü döner', async () => {
    const res = reply();
    const out = await new HealthController(h.db).health('1', res);
    expect(out['status']).toBe('ok');
    expect(res.code).toBeNull();
    const checks = out['checks'] as Record<string, Record<string, unknown>>;
    expect(checks['db']!['ok']).toBe(true);
    expect(checks['queue']!['ok']).toBe(true);
  });

  /**
   * ⭐⭐ ASIL İDDİA: kuyruk tıkalıyken uç artık YEŞİL DEĞİL. 06.08.2026'da tam olarak bu
   * durumdaydık ve `/healthz` 200 dönüyordu.
   */
  it('kuyruk eşiğin üstünde geciktiğinde 503 döner', async () => {
    // Eşik 120 sn (varsayılan); 10 dakika geride bir görev bırak.
    await enqueue(h, { worldId, executeAt: ago(600_000) });

    const res = reply();
    const out = await new HealthController(h.db).health('1', res);

    expect(res.code).toBe(503);
    expect(out['status']).toBe('degraded');
    const queue = (out['checks'] as Record<string, Record<string, unknown>>)['queue']!;
    expect(queue['ok']).toBe(false);
    expect(Number(queue['lagS'])).toBeGreaterThan(500);
  });

  /**
   * ⚠️ Bakımdaki bir dünya "arızalı" görünmemeli — operatör tam da o sırada bu ucu yokluyor
   * olabilir ve her bakımda 503 gören bir izleyici, gerçek 503'e inanmayı bırakır.
   */
  it('bakımdaki dünyanın geciken görevi 503 ÜRETMEZ', async () => {
    await enqueue(h, { worldId, executeAt: ago(600_000) });
    await h.db.execute(sql`UPDATE worlds SET state = 'maintenance', paused_at = now() WHERE id = ${worldId}`);

    const res = reply();
    const out = await new HealthController(h.db).health('1', res);
    expect(res.code).toBeNull();
    expect(out['status']).toBe('ok');
  });
});
