/**
 * ⭐ ÖZEL MESAJLAŞMA UÇLARI (§13.12).
 *
 * ⚠️ TAŞIMA KARARI (2026-07-31, plandaki saf-WS tasarımından bilinçli sapma): **gönderme ve
 * okundu işaretleme REST**, yalnız ALIM WS. İki gerekçe:
 *   1. Soketin JWT'si el sıkışmada donuyor (token yenilenince soket komple yeniden kuruluyor);
 *      REST istemcisi 401'de şeffaf yenileyip isteği tekrarlıyor → mesaj kaybolmaz.
 *   2. Gateway'in en güçlü değişmezi ("oyun durumu WS üzerinden DEĞİŞTİRİLEMEZ") bozulmadan
 *      kalır — WS'te yalnız `chat:open/close/typing` var, hiçbiri kalıcı durum yazmaz.
 *
 * Kurallar `ChatService`te; burada yalnız kimlik doğrulama, zod ve hata → HTTP çevirisi var.
 */
import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpException,
  HttpStatus, Inject, NotFoundException, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { chatReportRequest, openDmRequest, sendChatRequest } from '@mobiwar/contracts';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { ChatError, ChatService } from './chat.service.ts';

const idParam = z.coerce.number().int().positive();

export function toHttp(err: unknown): Error {
  if (!(err instanceof ChatError)) return err as Error;
  const body = { code: err.code, message: err.message, retryAfterSeconds: err.retryAfterSeconds };
  if (err.code === 'not_a_member') return new ForbiddenException(body);
  /**
   * ⚠️ Sohbet yasağı 403 — `blocked`ten FARKLI olarak açıkça söylenen bir karar. `blocked`
   * 400'de tutuluyor ki durum kodundan "beni engellemiş" çıkarılamasın; yasak ise oyuncuya
   * zaten sebebiyle birlikte bildiriliyor, saklanacak bir şey yok. 400 "isteğin bozuk"
   * demek olurdu ve yanlış olurdu.
   */
  if (err.code === 'chat_banned') return new ForbiddenException(body);
  if (err.code === 'wrong_world' || err.code === 'conversation_not_found') {
    return new NotFoundException(body);
  }
  /* ⚠️ `blocked` de 429 DEĞİL 400 döner: 4xx ayrımından engel varlığı çıkarılamasın diye
   * "iletilemedi" ile aynı sınıfta kalır (kullanıcı: sebep doğrulanmasın). */
  if (err.code === 'rate_limited' || err.code === 'duplicate_message') {
    return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
  }
  return new BadRequestException(body);
}

@Controller('api/v1/chat')
@UseGuards(AuthGuard)
export class ChatController {
  private readonly service: ChatService;

  constructor(@Inject(DB) db: Db) {
    this.service = new ChatService(db);
  }

  /** Sohbet listesi — Mesajlar ekranı bunu oyun mesajlarıyla tarihe göre birleştirir. */
  @Get('conversations')
  async list(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const p = req.player!;
    const items = await this.service.conversations({ worldId: p.worldId, playerId: p.playerId });
    return {
      items,
      unread: items.reduce((n, c) => n + c.unreadCount, 0),
      serverNow: new Date().toISOString(),
    };
  }

  /** Sohbet aç (yoksa yaratır) — Dünya ekranından "Mesaj" bu ucu çağırır. */
  @Post('conversations')
  @HttpCode(201)
  async open(@Body() body: unknown, @Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const parsed = openDmRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    const p = req.player!;
    try {
      const channelId = await this.service.openConversation({
        worldId: p.worldId, playerId: p.playerId, withPlayerId: parsed.data.withPlayerId,
      });
      return { channelId };
    } catch (err) { throw toHttp(err); }
  }

  /** Geçmiş — keyset: `before` = ekranda görünen EN ESKİ mesajın id'si. */
  @Get('conversations/:id/messages')
  async history(
    @Param('id') id: string, @Req() req: AuthedRequest,
    @Query('before') before?: string, @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const p = req.player!;
    try {
      return await this.service.history({
        worldId: p.worldId, playerId: p.playerId, channelId: idParam.parse(id),
        before: before ? Number(before) : null,
        limit: limit ? Number(limit) : undefined,
      });
    } catch (err) { throw toHttp(err); }
  }

  @Post('conversations/:id/messages')
  @HttpCode(201)
  async send(
    @Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = sendChatRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    const p = req.player!;
    try {
      const m = await this.service.send({
        worldId: p.worldId, playerId: p.playerId, channelId: idParam.parse(id),
        body: parsed.data.body, clientMsgId: parsed.data.clientMsgId,
      });
      return { ...m };
    } catch (err) { throw toHttp(err); }
  }

  @Post('conversations/:id/read')
  @HttpCode(204)
  async markRead(@Param('id') id: string, @Req() req: AuthedRequest): Promise<void> {
    const p = req.player!;
    try {
      await this.service.markRead({ worldId: p.worldId, playerId: p.playerId, channelId: idParam.parse(id) });
    } catch (err) { throw toHttp(err); }
  }

  /** Sohbeti sil — YALNIZ benim görünür pencerem kapanır; karşı tarafta aynen durur. */
  @Delete('conversations/:id')
  @HttpCode(204)
  async clear(@Param('id') id: string, @Req() req: AuthedRequest): Promise<void> {
    const p = req.player!;
    try {
      await this.service.clearConversation({
        worldId: p.worldId, playerId: p.playerId, channelId: idParam.parse(id),
      });
    } catch (err) { throw toHttp(err); }
  }

  /* ── Engelleme ────────────────────────────────────────────────────────────── */

  @Post('blocks')
  @HttpCode(204)
  async block(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = z.object({ playerId: z.number().int().positive() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    const p = req.player!;
    try {
      await this.service.block({ worldId: p.worldId, playerId: p.playerId, targetId: parsed.data.playerId });
    } catch (err) { throw toHttp(err); }
  }

  @Delete('blocks/:playerId')
  @HttpCode(204)
  async unblock(@Param('playerId') target: string, @Req() req: AuthedRequest): Promise<void> {
    await this.service.unblock({ playerId: req.player!.playerId, targetId: idParam.parse(target) });
  }

  /* ── Şikayet (yalnız KAYIT — otomatik ceza YOK, §9.1.1) ──────────────────── */

  @Post('reports')
  @HttpCode(204)
  async report(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = chatReportRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    const p = req.player!;
    try {
      await this.service.report({
        worldId: p.worldId, playerId: p.playerId, channelId: parsed.data.channelId,
        messageId: parsed.data.messageId ?? null, reason: parsed.data.reason, note: parsed.data.note,
      });
    } catch (err) { throw toHttp(err); }
  }
}
