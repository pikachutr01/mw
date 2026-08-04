/**
 * ⭐ KAYIT RİSKİ (§9.1.7) — kullanıcının iki notu: geçici e-posta tespiti + bot engelleme.
 *
 * ⚠️ Bu dosyanın asıl derdi **yanlış birleştirme**. Normalizasyon iki farklı insanı aynı posta
 * kutusunda gösterirse yönetici hatalı karar verir — ve bu, hiç tespit yapmamaktan kötüdür.
 * Bu yüzden nokta temizliği yalnız Gmail ailesinde; başka sağlayıcılarda `a.b@` ile `ab@`
 * gerçekten FARKLI kişiler.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EmailRiskService, normalizeEmail } from '../src/abuse/email-risk.service.ts';
import { setLiveSettings } from '../src/settings/live.ts';
import type { DbHandle } from '../src/db/client.ts';
import { setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let svc: EmailRiskService;

beforeAll(async () => {
  h = await setupTestDb();
  svc = new EmailRiskService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

/** ⚠️ Referans tablolar koşular arasında yaşıyor; her test kendi zeminini kuruyor. */
beforeEach(async () => {
  await h.db.execute(sql`DELETE FROM disposable_domains`);
  await h.db.execute(sql`DELETE FROM disposable_meta`);
});

afterEach(() => { setLiveSettings({}); });

const account = async (email: string, ip: string | null, createdAt?: string): Promise<number> => {
  const n = normalizeEmail(email);
  const [row] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO accounts (email, password_hash, email_normalized, signup_ip, created_at)
    VALUES (${email}, 'x', ${n?.normalized ?? null}, ${ip},
            COALESCE(${createdAt ?? null}::timestamptz, now()))
    RETURNING id
  `);
  return Number(row!['id']);
};

/** Aynı kutuyu iki testin paylaşmaması için her koşuda benzersiz yerel kısım. */
const uniq = (): string => randomUUID().slice(0, 8);

describe('posta kutusu normalizasyonu', () => {
  /**
   * ⭐ ASIL AÇIK BURASI. Üçü de aynı kutuya düşer, üçü de doğrulama postasını alır ve bugüne
   * kadar üçü de ayrı hesap sayılıyordu — yani "e-posta doğrulaması çoklu hesabı zorlaştırır"
   * varsayımı hiçbir geçici servise ihtiyaç duymadan deliniyordu.
   */
  it('Gmail: nokta ve +etiket aynı kutuya iner', () => {
    const box = normalizeEmail('ahmet@gmail.com')!.normalized;
    expect(normalizeEmail('ah.met@gmail.com')!.normalized).toBe(box);
    expect(normalizeEmail('a.h.m.e.t@gmail.com')!.normalized).toBe(box);
    expect(normalizeEmail('ahmet+oyun@gmail.com')!.normalized).toBe(box);
    expect(normalizeEmail('ah.met+2@gmail.com')!.normalized).toBe(box);
    expect(normalizeEmail('AHMET@GMAIL.COM')!.normalized).toBe(box);
  });

  it('googlemail.com gmail.com ile aynı kutu', () => {
    expect(normalizeEmail('ahmet@googlemail.com')!.normalized)
      .toBe(normalizeEmail('ahmet@gmail.com')!.normalized);
  });

  /**
   * ⚠️ **EN ÖNEMLİ YANLIŞ POZİTİF SAVUNMASI.** Çoğu sağlayıcıda `a.b@` ile `ab@` FARKLI
   * kişilerdir. Nokta temizliğini genel kural yapsaydık iki yabancıyı aynı posta kutusunda
   * gösterir ve yöneticiyi hatalı karara sürüklerdik.
   */
  it('Gmail DIŞINDA nokta anlamlıdır — birleştirilmez', () => {
    expect(normalizeEmail('a.b@hotmail.com')!.normalized)
      .not.toBe(normalizeEmail('ab@hotmail.com')!.normalized);
    expect(normalizeEmail('a.b@sirket.com.tr')!.normalized)
      .not.toBe(normalizeEmail('ab@sirket.com.tr')!.normalized);
  });

  /** `+etiket` neredeyse tüm sağlayıcılarda aynı kutuya düşüyor; orada genel kural doğru. */
  it('+etiket her sağlayıcıda temizlenir', () => {
    expect(normalizeEmail('ahmet+x@hotmail.com')!.normalized)
      .toBe(normalizeEmail('ahmet@hotmail.com')!.normalized);
  });

  it('bozuk adres null döner, çökertmez', () => {
    for (const bad of ['', 'abc', '@x.com', 'a@', 'a@b']) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });

  /** ⚠️ `+etiket@` yerel kısmı boşaltıyor; boş kutu kimliği üretmek her şeyi birleştirirdi. */
  it('yalnız etiketten oluşan yerel kısım boş kutu üretmez', () => {
    const n = normalizeEmail('+etiket@gmail.com');
    expect(n?.normalized).toBe('+etiket@gmail.com');
  });
});

describe('geçici e-posta alanı', () => {
  it('listedeki alan yakalanır, listede olmayan yakalanmaz', async () => {
    await svc.refresh({ url: 'test://fixture', text: '# yorum\nmailinator.com\n\ntempmail.io\n' });
    expect(await svc.isDisposable('mailinator.com')).toBe(true);
    expect(await svc.isDisposable('gmail.com')).toBe(false);
  });

  it('yorum ve boş satırlar alan olarak saklanmaz', async () => {
    const n = await svc.refresh({ url: 'test://fixture', text: '# başlık\n\nmailinator.com\nx\n' });
    // 'x' nokta içermiyor → alan değil; yorum ve boş satır da elenmeli.
    expect(n).toBe(1);
  });

  /** ⚠️ Yarım/boş yükleme "hiçbir alan geçici değil" gibi SESSİZ ve yanlış bir sonuç üretirdi. */
  it('boş liste tabloyu bozmaz', async () => {
    await svc.refresh({ url: 'test://fixture', text: 'mailinator.com\n' });
    await expect(svc.refresh({ text: '\n# yalnız yorum\n' })).rejects.toThrow();
    expect(await svc.isDisposable('mailinator.com')).toBe(true);
  });

  it('liste yüklenmemişken arama çökmez', async () => {
    expect(await svc.isDisposable('mailinator.com')).toBe(false);
  });
});

describe('kayıt riski', () => {
  it('aynı posta kutusundaki mevcut hesapları sayar', async () => {
    const local = uniq();
    await account(`${local}@gmail.com`, '51.0.0.1');
    await account(`${local}+2@gmail.com`, '51.0.0.1');

    const risk = await svc.assess(`${local.split('').join('.')}@gmail.com`, '51.0.0.1');
    expect(risk.sameMailbox).toBe(2);
  });

  it('geçici alan işaretlenir ama varsayılanda ENGELLENMEZ', async () => {
    await svc.refresh({ url: 'test://fixture', text: 'mailinator.com\n' });
    const risk = await svc.assess(`${uniq()}@mailinator.com`, '51.9.9.9');
    expect(risk.disposable).toBe(true);
    // ⚠️ Varsayılan tespit, engelleme değil: karar yöneticinin (§9.1.1).
    expect(risk.block).toBeNull();
  });

  it('ayar açıkken geçici alan engellenir', async () => {
    await svc.refresh({ url: 'test://fixture', text: 'mailinator.com\n' });
    setLiveSettings({ abuse: { blockDisposableEmail: true } });
    const risk = await svc.assess(`${uniq()}@mailinator.com`, '51.9.9.9');
    expect(risk.block).toBe('disposable_email');
  });

  /**
   * ⭐ BOT KORUMASI ENGELLİYOR, işaretlemiyor: saniyede hesap açan bir betiği "yönetici
   * baksın" diye geçirmek, korumayı hiç yazmamakla aynı şey.
   */
  it('aynı /24 ağdan sınırı aşan kayıt engellenir', async () => {
    setLiveSettings({ abuse: { signupMaxPerBlock: 3, signupWindowMinutes: 60 } });
    const block = `51.${Math.floor(Math.random() * 200) + 20}.7`;
    for (let i = 0; i < 3; i += 1) await account(`${uniq()}@gmail.com`, `${block}.${i + 1}`);

    const risk = await svc.assess(`${uniq()}@gmail.com`, `${block}.99`);
    expect(risk.recentFromBlock).toBe(3);
    expect(risk.block).toBe('signup_flood');
  });

  /** ⚠️ Pencere dışındaki kayıtlar sayılmamalı; yoksa sınır zamanla kalıcı bir duvara döner. */
  it('pencere dışındaki eski kayıtlar sayılmaz', async () => {
    setLiveSettings({ abuse: { signupMaxPerBlock: 2, signupWindowMinutes: 60 } });
    const block = `51.${Math.floor(Math.random() * 200) + 20}.8`;
    for (let i = 0; i < 5; i += 1) {
      await account(`${uniq()}@gmail.com`, `${block}.${i + 1}`, '2026-01-01T00:00:00Z');
    }
    const risk = await svc.assess(`${uniq()}@gmail.com`, `${block}.99`);
    expect(risk.recentFromBlock).toBe(0);
    expect(risk.block).toBeNull();
  });

  /** ⚠️ Farklı ağdan gelen kayıt, başka bir ağın yığınından etkilenmemeli. */
  it('başka /24 ağdaki yığın bu kaydı etkilemez', async () => {
    setLiveSettings({ abuse: { signupMaxPerBlock: 2, signupWindowMinutes: 60 } });
    const busy = `51.${Math.floor(Math.random() * 200) + 20}.9`;
    for (let i = 0; i < 4; i += 1) await account(`${uniq()}@gmail.com`, `${busy}.${i + 1}`);

    const risk = await svc.assess(`${uniq()}@gmail.com`, '203.0.113.5');
    expect(risk.recentFromBlock).toBe(0);
    expect(risk.block).toBeNull();
  });

  /**
   * ⭐ **YEREL/ÖZEL ADRESLER SEL SINIRINDAN MUAF** ve bu bir konfor değil, EMNİYET.
   *
   * ⚠️ Muafiyet olmasaydı iki şey olurdu: (1) geliştirmede herkes `127.0.0.1`den gelir ve
   * sınır ilk beş kayıttan sonra tüm ortamı kilitlerdi; (2) canlıda ters vekil zinciri
   * bozulursa tüm oyuncular tek bir adres gibi görünür ve **kayıt tamamen dururdu** — bozuk
   * bir sinyal yüzünden bir kesinti. Özel adres görmek "IP kimseyi temsil etmiyor" demektir.
   */
  it('özel/yerel adresler sel sınırından muaf', async () => {
    setLiveSettings({ abuse: { signupMaxPerBlock: 2, signupWindowMinutes: 60 } });
    for (let i = 0; i < 6; i += 1) await account(`${uniq()}@gmail.com`, `10.0.0.${i + 1}`);
    for (let i = 0; i < 6; i += 1) await account(`${uniq()}@gmail.com`, '127.0.0.1');

    expect((await svc.assess(`${uniq()}@gmail.com`, '10.0.0.99')).block).toBeNull();
    expect((await svc.assess(`${uniq()}@gmail.com`, '127.0.0.1')).block).toBeNull();
    expect((await svc.assess(`${uniq()}@gmail.com`, '192.168.1.5')).block).toBeNull();
  });

  it('IP yoksa hız sinyali üretilmez, kayıt akmaya devam eder', async () => {
    const risk = await svc.assess(`${uniq()}@gmail.com`, null);
    expect(risk.recentFromBlock).toBe(0);
    expect(risk.block).toBeNull();
  });
});
