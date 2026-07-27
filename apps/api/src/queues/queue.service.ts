/**
 * ⭐ ÜRETİM / İLERLETME KUYRUĞU (SİSTEM PLANI §13.9, §13.11)
 *
 * Akış her kalem için aynı ve TEK transaction:
 *   doğrula (ön-şart · tavan · bütçe · kaynak) → kaynağı DÜŞ → `queues` satırı yaz
 *   → bitişi uygulayacak `missions` görevini yaz → denetim kaydı
 *
 * Kuyruk satırı oyuncunun gördüğü geri sayım, görev ise bitişi uygulayan taraf. İkisi aynı
 * transaction'da yazıldığı için "kuyruk bitti ama bina gelmedi" durumu imkânsız.
 * `finish_at` OYUN saatinde → bakımda geri sayım durur (§2).
 */
import { sql } from 'drizzle-orm';
import {
  UNITS_BY_ID, BUILDING_REQUIREMENTS, TECH_REQUIREMENTS, UNIT_REQUIREMENTS,
  buildingCost, buildingTimeSeconds, cancelRefund, checkRequirement, techCost, techTimeSeconds,
  timeFromCost, trainingTimeSeconds, type RefundRule, type UnmetRequirement,
} from '@mobiwar/catalog';
import { CapacityService } from '../cities/capacity.service.ts';
import { CityService } from '../cities/city.service.ts';
import { toDate, type Db } from '../db/client.ts';

export type QueueCategory = 'building' | 'unit' | 'defense' | 'tech';

export class QueueError extends Error {
  constructor(
    readonly code: QueueErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export type QueueErrorCode =
  | 'city_not_found'
  | 'not_owner'
  | 'unknown_item'
  | 'requirements_unmet'
  | 'max_level'
  | 'castle_budget_full'
  | 'defense_capacity_full'
  | 'insufficient_resources'
  | 'slot_busy'
  | 'tech_already_researching'
  | 'invalid_count';

export interface QueueItem {
  id: number;
  category: QueueCategory;
  itemType: string;
  targetLevel: number | null;
  count: number | null;
  startedAt: Date;
  finishAt: Date;
}

interface CityState {
  worldId: number;
  playerId: number;
  buildings: Record<string, number>;
  defenses: Record<string, number>;
  techs: Record<string, number>;
}

export class QueueService {
  private readonly capacity = new CapacityService();

  constructor(private readonly db: Db, private readonly cities: CityService) {}

  /* ── Yapı yükseltme ───────────────────────────────────────────────────────── */

  async enqueueBuilding(opts: {
    cityId: number; playerId: number; type: string; at: Date;
  }): Promise<QueueItem> {
    return this.db.transaction(async (tx) => {
      const st = await this.loadCity(tx as never, opts.cityId, opts.playerId);
      const current = st.buildings[opts.type] ?? 0;
      const target = current + 1;

      // Aynı şehirde aynı anda tek yapı işi (klasik kural; kuyruk uzatma premium konusu).
      await this.assertNoOpenQueue(tx as never, opts.cityId, 'building');

      const max = this.capacity.maxBuildingLevel(opts.type);
      if (target > max) {
        throw new QueueError('max_level', `${opts.type} en fazla ${max}. seviyeye çıkabilir.`);
      }

      this.assertRequirements(BUILDING_REQUIREMENTS[opts.type], st, opts.type);

      // ⭐ Kale bütçesi: Σ(bina seviyeleri) ≤ Kale × 10 (Kale/Sur/Kalkan hariç, §13.11.1)
      const budget = this.capacity.buildingBudget(st.buildings, { type: opts.type, levels: 1 });
      if (!budget.fits) {
        throw new QueueError(
          'castle_budget_full',
          `Kale bütçesi yetmiyor: ${budget.used}/${budget.total}. Kale'yi yükseltin.`,
          budget,
        );
      }

      const cost = buildingCost(opts.type, target);
      await this.spend(tx as never, opts.cityId, cost, opts.at);

      const seconds = buildingTimeSeconds(opts.type, target, st.buildings['architect_school'] ?? 0);
      return this.insert(tx as never, {
        ...st, cityId: opts.cityId, category: 'building', itemType: opts.type,
        targetLevel: target, count: null, cost, seconds, at: opts.at,
      });
    });
  }

  /* ── Savaşçı üretimi ──────────────────────────────────────────────────────── */

  async enqueueUnits(opts: {
    cityId: number; playerId: number; type: string; count: number; at: Date;
  }): Promise<QueueItem> {
    if (!Number.isInteger(opts.count) || opts.count <= 0 || opts.count > 1_000_000) {
      throw new QueueError('invalid_count', 'Geçersiz adet.');
    }
    const def = UNITS_BY_ID[opts.type];
    if (!def || def.kind !== 'warrior') throw new QueueError('unknown_item', 'Bilinmeyen savaşçı.');

    return this.db.transaction(async (tx) => {
      const st = await this.loadCity(tx as never, opts.cityId, opts.playerId);
      await this.assertNoOpenQueue(tx as never, opts.cityId, 'unit');
      this.assertRequirements(UNIT_REQUIREMENTS[opts.type], st, opts.type);

      const cost = {
        gold: def.gold * opts.count,
        food: def.food * opts.count,
      };
      await this.spend(tx as never, opts.cityId, cost, opts.at);

      // ⭐ Model B (§13.11.3, k.java): `((altın+yemek)/10)^0,8 × 65 / 1,4^Baraka`, adetle çarpılır.
      const perUnit = trainingTimeSeconds(opts.type, st.buildings['barracks'] ?? 0);
      return this.insert(tx as never, {
        ...st, cityId: opts.cityId, category: 'unit', itemType: opts.type,
        targetLevel: null, count: opts.count, cost, seconds: perUnit * opts.count, at: opts.at,
      });
    });
  }

  /* ── Savunma birimi üretimi ───────────────────────────────────────────────── */

  async enqueueDefense(opts: {
    cityId: number; playerId: number; type: string; count: number; at: Date;
  }): Promise<QueueItem> {
    const def = UNITS_BY_ID[opts.type];
    if (!def || def.kind !== 'defense') throw new QueueError('unknown_item', 'Bilinmeyen savunma birimi.');

    // Sur ve Büyü Kalkanı ADET değil SEVİYE taşır → ayrı yol.
    const levelBased = opts.type === 'wall' || opts.type === 'magic_shield';
    if (!levelBased && (!Number.isInteger(opts.count) || opts.count <= 0)) {
      throw new QueueError('invalid_count', 'Geçersiz adet.');
    }

    return this.db.transaction(async (tx) => {
      const st = await this.loadCity(tx as never, opts.cityId, opts.playerId);
      await this.assertNoOpenQueue(tx as never, opts.cityId, 'defense');
      this.assertRequirements(UNIT_REQUIREMENTS[opts.type], st, opts.type);

      let cost: { gold: number; food: number };
      let seconds: number;
      let targetLevel: number | null = null;
      let count: number | null = null;

      if (levelBased) {
        const current = st.defenses[opts.type] ?? 0;
        targetLevel = current + 1;
        const max = this.capacity.maxDefenseStructureLevel();
        if (targetLevel > max) {
          throw new QueueError('max_level', `${opts.type} en fazla ${max}. seviyeye çıkabilir.`);
        }
        // Sur/Büyü Kalkanı maliyeti SEVİYE tabanlı: taban × 1,8^seviye (§13.9, motor kararını doğrular)
        cost = { gold: def.gold * 1.8 ** (targetLevel - 1), food: def.food * 1.8 ** (targetLevel - 1) };
        cost = { gold: Math.round(cost.gold), food: Math.round(cost.food) };
        seconds = timeFromCost(cost, st.buildings['architect_school'] ?? 0);
      } else {
        count = opts.count;
        // ⭐ Savunma kapasitesi: 25.000 × 1,30^(Sur−1); birim başına katalogdaki `area`
        const cap = this.capacity.defenseCapacity(st.buildings, st.defenses, { type: opts.type, count });
        if (!cap.fits) {
          throw new QueueError(
            'defense_capacity_full',
            `Sur kapasitesi yetmiyor: ${cap.used}/${cap.total} alan. Sur'u yükseltin.`,
            cap,
          );
        }
        cost = { gold: def.gold * count, food: def.food * count };
        // ⭐ Savunma birimi süresi = 10(a+y)/1,4^MimarOkulu (§13.9 "S" kategorisi, k.java).
        //    Mimar Okulu YOKSA bölen 1'dir — bu yüzden varsayılan 0, 1 değil.
        seconds = trainingTimeSeconds(opts.type, st.buildings['architect_school'] ?? 0) * count;
      }

      await this.spend(tx as never, opts.cityId, cost, opts.at);
      return this.insert(tx as never, {
        ...st, cityId: opts.cityId, category: 'defense', itemType: opts.type,
        targetLevel, count, cost, seconds, at: opts.at,
      });
    });
  }

  /* ── Teknik araştırma ─────────────────────────────────────────────────────── */

  async enqueueTech(opts: {
    cityId: number; playerId: number; type: string; at: Date;
  }): Promise<QueueItem> {
    return this.db.transaction(async (tx) => {
      const st = await this.loadCity(tx as never, opts.cityId, opts.playerId);
      const current = st.techs[opts.type] ?? 0;
      const target = current + 1;

      if (!TECH_REQUIREMENTS[opts.type]) throw new QueueError('unknown_item', 'Bilinmeyen teknik.');
      this.assertRequirements(TECH_REQUIREMENTS[opts.type], st, opts.type);

      // Bir şehrin akademisinde araştırma varken O ŞEHİRDE ikinci araştırma olmaz…
      await this.assertNoOpenQueue(tx as never, opts.cityId, 'tech');

      // …ve AYNI TEKNİK iki şehirde aynı anda araştırılamaz (seviye oyuncu-genel, §13.11.5).
      const dup = await tx.execute<Record<string, unknown>>(sql`
        SELECT 1 FROM queues
         WHERE player_id = ${st.playerId} AND category = 'tech' AND item_type = ${opts.type}
           AND completed_at IS NULL AND canceled_at IS NULL
      `);
      if (dup.length > 0) {
        throw new QueueError('tech_already_researching', 'Bu teknik başka bir şehirde araştırılıyor.');
      }

      const cost = techCost(opts.type, target);
      await this.spend(tx as never, opts.cityId, cost, opts.at);

      // Süre O ŞEHRİN akademisine bağlı (§13.9: a[187]="w" hangi şehir)
      const seconds = techTimeSeconds(opts.type, target, st.buildings['academy'] ?? 0);
      return this.insert(tx as never, {
        ...st, cityId: opts.cityId, category: 'tech', itemType: opts.type,
        targetLevel: target, count: null, cost, seconds, at: opts.at,
      });
    });
  }

  /* ── Ortak yardımcılar ────────────────────────────────────────────────────── */

  private async loadCity(tx: Db, cityId: number, playerId: number): Promise<CityState> {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT world_id, player_id FROM cities WHERE id = ${cityId}
    `);
    const c = rows[0];
    if (!c) throw new QueueError('city_not_found', 'Şehir bulunamadı.');
    if (Number(c['player_id']) !== playerId) {
      throw new QueueError('not_owner', 'Bu şehir sizin değil.');
    }

    const [bRows, dRows, tRows] = await Promise.all([
      tx.execute<Record<string, unknown>>(sql`SELECT type, level FROM buildings WHERE city_id = ${cityId}`),
      tx.execute<Record<string, unknown>>(sql`SELECT type, count FROM defenses WHERE city_id = ${cityId}`),
      tx.execute<Record<string, unknown>>(sql`SELECT type, level FROM techs WHERE player_id = ${playerId}`),
    ]);

    const buildings: Record<string, number> = {};
    for (const r of bRows) buildings[String(r['type'])] = Number(r['level']);
    const defenses: Record<string, number> = {};
    for (const r of dRows) defenses[String(r['type'])] = Number(r['count']);
    const techs: Record<string, number> = {};
    for (const r of tRows) techs[String(r['type'])] = Number(r['level']);

    return { worldId: Number(c['world_id']), playerId, buildings, defenses, techs };
  }

  private assertRequirements(
    req: { buildings?: Record<string, number>; techs?: Record<string, number> } | undefined,
    st: CityState,
    itemType: string,
  ): void {
    const unmet = checkRequirement(req, { buildings: st.buildings, techs: st.techs });
    if (unmet.length > 0) {
      throw new QueueError(
        'requirements_unmet',
        `${itemType} için ön-şartlar karşılanmadı: ${describeUnmet(unmet)}`,
        unmet,
      );
    }
  }

  /** Aynı kategoride açık kuyruk varsa reddet (kategori başına tek slot). */
  private async assertNoOpenQueue(tx: Db, cityId: number, category: QueueCategory): Promise<void> {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM queues
       WHERE city_id = ${cityId} AND category = ${category}
         AND completed_at IS NULL AND canceled_at IS NULL
    `);
    if (rows.length > 0) {
      throw new QueueError('slot_busy', 'Bu şehirde bu türden bir iş zaten sürüyor.');
    }
  }

  private async spend(tx: Db, cityId: number, cost: { gold: number; food: number }, at: Date): Promise<void> {
    const ok = await this.cities.trySpend(cityId, cost, at, tx as never);
    if (!ok) {
      throw new QueueError(
        'insufficient_resources',
        `Kaynak yetersiz: ${Math.round(cost.gold)} altın + ${Math.round(cost.food)} yemek gerekiyor.`,
        cost,
      );
    }
  }

  /** Kuyruk satırı + bitiş görevi — AYNI transaction (yarım iş olamaz). */
  private async insert(tx: Db, o: {
    worldId: number; playerId: number; cityId: number;
    category: QueueCategory; itemType: string;
    targetLevel: number | null; count: number | null;
    cost: { gold: number; food: number }; seconds: number; at: Date;
  }): Promise<QueueItem> {
    const finishAt = new Date(o.at.getTime() + Math.max(1, Math.round(o.seconds)) * 1000);

    const qRows = await tx.execute<Record<string, unknown>>(sql`
      INSERT INTO queues (world_id, city_id, player_id, category, item_type, target_level, count,
                          started_at, finish_at, spent_gold, spent_food)
      VALUES (${o.worldId}, ${o.cityId}, ${o.playerId}, ${o.category}, ${o.itemType},
              ${o.targetLevel}, ${o.count},
              ${o.at.toISOString()}::timestamptz, ${finishAt.toISOString()}::timestamptz,
              ${o.cost.gold}::numeric, ${o.cost.food}::numeric)
      RETURNING id, started_at, finish_at
    `);
    const queueId = Number(qRows[0]!['id']);

    const mRows = await tx.execute<Record<string, unknown>>(sql`
      INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                            execute_at, payload, idempotency_key)
      VALUES (${o.worldId}, ${`${o.category}_finish`}, 'scheduled', ${o.playerId},
              ${o.cityId}, ${o.cityId}, ${finishAt.toISOString()}::timestamptz,
              ${JSON.stringify({ queueId, itemType: o.itemType, targetLevel: o.targetLevel, count: o.count })}::jsonb,
              ${`queue:${queueId}`})
      RETURNING id
    `);
    await tx.execute(sql`
      UPDATE queues SET mission_id = ${Number(mRows[0]!['id'])} WHERE id = ${queueId}
    `);

    return {
      id: queueId,
      category: o.category,
      itemType: o.itemType,
      targetLevel: o.targetLevel,
      count: o.count,
      startedAt: toDate(qRows[0]!['started_at']),
      finishAt: toDate(qRows[0]!['finish_at']),
    };
  }

  /**
   * ⭐ KUYRUK İPTALİ — orijinalde her kuyruk türü için ayrı menü aksiyonu var:
   * "Yapımı Durdur" · "İlerletmeyi Durdur" · "Diriltmeyi Durdur" · "Görev İptal"
   * (`g.java` menü tablosu) ve sunucu uçları `ipUnt.do` / `ipMgr.do` / `ipOrd.do` (`ip` = iptal).
   * Bizde bu eksikti — `canceled_at` sütunu vardı ama iptal eden kod yoktu.
   *
   * İptal, kuyruk satırını VE bitiş görevini birlikte kapatır. Handler'daki
   * `canceled_at IS NULL` koşulu sayesinde, görev bir şekilde yine çalışsa bile etki UYGULANMAZ.
   *
   * ⭐ **İADE KURALI OYUNUN KENDİ DOKÜMANINDAN** (`teknik_ve_yapi_dokumantasyonu.md`,
   * BARAKA + YAPILAR başlıkları — kullanıcı işaret etti, 2026-07-26). Sabit yüzde DEĞİL, iki kural:
   *
   *   **Yapı · teknik · Sur/Büyü Kalkanı → SÜREYE GÖRE:** `iade = harcanan × (1 − ilerleme)`
   *     Doküman örneği: 100/100'e inşa edilen yapı %20 tamamken iptal → 80/80 iade.
   *   **Savaşçı · adetli savunma birimi → BİR BİRİM EKSİK:** `iade = harcanan × (adet−1)/adet`
   *     Doküman: *"her iptal işlemi için 1 ünitenin ücreti eksik iade edilir"* → tek birimlik
   *     siparişin iptalinde HİÇ iade yok; 2 Ejderha iptali bir Ejderhayı yakar.
   *
   * (Önceki sabit %90 varsayımım yanlıştı; dokümanın kuralı bunun yerini aldı.)
   */
  async cancel(opts: {
    queueId: number; playerId: number; at: Date;
    /** Testler/denge için iadeyi ayrıca ölçekler (varsayılan 1 = dokümandaki kural aynen). */
    refundRatio?: number;
  }): Promise<{ refunded: { gold: number; food: number }; rule: RefundRule; progress: number }> {
    const extraRatio = Math.max(0, Math.min(1, opts.refundRatio ?? 1));

    return this.db.transaction(async (tx) => {
      const rows = await tx.execute<Record<string, unknown>>(sql`
        SELECT id, city_id, player_id, spent_gold, spent_food, mission_id, category, item_type,
               count, target_level, started_at, finish_at
          FROM queues
         WHERE id = ${opts.queueId} AND completed_at IS NULL AND canceled_at IS NULL
         FOR UPDATE
      `);
      const q = rows[0];
      if (!q) throw new QueueError('city_not_found', 'İptal edilecek kuyruk bulunamadı.');
      if (Number(q['player_id']) !== opts.playerId) {
        throw new QueueError('not_owner', 'Bu kuyruk sizin değil.');
      }

      await tx.execute(sql`
        UPDATE queues SET canceled_at = ${opts.at.toISOString()}::timestamptz WHERE id = ${opts.queueId}
      `);
      // Görev de iptal edilir; yine de çalışırsa handler `canceled_at` yüzünden etkiyi uygulamaz.
      if (q['mission_id'] != null) {
        await tx.execute(sql`
          UPDATE missions SET status = 'canceled', finished_at = now()
           WHERE id = ${Number(q['mission_id'])} AND status IN ('scheduled', 'running')
        `);
      }

      // Adetli kalemler (savaşçı + adetli savunma birimi) "bir birim eksik", diğerleri süreye göre.
      const count = q['count'] == null ? null : Number(q['count']);
      const rule: RefundRule = count != null ? 'minusOneUnit' : 'timeProgress';

      const startedAt = toDate(q['started_at']).getTime();
      const finishAt = toDate(q['finish_at']).getTime();
      const span = Math.max(1, finishAt - startedAt);
      const progress = Math.min(1, Math.max(0, (opts.at.getTime() - startedAt) / span));

      const base = cancelRefund({
        rule,
        spent: { gold: Number(q['spent_gold']), food: Number(q['spent_food']) },
        progress,
        count: count ?? 1,
      });
      const refunded = {
        gold: Math.floor(base.gold * extraRatio),
        food: Math.floor(base.food * extraRatio),
      };

      const cityId = Number(q['city_id']);
      if (refunded.gold > 0 || refunded.food > 0) {
        await this.cities.add(cityId, refunded, opts.at, tx as never);
      }
      return { refunded, rule, progress };
    });
  }

  /** Şehrin açık kuyrukları (arayüzdeki geri sayımlar). */
  async openQueues(cityId: number): Promise<QueueItem[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, category, item_type, target_level, count, started_at, finish_at
        FROM queues
       WHERE city_id = ${cityId} AND completed_at IS NULL AND canceled_at IS NULL
       ORDER BY finish_at
    `);
    return rows.map((r) => ({
      id: Number(r['id']),
      category: String(r['category']) as QueueCategory,
      itemType: String(r['item_type']),
      targetLevel: r['target_level'] == null ? null : Number(r['target_level']),
      count: r['count'] == null ? null : Number(r['count']),
      startedAt: toDate(r['started_at']),
      finishAt: toDate(r['finish_at']),
    }));
  }
}

function describeUnmet(unmet: UnmetRequirement[]): string {
  return unmet.map((u) => `${u.id} ${u.required} (şu an ${u.current})`).join(', ');
}
