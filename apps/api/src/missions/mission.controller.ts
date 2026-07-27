/**
 * Saldırı gönderme ve "Ordular" ekranı.
 *
 * ⚠️ **Dünya kimliği daima token'dan** (`req.player.worldId`) gelir, istek yükünden ASLA
 * (§13.12.1b). Bu yüzden servise `worldId`'yi controller geçer, istemci değil.
 */
import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  HttpCode, Inject, NotFoundException, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { sendMissionRequest } from '@mobiwar/contracts';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import { toDate, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { GameClockService } from '../world/game-clock.service.ts';
import { CANCELABLE_TYPES, MissionError, MissionService } from './mission.service.ts';

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
   * ⭐ `POST /api/v1/missions/:id/cancel` — yoldaki orduyu geri çağırır.
   * Dönüş süresi GİDİLEN yol kadardır (bkz. `MissionService.cancelMission`).
   */
  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Param('id') id: string, @Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const player = req.player!;
    const at = await this.clock.gameNow(player.worldId);
    try {
      const r = await this.missions.cancelMission({
        missionId: Number(id), playerId: player.playerId, worldId: player.worldId, at,
      });
      return {
        returnMissionId: r.returnMissionId,
        returnSeconds: r.returnSeconds,
        executeAt: r.executeAt.toISOString(),
        gameNow: at.toISOString(),
        serverNow: new Date().toISOString(),
      };
    } catch (err) {
      throw toHttp(err);
    }
  }

  /**
   * ⭐ "Ordular" ekranı — şehirlerimle ilgili TÜM ordu hareketleri, tek düz liste.
   *
   * Her hareket bir **çıpa şehre** (`cityId`) asılır: arayüz o şehrin kale simgesinin altına
   * dizer (orijinal davranış — `images/mobil arayüz2.jpg`). Kendi şehirlerim arasındaki bir
   * nakliye İKİ hareket üretir: kaynakta `transport_out`, hedefte `transport_back`.
   *
   * ⭐ GÖRÜNÜRLÜK MATRİSİ SORGUDA UYGULANIR (§13.10.1), istemciye ham liste ASLA gönderilmez:
   *   • kendi görevlerim: tam döküm (birim listesi dahil)
   *   • bana gelen saldırı: varış saati + kaynak koordinat — **birleşim GİZLİ** (`units` YOK)
   *   • saldırı dönüş bacağı: hedefin sorgusuna hiç girmez (çünkü `target_city_id` saldıranın
   *     kendi şehridir — savunanla eşleşmez)
   */
  @Get()
  async list(@Req() req: AuthedRequest, @Query('cityId') cityId?: string): Promise<Record<string, unknown>> {
    const player = req.player!;
    const gameNow = await this.clock.gameNow(player.worldId);
    const cityFilter = cityId ? Number(cityId) : null;

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      WITH my AS (
        SELECT id FROM cities WHERE world_id = ${player.worldId} AND player_id = ${player.playerId}
      )
      SELECT m.id, m.type, m.status, m.payload, m.owner_player_id,
             m.origin_city_id, m.target_city_id,
             m.target_k, m.target_d, m.target_s, m.execute_at, m.created_at,
             oc.k AS ok, oc.d AS od, oc.s AS os, op.username AS oname,
             tc.k AS tk, tc.d AS td, tc.s AS ts, tp.username AS tname,
             (m.origin_city_id IN (SELECT id FROM my)) AS origin_is_mine,
             (m.target_city_id IN (SELECT id FROM my)) AS target_is_mine,
             COALESCE(json_object_agg(mu.unit_type, mu.count)
                      FILTER (WHERE mu.unit_type IS NOT NULL), '{}'::json) AS units
        FROM missions m
        LEFT JOIN mission_units mu ON mu.mission_id = m.id
        LEFT JOIN cities oc ON oc.id = m.origin_city_id
        LEFT JOIN players op ON op.id = oc.player_id
        LEFT JOIN cities tc ON tc.id = m.target_city_id
        LEFT JOIN players tp ON tp.id = tc.player_id
       WHERE m.world_id = ${player.worldId}
         AND m.status IN ('scheduled', 'running')
         AND m.type IN ('attack', 'return', 'transport', 'support', 'spy', 'found_city')
         AND (m.origin_city_id IN (SELECT id FROM my) OR m.target_city_id IN (SELECT id FROM my))
       GROUP BY m.id, oc.k, oc.d, oc.s, op.username, tc.k, tc.d, tc.s, tp.username
       ORDER BY m.created_at, m.id
    `);

    const movements: Record<string, unknown>[] = [];
    for (const r of rows) {
      const type = String(r['type']);
      const status = String(r['status']);
      const payload = (r['payload'] ?? {}) as Record<string, unknown>;
      /** Dönüşün ASLI: casusluk dönüşü kuş simgesi göstermeli, kılıç değil. */
      const returnOf = payload['returnOf'] == null ? 'attack' : String(payload['returnOf']);
      const canceled = payload['canceled'] === true;
      const mine = Boolean(r['origin_is_mine']);
      const targetMine = Boolean(r['target_is_mine']);
      const origin = r['ok'] == null
        ? null : { k: Number(r['ok']), d: Number(r['od']), s: Number(r['os']) };
      const target = r['tk'] == null
        ? (r['target_k'] == null
          ? null : { k: Number(r['target_k']), d: Number(r['target_d']), s: Number(r['target_s']) })
        : { k: Number(r['tk']), d: Number(r['td']), s: Number(r['ts']) };

      const base = {
        id: Number(r['id']),
        type,
        /** Dönüş bacağında hangi görevden dönüldüğü (arayüz "casusluk dönüşü" yazabilsin). */
        returnOf: type === 'return' ? returnOf : null,
        canceled: type === 'return' ? canceled : false,
        startedAt: toDate(r['created_at']).toISOString(),
        executeAt: toDate(r['execute_at']).toISOString(),
        origin,
        originPlayer: r['oname'] == null ? null : String(r['oname']),
        target,
        targetPlayer: r['tname'] == null ? null : String(r['tname']),
      };

      // GİDEN bacak — çıpa: kaynak şehir (benim).
      if (mine) {
        const icon = OUT_ICON[type];
        if (icon) {
          movements.push({
            ...base, key: `${r['id']}-out`, direction: 'out', icon,
            cityId: Number(r['origin_city_id']),
            units: r['units'] ?? {},
            // İptal yalnız HENÜZ İŞLENMEMİŞ görevde mümkün; worker aldıysa savaş çözülüyordur.
            canCancel: status === 'scheduled' && CANCELABLE_TYPES.includes(type),
          });
        }
      }
      // GELEN bacak — çıpa: hedef şehir (benim).
      if (targetMine) {
        const icon = type === 'return' ? (OUT_ICON[returnOf] ?? 'attack') : IN_ICON[type];
        if (icon) {
          movements.push({
            ...base, key: `${r['id']}-in`,
            // Kendi ordumun dönüşü "gelen tehdit" değil; yön `own` ile ayrılıyor.
            direction: type === 'return' ? 'own' : 'in',
            icon,
            cityId: Number(r['target_city_id']),
            // ⭐ Yabancı hareketinde birleşim GİZLİ: `units` bilerek yok (§13.10.1).
            ...(type === 'return' ? { units: r['units'] ?? {} } : {}),
            canCancel: false,
          });
        }
      }
    }

    const filtered = cityFilter == null
      ? movements : movements.filter((m) => m['cityId'] === cityFilter);

    return {
      gameNow: gameNow.toISOString(),
      serverNow: new Date().toISOString(),
      // Sıra GÖREVİN BAŞLADIĞI ana göre (kullanıcı kuralı) — varış sırası değil.
      movements: filtered,
    };
  }
}

/**
 * Görev tipi → simge dosyası (§13.11.9: dosya adı = katalog `id`).
 * Eşleme kullanıcının tanımından birebir (`duzenleme_onerileri.txt`).
 */
const OUT_ICON: Record<string, string> = {
  attack: 'attack',
  transport: 'transport_out',
  support: 'support_out',
  spy: 'spy_out',
  found_city: 'found_city',
  // `return` giden bacak üretmez: kaynağı düşmanın şehridir, benim değil.
};

const IN_ICON: Record<string, string> = {
  attack: 'attack_in',
  transport: 'transport_back',
  support: 'support_in',
  spy: 'spy_back',
};

/** Alan hatalarını HTTP'ye çevirir; kodlar istemcide i18n anahtarı olarak kullanılır. */
function toHttp(err: unknown): Error {
  if (!(err instanceof MissionError)) return err as Error;
  const payload = { code: err.code, message: err.message, details: err.details };
  switch (err.code) {
    case 'city_not_found':
    case 'target_not_found':
    case 'mission_not_found':
      return new NotFoundException(payload);
    case 'not_cancelable':
      return new ConflictException(payload);
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
