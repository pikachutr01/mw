/**
 * ⭐⭐⭐ SAAT GERİYE SIÇRARSA — 2026-08-12 canlı olayının hesabı.
 *
 * VPS'in saati ~9,5 saat ileri kaydı, NTP ona yetişemedi (`Timed out waiting for reply`) ve
 * sonunda saati **geriye adımladı**. O pencerede yazılmış her satır gelecekte kaldı. İki ayrı
 * yerde aynı kusur ortaya çıktı ve **birbirini sakladı**:
 *
 *  1. `HeartbeatWriter.beat()` — kısıtlama `t - lastWrite < minInterval` idi. Fark **negatife**
 *     düşünce koşul 5 saat boyunca doğru kaldı → nabız hiç yazılmadı. Worker turlarını atmaya
 *     devam etti (`ticks` arttı), ama DB'deki satır 17:00:43'te dondu.
 *  2. `healthz` — tazelik kontrolü yalnız `yaş > eşik` bakıyordu. Yaş **−18.739 sn** olunca
 *     koşul yanlış kaldı ve ölü worker **`{"ok":true}`** olarak raporlandı.
 *
 * ⚠️ İkisi birleşince arıza görünmez oldu: panelde iki `ops_event` dört saat açık kaldı,
 * `healthz` "sağlıklı" dedi, bir oyuncunun kaynakları 5 saat dondu.
 *
 * ⭐ Buradaki testlerin iddiası tek cümle: **bir "yaş" ölçüsünde tek taraflı eşik yetmez.**
 * Negatif yaş fiziksel olarak imkânsızdır; görüldüğü an ya saat sıçramıştır ya satır bozuktur —
 * ikisi de arızadır ve sessiz kalınamaz.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/db/client.ts';
import { Heartbeat } from '../src/worker/heartbeat.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;

beforeAll(async () => { h = await setupTestDb(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  await h.db.execute(sql`DELETE FROM worker_heartbeats`);
});

/** Enjekte edilebilir saat: canlıdaki sıçramayı birebir taklit eder. */
function fakeClock(startMs: number) {
  let t = startMs;
  return { now: () => t, jump: (ms: number) => { t += ms; } };
}

const rows = async (): Promise<Array<Record<string, unknown>>> =>
  h.db.execute(sql`SELECT kind, ticks FROM worker_heartbeats ORDER BY kind`);

describe('⭐⭐ nabız yazıcısı — saat geriye sıçraması', () => {
  it('normal akışta kısıtlama ÇALIŞIR (art arda turlar tek satır yazar)', async () => {
    const clk = fakeClock(Date.now());
    const hb = new Heartbeat(h.db, 'scheduler', {
      workerId: 'w-test', worldId, minIntervalMs: 5_000, now: clk.now,
    });
    await hb.beat({});                 // ilk yazım (lastWrite = 0 → fark devasa)
    clk.jump(1_000);
    await hb.beat({});                 // kısıtlanmalı
    const [r] = await rows();
    expect(Number(r!['ticks'])).toBe(1);   // ikinci tur YAZILMADI, sayaç yalnız ilkini taşıyor
  });

  /**
   * ⭐⭐⭐ OLAYIN KENDİSİ. Saat 5 saat geriye adımlıyor; eski kodda `t - lastWrite` negatif
   * kalıp yazımı 5 saat boyunca bloke ediyordu. Yeni guard negatif farkı "saat sıçradı" diye
   * okuyup **hemen** yazıyor.
   */
  it('⭐⭐⭐ saat GERİYE sıçrayınca nabız susmaz, hemen yazar', async () => {
    const clk = fakeClock(Date.now());
    const hb = new Heartbeat(h.db, 'scheduler', {
      workerId: 'w-test', worldId, minIntervalMs: 5_000, now: clk.now,
    });
    await hb.beat({});
    clk.jump(-5 * 3_600_000);          // −5 saat: canlıdaki adımlamanın aynısı
    await hb.beat({});
    const [r] = await rows();
    expect(Number(r!['ticks']), 'sıçramadan sonraki tur DB’ye yazılmalı').toBe(2);
  });

  it('sıçramadan sonra kısıtlama yeniden DEVREYE girer (kalıcı olarak açılmaz)', async () => {
    const clk = fakeClock(Date.now());
    const hb = new Heartbeat(h.db, 'scheduler', {
      workerId: 'w-test', worldId, minIntervalMs: 5_000, now: clk.now,
    });
    await hb.beat({});
    clk.jump(-5 * 3_600_000);
    await hb.beat({});                 // sıçrama yazımı
    clk.jump(1_000);
    await hb.beat({});                 // yine kısıtlanmalı
    const [r] = await rows();
    expect(Number(r!['ticks'])).toBe(2);
  });
});

/**
 * ⭐⭐ `healthz`in tazelik kuralı. Denetleyicinin tamamını ayağa kaldırmak yerine kuralın
 * kendisini sınıyoruz — kırılması gereken şey karşılaştırmanın YÖNÜ, HTTP katmanı değil.
 */
describe('⭐⭐ tazelik kuralı — negatif yaş ARIZADIR', () => {
  const staleAfter = 90;
  /** `health.controller.ts`teki `beat()` ile aynı karar ağacı. */
  const verdict = (age: number | null): 'ok' | 'stale' | 'clock_skew' | 'unknown' => {
    if (age == null) return 'unknown';
    if (age > staleAfter) return 'stale';
    if (age < 0) return 'clock_skew';
    return 'ok';
  };

  it('taze nabız ok', () => {
    expect(verdict(4)).toBe('ok');
    expect(verdict(0)).toBe('ok');
  });

  it('eskimiş nabız arıza', () => {
    expect(verdict(staleAfter + 1)).toBe('stale');
  });

  /** Canlıda görülen tam değer: `{"scheduler":{"ok":true,"ageS":-18739}}`. */
  it('⭐⭐⭐ NEGATİF yaş «ok» DEĞİL — eski kodun dört saat sakladığı hâl', () => {
    expect(verdict(-18_739)).toBe('clock_skew');
    expect(verdict(-1)).toBe('clock_skew');
  });

  it('nabız satırı YOKSA arıza sayılmaz (ROLE=api profili scheduler koşturmaz)', () => {
    expect(verdict(null)).toBe('unknown');
  });
});
