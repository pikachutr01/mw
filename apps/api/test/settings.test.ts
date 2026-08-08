/**
 * ⭐ AYAR ALTYAPISI (admin Faz 1).
 *
 * En önemli vaka **sorgu sayacı**: kullanıcının katalog fazını onaylarken sorduğu soru
 * *"bu değerleri veri tabanına alırsan oyun her seferinde oradan okuyup ek yük oluşturacak
 * mı?"* idi. Cevabımız "hayır, bellekten okunur" — bu dosya o cevabı **ölçüyor**. Kanıt
 * olmadan Faz 5 (katalog) açılmayacak.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS, SETTINGS_BY_KEY, applySettings, validatePatch } from '@mobilwar/settings';
import type { DbHandle } from '../src/db/client.ts';
import { chatLimits } from '../src/chat/chat.limits.ts';
import { mailLimits } from '../src/mail/mail.limits.ts';
import { notifyLimits } from '../src/notify/notify.limits.ts';
import { liveNumberFor } from '../src/settings/live.ts';
import { DEFAULT_WORLD, SettingsError, SettingsService } from '../src/settings/settings.service.ts';
import { placementConfig } from '../src/world/placement.service.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let svc: SettingsService;
let worldId: number;

beforeAll(async () => { h = await setupTestDb(); }, 60_000);
afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  await h.db.execute(sql`DELETE FROM settings`);
  svc = new SettingsService(h.db);
  await svc.load();
});

describe('şema', () => {
  it('her anahtar `grup.alan` biçiminde ve tekil', () => {
    const seen = new Set<string>();
    for (const def of SETTINGS) {
      // ⚠️ TAM BİR NOKTA — `key.split('.')` iki parça bekleyen iki yer var (bkz. paket testi).
      expect(def.key.split('.').length, `${def.key}: tam bir nokta olmalı`).toBe(2);
      expect(def.key, def.key).toMatch(/^[a-zA-Z]+\.[a-zA-Z0-9_:]+$/);
      expect(seen.has(def.key), `tekrar eden anahtar: ${def.key}`).toBe(false);
      seen.add(def.key);
    }
  });

  it('sayısal ayarların varsayılanı kendi aralığında', () => {
    for (const def of SETTINGS) {
      if (def.type === 'boolean') continue;
      const v = def.default as number;
      if (def.min != null) expect(v, def.key).toBeGreaterThanOrEqual(def.min);
      if (def.max != null) expect(v, def.key).toBeLessThanOrEqual(def.max);
    }
  });

  it('doğrulama: bilinmeyen anahtar, aralık dışı ve kesirli değer reddedilir', () => {
    expect(validatePatch({ 'yok.boyle': 1 }).issues).toHaveLength(1);
    expect(validatePatch({ 'chat.burst': 0 }).issues).toHaveLength(1);          // min 1
    expect(validatePatch({ 'chat.burst': 5.5 }).issues).toHaveLength(1);        // tam sayı
    expect(validatePatch({ 'chat.burst': 7 }).issues).toHaveLength(0);
  });

  /** ⚠️ `int` alanda kesirli değer sessizce yuvarlanmaz — "5,5 yazdım 5 oldu" sürprizi olmasın. */
  it('kesirli değer YUVARLANMAZ, reddedilir', () => {
    const { values, issues } = validatePatch({ 'chat.perSeconds': 10.4 });
    expect(values['chat.perSeconds']).toBeUndefined();
    expect(issues[0]?.message).toContain('Tam sayı');
  });
});

describe('katman sırası', () => {
  it('varsayılan → env → dünya 0 → dünya (sonraki öncekini ezer)', () => {
    const def = SETTINGS_BY_KEY['chat.burst']!;
    expect(applySettings([]).effective['chat']?.['burst']).toBe(def.default);
    expect(applySettings([], { CHAT_RATE_BURST: '7' }).effective['chat']?.['burst']).toBe(7);
    // ⚠️ DB env'i EZER: panelden kaydedilen değer sunucu yeniden başlayınca geri alınmamalı.
    expect(applySettings([{ 'chat.burst': 9 }], { CHAT_RATE_BURST: '7' })
      .effective['chat']?.['burst']).toBe(9);
    // dünya katmanı dünya 0'ı ezer
    expect(applySettings([{ 'chat.burst': 9 }, { 'chat.burst': 11 }])
      .effective['chat']?.['burst']).toBe(11);
  });

  it('bozuk satır SESSİZCE atlanır (açılış düşmez)', () => {
    const out = applySettings([{ 'chat.burst': 'saçma' as never }]);
    expect(out.effective['chat']?.['burst']).toBe(SETTINGS_BY_KEY['chat.burst']!.default);
  });

  it('özet içerik değişince değişir, sıra değişince DEĞİŞMEZ', () => {
    const a = applySettings([{ 'chat.burst': 9, 'chat.pageSize': 40 }]);
    const b = applySettings([{ 'chat.pageSize': 40, 'chat.burst': 9 }]);
    const c = applySettings([{ 'chat.burst': 10, 'chat.pageSize': 40 }]);
    expect(b.hash).toBe(a.hash);
    expect(c.hash).not.toBe(a.hash);
  });

  it('etkin nesne DONMUŞ (paylaşılan durum yanlışlıkla yazılamasın)', () => {
    const eff = applySettings([]).effective;
    expect(Object.isFrozen(eff)).toBe(true);
    expect(Object.isFrozen(eff['chat'])).toBe(true);
  });
});

describe('servis: yazma ve okuma', () => {
  it('dünya bazlı geçersiz kılma: bir dünya değişince diğeri etkilenmez', async () => {
    const other = freshWorldId();
    await createWorld(h, other);

    await svc.update({ worldId, patch: { 'chat.burst': 3 }, actorId: null });

    expect(svc.group(worldId, 'chat')['burst']).toBe(3);
    expect(svc.group(other, 'chat')['burst']).toBe(SETTINGS_BY_KEY['chat.burst']!.default);
  });

  it('dünya 0 TÜM dünyalara varsayılan olur, dünya kendi değeriyle ezer', async () => {
    await svc.update({ worldId: DEFAULT_WORLD, patch: { 'chat.burst': 8 }, actorId: null });
    expect(svc.group(worldId, 'chat')['burst']).toBe(8);

    await svc.update({ worldId, patch: { 'chat.burst': 2 }, actorId: null });
    expect(svc.group(worldId, 'chat')['burst']).toBe(2);
    expect(svc.group(DEFAULT_WORLD, 'chat')['burst']).toBe(8);
  });

  it('revizyon yazılır ve DEĞİŞENLERİ taşır', async () => {
    const res = await svc.update({
      worldId, patch: { 'chat.burst': 4, 'chat.pageSize': 50 }, actorId: null,
    });
    expect(res.changed.sort()).toEqual(['chat.burst', 'chat.pageSize']);

    const [rev] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT hash, changed, snapshot FROM settings_revisions WHERE id = ${res.revisionId}
    `);
    expect(String(rev!['hash'])).toBe(res.hash);
    expect(rev!['changed']).toEqual(['chat.burst', 'chat.pageSize']);
    // ⚠️ Anlık görüntü TAMAMINI taşır (yalnız değişeni değil): revizyona bakan kişi "o an her
    // şey neydi" sorusunu ikinci bir sorgu yapmadan cevaplayabilmeli.
    expect((rev!['snapshot'] as Record<string, unknown>)['mail']).toBeDefined();
  });

  it('geçersiz yama HİÇBİR ŞEY yazmaz (kısmi kabul yok)', async () => {
    await expect(svc.update({
      worldId, patch: { 'chat.burst': 4, 'chat.perSeconds': -1 }, actorId: null,
    })).rejects.toBeInstanceOf(SettingsError);

    const rows = await h.db.execute(sql`SELECT 1 FROM settings WHERE world_id = ${worldId}`);
    expect(rows).toHaveLength(0);
  });

  it('reset satırı siler, değer varsayılana döner', async () => {
    await svc.update({ worldId, patch: { 'chat.burst': 4 }, actorId: null });
    expect(svc.group(worldId, 'chat')['burst']).toBe(4);
    await svc.reset(worldId, ['chat.burst']);
    expect(svc.group(worldId, 'chat')['burst']).toBe(SETTINGS_BY_KEY['chat.burst']!.default);
  });

  it('overridden yalnız varsayılandan SAPANLARI listeler', async () => {
    expect(svc.overridden(worldId)).toHaveLength(0);
    await svc.update({ worldId, patch: { 'chat.burst': 4 }, actorId: null });
    expect(svc.overridden(worldId)).toEqual(['chat.burst']);
  });
});

describe('⭐ SICAK YOLDA SORGU YOK', () => {
  /**
   * ⭐⭐ BU TURUN ASIL TESLİMATI.
   *
   * `postgres.js` bağlantısının `execute`'unu sarıp sayıyoruz. İddia: yükleme bittikten sonra
   * binlerce ayar okuması **tek bir sorgu bile** üretmez. Kırılırsa sıcak yola I/O sızmış
   * demektir ve bu, katalog fazının (Faz 5) dayandığı varsayımın çökmesi olur.
   */
  it('yüklemeden sonra 1000 okuma = 0 sorgu', async () => {
    await svc.update({ worldId, patch: { 'chat.burst': 6 }, actorId: null });

    let queries = 0;
    const original = h.db.execute.bind(h.db);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (h.db as any).execute = (...args: unknown[]) => {
      queries += 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (original as any)(...args);
    };

    try {
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += Number(svc.group(worldId, 'chat')['burst']);
        sum += Number(svc.snapshot(worldId).effective['mail']?.['dailyPerIp']);
        sum += chatLimits().burst + notifyLimits().maxFailures + mailLimits().dailyPerAccount;
      }
      expect(sum).toBeGreaterThan(0);          // okuma gerçekten yapıldı
      expect(queries, 'sıcak yolda sorgu sızdı').toBe(0);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (h.db as any).execute = original;
    }
  });

  it('ilk `snapshot` çağrısı da sorgu yapmaz (yalnız `load` yapar)', async () => {
    const fresh = new SettingsService(h.db);
    await fresh.load();

    let queries = 0;
    const original = h.db.execute.bind(h.db);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (h.db as any).execute = (...args: unknown[]) => {
      queries += 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (original as any)(...args);
    };
    try {
      fresh.snapshot(worldId);                 // ilk kez — önbellek boş
      fresh.snapshot(worldId);                 // ikinci kez — önbellekten
      expect(queries).toBe(0);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (h.db as any).execute = original;
    }
  });
});

describe('canlı limit köprüsü', () => {
  /**
   * `chatLimits()` gibi modül seviyesi okuyucular `worldId` bilmeyen yerlerde de çağrılıyor
   * (`mail/templates.ts`), bu yüzden **dünya 0** katmanından besleniyorlar. Bu test o kablonun
   * gerçekten bağlı olduğunu ölçüyor — bağlı olmasaydı panel değeri yazar, oyun okumazdı.
   */
  it('dünya 0 ayarı `chatLimits()`e yansır', async () => {
    expect(chatLimits().burst).toBe(SETTINGS_BY_KEY['chat.burst']!.default);
    await svc.update({ worldId: DEFAULT_WORLD, patch: { 'chat.burst': 2 }, actorId: null });
    expect(chatLimits().burst).toBe(2);
    await svc.reset(DEFAULT_WORLD, ['chat.burst']);
    expect(chatLimits().burst).toBe(SETTINGS_BY_KEY['chat.burst']!.default);
  });

  it('bildirim ve posta okuyucuları da bağlı', async () => {
    await svc.update({
      worldId: DEFAULT_WORLD,
      patch: { 'notify.maxFailures': 9, 'mail.dailyPerIp': 42 },
      actorId: null,
    });
    expect(notifyLimits().maxFailures).toBe(9);
    expect(mailLimits().dailyPerIp).toBe(42);
    await svc.reset(DEFAULT_WORLD, ['notify.maxFailures', 'mail.dailyPerIp']);
  });
});

/**
 * ⭐⭐ PANELİN YAZDIĞI KATMAN OKUNUYOR MU? (2026-08-08)
 *
 * ⚠️⚠️ **Bu bloğun var olma sebebi, yukarıdaki testlerin hepsinin `DEFAULT_WORLD`e yazması.**
 * Panel ise `worldId: 1`'e yazıyor (`apps/admin/src/App.tsx` — sabit). İki taraf ayrı ayrı
 * doğruydu ve test takımı ikisinin ARASINDAKİ boşluğu hiç görmüyordu: panelden değiştirilen
 * her `liveNumber` ayarı sessizce etkisiz kalıyordu.
 *
 * Kullanıcı bunu canlıda buldu: *"saldırı puan farkı sınırını 0 yapmama rağmen engellenmeye
 * devam ediyorum."* Yerel veri tabanında kayıt gerçekten duruyordu —
 * `world_id = 1 · combat.attackScoreRatio = 0` — ama okuyucu dünya 0'a bakıyordu.
 *
 * Bu yüzden testler artık **panelin yaptığını yapıyor**: dünya 0'a değil, gerçek bir dünyaya
 * yazıyor.
 */
describe('⭐ dünya bazlı ayar köprüsü (panelin yazdığı katman)', () => {
  it('⭐ dünyaya yazılan ayar `liveNumberFor` ile okunur', async () => {
    expect(liveNumberFor(worldId, 'combat', 'attackScoreRatio', 10)).toBe(10);

    await svc.update({ worldId, patch: { 'combat.attackScoreRatio': 0 }, actorId: null });
    expect(liveNumberFor(worldId, 'combat', 'attackScoreRatio', 10)).toBe(0);

    // Varsayılana dönünce kural da geri gelmeli.
    await svc.reset(worldId, ['combat.attackScoreRatio']);
    expect(liveNumberFor(worldId, 'combat', 'attackScoreRatio', 10)).toBe(10);
  });

  /** ⚠️ Dünya ayarı BAŞKA dünyaya sızmamalı — katman sırasının kendi anlamı bu. */
  it('bir dünyanın ayarı diğerine sızmaz', async () => {
    const other = freshWorldId();
    await createWorld(h, other);
    await svc.update({ worldId, patch: { 'combat.attackScoreRatio': 3 }, actorId: null });

    expect(liveNumberFor(worldId, 'combat', 'attackScoreRatio', 10)).toBe(3);
    expect(liveNumberFor(other, 'combat', 'attackScoreRatio', 10)).toBe(10);
  });

  /** Dünya katmanı yoksa dünya 0'a (kurulum geneli) düşer — düşüş zincirinin orta halkası. */
  it('dünya katmanı yoksa dünya 0 değeri kullanılır', async () => {
    await svc.update({ worldId: DEFAULT_WORLD, patch: { 'combat.attackScoreRatio': 4 }, actorId: null });
    expect(liveNumberFor(worldId, 'combat', 'attackScoreRatio', 10)).toBe(4);

    // Dünyanın kendi değeri varsa O kazanır.
    await svc.update({ worldId, patch: { 'combat.attackScoreRatio': 7 }, actorId: null });
    expect(liveNumberFor(worldId, 'combat', 'attackScoreRatio', 7)).toBe(7);
    await svc.reset(DEFAULT_WORLD, ['combat.attackScoreRatio']);
  });

  /**
   * ⭐ Yerleşim ayarları da aynı köprüden okunuyor ve aynı kör noktadaydı (13 düğme).
   * Onlar için de panelin yaptığı yolu ölçüyoruz.
   */
  it('⭐ yerleşim ayarları da dünya katmanından okunur', async () => {
    expect(placementConfig(worldId).capitalQuota).toBe(5);
    await svc.update({ worldId, patch: { 'placement.capitalQuota': 2 }, actorId: null });
    expect(placementConfig(worldId).capitalQuota).toBe(2);
    await svc.reset(worldId, ['placement.capitalQuota']);
  });
});
