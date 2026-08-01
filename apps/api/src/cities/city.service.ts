/**
 * ⭐ ŞEHİR ve TEMBEL KAYNAK BİRİKİMİ (SİSTEM PLANI §3, §13.11.1, §13.11.1a)
 *
 * **Tick YOK.** Kaynak, `resources_at` çıpasından itibaren geçen OYUN süresiyle okuma veya
 * mutasyon anında hesaplanır (`materialize`). Bu, 10.000 şehir için saniyede 10.000 UPDATE
 * yapmaktan kat kat ucuz ve tam olarak aynı sonucu verir.
 *
 * ⚠️ İki kural pazarlıksız:
 *  1. **Zaman OYUN saatinden gelir**, `now()`'dan değil → bakımda kaynak birikmez (§2).
 *  2. **Kesir saklanır** (`numeric(20,6)`) → saatte 11 kaynak üreten şehir 10 saniyede 0,03 üretir;
 *     tam sayıya yuvarlasak her okumada sıfırlanır ve oyuncu ASLA kaynak biriktiremezdi.
 */
import { sql } from 'drizzle-orm';
import {
  COLONY_STARTING_RESOURCES, LEVEL_BASED, STARTING_BUILDINGS, STARTING_RESOURCES,
  farmOutput, mineOutput,
} from '@mobiwar/catalog';
import { DEFAULT_CATALOG_CONFIG, type CatalogConfig } from '@mobiwar/catalog';
import type { Tx } from '../missions/handler-registry.ts';
import { toDate, type Db } from '../db/client.ts';
import { materializeUnitQueues } from '../queues/unit-queue.ts';
import {
  addScoreBase, cumulativeBuildingValue, cumulativeDefenseStructureValue, unitsValue,
} from '../scoring/score.service.ts';

export interface CityResources {
  gold: number;
  food: number;
}

export interface CitySnapshot {
  id: number;
  worldId: number;
  playerId: number;
  name: string;
  k: number;
  d: number;
  s: number;
  isCapital: boolean;
  /** Tam sayıya indirilmiş (oyuncuya gösterilen) kaynak. */
  gold: number;
  food: number;
  /** Saatlik üretim (arayüzdeki "+X/saat"). */
  goldPerHour: number;
  foodPerHour: number;
  /** Dünya hız çarpanları (1 = klasik). Arayüz "hızlandırılmış dünya" rozetini bundan çizer. */
  speed: { resource: number; travel: number; training: number; construction: number };
  buildings: Record<string, number>;
  resourcesAt: Date;
}

type Runner = Db | Tx;

export class CityService {
  constructor(
    private readonly db: Db,
    /**
     * ⭐ Dünya bazlı katalog sabitleri (§admin Faz 5). Verilmezse formüller kendi
     * varsayılanlarını kullanır ve davranış **DEĞİŞMEZ** — testler bu yüzden onu geçmeden
     * çalışmaya devam ediyor. Nesne değil FONKSİYON: panelden kaydedilen bir sabit bir
     * sonraki istekte güncel olsun, süreç ömrü boyunca donmasın.
     */
    private readonly catalogFor?: (worldId: number) => CatalogConfig,
  ) {}

  /** Bu dünyanın etkin katalog sabitleri (yoksa varsayılan). */
  private cat(worldId: number): CatalogConfig {
    return this.catalogFor?.(worldId) ?? DEFAULT_CATALOG_CONFIG;
  }


  /**
   * Şehri `at` anına kadar ilerletir (tembel birikim). Aynı transaction'da çağrılabilir.
   *
   * Hesap SQL içinde `numeric` aritmetiğiyle yapılır → JS float yuvarlaması hiç devreye girmez.
   * `at` geçmişte ise (görev geç işlendi ama çıpa daha ileride) hiçbir şey yapılmaz; kaynak
   * asla geri gitmez.
   */
  async materialize(cityId: number, at: Date, runner: Runner = this.db): Promise<void> {
    const rows = await runner.execute<{ farm: number; mine: number } & Record<string, unknown>>(sql`
      SELECT
        COALESCE(MAX(CASE WHEN b.type = 'farm' THEN b.level END), 0) AS farm,
        COALESCE(MAX(CASE WHEN b.type = 'mine' THEN b.level END), 0) AS mine,
        MAX(c.world_id) AS world_id
      FROM buildings b JOIN cities c ON c.id = b.city_id
     WHERE b.city_id = ${cityId}
    `);
    const farm = Number(rows[0]?.farm ?? 0);
    const mine = Number(rows[0]?.mine ?? 0);

    /**
     * Üretim hızları katalogdaki DOĞRULANMIŞ formüllerden (§13.8, 40/40 seviyede birebir).
     * ⚠️ Dünyanın etkin katalog sabitleriyle (§admin Faz 5): panelden `foodRate` değiştirilince
     * biriken kaynak da değişmeli. İlk yazımda `cat()` yardımcısı eklenmiş ama BURADA
     * kullanılmamıştı — canlı ölçümde yakalandı (ayar kaydedildi, üretim değişmedi).
     */
    const cfg = this.cat(Number(rows[0]?.['world_id'] ?? 0));
    const foodPerHour = farmOutput(farm, cfg);
    const goldPerHour = mineOutput(mine, cfg);

    // ⭐ Dünya kaynak çarpanı (`worlds.resource_multiplier`) burada uygulanır — TEK yerde,
    //    çünkü oyuncunun gördüğü her kaynak sayısı bu fonksiyondan geçiyor.
    await runner.execute(sql`
      UPDATE cities c SET
        gold = c.gold + (${goldPerHour}::numeric * w.resource_multiplier
               * (EXTRACT(EPOCH FROM (${at.toISOString()}::timestamptz - c.resources_at)) / 3600.0)::numeric),
        food = c.food + (${foodPerHour}::numeric * w.resource_multiplier
               * (EXTRACT(EPOCH FROM (${at.toISOString()}::timestamptz - c.resources_at)) / 3600.0)::numeric),
        resources_at = ${at.toISOString()}::timestamptz
      FROM worlds w
      WHERE c.id = ${cityId}
        AND w.id = c.world_id
        AND c.resources_at < ${at.toISOString()}::timestamptz
    `);

    /**
     * ⭐ SAVAŞÇI ÜRETİMİ DE TEMBEL İLERLER — ve **tam burada**, çünkü bu fonksiyon "şehri T
     * anına getir" sözleşmesinin tek yeridir: savaş çözümü, casusluk, her ekran okuması buradan
     * geçiyor. Böylece oyuncu çevrimdışıyken saldırı gelirse o ana kadar üretilmiş askerler
     * savaşta gerçekten hazır bulunur.
     */
    await materializeUnitQueues(runner as never, cityId, at, 'unit');
    // ⭐ Savunma birimleri de artık tek bantta üretiliyor (§13.21.3) → aynı tembel yol.
    await materializeUnitQueues(runner as never, cityId, at, 'defense');
  }

  /** Şehri `at` anına ilerletip anlık görüntüsünü döndürür (oyuncuya gösterilen hâl). */
  async snapshot(cityId: number, at: Date, runner: Runner = this.db): Promise<CitySnapshot | null> {
    await this.materialize(cityId, at, runner);

    const rows = await runner.execute<Record<string, unknown>>(sql`
      SELECT c.id, c.world_id, c.player_id, c.name, c.k, c.d, c.s, c.is_capital,
             c.gold, c.food, c.resources_at,
             w.resource_multiplier, w.speed_multiplier, w.training_multiplier, w.construction_multiplier
        FROM cities c JOIN worlds w ON w.id = c.world_id
       WHERE c.id = ${cityId}
    `);
    const c = rows[0];
    if (!c) return null;

    const bRows = await runner.execute<{ type: string; level: number } & Record<string, unknown>>(sql`
      SELECT type, level FROM buildings WHERE city_id = ${cityId}
    `);
    const buildings: Record<string, number> = {};
    for (const b of bRows) buildings[b.type] = Number(b.level);

    return {
      id: Number(c['id']),
      worldId: Number(c['world_id']),
      playerId: Number(c['player_id']),
      name: String(c['name']),
      k: Number(c['k']),
      d: Number(c['d']),
      s: Number(c['s']),
      isCapital: Boolean(c['is_capital']),
      // Oyuncuya TAM SAYI gösterilir; kesir DB'de saklanmaya devam eder.
      gold: Math.floor(Number(c['gold'])),
      food: Math.floor(Number(c['food'])),
      // ⚠️ Gösterilen üretim de çarpanı içerir; içermezse oyuncu "sayaç yazandan hızlı akıyor" der.
      goldPerHour:
        mineOutput(buildings['mine'] ?? 0, this.cat(Number(c['world_id'])))
        * Number(c['resource_multiplier'] ?? 1),
      foodPerHour:
        farmOutput(buildings['farm'] ?? 0, this.cat(Number(c['world_id'])))
        * Number(c['resource_multiplier'] ?? 1),
      speed: {
        resource: Number(c['resource_multiplier'] ?? 1),
        travel: Number(c['speed_multiplier'] ?? 1),
        training: Number(c['training_multiplier'] ?? 1),
        construction: Number(c['construction_multiplier'] ?? 1),
      },
      buildings,
      resourcesAt: toDate(c['resources_at']),
    };
  }

  /**
   * Kaynak harcar. Yetersizse **hiçbir şey yazmaz** ve `false` döner.
   * Tek `UPDATE`'te koşullu düşüm → iki eşzamanlı harcama isteği aynı kaynağı iki kez kullanamaz
   * (satır kilidi Postgres tarafında).
   */
  async trySpend(cityId: number, cost: CityResources, at: Date, runner: Runner = this.db): Promise<boolean> {
    await this.materialize(cityId, at, runner);
    const rows = await runner.execute<{ id: number } & Record<string, unknown>>(sql`
      UPDATE cities SET gold = gold - ${cost.gold}::numeric, food = food - ${cost.food}::numeric
       WHERE id = ${cityId}
         AND gold >= ${cost.gold}::numeric
         AND food >= ${cost.food}::numeric
      RETURNING id
    `);
    return rows.length > 0;
  }

  /** Kaynak ekler (ganimet dönüşü, nakliye varışı). */
  async add(cityId: number, amount: CityResources, at: Date, runner: Runner = this.db): Promise<void> {
    await this.materialize(cityId, at, runner);
    await runner.execute(sql`
      UPDATE cities SET gold = gold + ${amount.gold}::numeric, food = food + ${amount.food}::numeric
       WHERE id = ${cityId}
    `);
  }

  /**
   * Yeni şehir kurar.
   *
   * ⭐ **Başlangıç kesesi YALNIZ başkente** (§13.11.1a): koloni sıfır kaynakla doğar. Aksi hâlde
   * *şehir kur → keseyi al → terk et* döngüsüyle sınırsız kaynak basılabilirdi.
   */
  async create(opts: {
    worldId: number;
    playerId: number;
    name: string;
    k: number;
    d: number;
    s: number;
    isCapital: boolean;
    at: Date;
    startingResources?: CityResources;
  }, runner: Runner = this.db): Promise<number> {
    const purse = opts.startingResources
      ?? (opts.isCapital ? STARTING_RESOURCES : COLONY_STARTING_RESOURCES);

    const rows = await runner.execute<{ id: number } & Record<string, unknown>>(sql`
      INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital, gold, food, resources_at)
      VALUES (${opts.worldId}, ${opts.playerId}, ${opts.name}, ${opts.k}, ${opts.d}, ${opts.s},
              ${opts.isCapital}, ${purse.gold}::numeric, ${purse.food}::numeric,
              ${opts.at.toISOString()}::timestamptz)
      RETURNING id
    `);
    const cityId = Number(rows[0]!.id);

    // Başlangıç yapıları: Kale 1 · Baraka 1 · Çiftlik 1 · Maden 1 (§13.11.1)
    for (const [type, level] of Object.entries(STARTING_BUILDINGS)) {
      await runner.execute(sql`
        INSERT INTO buildings (city_id, type, level) VALUES (${cityId}, ${type}, ${level})
      `);
    }
    return cityId;
  }

  /* ── Şehir terk etme (Seçenekler → "Şehir Terk Et") ───────────────────────── */

  /**
   * ⭐ TERK ENGELLERİ — dokümanın şartları, tek yerde ve **liste** hâlinde.
   *
   * Kaynak (`teknik_ve_yapi_dokumantasyonu.md:648`): *"Terketmek istediğiniz şehrin
   * başkentiniz olmadığından emin olun. Başkent terkedilemez. … o şehrin barakasında hiç
   * savaşçının olmaması gerekmektedir. Ayrıca o şehre gelen ya da o şehirden giden bir
   * hareket (Saldırı, Nakliye, vb.) bulunmamalı ve o şehirde herhangi bir üretim veya
   * ilerletme olmamalıdır."*
   *
   * Dönüş **dizi**, tek `boolean` değil: oyuncu "neden olmuyor" diye tahmin yürütmesin.
   * Tek engel dönseydi baraka boşaltıp tekrar denerdi, sonra kuyruk, sonra hareket —
   * her seferinde yeni bir sürpriz.
   *
   * ⚠️ **Mağara ve kahraman dokümanda YOK** (ikisi de sonradan gelen mekanikler) ama
   * kullanıcı 2026-07-31'de ikisinin de engel olmasını istedi. Sebebi teknik: `cave_units`
   * şehre `ON DELETE CASCADE` bağlı → mağaradaki ordu **sessizce silinir**; `heroes.city_id`
   * ise `SET NULL` → kahraman sahipsiz kalır. İkisi de geri alınamaz ve oyuncu ne olduğunu
   * hiç görmez.
   */
  async abandonBlockers(cityId: number, runner: Runner = this.db): Promise<string[]> {
    const [r] = await runner.execute<Record<string, unknown>>(sql`
      SELECT
        c.is_capital,
        COALESCE((SELECT SUM(count)::int FROM units      WHERE city_id = c.id), 0) AS barracks,
        COALESCE((SELECT SUM(count)::int FROM cave_units WHERE city_id = c.id), 0) AS cave,
        (SELECT COUNT(*)::int FROM heroes WHERE city_id = c.id)                    AS heroes,
        (SELECT COUNT(*)::int FROM queues
          WHERE city_id = c.id AND completed_at IS NULL AND canceled_at IS NULL)   AS queues,
        (SELECT COUNT(*)::int FROM missions
          WHERE status IN ('scheduled', 'running')
            AND (origin_city_id = c.id OR target_city_id = c.id))                  AS movements
      FROM cities c WHERE c.id = ${cityId}
    `);
    if (!r) return ['Şehir bulunamadı.'];

    const n = (key: string): number => Number(r[key] ?? 0);
    const out: string[] = [];
    if (r['is_capital'] === true) out.push('Başkent terk edilemez.');
    if (n('barracks') > 0) out.push(`Barakada ${n('barracks')} savaşçı var.`);
    if (n('cave') > 0) out.push(`Mağarada ${n('cave')} savaşçı var.`);
    if (n('heroes') > 0) out.push('Bu şehirde kahraman var.');
    if (n('queues') > 0) out.push('Şehirde süren üretim veya ilerletme var.');
    if (n('movements') > 0) out.push('Şehre gelen ya da şehirden giden ordu var.');
    return out;
  }

  /**
   * ⭐ ŞEHRİ TERK ET — tek transaction.
   *
   * Doküman: *"Terk edilen şehirdeki binalar silinir ve kaynaklar (altın ve yemek) yok olur.
   * Terk edilen şehrin yapı ve savunma üniteleri sayesinde kazanılmış puanlarınız varsa
   * bunları da kaybedersiniz."* (`:939`)
   *
   * ⚠️ Engeller **kilit ALTINDA yeniden** kontrol edilir. Ön kontrol ile silme arasında
   * saniyeler geçiyor ve o aralıkta şehre saldırı yola çıkabilir; kontrolü bir kez yapıp
   * geçseydik oyuncu, üstüne ordu gelen şehri terk ederek saldırıyı hedefsiz bırakabilirdi.
   *
   * ⚠️ Puan **silmeden ÖNCE** hesaplanır — satırlar `ON DELETE CASCADE` ile gittikten sonra
   * neyin kaybedildiğini soracak yer kalmaz.
   *
   * @returns silinen şehrin künyesi + düşen puan tabanı
   */
  async abandon(o: { cityId: number; playerId: number; worldId: number }): Promise<{
    name: string; coordinates: { k: number; d: number; s: number }; scoreBaseLost: number;
  }> {
    return this.db.transaction(async (tx) => {
      const runner = tx as unknown as Runner;
      const [city] = await runner.execute<Record<string, unknown>>(sql`
        SELECT id, name, k, d, s FROM cities
         WHERE id = ${o.cityId} AND player_id = ${o.playerId} AND world_id = ${o.worldId}
         FOR UPDATE
      `);
      if (!city) throw new AbandonError(['Şehir bulunamadı.']);

      const blockers = await this.abandonBlockers(o.cityId, runner);
      if (blockers.length > 0) throw new AbandonError(blockers);

      // ⚠️ `cfg` geçiliyor: dünya bazlı fiyat override'ında terk edilen şehrin puan bedeli
      // oyuncunun gerçekte ödediğiyle aynı olmalı.
      const scoreBaseLost = await cityScoreBase(runner, o.cityId, this.cat(o.worldId));
      await addScoreBase(runner, o.playerId, -scoreBaseLost);

      /**
       * Tek DELETE yetiyor: `buildings` · `units` · `cave_units` · `defenses` · `queues`
       * hepsi `cities.id`'ye `ON DELETE CASCADE` bağlı (`db/schema.ts`). Koordinat da böylece
       * serbest kalır — `cities_world_coords` benzersiz indeksi satır gidince boşalır.
       */
      await runner.execute(sql`DELETE FROM cities WHERE id = ${o.cityId}`);

      const coordinates = { k: Number(city['k']), d: Number(city['d']), s: Number(city['s']) };
      await runner.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (${o.worldId}, 'city:abandoned',
                ${JSON.stringify({ cityId: o.cityId, playerId: o.playerId, coordinates })}::jsonb)
      `);
      // Geri alınamaz işlem → denetim kaydı şart (destek talebinde tek dayanağımız).
      await runner.execute(sql`
        INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, before)
        VALUES (${o.worldId}, ${o.playerId}, 'city.abandoned', 'city', ${o.cityId},
                ${JSON.stringify({ name: String(city['name']), coordinates, scoreBaseLost })}::jsonb)
      `);

      return { name: String(city['name']), coordinates, scoreBaseLost };
    });
  }
}

/** Terk engellendi. `details` engellerin Türkçe listesi — istemci onu AYNEN gösterir. */
export class AbandonError extends Error {
  constructor(readonly blockers: string[]) {
    super('Şehir terk edilemez.');
    this.name = 'AbandonError';
  }
}

/**
 * Şehrin puan tabanına katkısı: **yapılar + savunma**.
 *
 * ⚠️ Teknikler oyuncu-GENEL (§13.11.5), şehirle gitmez. Barakadaki savaşçılar da sayılmaz —
 * zaten sıfır olmadan terk edilemiyor. Kaynak (altın/yemek) hiç harcanmamıştı, dolayısıyla
 * hiç puan da vermemişti; yok olması puanı etkilemez (`score.service.ts` başlığındaki kural 3).
 */
async function cityScoreBase(
  runner: Runner, cityId: number, cfg?: CatalogConfig,
): Promise<number> {
  const [buildings, defenses] = await Promise.all([
    runner.execute<Record<string, unknown>>(sql`
      SELECT type, level FROM buildings WHERE city_id = ${cityId}
    `),
    runner.execute<Record<string, unknown>>(sql`
      SELECT type, count FROM defenses WHERE city_id = ${cityId}
    `),
  ]);

  let base = 0;
  for (const b of buildings) {
    base += cumulativeBuildingValue(String(b['type']), Number(b['level']), cfg);
  }
  for (const d of defenses) {
    const type = String(d['type']);
    const n = Number(d['count']);
    // Sur / Büyü Kalkanı `count` sütununda SEVİYE taşır (§13.11.1b).
    base += LEVEL_BASED.has(type)
      ? cumulativeDefenseStructureValue(type, n, cfg)
      : unitsValue({ [type]: n }, cfg);
  }
  return base;
}
