/**
 * Şehir ekranı + üretim/ilerletme kuyruğu uçları.
 *
 * ⭐ Şehir okuması **tembel birikimi işletir** (§3): oyuncu her zaman güncel kaynağı görür,
 * arka planda tick çalışmasına gerek kalmaz.
 * ⚠️ Sahiplik ve dünya kimliği HER uçta doğrulanır; `worldId` token'dan gelir (§13.12.1b).
 */
import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get,
  HttpCode, Inject, NotFoundException, Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { enqueueRequest } from '@mobiwar/contracts';
import {
  BUILDINGS, BUILDING_REQUIREMENTS, TECHS, TECH_REQUIREMENTS, UNITS, UNIT_REQUIREMENTS,
  buildingCost, techCost, unitCost,
} from '@mobiwar/catalog';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { QueueError, QueueService } from '../queues/queue.service.ts';
import { GameClockService } from '../world/game-clock.service.ts';
import { CapacityService } from './capacity.service.ts';
import { CityService } from './city.service.ts';

@Controller('api/v1/cities')
@UseGuards(AuthGuard)
export class CityController {
  private readonly capacity = new CapacityService();

  constructor(
    private readonly cities: CityService,
    private readonly queues: QueueService,
    private readonly clock: GameClockService,
    @Inject(DB) private readonly db: Db,
  ) {}

  /** Oyuncunun şehirleri — üstteki kalıcı şehir seçicisini besler. */
  @Get()
  async list(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const player = req.player!;
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, name, k, d, s, is_capital FROM cities
       WHERE world_id = ${player.worldId} AND player_id = ${player.playerId}
       ORDER BY is_capital DESC, id
    `);
    return {
      cities: rows.map((r) => ({
        id: Number(r['id']),
        name: String(r['name']),
        coordinates: { k: Number(r['k']), d: Number(r['d']), s: Number(r['s']) },
        isCapital: Boolean(r['is_capital']),
      })),
    };
  }

  /**
   * Şehrin tam durumu: kaynak + üretim + yapılar + ordu + savunma + teknikler + açık kuyruklar
   * + alan bütçeleri. Tek çağrı, çünkü Şehir sekmesi hepsini aynı anda gösteriyor.
   */
  @Get(':id')
  async get(@Param('id') id: string, @Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const player = req.player!;
    const cityId = Number(id);
    const gameNow = await this.clock.gameNow(player.worldId);
    const snap = await this.cities.snapshot(cityId, gameNow);
    if (!snap) throw new NotFoundException('Şehir bulunamadı.');
    if (snap.playerId !== player.playerId || snap.worldId !== player.worldId) {
      throw new ForbiddenException('Bu şehir sizin değil.');
    }

    const [unitRows, defRows, techRows] = await Promise.all([
      this.db.execute<Record<string, unknown>>(sql`SELECT type, count FROM units WHERE city_id = ${cityId}`),
      this.db.execute<Record<string, unknown>>(sql`SELECT type, count FROM defenses WHERE city_id = ${cityId}`),
      this.db.execute<Record<string, unknown>>(sql`SELECT type, level FROM techs WHERE player_id = ${player.playerId}`),
    ]);
    const units = mapCounts(unitRows, 'count');
    const defenses = mapCounts(defRows, 'count');
    const techs = mapCounts(techRows, 'level');

    return {
      id: snap.id,
      name: snap.name,
      coordinates: { k: snap.k, d: snap.d, s: snap.s },
      isCapital: snap.isCapital,
      resources: { gold: snap.gold, food: snap.food },
      production: { goldPerHour: snap.goldPerHour, foodPerHour: snap.foodPerHour },
      buildings: snap.buildings,
      units,
      defenses,
      techs,
      queues: (await this.queues.openQueues(cityId)).map((q) => ({
        ...q,
        startedAt: q.startedAt.toISOString(),
        finishAt: q.finishAt.toISOString(),
      })),
      capacity: this.capacity.status(snap.buildings, defenses),
      serverNow: new Date().toISOString(),
      gameNow: gameNow.toISOString(),
    };
  }

  /**
   * Katalog + bir sonraki seviyenin maliyeti. İstemci maliyeti KENDİ hesaplamaz; formül tek
   * yerde (sunucuda) kalsın diye buradan okur — denge değişince arayüz kendiliğinden düzelir.
   */
  @Get(':id/catalog')
  async catalog(@Param('id') id: string, @Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const player = req.player!;
    const cityId = Number(id);
    const owner = await this.assertOwn(cityId, player.playerId, player.worldId);
    const gameNow = await this.clock.gameNow(player.worldId);
    const snap = (await this.cities.snapshot(cityId, gameNow))!;
    void owner;

    const techRows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT type, level FROM techs WHERE player_id = ${player.playerId}
    `);
    const defRows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT type, count FROM defenses WHERE city_id = ${cityId}
    `);
    const techs = mapCounts(techRows, 'level');
    const defenses = mapCounts(defRows, 'count');

    return {
      buildings: BUILDINGS.map((b) => {
        const level = snap.buildings[b.id] ?? 0;
        const next = level + 1;
        return {
          id: b.id, name: b.name.tr, level, maxLevel: b.maxLevel,
          nextCost: next <= b.maxLevel ? buildingCost(b.id, next) : null,
          requirements: BUILDING_REQUIREMENTS[b.id] ?? {},
        };
      }),
      units: UNITS.filter((u) => u.kind === 'warrior').map((u) => ({
        id: u.id, name: u.name.tr, area: u.area, speed: u.speed,
        cost: unitCost(u.id, 1),
        requirements: UNIT_REQUIREMENTS[u.id] ?? {},
      })),
      defenses: UNITS.filter((u) => u.kind === 'defense' && u.id !== 'temple').map((u) => ({
        id: u.id, name: u.name.tr, area: u.area,
        /** Sur ve Büyü Kalkanı ADET değil SEVİYE taşır (§13.11.1b). */
        levelBased: u.id === 'wall' || u.id === 'magic_shield',
        current: defenses[u.id] ?? 0,
        cost: unitCost(u.id, 1),
        requirements: UNIT_REQUIREMENTS[u.id] ?? {},
      })),
      techs: TECHS.map((t) => {
        const level = techs[t.id] ?? 0;
        return {
          id: t.id, name: t.name.tr, level,
          nextCost: techCost(t.id, level + 1),
          requirements: TECH_REQUIREMENTS[t.id] ?? {},
        };
      }),
    };
  }

  /** Kuyruğa kalem ekler (yapı · savaşçı · savunma · teknik). */
  @Post(':id/queues')
  @HttpCode(201)
  async enqueue(
    @Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const player = req.player!;
    const parsed = enqueueRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'invalid_request', issues: parsed.error.issues });
    }
    const cityId = Number(id);
    const at = await this.clock.gameNow(player.worldId);
    const opts = { cityId, playerId: player.playerId, type: parsed.data.type, at };

    try {
      const item = await (
        parsed.data.category === 'building' ? this.queues.enqueueBuilding(opts)
          : parsed.data.category === 'tech' ? this.queues.enqueueTech(opts)
            : parsed.data.category === 'unit'
              ? this.queues.enqueueUnits({ ...opts, count: parsed.data.count ?? 1 })
              : this.queues.enqueueDefense({ ...opts, count: parsed.data.count ?? 1 })
      );
      return {
        ...item,
        startedAt: item.startedAt.toISOString(),
        finishAt: item.finishAt.toISOString(),
        gameNow: at.toISOString(),
        serverNow: new Date().toISOString(),
      };
    } catch (err) {
      throw toHttp(err);
    }
  }

  /** Kuyruk iptali — iade kuralı dokümandan (süreye göre / bir birim eksik). */
  @Delete('queues/:queueId')
  async cancel(@Param('queueId') queueId: string, @Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const player = req.player!;
    const at = await this.clock.gameNow(player.worldId);
    try {
      return await this.queues.cancel({ queueId: Number(queueId), playerId: player.playerId, at });
    } catch (err) {
      throw toHttp(err);
    }
  }

  private async assertOwn(cityId: number, playerId: number, worldId: number): Promise<void> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT player_id, world_id FROM cities WHERE id = ${cityId}
    `);
    const c = rows[0];
    if (!c) throw new NotFoundException('Şehir bulunamadı.');
    if (Number(c['player_id']) !== playerId || Number(c['world_id']) !== worldId) {
      throw new ForbiddenException('Bu şehir sizin değil.');
    }
  }
}

function mapCounts(rows: Record<string, unknown>[], field: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r['type'])] = Number(r[field]);
  return out;
}

/** Kuyruk hatalarını HTTP'ye çevirir; `code` istemcide i18n anahtarı olur. */
function toHttp(err: unknown): Error {
  if (!(err instanceof QueueError)) return err as Error;
  const payload = { code: err.code, message: err.message, details: err.details };
  switch (err.code) {
    case 'city_not_found':
      return new NotFoundException(payload);
    case 'not_owner':
      return new ForbiddenException(payload);
    case 'slot_busy':
    case 'tech_already_researching':
    case 'insufficient_resources':
    case 'castle_budget_full':
    case 'defense_capacity_full':
      return new ConflictException(payload);
    default:
      return new BadRequestException(payload);
  }
}
