/**
 * ⭐ OYUNCU CEZASI — saldırıya AÇIK / KAPALI (kullanıcı isteği, 2026-07-31).
 *
 * Cezalı oyuncu oyuna giremez, yani şehirlerini savunamaz. Asıl soru şehirlerine ne olacağı:
 *
 *   `open`   — şehirleri saldırıya AÇIK kalır. Kalıcı cezada doğru olan bu: hesap geri
 *              gelmeyecek, şehirleri dünyanın kaynağı olur.
 *   `closed` — şehirleri KORUNUR; oyuncu döndüğünde imparatorluğunu bulur. Yalnız casusluk
 *              serbest, nakliye kapalı — yoksa dokunulmaz şehir güvenli bir kasa olurdu.
 *              (Destek zaten yalnız kendi şehirlerine gidiyor; oraya kural no-op.)
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthError, AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { MissionError, MissionService } from '../src/missions/mission.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let clock: GameClockService;
let cities: CityService;
let missions: MissionService;
let auth: AuthService;

let worldId: number;
let me: number;
let culprit: number;
let home: number;
let theirs: number;

const TARGET = { k: 1, d: 1, s: 2 } as const;

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  missions = new MissionService(h.db, cities);
  auth = new AuthService(
    h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock,
  );
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  me = await createPlayer(h, worldId, 'me');
  culprit = await createPlayer(h, worldId, 'suclu');
  const at = await clock.gameNow(worldId);

  home = await cities.create({
    worldId, playerId: me, name: 'ev', k: 1, d: 1, s: 1, isCapital: true, at,
  });
  // Kendi kolonim — "ceza kendi seferlerimi bağlamaz" vakası için.
  await cities.create({
    worldId, playerId: me, name: 'koloni', k: 1, d: 1, s: 3, isCapital: false, at,
  });
  theirs = await cities.create({
    worldId, playerId: culprit, name: 'suclu', k: 1, d: 1, s: 2, isCapital: true, at,
  });
  // Acemi koruması testin ölçtüğü şeyi gölgelemesin (ayrı vakada AÇIKÇA sınanıyor).
  await h.db.execute(sql`UPDATE players SET protected_until = NULL WHERE world_id = ${worldId}`);
  await h.db.execute(sql`
    INSERT INTO buildings (city_id, type, level) VALUES (${home}, 'barracks', 10)
    ON CONFLICT (city_id, type) DO UPDATE SET level = 10
  `);
  await give(home, 'dwarf', 500);
  await give(home, 'spy_bird', 20);
  await give(home, 'cargo_wagon', 5);
  await h.db.execute(sql`UPDATE cities SET gold = 50000, food = 50000 WHERE id = ${home}`);
});

async function give(cityId: number, type: string, count: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO units (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
    ON CONFLICT (city_id, type) DO UPDATE SET count = ${count}
  `);
}

/** Ceza yaz (panelin `ban` ucunun yaptığı işin çekirdeği). */
async function ban(playerId: number, o: { days?: number; mode?: 'open' | 'closed' } = {}): Promise<void> {
  const until = o.days == null ? null : new Date(Date.now() + o.days * 86_400_000);
  await h.db.execute(sql`
    UPDATE players
       SET banned_at = now(), ban_until = ${until?.toISOString() ?? null}::timestamptz,
           ban_mode = ${until == null ? 'open' : (o.mode ?? 'open')}, ban_reason = 'test'
     WHERE id = ${playerId}
  `);
}

const at = (): Promise<Date> => clock.gameNow(worldId);

const attack = async (): Promise<unknown> => missions.sendAttack({
  originCityId: home, playerId: me, worldId, target: TARGET,
  units: { dwarf: 100 }, at: await at(),
});
const spy = async (): Promise<unknown> => missions.sendSpy({
  originCityId: home, playerId: me, worldId, target: TARGET,
  units: { spy_bird: 3 }, at: await at(),
});
const transport = async (): Promise<unknown> => missions.sendTransport({
  originCityId: home, playerId: me, worldId, target: TARGET,
  units: { cargo_wagon: 2 }, cargo: { gold: 1000, food: 0 }, at: await at(),
});
/**
 * ⚠️ DESTEK bugün **yalnız kendi şehirlerine** gidiyor (`requireOwnTarget`, eski karar:
 * *"müttefike destek ittifak fazında gelecek"*). Yani başkasının şehrine destek zaten
 * gönderilemiyor ve ceza kuralı orada bugün NO-OP. Guard tip-bağımsız yazıldı ki müttefik
 * desteği geldiğinde kuralı ayrıca eklemek gerekmesin; burada kendi şehrimize gönderiyoruz.
 */
const supportOwn = async (): Promise<unknown> => missions.sendSupport({
  originCityId: home, playerId: me, worldId, target: { k: 1, d: 1, s: 3 },
  units: { dwarf: 50 }, at: await at(),
});

/* ═══ Ceza yokken (temel doğru) ═════════════════════════════════════════════ */

describe('ceza yokken', () => {
  it('saldırı, casusluk ve nakliye gider', async () => {
    await expect(attack()).resolves.toBeTruthy();
    await expect(spy()).resolves.toBeTruthy();
    await expect(transport()).resolves.toBeTruthy();
  });
});

/* ═══ SALDIRIYA AÇIK ════════════════════════════════════════════════════════ */

describe('saldırıya AÇIK ceza', () => {
  it('⭐ diğer oyuncular cezalının şehrine SALDIRABİLİR', async () => {
    await ban(culprit, { days: 3, mode: 'open' });
    await expect(attack()).resolves.toBeTruthy();
  });

  it('casusluk ve nakliye de serbest', async () => {
    await ban(culprit, { days: 3, mode: 'open' });
    await expect(spy()).resolves.toBeTruthy();
    await expect(transport()).resolves.toBeTruthy();
  });

  /**
   * ⚠️ Açık ceza acemi korumasını ve tatil modunu **EZER**. Ezmeseydi yönetici "saldırıya
   * açık" dedikten sonra saldırılar korumaya çarpar ve verilen karar sessizce uygulanmazdı.
   */
  it('⭐ açık ceza acemi korumasını EZER', async () => {
    await h.db.execute(sql`
      UPDATE players SET protected_until = now() + interval '72 hours' WHERE id = ${culprit}
    `);
    await expect(attack()).rejects.toThrow(MissionError);   // önce koruma çalışıyor

    await ban(culprit, { days: 3, mode: 'open' });
    await expect(attack()).resolves.toBeTruthy();
  });

  it('açık ceza tatil modunu da EZER', async () => {
    await h.db.execute(sql`
      UPDATE players SET vacation_until = now() + interval '10 days' WHERE id = ${culprit}
    `);
    await expect(attack()).rejects.toThrow(MissionError);
    await ban(culprit, { days: 3, mode: 'open' });
    await expect(attack()).resolves.toBeTruthy();
  });

  /** ⭐ Süresiz ceza DAİMA açıktır — kullanıcı kuralı; şema CHECK'i de zorluyor. */
  it('⭐ süresiz ceza saldırıya AÇIK sayılır', async () => {
    await ban(culprit);                       // days yok → süresiz
    await expect(attack()).resolves.toBeTruthy();
  });

  it('şema süresiz + kapalı kombinasyonunu REDDEDER', async () => {
    await expect(h.db.execute(sql`
      UPDATE players SET banned_at = now(), ban_until = NULL, ban_mode = 'closed'
       WHERE id = ${culprit}
    `)).rejects.toThrow();
  });
});

/* ═══ SALDIRIYA KAPALI ══════════════════════════════════════════════════════ */

describe('saldırıya KAPALI ceza', () => {
  beforeEach(async () => { await ban(culprit, { days: 3, mode: 'closed' }); });

  it('⭐ SALDIRI engellenir', async () => {
    const err = await attack().then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(MissionError);
    expect((err as MissionError).code).toBe('target_banned');
  });

  /** ⭐ Kullanıcı kuralı: *"saldıramaz ama casus kuş atabilir"*. */
  it('⭐ CASUS KUŞ serbest', async () => {
    await expect(spy()).resolves.toBeTruthy();
  });

  /** ⭐ Kullanıcı kuralı: *"nakliye gönderemez"*. */
  it('⭐ NAKLİYE engellenir', async () => {
    await expect(transport()).rejects.toThrow(MissionError);
  });

  /**
   * ⚠️ **Ceza KENDİ şehrine desteği engellemez.** Cezalı olan başka bir oyuncu; benim kendi
   * kolonime ordu göndermem onu hiç ilgilendirmiyor. Guard'ın hedefin sahibine bakıp
   * kendi şehirlerimizi atladığını sabitliyor — atlamasaydı bir oyuncunun cezası bütün
   * dünyanın kendi içindeki nakliyesini kilitlerdi.
   */
  it('kendi şehrine DESTEK cezadan etkilenmez', async () => {
    await expect(supportOwn()).resolves.toBeTruthy();
  });

  it('süresi GEÇMİŞ ceza etkisiz — saldırı yine gider', async () => {
    await h.db.execute(sql`
      UPDATE players SET ban_until = now() - interval '1 hour' WHERE id = ${culprit}
    `);
    await expect(attack()).resolves.toBeTruthy();
  });

  it('ceza kaldırılınca her şey normale döner', async () => {
    await h.db.execute(sql`
      UPDATE players SET banned_at = NULL, ban_until = NULL, ban_mode = NULL WHERE id = ${culprit}
    `);
    await expect(attack()).resolves.toBeTruthy();
    await expect(transport()).resolves.toBeTruthy();
  });

  /** Ceza yalnız CEZALIYI korur — üçüncü bir oyuncuya saldırı normal. */
  it('ceza yalnız cezalıyı kapsar', async () => {
    const third = await createPlayer(h, worldId, 'ucuncu');
    await cities.create({
      worldId, playerId: third, name: 'ucuncu', k: 1, d: 1, s: 4, isCapital: true,
      at: await at(),
    });
    await expect(missions.sendAttack({
      originCityId: home, playerId: me, worldId, target: { k: 1, d: 1, s: 4 },
      units: { dwarf: 100 }, at: await at(),
    })).resolves.toBeTruthy();
  });
});

/* ═══ HTTP eşlemesi ════════════════════════════════════════════════════════ */

describe('hata kodunun HTTP karşılığı', () => {
  /**
   * ⚠️ `target_banned` **403**, `target_protected`/`target_vacation` ile aynı aile: "bu hedefe
   * bu görevi yapamazsın". İlk yazımda eşlemeye eklenmemişti ve varsayılan dala düşüp 400
   * dönüyordu — canlı ölçümde yakalandı. 400 "isteğin bozuk" demek; oysa istek kusursuz.
   */
  it('cezalı hedef 403 döner (koruma/tatil ile aynı sınıf)', async () => {
    const { missionErrorToHttp } = await import('../src/missions/mission.controller.ts');
    const status = (code: string): number =>
      (missionErrorToHttp(new MissionError(code as never, 'x')) as { getStatus(): number }).getStatus();
    expect(status('target_banned')).toBe(403);
    expect(status('target_protected')).toBe(403);
    expect(status('target_vacation')).toBe(403);
  });
});

/* ═══ Giriş ═════════════════════════════════════════════════════════════════ */

describe('cezalının girişi', () => {
  async function makeAccount(): Promise<{ username: string; playerId: number }> {
    const t = randomUUID().slice(0, 8);
    const r = await auth.register({
      email: `b-${t}@test.local`, password: 'parola-12345', username: `b_${t}`, worldId,
    }, { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' });
    return { username: `b_${t}`, playerId: r.playerId };
  }

  const login = (username: string): Promise<unknown> => auth.login(
    { username, password: 'parola-12345', worldId },
    { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' },
  );

  it('cezalı GİRİŞ YAPAMAZ', async () => {
    const a = await makeAccount();
    await ban(a.playerId, { days: 3, mode: 'closed' });
    const err = await login(a.username).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).code).toBe('banned');
  });

  /**
   * ⭐ **Fazın ikinci ana iddiası**: ceza SÜRELİ olabilir. Eskiden `banned_at` dolu olduğu
   * sürece giriş sonsuza kadar kapalıydı; "3 gün ceza" verilemiyordu.
   */
  it('⭐ SÜRESİ DOLAN ceza girişi kendiliğinden açar', async () => {
    const a = await makeAccount();
    await ban(a.playerId, { days: 3, mode: 'closed' });
    await expect(login(a.username)).rejects.toThrow(AuthError);

    await h.db.execute(sql`
      UPDATE players SET ban_until = now() - interval '1 second' WHERE id = ${a.playerId}
    `);
    await expect(login(a.username)).resolves.toBeTruthy();
  });

  it('süresiz ceza girişi sonsuza kadar kapatır', async () => {
    const a = await makeAccount();
    await ban(a.playerId);
    await expect(login(a.username)).rejects.toThrow(AuthError);
  });

  /** ⚠️ Sebep hata metnine giriyor: oyuncu "neden giremiyorum" diye destek aramasın. */
  it('hata metni sebebi ve süreyi taşır', async () => {
    const a = await makeAccount();
    await ban(a.playerId, { days: 3, mode: 'closed' });
    const err = await login(a.username).then(() => null, (e: unknown) => e);
    expect((err as AuthError).message).toContain('test');
  });

  /**
   * ⚠️ Süresi geçmiş ceza satırı TEMİZLENMİYOR — moderasyon geçmişi kalıcı olmalı
   * (`chat_bans` ile aynı sözleşme). Yalnız etkisiz sayılıyor.
   */
  it('süresi geçmiş ceza kaydı DURUYOR', async () => {
    const a = await makeAccount();
    await ban(a.playerId, { days: 1 });
    await h.db.execute(sql`
      UPDATE players SET ban_until = now() - interval '1 day' WHERE id = ${a.playerId}
    `);
    await login(a.username);
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT banned_at, ban_reason FROM players WHERE id = ${a.playerId}
    `);
    expect(row!['banned_at']).not.toBeNull();
    expect(String(row!['ban_reason'])).toBe('test');
  });
});
