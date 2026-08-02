/**
 * ⭐ PUANLAMA (oyunun KENDİ dokümanı, GENEL DURUM başlığı)
 *
 * > *"Puanlama, harcadığınız kaynak miktarına göre yapılır. Harcanmış her 1000 birim kaynağa
 * > karşılık 1 puan alırsınız. Ordularınızın savaştaki kayıpları ise aynı oranda puan
 * > kaybetmenize neden olur."*
 *
 * Kural sade ama üç ayrıntısı sessizce yanlış uygulanmaya çok müsait:
 *
 *  1. **Puan TÜREV, kayıt DEĞİL.** Saklanan asıl büyüklük *net harcanan kaynak* (`score_base`);
 *     `score` ondan `floor(base/1000)` ile üretilir. Doğrudan puan yazsaydık her harcamanın
 *     binlik artığı çöpe giderdi: 900 + 900 birim harcayan oyuncu 1 puan yerine 0 alırdı.
 *  2. **İade harcama değildir.** Kuyruk iptalinde geri alınan kaynak `score_base`'den DÜŞÜLÜR;
 *     yoksa "sipariş ver → iptal et" döngüsü bedava puan basardı.
 *  3. **Kayıp = ödenmiş bedelin geri alınması.** Savaşta ölen birimin katalog maliyeti düşülür;
 *     ganimet olarak KAPTIRILAN kaynak düşülmez (doküman yalnız *ordu kayıplarını* sayar —
 *     yağmalanan kaynak zaten hiç harcanmamıştı, dolayısıyla hiç puan da vermemişti).
 *
 * ⚠️ Taban asla negatife inmez: iade ve kayıp toplamı harcamayı geçemez, ama yuvarlama ya da
 * elle veri düzeltmesi bir gün geçirirse oyuncu eksi puanla görünmesin.
 */
import { sql } from 'drizzle-orm';
import {
  BUILDINGS_BY_ID, LEVEL_BASED, STARTING_BUILDINGS, TECHS_BY_ID, UNITS_BY_ID,
  buildingCost, defenseStructureCost, techCost, unitCost, type CatalogConfig,
} from '@mobilwar/catalog';
import type { Db } from '../db/client.ts';
import type { Tx } from '../missions/handler-registry.ts';

type Runner = Db | Tx;

/** Kaç birim kaynak 1 puan eder (doküman: 1000). */
export const RESOURCE_PER_POINT = 1000;

export interface ResourceAmount {
  gold: number;
  food: number;
}

/** Kaynağın puan tabanındaki karşılığı: altın ve yemek EŞİT ağırlıkta (doküman "kaynak" der). */
export function scoreValue(amount: ResourceAmount): number {
  return Math.max(0, amount.gold) + Math.max(0, amount.food);
}

/** Taban → gösterilen puan. Tek yerde durur ki sunucu ve testler aynı yuvarlamayı kullansın. */
export function pointsFromBase(base: number): number {
  return Math.floor(Math.max(0, base) / RESOURCE_PER_POINT);
}

/**
 * ⭐ Ölen birimlerin puan bedeli.
 *
 * Sur ve Büyü Kalkanı `LEVEL_BASED`: savaşta adet kaybetmezler (seviyeleri düşmez), o yüzden
 * puan da götürmezler. Kahramanlar da hariç — onlar kaynakla üretilmiyor, savaştan çıkıyor.
 */
export function lossValue(lost: Record<string, number>, cfg?: CatalogConfig): number {
  let total = 0;
  for (const [id, n] of Object.entries(lost)) {
    if (!(n > 0) || LEVEL_BASED.has(id)) continue;
    if (!UNITS_BY_ID[id]) continue;
    /**
     * ⚠️ **DÜZELTİLDİ (2. nesil Tur 4):** eskiden `def.gold + def.food` ham okunuyordu ve
     * `economy.unitCostMultiplier` **hiç görülmüyordu**. Çarpanı 2 yapan bir dünyada oyuncu
     * iki katı ödüyor, birimi ölünce tek katı puan kaybediyordu — yani ordu kaybetmek
     * kârlıydı. `unitCost` aynı çarpanı zaten uyguluyor.
     */
    total += scoreValue(unitCost(id, Math.trunc(n), cfg));
  }
  return total;
}

/**
 * Puan tabanını değiştirir ve gösterilen puanı aynı ifadeyle yeniden türetir.
 *
 * Tek `UPDATE` olması şart: iki ayrı sorgu arasında başka bir harcama araya girerse `score`
 * bayat bir tabandan hesaplanır ve sessizce kayar.
 */
export async function addScoreBase(
  runner: Runner, playerId: number, delta: number,
): Promise<void> {
  if (!Number.isFinite(delta) || delta === 0) return;
  await runner.execute(sql`
    UPDATE players
       SET score_base = GREATEST(0::numeric, score_base + ${delta}::numeric),
           score = FLOOR(GREATEST(0::numeric, score_base + ${delta}::numeric)
                         / ${RESOURCE_PER_POINT}::numeric)
     WHERE id = ${playerId}
  `);
}

/** Harcama → puan artışı. */
export async function creditSpend(
  runner: Runner, playerId: number, cost: ResourceAmount,
): Promise<void> {
  await addScoreBase(runner, playerId, scoreValue(cost));
}

/** İade → puan geri alınır (harcanmamış sayılır). */
export async function debitRefund(
  runner: Runner, playerId: number, refund: ResourceAmount,
): Promise<void> {
  await addScoreBase(runner, playerId, -scoreValue(refund));
}

/** Savaş kaybı → ölen birimlerin bedeli kadar puan düşer. */
export async function debitLosses(
  runner: Runner, playerId: number, lost: Record<string, number>,
): Promise<void> {
  await addScoreBase(runner, playerId, -lossValue(lost));
}

/* ═══ GERİYE DÖNÜK DOLDURMA ═════════════════════════════════════════════════
 * ⚠️ Bu bölüm **normal oyun akışının parçası DEĞİLDİR.** Puan yukarıda harcama anında işlenir;
 * burası puanlama devreye girmeden önce oynanmış hesaplar (ve denge değişiklikleri) için tek
 * seferlik uzlaştırmadır: oyuncunun ŞU AN sahip olduğu her şeyin katalog bedeli toplanır.
 *
 * "Sahip olunan" ile "harcanan" aynı şey değildir (savaşta kaybedilen ordu harcanmıştı ama artık
 * yok). Yine de mevcut veriden üretilebilecek EN YAKIN yeniden kurulum budur ve yönü doğrudur:
 * hiç oynamamış oyuncu 0, çok yapı dikmiş oyuncu yüksek puan alır.
 */

/** Bir yapının 1. seviyeden `level`'a kadar ödenen TOPLAM bedeli. */
export function cumulativeBuildingValue(
  type: string, level: number, cfg?: CatalogConfig,
): number {
  if (!BUILDINGS_BY_ID[type]) return 0;
  // Kale/Baraka/Çiftlik/Maden seviye 1 hediyedir → ilk ÖDENEN seviyeden başla (§13.9).
  let total = 0;
  for (let l = (STARTING_BUILDINGS[type] ?? 0) + 1; l <= level; l++) {
    total += scoreValue(buildingCost(type, l, cfg));
  }
  return total;
}

export function cumulativeTechValue(type: string, level: number, cfg?: CatalogConfig): number {
  if (!TECHS_BY_ID[type]) return 0;
  let total = 0;
  for (let l = 1; l <= level; l++) total += scoreValue(techCost(type, l, cfg));
  return total;
}

/**
 * Sur / Büyü Kalkanı seviye taşır; maliyeti **katalogdan** gelir.
 * ⚠️ Burada da çıplak `1.8` kopyası vardı: dünya bazlı bir fiyat override'ında oyuncu farklı
 * ödüyor, puanı farklı hesaplanıyordu.
 */
export function cumulativeDefenseStructureValue(
  type: string, level: number, cfg?: CatalogConfig,
): number {
  if (!UNITS_BY_ID[type]) return 0;
  let total = 0;
  for (let l = 1; l <= level; l++) total += scoreValue(defenseStructureCost(type, l, cfg));
  return total;
}

/** Adetli birimlerin (savaşçı + savunma birimi) bedeli. */
export function unitsValue(counts: Record<string, number>, cfg?: CatalogConfig): number {
  return lossValue(counts, cfg);
}

/**
 * Bir oyuncunun sahip olduklarından puan tabanını yeniden kurar ve yazar.
 * @returns yazılan taban (kaynak birimi)
 */
export async function recomputeScoreBaseFromHoldings(
  runner: Runner, playerId: number, cfg?: CatalogConfig,
): Promise<number> {
  const [buildingRows, techRows, unitRows, defenseRows] = await Promise.all([
    runner.execute<Record<string, unknown>>(sql`
      SELECT b.type, b.level FROM buildings b
        JOIN cities c ON c.id = b.city_id WHERE c.player_id = ${playerId}
    `),
    runner.execute<Record<string, unknown>>(sql`
      SELECT type, level FROM techs WHERE player_id = ${playerId}
    `),
    runner.execute<Record<string, unknown>>(sql`
      SELECT u.type, u.count FROM units u
        JOIN cities c ON c.id = u.city_id WHERE c.player_id = ${playerId}
    `),
    runner.execute<Record<string, unknown>>(sql`
      SELECT d.type, d.count FROM defenses d
        JOIN cities c ON c.id = d.city_id WHERE c.player_id = ${playerId}
    `),
  ]);

  let base = 0;
  for (const r of buildingRows) {
    base += cumulativeBuildingValue(String(r['type']), Number(r['level']), cfg);
  }
  for (const r of techRows) base += cumulativeTechValue(String(r['type']), Number(r['level']), cfg);
  for (const r of unitRows) base += unitsValue({ [String(r['type'])]: Number(r['count']) }, cfg);
  for (const r of defenseRows) {
    const type = String(r['type']);
    const n = Number(r['count']);
    base += LEVEL_BASED.has(type)
      ? cumulativeDefenseStructureValue(type, n, cfg)   // burada `count` SEVİYEdir (§13.11.1b)
      : unitsValue({ [type]: n }, cfg);
  }

  await runner.execute(sql`
    UPDATE players
       SET score_base = ${base}::numeric,
           score = FLOOR(${base}::numeric / ${RESOURCE_PER_POINT}::numeric)
     WHERE id = ${playerId}
  `);
  return base;
}
