/**
 * ⭐ TATİL MODU UÇLARI (§tatil modu).
 *
 * Üç uç, üçü de oyuncunun KENDİ hesabı üzerinde — hedef seçimi yok, dolayısıyla `cityId` de yok:
 * tatil oyuncu düzeyinde bir durum, şehir düzeyinde değil.
 *
 * ⚠️ Hata kodları `on_vacation` ailesiyle aynı: **403** «yapabileceğin bir şey değil»,
 * **409** «şimdi değil». `vacation_blocked` 409 çünkü engeller geçicidir (ordu varır, kuyruk
 * biter); `vacation_premium_only` 403 çünkü hesabın değişmesi gerekir.
 */
import {
  ConflictException, Controller, ForbiddenException, Get, NotFoundException, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import { GameClockService } from '../world/game-clock.service.ts';
import { VacationError, VacationService, type VacationStatus } from './vacation.service.ts';

@Controller('api/v1/vacation')
@UseGuards(AuthGuard)
export class VacationController {
  constructor(
    private readonly vacation: VacationService,
    private readonly clock: GameClockService,
  ) {}

  /** Durum + engel listesi. Ekran bu tek çağrıyla hem paneli hem düğmeyi çizebiliyor. */
  @Get()
  async status(@Req() req: AuthedRequest): Promise<VacationStatus> {
    const p = req.player!;
    const at = await this.clock.gameNow(p.worldId);
    return this.run(() => this.vacation.status(p.playerId, at));
  }

  @Post('enter')
  async enter(@Req() req: AuthedRequest): Promise<VacationStatus> {
    const p = req.player!;
    const at = await this.clock.gameNow(p.worldId);
    return this.run(() => this.vacation.enter(p.playerId, at));
  }

  @Post('leave')
  async leave(@Req() req: AuthedRequest): Promise<VacationStatus> {
    const p = req.player!;
    const at = await this.clock.gameNow(p.worldId);
    return this.run(() => this.vacation.leave(p.playerId, at));
  }

  private async run(fn: () => Promise<VacationStatus>): Promise<VacationStatus> {
    try {
      return await fn();
    } catch (err) {
      throw toHttp(err);
    }
  }
}

export function toHttp(err: unknown): Error {
  if (!(err instanceof VacationError)) return err as Error;
  const payload = { code: err.code, message: err.message, details: err.details };
  switch (err.code) {
    case 'player_not_found':
      return new NotFoundException(payload);
    case 'vacation_premium_only':
      return new ForbiddenException(payload);
    // Hepsi «şimdi olmaz»: engel kalkar, 48 saat dolar, zaten içindeysen çıkarsın.
    case 'vacation_blocked':
    case 'vacation_too_early':
    case 'already_on_vacation':
    case 'not_on_vacation':
      return new ConflictException(payload);
    default:
      return new ConflictException(payload);
  }
}
