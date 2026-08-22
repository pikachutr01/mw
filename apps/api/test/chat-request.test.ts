/**
 * ⭐⭐ ÖZEL MESAJ İSTEĞİ (kullanıcı, 2026-08-22).
 *
 * *"Bir oyuncu başka bir oyuncuya ilk mesaj gönderdiğinde veya mesaj geçmişini sildikten
 * sonra ilk mesaj gönderdiğinde sohbet penceresini açınca karşı oyuncunun gönderdiği mesajı
 * anında görmesin. Pencerede «bu oyuncu sana mesaj göndermek istiyor, onaylıyor musun»
 * şeklinde bir soru çıksın."*
 *
 * ─ ⚠️ KURAL ONAYINDAN AYRI BİR ŞEY ───────────────────────────────────────────────────────
 * Kural onayı (göç 0052) GÖNDERENİ tutuyor: onaylamadan yazamazsın. Bu ise ALICIYI koruyor:
 * tanımadığın birinin mesajı sana zorla okutulmuyor. İki mekanizmanın birbirine karışmadığı
 * `chat-terms.test.ts`te ayrıca kilitli.
 *
 * ─ ⚠️ GÖVDE SIZMIYOR ─────────────────────────────────────────────────────────────────────
 * İstek künyesinde önizleme YOK: koruma tam olarak gövdeyi göstermemek üzerine kurulu.
 * Süzgeç SUNUCUDA çünkü istemcide "çizme" demek gövdeyi ağdan geçirmek olurdu.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChatService } from '../src/chat/chat.service.ts';
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
  await h.db.execute(sql`
    UPDATE players SET created_at = now() - interval '30 days' WHERE world_id = ${worldId}
  `);
});

/** Ali → Veli tek mesaj. Gönderen kural onayından geçiyor, ALICI hiçbir şey kabul etmiyor. */
async function aliYazar(body = 'merhaba'): Promise<number> {
  const channelId = await chat.openConversation({ worldId, playerId: ali, withPlayerId: veli });
  await chat.acceptConversation({ worldId, playerId: ali, channelId });
  await chat.send({ worldId, playerId: ali, channelId, body, clientMsgId: randomUUID() });
  return channelId;
}

describe('ilk mesaj', () => {
  /** ⚠️⚠️ İSTEĞİN TA KENDİSİ: alıcı gövdeyi görmüyor. */
  it('⭐⭐ alıcı mesajı GÖRMÜYOR, istek künyesi geliyor', async () => {
    const ch = await aliYazar('gizli kalmalı');
    const r = await chat.history({ worldId, playerId: veli, channelId: ch });

    expect(r.items).toEqual([]);
    expect(r.request).toBeDefined();
    expect(r.request!.fromPlayerId).toBe(ali);
    expect(r.request!.fromUsername).toContain('ali');
    expect(r.request!.count).toBe(1);
  });

  /** ⚠️ Gövde ya da önizleme SIZMAMALI: koruma tam olarak bunun üzerine kurulu. */
  it('⭐⭐ istek künyesinde gövde YOK', async () => {
    const ch = await aliYazar('gizli kalmalı');
    const r = await chat.history({ worldId, playerId: veli, channelId: ch });
    expect(JSON.stringify(r)).not.toContain('gizli kalmalı');
  });

  /** ⚠️ GÖNDEREN kendi mesajını görüyor: ona sormanın anlamı yok. */
  it('⭐ gönderen kendi yazışmasını normal görüyor', async () => {
    const ch = await aliYazar();
    const r = await chat.history({ worldId, playerId: ali, channelId: ch });
    expect(r.request).toBeUndefined();
    expect(r.items).toHaveLength(1);
  });

  it('⭐⭐ kabul edince mesajlar görünüyor', async () => {
    const ch = await aliYazar('merhaba');
    await chat.acceptConversation({ worldId, playerId: veli, channelId: ch });

    const r = await chat.history({ worldId, playerId: veli, channelId: ch });
    expect(r.request).toBeUndefined();
    expect(r.items.map((m) => m.body)).toEqual(['merhaba']);
  });

  /**
   * ⚠️⚠️ KABUL, KURAL ONAYINI DA KAPSIYOR (kullanıcı: *"alıcı kişi mesajı onay sürecinde de
   * benzer uyarı mesajlarını görsün"*). İstek penceresi kuralları gösteriyor; iki ayrı
   * pencerede iki kez onay tıklatmak, ikincisini okutmamanın en kestirme yolu olurdu.
   */
  it('⭐⭐ kabul eden AYNI ADIMDA yazabilir hâle geliyor', async () => {
    const ch = await aliYazar();
    await chat.acceptConversation({ worldId, playerId: veli, channelId: ch });
    await expect(chat.send({
      worldId, playerId: veli, channelId: ch, body: 'cevap veriyorum', clientMsgId: randomUUID(),
    })).resolves.toBeTruthy();
  });
});

describe('geçmişi silmek', () => {
  /**
   * ⭐⭐ Kullanıcının ikinci şartı: *"mesaj geçmişini sildikten sonra ilk mesaj
   * gönderdiğinde"* yeniden sorulmalı. Silmek yazışmayı bitirmek demek.
   */
  it('⭐⭐ silen oyuncuya YENİDEN soruluyor', async () => {
    const ch = await aliYazar('ilk');
    await chat.acceptConversation({ worldId, playerId: veli, channelId: ch });
    await chat.clearConversation({ worldId, playerId: veli, channelId: ch });

    await chat.send({ worldId, playerId: ali, channelId: ch, body: 'yeni', clientMsgId: randomUUID() });

    const r = await chat.history({ worldId, playerId: veli, channelId: ch });
    expect(r.items).toEqual([]);
    expect(r.request?.count).toBe(1);
  });

  /** ⚠️ Silmek KARŞI TARAFI etkilemiyor — tek taraflı silmenin kurulu davranışı. */
  it('⭐ silen ben olsam bile gönderen etkilenmiyor', async () => {
    const ch = await aliYazar('ilk');
    await chat.acceptConversation({ worldId, playerId: veli, channelId: ch });
    await chat.clearConversation({ worldId, playerId: veli, channelId: ch });

    const r = await chat.history({ worldId, playerId: ali, channelId: ch });
    expect(r.request).toBeUndefined();
    expect(r.items).toHaveLength(1);
  });
});

describe('kenar durumlar', () => {
  /**
   * ⚠️ Kanalı açan ama HENÜZ YAZMAYAN oyuncu için istek YOK: karşı tarafa "biri sana yazmak
   * istiyor" demek yalan olurdu.
   */
  it('⭐ mesaj yoksa istek de yok', async () => {
    const ch = await chat.openConversation({ worldId, playerId: ali, withPlayerId: veli });
    const r = await chat.history({ worldId, playerId: veli, channelId: ch });
    expect(r.request).toBeUndefined();
    expect(r.items).toEqual([]);
  });

  /** ⚠️ Birden çok bekleyen mesaj tek istekte toplanıyor; sayı doğru olmalı. */
  it('⭐ birden çok mesaj tek istek, sayı doğru', async () => {
    const ch = await aliYazar('bir');
    for (const b of ['iki', 'üç']) {
      await h.db.execute(sql`
        INSERT INTO chat_messages (channel_id, world_id, sender_id, body)
        VALUES (${ch}, ${worldId}, ${ali}, ${b})
      `);
    }
    const r = await chat.history({ worldId, playerId: veli, channelId: ch });
    expect(r.request?.count).toBe(3);
  });

  /** ⚠️ Kabul MONOTON: ikinci kez kabul etmek bir şeyi bozmamalı. */
  it('⭐ iki kez kabul etmek zararsız', async () => {
    const ch = await aliYazar();
    await chat.acceptConversation({ worldId, playerId: veli, channelId: ch });
    await chat.acceptConversation({ worldId, playerId: veli, channelId: ch });
    const r = await chat.history({ worldId, playerId: veli, channelId: ch });
    expect(r.items).toHaveLength(1);
  });

  /** ⚠️ Katılımcı olmayan kabul edemez — kapı `participant` üzerinden. */
  it('⭐ yabancı kabul edemiyor', async () => {
    const ayse = await createPlayer(h, worldId, 'ayse');
    const ch = await aliYazar();
    await expect(chat.acceptConversation({
      worldId, playerId: ayse, channelId: ch,
    })).rejects.toMatchObject({ code: 'not_a_member' });
  });
});
