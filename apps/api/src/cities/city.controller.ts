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
import { enqueueRequest } from '@mobilwar/contracts';
import {
  defenseStructureCost, BUILDINGS, BUILDINGS_BY_ID, BUILDING_ORDER, BUILDING_REQUIREMENTS,
  DEFENSE_ORDER, TECHS, TECHS_BY_ID, TECH_ORDER, TECH_REQUIREMENTS,
  UNITS, UNITS_BY_ID, UNIT_REQUIREMENTS, WARRIOR_ORDER,
  buildingCost, buildingTimeSeconds, orderBy, techCost, techTimeSeconds, timeFromCost,
  trainingTimeSeconds, unitCost,
} from '@mobilwar/catalog';
import { z } from 'zod';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import {
  isVerified, UNVERIFIED_CODE, UNVERIFIED_MESSAGE, unverifiedLimits,
} from '../auth/unverified.ts';
import { CaveError, CaveService, type CaveState } from '../cave/cave.service.ts';
import { toDate, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { QueueError, QueueService } from '../queues/queue.service.ts';
import { SettingsService } from '../settings/settings.service.ts';
import { GameClockService } from '../world/game-clock.service.ts';
import { CapacityService } from './capacity.service.ts';
import { NAME_RULE_MESSAGE, renameRequest } from './city-name.ts';
import { AbandonError, CityService } from './city.service.ts';

/** Mağara emri: `{ units: { dwarf: 100, elf: 20 } }`. Tür süzgeci servistedir. */
const caveJobRequest = z.object({
  units: z.record(z.string(), z.number().int().nonnegative()),
});

/** Mağara durumunu JSON'a çevirir (tarihleri ISO). */
function caveResponse(st: CaveState): Record<string, unknown> {
  return {
    ...st,
    repairUntil: st.repairUntil?.toISOString() ?? null,
    job: st.job
      ? {
        ...st.job,
        startedAt: st.job.startedAt.toISOString(),
        finishAt: st.job.finishAt.toISOString(),
      }
      : null,
  };
}

/** Mağara hatası → HTTP. Kod istemciye AYNEN gider (i18n'e hazır, §13.14). */
function toCaveHttp(err: unknown): Error {
  if (!(err instanceof CaveError)) return err as Error;
  const body = { code: err.code, message: err.message, details: err.details };
  if (err.code === 'city_not_found') return new NotFoundException(body);
  /* ⭐ `on_vacation` §tatil modu — `not_owner` ile aynı aile (403): istek kusursuz,
     oyuncunun o an bu yetkisi yok. İlk ölçümde 400 dönüyordu (varsayılan dal). */
  if (err.code === 'not_owner' || err.code === 'on_vacation') return new ForbiddenException(body);
  // Kapasite/meşgul/onarım: istek geçerli ama şu an yapılamaz → 409.
  if (err.code === 'cave_busy' || err.code === 'cave_repairing'
    || err.code === 'capacity_exceeded' || err.code === 'not_enough_units'
    || err.code === 'no_job') {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}

@Controller('api/v1/cities')
@UseGuards(AuthGuard)
export class CityController {
  private readonly capacity = new CapacityService();

  constructor(
    private readonly cities: CityService,
    private readonly queues: QueueService,
    private readonly cave: CaveService,
    private readonly clock: GameClockService,
    private readonly settings: SettingsService,
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
      /**
       * ⭐ §tatil modu — ekran hem «Tatilde» rozetini hem donmuş sayaçları buradan çiziyor.
       * ⚠️ Bayrak `production` içine GÖMÜLMEDİ: hızların 0 olması tatilin SONUCU, sebebin
       * kendisi değil. Ayrı alan olmasaydı istemci "0/sa ⇒ tatilde" diye çıkarım yapardı ve
       * madeni olmayan yeni şehir de tatilde görünürdü.
       */
      onVacation: snap.onVacation,
      speed: snap.speed,
      /**
       * ⭐ Harita/sefer sabitleri — Dünya ekranındaki süre önizlemesi bunları `travelSeconds`e
       * verir. ⚠️ Panelden dünya başına ayarlanabildikleri için istemci `DEFAULT_MAP_CONFIG`e
       * güvenemez: bir sayı değişir değişmez ekranda yazan süre gerçek varış anından sapardı.
       */
      map: snap.map,
      buildings: snap.buildings,
      units,
      defenses,
      techs,
      /**
       * ⭐ SAVAŞÇI SAYACI **TEK BİRİMLİKTİR** (kullanıcı kararı 2026-07-28): ekranda 300 birimin
       * toplam süresi değil, sıradaki BİR birimin geri sayımı görünür ve dolunca sıfırlanır.
       * `unitStartedAt`/`unitFinishAt` o tek birimin penceresi, `remaining` kalan sipariş adedi.
       * Hesap sunucuda: istemci `done`'dan türetseydi kaynak birikimi gibi kaymalar başlardı.
       */
      queues: (await this.queues.openQueues(cityId)).map((q) => {
        const perUnit = q.perUnitSeconds ?? null;
        const done = q.done ?? 0;
        const active = (q.position ?? 1) === 1;
        const unitStart = perUnit != null
          ? new Date(q.startedAt.getTime() + done * perUnit * 1000) : null;
        const unitFinish = perUnit != null && unitStart != null
          ? new Date(unitStart.getTime() + perUnit * 1000) : null;
        return {
          ...q,
          startedAt: q.startedAt.toISOString(),
          finishAt: q.finishAt.toISOString(),
          remaining: q.count == null ? null : Math.max(0, q.count - done),
          // Bekleyen emirde tek-birim penceresi YOK: henüz bant onun değil.
          unitStartedAt: active && unitStart ? unitStart.toISOString() : null,
          unitFinishAt: active && unitFinish ? unitFinish.toISOString() : null,
        };
      }),
      /**
       * ⭐ AKADEMİLER ORTAK (kullanıcı, 2026-07-28): teknik seviyesi oyuncu-geneldir, bu yüzden
       * **hangi şehirde araştırılıyorsa** onun ilerlemesi her şehrin Akademi ekranında görünür.
       * İptal yalnız o araştırmayı başlatan şehirden yapılabilir → satırda `cityId` taşınıyor.
       */
      techQueues: (await this.playerTechQueues(player.playerId)).map((q) => ({
        ...q, startedAt: q.startedAt.toISOString(), finishAt: q.finishAt.toISOString(),
      })),
      capacity: this.capacity.status(snap.buildings, defenses),
      /**
       * ⭐ MAĞARA şehir yanıtının parçası (§13.20.5): Yapılar ekranı hem geri sayımı hem
       * kapasiteyi hem de "onarımda" durumunu tek istekte çiziyor. Ayrı uca koysaydık Yapılar
       * her açılışta ikinci bir gidiş-dönüş yapardı.
       */
      cave: caveResponse(await this.cave.state(cityId, gameNow)),
      /**
       * ⭐ SUR ONARIMI (§13.21.2, kullanıcı 2026-07-30): Savunma ekranı Sur satırında geri
       * sayım + progress bar çizer, yükseltme butonu onarım boyunca kilitlenir. `integrity`
       * onarım BAŞLARKENki oran — o anki değer istemcide `wallCurrentIntegrity` ile türetilir.
       */
      wallRepair: await this.wallRepair(cityId, gameNow),
      /**
       * ⭐ Sol menü Tapınak NOKTASI için (2026-07-30): bu şehirde diriltilen kahraman var mı?
       * Tapınak ekranının tamamını çekmek yerine tek boolean — menü her şehir yanıtında hazır.
       */
      heroReviving: await this.heroReviving(cityId),
      serverNow: new Date().toISOString(),
      gameNow: gameNow.toISOString(),
    };
  }

  /* ── Şehir yönetimi (Seçenekler menüsü) ───────────────────────────────────── */

  /**
   * ⭐ **ŞEHİR ADI DEĞİŞTİR** — orijinalde Seçenekler menüsünün maddesi
   * (`DecompiledSrc/src/g.java` case 63 → `a[5]`, ekran 62) ve işlem **seçili şehir**
   * üzerinde yapılıyor (`teknik_ve_yapi_dokumantasyonu.md:934`).
   *
   * Kural `gameName`de: 3-10 karakter, Türkçe harf serbest (§C1). Sınır orijinal formdan
   * geliyor (`g.java:1893` → `m.a(2, 10, "Şehir Adı", null)`).
   *
   * ⚠️ Ad benzersiz DEĞİL — oyunun kendisi de zorlamıyor. Kimlik `id`, ad yalnız etiket;
   * benzersizlik dayatsaydık iki oyuncunun "Kayseri"si çakışır, üstelik ad ekranda hep
   * koordinatla birlikte görünüyor.
   */
  @Post(':id/rename')
  async rename(
    @Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const player = req.player!;
    const parsed = renameRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException(NAME_RULE_MESSAGE);

    const cityId = Number(id);
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM cities
       WHERE id = ${cityId} AND player_id = ${player.playerId} AND world_id = ${player.worldId}
    `);
    if (!row) throw new NotFoundException('Şehir bulunamadı.');

    /**
     * ⭐ §verify — doğrulanmamış hesap şehir adını değiştiremez (kullanıcı şartı). Sebep
     * kozmetik değil: ad dünya tablosunda, sıralamada ve savaş raporlarında görünüyor, yani
     * ücretsiz üretilebilen hesaplar reklam/taciz metni basmanın en ucuz yolu olurdu.
     */
    if (unverifiedLimits().enabled && !(await isVerified(this.db as never, player.playerId))) {
      throw new ForbiddenException({
        code: UNVERIFIED_CODE, message: UNVERIFIED_MESSAGE.rename,
      });
    }

    const name = parsed.data.name;
    /**
     * ⚠️ Ad değişimi + olay **tek transaction'da** (§1): iki ayrı yazımda ad değişip olay
     * düşmezse şehir şeridi eski adı göstermeye devam eder ve oyuncu "olmadı" sanıp tekrar dener.
     */
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`UPDATE cities SET name = ${name} WHERE id = ${cityId}`);
      await tx.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (${player.worldId}, 'city:renamed',
                ${JSON.stringify({ cityId, playerId: player.playerId, name })}::jsonb)
      `);
    });
    return { id: cityId, name };
  }

  /**
   * Terk **ön kontrolü** — ekran düğmeyi körlemesine sunmasın.
   *
   * ⚠️ Bu uç bir yetki kapısı DEĞİL: asıl kontrol `abandon()` içinde, kilit altında yeniden
   * yapılıyor. Buradaki liste yalnız oyuncuya "şu an neden olmuyor" demek için.
   */
  @Get(':id/abandon')
  async abandonCheck(
    @Param('id') id: string, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const player = req.player!;
    const cityId = Number(id);
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM cities
       WHERE id = ${cityId} AND player_id = ${player.playerId} AND world_id = ${player.worldId}
    `);
    if (!row) throw new NotFoundException('Şehir bulunamadı.');
    const blockers = await this.cities.abandonBlockers(cityId);
    return { canAbandon: blockers.length === 0, blockers };
  }

  /**
   * ⭐ **ŞEHİR TERK ET** — orijinalde Seçenekler menüsünde (`g.java` case 63 → `a[4]`,
   * ekran 61) ve onay diyaloğundan geçiyor: *"Şehri terk ediyorsunuz. Emin misiniz!"*
   * (`g.java:613`). Onay ARAYÜZDE; sunucu onay bilmez, yalnız şartlara bakar.
   *
   * ⚠️ Geri alınamaz: binalar, savunma ve kaynak yok olur, puan düşer. Bedeli oyuncuya
   * onay diyaloğunda açıkça yazıyoruz (`CityAdminPanel`).
   */
  @Post(':id/abandon')
  @HttpCode(200)
  async abandon(
    @Param('id') id: string, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const player = req.player!;
    try {
      const res = await this.cities.abandon({
        cityId: Number(id), playerId: player.playerId, worldId: player.worldId,
      });
      return { ok: true, ...res };
    } catch (err) {
      if (err instanceof AbandonError) {
        // 409: istek geçerli ama şu an yapılamaz. Engeller AYNEN istemciye gider (§13.14).
        throw new ConflictException({ code: 'abandon_blocked', blockers: err.blockers });
      }
      throw err;
    }
  }

  /* ── Mağara (§13.20) ──────────────────────────────────────────────────────── */

  /**
   * Savaşçıları mağaraya yollar.
   *
   * ⚠️ **İPTALİ YOK** (kullanıcı kararı): `CANCELABLE_TYPES` listesinde `cave_*` bilerek
   * bulunmuyor. Birlikler emir anında barakadan düşer; oyuncu kararının bedelini süreyle öder.
   */
  @Post(':id/cave/store')
  async caveStore(
    @Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    return this.caveJob('store', Number(id), body, req);
  }

  /** Mağaradaki savaşçıları şehre çağırır. */
  @Post(':id/cave/withdraw')
  async caveWithdraw(
    @Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    return this.caveJob('withdraw', Number(id), body, req);
  }

  /**
   * ⭐ Süren mağara emrini iptal eder — **anlık ve yan etkisiz** (kullanıcı kararı 2026-07-28).
   *
   * Kendi ucu var, `POST /missions/:id/cancel` kullanılmıyor: o uç yoldaki orduyu geri çağırır
   * ve **dönüş süresi** üretir. Mağarada dönülecek bir yol yok — emir yalnız bir sayaçtır.
   */
  @Delete(':id/cave/job')
  @HttpCode(200)
  async caveCancel(
    @Param('id') id: string, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const player = req.player!;
    const cityId = Number(id);
    const at = await this.clock.gameNow(player.worldId);
    try {
      const res = await this.cave.cancel({ cityId, playerId: player.playerId });
      return { ...res, cave: caveResponse(await this.cave.state(cityId, at)) };
    } catch (err) {
      throw toCaveHttp(err);
    }
  }

  private async caveJob(
    direction: 'store' | 'withdraw', cityId: number, body: unknown, req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const player = req.player!;
    const parsed = caveJobRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz istek.');
    const at = await this.clock.gameNow(player.worldId);

    try {
      const res = direction === 'store'
        ? await this.cave.store({ cityId, playerId: player.playerId, units: parsed.data.units, at })
        : await this.cave.withdraw({ cityId, playerId: player.playerId, units: parsed.data.units, at });
      return {
        ...res,
        finishAt: new Date(at.getTime() + res.seconds * 1000).toISOString(),
        cave: caveResponse(await this.cave.state(cityId, at)),
        serverNow: new Date().toISOString(),
      };
    } catch (err) {
      throw toCaveHttp(err);
    }
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
    /**
     * ⭐ Oyuncunun EKRANDA gördüğü fiyat ve süreler de dünyanın etkin katalog sabitlerinden
     * (§admin Faz 5). Burada varsayılanı kullansaydık ekrandaki fiyat ile `queue.service`in
     * gerçekten tahsil ettiği fiyat ayrışırdı — kullanıcının fark edeceği ilk hata bu olurdu.
     */
    const cfg = this.settings.catalog(player.worldId);

    const techRows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT type, level FROM techs WHERE player_id = ${player.playerId}
    `);
    const defRows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT type, count FROM defenses WHERE city_id = ${cityId}
    `);
    const techs = mapCounts(techRows, 'level');
    const defenses = mapCounts(defRows, 'count');

    // Süreleri ETKİLEYEN yapılar: Mimar Okulu (yapı + savunma), Baraka (savaşçı), Akademi (teknik).
    // ⚠️ Varsayılan 0 (1 DEĞİL): bölen `1,4^seviye`, kurulmamış yapı hiç hızlandırmamalı.
    const architect = snap.buildings['architect_school'] ?? 0;
    const barracks = snap.buildings['barracks'] ?? 0;
    const academy = snap.buildings['academy'] ?? 0;

    /**
     * ⭐ §verify — doğrulanmamış hesabın tavanları ekrana **sunucudan** iniyor.
     *
     * ⚠️ İstemcide sabit yazmak yanlış olurdu: sayılar panelden ayarlanabiliyor (`verify`
     * grubu) ve yönetici tavanı 5 yaptığında ekran hâlâ 3 der, düğme yanlış yerde kilitlenirdi.
     * `null` = kısıt yok (hesap doğrulanmış ya da anahtar kapalı) → istemci hiçbir şey çizmez.
     */
    const vlim = unverifiedLimits();
    const verify = vlim.enabled && !(await isVerified(this.db as never, player.playerId))
      ? {
        maxBuildingLevel: vlim.maxBuildingLevel,
        maxTechLevel: vlim.maxTechLevel,
        maxDefenseLevel: vlim.maxDefenseLevel,
        maxWarriors: vlim.maxWarriors,
      }
      : null;

    return {
      verify,
      // ⚠️ Sıra ARAYÜZ sırasıdır (§ display-order): katalog dizisinin kendi sırası değil.
      buildings: orderBy(BUILDINGS, BUILDING_ORDER).map((b) => {
        const level = snap.buildings[b.id] ?? 0;
        const next = level + 1;
        const available = next <= b.maxLevel;
        return {
          id: b.id, name: b.name.tr, level, maxLevel: b.maxLevel,
          nextCost: available ? buildingCost(b.id, next, cfg) : null,
          // ⭐ Bir sonraki seviyenin SÜRESİ (saniye) — oyuncu maliyetle birlikte bunu da görmeli.
          nextSeconds: available
            ? Math.round(buildingTimeSeconds(b.id, next, architect, cfg)) : null,
          requirements: BUILDING_REQUIREMENTS[b.id] ?? {},
          requirementNames: nameRequirements(BUILDING_REQUIREMENTS[b.id]),
        };
      }),
      units: orderBy(UNITS.filter((u) => u.kind === 'warrior'), WARRIOR_ORDER).map((u) => ({
        // `carry` nakliye/destek formunun kapasite göstergesi için gerekiyor (§NAKLİYE).
        id: u.id, name: u.name.tr, area: u.area, speed: u.speed, carry: u.carry,
        cost: unitCost(u.id, 1, cfg),
        /** Bir birimin üretim süresi: `((a+y)/10)^0,8 × 65 / 1,4^Baraka`. Adetle çarpılır. */
        seconds: Math.round(trainingTimeSeconds(u.id, barracks, 'balanced', cfg)),
        requirements: UNIT_REQUIREMENTS[u.id] ?? {},
        requirementNames: nameRequirements(UNIT_REQUIREMENTS[u.id]),
      })),
      defenses: orderBy(
        UNITS.filter((u) => u.kind === 'defense' && u.id !== 'temple'), DEFENSE_ORDER,
      ).map((u) => {
        // Sur ve Büyü Kalkanı ADET değil SEVİYE taşır (§13.11.1b) → maliyet/süre seviyeye bağlı.
        const levelBased = u.id === 'wall' || u.id === 'magic_shield';
        const current = defenses[u.id] ?? 0;
        const nextLevel = current + 1;
        // ⚠️ Formül katalogda tek yerde (`defenseStructureCost`) — burada kopyası vardı.
        const cost = levelBased
          ? defenseStructureCost(u.id, nextLevel, cfg)
          : unitCost(u.id, 1, cfg);
        return {
          id: u.id, name: u.name.tr, area: u.area, levelBased, current, cost,
          // İki dal da AYNI kural: 10(a+y)/1,4^MimarOkulu. Fark yalnız maliyetin seviyeli olması.
          seconds: levelBased
            ? Math.round(timeFromCost(cost, architect, cfg))
            : Math.round(trainingTimeSeconds(u.id, architect, 'balanced', cfg)),
          requirements: UNIT_REQUIREMENTS[u.id] ?? {},
          requirementNames: nameRequirements(UNIT_REQUIREMENTS[u.id]),
        };
      }),
      techs: orderBy(TECHS, TECH_ORDER).map((t) => {
        const level = techs[t.id] ?? 0;
        return {
          id: t.id, name: t.name.tr, level,
          nextCost: techCost(t.id, level + 1, cfg),
          nextSeconds: Math.round(techTimeSeconds(t.id, level + 1, academy, cfg)),
          requirements: TECH_REQUIREMENTS[t.id] ?? {},
          requirementNames: nameRequirements(TECH_REQUIREMENTS[t.id]),
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

  /**
   * ⭐ Kuyruktaki savaşçı emrinin sırasını değiştirir (yalnız BEKLEYENLER).
   * Üretimi süren emir yerinden oynatılamaz — servis bunu ayrıca doğruluyor.
   */
  @Post('queues/:queueId/move')
  @HttpCode(200)
  async moveQueue(
    @Param('queueId') queueId: string, @Body() body: unknown, @Req() req: AuthedRequest,
  ): Promise<{ ok: true }> {
    const player = req.player!;
    const dir = (body as { direction?: string })?.direction === 'down' ? 'down' : 'up';
    try {
      await this.queues.moveUnitQueue({
        queueId: Number(queueId), playerId: player.playerId, direction: dir,
      });
      return { ok: true };
    } catch (err) {
      throw toHttp(err);
    }
  }

  /** Bu şehirde diriltilmekte olan kahraman var mı? (menü aktivite noktası) */
  private async heroReviving(cityId: number): Promise<boolean> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM heroes WHERE city_id = ${cityId} AND status = 'reviving' LIMIT 1
    `);
    return rows.length > 0;
  }

  /** Sur onarımı sürüyorsa penceresi; sürmüyorsa null (bitmişse bütünlük 1 sayılır). */
  private async wallRepair(cityId: number, at: Date): Promise<Record<string, unknown> | null> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT wall_integrity, wall_repair_from, wall_repair_until FROM cities WHERE id = ${cityId}
    `);
    const until = rows[0]?.['wall_repair_until'];
    if (until == null) return null;
    const untilDate = toDate(until);
    if (untilDate <= at) return null;
    const from = rows[0]?.['wall_repair_from'];
    return {
      /** Onarım BAŞLARKENki bütünlük (0-1) — o anki değeri istemci türetir. */
      integrity: Number(rows[0]?.['wall_integrity'] ?? 1),
      from: from == null ? null : toDate(from).toISOString(),
      until: untilDate.toISOString(),
    };
  }

  /** Oyuncunun TÜM şehirlerindeki açık teknik araştırmaları (Akademiler ortak). */
  private async playerTechQueues(playerId: number): Promise<{
    id: number; itemType: string; targetLevel: number | null;
    cityId: number; cityName: string; startedAt: Date; finishAt: Date;
  }[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT q.id, q.item_type, q.target_level, q.city_id, c.name AS city_name,
             q.started_at, q.finish_at
        FROM queues q JOIN cities c ON c.id = q.city_id
       WHERE q.player_id = ${playerId} AND q.category = 'tech'
         AND q.completed_at IS NULL AND q.canceled_at IS NULL
       ORDER BY q.finish_at
    `);
    return rows.map((r) => ({
      id: Number(r['id']),
      itemType: String(r['item_type']),
      targetLevel: r['target_level'] == null ? null : Number(r['target_level']),
      cityId: Number(r['city_id']),
      cityName: String(r['city_name']),
      startedAt: toDate(r['started_at']),
      finishAt: toDate(r['finish_at']),
    }));
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

/**
 * ⭐ Ön-şart `id`'lerini TÜRKÇE adlara çevirir (§13.14): kod/DB İngilizce kalır, **oyuncuya
 * görünen metin Türkçedir**. Arayüzde "castle 2" değil "Kale 2" yazmalı.
 *
 * Çeviri sunucuda yapılıyor çünkü ad katalogdadır; istemcinin ikinci bir eşleme tablosu tutması
 * kaçınılmaz olarak katalogdan sürüklenirdi.
 */
function nameRequirements(
  req: { buildings?: Record<string, number>; techs?: Record<string, number> } | undefined,
): { id: string; name: string; level: number; kind: 'building' | 'tech' }[] {
  const out: { id: string; name: string; level: number; kind: 'building' | 'tech' }[] = [];
  for (const [id, level] of Object.entries(req?.buildings ?? {})) {
    out.push({
      id, level, kind: 'building',
      name: BUILDINGS_BY_ID[id]?.name.tr ?? UNITS_BY_ID[id]?.name.tr ?? id,
    });
  }
  for (const [id, level] of Object.entries(req?.techs ?? {})) {
    out.push({ id, level, kind: 'tech', name: TECHS_BY_ID[id]?.name.tr ?? id });
  }
  return out;
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
    /**
     * ⭐ §verify — doğrulanmamış hesabın tavanı **403**, 400 değil: istek kusursuz, hesabın
     * yetkisi yetmiyor. `target_protected` ile aynı aile (bkz. `missionErrorToHttp`).
     */
    case 'email_unverified':
    /** ⭐ §tatil modu — aynı aile: istek kusursuz, oyuncu kendi isteğiyle donmuş durumda. */
    case 'on_vacation':
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
