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
import { maxCities } from '@mobiwar/catalog';
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
   * ⭐ `POST /api/v1/missions/send` — SALDIRI DIŞINDAKİ tüm görev tipleri tek uçtan.
   *
   * Doküman (DÜNYA): *"tüm görev seçenekleri de (saldırı, nakliye, casusluk, destek, şehir kurma
   * ve teleport) yalnızca dünya menüsünden yapılabilir"* → arayüzde tek modal, sunucuda tek uç.
   * Tip başına ayrı rota yazmak beş kopya doğrulama bloğu demekti.
   */
  @Post('send')
  @HttpCode(201)
  async send(@Body() body: unknown, @Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const player = req.player!;
    const parsed = sendMissionRequest.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'invalid_request', issues: parsed.error.issues });
    }
    const d = parsed.data;
    const at = await this.clock.gameNow(player.worldId);
    const base = {
      originCityId: d.originCityId,
      playerId: player.playerId,
      worldId: player.worldId,
      target: d.target,
      units: d.units,
      heroIds: d.heroIds,
      at,
    };

    try {
      // ⚠️ Teleport ANLIKTIR: görev satırı üretmez, bu yüzden yanıtı da farklıdır.
      if (d.type === 'teleport') {
        const r = await this.missions.teleport(base);
        return {
          instant: true,
          targetCityId: r.targetCityId,
          units: r.units,
          heroIds: r.heroIds,
          teleportReadyAt: r.readyAt.toISOString(),
          gameNow: at.toISOString(),
          serverNow: new Date().toISOString(),
        };
      }

      const cargo = d.cargo ?? { gold: 0, food: 0 };
      const m = d.type === 'attack' ? await this.missions.sendAttack(base)
        : d.type === 'transport' ? await this.missions.sendTransport({ ...base, cargo })
          : d.type === 'support' ? await this.missions.sendSupport({ ...base, cargo })
            : d.type === 'spy' ? await this.missions.sendSpy(base)
              : await this.missions.sendFoundCity(base);

      return {
        missionId: m.missionId,
        type: d.type,
        targetCityId: 'targetCityId' in m ? m.targetCityId : null,
        units: m.units,
        heroIds: m.heroIds,
        distance: m.distance,
        speed: m.speed,
        travelSeconds: m.travelSeconds,
        executeAt: m.executeAt.toISOString(),
        gameNow: at.toISOString(),
        serverNow: new Date().toISOString(),
      };
    } catch (err) {
      throw toHttp(err);
    }
  }

  /**
   * ⭐ `GET /api/v1/missions/options` — bir hedefe HANGİ görevlerin gönderilebileceği.
   *
   * Kural sunucuda yaşar: istemci "kime ne gönderilebilir"i kendi hesaplasaydı aynı mantık iki
   * yerde durur ve kaçınılmaz olarak birbirinden kayardı (maliyet/süre kuralıyla aynı ilke).
   * Kapalı seçenek **gizlenmez, sebebiyle gösterilir** — oyuncu neden yapamadığını görmeli.
   */
  @Get('options')
  async options(
    @Query('originCityId') originCityIdRaw: string,
    @Query('k') k: string, @Query('d') d: string, @Query('s') s: string,
    @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const player = req.player!;
    const originCityId = Number(originCityIdRaw);
    const coords = { k: Number(k), d: Number(d), s: Number(s) };
    const at = await this.clock.gameNow(player.worldId);

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT
        (SELECT row_to_json(x) FROM (
           SELECT c.id, c.player_id, c.name, p.username, p.protected_until, p.vacation_until
             FROM cities c JOIN players p ON p.id = c.player_id
            WHERE c.world_id = ${player.worldId}
              AND c.k = ${coords.k} AND c.d = ${coords.d} AND c.s = ${coords.s}
         ) x) AS target,
        (SELECT COUNT(*)::int FROM cities WHERE player_id = ${player.playerId}) AS owned,
        (SELECT COALESCE(level,0) FROM techs
          WHERE player_id = ${player.playerId} AND type = 'colonization') AS colonization,
        (SELECT COALESCE(level,0) FROM buildings
          WHERE city_id = ${originCityId} AND type = 'teleport') AS from_teleport,
        (SELECT teleport_ready_at FROM cities WHERE id = ${originCityId}) AS teleport_ready
    `);
    const r = rows[0] ?? {};
    const target = (r['target'] ?? null) as null | {
      id: number; player_id: number; name: string; username: string;
      protected_until: string | null; vacation_until: string | null;
    };
    const owned = Number(r['owned'] ?? 0);
    const colonization = Number(r['colonization'] ?? 0);
    const cityLimit = maxCities(colonization);
    const fromTeleport = Number(r['from_teleport'] ?? 0);
    const teleportReady = r['teleport_ready'] == null ? null : toDate(r['teleport_ready']);

    let attacksLeft: number | null = null;
    const opts: { type: string; label: string; enabled: boolean; reason: string | null }[] = [];
    const add = (type: string, label: string, enabled: boolean, reason: string | null = null): void => {
      opts.push({ type, label, enabled, reason });
    };

    if (!target) {
      // ── BOŞ YUVA: yalnız şehir kurma (doküman: "boş alanlar - ile gösterilir") ──
      const fits = owned < cityLimit;
      add('found_city', 'Şehir Kur', fits,
        fits ? null
          : `En fazla ${cityLimit} şehir kurabilirsin (Sömürgecilik ${colonization}). `
            + 'Sömürgecilik tekniğinin her üç kademesi bir şehir daha açar.');
    } else if (target.player_id === player.playerId) {
      if (target.id === originCityId) {
        // Aktif şehir: menü yok, yalnız bilgi (kullanıcı kararı).
        return { self: true, activeCity: true, target: describeTarget(target), options: [] };
      }
      // ── KENDİ DİĞER ŞEHRİM ──
      add('transport', 'Nakliye', true);
      add('support', 'Destek', true);
      const toTeleport = await this.teleportLevel(target.id);
      const ready = teleportReady == null || teleportReady <= at;
      const canTeleport = fromTeleport >= 1 && toTeleport >= 1 && ready;
      add('teleport', 'Teleport', canTeleport,
        canTeleport ? null
          : fromTeleport < 1 || toTeleport < 1
            ? 'Teleport için her iki şehirde de Teleport binası en az 1. seviye olmalı.'
            : `Teleport binası hazır değil (${teleportReady!.toISOString()}).`);
    } else {
      // ── BAŞKA OYUNCU ──
      const prot = target.protected_until == null ? null : toDate(target.protected_until);
      const vac = target.vacation_until == null ? null : toDate(target.vacation_until);
      const shielded = (prot != null && prot > at) || (vac != null && vac > at);
      const why = prot != null && prot > at ? 'Oyuncu acemi koruması altında.' : 'Oyuncu tatil modunda.';
      // ⚠️ Aynı ittifakta olmak saldırı/casusluğa ENGEL DEĞİL (kullanıcı kuralı).
      add('attack', 'Saldırı', !shielded, shielded ? why : null);
      add('spy', 'Casusluk', !shielded, shielded ? why : null);
      add('transport', 'Nakliye', true);

      // ⭐ Kalan saldırı hakkı — arayüz kuralı anlatmak yerine SAYIYI gösteriyor.
      const since = new Date(at.getTime() - 24 * 3600_000);
      const used = await this.db.execute<Record<string, unknown>>(sql`
        SELECT COUNT(*)::int AS n FROM missions
         WHERE type = 'attack' AND owner_player_id = ${player.playerId}
           AND target_city_id = ${target.id} AND status <> 'canceled'
           AND execute_at > ${since.toISOString()}::timestamptz
      `);
      attacksLeft = Math.max(0, 3 - Number(used[0]?.['n'] ?? 0));
    }

    return {
      self: target?.player_id === player.playerId,
      activeCity: false,
      target: target ? describeTarget(target) : null,
      options: opts,
      attacksLeft,
      gameNow: at.toISOString(),
      serverNow: new Date().toISOString(),
    };
  }

  private async teleportLevel(cityId: number): Promise<number> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COALESCE(level,0) AS lvl FROM buildings WHERE city_id = ${cityId} AND type = 'teleport'
    `);
    return Number(rows[0]?.['lvl'] ?? 0);
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

      /**
       * ⭐ Nakliye/destek yükü GÖRÜNÜR (kullanıcı, 2026-07-28): şehrime gelen nakliyede kimin
       * ne getirdiğini bilmeliyim. Saldırı ve casuslukta gizlilik matrisi (§13.10.1) aynen
       * duruyor — orada birleşim de yük de gizli.
       */
      const openCargo = type === 'transport' || type === 'support'
        || (type === 'return' && (returnOf === 'transport' || returnOf === 'support'));
      const cargo = openCargo
        ? (payload['cargo'] ?? payload['loot'] ?? null) as Record<string, number> | null
        : null;

      const base = {
        id: Number(r['id']),
        type,
        cargo,
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
            // ⭐ SALDIRI/CASUSLUKTA birleşim GİZLİ (§13.10.1); nakliye/destekte açık — gelen
            //    yardımın ne getirdiğini görmek oyunun kendi mantığı.
            ...(type === 'return' || openCargo ? { units: r['units'] ?? {} } : {}),
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

function describeTarget(t: {
  id: number; name: string; username: string;
}): Record<string, unknown> {
  return { cityId: t.id, name: t.name, username: t.username };
}

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
