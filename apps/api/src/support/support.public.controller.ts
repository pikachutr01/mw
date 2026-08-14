/**
 * ⭐ DESTEK UÇLARI — **giriş yapmamış** ziyaretçi (kullanıcı şartı: *"hem giriş yapmış hem de
 * yapmamış kullanıcılar için kullanılabilir olmalı"*).
 *
 * ⚠️⚠️ **`OptionalAuthGuard` BİLEREK KULLANILMIYOR.** Oturumu olan biri bu ucu çağırırsa talebi
 * yine de anonim açılır. Alternatif — "oturum varsa hesaba bağla" — talebin kime ait olduğunu
 * istemcinin hangi URL'i seçtiğine bağlardı; tam olarak sessizce bozulan türden örtük davranış.
 * Web istemcisi oturum varken korumalı ucu çağırıyor, nokta.
 *
 * ⚠️ **Sayım sızdırmama.** Verilen e-posta kayıtlı olsun olmasın yanıt AYNI. Adrese bakıp hesap
 * eşleştirmiyoruz (`support.service.ts` değişmez #1) — o, hem "bu adres kayıtlı mı" sızıntısı
 * hem de başkası adına talep açma yüzeyi olurdu.
 *
 * ⚠️ Hız sınırı `PublicRateLimitGuard` üzerinden; kova `support` (ayrıntı `rate-limit.ts`).
 */
import {
  BadRequestException, Body, Controller, Get, HttpCode, Inject, Param, Post, Req, Res,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { createSupportTicketRequest, replySupportTicketRequest } from '@mobilwar/contracts';
import { PublicRateLimitGuard, clientIp } from '../auth/rate-limit.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { SupportService } from './support.service.ts';
import { serveAttachment, toHttp } from './support.controller.ts';
import { authorizeAttachment, handleUpload, type UploadPart } from './upload.ts';

const idParam = z.coerce.number().int().positive();
/** Jeton `randomBytes(32).base64url` → 43 karakter; sınır bol tutuldu. */
const tokenParam = z.string().min(20).max(200);

interface MultipartRequest { file?: (opts?: unknown) => Promise<UploadPart | undefined> }
type AnyReq = { headers?: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } };

@Controller('api/v1/support/public')
@UseGuards(PublicRateLimitGuard)
export class SupportPublicController {
  private readonly service: SupportService;

  constructor(@Inject(DB) private readonly db: Db) {
    this.service = new SupportService(db);
  }

  /**
   * ⚠️ **Anonimde e-posta ZORUNLU** (kullanıcı kararı). Yoksa yönetici yanıt yazsa bile kimseye
   * ulaşamaz ve talep tek yönlü bir çöp kutusuna düşerdi.
   */
  @Post('tickets')
  @HttpCode(201)
  async create(@Req() req: AnyReq, @Body() body: unknown): Promise<Record<string, unknown>> {
    const parsed = createSupportTicketRequest.safeParse(body);
    if (!parsed.success || !parsed.data.email) {
      throw new BadRequestException({ code: 'invalid_request' });
    }
    try {
      const r = await this.service.create(
        { kind: 'anon', ip: clientIp(req) },
        { ...parsed.data, email: parsed.data.email },
      );
      /**
       * ⚠️ Ham jeton yanıtta dönüyor ki istemci kullanıcıyı doğrudan takip sayfasına
       * götürebilsin (mail beklemeden). DB'de yalnız sha256 duruyor.
       */
      return { ticketId: r.ticketId, token: r.publicToken };
    } catch (err) { throw toHttp(err); }
  }

  @Get('tickets/:token')
  async thread(@Param('token') token: string): Promise<Record<string, unknown>> {
    const t = tokenParam.safeParse(token);
    if (!t.success) throw new BadRequestException({ code: 'invalid_request' });
    try {
      const id = await this.service.ticketIdForToken(t.data);
      return await this.service.thread(id, { token: t.data });
    } catch (err) { throw toHttp(err); }
  }

  @Post('tickets/:token/messages')
  @HttpCode(201)
  async reply(
    @Param('token') token: string, @Body() body: unknown,
  ): Promise<Record<string, unknown>> {
    const t = tokenParam.safeParse(token);
    const parsed = replySupportTicketRequest.safeParse(body);
    if (!t.success || !parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    try {
      const id = await this.service.ticketIdForToken(t.data);
      await this.service.replyAsUser(id, { token: t.data }, parsed.data);
      return { ok: true };
    } catch (err) { throw toHttp(err); }
  }

  @Post('uploads')
  @HttpCode(201)
  async upload(@Req() req: AnyReq): Promise<Record<string, unknown>> {
    try {
      const part = await (req as unknown as MultipartRequest).file?.();
      return { ...await handleUpload(this.db, part, { accountId: null, ip: clientIp(req) }) };
    } catch (err) { throw toHttp(err); }
  }

  @Get('attachments/:id/:token')
  async attachment(
    @Param('id') id: string, @Param('token') token: string, @Res() reply: never,
  ): Promise<void> {
    const t = tokenParam.safeParse(token);
    if (!t.success) throw new BadRequestException({ code: 'invalid_request' });
    try {
      serveAttachment(reply, await authorizeAttachment(this.db, idParam.parse(id), {
        token: t.data,
      }));
    } catch (err) { throw toHttp(err); }
  }
}
