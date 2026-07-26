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
  COLONY_STARTING_RESOURCES, STARTING_BUILDINGS, STARTING_RESOURCES,
  farmOutput, mineOutput,
} from '@mobiwar/catalog';
import type { Tx } from '../missions/handler-registry.ts';
import { toDate, type Db } from '../db/client.ts';

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
  buildings: Record<string, number>;
  resourcesAt: Date;
}

type Runner = Db | Tx;

export class CityService {
  constructor(private readonly db: Db) {}

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
        COALESCE(MAX(CASE WHEN type = 'farm' THEN level END), 0) AS farm,
        COALESCE(MAX(CASE WHEN type = 'mine' THEN level END), 0) AS mine
      FROM buildings WHERE city_id = ${cityId}
    `);
    const farm = Number(rows[0]?.farm ?? 0);
    const mine = Number(rows[0]?.mine ?? 0);

    // Üretim hızları katalogdaki DOĞRULANMIŞ formüllerden (§13.8, 40/40 seviyede birebir).
    const foodPerHour = farmOutput(farm);
    const goldPerHour = mineOutput(mine);

    await runner.execute(sql`
      UPDATE cities SET
        gold = gold + (${goldPerHour}::numeric
               * (EXTRACT(EPOCH FROM (${at.toISOString()}::timestamptz - resources_at)) / 3600.0)::numeric),
        food = food + (${foodPerHour}::numeric
               * (EXTRACT(EPOCH FROM (${at.toISOString()}::timestamptz - resources_at)) / 3600.0)::numeric),
        resources_at = ${at.toISOString()}::timestamptz
      WHERE id = ${cityId}
        AND resources_at < ${at.toISOString()}::timestamptz
    `);
  }

  /** Şehri `at` anına ilerletip anlık görüntüsünü döndürür (oyuncuya gösterilen hâl). */
  async snapshot(cityId: number, at: Date, runner: Runner = this.db): Promise<CitySnapshot | null> {
    await this.materialize(cityId, at, runner);

    const rows = await runner.execute<Record<string, unknown>>(sql`
      SELECT id, world_id, player_id, name, k, d, s, is_capital, gold, food, resources_at
        FROM cities WHERE id = ${cityId}
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
      goldPerHour: mineOutput(buildings['mine'] ?? 0),
      foodPerHour: farmOutput(buildings['farm'] ?? 0),
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
}
