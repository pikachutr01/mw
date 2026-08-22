/**
 * ⭐ MODERASYON (admin Faz 6).
 *
 * Fazın çekirdeği tek cümle: **`chat_bans` artık ölü değil.** Tablo 2026-07-31'e kadar
 * yazılabiliyordu ama `chat.service`te tek satır kontrol yoktu — yani panelden ban verilse
 * bile oyuncu mesaj yazmaya devam ediyordu. Buradaki ilk grup o boşluğun kapandığını ölçüyor.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChatError, ChatService } from '../src/chat/chat.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb, acceptChatTerms } from './helpers/db.ts';

let h: DbHandle;
let chat: ChatService;
let worldId: number;
let alice: number;
let bob: number;

const msg = (): string => randomUUID();

beforeAll(async () => {
  h = await setupTestDb();
  chat = new ChatService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  alice = await createPlayer(h, worldId, 'alice');
  bob = await createPlayer(h, worldId, 'bob');
  /**
   * ⚠️ Oyuncular YAŞLANDIRILIYOR: `chat.newPlayerHours` acemi kısıtı (12 sa) yeni oyuncunun
   * konuşma başlatmasını engelliyor ve testin ölçmek istediği şeyi (YASAK) gölgeliyordu.
   * `chat.test.ts` de aynı hazırlığı yapıyor.
   */
  await h.db.execute(sql`
    UPDATE players SET created_at = now() - interval '30 days' WHERE world_id = ${worldId}
  `);
});

/** Yasak satırı yaz (panelin `chat-ban` ucunun yaptığı işin çekirdeği). */
async function banPlayer(playerId: number, o: { days?: number; reason?: string } = {}): Promise<void> {
  const until = o.days == null ? null : new Date(Date.now() + o.days * 86_400_000);
  await h.db.execute(sql`
    INSERT INTO chat_bans (world_id, player_id, scope, until, reason)
    VALUES (${worldId}, ${playerId}, 'all', ${until?.toISOString() ?? null}::timestamptz,
            ${o.reason ?? 'test'})
  `);
}

const send = (from: number, channelId: number): Promise<unknown> =>
  chat.send({ worldId, playerId: from, channelId, body: 'selam', clientMsgId: msg() });

/* ═══ Yasak gerçekten işliyor mu ════════════════════════════════════════════ */

describe('sohbet yasağı', () => {
  it('yasaksız oyuncu mesaj gönderebilir (temel doğru)', async () => {
    const ch = await chat.openConversation({ worldId, playerId: alice, withPlayerId: bob });
    await acceptChatTerms(h, ch);
    await expect(send(alice, ch)).resolves.toBeTruthy();
  });

  /** ⭐ Fazın asıl iddiası. Bu test kırılırsa ban yine kâğıt üstünde kalmış demektir. */
  it('⭐ yasaklı oyuncu mesaj GÖNDEREMEZ', async () => {
    const ch = await chat.openConversation({ worldId, playerId: alice, withPlayerId: bob });
    await acceptChatTerms(h, ch);
    await banPlayer(alice, { reason: 'spam' });

    const err = await send(alice, ch).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(ChatError);
    expect((err as ChatError).code).toBe('chat_banned');
    // Sebep oyuncuya söylenir: "neden yazamıyorum" sorusu destek kuyruğuna düşmesin.
    expect((err as ChatError).message).toContain('spam');
  });

  /**
   * ⚠️ Yasak **kimseye** yazmayı kapatır (kullanıcı kararı: *"kimseye mesaj yazamayacak"*),
   * yalnız şikayet edene değil.
   */
  it('yasak KİMSEYE yazmayı kapatır, tek kişiye değil', async () => {
    const carol = await createPlayer(h, worldId, 'carol');
    await h.db.execute(sql`UPDATE players SET created_at = now() - interval '30 days' WHERE id = ${carol}`);
    const toBob = await chat.openConversation({ worldId, playerId: alice, withPlayerId: bob });
    await acceptChatTerms(h, toBob);
    const toCarol = await chat.openConversation({ worldId, playerId: alice, withPlayerId: carol });
    await acceptChatTerms(h, toCarol);
    await banPlayer(alice);

    await expect(send(alice, toBob)).rejects.toThrow(ChatError);
    await expect(send(alice, toCarol)).rejects.toThrow(ChatError);
  });

  /**
   * ⭐ Yasaklı oyuncu **OKUMAYA devam eder** ve kendisine yazılabilir. Okumayı da kapatsaydık
   * ceza "sohbetten silinmek" olurdu; oyuncu kendisine ne yazıldığını göremezdi.
   */
  it('yasaklı oyuncuya yazılabilir ve o okumaya devam eder', async () => {
    const ch = await chat.openConversation({ worldId, playerId: alice, withPlayerId: bob });
    await acceptChatTerms(h, ch);
    await banPlayer(alice);

    await expect(send(bob, ch)).resolves.toBeTruthy();
    const history = await chat.history({ worldId, playerId: alice, channelId: ch });
    expect(history.items.length).toBeGreaterThan(0);
  });

  /** Yasak YENİ konuşma açmayı da kapatır — boş konuşma tek başına taciz aracı olurdu. */
  it('yasaklı oyuncu YENİ konuşma açamaz', async () => {
    const carol = await createPlayer(h, worldId, 'carol');
    await h.db.execute(sql`UPDATE players SET created_at = now() - interval '30 days' WHERE id = ${carol}`);
    await banPlayer(alice);
    await expect(chat.openConversation({ worldId, playerId: alice, withPlayerId: carol }))
      .rejects.toThrow(ChatError);
  });

  /**
   * ⭐⭐ KAPSAM YALITIMI (2026-08-10) — `chat_bans.scope` artık OKUNUYOR.
   *
   * Genel sohbetin kendi susturması `scope = 'global'` yazıyor. O kapsam özel mesajı da
   * kesseydi, sohbetin içinden verilen bir moderasyon kararı oyuncunun BÜTÜN yazışmalarını
   * kapatırdı — istenmeyen ve söylenmeyen bir ceza.
   *
   * ⚠️ Bu test kaldırılırsa `assertNotBanned`in `where` parametresi sessizce anlamsızlaşır:
   * kod derlenmeye devam eder, yalnız kapsam ayrımı ölür.
   */
  it('⭐⭐ `global` kapsamlı yasak ÖZEL MESAJI kapatmaz', async () => {
    const ch = await chat.openConversation({ worldId, playerId: alice, withPlayerId: bob });
    await acceptChatTerms(h, ch);
    await h.db.execute(sql`
      INSERT INTO chat_bans (world_id, player_id, scope, until, reason)
      VALUES (${worldId}, ${alice}, 'global', NULL, 'genel sohbette küfür')
    `);
    await expect(send(alice, ch)).resolves.toBeTruthy();
  });

  it('süresi GEÇMİŞ yasak etkisiz', async () => {
    const ch = await chat.openConversation({ worldId, playerId: alice, withPlayerId: bob });
    await acceptChatTerms(h, ch);
    await h.db.execute(sql`
      INSERT INTO chat_bans (world_id, player_id, scope, until, reason)
      VALUES (${worldId}, ${alice}, 'all', now() - interval '1 hour', 'eski')
    `);
    await expect(send(alice, ch)).resolves.toBeTruthy();
  });

  it('süresiz yasak (until NULL) sonsuza kadar geçerli', async () => {
    const ch = await chat.openConversation({ worldId, playerId: alice, withPlayerId: bob });
    await acceptChatTerms(h, ch);
    await banPlayer(alice);   // days yok → süresiz
    const err = await send(alice, ch).then(() => null, (e: unknown) => e);
    expect((err as ChatError).message).toContain('süresiz');
  });

  /** Yasak KARŞI tarafı bağlamaz. */
  it('yasak yalnız yasaklıyı bağlar', async () => {
    const ch = await chat.openConversation({ worldId, playerId: alice, withPlayerId: bob });
    await acceptChatTerms(h, ch);
    await banPlayer(alice);
    await expect(send(bob, ch)).resolves.toBeTruthy();
  });

  /**
   * ⚠️ Yasak dünya bazlı: `chat_bans.world_id` kontrol ediliyor. Aynı hesabın başka dünyadaki
   * oyuncusu ayrı bir `players` satırı olduğu için zaten ayrı; bu test kontrolün gerçekten
   * `world_id`yi süzdüğünü sabitliyor.
   */
  it('yasak DÜNYA bazlı', async () => {
    const ch = await chat.openConversation({ worldId, playerId: alice, withPlayerId: bob });
    await acceptChatTerms(h, ch);
    await h.db.execute(sql`
      INSERT INTO chat_bans (world_id, player_id, scope, until, reason)
      VALUES (${worldId + 1}, ${alice}, 'all', NULL, 'başka dünya')
    `);
    await expect(send(alice, ch)).resolves.toBeTruthy();
  });

  /**
   * ⚠️ Ağ tekrarı yasaktan ETKİLENMEZ: ban gelmeden önce yazılmış bir mesajın tekrarı
   * "yasaklısın" hatası almamalı — o mesaj zaten yazıldı, istemci yalnız cevabını kaçırdı.
   * Bu yüzden yasak kontrolü, yeniden-deneme kontrolünden SONRA duruyor.
   */
  it('yasaktan ÖNCE yazılmış mesajın ağ tekrarı hâlâ çalışır', async () => {
    const ch = await chat.openConversation({ worldId, playerId: alice, withPlayerId: bob });
    await acceptChatTerms(h, ch);
    const clientMsgId = msg();
    const first = await chat.send({
      worldId, playerId: alice, channelId: ch, body: 'ilk', clientMsgId,
    });
    await banPlayer(alice);

    const retry = await chat.send({
      worldId, playerId: alice, channelId: ch, body: 'ilk', clientMsgId,
    });
    expect(retry.id).toBe(first.id);
  });
});

/* ═══ HTTP eşlemesi ════════════════════════════════════════════════════════ */

describe('hata kodunun HTTP karşılığı', () => {
  /**
   * ⚠️ Yasak **403**, `blocked` ise bilerek **400**. İkisi de "mesaj gitmedi" ama biri açıkça
   * söylenen bir moderasyon kararı, diğeri gizlenmesi gereken bir engel: durum kodundan
   * "beni engellemiş" çıkarılabilmemeli. Canlı ölçümde yasak 400 dönüyordu; 400 "isteğin
   * bozuk" demek ve yanlıştı.
   */
  it('yasak 403, engel 400 döner', async () => {
    const { toHttp } = await import('../src/chat/chat.controller.ts');
    expect((toHttp(new ChatError('chat_banned', 'x')) as unknown as { getStatus(): number }).getStatus())
      .toBe(403);
    expect((toHttp(new ChatError('blocked', 'x')) as unknown as { getStatus(): number }).getStatus())
      .toBe(400);
  });
});

/* ═══ Yasağın kaldırılması ══════════════════════════════════════════════════ */

describe('yasağın kaldırılması', () => {
  /**
   * ⚠️ Panel yasağı SİLMİYOR, `until`i geçmişe çekiyor: moderasyon geçmişi kalıcı olmalı.
   * Silseydik "bu oyuncu daha önce ban yemiş miydi" sorusu cevapsız kalırdı.
   */
  it('kaldırma satırı SİLMEZ, süreyi geçmişe çeker', async () => {
    const ch = await chat.openConversation({ worldId, playerId: alice, withPlayerId: bob });
    await acceptChatTerms(h, ch);
    await banPlayer(alice, { reason: 'küfür' });
    await expect(send(alice, ch)).rejects.toThrow(ChatError);

    await h.db.execute(sql`
      UPDATE chat_bans SET until = now()
       WHERE player_id = ${alice} AND (until IS NULL OR until > now())
    `);

    await expect(send(alice, ch)).resolves.toBeTruthy();
    // Satır DURUYOR ve sebebi okunabilir.
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT reason FROM chat_bans WHERE player_id = ${alice}
    `);
    expect(rows).toHaveLength(1);
    expect(String(rows[0]!['reason'])).toBe('küfür');
  });

  /** Birden çok yasak varsa en güçlüsü (süresiz) kazanır. */
  it('süresiz yasak, süreli bir yasağın yanında etkisini korur', async () => {
    const ch = await chat.openConversation({ worldId, playerId: alice, withPlayerId: bob });
    await acceptChatTerms(h, ch);
    await banPlayer(alice, { days: 1, reason: 'kısa' });
    await banPlayer(alice, { reason: 'süresiz' });

    const err = await send(alice, ch).then(() => null, (e: unknown) => e);
    expect((err as ChatError).message).toContain('süresiz');
  });
});
