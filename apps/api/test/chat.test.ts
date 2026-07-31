/**
 * ⭐ ÖZEL MESAJLAŞMA (DM) — sohbet çekirdeği (§13.12, kullanıcı tarifi 2026-07-31).
 *
 * Ölçülen davranışlar sırayla: kanal tekilliği · DÜNYA YALITIMI · engelleme (iki yön iki
 * sonuç) · rate limit + mükerrer · idempotency · TEK TARAFLI silme ve yeniden görünme ·
 * okunmamış sayacı · acemi kısıtı (cevap hakkı saklı) · şikayet kaydı · keyset sayfalama.
 *
 * Servis SAF: controller olmadan test edilir (alliance.test.ts deseni).
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChatError, ChatService } from '../src/chat/chat.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let chat: ChatService;

let ali: number;
let veli: number;
let ayse: number;

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
  ayse = await createPlayer(h, worldId, 'ayse');
  // Oyuncular varsayılan olarak "yeni" doğar → acemi kısıtı testleri dışında yaşlandırılır.
  await h.db.execute(sql`
    UPDATE players SET created_at = now() - interval '30 days' WHERE world_id = ${worldId}
  `);
});

/** Kanalı açıp tek mesaj gönderen kısayol. */
async function say(from: number, to: number, body: string): Promise<{ channelId: number; id: number }> {
  const channelId = await chat.openConversation({ worldId, playerId: from, withPlayerId: to });
  const m = await chat.send({ worldId, playerId: from, channelId, body, clientMsgId: randomUUID() });
  return { channelId, id: m.id };
}

describe('kanal açma', () => {
  it('⭐ iki yönde TEK kanal — kim açarsa açsın aynı satır', async () => {
    const a = await chat.openConversation({ worldId, playerId: ali, withPlayerId: veli });
    const b = await chat.openConversation({ worldId, playerId: veli, withPlayerId: ali });
    expect(a).toBe(b);

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM chat_channels WHERE world_id = ${worldId} AND kind = 'dm'
    `);
    expect(Number(rows[0]!['n'])).toBe(1);
  });

  it('iki katılımcı satırı yazılır', async () => {
    const id = await chat.openConversation({ worldId, playerId: ali, withPlayerId: veli });
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT player_id FROM chat_participants WHERE channel_id = ${id} ORDER BY player_id
    `);
    expect(rows.map((r) => Number(r['player_id']))).toEqual([ali, veli].sort((x, y) => x - y));
  });

  it('kendine kanal açılamaz', async () => {
    await expect(chat.openConversation({ worldId, playerId: ali, withPlayerId: ali }))
      .rejects.toMatchObject({ code: 'self_message' });
  });

  /**
   * ⭐ DÜNYA YALITIMI (§13.12.1b) — `dm_key` PLAYER id'lerinden üretiliyor ve kanal `world_id`
   * taşıyor. Başka dünyadaki oyuncu "yok" muamelesi görür: varlığı bile sızmaz.
   */
  it('⭐ BAŞKA DÜNYADAKİ oyuncuyla kanal açılamaz', async () => {
    const otherWorld = freshWorldId();
    await createWorld(h, otherWorld);
    const yabanci = await createPlayer(h, otherWorld, 'yabanci');

    await expect(chat.openConversation({ worldId, playerId: ali, withPlayerId: yabanci }))
      .rejects.toMatchObject({ code: 'wrong_world' });
  });
});

describe('mesaj gönderme', () => {
  it('mesaj yazılır, geçmişte görünür, gönderene okunmamış saymaz', async () => {
    const { channelId } = await say(ali, veli, 'selam');

    const hist = await chat.history({ worldId, playerId: veli, channelId });
    expect(hist.items).toHaveLength(1);
    expect(hist.items[0]!.body).toBe('selam');

    const mine = await chat.conversations({ worldId, playerId: ali });
    expect(mine[0]!.unreadCount).toBe(0);          // kendi mesajım rozet üretmez
    const theirs = await chat.conversations({ worldId, playerId: veli });
    expect(theirs[0]!.unreadCount).toBe(1);
    expect(theirs[0]!.lastMessage).toBe('selam');
    expect(theirs[0]!.lastFromMe).toBe(false);
  });

  it('⭐ clientMsgId idempotency — aynı anahtarla ikinci gönderim ÇİFT satır yazmaz', async () => {
    const channelId = await chat.openConversation({ worldId, playerId: ali, withPlayerId: veli });
    const key = randomUUID();
    const first = await chat.send({ worldId, playerId: ali, channelId, body: 'tekrar', clientMsgId: key });
    const second = await chat.send({ worldId, playerId: ali, channelId, body: 'tekrar', clientMsgId: key });

    expect(second.id).toBe(first.id);
    const hist = await chat.history({ worldId, playerId: veli, channelId });
    expect(hist.items).toHaveLength(1);
  });

  it('katılımcı olmayan yazamaz', async () => {
    const { channelId } = await say(ali, veli, 'gizli');
    await expect(chat.send({
      worldId, playerId: ayse, channelId, body: 'araya girdim', clientMsgId: randomUUID(),
    })).rejects.toMatchObject({ code: 'not_a_member' });
  });

  it('500 karakterden uzun mesaj reddedilir', async () => {
    const channelId = await chat.openConversation({ worldId, playerId: ali, withPlayerId: veli });
    await expect(chat.send({
      worldId, playerId: ali, channelId, body: 'x'.repeat(501), clientMsgId: randomUUID(),
    })).rejects.toMatchObject({ code: 'too_long' });
  });

  it('outbox olayı İKİ tarafı da tanımlar ama GÖVDE taşımaz (yalnız önizleme)', async () => {
    await say(ali, veli, 'a'.repeat(200));
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT payload FROM outbox WHERE world_id = ${worldId} AND topic = 'chat:dm'
    `);
    const p = row!['payload'] as Record<string, unknown>;
    expect(Number(p['senderId'])).toBe(ali);
    expect(Number(p['recipientId'])).toBe(veli);
    expect(String(p['preview']).length).toBeLessThanOrEqual(80);
  });
});

/**
 * ⭐ ENGELLEME — TEK YÖNLÜ + AÇIK UYARI (kullanıcı kararı 2026-07-31).
 * Engellenen sebebi ÖĞRENMEZ ("Mesajınız iletilemedi!"); engelleyen kendi kararını zaten
 * bildiği için ona sebep AÇIKÇA söylenir. İkisi ayrı hata kodu taşır.
 */
describe('engelleme', () => {
  it('⭐ engellenen yazamaz ve SEBEBİ öğrenmez', async () => {
    const { channelId } = await say(ali, veli, 'merhaba');
    await chat.block({ worldId, playerId: ali, targetId: veli });

    const err = await chat.send({
      worldId, playerId: veli, channelId, body: 'cevap', clientMsgId: randomUUID(),
    }).catch((e: unknown) => e as ChatError);
    expect(err).toBeInstanceOf(ChatError);
    expect((err as ChatError).code).toBe('blocked');
    expect((err as ChatError).message).toBe('Mesajınız iletilemedi!');
    // ⚠️ "engelledi" kelimesi engellenene ASLA sızmaz.
    expect((err as ChatError).message).not.toMatch(/engelle/i);
  });

  it('⭐ engelleyenin kendi kutusu da kapalı — ama sebep AÇIK', async () => {
    const { channelId } = await say(ali, veli, 'merhaba');
    await chat.block({ worldId, playerId: ali, targetId: veli });

    const err = await chat.send({
      worldId, playerId: ali, channelId, body: 'yine ben', clientMsgId: randomUUID(),
    }).catch((e: unknown) => e as ChatError);
    expect((err as ChatError).code).toBe('blocked_by_me');
    expect((err as ChatError).message).toMatch(/engelledin/i);
  });

  it('engel kalkınca yazışma sürer; sohbet listesinde bayrak düşer', async () => {
    const { channelId } = await say(ali, veli, 'merhaba');
    await chat.block({ worldId, playerId: ali, targetId: veli });
    expect((await chat.conversations({ worldId, playerId: ali }))[0]!.blocked).toBe(true);

    await chat.unblock({ playerId: ali, targetId: veli });
    expect((await chat.conversations({ worldId, playerId: ali }))[0]!.blocked).toBe(false);
    await expect(chat.send({
      worldId, playerId: veli, channelId, body: 'geri döndüm', clientMsgId: randomUUID(),
    })).resolves.toBeTruthy();
  });

  it('engelleme BAŞKA sohbeti etkilemez (kısıt yalnız o çifte)', async () => {
    await chat.block({ worldId, playerId: ali, targetId: veli });
    await expect(say(ayse, ali, 'ben başkasıyım')).resolves.toBeTruthy();
  });
});

describe('flood koruması', () => {
  it('⭐ kova: kısa sürede çok mesaj reddedilir', async () => {
    const channelId = await chat.openConversation({ worldId, playerId: ali, withPlayerId: veli });
    for (let i = 0; i < 5; i++) {
      await chat.send({ worldId, playerId: ali, channelId, body: `mesaj ${i}`, clientMsgId: randomUUID() });
    }
    await expect(chat.send({
      worldId, playerId: ali, channelId, body: 'altıncı', clientMsgId: randomUUID(),
    })).rejects.toMatchObject({ code: 'rate_limited' });
  });

  /** `mesajlar.txt` kanıtı: rakip yapımda aynı satırın 5 kez üst üste gönderildiği örnekler var. */
  it('⭐ mükerrer mesaj: aynı metin kısa sürede tekrar gönderilemez', async () => {
    const channelId = await chat.openConversation({ worldId, playerId: ali, withPlayerId: veli });
    await chat.send({ worldId, playerId: ali, channelId, body: 'spam', clientMsgId: randomUUID() });
    await expect(chat.send({
      worldId, playerId: ali, channelId, body: 'spam', clientMsgId: randomUUID(),
    })).rejects.toMatchObject({ code: 'duplicate_message' });
  });
});

/**
 * ⭐ TEK TARAFLI SİLME (kullanıcı): karşı tarafta sohbet durur, sunucudan hiçbir şey silinmez.
 * Silen kişi yeni mesaj alınca sohbeti yeniden görür — ama YALNIZ yeni mesajları.
 */
describe('sohbeti silme', () => {
  it('⭐ silen için boşalır, karşı tarafta AYNEN durur, satırlar sunucuda kalır', async () => {
    const { channelId } = await say(ali, veli, 'eski mesaj');

    await chat.clearConversation({ worldId, playerId: veli, channelId });

    expect(await chat.conversations({ worldId, playerId: veli })).toHaveLength(0);
    expect((await chat.history({ worldId, playerId: veli, channelId })).items).toHaveLength(0);
    // Karşı taraf etkilenmez…
    expect((await chat.history({ worldId, playerId: ali, channelId })).items).toHaveLength(1);
    // …ve satır sunucuda duruyor (hukuki/moderasyon gerekçesi).
    const [n] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM chat_messages WHERE channel_id = ${channelId}
    `);
    expect(Number(n!['n'])).toBe(1);
  });

  it('⭐ yeni mesaj gelince sohbet yeniden görünür — ESKİLER gelmez', async () => {
    const { channelId } = await say(ali, veli, 'eski');
    await chat.clearConversation({ worldId, playerId: veli, channelId });

    await chat.send({ worldId, playerId: ali, channelId, body: 'yeni', clientMsgId: randomUUID() });

    const list = await chat.conversations({ worldId, playerId: veli });
    expect(list).toHaveLength(1);
    expect(list[0]!.lastMessage).toBe('yeni');
    const hist = await chat.history({ worldId, playerId: veli, channelId });
    expect(hist.items.map((m) => m.body)).toEqual(['yeni']);
  });

  it('⭐ okunmamış sohbeti silmek HAYALET rozet bırakmaz', async () => {
    const { channelId } = await say(ali, veli, 'okunmadı');
    expect((await chat.conversations({ worldId, playerId: veli }))[0]!.unreadCount).toBe(1);

    await chat.clearConversation({ worldId, playerId: veli, channelId });

    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT last_read_message_id, cleared_before_message_id FROM chat_participants
       WHERE channel_id = ${channelId} AND player_id = ${veli}
    `);
    expect(Number(p!['last_read_message_id'])).toBe(Number(p!['cleared_before_message_id']));
    expect(await chat.conversations({ worldId, playerId: veli })).toHaveLength(0);
  });

  it('iki taraf da silse kanal ve mesajlar SUNUCUDA kalır (bağ kopar, veri kalır)', async () => {
    const { channelId } = await say(ali, veli, 'ikimiz de sildik');
    await chat.clearConversation({ worldId, playerId: ali, channelId });
    await chat.clearConversation({ worldId, playerId: veli, channelId });

    expect(await chat.conversations({ worldId, playerId: ali })).toHaveLength(0);
    expect(await chat.conversations({ worldId, playerId: veli })).toHaveLength(0);
    const [n] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM chat_messages WHERE channel_id = ${channelId}
    `);
    expect(Number(n!['n'])).toBe(1);
  });
});

describe('okundu imleci', () => {
  it('markRead rozeti düşürür ve GERİ ALINMAZ (monoton)', async () => {
    const { channelId } = await say(ali, veli, 'bir');
    await chat.send({ worldId, playerId: ali, channelId, body: 'iki', clientMsgId: randomUUID() });
    expect((await chat.conversations({ worldId, playerId: veli }))[0]!.unreadCount).toBe(2);

    await chat.markRead({ worldId, playerId: veli, channelId });
    expect((await chat.conversations({ worldId, playerId: veli }))[0]!.unreadCount).toBe(0);

    // Geç gelen ikinci istek sayacı bozmaz.
    await chat.markRead({ worldId, playerId: veli, channelId });
    expect((await chat.conversations({ worldId, playerId: veli }))[0]!.unreadCount).toBe(0);
  });
});

/**
 * ⭐ ACEMİ KISITI (kullanıcı kararı: 12 saat) — yeni oyuncu YENİ konuşma başlatamaz ama
 * kendisine yazılana CEVAP VEREBİLİR (§13.12.4 "cevap hakkı saklı").
 */
describe('acemi kısıtı', () => {
  beforeEach(async () => {
    await h.db.execute(sql`UPDATE players SET created_at = now() WHERE id = ${ayse}`);
  });

  it('⭐ yeni oyuncu konuşma BAŞLATAMAZ', async () => {
    const channelId = await chat.openConversation({ worldId, playerId: ayse, withPlayerId: ali });
    await expect(chat.send({
      worldId, playerId: ayse, channelId, body: 'merhaba', clientMsgId: randomUUID(),
    })).rejects.toMatchObject({ code: 'dm_new_player_restricted' });
  });

  it('⭐ ama kendisine yazılana CEVAP verebilir', async () => {
    const { channelId } = await say(ali, ayse, 'hoş geldin');
    await expect(chat.send({
      worldId, playerId: ayse, channelId, body: 'teşekkürler', clientMsgId: randomUUID(),
    })).resolves.toBeTruthy();
  });
});

describe('şikayet', () => {
  it('mesaj şikayeti gövde KOPYASINI saklar (mesaj sonradan silinse de kanıt kalır)', async () => {
    const { channelId, id } = await say(ali, veli, 'kötü söz');
    await chat.report({
      worldId, playerId: veli, channelId, messageId: id, reason: 'abuse', note: 'hakaret',
    });

    const [r] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT reporter_id, reported_player_id, reason, body_snapshot, status
        FROM chat_reports WHERE channel_id = ${channelId}
    `);
    expect(Number(r!['reporter_id'])).toBe(veli);
    expect(Number(r!['reported_player_id'])).toBe(ali);
    expect(String(r!['body_snapshot'])).toBe('kötü söz');
    expect(String(r!['status'])).toBe('open');
  });

  it('aynı mesaj iki kez şikayet edilemez; oyuncu şikayeti mesajsız da olur', async () => {
    const { channelId, id } = await say(ali, veli, 'tekrar');
    await chat.report({ worldId, playerId: veli, channelId, messageId: id, reason: 'spam' });
    await chat.report({ worldId, playerId: veli, channelId, messageId: id, reason: 'spam' });
    await chat.report({ worldId, playerId: veli, channelId, reason: 'other' });

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT message_id FROM chat_reports WHERE channel_id = ${channelId}
    `);
    expect(rows).toHaveLength(2);   // 1 mesaj şikayeti + 1 oyuncu şikayeti
  });
});

describe('geçmiş sayfalama (keyset)', () => {
  it('⭐ before imleciyle eski mesajlar gelir, hasMore doğru', async () => {
    const channelId = await chat.openConversation({ worldId, playerId: ali, withPlayerId: veli });
    // Kova ve mükerrer engeline takılmadan 8 mesaj: doğrudan DB'ye.
    for (let i = 1; i <= 8; i++) {
      await h.db.execute(sql`
        INSERT INTO chat_messages (channel_id, world_id, sender_id, body)
        VALUES (${channelId}, ${worldId}, ${ali}, ${`mesaj ${i}`})
      `);
    }

    const first = await chat.history({ worldId, playerId: veli, channelId, limit: 5 });
    expect(first.items).toHaveLength(5);
    expect(first.hasMore).toBe(true);
    expect(first.items[0]!.body).toBe('mesaj 8');          // en yeni önce

    const older = await chat.history({
      worldId, playerId: veli, channelId, limit: 5, before: first.items[4]!.id,
    });
    expect(older.items.map((m) => m.body)).toEqual(['mesaj 3', 'mesaj 2', 'mesaj 1']);
    expect(older.hasMore).toBe(false);
  });
});
