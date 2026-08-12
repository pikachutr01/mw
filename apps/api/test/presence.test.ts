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
import {
  PresenceService, releaseRevokedPresence, singleDeviceEnforced,
} from '../src/auth/presence.service.ts';
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
  delete process.env['SINGLE_SESSION_OFF'];
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
 * ⭐⭐ OTURUM İPTALİ SAHİPLİĞİ DE DÜŞÜRÜR (2026-08-12).
 *
 * ⚠️ Kural açılırken bulunan gerçek boşluk: `sessions` iptali satırı SİLMİYOR, yalnız
 * `revoked_at` yazıyor → `account_presence`in FK CASCADE'i tetiklenmiyor → sahiplik
 * `claimGraceSeconds` (90 sn) boyunca asılı kalıyordu. En kötüsü, tam da hesabını geri almaya
 * çalışan oyuncuyu vuruyordu.
 */
describe('⭐⭐ iptal edilen oturumun sahipliği', () => {
  it('⭐⭐⭐ «tüm oturumları düşür» sahipliği de bırakır (parola değişimi senaryosu)', async () => {
    const a = await newAccount();
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'saldirgan', worldId,
    });
    expect(await presence.holder(a.accountId)).not.toBeNull();

    // Oyuncu parolasını değiştirdi → tüm oturumlar düşer.
    await auth.revokeAllIds(a.accountId);

    // ⭐ Asıl ölçüm: sahiplik ANINDA boş — oyuncu 90 saniye beklemek zorunda değil.
    expect(await presence.holder(a.accountId)).toBeNull();
  });

  it('GEÇERLİ oturumun sahipliğine dokunulmaz', async () => {
    const a = await newAccount();
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'sekme-1', worldId,
    });
    await releaseRevokedPresence(h.db, a.accountId);
    expect((await presence.holder(a.accountId))?.instanceId).toBe('sekme-1');
  });

  it('çıkış (logout) da sahipliği bırakır', async () => {
    const a = await newAccount();
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId, instanceId: 'sekme-1', worldId,
    });
    await auth.logout(a.sessionId);
    expect(await presence.holder(a.accountId)).toBeNull();
  });
});

/**
 * ⭐⭐ MOBİL (FLUTTER) SÖZLEŞMESİ — `instanceId` neden KALICI olmalı.
 *
 * Bu iki test bir davranışı değil bir **tasarım kararını** kilitliyor. Flutter uygulaması
 * `instanceId`i her açılışta yeniden üretirse (bellekte tutarsa), aşağıdaki ikinci testin
 * anlattığı duvara çarpar: mobil uygulamalar sürekli öldürülüp açıldığı için oyuncu, her
 * yeniden açılışta ~90 saniye **kendi hesabına** giremez — üstelik ekranda "hesabın başka bir
 * cihazda açık" yazar. Kalıcı kimlikle bu hiç yaşanmaz.
 */
describe('⭐⭐ mobil: instanceId kalıcı olmalı', () => {
  it('⭐ KALICI kimlik: uygulama yeniden açılınca sahiplik anında geri alınır', async () => {
    const a = await newAccount();
    const kurulumKimligi = 'flutter-kurulum-abc';
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId,
      instanceId: kurulumKimligi, worldId, platform: 'android',
    });

    // Uygulama öldürüldü ve yeniden açıldı — AYNI kalıcı kimlikle geliyor.
    const tekrar = await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId,
      instanceId: kurulumKimligi, worldId, platform: 'android',
    });
    expect(tekrar.ok, 'kalıcı kimlik kendini asla kilitlemez').toBe(true);
  });

  /** ⚠️ Yanlış uygulamanın bedeli — yapılmaması gerekenin kanıtı. */
  it('⚠️ HER AÇILIŞTA YENİ kimlik üretilirse oyuncu KENDİ hesabından kilitlenir', async () => {
    const a = await newAccount();
    await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId,
      instanceId: 'acilis-1', worldId, platform: 'android',
    });

    const yenidenAcilis = await presence.claim({
      accountId: a.accountId, sessionId: a.sessionId,
      instanceId: 'acilis-2', worldId, platform: 'android',
    });

    expect(yenidenAcilis.ok, 'yeni kimlik, taze sahibe takılır').toBe(false);
    if (!yenidenAcilis.ok) expect(yenidenAcilis.holder.instanceId).toBe('acilis-1');
  });
});

/**
 * ⭐⭐ ZORLAMA KAPISI — 2026-08-12'de YENİDEN YAZILDI.
 *
 * ⚠️⚠️ **Bu blokun eski hâli, kuralın hiç çalışmamasını KİLİTLEYEN testti.** Üç test vardı ve
 * üçü de doğru çalışıyordu; ölçtükleri davranış yanlıştı:
 *   • *"geliştirmede ayar AÇIK olsa bile uygulanmaz"* — yani kural dev'de hiç denenemez,
 *   • *"üretimde ayar KAPALIYSA uygulanmaz"* — varsayılan kapalı olduğu için hiç açılmadı.
 * İkisi birleşince kural yalnız üretimde doğrulanabiliyordu ve kimse doğrulanmamış bir kuralı
 * üretimde açmadı. Testler yeşildi, kural ölüydü — **yeşil test, doğru davranışın kanıtı değil.**
 *
 * Yeni iddia tek cümle: **kapı ortamı değil YALNIZ anahtarı bilir.**
 */
describe('⭐⭐ zorlama kapısı', () => {
  it('⭐ varsayılan AÇIK — hiç ayar yazılmamışken bile kural işler', () => {
    setLiveSettings({});
    expect(singleDeviceEnforced()).toBe(true);
  });

  it('⭐ panelden kapatılabilir / açılabilir', () => {
    setLiveSettings({ session: { singleDevice: false } });
    expect(singleDeviceEnforced()).toBe(false);
    setLiveSettings({ session: { singleDevice: true } });
    expect(singleDeviceEnforced()).toBe(true);
  });

  /**
   * ⭐⭐⭐ ASIL REGRESYON TESTİ. Ortam artık karara GİRMEZ; `NODE_ENV`i ne yaparsak yapalım
   * sonuç yalnız anahtardan gelmeli. Eski kod bu testte iki satırda birden kırılır.
   */
  it('⭐⭐⭐ NODE_ENV karara girmez — dev ile prod aynı sonucu verir', () => {
    const before = process.env['NODE_ENV'];
    try {
      setLiveSettings({ session: { singleDevice: true } });
      for (const env of ['development', 'test', 'production']) {
        process.env['NODE_ENV'] = env;
        expect(singleDeviceEnforced(), `${env}: açıkken uygulanmalı`).toBe(true);
      }
      setLiveSettings({ session: { singleDevice: false } });
      for (const env of ['development', 'test', 'production']) {
        process.env['NODE_ENV'] = env;
        expect(singleDeviceEnforced(), `${env}: kapalıyken uygulanmamalı`).toBe(false);
      }
    } finally {
      if (before === undefined) delete process.env['NODE_ENV'];
      else process.env['NODE_ENV'] = before;
    }
  });

  /** Acil vana: panel erişilemezken süreç değişkeniyle kapatılabilmeli. */
  it('SINGLE_SESSION_OFF=1 anahtarı EZER', () => {
    setLiveSettings({ session: { singleDevice: true } });
    process.env['SINGLE_SESSION_OFF'] = '1';
    try {
      expect(singleDeviceEnforced()).toBe(false);
    } finally {
      delete process.env['SINGLE_SESSION_OFF'];
    }
  });
});
