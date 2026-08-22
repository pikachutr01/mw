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
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { chatReportRequest, openDmRequest, sendChatRequest } from '@mobilwar/contracts';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import { UNVERIFIED_CODE } from '../auth/unverified.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { ChatError, ChatService } from './chat.service.ts';
import { chatLimits } from './chat.limits.ts';
import { CHAT_TERMS, CHAT_TERMS_VERSION, termsAccepted } from './chat.terms.ts';

const idParam = z.coerce.number().int().positive();

/**
 * Kural onayı gövdesi.
 *
 * ⚠️ SÜRÜM ALANI YOK ve bilerek: istemcinin bildirdiği bir sürüme güvenmek, okunmamış bir
 * metni onaylanmış göstermenin en kolay yolu olurdu. Sunucu kendi sürümünü yazıyor.
 * ⚠️ `dm` kapsamında `channelId` ZORUNLU: onay o yazışmaya ait.
 */
const acceptTermsBody = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('alliance') }),
  z.object({ scope: z.literal('dm'), channelId: z.number().int().positive() }),
]);

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
  // §verify de aynı sınıfta: sebebiyle birlikte açıkça söylenen bir karar → 403.
  /**
   * ⭐ İTTİFAK SOHBETİ (§13.15c) — hepsi `chat_banned` ile AYNI sınıfta: oyuncuya sebebiyle
   * birlikte **açıkça söylenen** kararlar, saklanacak bir şey yok.
   *
   * ⚠️ `alliance_muted` neden 429 DEĞİL: 429 "çok hızlısın, birazdan dene" der ve yanlış
   * olurdu — susturma bir hız sınırı değil, bir moderasyon kararı.
   */
  /**
   * ⭐ Genel sohbetin iki kodu da bu ailede: ikisi de oyuncuya **sebebiyle birlikte söylenen**
   * kararlar. ⚠️ `global_disabled` özellikle 404 DEĞİL — özellik kapatıldığında "böyle bir şey
   * yok" demek, istemcinin bunu bir hata sanmasına yol açardı; kapalı olmak açık bir durum.
   */
  if (
    err.code === 'chat_banned' || err.code === UNVERIFIED_CODE
    || err.code === 'not_alliance_member' || err.code === 'alliance_muted'
    || err.code === 'alliance_new_member_restricted' || err.code === 'alliance_chat_disabled'
    || err.code === 'mute_hierarchy' || err.code === 'forbidden'
    || err.code === 'global_disabled' || err.code === 'global_account_too_new'
  ) {
    return new ForbiddenException(body);
  }
  if (err.code === 'wrong_world' || err.code === 'conversation_not_found') {
    return new NotFoundException(body);
  }
  /* ⚠️ `blocked` de 429 DEĞİL 400 döner: 4xx ayrımından engel varlığı çıkarılamasın diye
   * "iletilemedi" ile aynı sınıfta kalır (kullanıcı: sebep doğrulanmasın). */
  /* `slow_mode` de bu ailede: "biraz bekle" diyen, süreyle çözülen kısıtlar. */
  if (err.code === 'rate_limited' || err.code === 'duplicate_message' || err.code === 'slow_mode') {
    return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
  }
  return new BadRequestException(body);
}

@Controller('api/v1/chat')
@UseGuards(AuthGuard)
export class ChatController {
  private readonly service: ChatService;

  /** ⚠️ Kural onayı iki tabloya tek `UPDATE` yazıyor; servis katmanı gerektirmiyor. */
  private readonly db: Db;

  constructor(@Inject(DB) db: Db) {
    this.service = new ChatService(db);
    this.db = db;
  }

  /* ── Sohbet kuralları (H1, 2026-08-22) ──────────────────────────────────── */

  /**
   * ⭐⭐ KURAL METNİ + O OYUNCUNUN DURUMU.
   *
   * ⚠️ Metin SUNUCUDAN geliyor ve bu şart: onay hukuki bir kabul, web'de bir şeyi
   * uygulamada başka bir şeyi onaylatmak kaydı değersiz kılardı.
   *
   * ⚠️ `required` **ayardan** geliyor (`chat.termsRequired`, varsayılan KAPALI). Kapalıyken
   * istemci kural penceresini hiç açmıyor; onayı bilmeyen eski bir sürüm de engellenmiyor.
   *
   * ⚠️ `alliance` durumu burada, DM durumu **yazışmanın kendi paketinde** dönüyor: DM onayı
   * kanal başına ve hangi kanal olduğunu bu uç bilmiyor.
   */
  @Get('terms')
  async terms(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const p = req.player!;
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT chat_terms_version AS v FROM players WHERE id = ${p.playerId}
    `);
    return {
      ...CHAT_TERMS,
      required: chatLimits().termsRequired,
      alliance: termsAccepted(row?.['v'] == null ? 0 : Number(row['v'])),
    };
  }

  /**
   * ⭐ ONAYI KAYDET.
   *
   * ⚠️ İki kapsam, iki tablo: `dm` → o yazışmanın katılımcı satırı, `alliance` → oyuncu
   * satırı. Kapsam istemciden geliyor ama **kanal sahipliği doğrulanıyor**: `channelId`
   * oyuncunun katılımcısı olmadığı bir kanalsa hiçbir satır güncellenmiyor.
   *
   * ⚠️ Sürüm gövdeden OKUNMUYOR, sunucudan yazılıyor: istemcinin bildirdiği bir sürüme
   * güvenmek, okunmamış bir metni onaylanmış göstermenin en kolay yolu olurdu.
   */
  @Post('terms/accept')
  @HttpCode(200)
  async acceptTerms(
    @Body() body: unknown, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = acceptTermsBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    const p = req.player!;

    if (parsed.data.scope === 'alliance') {
      await this.db.execute(sql`
        UPDATE players
           SET chat_terms_version = ${CHAT_TERMS_VERSION}, chat_terms_accepted_at = now()
         WHERE id = ${p.playerId}
      `);
      return { ok: true, version: CHAT_TERMS_VERSION };
    }

    await this.db.execute(sql`
      UPDATE chat_participants
         SET terms_version = ${CHAT_TERMS_VERSION}, terms_accepted_at = now()
       WHERE channel_id = ${parsed.data.channelId} AND player_id = ${p.playerId}
    `);
    return { ok: true, version: CHAT_TERMS_VERSION };
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

  /**
   * ⭐ ENGELLEDİKLERİM (kullanıcı, 2026-08-10) — Seçenekler ekranındaki liste.
   *
   * ⚠️ Engellemenin **tek tablosu** `player_blocks`: DM'den engellenen de genel sohbetten
   * engellenen de burada. İkinci bir liste tutulsaydı ikisini senkron tutmak gerekirdi ve
   * kullanıcının şartı tam olarak *"dm üzerinden engellenenler de buna dahildir"* idi —
   * yani şartı sağlayan şey bu uç değil, tek tablo olması.
   *
   * ⚠️ Dünya-kapsamlı (§13.12.1b): başka dünyadaki engeller görünmez.
   */
  @Get('blocks')
  async blocks(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const p = req.player!;
    return { items: await this.service.blocks({ worldId: p.worldId, playerId: p.playerId }) };
  }

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
