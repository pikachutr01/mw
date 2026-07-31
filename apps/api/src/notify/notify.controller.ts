/**
 * ⭐ BİLDİRİM UÇLARI (§7.2) — abonelik yönetimi ve kategori tercihleri.
 *
 * ⚠️ Bu controller **teslim etmez**, yalnız kaydeder. Teslim worker'da (`NotifyService.deliver`),
 * çünkü tetikleyici outbox satırıdır; buradan push atmak "olay → bildirim" zincirini ikiye
 * bölerdi.
 *
 * Abonelikler HESAP düzeyinde (`accounts`) tutulduğu için buradaki uçlar `worldId` kullanmaz;
 * tercihe iki dünyadan da aynı yerden bakılır.
 */
import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { NOTIFY_CATEGORIES, VAPID, pushEnabled } from './notify.limits.ts';
import { NotifyService } from './notify.service.ts';

const subscribeBody = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(300) }),
});

const prefsBody = z.object(
  Object.fromEntries(NOTIFY_CATEGORIES.map((c) => [c, z.boolean().optional()])),
) as z.ZodType<Partial<Record<(typeof NOTIFY_CATEGORIES)[number], boolean>>>;

@Controller('api/v1/push')
@UseGuards(AuthGuard)
export class NotifyController {
  private readonly service: NotifyService;

  constructor(@Inject(DB) db: Db) {
    // Bu örnek yalnız abonelik/tercih içindir; teslim bağımlılıkları (bus, isOnline, sender)
    // worker'daki örnekte kurulu.
    this.service = new NotifyService(db, { isOnline: () => false });
  }

  /**
   * ⭐ Açık anahtar env'den DEĞİL bu uçtan gelir.
   *
   * `VITE_VAPID_PUBLIC_KEY` yolu seçilseydi anahtar web paketine gömülürdü: anahtar
   * değiştiğinde (ya da dev/prod farklı olduğunda) web'in yeniden derlenmesi gerekirdi.
   * Uçtan servis edilince tek paket her ortamda çalışır.
   */
  @Get('vapid-key')
  key(): { publicKey: string | null; enabled: boolean } {
    return { publicKey: pushEnabled() ? VAPID.publicKey : null, enabled: pushEnabled() };
  }

  @Post('subscriptions')
  @HttpCode(204)
  async subscribe(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = subscribeBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    const ua = req.headers['user-agent'];
    const device = req.headers['x-device-id'];
    await this.service.subscribe({
      accountId: req.player!.accountId,
      sub: parsed.data,
      deviceId: Array.isArray(device) ? device[0] : device ?? null,
      userAgent: (Array.isArray(ua) ? ua[0] : ua)?.slice(0, 300) ?? null,
    });
  }

  @Delete('subscriptions')
  @HttpCode(204)
  async unsubscribe(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = z.object({ endpoint: z.string().max(1000) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    await this.service.unsubscribe(req.player!.accountId, parsed.data.endpoint);
  }

  @Get('prefs')
  async prefs(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    return { prefs: await this.service.prefs(req.player!.accountId), enabled: pushEnabled() };
  }

  /** PATCH: gövde KISMÎ — yalnız gönderilen kategoriler yazılır (jsonb birleştirme). */
  @Patch('prefs')
  async setPrefs(@Body() body: unknown, @Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const parsed = prefsBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    await this.service.setPrefs(req.player!.accountId, parsed.data);
    return { prefs: await this.service.prefs(req.player!.accountId) };
  }
}
