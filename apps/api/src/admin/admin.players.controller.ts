/**
 * ⭐ OYUNCULAR — liste + **imparatorluk künyesi** (panel 2. nesil, Tur 1).
 *
 * Bu ucun varlık sebebi kullanıcının tek cümlesi:
 *   *"Bir kullanıcının hesabındaki askerleri, birimleri, yükseltmelerini görmenin bir yolu var mı?"*
 * Bugüne kadar cevap "veri tabanı tarayıcısından, şehir şehir" idi: 5 şehirlik bir oyuncu için
 * `cities` + şehir başına `buildings`/`units`/`cave_units`/`defenses` + `techs`/`heroes`/
 * `queues`/`missions` = **20'den fazla istek** — ve gösterilen altın **yanlış** çıkıyordu
 * (tarayıcı ham çıpayı okuyor, `materialize` etmiyor).
 *
 * ⚠️ İki tuzak burada bilerek kapatıldı:
 *   1. **Kaynak `CityService.snapshot()` ile okunuyor** → tembel birikim ilerletilmiş, oyuncunun
 *      kendi ekranındaki sayının AYNISI. Ham `SELECT gold FROM cities` başka bir sayı verir.
 *   2. **Katalog id'lerine Türkçe ad ekleniyor.** Panelin `dwarf`/`architect_school` yazması,
 *      kullanıcıyı her seferinde katalog dosyasına bakmaya zorluyordu.
 */
import {
  Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { BUILDINGS_BY_ID, TECHS_BY_ID, UNITS_BY_ID } from '@mobilwar/catalog';
import { AuthGuard } from '../auth/auth.guard.ts';
import { AuthService } from '../auth/auth.service.ts';
import { CityService } from '../cities/city.service.ts';
import { toDate, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { getGateway } from '../realtime/gateway-registry.ts';
import { GameClockService } from '../world/game-clock.service.ts';
import { AdminGuard, AdminStepUpGuard, type AdminRequest } from './admin.guard.ts';

const PAGE = 25;

/** Aktiflik eşikleri (gün). Liste filtresi bunlarla çalışıyor. */
const RECENT_DAYS = 7;

const iso = (v: unknown): string | null => (v == null ? null : toDate(v).toISOString());

/** Katalog id'sini insan diline çevirir. Bilinmeyen id **gizlenmez**, ham hâliyle geçer. */
const unitName = (id: string): string => UNITS_BY_ID[id]?.name.tr ?? id;
const buildingName = (id: string): string => BUILDINGS_BY_ID[id]?.name.tr ?? id;
const techName = (id: string): string => TECHS_BY_ID[id]?.name.tr ?? id;

interface Counted { type: string; name: string; count: number }
interface Leveled { type: string; name: string; level: number }

@Controller('api/v1/admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminPlayersController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly auth: AuthService,
    private readonly cities: CityService,
    private readonly clock: GameClockService,
  ) {}

  /**
   * ⭐ OYUNCU LİSTESİ — çevrimiçi/çevrimdışı, sunucu taraflı sayfalama.
   *
   * ⚠️ **İki farklı "aktif" var ve panel ikisini de görüyor:**
   *   • `online` — açık WebSocket. Kesin ama SÜREÇ-YEREL (`ROLE=worker`'da bilinmez) ve
   *     yalnız "şu an" der.
   *   • `lastSeenAt` — `players.last_seen_at`. ⚠️ Bu kolon yalnız giriş ve token yenilemede
   *     yazılıyor (`auth.service.issueSession`), her istekte DEĞİL. Yenileme ~15 dakikada bir
   *     olduğu için kabaca doğru ama "3 dakika önce oynuyordu"yu göstermez.
   * İkisini tek bir "aktif" sayısına indirseydik hangi sinyalin konuştuğu kaybolurdu.
   */
  @Get('players')
  async list(@Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const q = (req as unknown as { query?: Record<string, unknown> }).query ?? {};
    const page = Math.max(0, Math.trunc(Number(q['page'] ?? 0)) || 0);
    const search = String(q['q'] ?? '').trim().slice(0, 60);
    const status = String(q['status'] ?? 'all');
    const worldId = q['world'] == null || q['world'] === '' ? null : Number(q['world']);

    const gateway = getGateway();
    const onlineIds = gateway?.onlinePlayerIds() ?? [];
    /**
     * ⚠️ Gateway yoksa liste "hiç kimse çevrimiçi değil" DEMEZ. Panel `onlineKnown: false`
     * görünce noktayı hiç çizmiyor — yanlış bilgi, bilgisizlikten kötüdür.
     */
    const onlineKnown = gateway != null;

    const conds = [sql`TRUE`];
    if (worldId != null && Number.isFinite(worldId)) conds.push(sql`p.world_id = ${worldId}`);
    if (search) {
      conds.push(sql`(p.username ILIKE ${`%${search}%`} OR a.email ILIKE ${`%${search}%`})`);
    }
    if (status === 'online') {
      /**
       * ⚠️ `sql.raw` — dizi tanımlayıcı değil ama yine de **tam sayı süzgecinden** geçiriliyor.
       * Kimlikler soket katmanından (JWT `pid` claim'i) geliyor; sayı olduklarına güvenmek
       * yerine burada ispat ediliyor. Boş dizide `= ANY(ARRAY[NULL])` hiçbir satırla eşleşmez —
       * "kimse çevrimiçi değil" için istenen davranış tam olarak bu.
       */
      const ids = onlineIds.filter((n) => Number.isInteger(n)).join(',') || 'NULL';
      conds.push(sql`p.id = ANY(${sql.raw(`ARRAY[${ids}]::bigint[]`)})`);
    } else if (status === 'recent') {
      conds.push(sql`p.last_seen_at > now() - (${RECENT_DAYS} * interval '1 day')`);
    } else if (status === 'idle') {
      conds.push(sql`(p.last_seen_at IS NULL OR p.last_seen_at <= now() - (${RECENT_DAYS} * interval '1 day'))`);
    }
    const where = sql`WHERE ${sql.join(conds, sql` AND `)}`;

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT p.id, p.username, p.world_id, p.score, p.last_seen_at, p.created_at,
             p.banned_at, p.ban_until, p.ban_mode, p.protected_until, p.vacation_until,
             a.email, a.role,
             al.name AS alliance,
             (SELECT COUNT(*)::int FROM cities c WHERE c.player_id = p.id) AS cities
        FROM players p
        JOIN accounts a ON a.id = p.account_id
        LEFT JOIN alliances al ON al.id = p.alliance_id
        ${where}
       ORDER BY p.last_seen_at DESC NULLS LAST, p.id
       LIMIT ${PAGE} OFFSET ${page * PAGE}
    `);
    const [count] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM players p JOIN accounts a ON a.id = p.account_id ${where}
    `);

    const online = new Set(onlineIds);
    return {
      page, pageSize: PAGE, total: Number(count?.['n'] ?? 0),
      onlineKnown, onlineCount: onlineIds.length,
      applied: { q: search, status, world: worldId },
      items: rows.map((r) => ({
        id: Number(r['id']),
        username: String(r['username']),
        worldId: Number(r['world_id']),
        email: String(r['email']),
        role: String(r['role']),
        score: Number(r['score']),
        cities: Number(r['cities']),
        alliance: r['alliance'] == null ? null : String(r['alliance']),
        online: onlineKnown ? online.has(Number(r['id'])) : null,
        lastSeenAt: iso(r['last_seen_at']),
        createdAt: iso(r['created_at']),
        banned: r['banned_at'] != null,
        banUntil: iso(r['ban_until']),
        banMode: r['ban_mode'] == null ? null : String(r['ban_mode']),
        protectedUntil: iso(r['protected_until']),
        vacationUntil: iso(r['vacation_until']),
      })),
    };
  }

  /**
   * ⭐ İMPARATORLUK — bir oyuncunun sahip olduğu **her şey**, tek çağrıda.
   *
   * ⚠️ Şehir sayısı `maxCities()` ile sınırlı (varsayılan 5, Sömürgecilik ile artar) → şehir
   * başına birkaç sorgu atmak burada güvenli. Bir gün sınır kalkarsa bu uç tek sorguya
   * çevrilmeli; şimdi çevirmek okunabilirliği bedava harcamak olurdu.
   */
  @Get('players/:playerId/empire')
  async empire(@Param('playerId') playerId: string): Promise<Record<string, unknown>> {
    const id = Number(playerId);
    const [p] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT p.id, p.username, p.world_id, p.score, p.score_base, p.last_seen_at,
             p.protected_until, p.vacation_until, p.banned_at, p.ban_until, p.ban_mode,
             a.email, a.role, al.name AS alliance
        FROM players p
        JOIN accounts a ON a.id = p.account_id
        LEFT JOIN alliances al ON al.id = p.alliance_id
       WHERE p.id = ${id}
    `);
    if (!p) throw new NotFoundException('Oyuncu bulunamadı.');
    const worldId = Number(p['world_id']);

    /** ⚠️ OYUN saati — `materialize` ve kuyruk/sefer kalan süreleri hep bununla ölçülür. */
    const at = (await this.clock.read(worldId)).gameNow;

    const cityRows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, wall_integrity, wall_repair_until, cave_repair_until, teleport_ready_at
        FROM cities WHERE player_id = ${id} ORDER BY is_capital DESC, id
    `);

    const cities = [];
    for (const row of cityRows) {
      const cityId = Number(row['id']);
      // ⭐ Ham SELECT değil: tembel birikim ilerletilir, gösterilen altın oyuncununkiyle aynı olur.
      const snap = await this.cities.snapshot(cityId, at);
      if (!snap) continue;

      const [units, cave, defenses, queues] = await Promise.all([
        this.counted(sql`SELECT type, count FROM units WHERE city_id = ${cityId}`),
        this.counted(sql`SELECT type, count FROM cave_units WHERE city_id = ${cityId}`),
        this.counted(sql`SELECT type, count FROM defenses WHERE city_id = ${cityId}`),
        this.db.execute<Record<string, unknown>>(sql`
          SELECT id, category, item_type, target_level, count, done, started_at, finish_at
            FROM queues
           WHERE city_id = ${cityId} AND canceled_at IS NULL AND completed_at IS NULL
           ORDER BY position, id
        `),
      ]);

      /**
       * ⚠️ Sur ve Büyü Kalkanı `defenses` tablosunda ama `count` alanı **adet değil SEVİYE**
       * (katalogdaki `LEVEL_BASED`). Aynı listede "1250 Okçu Kulesi" ile "Sur seviye 6"nın yan
       * yana durması yanlış okunurdu → panelde ayrı iki kutu olsun diye burada ayrılıyorlar.
       */
      const isStructure = (t: string): boolean => t === 'wall' || t === 'magic_shield';

      cities.push({
        id: cityId,
        name: snap.name,
        coordinates: `${snap.k}:${snap.d}:${snap.s}`,
        k: snap.k, d: snap.d, s: snap.s,
        isCapital: snap.isCapital,
        gold: snap.gold, food: snap.food,
        goldPerHour: snap.goldPerHour, foodPerHour: snap.foodPerHour,
        wallIntegrity: row['wall_integrity'] == null ? null : Number(row['wall_integrity']),
        wallRepairUntil: iso(row['wall_repair_until']),
        caveRepairUntil: iso(row['cave_repair_until']),
        teleportReadyAt: iso(row['teleport_ready_at']),
        buildings: Object.entries(snap.buildings)
          .map(([type, level]): Leveled => ({ type, name: buildingName(type), level }))
          .sort((a, b) => b.level - a.level),
        units,
        cave,
        defenses: defenses.filter((d) => !isStructure(d.type)),
        /** Sur/Kalkan: `count` = seviye. */
        structures: defenses.filter((d) => isStructure(d.type))
          .map((d): Leveled => ({ type: d.type, name: d.name, level: d.count })),
        queues: queues.map((q) => ({
          id: Number(q['id']),
          category: String(q['category']),
          itemType: String(q['item_type']),
          name: String(q['category']) === 'building'
            ? buildingName(String(q['item_type']))
            : String(q['category']) === 'tech'
              ? techName(String(q['item_type']))
              : unitName(String(q['item_type'])),
          targetLevel: q['target_level'] == null ? null : Number(q['target_level']),
          count: Number(q['count'] ?? 0),
          done: Number(q['done'] ?? 0),
          startedAt: iso(q['started_at']),
          finishAt: iso(q['finish_at']),
        })),
      });
    }

    const [techRows, heroRows] = await Promise.all([
      this.db.execute<Record<string, unknown>>(sql`
        SELECT type, level FROM techs WHERE player_id = ${id} ORDER BY level DESC, type
      `),
      this.db.execute<Record<string, unknown>>(sql`
        SELECT h.id, h.name, h.level, h.xp, h.status, h.city_id, h.revive_until,
               c.name AS city_name
          FROM heroes h LEFT JOIN cities c ON c.id = h.city_id
         WHERE h.player_id = ${id} ORDER BY h.level DESC, h.id
      `),
    ]);

    /**
     * ⭐ HAREKETLER — giden ve **gelen** ayrı ayrı.
     *
     * ⚠️ Gelen saldırı `missions.owner_player_id` ile bulunamaz (o alan saldıranı taşır);
     * hedef şehrin sahibi üzerinden JOIN gerekiyor. Bu yüzden veri tabanı tarayıcısında
     * "bu oyuncuya kim saldırıyor" sorusu **hiç sorulamıyordu**.
     */
    const movement = async (own: boolean): Promise<Record<string, unknown>[]> =>
      this.db.execute<Record<string, unknown>>(sql`
        SELECT m.id, m.type, m.status, m.execute_at, m.owner_player_id,
               m.origin_city_id, m.target_city_id, m.target_k, m.target_d, m.target_s,
               oc.name AS origin_name, tc.name AS target_name,
               op.username AS owner_name
          FROM missions m
          LEFT JOIN cities oc ON oc.id = m.origin_city_id
          LEFT JOIN cities tc ON tc.id = m.target_city_id
          LEFT JOIN players op ON op.id = m.owner_player_id
         WHERE m.status IN ('scheduled', 'running')
           AND ${own
    ? sql`m.owner_player_id = ${id}`
    : sql`m.owner_player_id <> ${id} AND tc.player_id = ${id}`}
         ORDER BY m.execute_at
         LIMIT 100
      `);

    const [outRows, inRows] = await Promise.all([movement(true), movement(false)]);
    const missionIds = [...outRows, ...inRows]
      .map((m) => Number(m['id'])).filter((n) => Number.isInteger(n));
    const unitsByMission = new Map<number, Counted[]>();
    /**
     * ⭐ KAHRAMANLAR (kullanıcı, 2026-08-03: *"aktif hareketleri gösteren kısımda kahraman
     * gözükmüyor; casus kuş + kahraman görevinde sadece 9 casus kuşun adı gözüküyor"*).
     *
     * ⚠️ Eksiklik yeni değildi ama 2026-08-03'e kadar **görünmüyordu**: istemci kahraman
     * göndermiyordu, dolayısıyla `mission_heroes` pratikte hep boştu. Kahraman seçici
     * eklenince aynı gün ortaya çıktı.
     */
    const heroesByMission = new Map<number, string[]>();
    if (missionIds.length > 0) {
      const idArray = sql.raw(`ARRAY[${missionIds.join(',')}]::bigint[]`);
      const [mu, mh] = await Promise.all([
        this.db.execute<Record<string, unknown>>(sql`
          SELECT mission_id, unit_type, count FROM mission_units
           WHERE mission_id = ANY(${idArray})
        `),
        this.db.execute<Record<string, unknown>>(sql`
          SELECT mh.mission_id, h.name, h.level
            FROM mission_heroes mh JOIN heroes h ON h.id = mh.hero_id
           WHERE mh.mission_id = ANY(${idArray})
           ORDER BY h.level DESC, h.name
        `),
      ]);
      for (const r of mu) {
        const key = Number(r['mission_id']);
        const list = unitsByMission.get(key) ?? [];
        list.push({
          type: String(r['unit_type']),
          name: unitName(String(r['unit_type'])),
          count: Number(r['count']),
        });
        unitsByMission.set(key, list);
      }
      for (const r of mh) {
        const key = Number(r['mission_id']);
        const list = heroesByMission.get(key) ?? [];
        list.push(`${String(r['name'])} (sv ${Number(r['level'] ?? 0)})`);
        heroesByMission.set(key, list);
      }
    }
    const toMission = (m: Record<string, unknown>): Record<string, unknown> => ({
      id: Number(m['id']),
      type: String(m['type']),
      status: String(m['status']),
      executeAt: iso(m['execute_at']),
      ownerPlayerId: m['owner_player_id'] == null ? null : Number(m['owner_player_id']),
      ownerName: m['owner_name'] == null ? null : String(m['owner_name']),
      origin: m['origin_name'] == null ? null : String(m['origin_name']),
      target: m['target_name'] == null
        ? (m['target_k'] == null ? null : `${m['target_k']}:${m['target_d']}:${m['target_s']}`)
        : String(m['target_name']),
      units: unitsByMission.get(Number(m['id'])) ?? [],
      heroes: heroesByMission.get(Number(m['id'])) ?? [],
    });

    const gateway = getGateway();
    return {
      player: {
        id, username: String(p['username']), worldId,
        email: String(p['email']), role: String(p['role']),
        score: Number(p['score']), scoreBase: Number(p['score_base']),
        alliance: p['alliance'] == null ? null : String(p['alliance']),
        lastSeenAt: iso(p['last_seen_at']),
        online: gateway ? gateway.isOnline(id) : null,
        /** ⚠️ Bu ikisi Faz 6 künyesinde SQL'de çekiliyor ama JSON'a hiç konmuyordu. */
        protectedUntil: iso(p['protected_until']),
        vacationUntil: iso(p['vacation_until']),
        bannedAt: iso(p['banned_at']),
        banUntil: iso(p['ban_until']),
        banMode: p['ban_mode'] == null ? null : String(p['ban_mode']),
      },
      gameNow: at.toISOString(),
      cities,
      techs: techRows.map((t): Leveled => ({
        type: String(t['type']), name: techName(String(t['type'])), level: Number(t['level']),
      })),
      heroes: heroRows.map((h) => ({
        id: Number(h['id']), name: String(h['name']),
        level: Number(h['level']), xp: Number(h['xp']), status: String(h['status']),
        cityId: h['city_id'] == null ? null : Number(h['city_id']),
        cityName: h['city_name'] == null ? null : String(h['city_name']),
        reviveUntil: iso(h['revive_until']),
      })),
      outgoing: outRows.map(toMission),
      incoming: inRows.map(toMission),
    };
  }

  /** `{type, count}` satırlarını Türkçe adla zenginleştirir; 0'lar elenir. */
  private async counted(query: ReturnType<typeof sql>): Promise<Counted[]> {
    const rows = await this.db.execute<Record<string, unknown>>(query);
    return rows
      .map((r): Counted => ({
        type: String(r['type']),
        name: unitName(String(r['type'])),
        count: Number(r['count']),
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  /**
   * ⭐ TEK CİHAZI DÜŞÜR. `AuthService.revokeChain` Faz 3'ten beri hazırdı ama admin tarafında
   * yalnız "hepsini düşür" vardı — destek çağrısında *"şu bilinmeyen telefonu at"* demenin
   * yolu yoktu, tüm cihazları düşürmek gerekiyordu.
   */
  @Post('players/:playerId/sessions/:chainId/revoke')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async revokeChain(
    @Param('playerId') playerId: string, @Param('chainId') chainId: string,
    @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT account_id, world_id FROM players WHERE id = ${Number(playerId)}
    `);
    if (!row) throw new NotFoundException('Oyuncu bulunamadı.');

    const ids = await this.auth.revokeChain(Number(row['account_id']), chainId);
    const sockets = getGateway()?.revokeSessions(ids) ?? 0;
    await this.db.execute(sql`
      INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after)
      VALUES (${Number(row['world_id'])}, ${req.player!.playerId}, 'admin.sessions.revoke_chain',
              'player', ${Number(playerId)},
              ${JSON.stringify({ chainId, revoked: ids.length, sockets })}::jsonb)
    `);
    return { ok: true, revoked: ids.length, sockets };
  }
}
