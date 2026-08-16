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
import { echoHandler } from '../src/missions/echo.handler.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import { GameClockService, type WorldClock } from '../src/world/game-clock.service.ts';
import { Heartbeat } from '../src/worker/heartbeat.ts';
import {
  createWorld, echoEffects, enqueue, freshWorldId, missionRow, setupTestDb,
} from './helpers/db.ts';

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

/**
 * ⭐⭐⭐ **KUYRUK TARAFI — 2026-08-16 canlı olayının hesabı.**
 *
 * Yukarıdaki 2026-08-12 olayı nabzı ve `healthz`i sertleştirmişti, ama **scheduler'a hiç
 * dokunulmamıştı**. 16 Ağustos'ta bedeli ödendi: konak (ESXi) saati konuk saatine sızdı,
 * `now()` bir anlığına **9 sa 25 dk ileri** döndü ve `claimDue` o ana kadar vadesi olan
 * **12 görevi** birden aldı. Altı savaş 2,5 saate kadar erken çözüldü, dört şehrin kaynak
 * çıpası geleceğe kaydı, oyuncular *"saldırım anında gerçekleşti"* diye bildirdi.
 *
 * ⚠️ 2026-08-03'ün önlemi (`GAME_NOW_SQL` — kıyaslamanın iki ucu da DB saatinden) bu sınıfı
 * **kapatmıyor**: DB'nin KENDİ saati sıçrayınca iki uç da aynı yanlış saati okuyor. Tek
 * kırılmaz referans monotonik saat; iki kapı da ona ya da TAZE bir okumaya dayanıyor.
 *
 * Kanıt izi: `missions.claimed_at = 16:34:48`, `finished_at = 07:09:44` — bitişi alınışından
 * ÖNCE olan 12 satır; `journald: Clock change detected` tam o saniyede.
 */
describe('⭐⭐⭐ scheduler — saat ileri sıçraması', () => {
  /**
   * Sıçramayı birebir taklit eder: **yalnız gözlenen oyun saatini** kaydırır, `claimDue`'nun
   * SQL `now()`'ı gerçek kalır — canlıdaki durumun aynısı (bir sorgu sıçramış saati gördü,
   * ötekiler görmedi).
   *
   * ⚠️ `program()` sayacı da sıfırlar: sapmalar `read()` çağrılarına SIRAYLA uygulanıyor ve
   * bir turda kaç okuma olduğu (kapı + alım sonrası doğrulama) senaryoya göre değişiyor.
   */
  class StubClock extends GameClockService {
    private offsets: number[] = [];
    private i = 0;
    program(...offsets: number[]): void { this.offsets = offsets; this.i = 0; }
    override async read(worldId: number): Promise<WorldClock> {
      const real = await super.read(worldId);
      const off = this.offsets[this.i++] ?? 0;
      return { ...real, gameNow: new Date(real.gameNow.getTime() + off) };
    }
  }

  const JUMP_MS = 9 * 3_600_000 + 25 * 60_000;   // canlıdaki tam sapma: 9 sa 25 dk

  let stub: StubClock;
  let registry: HandlerRegistry;

  const sched = (): SchedulerService =>
    new SchedulerService(h.db, stub, registry, {
      worldId, workerId: 'clock-test', batchSize: 50, retryBackoffMs: 0, maxAttempts: 3,
    });

  const claimCols = async (id: number): Promise<{ claimedAt: string | null; lagMs: string | null }> => {
    const rows = await h.db.execute<{ claimed_at: string | null; lag_ms: string | null }>(sql`
      SELECT claimed_at, lag_ms FROM missions WHERE id = ${id}
    `);
    return { claimedAt: rows[0]!.claimed_at, lagMs: rows[0]!.lag_ms };
  };

  beforeEach(() => {
    stub = new StubClock(h.db);
    registry = new HandlerRegistry().register('echo', echoHandler);
  });

  it('1. KAT — saat sıçradığı tur ATLANIR: vadesi gelmiş görev bile alınmaz', async () => {
    const s = sched();
    stub.program(0);
    expect((await s.tick()).clockJumpMs).toBe(0);        // çıpa kuruldu

    // Çıpa kurulduktan SONRA vadesi gelmiş bir görev: sıçrama olmasa bu tur işlenirdi.
    const id = await enqueue(h, { worldId, executeAt: new Date(Date.now() - 1_000), label: 'erken' });

    stub.program(JUMP_MS);
    const jumped = await s.tick();

    expect(jumped.clockJumpMs).toBeGreaterThan(3_600_000);      // sıçrama ÖLÇÜLDÜ
    expect(jumped.claimed).toBe(0);                             // ve tur hiç iş almadı
    expect(jumped.done).toBe(0);
    expect((await missionRow(h, id)).status).toBe('scheduled');
    expect(await echoEffects(h, worldId)).toHaveLength(0);

    /**
     * ⚠️ **Geri düşüş de bir sıçramadır** → o tur da atlanır. Geçici bir sıçramanın bedeli
     * bilerek **iki tur** (2 sn): çıpa her tespitte yenileniyor, çünkü yenilenmeseydi meşru
     * bir NTP düzeltmesinden sonra kuyruk KALICI olarak dururdu.
     */
    stub.program(0);
    expect((await s.tick()).claimed).toBe(0);

    stub.program(0, 0);
    const ok = await s.tick();
    expect(ok.done).toBe(1);                                     // saat oturdu, iş yürüdü
  });

  it('⭐⭐ 2. KAT — sıçrama alıma sızsa bile görev ÇALIŞTIRILMADAN kuyruğa geri döner', async () => {
    // Vadesi 1 sn önce → `claimDue` onu gerçek `now()` ile normal şekilde alır.
    const id = await enqueue(h, { worldId, executeAt: new Date(Date.now() - 1_000), label: 'erken' });

    /* Kapı temiz saat görür (0), alım sonrası TAZE okuma ise saatin geri düştüğünü görür (−10 dk)
     * — yani "vade hâlâ 10 dk ileride". Canlıdaki dizilimin aynısı: bozuk saati yalnız `claimDue`
     * gördü, ondan sonraki okumalar düzelmişti. */
    stub.program(0, -600_000);

    const r = await sched().tick();

    expect(r.claimed).toBe(1);          // alındı…
    expect(r.released).toBe(1);         // …ama çalıştırılmadan geri bırakıldı
    expect(r.done).toBe(0);
    expect(await echoEffects(h, worldId)).toHaveLength(0);   // handler HİÇ koşmadı

    const row = await missionRow(h, id);
    expect(row.status).toBe('scheduled');
    expect(row.attempts).toBe(0);       // deneme hakkı YAKILMADI (günde birkaç sıçrama var)

    /** ⚠️ Bozuk çıpa silinmeli: yoksa `lag_ms` görev doğru işlense bile saatler gösterir. */
    const cols = await claimCols(id);
    expect(cols.claimedAt).toBeNull();
    expect(cols.lagMs).toBeNull();
  });

  it('geri bırakılan görev, saat düzelince VADESİ KAYMADAN işlenir', async () => {
    const executeAt = new Date(Date.now() - 1_000);
    const id = await enqueue(h, { worldId, executeAt, label: 'kurtarilan' });

    const s = sched();
    stub.program(0, -600_000);
    expect((await s.tick()).released).toBe(1);

    stub.program(0, 0);                          // saat yerine oturdu
    const ok = await s.tick();

    expect(ok.done).toBe(1);
    expect(ok.released).toBe(0);

    const row = await missionRow(h, id);
    expect(row.status).toBe('done');
    // ⭐ Vade DEĞİŞMEDİ: oyuncuya söz verilen saat sıçrama yüzünden kaydırılamaz (`markFailed`
    // olsaydı backoff kadar ileri iterdi — `releaseFuture`ün var oluş sebebi tam olarak bu).
    expect(row.executeAt.getTime()).toBe(executeAt.getTime());
    const [eff] = await echoEffects(h, worldId);
    expect(eff!.sawAt.getTime()).toBe(executeAt.getTime());
  });
});
