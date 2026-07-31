import {
  BadRequestException, Body, ConflictException, Controller, Get, HttpCode, HttpException,
  HttpStatus, Inject, Post, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { loginRequest, registerRequest } from '@mobiwar/contracts';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { extractDeviceContext } from '../abuse/device-context.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { EmailError, EmailTokenService } from '../mail/email-token.service.ts';
import { AuthError, AuthService, type AuthResult } from './auth.service.ts';
import { AuthGuard, type AuthedRequest } from './auth.guard.ts';

const registerBody = registerRequest.extend({ worldId: z.number().int().positive().default(1) });
const loginBody = loginRequest.extend({ worldId: z.number().int().positive().default(1) });
const refreshBody = z.object({ refreshToken: z.string().min(10) });
const tokenBody = z.object({ token: z.string().min(10).max(200) });
const resetBody = tokenBody.extend({ password: z.string().min(8).max(200) });
const forgotBody = z.object({ email: z.string().email().max(320) });
const changeBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

/** İstemciye dönen gövde — refresh token dâhil (web'de httpOnly çereze de yazılır). */
interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  player: { id: number; username: string; worldId: number };
  serverNow: string;
}

@Controller('api/v1/auth')
export class AuthController {
  private readonly emails: EmailTokenService;

  constructor(private readonly auth: AuthService, @Inject(DB) private readonly db: Db) {
    this.emails = new EmailTokenService(db);
  }

  @Post('register')
  async register(@Body() body: unknown, @Req() req: AuthedRequest): Promise<AuthResponse> {
    const parsed = registerBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.run(() => this.auth.register(parsed.data, extractDeviceContext(req)));
  }

  @Post('login')
  async login(@Body() body: unknown, @Req() req: AuthedRequest): Promise<AuthResponse> {
    const parsed = loginBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.run(() => this.auth.login(parsed.data, extractDeviceContext(req)));
  }

  @Post('refresh')
  async refresh(@Body() body: unknown, @Req() req: AuthedRequest): Promise<AuthResponse> {
    const parsed = refreshBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.run(() => this.auth.refresh(parsed.data.refreshToken, extractDeviceContext(req)));
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(@Req() req: AuthedRequest): Promise<{ ok: true }> {
    await this.auth.logout(req.player!.sessionId);
    return { ok: true };
  }

  /* ── E-posta doğrulama ve şifre (§9.2) ─────────────────────────────────────── */

  /** Hesap durumu — doğrulama şeridi ve Seçenekler paneli bunu okur. */
  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT email, email_verified_at FROM accounts WHERE id = ${req.player!.accountId}
    `);
    return {
      email: row?.['email'] == null ? null : String(row['email']),
      emailVerified: row?.['email_verified_at'] != null,
    };
  }

  /** Doğrulama e-postasını tekrar gönder (60 sn cooldown + günlük tavan). */
  @Post('verify-email/resend')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async resendVerification(@Req() req: AuthedRequest): Promise<void> {
    await this.mail(() => this.emails.resendVerification(
      req.player!.accountId, extractDeviceContext(req).ip,
    ));
  }

  /** Bağlantıdaki jetonu tüketir. Oturum GEREKMEZ: mail başka cihazda açılmış olabilir. */
  @Post('verify-email')
  async verifyEmail(@Body() body: unknown): Promise<{ email: string }> {
    const parsed = tokenBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_token' });
    return this.mail(() => this.emails.verify(parsed.data.token));
  }

  /**
   * ⚠️ **DAİMA 204** — adres kayıtlı olsa da olmasa da, kota dolsa da. Bu uç aksi hâlde
   * "bu e-posta bu oyunda kayıtlı mı" sorusunu cevaplayan bir sorgulama aracına dönerdi
   * (`auth.service.ts`teki sahte-hash zaman eşitlemesiyle aynı gerekçe).
   */
  @Post('forgot-password')
  @HttpCode(204)
  async forgotPassword(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = forgotBody.safeParse(body);
    if (!parsed.success) return;          // biçim hatası bile sızdırılmaz
    await this.emails.requestReset(parsed.data.email, extractDeviceContext(req).ip);
  }

  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() body: unknown): Promise<void> {
    const parsed = resetBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_token' });
    await this.mail(() => this.emails.resetPassword({
      token: parsed.data.token,
      password: parsed.data.password,
      revokeAll: (id) => this.auth.revokeAll(id),
    }));
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async changePassword(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = changeBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'weak_password' });
    await this.mail(() => this.emails.changePassword({
      accountId: req.player!.accountId,
      current: parsed.data.currentPassword,
      next: parsed.data.newPassword,
      revokeAll: (id) => this.auth.revokeAll(id),
    }));
  }

  /** `EmailError` → HTTP. `cooldown`/`quota` 429, gerisi 400 (kod gövdede). */
  private async mail<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof EmailError)) throw err;
      const payload = {
        code: err.code, message: err.message, retryAfterSeconds: err.retryAfterSeconds,
      };
      if (err.code === 'cooldown' || err.code === 'quota') {
        throw new HttpException(payload, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new BadRequestException(payload);
    }
  }

  /** Hata kodlarını HTTP durumlarına çevirir; iç mesajlar dışarı sızmaz. */
  private async run(fn: () => Promise<AuthResult>): Promise<AuthResponse> {
    try {
      const r = await fn();
      return {
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        accessExpiresAt: r.accessExpiresAt.toISOString(),
        refreshExpiresAt: r.refreshExpiresAt.toISOString(),
        player: { id: r.playerId, username: r.username, worldId: r.worldId },
        // İstemci LOKAL saate güvenmez; geri sayımları bu offset'ten çizer (§7).
        serverNow: new Date().toISOString(),
      };
    } catch (err) {
      if (err instanceof AuthError) {
        if (err.code === 'email_taken' || err.code === 'username_taken') {
          throw new ConflictException({ code: err.code, message: err.message });
        }
        throw new UnauthorizedException({ code: err.code, message: err.message });
      }
      throw err;
    }
  }
}
