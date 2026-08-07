import { z } from 'zod';
import { cursorPage, playerId } from './common.ts';

/**
 * SOHBET SÖZLEŞMESİ (SİSTEM PLANI §13.12).
 *
 * ⚠️ DÜNYA YALITIMI (§13.12.1b): hiçbir istemci yükü `worldId` TAŞIMAZ — dünya kimliği JWT'den
 * gelir ve sunucuda sabitlenir. Böylece "başka dünyanın kanalına yaz" saldırısı şema düzeyinde
 * imkânsızdır.
 */
export const chatChannelKind = z.enum(['global', 'alliance', 'dm']);
export type ChatChannelKind = z.infer<typeof chatChannelKind>;

export const chatChannelId = z.number().int().positive();

export const chatChannel = z.object({
  id: chatChannelId,
  kind: chatChannelKind,
  /** DM'de karşı tarafın adı, ittifakta ittifak adı, genel sohbette null. */
  title: z.string().nullable(),
  unreadCount: z.number().int().nonnegative(),
  slowModeSeconds: z.number().int().nonnegative(),
  lastMessageAt: z.string().datetime().nullable(),
});
export type ChatChannel = z.infer<typeof chatChannel>;

/**
 * ⭐ SOHBET LİSTESİ SATIRI (kullanıcı, 2026-07-31): Mesajlar sekmesinde oyun mesajlarıyla
 * tarihe göre TEK listede görünür; son mesajın satıra sığdığı kadarı önizlenir.
 */
export const chatConversation = z.object({
  channelId: chatChannelId,
  /** Karşı taraf — DM'de daima dolu. */
  playerId,
  username: z.string(),
  lastMessage: z.string().nullable(),
  /** Son mesajı ben mi yazdım (önizlemede "Sen: …" için)? */
  lastFromMe: z.boolean(),
  lastMessageAt: z.string().datetime().nullable(),
  unreadCount: z.number().int().nonnegative(),
  /** Bu oyuncuyu BEN engelledim mi (yazma kutusunu kapatıp sebebini söylemek için)? */
  blocked: z.boolean(),
});
export type ChatConversation = z.infer<typeof chatConversation>;

export const chatMessage = z.object({
  id: z.number().int().positive(),
  channelId: chatChannelId,
  /** null = sistem duyurusu (beta/bakım). */
  senderId: playerId.nullable(),
  senderName: z.string().nullable(),
  /** DÜZ METİN — HTML/markdown yok, XSS yüzeyi sıfır. */
  body: z.string(),
  isPinned: z.boolean().default(false),
  createdAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});
export type ChatMessage = z.infer<typeof chatMessage>;

export const chatHistoryQuery = cursorPage;

/** WS → sunucu: `chat:send` (ack ile gerçek id döner). */
export const chatSendEvent = z.object({
  channelId: chatChannelId,
  body: z.string().trim().min(1).max(500),
  /** Idempotency: yeniden bağlanmada çift gönderimi engeller; iyimser gösterim için de kullanılır. */
  clientMsgId: z.string().uuid(),
});
export type ChatSendEvent = z.infer<typeof chatSendEvent>;

export const chatTypingEvent = z.object({ channelId: chatChannelId });
export const chatReadEvent = z.object({
  channelId: chatChannelId,
  lastReadMessageId: z.number().int().nonnegative(),
});

/**
 * ⭐ Pencere açılırken/kapanırken oda katılımı (2026-07-31). Mesaj GÖVDESİ bu odadan
 * gelmez — o iki tarafın kişisel odasına gider ki pencere kapalıyken de ulaşsın. Kanal
 * odasının tek işi "yazıyor…" bildirimi.
 */
export const chatOpenEvent = z.object({ channelId: chatChannelId });

/** DM açma: karşı oyuncu AYNI DÜNYADA olmalı (sunucu doğrular, §13.12.1b). */
export const openDmRequest = z.object({ withPlayerId: playerId });

/** Mesaj gönderme (REST gövdesi — taşıma kararı §13.12.3'te REST'e çevrildi). */
export const sendChatRequest = z.object({
  body: z.string().trim().min(1).max(500),
  clientMsgId: z.string().uuid(),
});

/* ── İTTİFAK SOHBETİ (§13.15c) ────────────────────────────────────────────────
 *
 * ⚠️ Hiçbir istek `channelId` TAŞIMAZ — sunucu onu oyuncunun kendi `alliance_id`'sinden
 * çözüyor. Dünya yalıtımının (yukarı) ittifak ölçeğindeki karşılığı: "başka ittifağın
 * kanalına yaz" saldırısı şema düzeyinde imkânsız.
 */

/**
 * ⭐ ÇÖZÜLMÜŞ MENTION ARALIĞI — sunucu üretir, istemci **yalnız diler, parse etmez**.
 * `at` gövdedeki başlangıç, `len` `@` DÂHİL uzunluk. Kullanıcı adında boşluk serbest olduğu
 * için aralığı metinden çözmek imkânsız; ayrımı üye listesini gören sunucu yapıyor.
 */
export const chatMention = z.object({
  id: playerId,
  at: z.number().int().nonnegative(),
  len: z.number().int().positive(),
});
export type ChatMention = z.infer<typeof chatMention>;

export const allianceChatMessage = z.object({
  id: z.number().int().positive(),
  senderId: playerId.nullable(),
  /** null = dünyadan kaldırılmış oyuncu; ekran «kaldırılmış oyuncu» yazar (ham id ASLA görünmez). */
  senderName: z.string().nullable(),
  body: z.string(),
  mentions: z.array(chatMention).default([]),
  createdAt: z.string().datetime(),
});
export type AllianceChatMessage = z.infer<typeof allianceChatMessage>;

export const allianceChatSendRequest = z.object({
  body: z.string().trim().min(1).max(500),
  clientMsgId: z.string().uuid(),
});

/**
 * Susturma isteği.
 *
 * ⚠️ `minutes` **`.optional()` DEĞİL, zorunlu + `.nullable()`**: `null` = KALICI susturma.
 * İsteğe bağlı olsaydı alanı unutmak en ağır cezayı kazara verirdi — en yıkıcı seçenek
 * her zaman açıkça yazılmalı.
 * ⚠️ Üst sınır 43.200 dakika (30 gün): daha uzunu için kalıcı susturma var.
 */
export const allianceChatMuteRequest = z.object({
  playerId,
  minutes: z.number().int().positive().max(43_200).nullable(),
  reason: z.string().trim().max(200).optional(),
});

/** Şikayet: mesaj bazlı (messageId dolu) ya da oyuncu bazlı (null). */
export const chatReportRequest = z.object({
  channelId: chatChannelId,
  messageId: z.number().int().positive().nullable().optional(),
  reason: z.enum(['spam', 'abuse', 'scam', 'cheating', 'other']),
  note: z.string().trim().max(500).optional(),
});

/** Sunucunun reddetme sebepleri — istemci bunları Türkçe metne çevirir (i18n, §13.14.2). */
export const chatErrorCode = z.enum([
  'rate_limited',
  'slow_mode',
  'too_long',
  'not_a_member',
  'banned',
  /** Acemi DM kısıtı: o dünyada ilk 12 saat yeni konuşma başlatılamaz (§13.12.4). */
  'dm_new_player_restricted',
  'global_disabled',
  'global_account_too_new',
  'wrong_world',
  /**
   * ⭐ Karşı taraf beni engellemiş (2026-07-31). İstemci bunu **"Mesajınız iletilemedi!"**
   * diye gösterir — "seni engelledi" DEMEZ (kullanıcı kararı): bir şeylerin ters gittiği
   * anlaşılır ama engelin varlığı doğrulanmaz.
   */
  'blocked',
  /** BEN onu engelledim → kendi yazma kutum kapalı; bu tarafta sebep AÇIKÇA söylenir. */
  'blocked_by_me',
  /** Aynı metin çok kısa sürede tekrar — mükerrer mesaj koruması. */
  'duplicate_message',
  'conversation_not_found',
  /** Kendine mesaj gönderilemez. */
  'self_message',

  /* ── İttifak sohbeti (§13.15c) ───────────────────────────────────────────
   * ⚠️ İstemci hata metinlerini BU kodlardan üretiyor; enum'a eklenmeyen bir kod
   * `default` dalına düşer ve ham sunucu mesajı sızabilir. */
  /** Oyuncu bir ittifakta değil → sohbete hiç erişemez. */
  'not_alliance_member',
  /** Lider/konsey tarafından susturuldu (süreli ya da kalıcı). */
  'alliance_muted',
  /** İttifağa katılalı `allianceChat.newMemberHours` olmadı — okuyabilir, yazamaz. */
  'alliance_new_member_restricted',
  /** Özellik panelden kapatıldı (acil vana). */
  'alliance_chat_disabled',
  /** Yetki matrisi reddetti: Konsey yalnız Asker'i susturabilir, Lider susturulamaz. */
  'mute_hierarchy',
  /** Kendini susturmaya çalıştı. */
  'mute_self',
  /** Susturma kaldırılmak istendi ama aktif susturma yok. */
  'not_muted',
  /** İşlem için Konsey ya da Lider olmak gerekiyor. */
  'forbidden',
]);
export type ChatErrorCode = z.infer<typeof chatErrorCode>;

export const chatSendAck = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), id: z.number().int().positive(), createdAt: z.string().datetime() }),
  z.object({
    ok: z.literal(false),
    error: chatErrorCode,
    /** Kısıt bitene kalan saniye (arayüzde geri sayım). */
    retryAfterSeconds: z.number().int().nonnegative().optional(),
  }),
]);
export type ChatSendAck = z.infer<typeof chatSendAck>;

/** Sunucu → istemci olayları. */
export const chatServerEvents = {
  'chat:message': chatMessage,
  'chat:deleted': z.object({ channelId: chatChannelId, id: z.number().int().positive() }),
  'chat:typing': z.object({ channelId: chatChannelId, playerId }),
  'chat:presence': z.object({ channelId: chatChannelId, online: z.array(playerId) }),
} as const;
