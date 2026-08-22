/**
 * ⭐ ÖZEL MESAJLAŞMA — DM çekirdeği (§13.12, kullanıcı tarifi 2026-07-31).
 *
 * Oyunun eski "mesaj kutusu" mantığı DEĞİL, **sohbet uygulaması** mantığı: iki oyuncu arasında
 * tek kanal, balonlar, WS ile anlık.
 *
 * ÜÇ DEĞİŞMEZ:
 *  1. **DÜNYA YALITIMI** (§13.12.1b): `dm_key` PLAYER id'lerinden üretilir (hesap id'sinden
 *     ASLA) ve kanal `world_id` taşır → aynı hesabın iki dünyadaki oyuncusu yazışamaz.
 *     `world_id` her zaman JWT'den gelir, istek gövdesinden değil.
 *  2. **MESAJ SİLİNMEZ** (kullanıcı): tek mesaj silme yok; "sohbeti sil" yalnız o oyuncunun
 *     görünür penceresini kapatır (`cleared_before_message_id`). İki taraf da silse satırlar
 *     sunucuda kalır — ileride bir anlaşmazlıkta / hukuki gereklilikte lazım olur.
 *  3. **ENGELLEME TEK YÖNLÜ + AÇIK UYARI** (kullanıcı kararı): A, B'yi engellerse B → A
 *     yazamaz ve sebebini ÖĞRENMEZ (`blocked` → "Mesajınız iletilemedi!"). A'nın kendi yazma
 *     kutusu da kapanır ama A **sebebi görür** (`blocked_by_me`) — kendi verdiği kararı zaten
 *     biliyor, ona yalan söylemeye gerek yok. Engel dışında hiçbir oyun kısıtı doğurmaz.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { chatLimits } from './chat.limits.ts';
import {
  assertChatTermsAccepted, assertFlowOk, assertNotBanned, assertVerifiedToChat, findRetry,
  insertMessage, ChatError, type Tx,
} from './chat.guards.ts';

/**
 * ⚠️ Yeniden dışa aktarılıyor: `chat.controller.ts` ve testler `ChatError`ı buradan import
 * ediyor. Sınıfın kendisi `chat.guards.ts`e taşındı (ittifak sohbeti de kullanıyor) ama
 * bu kapı açık kalmalı — kapatmak beş dosyayı sebepsizce değiştirmek olurdu.
 */
export { ChatError } from './chat.guards.ts';

export interface ConversationRow {
  channelId: number;
  playerId: number;
  username: string;
  lastMessage: string | null;
  lastFromMe: boolean;
  lastMessageAt: string | null;
  unreadCount: number;
  blocked: boolean;
}

export interface MessageRow {
  id: number;
  channelId: number;
  senderId: number | null;
  body: string;
  createdAt: string;
}

/** `dm_key` — küçük id önce; iki yönde TEK kanal garantisi (unique `chat_channels_world_dm`). */
const dmKey = (a: number, b: number): string => `${Math.min(a, b)}:${Math.max(a, b)}`;

export class ChatService {
  constructor(private readonly db: Db) {}

  /* ── Konuşma açma ─────────────────────────────────────────────────────────── */

  /**
   * Karşı oyuncuyla kanalı bulur, yoksa **tembel** yaratır (§13.12.1).
   *
   * ⚠️ Kanal yaratmak mesaj göndermek DEĞİLDİR: acemi kısıtı burada değil `send`'de uygulanır,
   * çünkü kısıtlı oyuncu **kendisine yazılmış** sohbeti açıp okuyabilmeli (cevap hakkı saklı).
   */
  async openConversation(o: { worldId: number; playerId: number; withPlayerId: number }): Promise<number> {
    if (o.playerId === o.withPlayerId) {
      throw new ChatError('self_message', 'Kendine mesaj gönderemezsin.');
    }
    const [target] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM players WHERE id = ${o.withPlayerId} AND world_id = ${o.worldId}
    `);
    // ⚠️ Dünya yalıtımı: başka dünyadaki oyuncu "yok" muamelesi görür (varlığı da sızmaz).
    if (!target) throw new ChatError('wrong_world', 'Oyuncu bulunamadı.');

    const key = dmKey(o.playerId, o.withPlayerId);
    return this.db.transaction(async (txn) => {
      const tx = txn as unknown as Tx;
      /**
       * ⚠️ Yasak YENİ konuşma açmayı da kapatır. Yalnız `send`i kapatsaydık banlı oyuncu
       * karşı tarafın listesinde boş bir konuşma açabilir ve bu tek başına bir taciz aracı
       * olurdu (bildirim düşmese bile ad görünür).
       */
      await assertNotBanned(tx, o.worldId, o.playerId, 'other');
      const [existing] = await tx.execute<Record<string, unknown>>(sql`
        SELECT id FROM chat_channels WHERE world_id = ${o.worldId} AND dm_key = ${key}
      `);
      if (existing) return Number(existing['id']);

      /* Yarış: iki taraf aynı anda açarsa unique indeks birini reddeder → var olanı okuruz. */
      const created = await tx.execute<Record<string, unknown>>(sql`
        INSERT INTO chat_channels (world_id, kind, dm_key) VALUES (${o.worldId}, 'dm', ${key})
        ON CONFLICT (world_id, dm_key) DO NOTHING
        RETURNING id
      `);
      let channelId: number;
      if (created[0]) {
        channelId = Number(created[0]['id']);
      } else {
        const [again] = await tx.execute<Record<string, unknown>>(sql`
          SELECT id FROM chat_channels WHERE world_id = ${o.worldId} AND dm_key = ${key}
        `);
        channelId = Number(again!['id']);
      }
      await tx.execute(sql`
        INSERT INTO chat_participants (channel_id, player_id)
        VALUES (${channelId}, ${o.playerId}), (${channelId}, ${o.withPlayerId})
        ON CONFLICT (channel_id, player_id) DO NOTHING
      `);
      return channelId;
    });
  }

  /* ── Mesaj gönderme ───────────────────────────────────────────────────────── */

  async send(o: {
    worldId: number; playerId: number; channelId: number; body: string; clientMsgId: string;
  }): Promise<MessageRow> {
    const body = o.body.trim();
    if (body.length === 0) throw new ChatError('too_long', 'Mesaj boş olamaz.');
    if (body.length > chatLimits().bodyMax) {
      throw new ChatError('too_long', `Mesaj en fazla ${chatLimits().bodyMax} karakter.`);
    }

    return this.db.transaction(async (txn) => {
      const tx = txn as unknown as Tx;
      const peer = await this.peerOf(tx, o.channelId, o.playerId, o.worldId);

      /**
       * 0) YENİDEN DENEME mi? — `client_msg_id` zaten yazılmışsa bu bir ağ tekrarıdır;
       * limitlere HİÇ bakılmadan var olan satır döner.
       * ⚠️ Bu kontrol mükerrer/kova kontrollerinden ÖNCE olmalı: aksi hâlde bağlantısı kopan
       * istemci aynı mesajı yeniden yolladığında "aynı mesajı az önce gönderdin" reddi alır
       * ve mesaj gönderilmiş olmasına rağmen kaybolmuş görünürdü (test bunu yakaladı).
       */
      const retry = await findRetry(tx, o.channelId, o.clientMsgId);
      if (retry) {
        return {
          id: retry.id,
          channelId: o.channelId,
          senderId: o.playerId,
          body: retry.body,
          createdAt: retry.createdAt.toISOString(),
        };
      }

      /**
       * ⭐ §verify — DOĞRULANMAMIŞ hesap mesaj YAZAMAZ (kullanıcı şartı: "kimseye mesaj
       * yazamaz, birisi ona yazsa da cevap veremez"). Okumak serbest.
       *
       * ⚠️ Sohbet yasağıyla aynı sırada — yeniden deneme kontrolünden SONRA: ağ tekrarı
       * yüzünden zaten yazılmış bir mesaj "gönderilemedi" görünmemeli.
       */
      await assertVerifiedToChat(tx, o.playerId);

      /**
       * ⭐⭐ KURAL ONAYI (H1, 2026-08-22) — §verify'ın hemen ardında, çünkü ikisi de aynı
       * cinsten: *"yazmaya hakkın var mı"*. Engel ve kova kapılarından ÖNCE olmalı; onay
       * eksikken oyuncuya "çok hızlı yazıyorsun" demek yanlış sebebi söylemek olurdu.
       *
       * ⚠️ Onay ÖZEL MESAJDA kanal başına: `channelId` veriliyor.
       */
      await assertChatTermsAccepted(tx, { playerId: o.playerId, channelId: o.channelId });

      /**
       * ⭐ SOHBET YASAĞI (§admin Faz 6) — yeniden deneme kontrolünden SONRA, engelden ÖNCE.
       *
       * ⚠️ Yeniden denemeden SONRA olmalı: ban gelmeden önce gönderilmiş bir mesajın ağ
       * tekrarı "yasaklısın" hatası almamalı — o mesaj zaten yazıldı, istemci yalnız
       * cevabını kaçırdı.
       */
      await assertNotBanned(tx, o.worldId, o.playerId, 'other');

      /* 1) ENGEL — iki yön iki farklı sonuç (yukarıdaki değişmez 3). */
      const blocks = await tx.execute<Record<string, unknown>>(sql`
        SELECT player_id, blocked_player_id FROM player_blocks
         WHERE (player_id = ${o.playerId} AND blocked_player_id = ${peer.playerId})
            OR (player_id = ${peer.playerId} AND blocked_player_id = ${o.playerId})
      `);
      if (blocks.some((b) => Number(b['player_id']) === o.playerId)) {
        throw new ChatError('blocked_by_me', 'Bu oyuncuyu engelledin. Mesaj göndermek için engeli kaldır.');
      }
      if (blocks.length > 0) {
        // ⚠️ Sebep SÖYLENMEZ (kullanıcı kararı): "seni engelledi" bilgisi doğrulanmaz.
        throw new ChatError('blocked', 'Mesajınız iletilemedi!');
      }

      /* 2) ACEMİ KISITI — yalnız YENİ konuşma başlatırken; karşı taraf yazmışsa cevap serbest. */
      if (chatLimits().newPlayerHours > 0) await this.assertNotTooNew(tx, o.playerId, o.channelId);

      /* 3) KOVA + MÜKERRER — ikisi de aynı sorgudan çıkar (tek tur).
       * ⚠️ Kapsam `'dm'`: oyuncunun TÜM DM kanallarını sayar ama ittifak sohbetini SAYMAZ.
       *    İki kovanın birbirini yememesi gerekiyor — gerekçe `chat.guards.ts`te. */
      await assertFlowOk(tx, {
        playerId: o.playerId, channelId: o.channelId, body, scope: 'dm',
        limits: {
          burst: chatLimits().burst,
          perSeconds: chatLimits().perSeconds,
          duplicateSeconds: chatLimits().duplicateSeconds,
        },
      });

      /* 4) YAZ — `client_msg_id` idempotency: yeniden denemede çift satır oluşmaz. */
      const written = await insertMessage(tx, {
        channelId: o.channelId, worldId: o.worldId, senderId: o.playerId,
        body, clientMsgId: o.clientMsgId,
      });
      const id = written.id;

      /* Gönderen kendi mesajını okumuş sayılır — kendi yazdığı rozet üretmesin. */
      await tx.execute(sql`
        UPDATE chat_participants SET last_read_message_id = GREATEST(last_read_message_id, ${id})
         WHERE channel_id = ${o.channelId} AND player_id = ${o.playerId}
      `);

      /**
       * ⭐ Outbox: olay İKİ tarafa da gider (gönderene de — başka sekmesi/cihazı açık olabilir).
       * Yük yalnız KİMLİK + kısa önizleme taşır; tam gövde WS'e çıkmaz (NOTIFY 8000 bayt sınırı
       * ve "olay veri değil haber taşır" kuralı). İstemci olayı alınca geçmişi tazeler.
       * `senderName`/`preview` bildirim katmanının kullandığı alanlar (`notify.catalog.ts`):
       * push başlığı "Ayla" olur, gövde önizleme. WS olayına bunlar GEÇMEZ.
       */
      await tx.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (${o.worldId}, 'chat:dm', ${JSON.stringify({
        channelId: o.channelId,
        messageId: id,
        senderId: o.playerId,
        senderName: peer.myName,
        recipientId: peer.playerId,
        preview: body.slice(0, 80),
      })}::jsonb)
      `);

      return {
        id,
        channelId: o.channelId,
        senderId: o.playerId,
        body,
        createdAt: written.createdAt.toISOString(),
      };
    });
  }

  /* ── Okuma ────────────────────────────────────────────────────────────────── */

  /** Sohbet listesi — son mesaj önizlemesi + okunmamış sayısı; tamamen boşalmış sohbet GÖRÜNMEZ. */
  async conversations(o: { worldId: number; playerId: number }): Promise<ConversationRow[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT c.id AS channel_id, other.id AS other_id, other.username,
             last.body, last.sender_id, last.created_at,
             (SELECT COUNT(*)::int FROM chat_messages m
               WHERE m.channel_id = c.id
                 AND m.id > GREATEST(p.last_read_message_id, p.cleared_before_message_id)
                 AND m.deleted_at IS NULL
                 AND m.sender_id IS DISTINCT FROM ${o.playerId}) AS unread,
             EXISTS (SELECT 1 FROM player_blocks b
                      WHERE b.player_id = ${o.playerId} AND b.blocked_player_id = other.id) AS blocked
        FROM chat_participants p
        JOIN chat_channels c ON c.id = p.channel_id
        JOIN chat_participants op ON op.channel_id = c.id AND op.player_id <> ${o.playerId}
        JOIN players other ON other.id = op.player_id
        -- Son GÖRÜNÜR mesaj: sohbeti temizlediysem temizleme çizgisinden sonrakiler sayılır.
        LEFT JOIN LATERAL (
          SELECT m.body, m.sender_id, m.created_at
            FROM chat_messages m
           WHERE m.channel_id = c.id AND m.id > p.cleared_before_message_id AND m.deleted_at IS NULL
           ORDER BY m.id DESC LIMIT 1
        ) last ON TRUE
       WHERE p.player_id = ${o.playerId} AND c.world_id = ${o.worldId} AND c.kind = 'dm'
         AND last.created_at IS NOT NULL
       ORDER BY last.created_at DESC
       LIMIT 100
    `);
    return rows.map((r) => ({
      channelId: Number(r['channel_id']),
      playerId: Number(r['other_id']),
      username: String(r['username']),
      lastMessage: r['body'] == null ? null : String(r['body']),
      lastFromMe: Number(r['sender_id'] ?? 0) === o.playerId,
      lastMessageAt: r['created_at'] == null ? null : new Date(String(r['created_at'])).toISOString(),
      unreadCount: Number(r['unread'] ?? 0),
      blocked: Boolean(r['blocked']),
    }));
  }

  /** Geçmiş — keyset sayfalama (`before` = en eski görünen id). En yeni ÖNCE döner. */
  async history(o: {
    worldId: number; playerId: number; channelId: number; before?: number | null; limit?: number;
  }): Promise<{ items: MessageRow[]; hasMore: boolean }> {
    const me = await this.participant(this.db, o.channelId, o.playerId, o.worldId);
    const limit = Math.min(100, Math.max(1, o.limit ?? chatLimits().pageSize));
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, channel_id, sender_id, body, created_at
        FROM chat_messages
       WHERE channel_id = ${o.channelId}
         AND id > ${me.clearedBefore}
         AND (${o.before ?? null}::bigint IS NULL OR id < ${o.before ?? null}::bigint)
         AND deleted_at IS NULL
       ORDER BY id DESC
       LIMIT ${limit + 1}
    `);
    const hasMore = rows.length > limit;
    return {
      hasMore,
      items: rows.slice(0, limit).map((r) => ({
        id: Number(r['id']),
        channelId: Number(r['channel_id']),
        senderId: r['sender_id'] == null ? null : Number(r['sender_id']),
        body: String(r['body']),
        createdAt: new Date(String(r['created_at'])).toISOString(),
      })),
    };
  }

  /** Okundu imleci — daima ileri (`GREATEST`), geç gelen istek sayacı geri almasın. */
  async markRead(o: { worldId: number; playerId: number; channelId: number }): Promise<void> {
    await this.participant(this.db, o.channelId, o.playerId, o.worldId);
    await this.db.execute(sql`
      UPDATE chat_participants p
         SET last_read_message_id = GREATEST(p.last_read_message_id,
               COALESCE((SELECT MAX(m.id) FROM chat_messages m WHERE m.channel_id = p.channel_id), 0))
       WHERE p.channel_id = ${o.channelId} AND p.player_id = ${o.playerId}
    `);
  }

  /* ── Sohbeti sil (tek taraflı) ────────────────────────────────────────────── */

  /**
   * ⭐ Yalnız BENİM görünür penceremi kapatır (kullanıcı kararı): karşı tarafta sohbet aynen
   * durur, mesajlar sunucudan SİLİNMEZ. Karşı taraf yeni mesaj yazarsa sohbet bende yeniden
   * belirir — ama yalnız yeni mesajlarla, eskiler bir daha görünmez.
   *
   * ⚠️ `last_read_message_id` de zıplatılır; yoksa okunmamış bir sohbeti silince rozet
   * "hayalet" olarak asılı kalırdı.
   */
  async clearConversation(o: { worldId: number; playerId: number; channelId: number }): Promise<void> {
    await this.participant(this.db, o.channelId, o.playerId, o.worldId);
    await this.db.execute(sql`
      UPDATE chat_participants p
         SET cleared_before_message_id = GREATEST(p.cleared_before_message_id, last_id.v),
             last_read_message_id      = GREATEST(p.last_read_message_id, last_id.v)
        FROM (SELECT COALESCE(MAX(id), 0) AS v FROM chat_messages WHERE channel_id = ${o.channelId}) last_id
       WHERE p.channel_id = ${o.channelId} AND p.player_id = ${o.playerId}
    `);
  }

  /* ── Engelleme ────────────────────────────────────────────────────────────── */

  async block(o: { worldId: number; playerId: number; targetId: number }): Promise<void> {
    if (o.playerId === o.targetId) throw new ChatError('self_message', 'Kendini engelleyemezsin.');
    const [t] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM players WHERE id = ${o.targetId} AND world_id = ${o.worldId}
    `);
    if (!t) throw new ChatError('wrong_world', 'Oyuncu bulunamadı.');
    await this.db.execute(sql`
      INSERT INTO player_blocks (world_id, player_id, blocked_player_id)
      VALUES (${o.worldId}, ${o.playerId}, ${o.targetId})
      ON CONFLICT (player_id, blocked_player_id) DO NOTHING
    `);
  }

  /**
   * ⭐ Engellediklerim — Seçenekler ekranındaki liste (kullanıcı, 2026-08-10).
   *
   * ⚠️ Ad `players`tan `JOIN`le geliyor, `player_blocks`ta saklanmıyor: ad değişebilir ve
   * kopyalanmış bir ad bayatlardı. `INNER JOIN` yeterli — oyuncu silinirse satır zaten
   * `ON DELETE cascade` ile gidiyor.
   */
  async blocks(o: { worldId: number; playerId: number }): Promise<
    Array<{ playerId: number; username: string; createdAt: string }>
  > {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT b.blocked_player_id, p.username, b.created_at
        FROM player_blocks b
        JOIN players p ON p.id = b.blocked_player_id
       WHERE b.player_id = ${o.playerId} AND b.world_id = ${o.worldId}
       ORDER BY b.created_at DESC
       LIMIT 200
    `);
    return rows.map((r) => ({
      playerId: Number(r['blocked_player_id']),
      username: String(r['username']),
      createdAt: new Date(String(r['created_at'])).toISOString(),
    }));
  }

  async unblock(o: { playerId: number; targetId: number }): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM player_blocks WHERE player_id = ${o.playerId} AND blocked_player_id = ${o.targetId}
    `);
  }

  /* ── Şikayet ──────────────────────────────────────────────────────────────── */

  /**
   * Yalnız KAYIT üretir — otomatik ceza YOK (§9.1.1). Moderasyon paneli sonraki tur.
   * Gövde kopyası saklanır: mesaj sonradan silinse/temizlense de kanıt durur.
   */
  async report(o: {
    worldId: number; playerId: number; channelId: number;
    messageId?: number | null; reason: string; note?: string;
  }): Promise<void> {
    const peer = await this.peerOf(this.db, o.channelId, o.playerId, o.worldId);
    let snapshot: string | null = null;
    let reported = peer.playerId;
    if (o.messageId != null) {
      const [m] = await this.db.execute<Record<string, unknown>>(sql`
        SELECT body, sender_id FROM chat_messages WHERE id = ${o.messageId} AND channel_id = ${o.channelId}
      `);
      if (!m) throw new ChatError('conversation_not_found', 'Mesaj bulunamadı.');
      snapshot = String(m['body']);
      reported = Number(m['sender_id'] ?? peer.playerId);
    }
    await this.db.execute(sql`
      INSERT INTO chat_reports (world_id, channel_id, message_id, reporter_id, reported_player_id,
                                reason, note, body_snapshot)
      VALUES (${o.worldId}, ${o.channelId}, ${o.messageId ?? null}, ${o.playerId}, ${reported},
              ${o.reason}, ${o.note ?? null}, ${snapshot})
      ON CONFLICT DO NOTHING
    `);
  }

  /* ── Yardımcılar ──────────────────────────────────────────────────────────── */

  /** Katılımcı mıyım + kanal BU dünyada mı? İkisi tek sorguda (dünya yalıtımı kapısı). */
  private async participant(
    tx: Tx, channelId: number, playerId: number, worldId: number,
  ): Promise<{ clearedBefore: number }> {
    const [r] = await tx.execute<Record<string, unknown>>(sql`
      SELECT p.cleared_before_message_id
        FROM chat_participants p JOIN chat_channels c ON c.id = p.channel_id
       WHERE p.channel_id = ${channelId} AND p.player_id = ${playerId} AND c.world_id = ${worldId}
    `);
    if (!r) throw new ChatError('not_a_member', 'Bu sohbete erişimin yok.');
    return { clearedBefore: Number(r['cleared_before_message_id'] ?? 0) };
  }

  /** Karşı taraf + kendi katılımım (tek sorgu). */
  private async peerOf(
    tx: Tx, channelId: number, playerId: number, worldId: number,
  ): Promise<{ playerId: number; clearedBefore: number; myName: string }> {
    const [r] = await tx.execute<Record<string, unknown>>(sql`
      SELECT me.cleared_before_message_id, other.player_id AS other_id, sender.username AS my_name
        FROM chat_participants me
        JOIN chat_channels c ON c.id = me.channel_id
        JOIN chat_participants other ON other.channel_id = c.id AND other.player_id <> me.player_id
        -- Gönderenin adı push başlığı için ("Ayla: …"); zaten atılan sorguya iliştirildi ki
        -- bildirim uğruna mesaj yolunda ikinci bir tur oluşmasın.
        JOIN players sender ON sender.id = me.player_id
       WHERE me.channel_id = ${channelId} AND me.player_id = ${playerId} AND c.world_id = ${worldId}
    `);
    if (!r) throw new ChatError('not_a_member', 'Bu sohbete erişimin yok.');
    return {
      playerId: Number(r['other_id']),
      clearedBefore: Number(r['cleared_before_message_id'] ?? 0),
      myName: String(r['my_name'] ?? ''),
    };
  }

  /**
   * Acemi kısıtı: o dünyada `newPlayerHours` saatini doldurmayan oyuncu YENİ konuşma
   * başlatamaz. **Karşı taraf en az bir mesaj yazmışsa serbest** — yeni oyuncu, ona yardım
   * etmek isteyen ittifak liderine cevap verebilmeli (§13.12.4 "cevap hakkı saklı").
   */
  private async assertNotTooNew(tx: Tx, playerId: number, channelId: number): Promise<void> {
    const [r] = await tx.execute<Record<string, unknown>>(sql`
      SELECT
        (SELECT EXTRACT(EPOCH FROM (now() - created_at)) / 3600 FROM players WHERE id = ${playerId}) AS age_hours,
        EXISTS (SELECT 1 FROM chat_messages
                 WHERE channel_id = ${channelId} AND sender_id IS DISTINCT FROM ${playerId}) AS peer_wrote
    `);
    if (Boolean(r?.['peer_wrote'])) return;
    const ageHours = Number(r?.['age_hours'] ?? 0);
    if (ageHours >= chatLimits().newPlayerHours) return;
    const left = Math.ceil(chatLimits().newPlayerHours - ageHours);
    throw new ChatError(
      'dm_new_player_restricted',
      `Yeni konuşma başlatabilmen için ${left} saat daha beklemelisin.`,
      left * 3600,
    );
  }
}
