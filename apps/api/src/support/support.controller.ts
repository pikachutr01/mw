/**
 * ⭐ DESTEK UÇLARI — giriş yapmış oyuncu.
 *
 * ⚠️ **Doğrulanmamış hesap kısıtı burada UYGULANMAZ ve bu bilerek.** `unverified.ts` kuralları
 * üç servis boğazında duruyor; destek servisi onları çağırmıyor. Sebep tek cümle: *"doğrulama
 * maili gelmedi"* tam da destek yazma sebebidir. Sohbetin «mesaj yazma yasak» kuralı buraya
 * kopyalanmamalı — bu satır o kopyalamayı önlemek için var.
 *
 * ⚠️ `worldId` istek yükünden ASLA okunmuyor; `req.player` üzerinden geliyor (dünya yalıtımı).
 */
import {
  BadRequestException, Body, Controller, Get, HttpCode, HttpException, Inject, Param, Post,
  Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { createSupportTicketRequest, replySupportTicketRequest } from '@mobilwar/contracts';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import { clientIp } from '../auth/rate-limit.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { resolvePath, xAccelPath, xAccelPrefix } from './storage.ts';
import { SupportError, SupportService, type ActorAuthed } from './support.service.ts';
import { authorizeAttachment, handleUpload, type UploadPart } from './upload.ts';

const idParam = z.coerce.number().int().positive();

/** Servis hatasını HTTP'ye çevirir; kod istemciye AYNEN gider (Türkçeleştirme istemcide). */
export function toHttp(err: unknown): HttpException {
  if (err instanceof SupportError) {
    return new HttpException({ code: err.code }, err.status);
  }
  return err instanceof HttpException ? err : new BadRequestException({ code: 'invalid_request' });
}

/** Fastify multipart erişimi — kütüphane tipine bağlanmamak için dar bir arayüz. */
interface MultipartRequest { file?: (opts?: unknown) => Promise<UploadPart | undefined> }

/**
 * ⭐ Yanıtı `X-Accel-Redirect` ile nginx'e devreder; nginx yoksa (geliştirme) dosyayı akıtır.
 *
 * ⚠️ Kullanıcı "disk + nginx" dedi, ama ek **özel yazışmanın parçası**: nginx'in dosyayı
 * doğrudan servis etmesi URL'yi bilen herkese açardı. Bu desen ikisini birleştiriyor — yetkiyi
 * API verir, baytları nginx taşır.
 * ⚠️ `Content-Type` **bizim sniff'imizden** yazılıyor, istemciden değil; `nosniff` ile birlikte
 * yüklenen bir dosyanın tarayıcıda HTML olarak yorumlanma ihtimalini kapatıyor.
 * ⚠️ `no-store`: Cloudflare özel bir yazışma ekini önbelleğe ALMAMALI.
 */
export function serveAttachment(
  reply: { header(k: string, v: string): unknown; send(body?: unknown): unknown },
  a: { storageKey: string; mime: string },
): void {
  reply.header('content-type', a.mime);
  reply.header('content-disposition', 'inline');
  reply.header('x-content-type-options', 'nosniff');
  reply.header('cache-control', 'private, no-store');
  if (xAccelPrefix()) {
    reply.header('x-accel-redirect', xAccelPath(a.storageKey));
    reply.send();                       // gövde YOK — baytları nginx dolduruyor
    return;
  }
  reply.send(createReadStream(resolvePath(a.storageKey)));
}

@Controller('api/v1/support')
@UseGuards(AuthGuard)
export class SupportController {
  private readonly service: SupportService;

  constructor(@Inject(DB) private readonly db: Db) {
    this.service = new SupportService(db);
  }

  /** `req.player` kimlik taşıyor ama e-posta/ad taşımıyor — talep için ikisi de gerekli. */
  private async actor(req: AuthedRequest): Promise<ActorAuthed> {
    const p = req.player!;
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.email, a.email_verified_at, pl.username
        FROM players pl JOIN accounts a ON a.id = pl.account_id
       WHERE pl.id = ${p.playerId}
    `);
    const r = rows[0];
    if (!r) throw new SupportError('invalid_request', 404);
    return {
      kind: 'user',
      accountId: p.accountId,
      playerId: p.playerId,
      worldId: p.worldId,
      username: String(r['username']),
      email: String(r['email']),
      emailVerified: r['email_verified_at'] != null,
    };
  }

  @Get()
  async list(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    try {
      const tickets = await this.service.listForAccount(req.player!.accountId);
      return { tickets, unread: await this.service.unreadForAccount(req.player!.accountId) };
    } catch (err) { throw toHttp(err); }
  }

  /**
   * ⭐ Form açılışı: e-posta alanının gösterilip gösterilmeyeceğini SUNUCU söyler.
   *
   * ⚠️ İstemcinin `me` yanıtından türetmesi de mümkündü ama kural iki yere yazılırdı; burada
   * tek yerde duruyor ve kullanıcının şartını birebir taşıyor: doğrulanmışsa alan yok,
   * doğrulanmamışsa ön-dolu ve değiştirilebilir.
   */
  @Get('form')
  async form(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    try {
      const a = await this.actor(req);
      return {
        email: a.email,
        emailVerified: a.emailVerified,
        showEmailField: !a.emailVerified,
      };
    } catch (err) { throw toHttp(err); }
  }

  @Get(':id')
  async thread(
    @Req() req: AuthedRequest, @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.service.thread(idParam.parse(id), { accountId: req.player!.accountId });
    } catch (err) { throw toHttp(err); }
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: AuthedRequest, @Body() body: unknown,
  ): Promise<Record<string, unknown>> {
    const parsed = createSupportTicketRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    try {
      const a = await this.actor(req);
      const { ticketId } = await this.service.create(a, parsed.data);
      return { ticketId };
    } catch (err) { throw toHttp(err); }
  }

  @Post(':id/messages')
  @HttpCode(201)
  async reply(
    @Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown,
  ): Promise<Record<string, unknown>> {
    const parsed = replySupportTicketRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    try {
      await this.service.replyAsUser(
        idParam.parse(id), { accountId: req.player!.accountId }, parsed.data,
      );
      return { ok: true };
    } catch (err) { throw toHttp(err); }
  }

  @Post('uploads')
  @HttpCode(201)
  async upload(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    try {
      const part = await (req as unknown as MultipartRequest).file?.();
      const r = await handleUpload(this.db, part, {
        accountId: req.player!.accountId, ip: clientIp(req),
      });
      return { ...r };
    } catch (err) { throw toHttp(err); }
  }

  @Get('attachments/:id')
  async attachment(
    @Req() req: AuthedRequest, @Param('id') id: string, @Res() reply: never,
  ): Promise<void> {
    try {
      const a = await authorizeAttachment(this.db, idParam.parse(id), {
        accountId: req.player!.accountId,
      });
      serveAttachment(reply, a);
    } catch (err) { throw toHttp(err); }
  }

  /** Sol menü rozeti — liste çekmeden tek sayı. */
  @Get('unread/count')
  async unread(@Req() req: AuthedRequest, @Query('_') _q?: string): Promise<{ unread: number }> {
    return { unread: await this.service.unreadForAccount(req.player!.accountId) };
  }
}
