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
import { liveNumberFor } from '../settings/live.ts';

type Runner = Db | Tx;

/** Kaç birim kaynak 1 puan eder (doküman: 1000) — panel dokunmamışsa bu kullanılır. */
export const RESOURCE_PER_POINT = 1000;

/**
 * ⭐ Bölen artık **panelden ayarlanabilir** (kullanıcı, 2026-08-08: *"Bu 1000 değerini admin
 * panelde ayarlardan değiştirilebilir yapalım"*).
 *
 * ⚠️ Dünya bazlı okunuyor (`liveNumberFor`) çünkü panel ayarları `worldId`e yazıyor; eski
 * `liveNumber` yalnız dünya 0'ı görürdü ve düğme sessizce işlevsiz kalırdı (o hatanın tam
 * anlatımı `settings/live.ts`te).
 * ⚠️ `max(1, …)`: 0 ya da negatif bölen puanı sonsuza/negatife götürürdü. Şema da 1 alt sınırı
 * koyuyor; buradaki kelepçe onun ikinci savunması — ayar dosyası elle düzenlenebilir.
 */
export function resourcePerPoint(worldId: number): number {
  return Math.max(1, liveNumberFor(worldId, 'scoring', 'resourcePerPoint', RESOURCE_PER_POINT));
}

export interface ResourceAmount {
  gold: number;
  food: number;
}

/** Kaynağın puan tabanındaki karşılığı: altın ve yemek EŞİT ağırlıkta (doküman "kaynak" der). */
export function scoreValue(amount: ResourceAmount): number {
  return Math.max(0, amount.gold) + Math.max(0, amount.food);
}

/**
 * Taban → gösterilen puan. Tek yerde durur ki sunucu ve testler aynı yuvarlamayı kullansın.
 * `perPoint` verilmezse doküman varsayılanı (1000) kullanılır.
 */
export function pointsFromBase(base: number, perPoint = RESOURCE_PER_POINT): number {
  return Math.floor(Math.max(0, base) / Math.max(1, perPoint));
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
  runner: Runner, worldId: number, playerId: number, delta: number,
): Promise<void> {
  if (!Number.isFinite(delta) || delta === 0) return;
  const perPoint = resourcePerPoint(worldId);
  await runner.execute(sql`
    UPDATE players
       SET score_base = GREATEST(0::numeric, score_base + ${delta}::numeric),
           score = FLOOR(GREATEST(0::numeric, score_base + ${delta}::numeric)
                         / ${perPoint}::numeric)
     WHERE id = ${playerId}
  `);
}

/** Harcama → puan artışı. */
export async function creditSpend(
  runner: Runner, worldId: number, playerId: number, cost: ResourceAmount,
): Promise<void> {
  await addScoreBase(runner, worldId, playerId, scoreValue(cost));
}

/** İade → puan geri alınır (harcanmamış sayılır). */
export async function debitRefund(
  runner: Runner, worldId: number, playerId: number, refund: ResourceAmount,
): Promise<void> {
  await addScoreBase(runner, worldId, playerId, -scoreValue(refund));
}

/** Savaş kaybı → ölen birimlerin bedeli kadar puan düşer. */
export async function debitLosses(
  runner: Runner, worldId: number, playerId: number, lost: Record<string, number>,
): Promise<void> {
  await addScoreBase(runner, worldId, playerId, -lossValue(lost));
}

/**
 * ⭐ Bölen değişince **mevcut puanları yeniden türet** (dünyanın tamamı, tek UPDATE).
 *
 * ⚠️ Bu olmadan ayar "çalışmıyor" görünürdü: `score` yalnız `addScoreBase` çağrıldığında
 * yeniden hesaplanıyor, yani yönetici 1000'i 500 yapsa hiç kimsenin puanı bir sonraki
 * harcamasına kadar değişmezdi. Panelde düğmeyi çevirip ekranda hiçbir şeyin oynamaması, tam
 * olarak bu turda `attackScoreRatio`da yaşanan sessiz arızanın kardeşi olurdu.
 * ⚠️ `score_base`e DOKUNMAZ: taban harcanan kaynağın kendisi, bölenden bağımsız.
 */
export async function rederiveScores(runner: Runner, worldId: number): Promise<number> {
  const perPoint = resourcePerPoint(worldId);
  const rows = await runner.execute<Record<string, unknown>>(sql`
    UPDATE players SET score = FLOOR(GREATEST(0::numeric, score_base) / ${perPoint}::numeric)
     WHERE world_id = ${worldId}
    RETURNING id
  `);
  return rows.length;
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
/**
 * ⭐ Oyuncunun ŞU AN sahip olduklarının katalog bedeli — **yazmadan** okur.
 *
 * ⚠️ `recomputeScoreBaseFromHoldings`ten ayrıldı (2026-08-09) çünkü ikinci bir tüketicisi
 * çıktı: yönetici toplu ordu/yapı verdiğinde puanın **farkı** kadar oynaması gerekiyor.
 * Orada tabanı sıfırdan yazmak, oyuncunun geçmişte harcayıp savaşta kaybettiği her şeyi
 * silerdi — o bilgi holdings'te yok.
 */
export async function holdingsValue(
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

  return base;
}

/**
 * Bir oyuncunun sahip olduklarından puan tabanını yeniden kurar ve yazar.
 * @returns yazılan taban (kaynak birimi)
 */
export async function recomputeScoreBaseFromHoldings(
  runner: Runner, worldId: number, playerId: number, cfg?: CatalogConfig,
): Promise<number> {
  const base = await holdingsValue(runner, playerId, cfg);
  await runner.execute(sql`
    UPDATE players
       SET score_base = ${base}::numeric,
           score = FLOOR(${base}::numeric / ${resourcePerPoint(worldId)}::numeric)
     WHERE id = ${playerId}
  `);
  return base;
}

/**
 * ⭐⭐ YÖNETİCİ MÜDAHALESİNİN PUAN KARŞILIĞI (kullanıcı bildirimi, 2026-08-09).
 *
 * Operatör panelden toplu ordu dağıttı: her şehirde on binlerce savaşçı oldu ama sıralama
 * hiç oynamadı. Sıralama doğru çalışıyordu — `score_base` yalnız `creditSpend` ile büyüyor ve
 * toplu dağıtım o yoldan geçmiyordu (`admin.bulk.controller.ts` doğrudan tabloya yazıyor).
 *
 * ⚠️⚠️ **Asıl kusur "puan artmadı" değil, ASİMETRİ.** Bağışlanan birim puan KAZANDIRMIYOR ama
 * savaşta ölünce `debitLosses` katalog bedelini **düşüyor**. Yani hediye ordu, oyuncuyu ilk
 * savaşta hiç kazanmadığı puandan eder; 9 puanlı bir oyuncuya 63.000 asker verip savaşa
 * sokmak puanını 0'a çakar. Aynısı yapı/teknik için de geçerli: şehir terk edilince
 * `cityScoreBase` bağışlanan seviyeleri de düşüyor.
 *
 * ⚠️ Çözüm tabanı sıfırdan YAZMAK değil (`recomputeScoreBaseFromHoldings`) — o, oyuncunun
 * gerçekten harcayıp savaşta kaybettiği geçmişi siler. Doğrusu **fark kadar oynatmak**:
 * müdahale öncesi ve sonrası sahiplik değerinin farkı. Böylece hediye de gasp da simetrik
 * olur ve kazanılmış geçmiş korunur.
 */
export async function applyHoldingsDelta(
  runner: Runner, worldId: number, playerIds: readonly number[],
  before: ReadonlyMap<number, number>, cfg?: CatalogConfig,
): Promise<void> {
  for (const id of playerIds) {
    const after = await holdingsValue(runner, id, cfg);
    await addScoreBase(runner, worldId, id, after - (before.get(id) ?? 0));
  }
}

/** `applyHoldingsDelta` için "önce" fotoğrafı. */
export async function snapshotHoldings(
  runner: Runner, playerIds: readonly number[], cfg?: CatalogConfig,
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (const id of playerIds) out.set(id, await holdingsValue(runner, id, cfg));
  return out;
}
