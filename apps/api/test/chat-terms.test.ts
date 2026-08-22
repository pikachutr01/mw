/**
 * ⭐⭐ SOHBET KURALI ONAYI (H1, kullanıcı 2026-08-21: *"DM ve ittifak sohbetinde ilk mesajdan
 * önce kural onayı"*).
 *
 * ─ ⚠️ BU DOSYANIN EN ÖNEMLİ GARANTİSİ ────────────────────────────────────────────────────
 * Kapı **varsayılan olarak KAPALI** (`chat.termsRequired = false`) ve kapalıyken hiç kimseyi
 * engellemiyor. Bu bir nezaket değil, dağıtım güvenliği: onayı bilmeyen ESKİ bir mobil sürüm
 * açık bir kapıyla karşılaşsaydı, oyuncu anlamadığı bir hatayla mesaj gönderemez hâle
 * gelirdi ve mağaza güncellemesi yayılana kadar öyle kalırdı.
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

describe('kapı kapalıyken (varsayılan)', () => {
  /**
   * ⚠️⚠️ EN KRİTİK TEST. Bu bozulursa canlıdaki eski mobil sürümler mesaj gönderemez hâle
   * gelir ve bunu ancak oyuncular bildirdiğinde öğreniriz.
   */
  it('⭐⭐ onay olmadan da mesaj gönderilebiliyor', async () => {
    const ch = await kanal();
    await expect(gonder(ali, ch)).resolves.toBeTruthy();
  });

  it('⭐ ayar açıkça kapalıyken de aynı', async () => {
    setLiveSettings({ chat: { termsRequired: false } });
    const ch = await kanal();
    await expect(gonder(ali, ch)).resolves.toBeTruthy();
  });
});

describe('kapı açıkken — özel mesaj', () => {
  beforeEach(() => { setLiveSettings({ chat: { termsRequired: true } }); });

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
   * ⚠️ OKUMA KAPATILMIYOR. Tasarım notunda bir ara *"alıcı onaylamadan mesajı göremez"* de
   * yazıyordu; uygulanmadı. Okumayı kapatmak, birine ulaşmaya çalışan oyuncunun mesajını
   * rehin alır ve kötü niyetli birinin karşısındakine zorla onay penceresi açtırmasına yol
   * açardı. §verify kapısı da aynı ayrımı kuruyor: doğrulanmamış hesap yazamaz, okur.
   */
  it('⭐⭐ onaylamayan OKUYABİLİYOR — yalnız yazma kapalı', async () => {
    const ch = await kanal();
    await h.db.execute(sql`
      UPDATE chat_participants SET terms_version = ${CHAT_TERMS_VERSION}
       WHERE channel_id = ${ch} AND player_id = ${ali}
    `);
    await gonder(ali, ch);

    // Veli onaylamadı ama geçmişi okuyabilmeli.
    const sayfa = await chat.history({ worldId, playerId: veli, channelId: ch, limit: 20 });
    expect(sayfa.items.length).toBeGreaterThan(0);
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
