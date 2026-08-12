/**
 * ⭐⭐⭐ TEK CİHAZ KURALI — **HTTP AYAĞI** (`AuthGuard`).
 *
 * ⚠️⚠️ **Bu dosya, kuralın dokuz ay boyunca hiç çalışmadığının fark edilmemesindeki test
 * boşluğunu kapatıyor.** `presence.test.ts` `PresenceService`in saf SQL davranışını eksiksiz
 * ölçüyordu — ama oyuncunun gerçekten çarptığı duvar orası değil, `AuthGuard`. Kilidin
 * kendisi kusursuz çalışırken, kilidi HİÇ ÇAĞIRMAYAN bir kapının arkasında durmasını
 * yakalayacak tek test bu katmandaydı ve yoktu.
 *
 * Ölçülen dört şey:
 *   1. ikinci sekme oyun ucunda **409 `session_conflict`** alır (kuralın var oluş sebebi),
 *   2. sahibin kendisi engellenmez,
 *   3. `auth`/`admin` yolları MUAF kalır — yoksa çakışma modalındaki «devral» düğmesi ve
 *      yönetim paneli kilitli hesapta çalışmazdı,
 *   4. anahtar kapalıyken hiçbir şey olmaz (panelden kapatma gerçekten kapatıyor mu).
 */
import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthGuard } from '../src/auth/auth.guard.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { PresenceService } from '../src/auth/presence.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { setLiveSettings } from '../src/settings/live.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let auth: AuthService;
let tokens: TokenService;
let guard: AuthGuard;
let worldId: number;

const ctx = () => ({
  deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test',
  platform: 'web' as const, osVersion: null, deviceModel: null, appVersion: null,
  timezone: null, locale: null,
});

beforeAll(async () => {
  h = await setupTestDb();
  tokens = new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' });
  auth = new AuthService(h.db, tokens, new GameClockService(h.db), new CityService(h.db));
  guard = new AuthGuard(tokens, new PresenceService(h.db), h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  setLiveSettings({ session: { singleDevice: true } });
});

afterEach(() => { setLiveSettings({}); });

/** Gerçek bir hesap + gerçek bir imzalı access token. */
async function login(): Promise<{ token: string; accountId: number }> {
  const t = randomUUID().slice(0, 8);
  const r = await auth.register({
    email: `g-${t}@test.local`, password: 'parola-12345', username: `g_${t}`, worldId,
  }, ctx());
  return { token: r.accessToken, accountId: r.accountId };
}

/**
 * `AuthGuard`ın beklediği en küçük `ExecutionContext`.
 *
 * ⚠️ Nest'i ayağa kaldırmıyoruz (`mail.test.ts`teki denetleyici testleriyle aynı desen):
 * ölçmek istediğimiz şey yönlendirme değil, guard'ın karar ağacı.
 */
function reqCtx(token: string, instanceId: string, url = '/api/v1/cities/1'): ExecutionContext {
  const req = {
    headers: {
      authorization: `Bearer ${token}`,
      'x-client-instance': instanceId,
      'x-platform': 'web',
    },
    url,
  };
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

/** Guard'ı koştur; 409 ise hatanın gövdesindeki `code`u döndür. */
async function run(c: ExecutionContext): Promise<'ok' | string> {
  try {
    await guard.canActivate(c);
    return 'ok';
  } catch (err) {
    const res = (err as { getResponse?: () => unknown }).getResponse?.();
    const code = (res as { code?: string } | undefined)?.code;
    return code ?? String(err);
  }
}

describe('⭐⭐⭐ tek cihaz kuralı — AuthGuard (HTTP)', () => {
  it('⭐⭐⭐ İKİNCİ SEKME oyun ucunda 409 session_conflict alır', async () => {
    const { token } = await login();

    // Birinci sekme sahiplenir.
    expect(await run(reqCtx(token, 'sekme-1'))).toBe('ok');

    // ⚠️ AYNI oturum jetonu, farklı örnek — `sessions` bunu ayırt edemez, kural eder.
    expect(await run(reqCtx(token, 'sekme-2'))).toBe('session_conflict');
  });

  it('sahibin KENDİSİ engellenmez (arka arkaya istekler geçer)', async () => {
    const { token } = await login();
    expect(await run(reqCtx(token, 'sekme-1'))).toBe('ok');
    expect(await run(reqCtx(token, 'sekme-1'))).toBe('ok');
    expect(await run(reqCtx(token, 'sekme-1'))).toBe('ok');
  });

  /**
   * ⚠️ Muafiyet kolaylık değil ZORUNLULUK: çakışma modalındaki «Bu cihazda devam et» düğmesi
   * `POST /auth/session/claim`e gidiyor. Muaf olmasaydı devralma düğmesinin kendisi 409 alır
   * ve oyuncu hesabından kalıcı olarak kilitlenirdi.
   */
  it('⚠️ /auth/** MUAF — kilitli sekme bile devralma çağrısı yapabilir', async () => {
    const { token } = await login();
    await run(reqCtx(token, 'sekme-1'));
    expect(await run(reqCtx(token, 'sekme-2', '/api/v1/auth/sessions'))).toBe('ok');
  });

  /** Panel oyunla aynı hesaba ayrı oturumla giriyor; muaf olmasaydı yönetici oyundan atılırdı. */
  it('⚠️ /admin/** MUAF', async () => {
    const { token } = await login();
    await run(reqCtx(token, 'sekme-1'));
    expect(await run(reqCtx(token, 'panel', '/api/v1/admin/ops'))).toBe('ok');
  });

  it('anahtar KAPALIYKEN ikinci sekme de geçer', async () => {
    setLiveSettings({ session: { singleDevice: false } });
    const { token } = await login();
    expect(await run(reqCtx(token, 'sekme-1'))).toBe('ok');
    expect(await run(reqCtx(token, 'sekme-2'))).toBe('ok');
  });

  /**
   * ⭐ Başlıksız istemci (eski sürüm, betik) `s:<sessionId>`ye düşer. Kuralı ATLATMAMALI:
   * sahiplik alan bir sekme varken başlıksız istek de engellenmeli.
   */
  it('⭐ başlık göndermeyen istemci kuralı ATLATAMAZ', async () => {
    const { token } = await login();
    expect(await run(reqCtx(token, 'sekme-1'))).toBe('ok');

    const basliksiz = {
      headers: { authorization: `Bearer ${token}` },
      url: '/api/v1/cities/1',
    };
    const c = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => basliksiz }),
    } as unknown as ExecutionContext;
    expect(await run(c)).toBe('session_conflict');
  });
});
