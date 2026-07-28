/**
 * ⭐ FAZ 2 — auth + başlangıç şehri + tembel kaynak birikimi testleri.
 *
 * Gerçek Postgres ve gerçek argon2id ile koşar; parola/oturum davranışı taklit edilmez.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { farmOutput, mineOutput, STARTING_RESOURCES } from '@mobiwar/catalog';
import type { DeviceContext } from '../src/abuse/device-signal.service.ts';
import { AuthError, AuthService } from '../src/auth/auth.service.ts';
import { PasswordService } from '../src/auth/password.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let auth: AuthService;
let clock: GameClockService;
let cities: CityService;
let tokens: TokenService;

const webCtx = (deviceId = randomUUID()): DeviceContext => ({
  deviceId, ip: '85.104.12.7', userAgent: 'Mozilla/5.0', platform: 'web',
});
const mobileCtx = (deviceId = randomUUID()): DeviceContext => ({
  deviceId, ip: '10.20.30.40', userAgent: null, platform: 'android',
  osVersion: '14', deviceModel: 'Pixel 8', appVersion: '1.0.0',
});

const cred = (label: string): { email: string; password: string; username: string } => {
  const t = randomUUID().slice(0, 8);
  return { email: `${label}-${t}@test.local`, password: 'parola-12345', username: `${label}_${t}` };
};

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  tokens = new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' });
  auth = new AuthService(h.db, tokens, clock);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
});

describe('parola (argon2id)', () => {
  const pw = new PasswordService();

  it('özet doğrulanır, yanlış parola reddedilir', async () => {
    const hash = await pw.hash('parola-12345');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await pw.verify(hash, 'parola-12345')).toBe(true);
    expect(await pw.verify(hash, 'parola-12346')).toBe(false);
  });

  it('aynı parola her seferinde FARKLI özet üretir (tuz)', async () => {
    expect(await pw.hash('aynisi123')).not.toBe(await pw.hash('aynisi123'));
  });

  it('bozuk özet istisna fırlatmaz, false döner', async () => {
    expect(await pw.verify('bu-bir-hash-degil', 'parola-12345')).toBe(false);
  });
});

describe('kayıt', () => {
  it('hesap + oyuncu + başkent tek işlemde oluşur, başlangıç kesesi yazılır', async () => {
    const c = cred('kurucu');
    const r = await auth.register({ ...c, worldId }, webCtx());

    expect(r.playerId).toBeGreaterThan(0);
    expect(r.accessToken).toBeTruthy();

    const cityRows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id, is_capital FROM cities WHERE player_id = ${r.playerId}
    `);
    expect(cityRows).toHaveLength(1);

    const snap = await cities.snapshot(Number(cityRows[0]!['id']), await clock.gameNow(worldId));
    expect(snap!.isCapital).toBe(true);
    expect(snap!.gold).toBe(STARTING_RESOURCES.gold);
    expect(snap!.food).toBe(STARTING_RESOURCES.food);
    // §13.11.1 başlangıç seviyeleri
    expect(snap!.buildings).toEqual({ castle: 1, barracks: 1, farm: 1, mine: 1 });
    // §13.11.1a gerekçesi: saatte 11 kaynak
    expect(snap!.goldPerHour + snap!.foodPerHour).toBe(11);
  });

  /**
   * ⚠️ GERÇEK HATA (2026-07-27): şehir yeri şehir SAYISINDAN türetiliyordu (`count % 10`). Bir şehir yeri
   * elle dolduğunda veya bir şehir silindiğinde aynı koordinat ikinci kez üretiliyor ve kayıt
   * `cities_world_coords` ihlaliyle 500 dönüyordu. Test o durumu birebir kuruyor.
   */
  it('⭐ dolu şehir yeri ATLANIR: elle açılmış koordinat kaydı bozmaz', async () => {
    const first = await auth.register({ ...cred('ilk'), worldId }, webCtx());
    const firstCity = await h.db.execute<Record<string, unknown>>(sql`
      SELECT k, d, s FROM cities WHERE player_id = ${first.playerId}
    `);
    const k = Number(firstCity[0]!['k']);
    const d = Number(firstCity[0]!['d']);
    const s = Number(firstCity[0]!['s']);

    // Sıradaki şehir yerini BAŞKASI kapsın (koloni kurma, yerleşim algoritması, elle müdahale…).
    await cities.create({
      worldId, playerId: first.playerId, name: 'engel',
      k, d, s: s + 1, isCapital: false, at: await clock.gameNow(worldId),
    });

    // Yeni kayıt çakışmamalı; boş bir şehir yerine düşmeli.
    const second = await auth.register({ ...cred('ikinci'), worldId }, webCtx());
    const secondCity = await h.db.execute<Record<string, unknown>>(sql`
      SELECT k, d, s FROM cities WHERE player_id = ${second.playerId}
    `);
    expect(secondCity).toHaveLength(1);
    const got = `${secondCity[0]!['k']}:${secondCity[0]!['d']}:${secondCity[0]!['s']}`;
    expect(got).not.toBe(`${k}:${d}:${s}`);
    expect(got).not.toBe(`${k}:${d}:${s + 1}`);
  });

  it('boşalan şehir yeri yeniden kullanılır (şehir silinince kayıt tıkanmaz)', async () => {
    const a = await auth.register({ ...cred('bosluk'), worldId }, webCtx());
    await h.db.execute(sql`DELETE FROM cities WHERE player_id = ${a.playerId}`);
    // Kalan tek şehir yoksa bile kayıt çalışmalı.
    await expect(auth.register({ ...cred('sonraki'), worldId }, webCtx())).resolves.toBeTruthy();
  });

  it('72 saat acemi koruması yazılır', async () => {
    const r = await auth.register({ ...cred('acemi'), worldId }, webCtx());
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT protected_until FROM players WHERE id = ${r.playerId}
    `);
    expect(rows[0]!['protected_until']).toBeTruthy();
  });

  it('aynı e-posta ikinci kez kayıt olamaz', async () => {
    const c = cred('tekil');
    await auth.register({ ...c, worldId }, webCtx());
    await expect(auth.register({ ...c, username: 'baska_ad', worldId }, webCtx()))
      .rejects.toThrow(AuthError);
  });

  it('aynı kullanıcı adı (büyük/küçük harf farkıyla bile) alınamaz', async () => {
    const c = cred('mukerrer');
    await auth.register({ ...c, worldId }, webCtx());
    const other = cred('digeri');
    await expect(auth.register({ ...other, username: c.username.toUpperCase(), worldId }, webCtx()))
      .rejects.toThrow(/kullanıcı adı/i);
  });

  it('başarısız kayıt YARIM oyuncu bırakmaz (transaction geri alınır)', async () => {
    const c = cred('yarim');
    await auth.register({ ...c, worldId }, webCtx());
    const before = await h.db.execute<{ n: number } & Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM cities WHERE world_id = ${worldId}
    `);
    await expect(auth.register({ ...c, username: 'yeni_ad_1', worldId }, webCtx())).rejects.toThrow();
    const after = await h.db.execute<{ n: number } & Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM cities WHERE world_id = ${worldId}
    `);
    expect(Number(after[0]!.n)).toBe(Number(before[0]!.n));
  });
});

describe('giriş', () => {
  it('doğru parolayla giriş yapılır', async () => {
    const c = cred('giris');
    await auth.register({ ...c, worldId }, webCtx());
    const r = await auth.login({ username: c.username, password: c.password, worldId }, webCtx());
    expect(r.username).toBe(c.username);
  });

  it('yanlış parola reddedilir ve sayaç artar', async () => {
    const c = cred('yanlis');
    const reg = await auth.register({ ...c, worldId }, webCtx());
    await expect(auth.login({ username: c.username, password: 'yanlis-parola', worldId }, webCtx()))
      .rejects.toThrow(/hatalı/i);

    const rows = await h.db.execute<{ failed_logins: number } & Record<string, unknown>>(sql`
      SELECT failed_logins FROM accounts WHERE id = ${reg.accountId}
    `);
    expect(Number(rows[0]!.failed_logins)).toBe(1);
  });

  it('başarılı giriş hatalı deneme sayacını sıfırlar', async () => {
    const c = cred('sifirla');
    const reg = await auth.register({ ...c, worldId }, webCtx());
    await expect(auth.login({ username: c.username, password: 'x'.repeat(12), worldId }, webCtx())).rejects.toThrow();
    await auth.login({ username: c.username, password: c.password, worldId }, webCtx());
    const rows = await h.db.execute<{ failed_logins: number } & Record<string, unknown>>(sql`
      SELECT failed_logins FROM accounts WHERE id = ${reg.accountId}
    `);
    expect(Number(rows[0]!.failed_logins)).toBe(0);
  });

  it('olmayan kullanıcı adı "kullanıcı yok" demez, aynı hatayı verir', async () => {
    await expect(auth.login({ username: 'yokoyuncu', password: 'parola-12345', worldId }, webCtx()))
      .rejects.toThrow(/Kullanıcı adı veya parola hatalı/);
  });
});

describe('token ve oturum', () => {
  it('access token dünya kimliğini İMZALI taşır (dünya yalıtımı, §13.12.1b)', async () => {
    const r = await auth.register({ ...cred('imza'), worldId }, webCtx());
    const claims = await tokens.verifyAccess(r.accessToken);
    expect(claims.wid).toBe(worldId);
    expect(claims.pid).toBe(r.playerId);
    expect(claims.sid).toBe(r.sessionId);
  });

  it('kurcalanmış token reddedilir', async () => {
    const r = await auth.register({ ...cred('kurcala'), worldId }, webCtx());
    await expect(tokens.verifyAccess(r.accessToken.slice(0, -3) + 'AAA')).rejects.toThrow();
  });

  it('refresh token DB’de DÜZ METİN saklanmaz', async () => {
    const r = await auth.register({ ...cred('gizli'), worldId }, webCtx());
    const rows = await h.db.execute<{ refresh_hash: string } & Record<string, unknown>>(sql`
      SELECT refresh_hash FROM sessions WHERE id = ${r.sessionId}::uuid
    `);
    expect(rows[0]!.refresh_hash).not.toBe(r.refreshToken);
    expect(rows[0]!.refresh_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('⭐ refresh TEK KULLANIMLIK: aynı token ikinci kez çalışmaz', async () => {
    const r = await auth.register({ ...cred('donduren'), worldId }, webCtx());

    const yeni = await auth.refresh(r.refreshToken, webCtx());
    expect(yeni.refreshToken).not.toBe(r.refreshToken);

    // Çalınan token bir kez kullanılabilir; ikinci denemede oturum düşmüş olur.
    await expect(auth.refresh(r.refreshToken, webCtx())).rejects.toThrow(/geçersiz/i);
    // Yeni token çalışmaya devam eder.
    await expect(auth.refresh(yeni.refreshToken, webCtx())).resolves.toBeTruthy();
  });

  it('çıkış sonrası refresh çalışmaz', async () => {
    const r = await auth.register({ ...cred('cikis'), worldId }, webCtx());
    await auth.logout(r.sessionId);
    await expect(auth.refresh(r.refreshToken, webCtx())).rejects.toThrow();
  });

  it('revokeAll tüm oturumları düşürür', async () => {
    const c = cred('hepsi');
    const r1 = await auth.register({ ...c, worldId }, webCtx());
    const r2 = await auth.login({ username: c.username, password: c.password, worldId }, mobileCtx());

    expect(await auth.revokeAll(r1.accountId)).toBe(2);
    await expect(auth.refresh(r1.refreshToken, webCtx())).rejects.toThrow();
    await expect(auth.refresh(r2.refreshToken, mobileCtx())).rejects.toThrow();
  });
});

describe('⭐ giriş akışı çoklu hesap sinyali üretiyor (§9.1)', () => {
  it('aynı cihazdan iki hesap açılırsa aynı device_id iki oyuncuda görünür', async () => {
    const device = randomUUID();
    const a = await auth.register({ ...cred('ikiz_a'), worldId }, webCtx(device));
    const b = await auth.register({ ...cred('ikiz_b'), worldId }, webCtx(device));

    const rows = await h.db.execute<{ player_id: number } & Record<string, unknown>>(sql`
      SELECT player_id FROM player_devices WHERE device_id = ${device} ORDER BY player_id
    `);
    expect(rows.map((r) => Number(r.player_id))).toEqual([a.playerId, b.playerId].sort((x, y) => x - y));
  });

  it('oturum kaydı web ve mobil ayrımını taşır', async () => {
    const c = cred('platform');
    const w = await auth.register({ ...c, worldId }, webCtx());
    const m = await auth.login({ username: c.username, password: c.password, worldId }, mobileCtx());

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id, platform, ua, device_model FROM sessions WHERE account_id = ${w.accountId} ORDER BY created_at
    `);
    const web = rows.find((r) => String(r['id']) === w.sessionId)!;
    const mob = rows.find((r) => String(r['id']) === m.sessionId)!;
    expect(web['platform']).toBe('web');
    expect(web['ua']).toBe('Mozilla/5.0');
    expect(mob['platform']).toBe('android');
    expect(mob['ua']).toBeNull();          // mobilde UA YOK
    expect(mob['device_model']).toBe('Pixel 8');
  });
});

describe('⭐ tembel kaynak birikimi (§3)', () => {
  async function freshCity(): Promise<number> {
    const r = await auth.register({ ...cred('kaynak'), worldId }, webCtx());
    const rows = await h.db.execute<{ id: number } & Record<string, unknown>>(sql`
      SELECT id FROM cities WHERE player_id = ${r.playerId}
    `);
    return Number(rows[0]!.id);
  }

  it('geçen OYUN süresi kadar kaynak birikir', async () => {
    const cityId = await freshCity();
    const t0 = await clock.gameNow(worldId);
    const t10h = new Date(t0.getTime() + 10 * 3_600_000);

    const snap = await cities.snapshot(cityId, t10h);

    // Çiftlik 1 → 6 yemek/saat, Maden 1 → 5 altın/saat (katalog formülleri)
    expect(snap!.gold).toBe(STARTING_RESOURCES.gold + 10 * mineOutput(1));
    expect(snap!.food).toBe(STARTING_RESOURCES.food + 10 * farmOutput(1));
  });

  it('⭐ KESİR KAYBOLMAZ: kısa aralıklarla 100 kez okumak birikimi durdurmaz', async () => {
    const cityId = await freshCity();
    const t0 = await clock.gameNow(worldId);

    // 100 × 36 saniye = 1 saat. Tam sayı saklasaydık her okumada 0,05 kaynak yuvarlanıp
    // yok olur, oyuncu hiç kaynak biriktiremezdi.
    for (let i = 1; i <= 100; i++) {
      await cities.snapshot(cityId, new Date(t0.getTime() + i * 36_000));
    }
    const snap = await cities.snapshot(cityId, new Date(t0.getTime() + 3_600_000));
    expect(snap!.gold).toBe(STARTING_RESOURCES.gold + mineOutput(1));
    expect(snap!.food).toBe(STARTING_RESOURCES.food + farmOutput(1));
  });

  it('geriye dönük çağrı kaynağı AZALTMAZ', async () => {
    const cityId = await freshCity();
    const t0 = await clock.gameNow(worldId);
    const ileri = await cities.snapshot(cityId, new Date(t0.getTime() + 5 * 3_600_000));
    const geri = await cities.snapshot(cityId, new Date(t0.getTime() - 5 * 3_600_000));
    expect(geri!.gold).toBe(ileri!.gold);
  });

  it('bakımda kaynak BİRİKMEZ (oyun saati donuyor)', async () => {
    const cityId = await freshCity();
    const realStart = new Date();
    await cities.snapshot(cityId, await clock.gameNow(worldId, realStart));

    await clock.pause(worldId, realStart);
    // Gerçek zamanda 5 saat geçti ama dünya bakımda.
    const bakimda = await clock.gameNow(worldId, new Date(realStart.getTime() + 5 * 3_600_000));
    const snap = await cities.snapshot(cityId, bakimda);

    expect(snap!.gold).toBe(STARTING_RESOURCES.gold);
    expect(snap!.food).toBe(STARTING_RESOURCES.food);
  });

  it('harcama: yeterli kaynak varsa düşer, yoksa HİÇ dokunmaz', async () => {
    const cityId = await freshCity();
    const at = await clock.gameNow(worldId);

    expect(await cities.trySpend(cityId, { gold: 1000, food: 500 }, at)).toBe(true);
    let snap = await cities.snapshot(cityId, at);
    expect(snap!.gold).toBe(STARTING_RESOURCES.gold - 1000);

    expect(await cities.trySpend(cityId, { gold: 999_999, food: 0 }, at)).toBe(false);
    snap = await cities.snapshot(cityId, at);
    expect(snap!.gold).toBe(STARTING_RESOURCES.gold - 1000);   // değişmedi
  });

  it('koloni SIFIR kaynakla doğar (kur-al-terk et sömürüsü kapalı, §13.11.1a)', async () => {
    const r = await auth.register({ ...cred('koloni'), worldId }, webCtx());
    const at = await clock.gameNow(worldId);
    const colonyId = await cities.create({
      worldId, playerId: r.playerId, name: 'koloni', k: 9, d: 9, s: 9, isCapital: false, at,
    });
    const snap = await cities.snapshot(colonyId, at);
    expect(snap!.gold).toBe(0);
    expect(snap!.food).toBe(0);
  });
});
