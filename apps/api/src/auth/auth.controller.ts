import {
  BadRequestException, Body, ConflictException, Controller, Post, Req, UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { loginRequest, registerRequest } from '@mobiwar/contracts';
import { z } from 'zod';
import { extractDeviceContext } from '../abuse/device-context.ts';
import { AuthError, AuthService, type AuthResult } from './auth.service.ts';
import { AuthGuard, type AuthedRequest } from './auth.guard.ts';

const registerBody = registerRequest.extend({ worldId: z.number().int().positive().default(1) });
const loginBody = loginRequest.extend({ worldId: z.number().int().positive().default(1) });
const refreshBody = z.object({ refreshToken: z.string().min(10) });

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
  constructor(private readonly auth: AuthService) {}

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
