/**
 * ⭐ BAKIM MODU (admin Faz 2).
 *
 * En önemli vaka **donma ölçümü**: kullanıcının cümlesi *"her şey aniden donar ve bakım
 * bitiminde kaldığı yerden devam eder"*. Bu dosya o cümleyi sayıyla kanıtlıyor — bir kuyruğun
 * KALAN süresi bakımdan önce ve sonra aynı mı?
 *
 * İkinci ağırlık merkezi **mutasyon kilidi**. Bakım modu 0001'den beri saati donduruyordu ama
 * yazmalar geçiyordu; kilit 2026-07-31'de eklendi ve buradaki vakalar onun kapsamını çiziyor:
 * hangi metotlar kilitli, hangi yollar açık, kim muaf.
 */
import { randomUUID } from 'node:crypto';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { of } from 'rxjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { QueueService } from '../src/queues/queue.service.ts';
import { eventForOutbox } from '../src/realtime/realtime.bus.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { DrainNotReadyError } from '../src/world/time-shift.ts';
import { MaintenanceInterceptor } from '../src/world/maintenance.interceptor.ts';
import { WorldStateService } from '../src/world/world-state.service.ts';
import { createWorld, freshWorldId, setupTestDb, verifyEmail } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;
let cities: CityService;
let queues: QueueService;
let auth: AuthService;
let worlds: WorldStateService;
let interceptor: MaintenanceInterceptor;

let accountId: number;
let playerId: number;
let cityId: number;

/** Interceptor'ın gördüğü en küçük istek + `next`. */
const asContext = (req: unknown): ExecutionContext => ({
  getType: () => 'http',
  switchToHttp: () => ({ getRequest: () => req }),
} as unknown as ExecutionContext);

const NEXT: CallHandler = { handle: () => of('gecti') };

const request = (method: string, url: string, o?: { accountId: number; worldId: number }) => ({
  method, url,
  player: o ? { accountId: o.accountId, playerId, worldId: o.worldId, sessionId: 'x' } : undefined,
  headers: {},
});

/** Interceptor geçirdi mi? Geçirmediyse fırlatıyor. */
async function passes(req: unknown): Promise<boolean> {
  try {
    await interceptor.intercept(asContext(req), NEXT);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  queues = new QueueService(h.db, cities);
  auth = new AuthService(h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock, cities);
}, 60_000);

afterAll(async () => { await worlds?.stop(); await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  const t = randomUUID().slice(0, 8);
  const r = await auth.register({
    email: `m-${t}@test.local`, password: 'parola-12345', username: `m_${t}`, worldId,
  }, { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' });
  playerId = r.playerId;
  // Kayıt akışı hesabı doğrulanmamış bırakır; bu dosya §verify kısıtlarını ölçmüyor.
  await verifyEmail(h, playerId);
  const [acc] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT account_id FROM players WHERE id = ${playerId}
  `);
  accountId = Number(acc!['account_id']);
  const [city] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT id FROM cities WHERE player_id = ${playerId}
  `);
  cityId = Number(city!['id']);

  // ⚠️ Her testte YENİ servis: önbellek durumu testler arasında sızmasın.
  await worlds?.stop();
  worlds = new WorldStateService(h.db);
  await worlds.load();
  interceptor = new MaintenanceInterceptor(worlds, h.db);
});

/* ═══ Donma — asıl ölçüm ════════════════════════════════════════════════════ */

describe('donma ve kaldığı yerden devam', () => {
  /**
   * ⭐ **PLANIN TALEP ETTİĞİ ÖLÇÜM**: "bakıma al, bekle, çıkar → kuyruğun kalan süresi
   * bakımdan önceki değerle AYNI olmalı (kaymamalı)".
   *
   * Kalan süre = `finish_at − gameNow`. `finish_at` oyun saatinde SABİT yazılıdır; `gameNow`
   * bakımda donar ve çıkışta `clock_offset_ms`e duraklama eklendiği için tam kaldığı yerden
   * devam eder. Bu testin ölçtüğü şey ikisinin FARKININ korunması.
   */
  /**
   * ⭐⭐ ASIL ÖLÇÜM — kullanıcının cümlesi: *"her şey aniden donar ve bakım bitiminde kaldığı
   * yerden devam eder"*.
   *
   * ⚠️ **Yöntem 0043'te değişti (tek zaman çizgisi).** Eskiden `realNow` enjekte ediliyordu;
   * artık saat DB'den geliyor ve enjekte edilemiyor — bilerek, çünkü süreç saatiyle DB saatinin
   * ayrışması canlıda iki kez hataya yol açtı. Uzun bir bakımı taklit etmenin yeni yolu
   * **`paused_at`i geriye almak**: `resume` kaydırmayı `now() − paused_at` ile hesapladığı için
   * bu, 10 dakika beklemekle bit-bit aynı kod yolunu koşturuyor.
   *
   * ⚠️ Değişmez artık şu: kuyruğun kalan süresi bakım BOYUNCA ve bakımdan SONRA aynı. Bunu
   * sağlayan mekanizma da değişti — `clock_offset_ms` birikimi değil, `finish_at`in kendisinin
   * kayması (`time-registry.ts`).
   */
  it('kuyruğun KALAN süresi duraklama boyunca değişmiyor (tam sayı ms)', async () => {
    const t0 = await clock.gameNow(worldId);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at: t0 });
    const finishAt = q.finishAt.getTime();

    await clock.pause(worldId);
    // 10 dakikalık bir bakımı taklit et: duraklama anını geriye al.
    await h.db.execute(sql`
      UPDATE worlds SET paused_at = paused_at - interval '10 minutes' WHERE id = ${worldId}
    `);

    // Bakım SIRASINDA oyun saati donuk → kalan süre gerçek zamandan bağımsız.
    const during = (await clock.gameNow(worldId)).getTime();
    const remainingDuring = finishAt - during;
    expect(remainingDuring).toBeGreaterThan(0);

    const shift = await clock.resume(worldId);
    expect(shift.shiftMs).toBeGreaterThanOrEqual(10 * 60_000);
    // ⭐ Kuyruk gerçekten kaydırıldı — kayıt defteri kapsamının kanıtı.
    expect(shift.rowsByTable['queues.finish_at']).toBe(1);

    const [after] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT finish_at, now() AS at FROM queues WHERE id = ${q.id}
    `);
    const remainingAfter = new Date(String(after!['finish_at'])).getTime()
      - new Date(String(after!['at'])).getTime();

    /**
     * ⚠️ Tolerans 1 sn: kaydırma miktarı `now()` ile hesaplanıyor ve ölçüm sorgusu ayrı bir
     * gidiş-dönüş. Eskisi 1 ms idi çünkü her iki taraf da AYNI enjekte edilmiş `realNow`u
     * kullanıyordu; artık iki gerçek an karşılaştırılıyor. Ölçülen davranış (kalan sürenin
     * korunması) dakika mertebesinde, tolerans onu gizlemiyor.
     */
    expect(Math.abs(remainingAfter - remainingDuring)).toBeLessThan(1_000);
    expect(remainingAfter).toBeGreaterThan(0);
  });

  it('oyun saati bakımda DONAR, gerçek saat ilerlese bile', async () => {
    await clock.pause(worldId);
    const a = await clock.gameNow(worldId);
    await new Promise((r) => setTimeout(r, 60));
    const b = await clock.gameNow(worldId);
    // Gerçek saat 60 ms ilerledi ama oyun saati `paused_at`te donuk.
    expect(a.getTime()).toBe(b.getTime());
  });

  /**
   * ⭐ **BEKLENMEDİK KAPANMA** (planın ikinci ölçümü): süreç bakımdayken ölür ve yeniden
   * başlar. Donma DB'de durduğu için (bellekte değil) yeni süreç bakımı olduğu gibi devralır.
   * `WorldStateService`in yeni bir örneğini kurmak tam olarak bunu taklit ediyor.
   */
  it('süreç bakımdayken yeniden başlarsa bakım DEVAM eder', async () => {
    await clock.pause(worldId);
    const restarted = new WorldStateService(h.db);
    await restarted.load();
    expect(restarted.isPaused(worldId)).toBe(true);
    await restarted.stop();
  });

  /**
   * ⭐ İKİ KEZ «devam ettir» — kaydırma İKİ KEZ uygulanmaz.
   *
   * ⚠️ 0043'te bu riskin ağırlığı arttı: eskiden ikinci çağrı yalnız offset'i şişirirdi, artık
   * **tüm vadeleri ikinci kez kaydırırdı** ve geri alınamazdı. İki katmanlı koruma var:
   * `SELECT … FOR UPDATE` + `time_shifts_world_pause` tekilliği. Burada davranış ölçülüyor.
   */
  it('iki kez `resume` çağrılsa bile kaydırma İKİ KEZ uygulanmaz', async () => {
    await clock.pause(worldId);
    await h.db.execute(sql`
      UPDATE worlds SET paused_at = paused_at - interval '5 minutes' WHERE id = ${worldId}
    `);
    const first = await clock.resume(worldId);
    const second = await clock.resume(worldId);

    expect(first.outcome).toBe('applied');
    expect(second.outcome).toBe('noop');       // dünya zaten çalışıyor → sessiz no-op
    expect(second.shiftMs).toBe(0);

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM time_shifts
       WHERE world_id = ${worldId} AND kind = 'maintenance'
    `);
    expect(Number(rows[0]!['n'])).toBe(1);
  });

  /**
   * ⭐⭐ DRENAJ BARİYERİ — uçuşta iş varken kaydırma YAPILMAZ.
   *
   * Uçuştaki bir handler kaydırmadan SONRA commit ederse **kaymamış** bir vade yazar ve o
   * görev bakım süresi kadar erken ateşlenir. `claimDue` `status='running'`i ayrı bir
   * transaction'da commit ettiği için uçuştaki iş her zaman sayılabilir.
   */
  it('uçuşta görev varken resume reddedilir (409 → DrainNotReadyError)', async () => {
    await h.db.execute(sql`
      INSERT INTO missions (world_id, type, status, execute_at, locked_by, locked_at)
      VALUES (${worldId}, 'echo', 'running', now(), 'test-worker', now())
    `);
    await clock.pause(worldId);

    await expect(clock.resume(worldId)).rejects.toThrow(DrainNotReadyError);

    // Dünya HÂLÂ bakımda olmalı — reddedilen bir resume yarı iş bırakmamalı.
    expect((await clock.read(worldId)).paused).toBe(true);
  });
});

/* ═══ Mutasyon kilidi ═══════════════════════════════════════════════════════ */

describe('mutasyon kilidi', () => {
  const asPlayer = () => ({ accountId, worldId });

  it('dünya çalışıyorken hiçbir şey engellenmiyor', async () => {
    expect(await passes(request('POST', '/api/v1/cities/1/queue', asPlayer()))).toBe(true);
  });

  it('bakımda yazma metotları kapalı, OKUMA açık', async () => {
    await clock.pause(worldId);
    await worlds.load();

    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(await passes(request(m, '/api/v1/cities/1/queue', asPlayer())), m).toBe(false);
    }
    /**
     * ⚠️ Okuma AÇIK kalmalı — kararın "salt-okunur perde" olması bunu gerektiriyor: perdenin
     * arkasındaki ekran veriyi göstermeye devam ediyor ve oyuncu şehrine bakabiliyor.
     */
    for (const m of ['GET', 'HEAD', 'OPTIONS']) {
      expect(await passes(request(m, '/api/v1/cities/1', asPlayer())), m).toBe(true);
    }
  });

  /**
   * ⚠️ `/auth/` kapatılsaydı oturumu düşen oyuncu **perdeyi bile göremezdi**: perde oturum
   * gerektiren bir ekranda duruyor. Bakımın oyuncuya görünmez olması, kilidin kendisinden
   * daha kötü bir hata olurdu.
   */
  it('bakımda giriş/token yenileme ve admin uçları AÇIK', async () => {
    await clock.pause(worldId);
    await worlds.load();
    expect(await passes(request('POST', '/api/v1/auth/login'))).toBe(true);
    expect(await passes(request('POST', '/api/v1/auth/refresh'))).toBe(true);
    expect(await passes(request('POST', '/api/v1/admin/worlds/1/resume', asPlayer()))).toBe(true);
  });

  it('sorgu dizesi kilidi ATLATAMAZ', async () => {
    await clock.pause(worldId);
    await worlds.load();
    // Yol eşlemesi `?` öncesine bakıyor; aksi hâlde `?x=/api/v1/auth/` numarası işlerdi.
    expect(await passes(request('POST', '/api/v1/cities/1/queue?from=/api/v1/auth/', asPlayer())))
      .toBe(false);
  });

  it('personel (admin) kilidin DIŞINDA — bakımı test edebilsin', async () => {
    await clock.pause(worldId);
    await worlds.load();
    expect(await passes(request('POST', '/api/v1/cities/1/queue', asPlayer()))).toBe(false);

    await h.db.execute(sql`UPDATE accounts SET role = 'admin' WHERE id = ${accountId}`);
    expect(await passes(request('POST', '/api/v1/cities/1/queue', asPlayer()))).toBe(true);
  });

  it('kilit DÜNYA BAZLI — başka dünyanın bakımı bu dünyayı etkilemez', async () => {
    const other = freshWorldId();
    await createWorld(h, other);
    await clock.pause(other);
    await worlds.load();
    expect(worlds.isPaused(other)).toBe(true);
    expect(await passes(request('POST', '/api/v1/cities/1/queue', asPlayer()))).toBe(true);
  });

  /**
   * ⚠️ Bilinmeyen dünya "çalışıyor" sayılır. Ters kural (bilinmiyorsa kilitle) güvenli
   * görünür ama önbellek yüklenmeden gelen ilk istekleri veya yeni açılan bir dünyayı
   * sessizce 503'e düşürürdü.
   */
  it('önbellekte olmayan dünya kilitli SAYILMAZ', async () => {
    const unknown = new WorldStateService(h.db);   // hiç `load()` edilmedi
    const fresh = new MaintenanceInterceptor(unknown, h.db);
    await expect(fresh.intercept(asContext(request('POST', '/api/v1/x', asPlayer())), NEXT))
      .resolves.toBeDefined();
  });

  it('bakımdan çıkınca kilit kalkıyor', async () => {
    await clock.pause(worldId);
    await worlds.load();
    expect(await passes(request('POST', '/api/v1/cities/1/queue', asPlayer()))).toBe(false);

    await clock.resume(worldId);
    await worlds.load();
    expect(await passes(request('POST', '/api/v1/cities/1/queue', asPlayer()))).toBe(true);
  });

  /** Perde metnini 503 gövdesinden de okuyabilmeli: istemci ayrı bir sorgu yapmak zorunda kalmasın. */
  it('503 gövdesi kodu ve perde metnini taşıyor', async () => {
    await clock.pause(worldId);
    await worlds.setNotice(worldId, { notice: 'Depolama bakımı', eta: null, actorId: null });

    const err = await interceptor
      .intercept(asContext(request('POST', '/api/v1/cities/1/queue', asPlayer())), NEXT)
      .then(() => null, (e: unknown) => e);
    const body = (err as { getStatus(): number; getResponse(): Record<string, unknown> });
    expect(body.getStatus()).toBe(503);
    expect(body.getResponse()['code']).toBe('maintenance');
    expect(body.getResponse()['message']).toBe('Depolama bakımı');
  });
});

/* ═══ Durum önbelleği ve duyuru ═════════════════════════════════════════════ */

describe('durum önbelleği', () => {
  it('metin ve tahmin okunuyor, bakım bitince temizleniyor', async () => {
    const eta = new Date(Date.now() + 30 * 60_000);
    await clock.pause(worldId);
    await worlds.setNotice(worldId, { notice: 'Taşınıyoruz', eta, actorId: null });
    expect(worlds.get(worldId)?.notice).toBe('Taşınıyoruz');
    expect(worlds.get(worldId)?.eta?.getTime()).toBe(eta.getTime());

    await clock.resume(worldId);
    await worlds.clearNotice(worldId);
    expect(worlds.get(worldId)?.notice).toBeNull();
    expect(worlds.get(worldId)?.paused).toBe(false);
  });

  /**
   * ⭐ SICAK YOL ÖLÇÜMÜ — Faz 1'deki ayar testinin kardeşi. Kilit her mutasyonda çalışıyor;
   * her seferinde `worlds` tablosuna insaydı bakım kontrolünün bedeli **her yazma isteğine
   * bir sorgu** olurdu. Bu test o bedeli sıfırda tutuyor.
   */
  it('yüklemeden sonra 1000 kilit kontrolü = 0 sorgu', async () => {
    const real = h.db.execute.bind(h.db);
    let queries = 0;
    (h.db as unknown as { execute: typeof real }).execute = ((...args: Parameters<typeof real>) => {
      queries++;
      return real(...args);
    }) as typeof real;
    try {
      const req = request('POST', '/api/v1/cities/1/queue', { accountId, worldId });
      for (let i = 0; i < 1000; i++) await interceptor.intercept(asContext(req), NEXT);
      expect(queries).toBe(0);
    } finally {
      (h.db as unknown as { execute: typeof real }).execute = real;
    }
  });
});

describe('gerçek zamanlı duyuru', () => {
  it('`world:maintenance` dünya geneline yayılıyor ve durumu taşıyor', () => {
    const ev = eventForOutbox('world:maintenance',
      { worldId, paused: true, notice: 'Bakım', eta: null }, worldId);
    expect(ev).not.toBeNull();
    expect(ev!.topic).toBe('world:maintenance');
    // ⚠️ Boş `playerIds` = DÜNYA ODASI yayını: perde herkeste aynı anda açılmalı.
    expect(ev!.playerIds).toEqual([]);
    expect(ev!.ref?.['paused']).toBe(1);
    expect(ev!.ref?.['notice']).toBe('Bakım');
  });

  it('bakım bitişi de aynı konudan gidiyor (perde tek yoldan kalkar)', () => {
    const ev = eventForOutbox('world:maintenance', { worldId, paused: false }, worldId);
    expect(ev!.ref?.['paused']).toBe(0);
  });
});
