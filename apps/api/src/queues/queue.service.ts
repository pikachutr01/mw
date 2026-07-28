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
  UNITS_BY_ID, BUILDINGS_BY_ID, TECHS_BY_ID, BUILDING_REQUIREMENTS, TECH_REQUIREMENTS, UNIT_REQUIREMENTS,
  buildingCost, buildingTimeSeconds, cancelRefund, checkRequirement, techCost, techTimeSeconds,
  timeFromCost, trainingTimeSeconds, type RefundRule, type UnmetRequirement,
} from '@mobiwar/catalog';
import { CapacityService } from '../cities/capacity.service.ts';
import { openUnitQueueCount, promoteNext, rescheduleUnitChain } from './unit-queue.ts';
import { CityService } from '../cities/city.service.ts';
import { toDate, type Db } from '../db/client.ts';
import { creditSpend, debitRefund } from '../scoring/score.service.ts';

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
  | 'invalid_count'
  | 'queue_busy';

export interface QueueItem {
  id: number;
  category: QueueCategory;
  itemType: string;
  targetLevel: number | null;
  count: number | null;
  startedAt: Date;
  finishAt: Date;
  /** Savaşçı kuyruğu: üretilmiş adet · bir birimin süresi · sıradaki yer (1 = süren). */
  done?: number;
  perUnitSeconds?: number | null;
  position?: number;
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
      await this.spend(tx as never, opts.cityId, opts.playerId, cost, opts.at);

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
      this.assertRequirements(UNIT_REQUIREMENTS[opts.type], st, opts.type);

      /**
       * ⭐ AYNI ANDA **BARAKA SEVİYESİ** KADAR EMİR (kullanıcı kuralı 2026-07-28).
       * Tek emir sınırı kalktı: üretim sürerken kuyruğa yenisi eklenebiliyor, ama sınırsız değil —
       * Baraka'yı yükseltmek gerçek bir kazanım olmalı.
       */
      const barracks = Math.max(1, st.buildings['barracks'] ?? 1);
      const open = await openUnitQueueCount(tx as never, opts.cityId);
      if (open >= barracks) {
        throw new QueueError(
          'queue_busy',
          `Barakada aynı anda en fazla ${barracks} üretim emri olabilir. Baraka'yı yükseltin.`,
          { open, limit: barracks },
        );
      }

      const cost = { gold: def.gold * opts.count, food: def.food * opts.count };
      await this.spend(tx as never, opts.cityId, opts.playerId, cost, opts.at);

      const perUnit = trainingTimeSeconds(opts.type, st.buildings['barracks'] ?? 0);
      // Sıra: ilk emir hemen başlar, sonrakiler bekler. `position` 1 = üretimi süren.
      const position = open + 1;
      const startAt = opts.at;

      const item = await this.insert(tx as never, {
        ...st, cityId: opts.cityId, category: 'unit', itemType: opts.type,
        targetLevel: null, count: opts.count, cost, seconds: perUnit * opts.count, at: startAt,
        perUnitSeconds: perUnit, position,
      });
      // ⭐ TEK BANT: yeni emir kuyruğa girince tüm zincirin saatleri sırayla yeniden kurulur —
      //    bekleyen emir, öndekinin bitişinden önce saymaya BAŞLAMAZ.
      await rescheduleUnitChain(tx as never, opts.cityId, opts.at);
      const fresh = await tx.execute<Record<string, unknown>>(sql`
        SELECT started_at, finish_at FROM queues WHERE id = ${item.id}
      `);
      return {
        ...item,
        startedAt: toDate(fresh[0]!['started_at']),
        finishAt: toDate(fresh[0]!['finish_at']),
      };
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

      await this.spend(tx as never, opts.cityId, opts.playerId, cost, opts.at);
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
      await this.spend(tx as never, opts.cityId, opts.playerId, cost, opts.at);

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
        // ⚠️ Ekranda İngilizce `id` GÖRÜNMEZ (§13.14): hem kalem hem ön-şart adı Türkçeye çevrilir.
        `${nameOfItem(itemType)} için gereken: ${describeUnmet(unmet)}`,
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

  /**
   * Kaynağı düşer ve **puanı aynı transaction'da işler** (doküman: harcanan her 1000 birim
   * kaynak 1 puan). Puanı burada yazmak şart: harcamanın tek geçtiği yer burası, başka bir
   * noktaya koysak yeni bir kalem türü eklendiğinde puan sessizce yazılmadan kalırdı.
   */
  private async spend(
    tx: Db, cityId: number, playerId: number, cost: { gold: number; food: number }, at: Date,
  ): Promise<void> {
    const ok = await this.cities.trySpend(cityId, cost, at, tx as never);
    if (!ok) {
      throw new QueueError(
        'insufficient_resources',
        `Kaynak yetersiz: ${Math.round(cost.gold)} altın + ${Math.round(cost.food)} yemek gerekiyor.`,
        cost,
      );
    }
    await creditSpend(tx as never, playerId, cost);
  }

  /** Kuyruk satırı + bitiş görevi — AYNI transaction (yarım iş olamaz). */
  private async insert(tx: Db, o: {
    worldId: number; playerId: number; cityId: number;
    category: QueueCategory; itemType: string;
    targetLevel: number | null; count: number | null;
    cost: { gold: number; food: number }; seconds: number; at: Date;
    /** Savaşçı kuyruğu: bir birimin süresi ve sıradaki yeri. */
    perUnitSeconds?: number; position?: number;
  }): Promise<QueueItem> {
    const finishAt = new Date(o.at.getTime() + Math.max(1, Math.round(o.seconds)) * 1000);
    const position = o.position ?? 1;

    const qRows = await tx.execute<Record<string, unknown>>(sql`
      INSERT INTO queues (world_id, city_id, player_id, category, item_type, target_level, count,
                          started_at, finish_at, spent_gold, spent_food, per_unit_seconds, position)
      VALUES (${o.worldId}, ${o.cityId}, ${o.playerId}, ${o.category}, ${o.itemType},
              ${o.targetLevel}, ${o.count},
              ${o.at.toISOString()}::timestamptz, ${finishAt.toISOString()}::timestamptz,
              ${o.cost.gold}::numeric, ${o.cost.food}::numeric,
              ${o.perUnitSeconds ?? null}, ${position})
      RETURNING id, started_at, finish_at
    `);
    const queueId = Number(qRows[0]!['id']);

    /**
     * ⚠️ **Bekleyen savaşçı emri için görev YAZILMAZ** (`position > 1`): ne zaman başlayacağı
     * öndekinin bitişine bağlı ve o da iptal edilebilir. Sıradaki emir başlatılırken görevi
     * `promoteNext` sonrası kurulur. Diğer kategorilerde tek kalem olduğu için değişen bir şey yok.
     */
    if (position === 1) {
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
    }

    return {
      id: queueId,
      category: o.category,
      itemType: o.itemType,
      targetLevel: o.targetLevel,
      count: o.count,
      startedAt: toDate(qRows[0]!['started_at']),
      finishAt: toDate(qRows[0]!['finish_at']),
      done: 0,
      perUnitSeconds: o.perUnitSeconds ?? null,
      position,
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
               count, target_level, started_at, finish_at, done, position
          FROM queues
         WHERE id = ${opts.queueId} AND completed_at IS NULL AND canceled_at IS NULL
         FOR UPDATE
      `);
      const q = rows[0];
      if (!q) throw new QueueError('city_not_found', 'İptal edilecek kuyruk bulunamadı.');
      if (Number(q['player_id']) !== opts.playerId) {
        throw new QueueError('not_owner', 'Bu kuyruk sizin değil.');
      }
      // Üretilmiş askerler iptalden ETKİLENMEZ → önce şehri "şimdi"ye getir, sonra iptal et.
      if (String(q['category']) === 'unit') {
        await this.cities.materialize(Number(q['city_id']), opts.at, tx as never);
        const fresh = await tx.execute<Record<string, unknown>>(sql`
          SELECT done, completed_at FROM queues WHERE id = ${opts.queueId}
        `);
        if (fresh[0]?.['completed_at'] != null) {
          throw new QueueError('city_not_found', 'Bu üretim çoktan tamamlandı.');
        }
        q['done'] = fresh[0]?.['done'] ?? q['done'];
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

      /**
       * ⭐ SAVAŞÇI İPTALİ **KALAN ADET** ÜZERİNDEN (kullanıcı, 2026-07-28).
       * Üretimi bitmiş askerler zaten şehirde → onların bedeli iade edilmez. Kalan `n` birimden
       * dokümanın "bir ünite eksik" kuralı işler: iade = birimMaliyeti × (n − 1).
       */
      const isUnit = String(q['category']) === 'unit' && count != null;
      const done = Number(q['done'] ?? 0);
      const spent = { gold: Number(q['spent_gold']), food: Number(q['spent_food']) };
      const effectiveSpent = isUnit && count! > 0
        ? {
          gold: (spent.gold / count!) * Math.max(0, count! - done),
          food: (spent.food / count!) * Math.max(0, count! - done),
        }
        : spent;

      const base = cancelRefund({
        rule,
        spent: effectiveSpent,
        progress,
        count: isUnit ? Math.max(1, count! - done) : count ?? 1,
      });
      const refunded = {
        gold: Math.floor(base.gold * extraRatio),
        food: Math.floor(base.food * extraRatio),
      };

      const cityId = Number(q['city_id']);
      /**
       * ⭐ İptal edilen emir bandı BOŞALTIR → sıradaki emir **o anda** başlar (fabrika mantığı).
       * Bu satır olmadan bekleyen emirler eski saatleriyle kalıyor ve iptalden sonra hepsi
       * birden üretilmiş gibi görünüyordu.
       */
      if (String(q['category']) === 'unit') {
        await promoteNext(tx as never, cityId, opts.at);
      }
      if (refunded.gold > 0 || refunded.food > 0) {
        await this.cities.add(cityId, refunded, opts.at, tx as never);
        /**
         * ⭐ İADE EDİLEN KAYNAK HARCANMIŞ SAYILMAZ → puan tabanından geri alınır.
         * Bu satır olmadan "sipariş ver, hemen iptal et" döngüsü kaynak harcamadan puan basardı:
         * sipariş harcamayı puana yazar, iptal kaynağı geri verir, kasa hiç azalmaz.
         */
        await debitRefund(tx as never, opts.playerId, refunded);
      }
      return { refunded, rule, progress };
    });
  }

  /** Şehrin açık kuyrukları (arayüzdeki geri sayımlar). */
  async openQueues(cityId: number): Promise<QueueItem[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, category, item_type, target_level, count, started_at, finish_at,
             done, per_unit_seconds, position
        FROM queues
       WHERE city_id = ${cityId} AND completed_at IS NULL AND canceled_at IS NULL
       ORDER BY category, position, finish_at
    `);
    return rows.map((r) => ({
      id: Number(r['id']),
      category: String(r['category']) as QueueCategory,
      itemType: String(r['item_type']),
      targetLevel: r['target_level'] == null ? null : Number(r['target_level']),
      count: r['count'] == null ? null : Number(r['count']),
      startedAt: toDate(r['started_at']),
      finishAt: toDate(r['finish_at']),
      done: Number(r['done'] ?? 0),
      perUnitSeconds: r['per_unit_seconds'] == null ? null : Number(r['per_unit_seconds']),
      position: Number(r['position'] ?? 1),
    }));
  }

  /**
   * ⭐ KUYRUKTA SIRA DEĞİŞTİRME (kullanıcı, 2026-07-28) — yalnız **bekleyen** emirler.
   * `position = 1` üretimi sürendir ve yerinden oynatılamaz: onu taşımak "yarısı üretilmiş
   * sipariş" kavramını bozardı.
   */
  async moveUnitQueue(opts: {
    queueId: number; playerId: number; direction: 'up' | 'down';
  }): Promise<void> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.execute<Record<string, unknown>>(sql`
        SELECT id, city_id, player_id, position FROM queues
         WHERE id = ${opts.queueId} AND category = 'unit'
           AND completed_at IS NULL AND canceled_at IS NULL
         FOR UPDATE
      `);
      const q = rows[0];
      if (!q) throw new QueueError('city_not_found', 'Kuyruk bulunamadı.');
      if (Number(q['player_id']) !== opts.playerId) {
        throw new QueueError('not_owner', 'Bu kuyruk sizin değil.');
      }
      const pos = Number(q['position']);
      const other = opts.direction === 'up' ? pos - 1 : pos + 1;
      if (pos <= 1 || other <= 1) {
        throw new QueueError('queue_busy', 'Üretimi süren emir sıradan oynatılamaz.');
      }

      const swap = await tx.execute<Record<string, unknown>>(sql`
        SELECT id FROM queues
         WHERE city_id = ${Number(q['city_id'])} AND category = 'unit'
           AND completed_at IS NULL AND canceled_at IS NULL AND position = ${other}
         FOR UPDATE
      `);
      if (swap.length === 0) return;      // sınırdaki emir — sessizce yut

      await tx.execute(sql`UPDATE queues SET position = ${pos} WHERE id = ${Number(swap[0]!['id'])}`);
      await tx.execute(sql`UPDATE queues SET position = ${other} WHERE id = ${opts.queueId}`);
    });
  }
}

function nameOfItem(id: string): string {
  return UNITS_BY_ID[id]?.name.tr ?? BUILDINGS_BY_ID[id]?.name.tr ?? TECHS_BY_ID[id]?.name.tr ?? id;
}

function describeUnmet(unmet: UnmetRequirement[]): string {
  return unmet.map((u) => `${nameOfItem(u.id)} ${u.required} (şu an ${u.current})`).join(' · ');
}
