/**
 * ⭐ OTURUM ve CİHAZ YÖNETİMİ (admin Faz 3).
 *
 * Fazın tamamı tek bir gözlemden doğdu: `refresh()` eski satırı kapatıp **yeni satır** açıyor
 * (dönmeli, tek kullanımlık refresh — güvenlik için doğru), dolayısıyla satır kimliği bir
 * CİHAZI temsil edemiyor. `chain_id` bu boşluğu kapatıyor ve buradaki ilk grup tam olarak onu
 * ölçüyor: **yenilemeden sonra liste hâlâ tek satır mı?**
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthError, AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let auth: AuthService;
let worldId: number;

const ctx = (o: Partial<{ deviceId: string; platform: string; deviceModel: string; ip: string }> = {}) => ({
  deviceId: o.deviceId ?? randomUUID(),
  ip: o.ip ?? '85.104.12.7',
  userAgent: 'Mozilla/5.0 test',
  platform: o.platform ?? 'web',
  osVersion: null,
  deviceModel: o.deviceModel ?? null,
  appVersion: null,
  timezone: null,
  locale: null,
});

async function newAccount(): Promise<{ accountId: number; result: Awaited<ReturnType<AuthService['register']>> }> {
  const t = randomUUID().slice(0, 8);
  const result = await auth.register({
    email: `s-${t}@test.local`, password: 'parola-12345', username: `s_${t}`, worldId,
  }, ctx());
  return { accountId: result.accountId, result };
}

beforeAll(async () => {
  h = await setupTestDb();
  auth = new AuthService(
    h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }),
    new GameClockService(h.db), new CityService(h.db),
  );
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
});

/* ═══ Zincir kimliği — fazın çekirdeği ══════════════════════════════════════ */

describe('oturum zinciri', () => {
  /**
   * ⭐ **FAZIN ASIL İDDİASI.** Yenileme yeni bir `sessions` satırı açar (güvenlik için) ama
   * cihaz listesi değişmemelidir. Bu test kırılırsa oyuncunun telefonu listede 15 dakikada bir
   * yeni bir cihaz gibi görünmeye başlamış demektir.
   */
  it('yenileme YENİ SATIR açar ama liste hâlâ TEK cihaz gösterir', async () => {
    const { accountId, result } = await newAccount();
    expect(await auth.listSessions(accountId, result.sessionId)).toHaveLength(1);

    let current = result;
    for (let i = 0; i < 3; i++) current = await auth.refresh(current.refreshToken, ctx());

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id, chain_id, revoked_at FROM sessions WHERE account_id = ${accountId}
    `);
    // Dört SATIR (ilk giriş + üç yenileme), tek ZİNCİR.
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => String(r['chain_id']))).size).toBe(1);
    // Üçü iptal edilmiş, biri canlı — dönmeli refresh aynen çalışıyor.
    expect(rows.filter((r) => r['revoked_at'] != null)).toHaveLength(3);

    const list = await auth.listSessions(accountId, current.sessionId);
    expect(list).toHaveLength(1);
    expect(list[0]!.current).toBe(true);
  });

  it('ayrı GİRİŞLER ayrı zincir açar (aynı cihazdan bile)', async () => {
    const { accountId, result } = await newAccount();
    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username FROM players WHERE id = ${result.playerId}
    `);
    const device = randomUUID();
    const second = await auth.login(
      { username: String(p!['username']), password: 'parola-12345', worldId },
      ctx({ deviceId: device }),
    );
    expect(second.sessionId).not.toBe(result.sessionId);
    /**
     * ⚠️ Aynı `device_id`'yi tek zincirde birleştirmek CAZİP ama YANLIŞ olurdu: aynı cihazda
     * arka arkaya iki kez giriş yapmak gerçekten iki ayrı oturumdur ve oyuncu birini
     * diğerinden bağımsız kapatabilmelidir.
     */
    expect(await auth.listSessions(accountId, second.sessionId)).toHaveLength(2);
  });

  /** Zincirin en SON satırı listeyi temsil eder: cihaz bilgisi zamanla değişebilir. */
  it('liste zincirin GÜNCEL bilgisini gösterir, ilkini değil', async () => {
    const { accountId, result } = await newAccount();
    const after = await auth.refresh(result.refreshToken, ctx({ deviceModel: 'Pixel 9' }));
    const [row] = await auth.listSessions(accountId, after.sessionId);
    expect(row!.deviceModel).toBe('Pixel 9');
    // Ama "ne zamandan beri" hâlâ zincirin BAŞLANGICI.
    expect(Date.parse(row!.firstSeenAt)).toBeLessThanOrEqual(Date.parse(row!.lastSeenAt));
  });
});

/* ═══ İptal ═════════════════════════════════════════════════════════════════ */

describe('cihaz çıkarma', () => {
  it('zinciri iptal etmek o cihazın TÜM satırlarını kapatır', async () => {
    const { accountId, result } = await newAccount();
    const refreshed = await auth.refresh(result.refreshToken, ctx());
    const [chain] = await auth.listSessions(accountId, refreshed.sessionId);

    const ids = await auth.revokeChain(accountId, chain!.chainId);
    // Yalnız CANLI satır dönerdi; iptal edilen eski satırlar zaten kapalıydı.
    expect(ids).toEqual([refreshed.sessionId]);
    expect(await auth.listSessions(accountId, refreshed.sessionId)).toHaveLength(0);

    /**
     * ⚠️ En önemli sonuç: iptal edilen zincirin refresh token'ı **artık işlemez**. İptal
     * yalnız listeyi temizleseydi, elinde token kalan cihaz bir sonraki yenilemede oturumu
     * diriltirdi ve "çıkardım ama geri geldi" olurdu.
     */
    await expect(auth.refresh(refreshed.refreshToken, ctx())).rejects.toThrow(AuthError);
  });

  it('BAŞKA hesabın zinciri iptal edilemez', async () => {
    const a = await newAccount();
    const b = await newAccount();
    const [chainOfB] = await auth.listSessions(b.accountId, b.result.sessionId);

    expect(await auth.revokeChain(a.accountId, chainOfB!.chainId)).toEqual([]);
    // B'nin oturumu ayakta kaldı.
    expect(await auth.listSessions(b.accountId, b.result.sessionId)).toHaveLength(1);
  });

  it('«diğerlerinden çık» bu zinciri BIRAKIR, kalanları kapatır', async () => {
    const { accountId, result } = await newAccount();
    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username FROM players WHERE id = ${result.playerId}
    `);
    const username = String(p!['username']);
    const second = await auth.login({ username, password: 'parola-12345', worldId }, ctx());
    const third = await auth.login({ username, password: 'parola-12345', worldId }, ctx());
    expect(await auth.listSessions(accountId, third.sessionId)).toHaveLength(3);

    const dropped = await auth.revokeOtherChains(accountId, third.sessionId);
    expect(dropped.sort()).toEqual([result.sessionId, second.sessionId].sort());

    const left = await auth.listSessions(accountId, third.sessionId);
    expect(left).toHaveLength(1);
    expect(left[0]!.current).toBe(true);
  });

  /**
   * ⚠️ Çıkış ZİNCİRİ kapatır, yalnız o satırı değil: cihazda kalmış eski bir refresh token'ı
   * çıkıştan sonra oturumu diriltememeli.
   */
  it('çıkış zincirin tamamını kapatır', async () => {
    const { accountId, result } = await newAccount();
    const refreshed = await auth.refresh(result.refreshToken, ctx());
    await auth.logout(refreshed.sessionId);

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT revoked_at FROM sessions WHERE account_id = ${accountId}
    `);
    expect(rows.every((r) => r['revoked_at'] != null)).toBe(true);
    expect(await auth.listSessions(accountId, refreshed.sessionId)).toHaveLength(0);
  });

  it('parola değişimi tüm zincirleri düşürür (mevcut davranış korunuyor)', async () => {
    const { accountId, result } = await newAccount();
    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username FROM players WHERE id = ${result.playerId}
    `);
    await auth.login(
      { username: String(p!['username']), password: 'parola-12345', worldId }, ctx());

    const ids = await auth.revokeAllIds(accountId);
    expect(ids).toHaveLength(2);
    expect(await auth.listSessions(accountId, result.sessionId)).toHaveLength(0);
  });
});

/* ═══ Liste içeriği ═════════════════════════════════════════════════════════ */

describe('liste', () => {
  it('süresi geçmiş oturum listede GÖRÜNMEZ', async () => {
    const { accountId, result } = await newAccount();
    await h.db.execute(sql`
      UPDATE sessions SET expires_at = now() - interval '1 day' WHERE id = ${result.sessionId}::uuid
    `);
    expect(await auth.listSessions(accountId, result.sessionId)).toHaveLength(0);
  });

  it('«bu cihaz» EN ÜSTTE, kalanlar son görülmeye göre', async () => {
    const { accountId, result } = await newAccount();
    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username FROM players WHERE id = ${result.playerId}
    `);
    const second = await auth.login(
      { username: String(p!['username']), password: 'parola-12345', worldId }, ctx());

    // İstek İLK oturumdan geliyor → o üstte olmalı, daha yeni olan ikinci sırada.
    const list = await auth.listSessions(accountId, result.sessionId);
    expect(list[0]!.current).toBe(true);
    expect(list).toHaveLength(2);
    expect(list[1]!.current).toBe(false);
    expect(second.sessionId).toBeTruthy();
  });

  it('platform ve cihaz bilgisi listeye taşınıyor (Flutter alanları dâhil)', async () => {
    const t = randomUUID().slice(0, 8);
    const r = await auth.register({
      email: `f-${t}@test.local`, password: 'parola-12345', username: `f_${t}`, worldId,
    }, { ...ctx({ platform: 'android', deviceModel: 'SM-S928B' }), osVersion: '14', appVersion: '1.2.0' });

    const [row] = await auth.listSessions(r.accountId, r.sessionId);
    expect(row!.platform).toBe('android');
    expect(row!.deviceModel).toBe('SM-S928B');
    expect(row!.osVersion).toBe('14');
    expect(row!.appVersion).toBe('1.2.0');
  });
});
