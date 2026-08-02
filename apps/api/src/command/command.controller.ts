/**
 * ⭐ KOMUTA MERKEZİ — **Genel Durum** ve **Sıralamalar** (§13.4 menü envanteri, `scr_web05`/`scr_web02`)
 *
 * Doküman (GENEL DURUM): *"Genel Durum ekranı tüm şehirlerinizdeki ordu ve kaynak durumunu
 * gösterir. Ayrıca tekniklerinizin seviyesi ve sıralamanız hakkında da istatistikler içerir."*
 *
 * İki tasarım kuralı burada da geçerli:
 *  • **Türkçe ad SUNUCUDAN** (§13.14) — istemci `id → ad` tablosu tutmaz, tutsa katalogdan kayardı.
 *  • **Sıra CANLI DEĞİL** — `rankings` anlık görüntüsünden okunur (§13.16). Ekrandaki "▲2"
 *    ancak önceki donmuş sıra saklandığı için var olabiliyor.
 */
import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import {
  DEFENSE_ORDER, TECHS, TECH_ORDER, UNITS_BY_ID, WARRIOR_ORDER, orderBy,
} from '@mobilwar/catalog';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import { CityService } from '../cities/city.service.ts';
import { toDate, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { lastSnapshotAt, nextSnapshotAt, type RankingKind } from '../ranking/ranking.service.ts';
import { GameClockService } from '../world/game-clock.service.ts';

/** Sıralama sayfası — İttifak ekranındaki 20'lik sayfayla aynı (ARAYÜZ C). */
const PAGE_SIZE = 20;

/**
 * Arama metnini `LIKE` önek desenine çevirir: `ay` → `ay%`.
 *
 * ⚠️ İki şey aynı anda yapılıyor ve ikisi de şart:
 *  1. **Joker kaçışı** — kullanıcı `%` yazarsa her şey eşleşirdi (`_` de tek karakter jokeri).
 *     Kaçış karakteri ters bölü, o da kendisi kaçırılmalı.
 *  2. **Desen TEK PARAMETRE** olarak gider. `lower(${q}) || '%'` yazılınca desen plan
 *     zamanında sabit olmadığı için Postgres önekin indeksten okunabileceğini göremiyor ve
 *     `lower(username)` yalnız FİLTRE olarak kalıyordu (EXPLAIN testi bunu yakaladı) —
 *     yani indeks vardı ama boşunaydı.
 */
const prefixPattern = (q: string): string =>
  `${q.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

@Controller('api/v1/command')
@UseGuards(AuthGuard)
export class CommandController {
  constructor(
    private readonly cities: CityService,
    private readonly clock: GameClockService,
    @Inject(DB) private readonly db: Db,
  ) {}

  /**
   * ⭐ ARAMA (§13.18) — orijinalin `arOyn.do` / `itAra.do` uçlarının karşılığı.
   *
   * Orijinal istemci (`g.java:1517-1526`, `m.java:413-451`) oyuncu aramasını **iki kipli**
   * yapıyordu: ada göre `?o=<ad>` ya da koordinata göre `?u=<kıta>:<diyar>:<üs>`. İkisi de
   * burada; sonuç satırı **Dünya ekranının `city` nesnesiyle AYNI şekilde** dönüyor, çünkü
   * istemci ona tıklayınca zaten var olan `TargetModal`'ı açıyor (orijinalde de arama
   * sonucunun menüsü, dünya haritası satırının menüsünün aynısıydı — `i.java:542`).
   *
   * ⚠️ **GİZLİLİK: yalnız BAŞKENT** (§13.16.5). Arama, oyuncunun diğer şehirlerini vermez;
   * onları bulmak için Dünya ekranını gezmek gerekir. Bu kasıtlı bir kısıt.
   *
   * ⚠️ Eşleşme **ÖNEK** (`q%`), infix değil. Sebep: `players_world_username` indeksi
   * büyük/küçük harfe DUYARLI, yani `lower(username) LIKE` sorgusunda hiç kullanılamıyor.
   * 0023 migration'ı `lower(username) text_pattern_ops` indeksi ekliyor ve önek araması onu
   * kullanıyor. İnfix (`%q%`) için `pg_trgm` + GIN gerekir — beta için gereksiz ağır.
   */
  @Get('search')
  async search(
    @Req() req: AuthedRequest,
    @Query('kind') kind?: string,
    @Query('name') name?: string,
    @Query('k') k?: string,
    @Query('d') d?: string,
    @Query('s') s?: string,
    @Query('byId') byId?: string,
  ): Promise<Record<string, unknown>> {
    const player = req.player!;
    const byCoords = k != null && k !== '' && d != null && d !== '';
    /**
     * ⭐ "Dünyada Bul" kipi (`grDny.do?o=`): kimlikten BAŞKENT koordinatı. Ayrı bir uç
     * açılmadı — gizlilik kuralı (yalnız başkent) bu ucun içinde tek yerde duruyor ve
     * ikinci bir uç onu ikinci kez uygulamak zorunda kalırdı.
     */
    const targetId = byId == null || byId === '' ? null : Number(byId);

    if (kind === 'alliance') {
      const q = (name ?? '').trim();
      if (q.length < 2) return { kind: 'alliance', items: [], truncated: false };
      const rows = await this.db.execute<Record<string, unknown>>(sql`
        SELECT a.id, a.name, r.rank,
               (SELECT COUNT(*)::int FROM players m WHERE m.alliance_id = a.id) AS member_count,
               (SELECT COALESCE(SUM(m.score), 0) FROM players m WHERE m.alliance_id = a.id) AS score
          FROM alliances a
          LEFT JOIN rankings r
            ON r.world_id = a.world_id AND r.kind = 'alliance' AND r.subject_id = a.id
         WHERE a.world_id = ${player.worldId}
           AND lower(a.name) LIKE ${prefixPattern(q)}
         ORDER BY COALESCE(r.rank, 999999), score DESC
         LIMIT ${PAGE_SIZE + 1}
      `);
      return {
        kind: 'alliance',
        truncated: rows.length > PAGE_SIZE,
        items: rows.slice(0, PAGE_SIZE).map((r) => ({
          id: Number(r['id']),
          name: String(r['name']),
          rank: r['rank'] == null ? null : Number(r['rank']),
          memberCount: Number(r['member_count'] ?? 0),
          score: Number(r['score'] ?? 0),
        })),
      };
    }

    /* Oyuncu araması — kimliğe, ada ya da koordinata göre. */
    const q = (name ?? '').trim();
    if (targetId != null && !Number.isInteger(targetId)) {
      return { kind: 'player', items: [], truncated: false };
    }
    if (targetId == null && !byCoords && q.length < 2) {
      return { kind: 'player', items: [], truncated: false };
    }

    const gameNow = await this.clock.gameNow(player.worldId);
    const kk = byCoords ? Number(k) : 0;
    const dd = byCoords ? Number(d) : 0;
    const ss = s == null || s === '' ? null : Number(s);

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT c.id, c.name, c.k, c.d, c.s, c.is_capital,
             p.id AS player_id, p.username, p.score, p.protected_until, p.vacation_until,
             r.rank, a.name AS alliance_name, p.alliance_id
        FROM cities c
        JOIN players p ON p.id = c.player_id
        LEFT JOIN rankings r
          ON r.world_id = p.world_id AND r.kind = 'player' AND r.subject_id = p.id
        LEFT JOIN alliances a ON a.id = p.alliance_id
       WHERE c.world_id = ${player.worldId}
         AND ${targetId != null
    /* Kimliğe göre (Dünyada Bul): yalnız BAŞKENT. */
    ? sql`c.is_capital AND p.id = ${targetId}`
    : byCoords
    /* Koordinat kipi: üs verilmişse tek yer, verilmemişse o diyarın DOLU yerleri.
       Burada başkent kısıtı YOK — koordinatı zaten bilen biri Dünya ekranından da görebilir. */
      ? sql`c.k = ${kk} AND c.d = ${dd} AND (${ss}::int IS NULL OR c.s = ${ss})`
    /* Ada göre: yalnız BAŞKENT (§13.16.5). */
      : sql`c.is_capital AND lower(p.username) LIKE ${prefixPattern(q)}`}
       ORDER BY COALESCE(r.rank, 999999), p.username
       LIMIT ${PAGE_SIZE + 1}
    `);

    return {
      kind: 'player',
      truncated: rows.length > PAGE_SIZE,
      items: rows.slice(0, PAGE_SIZE).map((r) => {
        const protectedUntil = r['protected_until'] == null ? null : toDate(r['protected_until']);
        const vacationUntil = r['vacation_until'] == null ? null : toDate(r['vacation_until']);
        return {
          /* ⚠️ Alan adları Dünya ekranının `city` nesnesiyle AYNI olmak ZORUNDA: sonuç satırı
             doğrudan `TargetModal`'a veriliyor, ikinci bir şekil dönüştürmesi yok. */
          k: Number(r['k']), d: Number(r['d']), s: Number(r['s']),
          id: Number(r['id']),
          name: String(r['name']),
          playerId: Number(r['player_id']),
          username: String(r['username']),
          score: Number(r['score']),
          isCapital: Boolean(r['is_capital']),
          isOwn: Number(r['player_id']) === player.playerId,
          rank: r['rank'] == null ? null : Number(r['rank']),
          alliance: r['alliance_name'] == null ? null : String(r['alliance_name']),
          hasAlliance: r['alliance_id'] != null,
          protection: protectedUntil && protectedUntil > gameNow ? 'beginner'
            : vacationUntil && vacationUntil > gameNow ? 'vacation'
              : null,
        };
      }),
    };
  }

  /**
   * Genel Durum: puan/sıra başlığı + teknik seviyeleri + **tüm şehirlerin** kaynak ve ordu tablosu.
   *
   * Tek çağrı, çünkü ekran hepsini aynı anda gösteriyor; şehir başına ayrı istek atmak
   * 4 şehirli bir oyuncuda 5 gidiş-dönüş demekti.
   */
  @Get('overview')
  async overview(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const player = req.player!;
    const gameNow = await this.clock.gameNow(player.worldId);

    const [meRows, cityRows, techRows] = await Promise.all([
      this.db.execute<Record<string, unknown>>(sql`
        SELECT p.username, p.score, p.score_base, p.alliance_id,
               r.rank, r.prev_rank,
               a.name AS alliance_name, ar.rank AS alliance_rank, ar.prev_rank AS alliance_prev_rank,
               (SELECT COUNT(*) FROM players WHERE world_id = ${player.worldId}
                  AND banned_at IS NULL) AS total_players
          FROM players p
          LEFT JOIN rankings r
            ON r.world_id = p.world_id AND r.kind = 'player' AND r.subject_id = p.id
          LEFT JOIN alliances a ON a.id = p.alliance_id
          LEFT JOIN rankings ar
            ON ar.world_id = p.world_id AND ar.kind = 'alliance' AND ar.subject_id = p.alliance_id
         WHERE p.id = ${player.playerId}
      `),
      this.db.execute<Record<string, unknown>>(sql`
        SELECT id FROM cities
         WHERE world_id = ${player.worldId} AND player_id = ${player.playerId}
         ORDER BY is_capital DESC, id
      `),
      this.db.execute<Record<string, unknown>>(sql`
        SELECT type, level FROM techs WHERE player_id = ${player.playerId}
      `),
    ]);

    const me = meRows[0] ?? {};
    const techLevels: Record<string, number> = {};
    for (const r of techRows) techLevels[String(r['type'])] = Number(r['level']);

    // ⭐ Şehir okuması tembel birikimi işletir (§3) → tablodaki kaynak "şu an"ı gösterir.
    const cities = [];
    const totals = { gold: 0, food: 0, units: {} as Record<string, number>, defenses: {} as Record<string, number> };
    for (const row of cityRows) {
      const cityId = Number(row['id']);
      const snap = await this.cities.snapshot(cityId, gameNow);
      if (!snap) continue;
      const [unitRows, defRows] = await Promise.all([
        this.db.execute<Record<string, unknown>>(sql`SELECT type, count FROM units WHERE city_id = ${cityId}`),
        this.db.execute<Record<string, unknown>>(sql`SELECT type, count FROM defenses WHERE city_id = ${cityId}`),
      ]);
      const units = countMap(unitRows);
      const defenses = countMap(defRows);
      for (const [k, v] of Object.entries(units)) totals.units[k] = (totals.units[k] ?? 0) + v;
      for (const [k, v] of Object.entries(defenses)) totals.defenses[k] = (totals.defenses[k] ?? 0) + v;
      totals.gold += snap.gold;
      totals.food += snap.food;

      cities.push({
        id: snap.id,
        name: snap.name,
        coordinates: { k: snap.k, d: snap.d, s: snap.s },
        isCapital: snap.isCapital,
        resources: { gold: snap.gold, food: snap.food },
        production: { goldPerHour: snap.goldPerHour, foodPerHour: snap.foodPerHour },
        buildings: snap.buildings,
        units,
        defenses,
      });
    }

    const takenAt = await lastSnapshotAt(this.db, player.worldId);
    const rank = me['rank'] == null ? null : Number(me['rank']);
    const prevRank = me['prev_rank'] == null ? null : Number(me['prev_rank']);

    return {
      player: {
        username: String(me['username'] ?? ''),
        score: Number(me['score'] ?? 0),
        /** Bir sonraki puana kalan kaynak — "1.000 kaynakta 1 puan" kuralını ekranda görünür kılar. */
        toNextPoint: Math.max(0, 1000 - Math.floor(Number(me['score_base'] ?? 0) % 1000)),
        rank,
        prevRank,
        rankChange: rank != null && prevRank != null ? prevRank - rank : null,
        totalPlayers: Number(me['total_players'] ?? 0),
        alliance: me['alliance_name'] == null ? null : String(me['alliance_name']),
        allianceRank: me['alliance_rank'] == null ? null : Number(me['alliance_rank']),
        allianceRankChange: me['alliance_rank'] != null && me['alliance_prev_rank'] != null
          ? Number(me['alliance_prev_rank']) - Number(me['alliance_rank']) : null,
      },
      ranking: {
        takenAt: takenAt?.toISOString() ?? null,
        nextAt: nextSnapshotAt(gameNow).toISOString(),
      },
      // Türkçe ad + katalog sırası sunucudan (§13.14).
      techs: orderBy(TECHS, TECH_ORDER).map((t) => ({
        id: t.id, name: t.name.tr, level: techLevels[t.id] ?? 0,
      })),
      unitTypes: namedTypes(WARRIOR_ORDER),
      defenseTypes: namedTypes(DEFENSE_ORDER),
      cities,
      totals,
      gameNow: gameNow.toISOString(),
      serverNow: new Date().toISOString(),
    };
  }

  /**
   * Sıralamalar — **Oyuncu · İttifak · Kahraman** sekmeleri.
   *
   * `myPage` de dönüyor: oyuncu 340. sıradaysa ekran onu aramak zorunda kalmasın, "beni göster"
   * doğrudan doğru sayfayı açsın.
   */
  @Get('rankings')
  async rankings(
    @Req() req: AuthedRequest,
    @Query('kind') kindRaw?: string,
    @Query('page') pageRaw?: string,
  ): Promise<Record<string, unknown>> {
    const player = req.player!;
    const kind: RankingKind = kindRaw === 'hero' || kindRaw === 'alliance' ? kindRaw : 'player';
    const [meRow] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT alliance_id FROM players WHERE id = ${player.playerId}
    `);
    const myAllianceId = meRow?.['alliance_id'] == null ? null : Number(meRow['alliance_id']);
    const gameNow = await this.clock.gameNow(player.worldId);
    const takenAt = await lastSnapshotAt(this.db, player.worldId);

    const totalRows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*) AS n FROM rankings WHERE world_id = ${player.worldId} AND kind = ${kind}
    `);
    const total = Number(totalRows[0]?.['n'] ?? 0);

    // "Benim sıram" — oyuncu sekmesinde kendisi, kahraman sekmesinde EN İYİ kahramanı.
    const mineRows = kind === 'player'
      ? await this.db.execute<Record<string, unknown>>(sql`
          SELECT rank FROM rankings
           WHERE world_id = ${player.worldId} AND kind = 'player'
             AND subject_id = ${player.playerId}
        `)
      : kind === 'hero'
        ? await this.db.execute<Record<string, unknown>>(sql`
            SELECT MIN(r.rank) AS rank FROM rankings r
              JOIN heroes h ON h.id = r.subject_id
             WHERE r.world_id = ${player.worldId} AND r.kind = 'hero'
               AND h.player_id = ${player.playerId}
          `)
        : await this.db.execute<Record<string, unknown>>(sql`
            SELECT r.rank FROM rankings r
              JOIN players p ON p.alliance_id = r.subject_id
             WHERE r.world_id = ${player.worldId} AND r.kind = 'alliance'
               AND p.id = ${player.playerId}
          `);
    const myRank = mineRows[0]?.['rank'] == null ? null : Number(mineRows[0]!['rank']);

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(pages, Math.max(1, Number(pageRaw) || 1));
    const offset = (page - 1) * PAGE_SIZE;

    const rows = kind === 'hero'
      ? await this.db.execute<Record<string, unknown>>(sql`
          SELECT r.rank, r.prev_rank, r.subject_id, h.name, h.level, h.xp,
                 h.status, h.player_id, p.username AS owner
            FROM rankings r
            JOIN heroes h ON h.id = r.subject_id
            JOIN players p ON p.id = h.player_id
           WHERE r.world_id = ${player.worldId} AND r.kind = 'hero'
           ORDER BY r.rank LIMIT ${PAGE_SIZE} OFFSET ${offset}
        `)
      : kind === 'player'
        /**
         * ⚠️ Şehir sayısı BİLEREK yok (kullanıcı kararı 2026-07-28, `images/scr_web02` ile
         * doğrulandı): orijinal sıralama tablosu **Sıra · Oyuncu · Puan · Değişim · İttifak**
         * gösteriyor. Şehir sayısı casuslukla öğrenilecek bir bilgiye yakın; sıralamada bedava
         * verilmesi Dünya ekranındaki gizlilik kuralıyla (§13.16.5) da çelişiyordu.
         */
        ? await this.db.execute<Record<string, unknown>>(sql`
            SELECT r.rank, r.prev_rank, r.subject_id, r.score, p.username, a.name AS alliance_name
              FROM rankings r
              JOIN players p ON p.id = r.subject_id
              LEFT JOIN alliances a ON a.id = p.alliance_id
             WHERE r.world_id = ${player.worldId} AND r.kind = 'player'
             ORDER BY r.rank LIMIT ${PAGE_SIZE} OFFSET ${offset}
          `)
        /* ⭐ İttifak sekmesi (kullanıcı: Sıra · İttifak Adı · Puan · Sıra Değişimi). */
        : await this.db.execute<Record<string, unknown>>(sql`
            SELECT r.rank, r.prev_rank, r.subject_id, r.score, a.name,
                   (SELECT COUNT(*)::int FROM players m WHERE m.alliance_id = a.id) AS member_count
              FROM rankings r
              JOIN alliances a ON a.id = r.subject_id
             WHERE r.world_id = ${player.worldId} AND r.kind = 'alliance'
             ORDER BY r.rank LIMIT ${PAGE_SIZE} OFFSET ${offset}
          `);

    return {
      kind,
      page,
      pages,
      pageSize: PAGE_SIZE,
      total,
      myRank,
      myPage: myRank == null ? null : Math.floor((myRank - 1) / PAGE_SIZE) + 1,
      takenAt: takenAt?.toISOString() ?? null,
      nextAt: nextSnapshotAt(gameNow).toISOString(),
      /**
       * Boş liste sebebi. Metin **oyunun kendi dizesinden** (`g.java` / `k.java` string tablosu):
       * *"Bu dünyada hiç ittifak yok!"* · *"Bu dünyada hiç kahraman yok!"* — kendi cümlemizi
       * uydurmak yerine orijinalin ağzını kullanıyoruz (§13.14 adlandırma sözleşmesinin ruhu).
       */
      unavailable: kind === 'alliance' && total === 0 ? 'Bu dünyada hiç ittifak yok!'
        : kind === 'hero' && total === 0 ? 'Bu dünyada hiç kahraman yok!'
          : null,
      rows: rows.map((r) => ({
        rank: Number(r['rank']),
        prevRank: r['prev_rank'] == null ? null : Number(r['prev_rank']),
        change: r['prev_rank'] == null ? null : Number(r['prev_rank']) - Number(r['rank']),
        id: Number(r['subject_id']),
        ...(kind === 'hero'
          ? {
            name: String(r['name']),
            owner: String(r['owner']),
            /* ⭐ Kahraman satırında `id` HEROID'dir; mesaj düğmesi oyuncuya yazacağı için
               sahibinin kimliği ayrıca taşınır (2026-07-31). */
            playerId: Number(r['player_id']),
            level: Number(r['level']),
            xp: Number(r['xp']),
            dead: r['status'] !== 'alive',
            isMine: Number(r['player_id']) === player.playerId,
          }
          : kind === 'alliance'
            ? {
              name: String(r['name']),
              score: Number(r['score']),
              memberCount: Number(r['member_count'] ?? 0),
              isMine: myAllianceId != null && Number(r['subject_id']) === myAllianceId,
            }
            : {
              name: String(r['username']),
              score: Number(r['score']),
              alliance: r['alliance_name'] == null ? null : String(r['alliance_name']),
              /* Oyuncu sıralamasında `subject_id` zaten playerId; mesaj düğmesi için açık ad. */
              playerId: Number(r['subject_id']),
              isMine: Number(r['subject_id']) === player.playerId,
            }),
      })),
      gameNow: gameNow.toISOString(),
      serverNow: new Date().toISOString(),
    };
  }
}

function countMap(rows: Record<string, unknown>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const n = Number(r['count']);
    if (n > 0) out[String(r['type'])] = n;
  }
  return out;
}

/** `id → Türkçe ad` listesi; ekran sütun başlıklarını buradan yazar (§13.14). */
function namedTypes(order: readonly string[]): { id: string; name: string }[] {
  return order
    .filter((id) => UNITS_BY_ID[id])
    .map((id) => ({ id, name: UNITS_BY_ID[id]!.name.tr }));
}
