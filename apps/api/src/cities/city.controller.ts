import {
  Controller, ForbiddenException, Get, NotFoundException, Param, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import { CityService } from './city.service.ts';
import { GameClockService } from '../world/game-clock.service.ts';

@Controller('api/v1/cities')
@UseGuards(AuthGuard)
export class CityController {
  constructor(
    private readonly cities: CityService,
    private readonly clock: GameClockService,
  ) {}

  /**
   * Şehir durumu. Okuma anında tembel birikim işletilir → oyuncu her zaman güncel kaynağı görür,
   * arka planda tick çalışmasına gerek kalmaz (§3).
   */
  @Get(':id')
  async get(@Param('id') id: string, @Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const player = req.player!;
    const gameNow = await this.clock.gameNow(player.worldId);
    const snap = await this.cities.snapshot(Number(id), gameNow);
    if (!snap) throw new NotFoundException('Şehir bulunamadı.');

    // ⭐ Sahiplik doğrulaması (§9): şehir gerçekten bu oyuncunun mu? Dünya kimliği de token'dan
    // geldiği için başka dünyanın şehri hiç görünmez.
    if (snap.playerId !== player.playerId || snap.worldId !== player.worldId) {
      throw new ForbiddenException('Bu şehir sizin değil.');
    }

    return {
      id: snap.id,
      name: snap.name,
      coordinates: { k: snap.k, d: snap.d, s: snap.s },
      isCapital: snap.isCapital,
      resources: { gold: snap.gold, food: snap.food },
      production: { goldPerHour: snap.goldPerHour, foodPerHour: snap.foodPerHour },
      buildings: snap.buildings,
      serverNow: new Date().toISOString(),
      gameNow: gameNow.toISOString(),
    };
  }
}
