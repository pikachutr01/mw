/**
 * ⭐⭐ SOHBET KURALI ONAYI (H1, kullanıcı 2026-08-21: *"DM ve ittifak sohbetinde ilk mesajdan
 * önce kural onayı"*).
 *
 * ─ ⚠️ BU DOSYANIN AYIRDIĞI ŞEY ───────────────────────────────────────────────────────────
 * İki ayrı kapı var ve karıştırılmamalı:
 *   • KURAL ONAYI (bu dosya, göç 0052) → GÖNDERENİ tutuyor. Yazamazsın, okursun.
 *   • MESAJ İSTEĞİ (`chat-request.test.ts`, göç 0053) → ALICIYI koruyor. Kabul edene kadar
 *     gelen mesajları görmezsin.
 * Aşağıdaki «okuyabiliyor» testi tam da bu ayrımı kilitliyor: isteği kabul etmiş ama
 * kuralları onaylamamış bir oyuncu OKUR, YAZAMAZ.
 *
 * ─ ⚠️ İKİ KAPSAM, İKİ TABLO ──────────────────────────────────────────────────────────────
 * DM onayı **yazışma başına** (`chat_participants.terms_version`), ittifak onayı **oyun
 * başına** (`players.chat_terms_version`). Testler ikisinin birbirine karışmadığını da
 * ölçüyor: bir DM'yi onaylamak ittifak sohbetini açmıyor, tersi de değil.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChatError, ChatService } from '../src/chat/chat.service.ts';
import { CHAT_TERMS, CHAT_TERMS_VERSION, termsAccepted } from '../src/chat/chat.terms.ts';
import { CHAT_TERMS_CODE } from '../src/chat/chat.guards.ts';
import { setLiveSettings } from '../src/settings/live.ts';
import type { DbHandle } from '../src/db/client.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let chat: ChatService;
let ali: number;
let veli: number;

beforeAll(async () => {
  h = await setupTestDb();
  chat = new ChatService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  ali = await createPlayer(h, worldId, 'ali');
  veli = await createPlayer(h, worldId, 'veli');
  // Acemi kısıtı bu dosyanın konusu değil; oyuncular yaşlandırılıyor.
  await h.db.execute(sql`
    UPDATE players SET created_at = now() - interval '30 days' WHERE world_id = ${worldId}
  `);
});

afterEach(() => { setLiveSettings({}); });

const gonder = (from: number, channelId: number): Promise<unknown> => chat.send({
  worldId, playerId: from, channelId, body: 'merhaba dünya', clientMsgId: randomUUID(),
});

async function kanal(): Promise<number> {
  return chat.openConversation({ worldId, playerId: ali, withPlayerId: veli });
}

describe('kapı kapatılabiliyor — acil vana', () => {
  /**
   * ⚠️⚠️ Varsayılan 2026-08-22'de AÇIĞA alındı (kullanıcı: *"web sürüm de uygulama da henüz
   * herkese tam anlamıyla yayınlanmış değil, hepsi test sürecinde"*). Kapatma yolu yine de
   * duruyor ve bu test onu kilitliyor: bir aksaklıkta sohbeti tamamen kapatmak yerine
   * yalnız kapıyı kaldırmak gerekebilir.
   */
  it('⭐⭐ ayar kapatılınca onaysız da gönderilebiliyor', async () => {
    setLiveSettings({ chat: { termsRequired: false } });
    const ch = await kanal();
    await expect(gonder(ali, ch)).resolves.toBeTruthy();
  });
});

describe('kapı açıkken — özel mesaj (varsayılan)', () => {

  it('⭐⭐ onaylamayan yazamıyor ve kod `terms_required`', async () => {
    const ch = await kanal();
    await expect(gonder(ali, ch)).rejects.toMatchObject({ code: CHAT_TERMS_CODE });
  });

  it('⭐ onaylayan yazabiliyor', async () => {
    const ch = await kanal();
    await h.db.execute(sql`
      UPDATE chat_participants SET terms_version = ${CHAT_TERMS_VERSION}
       WHERE channel_id = ${ch} AND player_id = ${ali}
    `);
    await expect(gonder(ali, ch)).resolves.toBeTruthy();
  });

  /**
   * ⚠️⚠️ ONAY YAZIŞMA BAŞINA: kullanıcının şartı buydu. Bir kişiyle yazışmayı onaylamak
   * başkasıyla yazışmayı açmamalı.
   */
  it('⭐⭐ bir yazışmadaki onay DİĞERİNİ açmıyor', async () => {
    const ayse = await createPlayer(h, worldId, 'ayse');
    await h.db.execute(sql`
      UPDATE players SET created_at = now() - interval '30 days' WHERE id = ${ayse}
    `);
    const ch1 = await kanal();
    await h.db.execute(sql`
      UPDATE chat_participants SET terms_version = ${CHAT_TERMS_VERSION}
       WHERE channel_id = ${ch1} AND player_id = ${ali}
    `);

    const ch2 = await chat.openConversation({
      worldId, playerId: ali, withPlayerId: ayse,
    });
    await expect(gonder(ali, ch1)).resolves.toBeTruthy();
    await expect(gonder(ali, ch2)).rejects.toMatchObject({ code: CHAT_TERMS_CODE });
  });

  /**
   * ⚠️ ONAY YÖNLÜ: Ali'nin onayı Veli'yi yazar yapmıyor. İkisi ayrı katılımcı satırı.
   */
  it('⭐ karşı tarafın onayı beni yazar yapmıyor', async () => {
    const ch = await kanal();
    await h.db.execute(sql`
      UPDATE chat_participants SET terms_version = ${CHAT_TERMS_VERSION}
       WHERE channel_id = ${ch} AND player_id = ${ali}
    `);
    await expect(gonder(veli, ch)).rejects.toMatchObject({ code: CHAT_TERMS_CODE });
  });

  /**
   * ⚠️⚠️ SÜRÜM ARTINCA YENİDEN SORULUYOR. Eski sürümü onaylamış olmak yetmiyor; metnin
   * anlamı değiştiyse kabul de yenilenmeli.
   */
  it('⭐⭐ eski sürüm onayı yetmiyor', async () => {
    const ch = await kanal();
    await h.db.execute(sql`
      UPDATE chat_participants SET terms_version = ${CHAT_TERMS_VERSION - 1}
       WHERE channel_id = ${ch} AND player_id = ${ali}
    `);
    await expect(gonder(ali, ch)).rejects.toMatchObject({ code: CHAT_TERMS_CODE });
  });

  /**
   * ⭐⭐ İKİ KAPININ AYRIMI. Kural onayı YAZMAYI tutuyor, okumayı değil; okumayı tutan şey
   * mesaj isteği (göç 0053) ve o ayrı bir kabul. Veli isteği kabul etmiş ama kuralları
   * onaylamamış: okuyabilmeli, yazamamalı.
   *
   * ⚠️ §verify kapısı da aynı ayrımı kuruyor: doğrulanmamış hesap yazamaz, okur.
   */
  it('⭐⭐ kural onayı YAZMAYI tutuyor, OKUMAYI değil', async () => {
    const ch = await kanal();
    await h.db.execute(sql`
      UPDATE chat_participants SET terms_version = ${CHAT_TERMS_VERSION}
       WHERE channel_id = ${ch} AND player_id = ${ali}
    `);
    await gonder(ali, ch);

    // Veli isteği kabul ediyor ama kural sürümü 0 kalıyor.
    await h.db.execute(sql`
      UPDATE chat_participants SET dm_accepted_at = now()
       WHERE channel_id = ${ch} AND player_id = ${veli}
    `);
    const sayfa = await chat.history({ worldId, playerId: veli, channelId: ch, limit: 20 });
    expect(sayfa.items.length).toBeGreaterThan(0);
    await expect(gonder(veli, ch)).rejects.toMatchObject({ code: CHAT_TERMS_CODE });
  });
});

describe('kural metni', () => {
  /** ⚠️ `0` "hiç onaylanmadı" demek; gerçek sürümler 1'den başlamalı. */
  it('⭐ sürüm sıfırdan büyük', () => {
    expect(CHAT_TERMS_VERSION).toBeGreaterThan(0);
    expect(CHAT_TERMS.version).toBe(CHAT_TERMS_VERSION);
  });

  /** ⚠️ `>=`, `==` DEĞİL: sürüm ileride geri alınırsa kimse yeniden sorulmasın. */
  it('⭐ ileri sürüm de kabul sayılıyor', () => {
    expect(termsAccepted(CHAT_TERMS_VERSION + 5)).toBe(true);
    expect(termsAccepted(CHAT_TERMS_VERSION)).toBe(true);
    expect(termsAccepted(CHAT_TERMS_VERSION - 1)).toBe(false);
    expect(termsAccepted(0)).toBe(false);
    expect(termsAccepted(null)).toBe(false);
  });

  it('metin boş değil ve maddeleri var', () => {
    expect(CHAT_TERMS.title.trim()).not.toBe('');
    expect(CHAT_TERMS.intro.trim()).not.toBe('');
    expect(CHAT_TERMS.items.length).toBeGreaterThanOrEqual(4);
    for (const madde of CHAT_TERMS.items) expect(madde.trim()).not.toBe('');
  });

  /** ⚠️ Oyuncuya görünen metinde tire/çizgi yok (depo yazım kuralı). */
  it('⭐ metinde tire yok', () => {
    const hepsi = [CHAT_TERMS.title, CHAT_TERMS.intro, CHAT_TERMS.confirmLabel,
      ...CHAT_TERMS.items].join(' ');
    expect(hepsi).not.toMatch(/[–—]/);
    // Tek başına duran kısa çizgi de yasak; `e-posta` gibi kelime içi tire serbest.
    expect(hepsi).not.toMatch(/\s-\s/);
  });
});

/** `ChatError` gerçekten fırlatılıyor mu — tip düzeyinde de doğrulanıyor. */
describe('hata tipi', () => {
  it('ChatError örneği', async () => {
    setLiveSettings({ chat: { termsRequired: true } });
    const ch = await kanal();
    await expect(gonder(ali, ch)).rejects.toBeInstanceOf(ChatError);
  });
});
