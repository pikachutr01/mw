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

/** DM açma: karşı oyuncu AYNI DÜNYADA olmalı (sunucu doğrular, §13.12.1b). */
export const openDmRequest = z.object({ withPlayerId: playerId });

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
