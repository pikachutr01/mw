/**
 * ⭐ KÜRATÖRLÜ AKSİYONLAR (admin Faz 7) — kullanıcının somut ihtiyacı:
 * *"Test yapmak için kendi şehirlerime ordu koymak istesem şu an nasıl yapacağımı bilmediğim
 * için sana sormak zorundayım."*
 *
 * ⚠️ **NEDEN HAM SQL DEĞİL DE ADI KONMUŞ AKSİYON?** Çünkü bu tablolarda ham yazmanın **sessizce
 * yanlış** olduğu yerler var ve en tehlikelisi de en masum görünen:
 *
 *   • `cities.gold` — ⛔ ELLE YAZILAMAZ. Kaynak **tembel birikimle** hesaplanıyor:
 *     gerçek değer = `gold` + (şimdi − `resources_at`) × üretim. `gold`u elle yazıp
 *     `resources_at`e dokunmazsan bir sonraki okumada üstüne birikim ekleniyor ve yazdığın
 *     sayı tutmuyor. Doğrusu: önce `materialize()` (çıpayı şimdiye çek), sonra ekle/çıkar.
 *   • `players.score` — TÜREV (`floor(score_base/1000)`). Elle yazılırsa ilk `addScoreBase`
 *     çağrısında geri hesaplanıp silinir.
 *   • `queues` ↔ `missions` — ÇİFT. Kuyruk satırını silip görevi bırakırsan bitiş görevi
 *     olmayan bir binayı tamamlamaya çalışır.
 *   • `wall_integrity` ↔ `wall_repair_from/until` — üçü tutarlı olmalı.
 *
 * Buradaki her aksiyon doğru servisten geçiyor ve `audit_log`a yazıyor.
 */
import {
  BadRequestException, Body, Controller, HttpCode, Inject, NotFoundException, Post, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { LEVEL_BASED, NAME_MAX, NAME_MIN, UNITS_BY_ID, TECHS_BY_ID, pickHeroName } from '@mobilwar/catalog';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.ts';
import { CityService } from '../cities/city.service.ts';
import { toDate, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { recomputeScoreBaseFromHoldings } from '../scoring/score.service.ts';
import { endVacation } from '../vacation/vacation.service.ts';
import { GameClockService } from '../world/game-clock.service.ts';
import { AdminGuard, AdminStepUpGuard, type AdminRequest } from './admin.guard.ts';

const cityId = z.number().int().positive();

const giveUnitsBody = z.object({
  cityId,
  /** `{ dwarf: 500, elf: 200 }` — 0 veya negatif ADET SİLER (test kurulumunu sıfırlamak için). */
  units: z.record(z.string(), z.number().int().min(-1_000_000).max(10_000_000)),
  /** ⚠️ Mağaraya koymak ayrı bir tablo (`cave_units`); karıştırmasın diye açık bayrak. */
  target: z.enum(['barracks', 'cave']).default('barracks'),
});

const resourcesBody = z.object({
  cityId,
  /** Negatif = al. ⚠️ Kasa eksiye düşmez; taban 0'da kırpılır. */
  gold: z.number().int().min(-1_000_000_000).max(1_000_000_000).default(0),
  food: z.number().int().min(-1_000_000_000).max(1_000_000_000).default(0),
});

const buildingBody = z.object({
  cityId,
  type: z.string().min(1).max(40),
  level: z.number().int().min(0).max(40),
});

const techBody = z.object({
  playerId: z.number().int().positive(),
  type: z.string().min(1).max(40),
  level: z.number().int().min(0).max(40),
});

const heroBody = z.object({
  cityId,
  level: z.number().int().min(0).max(80).default(1),
  // ⚠️ Sınır katalogdan: panelden verilen kahramanın adı da oyunun kuralına uymalı.
  name: z.string().trim().min(NAME_MIN).max(NAME_MAX).optional(),
});

/** ⚠️ `level` alanı `defenses.count` kolonuna yazılır — orada sayı ADET değil SEVİYE. */
const structureBody = z.object({
  cityId,
  type: z.string().min(1).max(40),
  level: z.number().int().min(0).max(40),
});

const cancelBody = z.object({ id: z.number().int().positive() });
const playerOnly = z.object({ playerId: z.number().int().positive() });

const moveCityBody = z.object({ cityId, toPlayerId: z.number().int().positive() });

@Controller('api/v1/admin/actions')
@UseGuards(AuthGuard, AdminGuard, AdminStepUpGuard)
export class AdminActionsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly cities: CityService,
    private readonly clock: GameClockService,
  ) {}

  /* ── Ordu ─────────────────────────────────────────────────────────────────── */

  /**
   * ⭐ ŞEHRE ORDU KOY — kullanıcının açıkça istediği aksiyon.
   *
   * ⚠️ Birim kimliği **katalogdan doğrulanıyor**: uydurma bir tip `units` tablosuna yazılırsa
   * savaş motoru onu tanımaz ve o şehrin her savaşı sessizce eksik orduyla çözülür.
   *
   * ⚠️ Puan **bilerek güncellenmiyor**. Bu bir test aracı; ordu vermek oyuncuyu sıralamada
   * yukarı taşımamalı. Puanı da düzeltmek isteyen `recompute-score` aksiyonunu çağırır —
   * ikisini birleştirmek, "ordu koydum ama sıralama değişti" sürprizini doğururdu.
   */
  @Post('give-units')
  @HttpCode(200)
  async giveUnits(@Body() body: unknown, @Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const d = parse(giveUnitsBody, body);
    const city = await this.city(d.cityId);

    const unknown = Object.keys(d.units).filter((id) => !UNITS_BY_ID[id]);
    if (unknown.length > 0) {
      throw new BadRequestException(`Bilinmeyen birim: ${unknown.join(', ')}`);
    }
    const table = d.target === 'cave' ? 'cave_units' : 'units';

    await this.db.transaction(async (tx) => {
      for (const [type, count] of Object.entries(d.units)) {
        if (count <= 0) {
          await tx.execute(sql`
            DELETE FROM ${sql.raw(table)} WHERE city_id = ${d.cityId} AND type = ${type}
          `);
          continue;
        }
        await tx.execute(sql`
          INSERT INTO ${sql.raw(table)} (city_id, type, count) VALUES (${d.cityId}, ${type}, ${count})
          ON CONFLICT (city_id, type) DO UPDATE SET count = ${count}
        `);
      }
    });
    await this.audit(city.worldId, req, 'admin.action.give_units', 'city', d.cityId, {
      units: d.units, target: d.target,
    });
    return { ok: true, cityId: d.cityId, target: d.target };
  }

  /* ── Kaynak ───────────────────────────────────────────────────────────────── */

  /**
   * ⭐ KAYNAK VER/AL — **kısıt 4'ün ta kendisi**.
   *
   * ⚠️ `UPDATE cities SET gold = …` YAZMIYORUZ. Kaynak tembel birikimle hesaplanıyor:
   * `resources_at` çıpası geçmişte kaldığı için elle yazılan sayının üstüne birikim eklenir ve
   * yazdığın değer tutmaz. Doğru sıra: **önce `materialize()`** (çıpayı oyun saatine çek),
   * **sonra** `add()`. İkisi de `CityService`te ve oyunun kendi kullandığı yol.
   */
  @Post('grant-resources')
  @HttpCode(200)
  async grantResources(@Body() body: unknown, @Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const d = parse(resourcesBody, body);
    const city = await this.city(d.cityId);
    const at = await this.clock.gameNow(city.worldId);

    // ⚠️ Sıra load-bearing: materialize → oku → kırp → ekle.
    await this.cities.materialize(d.cityId, at);
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT gold, food FROM cities WHERE id = ${d.cityId}
    `);
    const have = { gold: Number(row!['gold']), food: Number(row!['food']) };
    // Kasa eksiye düşmesin: "al" isteği mevcuttan fazlaysa mevcut kadar alınır.
    const delta = {
      gold: Math.max(d.gold, -have.gold),
      food: Math.max(d.food, -have.food),
    };
    await this.cities.add(d.cityId, delta, at);

    await this.audit(city.worldId, req, 'admin.action.grant_resources', 'city', d.cityId, {
      requested: { gold: d.gold, food: d.food }, applied: delta, before: have,
    });
    return { ok: true, applied: delta, before: have };
  }

  /* ── Yapı / teknik ────────────────────────────────────────────────────────── */

  /**
   * Yapı seviyesi ata. ⚠️ `level = 0` satırı SİLER (yapı hiç yokmuş gibi).
   *
   * ⚠️ Puan yine güncellenmiyor — `recompute-score` ayrı. Kale bütçesi (`Σ seviye ≤ Kale×10`)
   * de **kontrol edilmiyor**: bu bir test aracı ve bütçeyi aşan bir kurulum kurmak meşru bir
   * ihtiyaç. Oyuncunun kendi yükseltmesi zaten `queue.service`te kontrol ediliyor.
   */
  @Post('set-building')
  @HttpCode(200)
  async setBuilding(@Body() body: unknown, @Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const d = parse(buildingBody, body);
    const city = await this.city(d.cityId);

    if (d.level === 0) {
      await this.db.execute(sql`
        DELETE FROM buildings WHERE city_id = ${d.cityId} AND type = ${d.type}
      `);
    } else {
      await this.db.execute(sql`
        INSERT INTO buildings (city_id, type, level) VALUES (${d.cityId}, ${d.type}, ${d.level})
        ON CONFLICT (city_id, type) DO UPDATE SET level = ${d.level}
      `);
    }
    await this.audit(city.worldId, req, 'admin.action.set_building', 'city', d.cityId, {
      type: d.type, level: d.level,
    });
    return { ok: true };
  }

  /** Teknik seviyesi ata. ⚠️ Teknikler OYUNCUYA ait, şehre değil (§13.11). */
  @Post('set-tech')
  @HttpCode(200)
  async setTech(@Body() body: unknown, @Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const d = parse(techBody, body);
    if (!TECHS_BY_ID[d.type]) throw new BadRequestException(`Bilinmeyen teknik: ${d.type}`);
    const [p] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT world_id FROM players WHERE id = ${d.playerId}
    `);
    if (!p) throw new NotFoundException('Oyuncu bulunamadı.');

    if (d.level === 0) {
      await this.db.execute(sql`
        DELETE FROM techs WHERE player_id = ${d.playerId} AND type = ${d.type}
      `);
    } else {
      await this.db.execute(sql`
        INSERT INTO techs (player_id, type, level) VALUES (${d.playerId}, ${d.type}, ${d.level})
        ON CONFLICT (player_id, type) DO UPDATE SET level = ${d.level}
      `);
    }
    await this.audit(Number(p['world_id']), req, 'admin.action.set_tech', 'player', d.playerId, {
      type: d.type, level: d.level,
    });
    return { ok: true };
  }

  /* ── Savunma ──────────────────────────────────────────────────────────────── */

  /**
   * ⭐ SAVUNMA BİRİMİ ATA (2. nesil Tur 2) — Okçu Kulesi, Tuzak, Balista…
   *
   * ⚠️ `give-units`ten **ayrı bir aksiyon**, çünkü ayrı bir tablo (`defenses`) ve ayrı bir
   * doğrulama kümesi: barakaya kule, sura cüce yazılamamalı. Tek aksiyonda birleştirseydik
   * `target` seçeneği üçe çıkar ve yanlış tabloya yazma ihtimali sessizce açılırdı.
   *
   * ⛔ Sur ve Büyü Kalkanı burada **reddedilir**: aynı tabloda dururlar ama `count` alanları
   * adet değil SEVİYE taşır. Onlar için `set-defense-structure` var.
   */
  @Post('set-defense')
  @HttpCode(200)
  async setDefense(@Body() body: unknown, @Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const d = parse(giveUnitsBody.omit({ target: true }), body);
    const city = await this.city(d.cityId);

    for (const id of Object.keys(d.units)) {
      const def = UNITS_BY_ID[id];
      if (!def || def.kind !== 'defense') {
        throw new BadRequestException(`«${id}» bir savunma birimi değil.`);
      }
      if (LEVEL_BASED.has(id)) {
        throw new BadRequestException(
          `«${def.name.tr}» adet değil SEVİYE taşır — «Sur / Büyü Kalkanı seviyesi» aksiyonunu kullan.`,
        );
      }
    }

    await this.db.transaction(async (tx) => {
      for (const [type, count] of Object.entries(d.units)) {
        if (count <= 0) {
          await tx.execute(sql`
            DELETE FROM defenses WHERE city_id = ${d.cityId} AND type = ${type}
          `);
          continue;
        }
        await tx.execute(sql`
          INSERT INTO defenses (city_id, type, count) VALUES (${d.cityId}, ${type}, ${count})
          ON CONFLICT (city_id, type) DO UPDATE SET count = ${count}
        `);
      }
    });
    await this.audit(city.worldId, req, 'admin.action.set_defense', 'city', d.cityId, {
      units: d.units,
    });
    return { ok: true, cityId: d.cityId };
  }

  /**
   * ⭐ SUR / BÜYÜ KALKANI SEVİYESİ.
   *
   * ⚠️ `defenses.count` burada **seviye**dir. `0` satırı siler (yapı hiç yokmuş gibi).
   *
   * ⚠️ Sur seviyesini değiştirmek `wall_integrity`ye DOKUNMAZ — o ayrı bir eksen (bütünlük,
   * savaşta düşen ve onarımla geri gelen oran). Seviyeyi 10 yapıp bütünlüğü %20'de bırakmak
   * geçerli bir durumdur; ikisini birbirine bağlamak "seviye verdim ama sur hâlâ yıkık"
   * sürprizini çözmez, sadece gizlerdi.
   */
  @Post('set-defense-structure')
  @HttpCode(200)
  async setDefenseStructure(
    @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const d = parse(structureBody, body);
    const city = await this.city(d.cityId);
    if (!LEVEL_BASED.has(d.type)) {
      throw new BadRequestException(`«${d.type}» seviye taşıyan bir savunma yapısı değil.`);
    }

    if (d.level === 0) {
      await this.db.execute(sql`
        DELETE FROM defenses WHERE city_id = ${d.cityId} AND type = ${d.type}
      `);
    } else {
      await this.db.execute(sql`
        INSERT INTO defenses (city_id, type, count) VALUES (${d.cityId}, ${d.type}, ${d.level})
        ON CONFLICT (city_id, type) DO UPDATE SET count = ${d.level}
      `);
    }
    await this.audit(city.worldId, req, 'admin.action.set_defense_structure', 'city', d.cityId, {
      type: d.type, level: d.level,
    });
    return { ok: true, type: d.type, level: d.level };
  }

  /* ── Kahraman ─────────────────────────────────────────────────────────────── */

  /** Şehre kahraman ver (test için). Ad verilmezse katalogdan seçilir. */
  @Post('give-hero')
  @HttpCode(200)
  async giveHero(@Body() body: unknown, @Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const d = parse(heroBody, body);
    const city = await this.city(d.cityId);
    const name = d.name ?? pickHeroName(Math.random, []);

    /**
     * ⚠️ **DÜZELTİLDİ (2. nesil Tur 2): eskiden `'idle'` yazılıyordu.** O değer şemanın
     * sözlüğünde (`alive | dead | reviving`) YOK ve iki yerde farklı okunuyordu:
     * kahraman ekranı onu `in_city` sayıyor (`hero.controller.ts:245` dallanmasının son
     * dalı), ama dünya listesi `dead: status !== 'alive'` diyor
     * (`command.controller.ts:405`) → panelden verilen kahraman oyuncuya **ölü** görünüyordu.
     */
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, level, status)
      VALUES (${city.worldId}, ${city.playerId}, ${d.cityId}, ${name}, ${d.level}, 'alive')
      RETURNING id
    `);
    await this.audit(city.worldId, req, 'admin.action.give_hero', 'city', d.cityId, {
      heroId: Number(row!['id']), name, level: d.level,
    });
    return { ok: true, heroId: Number(row!['id']), name };
  }

  /* ── İptaller ─────────────────────────────────────────────────────────────── */

  /**
   * ⭐ KUYRUĞU İPTAL ET — ⚠️ **kuyruk ve görev ÇİFTTİR.** Yalnız `queues` satırını silseydik
   * `missions`taki bitiş görevi ayakta kalır ve vadesi gelince olmayan bir kuyruğu
   * tamamlamaya çalışırdı. İkisi tek transaction'da kapatılıyor.
   *
   * ⚠️ İade YOK: bu bir yönetim aracı, oyuncunun iptali değil. Kaynak iadesi isteniyorsa
   * `grant-resources` ayrıca çağrılır — sessizce para vermek, aracı öngörülemez yapardı.
   */
  @Post('cancel-queue')
  @HttpCode(200)
  async cancelQueue(@Body() body: unknown, @Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const d = parse(cancelBody, body);
    const [q] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT world_id, city_id, mission_id, category, item_type FROM queues WHERE id = ${d.id}
    `);
    if (!q) throw new NotFoundException('Kuyruk satırı bulunamadı.');

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE queues SET canceled_at = now() WHERE id = ${d.id} AND canceled_at IS NULL
      `);
      if (q['mission_id'] != null) {
        await tx.execute(sql`
          UPDATE missions SET status = 'canceled', finished_at = now()
           WHERE id = ${Number(q['mission_id'])} AND status IN ('scheduled', 'running')
        `);
      }
    });
    await this.audit(Number(q['world_id']), req, 'admin.action.cancel_queue', 'queue', d.id, {
      category: q['category'], itemType: q['item_type'], missionId: q['mission_id'],
    });
    return { ok: true };
  }

  /**
   * Görevi iptal et (yoldaki ordu dâhil).
   *
   * ⚠️ Ordu **geri gelmez**: iptal edilen sefer bir dönüş bacağı üretmiyor. Bu bilerek böyle —
   * yönetim aracı oyunun kendi iptal akışını taklit etmeye çalışsaydı (dönüş görevi üret,
   * süreyi hesapla, birimleri iade et) ikinci bir kod yolu doğar ve ikisi ayrışırdı. Yoldaki
   * orduyu geri istiyorsan `give-units` ile şehre koy.
   */
  @Post('cancel-mission')
  @HttpCode(200)
  async cancelMission(@Body() body: unknown, @Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const d = parse(cancelBody, body);
    const [m] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT world_id, type, status FROM missions WHERE id = ${d.id}
    `);
    if (!m) throw new NotFoundException('Görev bulunamadı.');

    await this.db.execute(sql`
      UPDATE missions SET status = 'canceled', finished_at = now()
       WHERE id = ${d.id} AND status IN ('scheduled', 'running')
    `);
    await this.audit(Number(m['world_id']), req, 'admin.action.cancel_mission', 'mission', d.id, {
      type: m['type'], previousStatus: m['status'],
    });
    return { ok: true };
  }

  /* ── Türev alanlar ────────────────────────────────────────────────────────── */

  /**
   * ⭐ PUANI YENİDEN HESAPLA — `players.score` **türevdir** (`floor(score_base/1000)`) ve elle
   * yazılırsa ilk `addScoreBase` çağrısında geri hesaplanıp silinir. Doğrusu sahip olunan
   * yapı/teknik/orduyu taramak; oyunun kendi fonksiyonu (`recomputeScoreBaseFromHoldings`)
   * bunu zaten yapıyor.
   */
  @Post('recompute-score')
  @HttpCode(200)
  async recomputeScore(@Body() body: unknown, @Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const d = parse(playerOnly, body);
    const [p] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT world_id, score FROM players WHERE id = ${d.playerId}
    `);
    if (!p) throw new NotFoundException('Oyuncu bulunamadı.');

    await recomputeScoreBaseFromHoldings(this.db as never, d.playerId);
    const [after] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT score FROM players WHERE id = ${d.playerId}
    `);
    await this.audit(Number(p['world_id']), req, 'admin.action.recompute_score', 'player', d.playerId, {
      before: Number(p['score']), after: Number(after!['score']),
    });
    return { ok: true, before: Number(p['score']), after: Number(after!['score']) };
  }

  /**
   * ⭐ TATİLİ BİTİR (§tatil modu) — veri tabanı tarayıcısındaki elle düzenlemenin YERİNE.
   *
   * ⚠️ `players.vacation_until`i elle NULL yapmak iki şeyi birden bozuyordu: `players_vacation_pair`
   * CHECK'ini kırıyordu **ve** daha sinsisi, `cities.resources_at` çıpasını giriş anında bırakıyordu
   * → oyuncu ilk okumada tüm tatil süresini kaynak olarak alıyordu. Bu yüzden kolon
   * düzenlenebilir listesinden çıkarıldı ve iş `endVacation()`e verildi: bayrağı temizlemekle
   * çıpayı ileri çekmek tek yerde.
   *
   * ⚠️ 48 saatlik alt sınır BURADA UYGULANMIYOR — o kural oyuncu için. Yönetici müdahalesi
   * zaten kuralın dışında (destek talebi, yanlışlıkla girilmiş tatil).
   */
  @Post('end-vacation')
  @HttpCode(200)
  async endVacationAction(@Body() body: unknown, @Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const d = parse(playerOnly, body);
    const [p] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT world_id, vacation_since, vacation_until FROM players WHERE id = ${d.playerId}
    `);
    if (!p) throw new NotFoundException('Oyuncu bulunamadı.');
    if (p['vacation_until'] == null) throw new BadRequestException('Oyuncu tatil modunda değil.');

    const worldId = Number(p['world_id']);
    const at = await this.clock.gameNow(worldId);
    const ended = await endVacation(this.db as never, d.playerId, at);
    await this.audit(worldId, req, 'admin.action.end_vacation', 'player', d.playerId, {
      before: { since: p['vacation_since'], until: p['vacation_until'] },
      after: { endedAt: at.toISOString(), ended },
    });
    return { ok: true, endedAt: at.toISOString() };
  }

  /**
   * Şehri başka oyuncuya taşı.
   *
   * ⚠️ Şehirle birlikte **taşınmayanlar** var ve bunlar bilerek bırakılıyor: kahramanlar
   * (oyuncuya ait, şehre değil), teknikler (oyuncuya ait), yoldaki seferler. Kahraman şehirde
   * kalırsa yeni sahibin şehrinde eski sahibin kahramanı durur — bu yüzden **engelleniyor**.
   */
  @Post('move-city')
  @HttpCode(200)
  async moveCity(@Body() body: unknown, @Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const d = parse(moveCityBody, body);
    const city = await this.city(d.cityId);
    const [to] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT world_id FROM players WHERE id = ${d.toPlayerId}
    `);
    if (!to) throw new NotFoundException('Hedef oyuncu bulunamadı.');
    if (Number(to['world_id']) !== city.worldId) {
      throw new BadRequestException('Şehir başka bir dünyaya taşınamaz.');
    }
    const [hero] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM heroes WHERE city_id = ${d.cityId} LIMIT 1
    `);
    if (hero) throw new BadRequestException('Şehirde kahraman var — önce taşı veya sil.');

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE cities SET player_id = ${d.toPlayerId}, is_capital = false WHERE id = ${d.cityId}
      `);
      // ⚠️ Kuyruk satırlarının sahibi de değişmeli, yoksa eski sahip iptal edebilir.
      await tx.execute(sql`
        UPDATE queues SET player_id = ${d.toPlayerId}
         WHERE city_id = ${d.cityId} AND canceled_at IS NULL AND completed_at IS NULL
      `);
    });
    /** ⚠️ İki tarafın da puanı türev — ikisi de yeniden hesaplanmalı. */
    await recomputeScoreBaseFromHoldings(this.db as never, city.playerId);
    await recomputeScoreBaseFromHoldings(this.db as never, d.toPlayerId);

    await this.audit(city.worldId, req, 'admin.action.move_city', 'city', d.cityId, {
      from: city.playerId, to: d.toPlayerId,
    });
    return { ok: true, from: city.playerId, to: d.toPlayerId };
  }

  /* ── Yardımcılar ──────────────────────────────────────────────────────────── */

  private async city(id: number): Promise<{ worldId: number; playerId: number; name: string }> {
    const [c] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT world_id, player_id, name FROM cities WHERE id = ${id}
    `);
    if (!c) throw new NotFoundException('Şehir bulunamadı.');
    return {
      worldId: Number(c['world_id']),
      playerId: Number(c['player_id']),
      name: String(c['name']),
    };
  }

  private async audit(
    worldId: number, req: AdminRequest, action: string, entity: string, entityId: number,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after)
      VALUES (${worldId}, ${req.player!.playerId}, ${action}, ${entity}, ${entityId},
              ${JSON.stringify(payload)}::jsonb)
    `);
  }
}

/**
 * ⚠️ Genel tip `z.output<S>` — `z.ZodType<T>` DEĞİL. `.default(0)` kullanan alanlarda giriş
 * tipi `number | undefined`, çıkış tipi `number`; `ZodType<T>` ile yazıldığında TypeScript
 * girişi seçiyor ve varsayılanı olan her alan gereksizce `undefined` görünüyordu.
 */
function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data as z.output<S>;
}

/**
 * Panelin form üreteceği aksiyon künyesi — **tek kaynak**.
 *
 * ⚠️ 2. nesilde iki eksik kapatıldı:
 *   1. **Zod'daki sınırlar buraya taşındı** (`min`/`max`/`required`). Öncesinde doğrulama tek
 *      yönlüydü: panel her değeri gönderiyor, sunucu 400 dönüyordu. Yönetici "seviye en fazla
 *      kaç" sorusunun cevabını ancak hata alarak öğreniyordu.
 *   2. **Seçici alan tipleri** (`unitPicker` · `buildingPicker` · `techPicker` ·
 *      `structurePicker`). Kullanıcının şikâyeti buydu: *"askerleri json formatında bir de
 *      İngilizce adları ile yazarak yapmam gerekiyor."* Seçenekler `GET /admin/catalog`ten
 *      geliyor; burada sabit bir liste tutsaydık katalog büyüdüğünde ikisi ayrışırdı.
 */
export const ADMIN_ACTIONS = [
  {
    id: 'give-units', label: 'Şehre ordu koy',
    description: 'Barakaya veya mağaraya birim yazar. 0 adet satırı siler. '
      + '⚠️ Puanı DEĞİŞTİRMEZ — gerekiyorsa «Puanı yeniden hesapla».',
    fields: [
      { key: 'cityId', label: 'Şehir', type: 'cityPicker', required: true },
      { key: 'units', label: 'Birimler', type: 'unitPicker', source: 'warriors', required: true },
      {
        key: 'target', label: 'Nereye', type: 'select', options: ['barracks', 'cave'],
        optionLabels: ['Baraka', 'Mağara'], default: 'barracks',
      },
    ],
  },
  {
    id: 'set-defense', label: 'Savunma birimi ata',
    description: 'Okçu Kulesi, Tuzak, Balista… ⛔ Sur ve Büyü Kalkanı burada YOK: onlar adet '
      + 'değil seviye taşır, ayrı aksiyonu var.',
    fields: [
      { key: 'cityId', label: 'Şehir', type: 'cityPicker', required: true },
      { key: 'units', label: 'Savunma birimleri', type: 'unitPicker', source: 'defenses', required: true },
    ],
  },
  {
    id: 'set-defense-structure', label: 'Sur / Büyü Kalkanı seviyesi',
    description: '⚠️ Bu ikisi `defenses` tablosunda durur ama sayıları ADET değil SEVİYE. '
      + 'Sur bütünlüğüne (`wall_integrity`) dokunmaz — o ayrı bir eksen.',
    fields: [
      { key: 'cityId', label: 'Şehir', type: 'cityPicker', required: true },
      { key: 'type', label: 'Yapı', type: 'structurePicker', required: true },
      { key: 'level', label: 'Seviye', type: 'number', min: 0, max: 40, required: true },
    ],
  },
  {
    id: 'grant-resources', label: 'Kaynak ver / al',
    description: '⚠️ Kaynak tembel birikimle tutuluyor; bu aksiyon önce çıpayı şimdiye çeker '
      + '(materialize), sonra ekler. Negatif değer alır, kasa eksiye düşmez.',
    fields: [
      { key: 'cityId', label: 'Şehir', type: 'cityPicker', required: true },
      { key: 'gold', label: 'Altın (±)', type: 'number', min: -1_000_000_000, max: 1_000_000_000, default: 0 },
      { key: 'food', label: 'Yemek (±)', type: 'number', min: -1_000_000_000, max: 1_000_000_000, default: 0 },
    ],
  },
  {
    id: 'set-building', label: 'Yapı seviyesi ata',
    description: '0 = yapıyı sil. ⚠️ Kale bütçesi kontrol EDİLMEZ (test aracı).',
    fields: [
      { key: 'cityId', label: 'Şehir', type: 'cityPicker', required: true },
      { key: 'type', label: 'Yapı', type: 'buildingPicker', required: true },
      { key: 'level', label: 'Seviye', type: 'number', min: 0, max: 40, required: true },
    ],
  },
  {
    id: 'set-tech', label: 'Teknik seviyesi ata',
    description: '⚠️ Teknikler OYUNCUYA ait, şehre değil — seviye tüm şehirlerde geçerli.',
    fields: [
      { key: 'playerId', label: 'Oyuncu', type: 'playerPicker', required: true },
      { key: 'type', label: 'Teknik', type: 'techPicker', required: true },
      { key: 'level', label: 'Seviye', type: 'number', min: 0, max: 40, required: true },
    ],
  },
  {
    id: 'give-hero', label: 'Kahraman ver',
    description: 'Şehre canlı bir kahraman ekler. Ad verilmezse katalogdan seçilir.',
    fields: [
      { key: 'cityId', label: 'Şehir', type: 'cityPicker', required: true },
      { key: 'level', label: 'Seviye', type: 'number', min: 0, max: 80, default: 1 },
      { key: 'name', label: 'Ad (isteğe bağlı)', type: 'text', minLength: 3, maxLength: 10 },
    ],
  },
  {
    id: 'cancel-queue', label: 'Kuyruğu iptal et',
    description: '⚠️ Kuyruk ve bitiş GÖREVİ çifttir; ikisi birlikte kapatılır. İade YOK.',
    fields: [{ key: 'id', label: 'Kuyruk kimliği', type: 'number', min: 1, required: true }],
  },
  {
    id: 'cancel-mission', label: 'Görevi iptal et',
    description: '⚠️ Yoldaki ordu GERİ GELMEZ (dönüş bacağı üretilmez).',
    fields: [{ key: 'id', label: 'Görev kimliği', type: 'number', min: 1, required: true }],
  },
  {
    id: 'recompute-score', label: 'Puanı yeniden hesapla',
    description: '`players.score` türevdir; sahip olunan yapı/teknik/ordudan yeniden kurulur.',
    fields: [{ key: 'playerId', label: 'Oyuncu', type: 'playerPicker', required: true }],
  },
  {
    id: 'end-vacation', label: 'Tatili bitir',
    description: '⚠️ Bunu veri tabanı tarayıcısından ELLE YAPMA: `vacation_until`i NULL yapmak '
      + 'kaynak çıpasını giriş anında bırakır ve oyuncu ilk okumada TÜM tatil süresini kaynak '
      + 'olarak alır. Bu aksiyon çıpayı da şimdiye çeker. 48 saatlik alt sınır uygulanmaz.',
    fields: [{ key: 'playerId', label: 'Oyuncu', type: 'playerPicker', required: true }],
  },
  {
    id: 'move-city', label: 'Şehri başka oyuncuya taşı',
    description: '⚠️ Kahraman varsa engellenir. İki tarafın puanı da yeniden hesaplanır. '
      + 'Taşınan şehir başkent olmaz.',
    fields: [
      { key: 'cityId', label: 'Şehir', type: 'cityPicker', required: true },
      { key: 'toPlayerId', label: 'Yeni sahip', type: 'playerPicker', required: true },
    ],
  },
] as const;
