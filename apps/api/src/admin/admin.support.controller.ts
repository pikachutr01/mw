/**
 * ⭐ DESTEK KUYRUĞU — yönetici tarafı (kullanıcı, 2026-08-14).
 *
 * ⚠️ **`AdminStepUpGuard` YOK ve bu bilinçli bir karar.** Deponun kendi kuralı step-up'ı
 * *yıkıcı* uçlara saklıyor. Talebi kapatmak hiçbir şey yok etmiyor, tam tersine çevrilebilir
 * (aç) ve `audit_log`a yazılıyor. Belirleyici gerekçe ise şu: kuyruğun EN SIK yapılan işlemi
 * için parola tekrarı istemek, operatörü yükseltilmiş oturumu sürekli açık tutmaya iter — bu
 * da step-up'ı **her yerde** zayıflatır. (Bir gün «talebi sil» ucu yazılırsa **o** step-up
 * ister; v1'de yazılmıyor, saklama işi hallediyor.)
 *
 * ⚠️ `moderator` da yanıtlayabilir: destek cevaplamak `admin` ayrıcalığı gerektirmiyor.
 */
import {
  BadRequestException, Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res,
  UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { replySupportTicketRequest, supportCategory, supportStatus } from '@mobilwar/contracts';
import { AuthGuard } from '../auth/auth.guard.ts';
import { clientIp } from '../auth/rate-limit.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { currentTraceId } from '../common/request-context.ts';
import { SupportService } from '../support/support.service.ts';
import { serveAttachment, toHttp } from '../support/support.controller.ts';
import { authorizeAttachment, handleUpload, type UploadPart } from '../support/upload.ts';
import { AdminGuard, type AdminRequest } from './admin.guard.ts';

const idParam = z.coerce.number().int().positive();
const listQuery = z.object({
  status: supportStatus.optional(),
  category: supportCategory.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(0).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
const statusBody = z.object({ status: supportStatus });

interface MultipartRequest { file?: (opts?: unknown) => Promise<UploadPart | undefined> }

@Controller('api/v1/admin/support')
@UseGuards(AuthGuard, AdminGuard)
export class AdminSupportController {
  private readonly service: SupportService;

  constructor(@Inject(DB) private readonly db: Db) {
    this.service = new SupportService(db);
  }

  @Get()
  async list(@Query() query: unknown): Promise<Record<string, unknown>> {
    const q = listQuery.safeParse(query ?? {});
    if (!q.success) throw new BadRequestException({ code: 'invalid_request' });
    try {
      const r = await this.service.adminList(q.data);
      return { ...r, pending: await this.service.pendingCount() };
    } catch (err) { throw toHttp(err); }
  }

  /** Sekme rozeti — ⭐ yöneticinin oyuncu yanıtları için mail almamasının telafisi. */
  @Get('stats')
  async stats(): Promise<{ pending: number }> {
    return { pending: await this.service.pendingCount() };
  }

  @Get(':id')
  async thread(@Param('id') id: string): Promise<Record<string, unknown>> {
    try {
      return await this.service.thread(idParam.parse(id), { staff: true });
    } catch (err) { throw toHttp(err); }
  }

  @Post(':id/messages')
  @HttpCode(201)
  async reply(
    @Req() req: AdminRequest, @Param('id') id: string, @Body() body: unknown,
  ): Promise<Record<string, unknown>> {
    const parsed = replySupportTicketRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    const ticketId = idParam.parse(id);
    try {
      await this.service.replyAsAdmin(ticketId, req.player!.accountId, parsed.data);
      await this.audit(req, 'admin.support.reply', ticketId, { hasAttachment: !!parsed.data.attachmentId });
      return { ok: true };
    } catch (err) { throw toHttp(err); }
  }

  @Post(':id/status')
  @HttpCode(200)
  async setStatus(
    @Req() req: AdminRequest, @Param('id') id: string, @Body() body: unknown,
  ): Promise<Record<string, unknown>> {
    const parsed = statusBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    const ticketId = idParam.parse(id);
    try {
      await this.service.setStatus(ticketId, parsed.data.status, req.player!.playerId);
      await this.audit(
        req,
        parsed.data.status === 'closed' ? 'admin.support.close' : 'admin.support.reopen',
        ticketId, { status: parsed.data.status },
      );
      return { ok: true };
    } catch (err) { throw toHttp(err); }
  }

  @Post('uploads')
  @HttpCode(201)
  async upload(@Req() req: AdminRequest): Promise<Record<string, unknown>> {
    try {
      const part = await (req as unknown as MultipartRequest).file?.();
      return {
        ...await handleUpload(this.db, part, {
          accountId: req.player!.accountId, ip: clientIp(req),
        }),
      };
    } catch (err) { throw toHttp(err); }
  }

  @Get('attachments/:id')
  async attachment(@Param('id') id: string, @Res() reply: never): Promise<void> {
    try {
      serveAttachment(reply, await authorizeAttachment(this.db, idParam.parse(id), { staff: true }));
    } catch (err) { throw toHttp(err); }
  }

  /**
   * ⚠️ `world_id` NULL olabilir (anonim talebin dünyası yok) — `audit_log.world_id` nullable,
   * mevcut desen bunu zaten karşılıyor. `player_id` **eylemi yapan yöneticinin** kimliği.
   */
  private async audit(
    req: AdminRequest, action: string, ticketId: number, payload: Record<string, unknown>,
  ): Promise<void> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT world_id FROM support_tickets WHERE id = ${ticketId}
    `);
    await this.db.execute(sql`
      INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after, trace_id)
      VALUES (${rows[0]?.['world_id'] ?? null}, ${req.player!.playerId}, ${action},
              'support_ticket', ${ticketId}, ${JSON.stringify(payload)}::jsonb,
              ${currentTraceId()})
    `);
  }
}
