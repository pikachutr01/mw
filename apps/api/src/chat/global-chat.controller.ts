/**
 * ⭐ GENEL SOHBET UÇLARI (§13.12).
 *
 * `alliance-chat.controller.ts` ile aynı taşıma kararı: **gönderme REST**, alım WS. Gerekçe
 * orada yazılı (jeton tazeliği + "oyun durumu WS üzerinden değiştirilemez" değişmezi).
 *
 * ⚠️ **HİÇBİR UÇ `channelId` ALMIYOR** — sunucu onu oyuncunun `worldId`'sinden çözüyor. Kanal
 * kimliği istemciye YALNIZ WS odasına katılabilsin diye veriliyor ve gateway onu ayrıca
 * kanalın türünden ve dünyasından doğruluyor.
 *
 * ⚠️ **Yönetici uçlarında `AdminStepUpGuard` YOK** (paneldeki `chat-ban` ucunun aksine).
 * Orada parola yeniden soruluyor çünkü panel işlemleri yıkıcı ve geri alınamaz olabiliyor;
 * buradaki susturma **geri alınabilir** ve sohbetin ortasında, saniyeler içinde gerekiyor.
 * Parola sormak moderasyonu pratikte kullanılamaz kılardı. Denetim izi yine yazılıyor.
 */
import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query,
  Req, UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { globalChatMuteRequest, globalChatSendRequest } from '@mobilwar/contracts';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import { AdminGuard } from '../admin/admin.guard.ts';
import { currentTraceId } from '../common/request-context.ts';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { toHttp } from './chat.controller.ts';
import { GlobalChatService } from './global-chat.service.ts';

const idParam = z.coerce.number().int().positive();

@Controller('api/v1/chat/global')
@UseGuards(AuthGuard)
export class GlobalChatController {
  private readonly service: GlobalChatService;

  constructor(@Inject(DB) private readonly db: Db) {
    this.service = new GlobalChatService(db);
  }

  /** Açılış paketi — YALNIZ oyuncu sohbete bağlanınca çağrılır (kapalıyken hiç istek gitmez). */
  @Get()
  async open(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const p = req.player!;
    try {
      return {
        ...await this.service.open({ worldId: p.worldId, playerId: p.playerId }),
        serverNow: new Date().toISOString(),
      };
    } catch (err) { throw toHttp(err); }
  }

  /** Geçmiş — keyset: `before` = ekranda görünen EN ESKİ mesajın id'si. */
  @Get('messages')
  async history(
    @Req() req: AuthedRequest,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const p = req.player!;
    try {
      return await this.service.history({
        worldId: p.worldId, playerId: p.playerId,
        before: before ? Number(before) : null,
        limit: limit ? Number(limit) : undefined,
      });
    } catch (err) { throw toHttp(err); }
  }

  @Post('messages')
  @HttpCode(201)
  async send(@Body() body: unknown, @Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const parsed = globalChatSendRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    const p = req.player!;
    try {
      return { ...await this.service.send({
        worldId: p.worldId, playerId: p.playerId,
        body: parsed.data.body, clientMsgId: parsed.data.clientMsgId,
      }) };
    } catch (err) { throw toHttp(err); }
  }

  /** `@` önerisi — istemci 250 ms debounce ile çağırıyor; `q` en az 2 karakter. */
  @Get('mentions')
  async mentions(
    @Req() req: AuthedRequest, @Query('q') q?: string,
  ): Promise<Record<string, unknown>> {
    const p = req.player!;
    try {
      return {
        items: await this.service.suggest({
          worldId: p.worldId, playerId: p.playerId, q: q ?? '',
        }),
      };
    } catch (err) { throw toHttp(err); }
  }

  /* ── Yönetici (§moderasyon) ───────────────────────────────────────────────── */

  /**
   * Sohbette sustur — `chat_bans`e `scope = 'global'` yazar, yani **özel mesajı kesmez**.
   * ⚠️ `minutes: null` KALICI demek (sözleşmede zorunlu + nullable alan).
   */
  @Post('mutes')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  async mute(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = globalChatMuteRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    const p = req.player!;
    try {
      await this.service.mute({
        worldId: p.worldId, adminId: p.playerId, targetId: parsed.data.playerId,
        minutes: parsed.data.minutes, reason: parsed.data.reason ?? null,
      });
      await this.audit(p.worldId, p.playerId, 'admin.chat.ban', 'player', parsed.data.playerId, {
        scope: 'global', minutes: parsed.data.minutes, reason: parsed.data.reason ?? null,
      });
    } catch (err) { throw toHttp(err); }
  }

  /** ⚠️ Gövdesiz → istemci `content-type: application/json` GÖNDERMEMELİ (Fastify 400 verir). */
  @Delete('mutes/:playerId')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  async unmute(@Param('playerId') target: string, @Req() req: AuthedRequest): Promise<void> {
    const p = req.player!;
    const targetId = idParam.parse(target);
    try {
      await this.service.unmute({ worldId: p.worldId, targetId });
      await this.audit(p.worldId, p.playerId, 'admin.chat.unban', 'player', targetId, { scope: 'global' });
    } catch (err) { throw toHttp(err); }
  }

  /** Mesajı kaldır — satır silinmez, `deleted_at`/`deleted_by` işaretlenir. */
  @Delete('messages/:id')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  async removeMessage(@Param('id') id: string, @Req() req: AuthedRequest): Promise<void> {
    const p = req.player!;
    const messageId = idParam.parse(id);
    try {
      await this.service.deleteMessage({
        worldId: p.worldId, adminId: p.playerId, messageId,
      });
      await this.audit(p.worldId, p.playerId, 'admin.chat.message_deleted', 'chat_message', messageId, {});
    } catch (err) { throw toHttp(err); }
  }

  /**
   * Denetim kaydı — `admin.moderation.controller.ts`teki desenin ikizi.
   * ⚠️ Adım yükseltme olmadığı için iz DAHA da önemli: kimin neyi ne zaman sustur(may)dığı
   * yalnız buradan okunabilir.
   */
  private async audit(
    worldId: number, actorId: number, action: string,
    entity: 'player' | 'chat_message', entityId: number, payload: Record<string, unknown>,
  ): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after, trace_id)
      VALUES (${worldId}, ${actorId}, ${action}, ${entity}, ${entityId},
              ${JSON.stringify(payload)}::jsonb, ${currentTraceId()})
    `);
  }
}
