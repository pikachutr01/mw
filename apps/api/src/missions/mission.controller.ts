/**
 * Saldırı gönderme ve "Ordular" ekranı.
 *
 * ⚠️ **Dünya kimliği daima token'dan** (`req.player.worldId`) gelir, istek yükünden ASLA
 * (§13.12.1b). Bu yüzden servise `worldId`'yi controller geçer, istemci değil.
 */
import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  HttpCode, Inject, NotFoundException, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { sendMissionRequest } from '@mobiwar/contracts';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import { toDate, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { GameClockService } from '../world/game-clock.service.ts';
import { MissionError, MissionService } from './mission.service.ts';

@Controller('api/v1/missions')
@UseGuards(AuthGuard)
export class MissionController {
  constructor(
    private readonly missions: MissionService,
    private readonly clock: GameClockService,
    @Inject(DB) private readonly db: Db,
  ) {}

  /** ⭐ `POST /api/v1/missions/attack` — orduyu yola çıkarır (birlikler ANINDA şehirden düşer). */
  @Post('attack')
  @HttpCode(201)
  async attack(@Body() body: unknown, @Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const player = req.player!;
    const parsed = sendMissionRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'invalid_request', issues: parsed.error.issues });
    }
    if (parsed.data.type !== 'attack') {
      throw new BadRequestException({ code: 'wrong_type', message: 'Bu uç yalnız saldırı görevi alır.' });
    }

    const at = await this.clock.gameNow(player.worldId);
    try {
      const m = await this.missions.sendAttack({
        originCityId: parsed.data.originCityId,
        playerId: player.playerId,
        worldId: player.worldId,
        target: parsed.data.target,
        units: parsed.data.units,
        heroIds: parsed.data.heroIds,
        at,
      });
      return {
        missionId: m.missionId,
        targetCityId: m.targetCityId,
        units: m.units,
        heroIds: m.heroIds,
        distance: m.distance,
        speed: m.speed,
        travelSeconds: m.travelSeconds,
        // Sunucu otoritesi: geri sayım BUNDAN çizilir, istemci lokal saate güvenmez (§7).
        executeAt: m.executeAt.toISOString(),
        gameNow: at.toISOString(),
        serverNow: new Date().toISOString(),
      };
    } catch (err) {
      throw toHttp(err);
    }
  }

  /**
   * "Ordular" ekranı — giden ve gelen hareketler.
   *
   * ⭐ GÖRÜNÜRLÜK MATRİSİ SORGUDA UYGULANIR (§13.10.1), istemciye ham liste ASLA gönderilmez:
   *   • kendi görevlerin: tam döküm (birim listesi dahil)
   *   • sana gelen saldırı: varış saati + kaynak koordinat — **birleşim GİZLİ**
   *   • dönüş bacakları (`type='return'`): hedef tarafın sorgusuna hiç girmez
   */
  @Get()
  async list(@Req() req: AuthedRequest, @Query('cityId') cityId?: string): Promise<Record<string, unknown>> {
    const player = req.player!;
    const gameNow = await this.clock.gameNow(player.worldId);
    const cityFilter = cityId ? Number(cityId) : null;

    const outgoing = await this.db.execute<Record<string, unknown>>(sql`
      SELECT m.id, m.type, m.origin_city_id, m.target_city_id, m.target_k, m.target_d, m.target_s,
             m.execute_at, m.created_at,
             COALESCE(json_object_agg(mu.unit_type, mu.count)
                      FILTER (WHERE mu.unit_type IS NOT NULL), '{}'::json) AS units
        FROM missions m
        LEFT JOIN mission_units mu ON mu.mission_id = m.id
       WHERE m.world_id = ${player.worldId}
         AND m.owner_player_id = ${player.playerId}
         AND m.status IN ('scheduled', 'running')
         AND m.type IN ('attack', 'return', 'transport', 'support', 'spy')
         AND (${cityFilter}::bigint IS NULL OR m.origin_city_id = ${cityFilter}::bigint)
       GROUP BY m.id
       ORDER BY m.execute_at
    `);

    // Gelen saldırılar: yalnız SALDIRI gidişi görünür; `return` bu sorguya hiç girmez.
    const incoming = await this.db.execute<Record<string, unknown>>(sql`
      SELECT m.id, m.execute_at, m.target_city_id,
             o.k AS origin_k, o.d AS origin_d, o.s AS origin_s
        FROM missions m
        JOIN cities c ON c.id = m.target_city_id
        LEFT JOIN cities o ON o.id = m.origin_city_id
       WHERE m.world_id = ${player.worldId}
         AND m.type = 'attack'
         AND m.status IN ('scheduled', 'running')
         AND c.player_id = ${player.playerId}
         AND (${cityFilter}::bigint IS NULL OR m.target_city_id = ${cityFilter}::bigint)
       ORDER BY m.execute_at
    `);

    return {
      gameNow: gameNow.toISOString(),
      serverNow: new Date().toISOString(),
      outgoing: outgoing.map((r) => ({
        id: Number(r['id']),
        type: String(r['type']),
        originCityId: r['origin_city_id'] == null ? null : Number(r['origin_city_id']),
        targetCityId: r['target_city_id'] == null ? null : Number(r['target_city_id']),
        target: r['target_k'] == null
          ? null
          : { k: Number(r['target_k']), d: Number(r['target_d']), s: Number(r['target_s']) },
        executeAt: toDate(r['execute_at']).toISOString(),
        units: r['units'] ?? {},
      })),
      incoming: incoming.map((r) => ({
        id: Number(r['id']),
        targetCityId: Number(r['target_city_id']),
        origin: r['origin_k'] == null
          ? null
          : { k: Number(r['origin_k']), d: Number(r['origin_d']), s: Number(r['origin_s']) },
        arrivesAt: toDate(r['execute_at']).toISOString(),
        // ⭐ `units` BİLEREK YOK: birleşim gizlidir, öğrenmek için casusluk gerekir (§13.10.1).
      })),
    };
  }
}

/** Alan hatalarını HTTP'ye çevirir; kodlar istemcide i18n anahtarı olarak kullanılır. */
function toHttp(err: unknown): Error {
  if (!(err instanceof MissionError)) return err as Error;
  const payload = { code: err.code, message: err.message, details: err.details };
  switch (err.code) {
    case 'city_not_found':
    case 'target_not_found':
      return new NotFoundException(payload);
    case 'not_owner':
    case 'world_mismatch':
    case 'target_protected':
    case 'target_vacation':
      return new ForbiddenException(payload);
    case 'attack_limit':
    case 'march_limit':
    case 'insufficient_units':
    case 'hero_unavailable':
      return new ConflictException(payload);
    default:
      return new BadRequestException(payload);
  }
}
