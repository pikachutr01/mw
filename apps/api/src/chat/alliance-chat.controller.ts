/**
 * ⭐ İTTİFAK SOHBETİ UÇLARI (§13.15c).
 *
 * `chat.controller.ts` ile aynı taşıma kararı: **gönderme REST**, alım WS. Gerekçe orada
 * yazılı (jeton tazeliği + "oyun durumu WS üzerinden değiştirilemez" değişmezi).
 *
 * ⚠️ **HİÇBİR UÇ `channelId` ALMIYOR** — sunucu onu oyuncunun `alliance_id`'sinden çözüyor.
 * Kanal kimliği istemciye YALNIZ WS odasına katılabilsin diye veriliyor ve gateway onu
 * ayrıca üyelikten doğruluyor.
 *
 * Kurallar `AllianceChatService`te; burada kimlik doğrulama, zod ve hata → HTTP çevirisi var.
 */
import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query,
  Req, UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { allianceChatMuteRequest, allianceChatSendRequest } from '@mobilwar/contracts';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { getGateway } from '../realtime/gateway-registry.ts';
import { AllianceChatService } from './alliance-chat.service.ts';
import { toHttp } from './chat.controller.ts';

const idParam = z.coerce.number().int().positive();

@Controller('api/v1/alliance/chat')
@UseGuards(AuthGuard)
export class AllianceChatController {
  private readonly service: AllianceChatService;

  constructor(@Inject(DB) db: Db) {
    this.service = new AllianceChatService(db);
  }

  /**
   * Açılış paketi — sheet açılırken tek çağrıda kanal + yazma hakkı + üye listesi.
   *
   * ⚠️ `online` **burada** dolduruluyor, serviste değil: çevrimiçilik bilgisi
   * `RealtimeGateway`in bellek-içi sayacında ve servis gateway bilmemeli
   * (`alliance.controller.ts` ile aynı ayrım). `ROLE=worker` profilinde `getGateway()`
   * `null` döner → herkes çevrimdışı görünür, sızıntı olmaz.
   */
  @Get()
  async open(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const p = req.player!;
    try {
      const packet = await this.service.open({ worldId: p.worldId, playerId: p.playerId });
      const gw = getGateway();
      return {
        ...packet,
        members: packet.members.map((m) => ({
          ...m,
          /* ⭐ Çevrimiçilik yalnız ittifak içinde sızar — istek sahibi zaten bu ittifağın üyesi. */
          online: gw?.isOnline(m.playerId) ?? false,
        })),
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
    const parsed = allianceChatSendRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    const p = req.player!;
    try {
      return { ...await this.service.send({
        worldId: p.worldId, playerId: p.playerId,
        body: parsed.data.body, clientMsgId: parsed.data.clientMsgId,
      }) };
    } catch (err) { throw toHttp(err); }
  }

  /** Susturma — `minutes: null` KALICI demek (sözleşmede zorunlu alan, bkz. gerekçe). */
  @Post('mutes')
  @HttpCode(204)
  async mute(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = allianceChatMuteRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    const p = req.player!;
    try {
      await this.service.mute({
        worldId: p.worldId, playerId: p.playerId, targetId: parsed.data.playerId,
        minutes: parsed.data.minutes, reason: parsed.data.reason ?? null,
      });
    } catch (err) { throw toHttp(err); }
  }

  /** ⚠️ Gövdesiz → istemci `content-type: application/json` GÖNDERMEMELİ (Fastify 400 verir). */
  @Delete('mutes/:playerId')
  @HttpCode(204)
  async unmute(@Param('playerId') target: string, @Req() req: AuthedRequest): Promise<void> {
    const p = req.player!;
    try {
      await this.service.unmute({
        worldId: p.worldId, playerId: p.playerId, targetId: idParam.parse(target),
      });
    } catch (err) { throw toHttp(err); }
  }

  /**
   * Mesajı kaldır — satır silinmez, `deleted_at`/`deleted_by` işaretlenir.
   *
   * ⚠️ **`AdminGuard` YOK ve olmamalı** — genel sohbetteki ikizinden ayrıldığı tek nokta bu.
   * Orada yetki oyun yönetimidir, burada ittifak rütbesidir; kapı `AllianceChatService`te
   * `assertCanModerate` ile açılıyor. `channelId` istekten gelmediği için başka ittifağın
   * mesajına id tahmin ederek uzanmak da mümkün değil.
   */
  @Delete('messages/:id')
  @HttpCode(204)
  async removeMessage(@Param('id') id: string, @Req() req: AuthedRequest): Promise<void> {
    const p = req.player!;
    try {
      await this.service.deleteMessage({
        worldId: p.worldId, playerId: p.playerId, messageId: idParam.parse(id),
      });
    } catch (err) { throw toHttp(err); }
  }
}
