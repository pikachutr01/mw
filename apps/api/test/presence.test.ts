/**
 * ⭐ TEK CİHAZ KURALI (kullanıcı, 2026-08-03).
 *
 * *"Bir hesabın aynı anda sadece bir cihazda açık olabilmesi… Aynı şekilde bir cihazda başka
 * bir sekmede bile açarsa onu da engelleyelim."*
 *
 * Bu dosyanın ölçtüğü asıl şey, kuralın **sekme** düzeyinde çalıştığı: `sessions` tablosu
 * sekmeleri ayırt edemiyor (aynı `localStorage`, aynı satır), o yüzden ayraç `instance_id`.
 * Testler bu ayrımı, devralmayı, zaman aşımını ve dev muafiyetini kapsıyor.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/auth.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import { PresenceService, singleDeviceEnforced } from '../src/auth/presence.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { setLiveSettings } from '../src/settings/live.ts';
import type { DbHandle } from '../src/db/client.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let auth: AuthService;
let presence: PresenceService;
let worldId: number;

const ctx = () => ({
  deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'Mozilla/5.0 test',
  platform: 'web' as const, osVersion: null, deviceModel: null, appVersion: null,
  timezone: null, locale: null,
});

async function newAccount(): Promise<{ accountId: number; sessionId: string }> {
  const t = randomUUID().slice(0, 8);
  const r = await auth.register({
    email: `pr-${t}@test.local`, password: 'parola-12345', username: `pr_${t}`, worldId,
  }, ctx());
  return { accountId: r.accountId, sessionId: r.sessionId };
}

beforeAll(async () => {
  h = await setupTestDb();
  auth = new AuthService(
    h.db,
    new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }),
    new GameClockService(h.db),
    new CityService(h.db),
  );
  presence = new PresenceService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
});

afterEach(() => {
  setLiveSettings({});
  delete process.env['SINGLE_SESSION_FORCE'];
});

describe('sahiplik (account_presence)', () => {
  it('boş hesabı ilk gelen sahiplenir', async () => {
    const a = await newAccount();
    const r = await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'sekme-1', worldId,
    });
    expect(r.ok).toBe(true);
    expect((await presence.holder(a.accountId))?.instanceId).toBe('sekme-1');
  });

  /**
   * ⭐ BU TESTİN VARLIK SEBEBİ: aynı tarayıcının iki sekmesi AYNI oturum satırını paylaşır.
   * Kural `sessions.id` üzerine kurulsaydı burada çakışma HİÇ görülmezdi ve kullanıcının
   * "başka bir sekmede bile açarsa engelleyelim" şartı sessizce karşılanmamış olurdu.
   */
  it('⭐ AYNI oturumun İKİNCİ SEKMESİ engellenir (sessions bunu ayırt edemez)', async () => {
    const a = await newAccount();
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'sekme-1', worldId,
    });

    const ikinci = await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'sekme-2', worldId,
    });

    expect(ikinci.ok).toBe(false);
    if (!ikinci.ok) expect(ikinci.holder.instanceId).toBe('sekme-1');
  });

  it('aynı örnek tekrar sahiplenebilir (sayfa yenileme kilitlemez)', async () => {
    const a = await newAccount();
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'sekme-1', worldId,
    });
    const tekrar = await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'sekme-1', worldId,
    });
    expect(tekrar.ok).toBe(true);
    if (tekrar.ok) expect(tekrar.tookOver).toBe(false);
  });

  it('⭐ force ile devralınır ve ÖNCEKİ sahip bildirilir', async () => {
    const a = await newAccount();
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'telefon', worldId,
      platform: 'android',
    });

    const devral = await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'masaustu', worldId, force: true,
    });

    expect(devral.ok).toBe(true);
    if (devral.ok) {
      expect(devral.tookOver).toBe(true);
      // Gateway bu bilgiyle eski cihazın soketini düşürüyor; olmazsa o ekran donmuş kalırdı.
      expect(devral.previous?.instanceId).toBe('telefon');
      expect(devral.previous?.platform).toBe('android');
    }
    expect((await presence.holder(a.accountId))?.instanceId).toBe('masaustu');
  });

  /**
   * ⭐ ZAMAN AŞIMI — kullanıcı "kesin engelleme" yerine devralmayı seçti ama zaman aşımı yine
   * de şart: tarayıcısı çöken oyuncu düğmeye basmadan da geri girebilmeli.
   */
  it('⭐ sahiplik zaman aşımına uğrayınca serbest kalır', async () => {
    const a = await newAccount();
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'olu-sekme', worldId,
    });

    // Sahibin son ses verişini geriye al (grace 90 sn).
    await h.db.execute(sql`
      UPDATE account_presence SET seen_at = now() - interval '10 minutes'
       WHERE account_id = ${a.accountId}
    `);

    expect(await presence.holder(a.accountId)).toBeNull();
    const yeni = await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'yeni-sekme', worldId,
    });
    expect(yeni.ok).toBe(true);
  });

  it('grace ayarı panelden kısılınca zaman aşımı erken düşer', async () => {
    const a = await newAccount();
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'sekme-1', worldId,
    });
    await h.db.execute(sql`
      UPDATE account_presence SET seen_at = now() - interval '30 seconds'
       WHERE account_id = ${a.accountId}
    `);

    // 90 sn varsayılanla hâlâ sahip.
    expect(await presence.holder(a.accountId)).not.toBeNull();

    setLiveSettings({ session: { claimGraceSeconds: 10 } });
    expect(await presence.holder(a.accountId)).toBeNull();
  });

  it('release YALNIZ kendi örneğini etkiler (devralınmışsa dokunmaz)', async () => {
    const a = await newAccount();
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'eski', worldId,
    });
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'yeni', worldId, force: true,
    });

    // Eski sekmenin soketi geç kopuyor ve bırakmaya çalışıyor — yeni sahibi DÜŞÜRMEMELİ.
    await presence.release(a.accountId, 'eski');
    expect((await presence.holder(a.accountId))?.instanceId).toBe('yeni');
  });

  /**
   * ⭐ BU TEST BİR HATADAN DOĞDU (tarayıcı ölçümü, 2026-08-03).
   *
   * `release` satırı DOĞRUDAN SİLİYORDU. Oyuncu «Bu cihazda devam et» deyince sayfa
   * yenileniyor, yenileme soketi koparıyor, kopuş sahipliği siliyor ve çakışma modalında
   * 10 saniyede bir yoklayan RAKİP sekme onu anında kapıyordu → devralma geri tepiyor,
   * oyun öteki sekmeye dönüyordu.
   */
  it('⭐ soket kopunca sahiplik HEMEN düşmez (sayfa yenilemesi devralmayı geri tepmemeli)', async () => {
    const a = await newAccount();
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'devralan', worldId,
    });

    await presence.release(a.accountId, 'devralan');   // sayfa yenilendi, soket koptu

    // Rakip sekme yoklaması: sahiplik HÂLÂ devralanda olmalı.
    expect((await presence.holder(a.accountId))?.instanceId).toBe('devralan');
    const rakip = await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'rakip', worldId,
    });
    expect(rakip.ok).toBe(false);

    // Aynı örnek (yenilenen sayfa) sahipliği sorunsuz geri alır.
    const geri = await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'devralan', worldId,
    });
    expect(geri.ok).toBe(true);
  });

  it('releaseNow (çıkış) sahipliği ANINDA serbest bırakır', async () => {
    const a = await newAccount();
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'cikan', worldId,
    });
    await presence.releaseNow(a.accountId, 'cikan');
    expect(await presence.holder(a.accountId)).toBeNull();
  });

  it('tarayıcı gerçekten kapanırsa sahiplik ~20 sn içinde serbest kalır', async () => {
    const a = await newAccount();
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'kapanan', worldId,
    });
    await presence.release(a.accountId, 'kapanan');

    // Yumuşak bırakma damgayı `grace − 20 sn` geriye çekiyor → 21 sn sonra süresi dolmuş olur.
    await h.db.execute(sql`
      UPDATE account_presence SET seen_at = seen_at - interval '21 seconds'
       WHERE account_id = ${a.accountId}
    `);
    expect(await presence.holder(a.accountId)).toBeNull();
  });

  it('iki AYRI hesap birbirini etkilemez', async () => {
    const a = await newAccount();
    const b = await newAccount();
    expect((await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'x', worldId,
    })).ok).toBe(true);
    expect((await presence.claim({
      accountId: b.accountId, sessionId: b.sessionId, instanceId: 'x', worldId,
    })).ok).toBe(true);
  });

  it('touch sahiplik damgasını ilerletir', async () => {
    const a = await newAccount();
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'sekme-1', worldId,
    });
    await h.db.execute(sql`
      UPDATE account_presence SET seen_at = now() - interval '60 seconds'
       WHERE account_id = ${a.accountId}
    `);
    const once = (await presence.holder(a.accountId))!.seenAt;

    await presence.touch(a.accountId, 'sekme-1');
    const sonra = (await presence.holder(a.accountId))!.seenAt;
    expect(Date.parse(sonra)).toBeGreaterThan(Date.parse(once));
  });
});

/**
 * ⭐ DEV MUAFİYETİ — kullanıcının açık şartı:
 * *"Altyapı hazır olsun ama çalıştığını onayladıktan sonra sadece prod ortamında aktif olsun.
 * Çünkü hem sen tarayıcıdan kontrol ederken ben de kendi tarayıcım üzerinden açık olabiliyorum."*
 */
describe('zorlama kapısı', () => {
  it('geliştirmede ayar AÇIK olsa bile uygulanmaz', () => {
    setLiveSettings({ session: { singleDevice: true } });
    expect(process.env['NODE_ENV']).not.toBe('production');
    expect(singleDeviceEnforced()).toBe(false);
  });

  it('üretimde ayar KAPALIYSA uygulanmaz (panelden açılana kadar sessiz)', () => {
    const before = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      setLiveSettings({ session: { singleDevice: false } });
      expect(singleDeviceEnforced()).toBe(false);
      setLiveSettings({ session: { singleDevice: true } });
      expect(singleDeviceEnforced()).toBe(true);
    } finally {
      if (before === undefined) delete process.env['NODE_ENV'];
      else process.env['NODE_ENV'] = before;
    }
  });

  it('SINGLE_SESSION_FORCE dev\'de sınamayı açar', () => {
    setLiveSettings({});
    expect(singleDeviceEnforced()).toBe(false);
    process.env['SINGLE_SESSION_FORCE'] = '1';
    expect(singleDeviceEnforced()).toBe(true);
  });
});
