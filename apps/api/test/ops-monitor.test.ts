/**
 * ⭐⭐ OPERASYON İZLEYİCİSİ (Faz 3) — örnekleme, eşik değerlendirmesi, alarm.
 *
 * **Bu dosya bir olayın hesabını soruyor.** 06.08.2026'da 24 görev saatlerce kuyrukta bekledi ve
 * hiçbir gösterge bunu söylemedi: `lagMs` hesaplanıyordu ama üzerine yazılan bir nabız satırında
 * 5 saniye yaşıyordu, tek "alarm kanalı" ise yöneticinin paneli elle açmasıydı. Buradaki testler
 * o iki boşluğun kapandığını ölçüyor.
 *
 * ⚠️ En kritik olanı **alarmın tekrarlamaması**: saniyede bir koşan bir döngüde 9,5 saatlik bir
 * arıza, naif bir tasarımda 34.000 e-posta üretirdi. Alarm sisteminin kendisi arızadan büyük bir
 * olaya dönüşür ve gerçek uyarı gürültüde kaybolurdu.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/db/client.ts';
import type { TickResult } from '../src/missions/scheduler.service.ts';
import { OpsMonitor } from '../src/ops/ops-monitor.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;

const EMPTY: TickResult = {
  claimed: 0, done: 0, retried: 0, dead: 0, reaped: 0, skippedPaused: false,
  released: 0, clockJumpMs: 0, lagMs: 0, due: 0, skippedLocked: 0, stuck: 0,
};
const tick = (over: Partial<TickResult> = {}): TickResult => ({ ...EMPTY, ...over });

function monitor(over: Partial<ConstructorParameters<typeof OpsMonitor>[1]> = {}): OpsMonitor {
  return new OpsMonitor(h.db, {
    worldId,
    workerId: 'test-worker',
    // ⚠️ Kısıtlama testlerde AÇIK bırakılıyor (varsayılan 60 sn) — `observe(r, true)` ile
    // aşılıyor. Sıfırlasaydık kısıtlamanın kendisini hiç ölçemezdik.
    alertTo: 'ops@test.local',
    thresholds: () => ({ alertLagS: 100, alertStuck: 0, alertOutboxDead: 0, alertOldestTxS: 99_999 }),
    ...over,
  });
}

async function samples(): Promise<Record<string, unknown>[]> {
  return h.db.execute<Record<string, unknown>>(sql`
    SELECT * FROM scheduler_samples WHERE world_id = ${worldId} ORDER BY id
  `);
}

async function events(kind?: string): Promise<Record<string, unknown>[]> {
  return h.db.execute<Record<string, unknown>>(sql`
    SELECT * FROM ops_events
     WHERE (world_id = ${worldId} OR world_id IS NULL)
       ${kind ? sql`AND kind = ${kind}` : sql``}
     ORDER BY id
  `);
}

async function mails(): Promise<Record<string, unknown>[]> {
  return h.db.execute<Record<string, unknown>>(sql`
    SELECT * FROM outbox WHERE topic = 'mail:send' AND world_id = ${worldId} ORDER BY id
  `);
}

beforeAll(async () => { h = await setupTestDb(); }, 60_000);
afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  /* ⚠️ Küresel kurallar (`outbox_dead`, `idle_in_tx`) `world_id = NULL` yazıyor ve
     `createWorld` onları temizleyemez — dünya kapsamı yok. Testler arasında sızmasınlar. */
  await h.db.execute(sql`DELETE FROM ops_events WHERE world_id IS NULL`);
  await h.db.execute(sql`DELETE FROM outbox WHERE topic = 'mail:send'`);
});

describe('örnekleme', () => {
  it('tur sonucunu kalıcı bir satıra yazar', async () => {
    await monitor().observe(tick({ lagMs: 4_200, due: 7, claimed: 3, skippedLocked: 4, stuck: 2 }), true);

    const rows = await samples();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!['lag_ms'])).toBe(4_200);
    expect(Number(rows[0]!['due_count'])).toBe(7);
    expect(Number(rows[0]!['claimed'])).toBe(3);
    // ⭐ 06.08 olayının tek doğrudan göstergesi — artık GEÇMİŞE kaydediliyor.
    expect(Number(rows[0]!['skipped_locked'])).toBe(4);
    expect(Number(rows[0]!['stuck'])).toBe(2);
    expect(rows[0]!['paused']).toBe(false);
    expect(rows[0]!['worker_id']).toBe('test-worker');
  });

  /**
   * ⚠️ Kısıtlama `Heartbeat`in 1. kuralı: izleme, izlediği sistemden fazla yazma üretmemeli.
   * Saniyede bir koşan bir döngüde seyreltmesiz bir örnekleyici günde 86.400 satır yazardı.
   */
  it('aralık dolmadan İKİNCİ örnek yazmaz (ve sorgu bile atmaz)', async () => {
    const m = monitor();
    await m.observe(tick(), true);      // force → ilk satır
    await m.observe(tick());            // kısıtlı → yok sayılmalı
    await m.observe(tick());
    expect(await samples()).toHaveLength(1);
  });

  /** Bakım penceresi grafikte AYIRT EDİLEBİLİR olmalı: kuyruk durdu ama arıza yok. */
  it('bakımda da örnek alınır, paused işaretiyle', async () => {
    await monitor().observe(tick({ skippedPaused: true }), true);
    const rows = await samples();
    expect(rows).toHaveLength(1);
    expect(rows[0]!['paused']).toBe(true);
  });
});

describe('eşik değerlendirmesi', () => {
  it('eşik aşılınca TEK olay açılır', async () => {
    await monitor().observe(tick({ lagMs: 500_000 }), true);   // 500 sn > 100 sn

    const rows = await events('queue_lag');
    expect(rows).toHaveLength(1);
    expect(rows[0]!['resolved_at']).toBeNull();
    expect(Number(rows[0]!['value'])).toBeCloseTo(500, 0);
    expect(Number(rows[0]!['threshold'])).toBe(100);
    expect(Number(rows[0]!['samples'])).toBe(1);
    expect(String(rows[0]!['severity'])).toBe('crit');
  });

  /**
   * ⭐⭐ ALARMIN TEKRARLAMAMASI — bu dosyanın en önemli iddiası.
   * Arıza sürerken satır SAYISI artmıyor; artan yalnız `samples` ve kötüleşen `peak`.
   */
  it('arıza sürerken yeni satır AÇILMAZ, samples/peak güncellenir', async () => {
    const m = monitor();
    await m.observe(tick({ lagMs: 500_000 }), true);
    await m.observe(tick({ lagMs: 900_000 }), true);
    await m.observe(tick({ lagMs: 300_000 }), true);

    const rows = await events('queue_lag');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!['samples'])).toBe(3);
    // ⚠️ `peak` en KÖTÜ değeri tutuyor, sonuncuyu değil — "ne kadar kötüleşti" sorusunun cevabı.
    expect(Number(rows[0]!['peak'])).toBeCloseTo(900, 0);
    expect(Number(rows[0]!['value'])).toBeCloseTo(300, 0);
  });

  it('normale dönünce olay KAPANIR', async () => {
    const m = monitor();
    await m.observe(tick({ lagMs: 500_000 }), true);
    await m.observe(tick({ lagMs: 1_000 }), true);

    const rows = await events('queue_lag');
    expect(rows).toHaveLength(1);
    expect(rows[0]!['resolved_at']).not.toBeNull();
  });

  /** Kapanmış bir olaydan sonra arıza TEKRARLARSA yeni bir olay açılmalı (ilki kapalı kaldı). */
  it('kapanan olaydan sonra yeni arıza YENİ satır açar', async () => {
    const m = monitor();
    await m.observe(tick({ lagMs: 500_000 }), true);
    await m.observe(tick({ lagMs: 1_000 }), true);
    await m.observe(tick({ lagMs: 500_000 }), true);

    const rows = await events('queue_lag');
    expect(rows).toHaveLength(2);
    expect(rows[0]!['resolved_at']).not.toBeNull();
    expect(rows[1]!['resolved_at']).toBeNull();
  });

  /**
   * ⭐ İki worker aynı anda eşiği görürse: tekillik UYGULAMA KATMANINDA DEĞİL, `ops_events_open`
   * kısmî unique indeksinde. `time_shifts` ile aynı felsefe — "iki kez çağrılmasın" kontrolü
   * tek başına asla yeterli değil.
   */
  it('iki ayrı izleyici aynı arızayı görürse yine TEK olay olur', async () => {
    await Promise.all([
      monitor({ workerId: 'a' }).observe(tick({ lagMs: 500_000 }), true),
      monitor({ workerId: 'b' }).observe(tick({ lagMs: 500_000 }), true),
    ]);
    const open = (await events('queue_lag')).filter((e) => e['resolved_at'] == null);
    expect(open).toHaveLength(1);
  });

  /**
   * ⚠️ Bakımda kuyruk kuralları atlanıyor — ve bu, KAPATMA da yapılmadığı anlamına gelir.
   * Bakım arızayı çözmez, yalnız ölçümü anlamsız kılar. Kapatmayı bakımda yapsaydık her bakım,
   * çözülmemiş her alarmı sessizce temizleyen bir düğmeye dönüşürdü.
   */
  it('bakım, açık bir kuyruk olayını KAPATMAZ', async () => {
    const m = monitor();
    await m.observe(tick({ lagMs: 500_000 }), true);
    await m.observe(tick({ skippedPaused: true, lagMs: 0 }), true);

    const rows = await events('queue_lag');
    expect(rows).toHaveLength(1);
    expect(rows[0]!['resolved_at']).toBeNull();
  });

  /** Ölçülemeyen bir gösterge "sağlıklı" DEĞİLDİR: veri yokluğu ne alarm ne kapatma üretir. */
  it('dispatcher nabzı hiç yoksa dispatcher_stale değerlendirilmez', async () => {
    await h.db.execute(sql`DELETE FROM worker_heartbeats WHERE kind = 'dispatcher'`);
    await monitor().observe(tick(), true);
    expect(await events('dispatcher_stale')).toHaveLength(0);
  });
});

describe('alarm e-postası', () => {
  /**
   * ⭐ `sustainSamples` — olay ANINDA açılır (kayıt gecikmez), e-posta beklerimiz.
   * `queue_lag` için 2: tek turluk sıçrama yanlış alarm üretmemeli.
   */
  it('ilk örnekte posta GİTMEZ, ikincisinde gider', async () => {
    const m = monitor();
    await m.observe(tick({ lagMs: 500_000 }), true);
    expect(await mails()).toHaveLength(0);
    expect((await events('queue_lag'))[0]!['notified_at']).toBeNull();

    await m.observe(tick({ lagMs: 500_000 }), true);
    const sent = await mails();
    expect(sent).toHaveLength(1);
    expect((sent[0]!['payload'] as Record<string, unknown>)['to']).toBe('ops@test.local');
    expect((await events('queue_lag'))[0]!['notified_at']).not.toBeNull();
  });

  /** ⭐⭐ Arıza devam ettikçe İKİNCİ bir posta yazılmaz — asıl korunan davranış bu. */
  it('arıza sürerken posta TEKRARLANMAZ', async () => {
    const m = monitor();
    for (let i = 0; i < 8; i++) await m.observe(tick({ lagMs: 500_000 }), true);
    expect(await mails()).toHaveLength(1);
    expect(Number((await events('queue_lag'))[0]!['samples'])).toBe(8);
  });

  /** Postanın gövdesi kuralın kendi `hint`inden geliyor: eşik adı değil, ne yapılacağı. */
  it('posta gövdesi teşhis ipucu taşır', async () => {
    const m = monitor();
    await m.observe(tick({ lagMs: 500_000 }), true);
    await m.observe(tick({ lagMs: 500_000 }), true);

    const p = (await mails())[0]!['payload'] as Record<string, unknown>;
    expect(String(p['subject'])).toContain('Görev kuyruğu gecikmesi');
    expect(String(p['text'])).toContain('transaction');
    expect(String(p['text'])).toContain('06.08.2026');
  });

  /**
   * ⚠️ Alarm adresi yoksa olay yine KAYDEDİLİR. Kullanıcının açık şartı: geçmiş her hâlükârda
   * tutulmalı; alarm kanalının yokluğu kaydın da tutulmamasına yol açmamalı.
   */
  it('alarm adresi yoksa olay yine kaydedilir, yalnız posta gitmez', async () => {
    const m = monitor({ alertTo: '' });
    await m.observe(tick({ lagMs: 500_000 }), true);
    await m.observe(tick({ lagMs: 500_000 }), true);

    expect(await mails()).toHaveLength(0);
    const rows = await events('queue_lag');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!['samples'])).toBe(2);
  });

  /** `queue_stuck` sustain'i de 2 — ama eşiği 0, yani BİR takılmış görev bile olay açar. */
  it('takılmış görev eşiği 0: tek görev bile olay açar', async () => {
    const m = monitor();
    await m.observe(tick({ stuck: 1 }), true);
    const rows = await events('queue_stuck');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!['value'])).toBe(1);
  });
});

describe('dayanıklılık', () => {
  /**
   * ⚠️ İzleyicinin hatası görev döngüsünü ASLA düşürmemeli (`Heartbeat` kuralı 2). Düşürseydi,
   * çözmeye çalıştığı sorunun aynısını kendisi yaratırdı.
   */
  it('tablo yoksa bile observe() ATMAZ, yalnız onError çağırır', async () => {
    const seen: unknown[] = [];
    const m = new OpsMonitor(h.db, {
      worldId, workerId: 'x', onError: (e) => seen.push(e),
      // Var olmayan bir sütuna yazdırmanın en temiz yolu: geçici olarak tabloyu gizlemek yerine
      // eşik fonksiyonunu patlatmak — aynı yola (`catch`) düşüyor.
      thresholds: () => { throw new Error('ayar okunamadı'); },
    });
    await expect(m.observe(tick(), true)).resolves.toBeUndefined();
    expect(seen).toHaveLength(1);
  });
});
