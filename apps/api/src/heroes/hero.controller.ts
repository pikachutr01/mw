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
 */
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Inject, NotFoundException,
  Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { heroLevelForXp, heroReviveCost, heroReviveSeconds, heroXpForLevel } from '@mobiwar/catalog';
import { DEFAULT_COMBAT_CONFIG } from '@mobiwar/engine';
import { z } from 'zod';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import { CityService } from '../cities/city.service.ts';
import { toDateOrNull, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { GameClockService } from '../world/game-clock.service.ts';

/** Yok edilen kahraman tapınakta bu kadar süre "Yok Edildi" olarak görünür, sonra silinir. */
export const DESTROYED_VISIBLE_MS = 60 * 60 * 1000;

const skillsRequest = z.object({
  fAtk: z.number().int().nonnegative(),
  fDef: z.number().int().nonnegative(),
  mAtk: z.number().int().nonnegative(),
  mDef: z.number().int().nonnegative(),
});
const renameRequest = z.object({ name: z.string().trim().min(2).max(24) });

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
  destroyedAt: Date | null;
  onMission: boolean;
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
    // İkisi de yalnız ilgili durumda dolu: `reviving` → reviveUntil, `destroyed` → destroyedAt.
    reviveUntil: toDateOrNull(r['revive_until']),
    destroyedAt: toDateOrNull(r['destroyed_at']),
    onMission: Boolean(r['on_mission']),
  };
}

@Controller('api/v1')
@UseGuards(AuthGuard)
export class HeroController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly cities: CityService,
    private readonly clock: GameClockService,
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
    await this.sweepDestroyed(player.playerId, now);
    await this.finishRevives(player.playerId, now);
    await this.syncLevels(player.playerId);

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT h.id, h.name, h.level, h.xp, h.f_atk, h.f_def, h.m_atk, h.m_def,
             h.status, h.city_id, h.revive_until, h.destroyed_at,
             (mh.hero_id IS NOT NULL) AS on_mission
        FROM heroes h
        LEFT JOIN mission_heroes mh ON mh.hero_id = h.id
        LEFT JOIN missions m ON m.id = mh.mission_id
       WHERE h.player_id = ${player.playerId}
         AND (h.city_id = ${cityId} OR m.origin_city_id = ${cityId})
       ORDER BY h.level DESC, h.id
    `);

    const [templeRow] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT level FROM buildings WHERE city_id = ${cityId} AND type = 'temple'
    `);
    const [sumRow] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COALESCE(SUM(b.level), 0) AS total
        FROM buildings b JOIN cities c ON c.id = b.city_id
       WHERE c.player_id = ${player.playerId} AND b.type = 'temple'
    `);
    const [countRow] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM heroes
       WHERE player_id = ${player.playerId} AND status <> 'destroyed'
    `);

    const templeLevel = Number(templeRow?.['level'] ?? 0);
    return {
      templeLevel,
      /** ⭐ Çıkma ihtimalinde kullanılan değer: TÜM şehirlerin tapınak toplamı. */
      templeTotal: Number(sumRow?.['total'] ?? 0),
      heroCount: Number(countRow?.['n'] ?? 0),
      maxHeroes: DEFAULT_COMBAT_CONFIG.capture.maxHeroes,
      pointsPerLevel: DEFAULT_COMBAT_CONFIG.hero.pointsPerLevel,
      heroes: rows.map((r) => this.present(mapHero(r), templeLevel, now)),
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
   * **Kahraman Adı Değiştir** — şehirde, görevde ve ÖLÜ iken serbest; yalnız **yok edilmiş**
   * kahramanın adı değiştirilemez (kullanıcı kararı). Adlar savaş raporlarında görünür.
   */
  @Post('heroes/:id/rename')
  async rename(
    @Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = renameRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Ad 2-24 karakter olmalı.');
    const hero = await this.load(Number(id), req.player!.playerId);
    if (hero.status === 'destroyed') {
      throw new BadRequestException('Yok edilmiş kahramanın adı değiştirilemez.');
    }
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
    const hero = await this.load(Number(id), player.playerId);
    if (hero.status !== 'dead') throw new BadRequestException('Bu kahraman diriltilemez.');
    if (hero.cityId == null) throw new BadRequestException('Kahraman henüz şehre dönmedi.');

    const temple = await this.templeLevel(hero.cityId);
    const cost = heroReviveCost(hero.level);
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
  private present(h: HeroRow, templeLevel: number, now: Date): Record<string, unknown> {
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
      /** İstemcinin kendi sözlüğü. */
      state: h.status === 'destroyed' ? 'destroyed'
        : h.status === 'reviving' ? 'reviving'
          : h.status === 'dead' ? 'dead'
            : h.onMission ? 'on_mission' : 'in_city',
      reviveUntil: h.reviveUntil?.toISOString() ?? null,
      /** Yok edilen kahramanın listeden düşeceği an. */
      disappearsAt: h.destroyedAt
        ? new Date(h.destroyedAt.getTime() + DESTROYED_VISIBLE_MS).toISOString() : null,
      reviveCost: h.status === 'dead' ? heroReviveCost(h.level) : null,
      reviveSeconds: h.status === 'dead' ? heroReviveSeconds(h.level, templeLevel) : null,
      _now: now.toISOString(),
    };
  }

  private async load(id: number, playerId: number): Promise<HeroRow> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT h.id, h.name, h.level, h.xp, h.f_atk, h.f_def, h.m_atk, h.m_def,
             h.status, h.city_id, h.revive_until, h.destroyed_at, h.player_id,
             (mh.hero_id IS NOT NULL) AS on_mission
        FROM heroes h LEFT JOIN mission_heroes mh ON mh.hero_id = h.id
       WHERE h.id = ${id}
    `);
    if (!row) throw new NotFoundException('Kahraman bulunamadı.');
    if (Number(row['player_id']) !== playerId) throw new ForbiddenException('Bu kahraman sizin değil.');
    return mapHero(row);
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

  /** Süresi dolan "Yok Edildi" kayıtlarını siler (tembel temizlik — ayrı bir tick gerekmez). */
  private async sweepDestroyed(playerId: number, now: Date): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM heroes
       WHERE player_id = ${playerId} AND status = 'destroyed'
         AND destroyed_at < ${new Date(now.getTime() - DESTROYED_VISIBLE_MS).toISOString()}::timestamptz
    `);
  }

  /** Süresi dolan diriltmeleri tamamlar (aynı tembel yaklaşım). */
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
      SELECT id, level, xp FROM heroes WHERE player_id = ${playerId} AND status <> 'destroyed'
    `);
    for (const r of rows) {
      const should = heroLevelForXp(Number(r['xp']));
      if (should > Number(r['level'])) {
        await this.db.execute(sql`UPDATE heroes SET level = ${should} WHERE id = ${r['id']}`);
      }
    }
  }
}
