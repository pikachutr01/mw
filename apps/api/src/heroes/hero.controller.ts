/**
 * ⭐ TAPINAK — kahraman ekranı ve aksiyonları.
 *
 * Aksiyon kümesi orijinal J2ME istemcisinden birebir alındı (`g.java` menü dizisi + `k.java`
 * uç noktaları): **Dirilt** (`drKah.do`) · **Diriltmeyi Durdur** · **Seviye Arttır** ·
 * **Özellikler** (`dgKoz.do`, puan dağıtımı) · **Kahraman Adı Değiştir** (`dgKad.do`).
 * Durum sözlüğü de oradan: *Şehirde · Görevde · Diriltiliyor · Yok Edildi*.
 *
 * ⚠️ Liste **şehir bazlıdır** (`o.java`: *"Bu şehirde hiç kahraman yok!"*) ama sefere çıkmış
 * kahraman da kendi üssünde **"Görevde"** olarak görünür — oyunun kendi ekran görüntüsünde beş
 * kahramanın beşi de öyle listeleniyordu. Bu yüzden sorgu `mission_heroes` ile birleşiyor.
 *
 * ⭐ **YOK OLMA KALKTI (kullanıcı, 2026-08-01).** `destroyed` durumu ve onu 1 saat sonra silen
 * tembel süpürme kaldırıldı. Savaşta ölen kahraman «Yok Edildi» etiketiyle **eve dönüş
 * yolundadır** (`dead` + şehirsiz), varınca aynı etiketle şehirde durur ve Dirilt açılır.
 */
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Inject, NotFoundException,
  Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { heroLevelForXp, heroReviveCost, heroReviveSeconds, heroXpForLevel } from '@mobilwar/catalog';
import { DEFAULT_COMBAT_CONFIG } from '@mobilwar/engine';
import { z } from 'zod';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import { payloadHeroIds } from '../cave/cave.service.ts';
import { NAME_RULE_MESSAGE, gameName } from '../cities/city-name.ts';
import { CityService } from '../cities/city.service.ts';
import { toDateOrNull, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { SettingsService } from '../settings/settings.service.ts';
import { GameClockService } from '../world/game-clock.service.ts';

const skillsRequest = z.object({
  fAtk: z.number().int().nonnegative(),
  fDef: z.number().int().nonnegative(),
  mAtk: z.number().int().nonnegative(),
  mDef: z.number().int().nonnegative(),
});
/**
 * ⚠️ Sınır 2-24'ten **3-10**'a indi (kullanıcı kararı 2026-07-31): şehir adıyla aynı kural,
 * kaynağı `@mobilwar/catalog` → `name-rules.ts`. Mevcut uzun adlar `0024_name_limits.sql`
 * ile kırpıldı — yoksa oyuncu adını düzenlemek isterken kendi adını reddettirirdi.
 */
const renameRequest = z.object({ name: gameName });

interface HeroRow {
  id: number;
  name: string;
  level: number;
  xp: number;
  fAtk: number;
  fDef: number;
  mAtk: number;
  mDef: number;
  status: string;
  cityId: number | null;
  reviveUntil: Date | null;
  onMission: boolean;
  /** Görevdeyse o görevin varış anı — «dönüyor» geri sayımı bunu kullanır. */
  missionAt: Date | null;
}

/**
 * ⭐ MAĞARA GEÇİŞLERİ (2026-08-11) — orijinalin üç durumu, **yeni kolon olmadan**.
 *
 * `docs/JAVA_ROENTGEN.md` §6.1: istemcinin durum tablosunda `Mağarada` · `Mağaraya Giriyor` ·
 * `Mağaradan Çıkıyor` var (`k.a[234..236]`). Bizde kalıcı durum yalnız **biri** —
 * `heroes.status = 'in_cave'`. Diğer ikisi **türetiliyor**: süren mağara emrinin yönü + o
 * emrin kahraman listesi. Böylece kahramanın "nerede olduğu" tek yerde (status) durur,
 * "ne yapıyor olduğu" ise zaten var olan görev satırından okunur — iki kaynak çelişemez.
 */
interface CaveHint {
  /** Bu kahraman mağaraya girmek üzere işaretli (emir sürüyor, kendisi hâlâ şehirde). */
  entering: Set<number>;
  /** Bu kahraman mağaradan çıkmak üzere: boşaltma emri ya da yıkılan mağaradan kaçış. */
  leaving: Set<number>;
  /** Geçişin biteceği an — ekrandaki geri sayım. */
  at: Date | null;
}

const NO_CAVE_HINT: CaveHint = { entering: new Set(), leaving: new Set(), at: null };

/**
 * Şehrin süren mağara görevinden geçiş ipuçlarını çıkarır.
 *
 * ⚠️ `cave_return` de okunuyor: mağara yıkıldığında kahraman **`in_cave` kalıyor** ve şehre
 * kaçıyor. Yalnız `cave_withdraw`a bakılsaydı, kaçış sırasında ekranda «Mağarada» yazardı ve
 * oyuncu ortada mağara kalmadığı hâlde kahramanını içeride sanırdı.
 */
async function readCaveHint(db: Db, cityId: number): Promise<CaveHint> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT type, payload, execute_at FROM missions
     WHERE target_city_id = ${cityId}
       AND type IN ('cave_store', 'cave_withdraw', 'cave_return')
       AND status IN ('scheduled', 'running')
     ORDER BY execute_at LIMIT 1
  `);
  const row = rows[0];
  if (!row) return NO_CAVE_HINT;
  const ids = new Set(payloadHeroIds(row['payload']));
  const store = String(row['type']) === 'cave_store';
  return {
    entering: store ? ids : new Set(),
    leaving: store ? new Set() : ids,
    at: toDateOrNull(row['execute_at']),
  };
}

function mapHero(r: Record<string, unknown>): HeroRow {
  return {
    id: Number(r['id']),
    name: String(r['name']),
    level: Number(r['level']),
    xp: Number(r['xp']),
    fAtk: Number(r['f_atk']),
    fDef: Number(r['f_def']),
    mAtk: Number(r['m_atk']),
    mDef: Number(r['m_def']),
    status: String(r['status']),
    cityId: r['city_id'] == null ? null : Number(r['city_id']),
    reviveUntil: toDateOrNull(r['revive_until']),
    onMission: Boolean(r['on_mission']),
    missionAt: toDateOrNull(r['mission_at']),
  };
}

@Controller('api/v1')
@UseGuards(AuthGuard)
export class HeroController {
  /**
   * ⚠️ `SettingsService` 2026-08-11'de eklendi: diriltme maliyeti artık dünya bazlı ayarlanabilir
   * (`economy.heroReviveCostRate`). Desen `city.controller.ts` ile aynı — denetleyici servisi
   * doğrudan enjekte edip `catalog(worldId)` çağırıyor, ayrı bir `catalogFor` fabrikası yok.
   */
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly cities: CityService,
    private readonly clock: GameClockService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Şehrin tapınağı: kahraman listesi + tapınak seviyesi + oyuncunun TOPLAM tapınak seviyesi
   * (çıkma ihtimali onunla hesaplanır, bu yüzden ekranda gösteriliyor).
   */
  @Get('cities/:id/temple')
  async temple(@Param('id') id: string, @Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const player = req.player!;
    const cityId = Number(id);
    const now = await this.clock.gameNow(player.worldId);
    await this.assertOwnCity(cityId, player.playerId, player.worldId);
    await this.finishRevives(player.playerId, now);
    await this.syncLevels(player.playerId);

    /**
     * ⚠️ Dönüş görevinde `origin_city_id` = SALDIRILAN şehir, `target_city_id` = eve dönülen
     * şehir (`scheduleReturn` ikisini ters yazıyor: görev "oradan buraya" gidiyor). Bu yüzden
     * eşleşme iki kolona birden bakıyor — yalnız `origin`e bakılsaydı ölü kahraman dönüş
     * yolundayken kendi tapınağından **kaybolurdu**.
     */
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT h.id, h.name, h.level, h.xp, h.f_atk, h.f_def, h.m_atk, h.m_def,
             h.status, h.city_id, h.revive_until,
             (mh.hero_id IS NOT NULL) AS on_mission,
             m.execute_at AS mission_at
        FROM heroes h
        LEFT JOIN mission_heroes mh ON mh.hero_id = h.id
        LEFT JOIN missions m ON m.id = mh.mission_id
       WHERE h.player_id = ${player.playerId}
         AND (h.city_id = ${cityId}
              OR (m.type = 'return' AND m.target_city_id = ${cityId})
              OR (m.type <> 'return' AND m.origin_city_id = ${cityId}))
       ORDER BY h.level DESC, h.id
    `);

    const cave = await readCaveHint(this.db, cityId);

    const [templeRow] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT level FROM buildings WHERE city_id = ${cityId} AND type = 'temple'
    `);
    const [sumRow] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COALESCE(SUM(b.level), 0) AS total
        FROM buildings b JOIN cities c ON c.id = b.city_id
       WHERE c.player_id = ${player.playerId} AND b.type = 'temple'
    `);
    const [countRow] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM heroes WHERE player_id = ${player.playerId}
    `);

    const templeLevel = Number(templeRow?.['level'] ?? 0);
    return {
      templeLevel,
      /** ⭐ Çıkma ihtimalinde kullanılan değer: TÜM şehirlerin tapınak toplamı. */
      templeTotal: Number(sumRow?.['total'] ?? 0),
      heroCount: Number(countRow?.['n'] ?? 0),
      maxHeroes: DEFAULT_COMBAT_CONFIG.capture.maxHeroes,
      pointsPerLevel: DEFAULT_COMBAT_CONFIG.hero.pointsPerLevel,
      heroes: rows.map((r) => this.present(mapHero(r), templeLevel, now, player.worldId, cave)),
    };
  }

  /**
   * **Özellikler** — puan dağıtımı. Puanlar yalnız ARTTIRILABİLİR (geri alma yok, oyunun kendi
   * davranışı) ve toplam `3 × seviye`yi aşamaz.
   */
  @Post('heroes/:id/skills')
  async skills(
    @Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = skillsRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz yetenek dağıtımı.');
    const next = parsed.data;
    const hero = await this.load(Number(id), req.player!.playerId);
    if (hero.status === 'destroyed') throw new BadRequestException('Bu kahraman yok edildi.');

    const budget = hero.level * DEFAULT_COMBAT_CONFIG.hero.pointsPerLevel;
    const spent = next.fAtk + next.fDef + next.mAtk + next.mDef;
    if (spent > budget) {
      throw new BadRequestException(`En fazla ${budget} puan dağıtılabilir, ${spent} verildi.`);
    }
    // Puan geri alınamaz: her yetenek yalnız artabilir.
    if (next.fAtk < hero.fAtk || next.fDef < hero.fDef
      || next.mAtk < hero.mAtk || next.mDef < hero.mDef) {
      throw new BadRequestException('Dağıtılmış puan geri alınamaz.');
    }
    await this.db.execute(sql`
      UPDATE heroes SET f_atk = ${next.fAtk}, f_def = ${next.fDef},
                        m_atk = ${next.mAtk}, m_def = ${next.mDef}
       WHERE id = ${hero.id}
    `);
    return { id: hero.id, ...next, remaining: budget - spent };
  }

  /**
   * **Kahraman Adı Değiştir** — her durumda serbest (şehirde · görevde · ölü · diriltilirken).
   *
   * ⚠️ Eskiden tek bir istisna vardı: **yok edilmiş** kahramanın adı değiştirilemezdi. Yok olma
   * 2026-08-01'de kalktığı için istisnanın konusu da kalmadı. Adlar savaş raporlarında görünür.
   */
  @Post('heroes/:id/rename')
  async rename(
    @Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = renameRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException(NAME_RULE_MESSAGE);
    const hero = await this.load(Number(id), req.player!.playerId);
    await this.db.execute(sql`UPDATE heroes SET name = ${parsed.data.name} WHERE id = ${hero.id}`);
    return { id: hero.id, name: parsed.data.name };
  }

  /**
   * **Dirilt** — ücretli. Maliyet ve süre kahramanın seviyesiyle büyür; süre kahramanın
   * bulunduğu şehrin **kendi tapınağıyla** kısalır (doküman: *"o şehirdeki … ölen kahramanın
   * diriltilme süresini belirler"*).
   */
  @Post('heroes/:id/revive')
  async revive(@Param('id') id: string, @Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const player = req.player!;
    const now = await this.clock.gameNow(player.worldId);
    /**
     * ⭐ §tatil modu — diriltme hem kaynak harcıyor hem bir geri sayım başlatıyor; ikisi de
     * "oyun donuk" sözüyle çelişir. Kaynak zaten donmuş olduğu için harcama yapılabilirdi
     * ama sayaç tatilin içinde işler ve oyuncu çıkışta hazır kahramanla dönerdi.
     */
    await this.assertNotOnVacation(player.playerId);
    const hero = await this.load(Number(id), player.playerId);
    if (hero.status !== 'dead') throw new BadRequestException('Bu kahraman diriltilemez.');
    if (hero.cityId == null) throw new BadRequestException('Kahraman henüz şehre dönmedi.');

    const temple = await this.templeLevel(hero.cityId);
    const cost = heroReviveCost(hero.level, this.settings.catalog(player.worldId));
    const paid = await this.cities.trySpend(hero.cityId, cost, now);
    if (!paid) throw new BadRequestException('Yeterli kaynak yok.');

    const until = new Date(now.getTime() + heroReviveSeconds(hero.level, temple) * 1000);
    await this.db.execute(sql`
      UPDATE heroes SET status = 'reviving', revive_until = ${until.toISOString()}::timestamptz
       WHERE id = ${hero.id}
    `);
    return { id: hero.id, status: 'reviving', reviveUntil: until.toISOString(), cost };
  }

  /**
   * **Diriltmeyi Durdur** — üretim bandındaki iptalle aynı mantık: kaynak İADE EDİLMEZ
   * (harcanan zaman ve kaynak yanar), kahraman tekrar `dead` olur.
   */
  @Post('heroes/:id/revive/cancel')
  async cancelRevive(@Param('id') id: string, @Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const hero = await this.load(Number(id), req.player!.playerId);
    if (hero.status !== 'reviving') throw new BadRequestException('Süren bir diriltme yok.');
    await this.db.execute(sql`
      UPDATE heroes SET status = 'dead', revive_until = NULL WHERE id = ${hero.id}
    `);
    return { id: hero.id, status: 'dead' };
  }

  /* ── yardımcılar ─────────────────────────────────────────────────────────── */

  /** Ekrana giden biçim: durum etiketi + eşikler + diriltme maliyeti. */
  private present(
    h: HeroRow, templeLevel: number, now: Date, worldId: number,
    cave: CaveHint = NO_CAVE_HINT,
  ): Record<string, unknown> {
    const nextXp = heroXpForLevel(h.level + 1);
    return {
      id: h.id,
      name: h.name,
      level: h.level,
      xp: h.xp,
      /** Bir sonraki seviyenin eşiği — ekranda `mevcut / eşik` yazar (oyunun kendi biçimi). */
      xpForNext: nextXp,
      skills: { fAtk: h.fAtk, fDef: h.fDef, mAtk: h.mAtk, mDef: h.mDef },
      pointsTotal: h.level * DEFAULT_COMBAT_CONFIG.hero.pointsPerLevel,
      pointsSpent: h.fAtk + h.fDef + h.mAtk + h.mDef,
      /**
       * İstemcinin kendi sözlüğü. ⭐ `returning` YENİ (2026-08-01): ölmüş ama henüz eve
       * varmamış kahraman. Etiketi de «Yok Edildi» ama Dirilt kapalı — diriltme kapısı
       * `city_id != null` şartını zaten arıyor (`revive`), ekran onunla aynı şeyi söylemeli.
       */
      state: h.status === 'reviving' ? 'reviving'
        : h.status === 'dead' ? (h.cityId == null ? 'returning' : 'dead')
          : h.status === 'in_cave' ? (cave.leaving.has(h.id) ? 'leaving_cave' : 'in_cave')
            : cave.entering.has(h.id) ? 'entering_cave'
              : h.onMission ? 'on_mission' : 'in_city',
      /** Mağara geçişinin biteceği an — yalnız `entering_cave` / `leaving_cave` doluyken anlamlı. */
      caveAt: cave.entering.has(h.id) || cave.leaving.has(h.id)
        ? cave.at?.toISOString() ?? null : null,
      reviveUntil: h.reviveUntil?.toISOString() ?? null,
      /** Dönüş yolundaki kahramanın şehre varış anı (yalnız `returning` durumunda dolu). */
      returningAt: h.status === 'dead' && h.cityId == null
        ? h.missionAt?.toISOString() ?? null : null,
      /** ⚠️ Maliyet/süre şehre VARMIŞ ölü kahramanda gösterilir — yolda henüz diriltilemez. */
      reviveCost: h.status === 'dead' && h.cityId != null
        ? heroReviveCost(h.level, this.settings.catalog(worldId)) : null,
      reviveSeconds: h.status === 'dead' && h.cityId != null
        ? heroReviveSeconds(h.level, templeLevel) : null,
      _now: now.toISOString(),
    };
  }

  private async load(id: number, playerId: number): Promise<HeroRow> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT h.id, h.name, h.level, h.xp, h.f_atk, h.f_def, h.m_atk, h.m_def,
             h.status, h.city_id, h.revive_until, h.player_id,
             (mh.hero_id IS NOT NULL) AS on_mission, m.execute_at AS mission_at
        FROM heroes h
        LEFT JOIN mission_heroes mh ON mh.hero_id = h.id
        LEFT JOIN missions m ON m.id = mh.mission_id
       WHERE h.id = ${id}
    `);
    if (!row) throw new NotFoundException('Kahraman bulunamadı.');
    if (Number(row['player_id']) !== playerId) throw new ForbiddenException('Bu kahraman sizin değil.');
    return mapHero(row);
  }

  /** §tatil modu — kod `on_vacation`, gövde `mission.controller.ts` ailesiyle aynı (403). */
  private async assertNotOnVacation(playerId: number): Promise<void> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM players WHERE id = ${playerId} AND vacation_until IS NOT NULL
    `);
    if (rows.length > 0) {
      throw new ForbiddenException({
        code: 'on_vacation',
        message: 'Tatil modundayken kahraman diriltilemez. Önce tatil modundan çık.',
      });
    }
  }

  private async templeLevel(cityId: number): Promise<number> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT level FROM buildings WHERE city_id = ${cityId} AND type = 'temple'
    `);
    return Number(row?.['level'] ?? 0);
  }

  private async assertOwnCity(cityId: number, playerId: number, worldId: number): Promise<void> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT player_id, world_id FROM cities WHERE id = ${cityId}
    `);
    if (!row) throw new NotFoundException('Şehir bulunamadı.');
    if (Number(row['player_id']) !== playerId || Number(row['world_id']) !== worldId) {
      throw new ForbiddenException('Bu şehir sizin değil.');
    }
  }

  /** Süresi dolan diriltmeleri tamamlar (tembel temizlik — ayrı bir tick gerekmez). */
  private async finishRevives(playerId: number, now: Date): Promise<void> {
    await this.db.execute(sql`
      UPDATE heroes SET status = 'alive', revive_until = NULL
       WHERE player_id = ${playerId} AND status = 'reviving'
         AND revive_until <= ${now.toISOString()}::timestamptz
    `);
  }

  /**
   * ⭐ SEVİYEYİ TECRÜBEYLE HİZALAR — güvenlik ağı.
   *
   * Asıl yükseltme savaş anında yapılıyor (`settleHeroes`), yani oyuncu ordusu daha yoldayken
   * yeni seviyeyi görüyor. Burası, XP'nin başka bir yoldan (elle düzeltme, eski kayıt, ileride
   * eklenecek bir görev) değişmesi hâlinde seviyenin geride kalmamasını sağlıyor.
   * Seviye ASLA düşürülmez: `level` yalnız yukarı gider.
   */
  private async syncLevels(playerId: number): Promise<void> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, level, xp FROM heroes WHERE player_id = ${playerId}
    `);
    for (const r of rows) {
      const should = heroLevelForXp(Number(r['xp']));
      if (should > Number(r['level'])) {
        await this.db.execute(sql`UPDATE heroes SET level = ${should} WHERE id = ${r['id']}`);
      }
    }
  }
}
