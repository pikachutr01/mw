/**
 * ⭐ ADMİN — Faz 0: oturum künyesi + adım yükseltme.
 *
 * Panelin ilk açılışta sorduğu tek soru: *"ben kimim, neye yetkim var, yükseltmem taze mi"*.
 * Sonraki fazların ekranları bu controller'a eklenecek.
 *
 * ⚠️ Rota `/api/v1/admin/*`. Panel ayrı bir alt alanda (`yonetim.…`) yaşıyor ama API aynı
 * kökende: ayrı bir API süreci açmak ikinci bir dağıtım hedefi demekti ve kazancı yoktu —
 * yetki sınırı süreçte değil `AdminGuard`ta.
 */
import {
  BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Req, UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.ts';
import { PasswordService } from '../auth/password.service.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { AdminGuard, AdminStepUpGuard, type AdminRequest } from './admin.guard.ts';

const stepUpBody = z.object({ password: z.string().min(1).max(200) });

/** Yükseltmenin ömrü. Kısa tutuldu: panel açık unutulan bir sekmede sınırsız yetki kalmasın. */
export const STEP_UP_MINUTES = 15;

@Controller('api/v1/admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  private readonly passwords = new PasswordService();

  constructor(@Inject(DB) private readonly db: Db) {}

  /** Panelin açılış çağrısı: kim, hangi rol, yükseltme taze mi. */
  @Get('me')
  async me(@Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const player = req.player!;
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.email, p.username FROM accounts a
        JOIN players p ON p.id = ${player.playerId}
       WHERE a.id = ${player.accountId}
    `);
    return {
      accountId: player.accountId,
      username: String(row?.['username'] ?? ''),
      email: String(row?.['email'] ?? ''),
      role: req.staff!.role,
      elevated: req.staff!.elevated,
      stepUpMinutes: STEP_UP_MINUTES,
    };
  }

  /**
   * ⭐ ADIM YÜKSELTME — parolayı yeniden sorar, oturuma 15 dakikalık pencere yazar.
   *
   * ⚠️ Yanlış parolada **bilerek sayaç artırılmıyor** (`accounts.failed_logins`). O sayaç giriş
   * ucunun kaba kuvvet kilididir; buradaki kullanıcı zaten kimliğini kanıtlamış bir admin ve
   * yanlış yazması kendi hesabını kilitlememeli. Kaba kuvvet riski yok: saldırganın buraya
   * gelmesi için geçerli bir admin oturumu ele geçirmiş olması gerekir — o noktada zaten
   * kaybedilmiş bir savaş.
   */
  @Post('step-up')
  @HttpCode(200)
  async stepUp(@Body() body: unknown, @Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const parsed = stepUpBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Parola gerekli.');
    const player = req.player!;

    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT password_hash FROM accounts WHERE id = ${player.accountId}
    `);
    const ok = row
      ? await this.passwords.verify(String(row['password_hash']), parsed.data.password)
      : false;
    if (!ok) throw new UnauthorizedException('Parola yanlış.');

    const until = new Date(Date.now() + STEP_UP_MINUTES * 60_000);
    await this.db.execute(sql`
      UPDATE sessions SET elevated_until = ${until.toISOString()}::timestamptz
       WHERE id = ${player.sessionId}::uuid
    `);
    return { elevated: true, elevatedUntil: until.toISOString() };
  }

  /** Yükseltmeyi elle bırak (panelden çıkarken). Yıkıcı değil → step-up guard'ı yok. */
  @Post('step-down')
  @HttpCode(204)
  async stepDown(@Req() req: AdminRequest): Promise<void> {
    await this.db.execute(sql`
      UPDATE sessions SET elevated_until = NULL WHERE id = ${req.player!.sessionId}::uuid
    `);
  }

  /**
   * Yükseltme kapısının gerçekten kapalı olduğunu ölçmek için bir prob ucu (Faz 0 doğrulaması).
   * Sonraki fazlarda gerçek yıkıcı uçlar aynı guard'ı kullanacak.
   */
  @Post('echo-elevated')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  echoElevated(): Record<string, unknown> {
    return { ok: true };
  }
}
