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
  auth = new AuthService(h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock);
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
  it('kuyruğun KALAN süresi duraklama boyunca değişmiyor (tam sayı ms)', async () => {
    const t0 = await clock.gameNow(worldId);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at: t0 });
    const finishAt = q.finishAt.getTime();

    /**
     * ⚠️ Duraklama gerçek zamanı ENJEKTE EDİLİYOR (`realNow`), `setTimeout` ile beklenmiyor:
     * 10 dakika beklemek testi 10 dakika sürdürürdü, 50 ms beklemek ise ölçtüğü şeyi
     * (uzun bir bakım) ölçmezdi. Saat servisinin zaten enjekte edilebilir olması bu yüzden.
     */
    const pauseAt = new Date();
    const resumeAt = new Date(pauseAt.getTime() + 10 * 60_000);   // 10 dakikalık bakım

    /**
     * ⚠️ "Önce"ki kalan süre **duraklama anında** ölçülüyor, duraklamadan biraz önce değil.
     * İlk yazımda `clock.gameNow(worldId)` ile ölçülüyordu; aradaki DB gidiş-dönüşü kadar
     * (2 ms) gerçek zaman akıyor ve test 2 ms sapma gösteriyordu. Sapma dondurmanın değil
     * ÖLÇÜMÜN hatasıydı: iki farklı anı karşılaştırıyordu. Aynı `realNow` ile ölçmek
     * dondurmayı yalıtıyor.
     */
    const remainingBefore = finishAt - (await clock.gameNow(worldId, pauseAt)).getTime();
    expect(remainingBefore).toBeGreaterThan(0);

    await clock.pause(worldId, pauseAt);

    // Bakım SIRASINDA: oyun saati donmuş → 10 dakika sonra bile kalan süre aynı.
    const midGameNow = (await clock.gameNow(worldId, resumeAt)).getTime();
    expect(finishAt - midGameNow).toBe(remainingBefore);

    await clock.resume(worldId, resumeAt);

    const afterGameNow = (await clock.gameNow(worldId, resumeAt)).getTime();
    const remainingAfter = finishAt - afterGameNow;

    /**
     * ⚠️ 1 ms tolerans: `clock_offset_ms` Postgres'te `EXTRACT(EPOCH …) * 1000` ile
     * hesaplanıp `bigint`e yuvarlanıyor. Toleransı 0 yazsaydık test, ölçtüğü davranıştan
     * bağımsız olarak yuvarlama yüzünden ara sıra kırılırdı.
     */
    expect(Math.abs(remainingAfter - remainingBefore)).toBeLessThanOrEqual(1);
    // Ve gerçek zaman 10 dakika ilerlemiş olmasına rağmen iş bitmemiş olmalı.
    expect(remainingAfter).toBeGreaterThan(0);
  });

  it('oyun saati bakımda DONAR, gerçek saat ilerlese bile', async () => {
    const pauseAt = new Date();
    await clock.pause(worldId, pauseAt);
    const a = await clock.gameNow(worldId, new Date(pauseAt.getTime() + 1_000));
    const b = await clock.gameNow(worldId, new Date(pauseAt.getTime() + 3_600_000));
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

  it('iki kez `resume` çağrılsa bile duraklama offset\'e İKİ KEZ eklenmez', async () => {
    const pauseAt = new Date();
    const resumeAt = new Date(pauseAt.getTime() + 60_000);
    await clock.pause(worldId, pauseAt);
    const first = await clock.resume(worldId, resumeAt);
    const second = await clock.resume(worldId, new Date(resumeAt.getTime() + 60_000));
    expect(second.clockOffsetMs).toBe(first.clockOffsetMs);
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
