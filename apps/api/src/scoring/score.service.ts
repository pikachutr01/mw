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
import { sql, type SQL } from 'drizzle-orm';
import {
  BUILDINGS_BY_ID, LEVEL_BASED, STARTING_BUILDINGS, TECHS_BY_ID, UNITS_BY_ID,
  buildingCost, defenseStructureCost, techCost, unitCost, type CatalogConfig,
} from '@mobilwar/catalog';
import type { Db } from '../db/client.ts';
import type { Tx } from '../missions/handler-registry.ts';
import { liveNumberFor } from '../settings/live.ts';
import { materializeUnitQueues } from '../queues/unit-queue.ts';

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

/**
 * Savaş kaybı → ölen birimlerin bedeli kadar puan düşer.
 *
 * ⚠️⚠️ **`cfg` GEÇMEK ZORUNLU** (2026-08-14'te düzeltildi). Bu fonksiyon uzun süre `cfg`
 * almıyordu ve `lossValue(lost)` sessizce `DEFAULT_CATALOG_CONFIG`e düşüyordu — yani panelden
 * bir fiyat değiştiren dünyada oyuncu **bir fiyattan ödüyor, başka bir fiyattan puan
 * kaybediyordu**. `lossValue` çarpanı görsün diye 2. nesil Tur 4'te `cfg` parametresi almıştı
 * ama düzeltme ÇAĞIRANA hiç ulaşmamıştı: parametreyi eklemek yetmiyor, taşımak gerekiyor.
 *
 * ⚠️ Yeniden fiyatlamanın (aşağıdaki başlık) ön şartı da bu: kanca tabanı BUGÜNKÜ fiyata
 * taşıyor; borç tarafı bugünkü fiyattan düşmezse simetri kurulmaz.
 */
export async function debitLosses(
  runner: Runner, worldId: number, playerId: number, lost: Record<string, number>,
  cfg?: CatalogConfig,
): Promise<void> {
  await addScoreBase(runner, worldId, playerId, -lossValue(lost, cfg));
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
 * ⭐ SAHİPLİK SATIRI — oyuncunun elindeki tek bir kalem.
 *
 * `n` alanının anlamı `kind`e bağlı: yapı/teknikte **SEVİYE**, savaşçıda **ADET**, savunmada
 * ikisinden biri (Sur ve Büyü Kalkanı `count` sütununda seviye taşır, §13.11.1b).
 */
type HoldingKind = 'building' | 'tech' | 'unit' | 'defense';

interface HoldingRow { playerId: number; kind: HoldingKind; type: string; n: number }

/**
 * ⭐⭐ SAHİPLİK OKUMASININ **TEK** ÇEKİRDEĞİ (2026-08-14).
 *
 * `holdingsValue`, `applyHoldingsDelta` ve yeniden fiyatlama artık aynı satır kümesini okuyor.
 * Ayrı ayrı yazılsalardı biri güncellenip diğeri unutulurdu — ⚠️ **nitekim tam bu olmuştu**:
 * eski `holdingsValue` yalnız dört tabloya bakıyordu ve İKİ ordu deposunu hiç görmüyordu:
 *
 *   • `cave_units` — mağaradaki savaşçılar. Sonucu **canlıda bir hata**: yönetici panelindeki
 *     «puanı yeniden hesapla» (`recomputeScoreBaseFromHoldings`) mağarasında 50.000 askeri olan
 *     oyuncunun o askerlerin değerini **siliyordu**. Şehir devrinde de aynı yol koşuyor.
 *   • `mission_units` — seferdeki ordu. Yeniden fiyatlamada bunu dışarıda bırakmak muhasebe
 *     eksiği değil **sömürü** olurdu: fiyat indirimini duyan oyuncu ordusunu uzun bir sefere
 *     yollayıp yeniden fiyatlamayı atlatır, dönüşte şişik puanla otururdu. Zamanlamayı oyuncu
 *     kontrol ediyor.
 *
 * ⚠️ `m.status IN ('scheduled','running')` süzgeci **ZORUNLU**: `mission_units` satırları
 * varışta silinmiyor, dönüş görevine taşınıyor (`mission.service.ts`) ve nihai temizliği
 * CASCADE yapıyor. Süzgeç olmadan eve dönmüş ordu hem `units`ta hem burada sayılır.
 *
 * ⚠️ **KUYRUK BİLEREK YOK.** `queues.spent_gold/spent_food` ödenen tutarı zaten taşıyor ve
 * iptal iadesi (`debitRefund`) **aynı** sayıyı düşüyor → kredi/borç orada zaten simetrik.
 * Kuyruğu yeniden fiyatlasaydık ya bu simetriyi bozardık ya da `spent_gold`u yeniden yazmak
 * gerekirdi; ikincisi oyuncunun **kaynağına** dokunur (fiyat düşerse ödediğinden azını geri
 * alır = sessiz müsadere).
 */
async function holdingRows(
  runner: Runner, scope: { worldId: number } | { playerId: number },
): Promise<HoldingRow[]> {
  const byWorld = 'worldId' in scope;
  const cityCond: SQL = byWorld
    ? sql`c.world_id = ${scope.worldId}`
    : sql`c.player_id = ${scope.playerId}`;
  const techCond: SQL = byWorld
    ? sql`p.world_id = ${scope.worldId}`
    : sql`t.player_id = ${scope.playerId}`;
  const missionCond: SQL = byWorld
    ? sql`m.world_id = ${scope.worldId}`
    : sql`m.owner_player_id = ${scope.playerId}`;

  const [buildings, techRows, unitRows, caveRows, defenseRows, missionRows] = await Promise.all([
    runner.execute<Record<string, unknown>>(sql`
      SELECT c.player_id AS pid, b.type, b.level AS n FROM buildings b
        JOIN cities c ON c.id = b.city_id WHERE ${cityCond}
    `),
    runner.execute<Record<string, unknown>>(sql`
      SELECT t.player_id AS pid, t.type, t.level AS n FROM techs t
        JOIN players p ON p.id = t.player_id WHERE ${techCond}
    `),
    runner.execute<Record<string, unknown>>(sql`
      SELECT c.player_id AS pid, u.type, u.count AS n FROM units u
        JOIN cities c ON c.id = u.city_id WHERE ${cityCond}
    `),
    runner.execute<Record<string, unknown>>(sql`
      SELECT c.player_id AS pid, cu.type, cu.count AS n FROM cave_units cu
        JOIN cities c ON c.id = cu.city_id WHERE ${cityCond}
    `),
    runner.execute<Record<string, unknown>>(sql`
      SELECT c.player_id AS pid, d.type, d.count AS n FROM defenses d
        JOIN cities c ON c.id = d.city_id WHERE ${cityCond}
    `),
    runner.execute<Record<string, unknown>>(sql`
      SELECT m.owner_player_id AS pid, mu.unit_type AS type, mu.count AS n
        FROM mission_units mu JOIN missions m ON m.id = mu.mission_id
       WHERE ${missionCond} AND m.owner_player_id IS NOT NULL
         AND m.status IN ('scheduled', 'running')
    `),
  ]);

  const out: HoldingRow[] = [];
  const push = (rows: Record<string, unknown>[], kind: HoldingKind): void => {
    for (const r of rows) {
      out.push({
        playerId: Number(r['pid']), kind, type: String(r['type']), n: Number(r['n']),
      });
    }
  };
  push(buildings, 'building');
  push(techRows, 'tech');
  push(unitRows, 'unit');
  push(caveRows, 'unit');
  push(missionRows, 'unit');
  push(defenseRows, 'defense');
  return out;
}

/**
 * Satır kümesini bir katalog config'iyle değerler → `playerId → kaynak birimi`.
 *
 * ⚠️ **Memoizasyon opsiyonel değil.** `cumulativeBuildingValue` seviyeye kadar döngü kuruyor;
 * 5.000 oyunculu bir dünyada iki değerleme milyonlarca `Math.pow` demek. Ayrık `(tip, seviye)`
 * çifti ise en fazla birkaç yüz tane.
 *
 * ⚠️ **Birimler memoize EDİLMEZ**: `unitCost` yuvarlamayı adetle çarptıktan SONRA yapıyor,
 * yani `unitCost(t, n) ≠ n × unitCost(t, 1)`. `debitLosses` ile bit-bit aynı kalmanın tek yolu
 * satır başına `unitsValue` çağırmak — zaten O(1).
 */
export function valueHoldings(
  rows: readonly HoldingRow[], cfg?: CatalogConfig,
): Map<number, number> {
  const out = new Map<number, number>();
  const memo = new Map<string, number>();
  const cached = (key: string, compute: () => number): number => {
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const v = compute();
    memo.set(key, v);
    return v;
  };

  for (const r of rows) {
    if (!(r.n > 0)) continue;
    let v = 0;
    if (r.kind === 'building') {
      v = cached(`b:${r.type}:${r.n}`, () => cumulativeBuildingValue(r.type, r.n, cfg));
    } else if (r.kind === 'tech') {
      v = cached(`t:${r.type}:${r.n}`, () => cumulativeTechValue(r.type, r.n, cfg));
    } else if (r.kind === 'unit') {
      v = unitsValue({ [r.type]: r.n }, cfg);
    } else {
      v = LEVEL_BASED.has(r.type)
        ? cached(`d:${r.type}:${r.n}`, () => cumulativeDefenseStructureValue(r.type, r.n, cfg))
        : unitsValue({ [r.type]: r.n }, cfg);
    }
    if (v !== 0) out.set(r.playerId, (out.get(r.playerId) ?? 0) + v);
  }
  return out;
}

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
  const rows = await holdingRows(runner, { playerId });
  return valueHoldings(rows, cfg).get(playerId) ?? 0;
}

/**
 * Bir oyuncunun sahip olduklarından puan tabanını yeniden kurar ve yazar.
 * @returns yazılan taban (kaynak birimi)
 */
export async function recomputeScoreBaseFromHoldings(
  runner: Runner, worldId: number, playerId: number, cfg?: CatalogConfig, at?: Date,
): Promise<number> {
  /**
   * ⭐ ÖNCE ÜRETİM BANTLARINI YAZ (2026-08-14) — `cave_units` boşluğuyla aynı sınıf.
   *
   * ⚠️ Bu fonksiyon `score_base`i **ÜZERİNE YAZIYOR**, fark işlemiyor. Yani eksik okunan her
   * şey kalıcı olarak siliniyor. Üretim tembel ilerlediği için, kuyruktan düşmüş ama `units`/
   * `defenses` tablosuna henüz yazılmamış ordu ham okumada YOK görünüyordu: operatör "puanı
   * yeniden hesapla" düğmesine bastığında oyuncu o ordunun değerini kaybediyordu.
   *
   * ⚠️ `at` verilmezse ilerletme YAPILMAZ (davranış eskisiyle bit-bit aynı). Oyun saatini
   * burada `now()`tan uyduramayız — bakımda saat donuyor ve uydurulmuş bir zaman kuyruğu
   * gerçekte üretilmemiş birimlerle doldururdu. Zamanı bilen çağıran versin.
   */
  if (at) {
    const cityRows = await runner.execute<Record<string, unknown>>(sql`
      SELECT id FROM cities WHERE player_id = ${playerId}
    `);
    for (const c of cityRows) {
      const cityId = Number(c['id']);
      await materializeUnitQueues(runner as never, cityId, at, 'unit');
      await materializeUnitQueues(runner as never, cityId, at, 'defense');
    }
  }

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

/* ═══ FİYAT DEĞİŞİMİNDE YENİDEN FİYATLAMA ═══════════════════════════════════
 * ⭐⭐ KUSUR (kullanıcı sorusu, 2026-08-14): alacak **ödeme anındaki** fiyattan işleniyordu
 * (`creditSpend`), borç ise **bugünkü** fiyattan (`debitLosses`, `cityScoreBase`). Yönetici
 * panelden bir maliyeti değiştirdiği an ikisi ayrışıyordu:
 *
 *   • fiyat DÜŞERSE → ölen ordu kazandırdığından azını götürür ⇒ puan enflasyonu; "indirimden
 *     sonra ordunu öldür" puan-POZİTİF bir hamle olurdu.
 *   • fiyat ARTARSA → ölen ordu kazandırdığından fazlasını götürür; `GREATEST(0,…)` kelepçesi
 *     yüzünden oyuncu başka yerden kazandığı puanı da kaybedip dibe vurabilirdi.
 *
 * Ayrıca aynı tekniği pahalıyken alan eski oyuncu kalıcı bir puan fazlası taşıyordu.
 *
 * ⭐ ÇÖZÜMÜN DEĞİŞMEZ KOŞULU: *oyuncunun HÂLÂ SAHİP OLDUĞU* her varlığın `score_base` içindeki
 * payı, o varlığın BUGÜNKÜ katalog bedeline eşit olmalı. Tüketilmiş şeylerin (ölen ordu, iptal
 * edilen sipariş, terk edilen şehir) payı tarihsel kalır. Bu koşul sağlanınca `debitLosses` tam
 * olarak kredilenen tutarı geri alır.
 *
 * ⚠️ **Neden satır başına `basis` kolonu DEĞİL** (ilk tasarım oydu): ordu `units` satırında
 * durmuyor — sefere çıkınca düşüyor, ölüyor, sağ kalanı dönüyor, destek seferiyle başka şehre
 * yerleşiyor, mağaraya giriyor. `basis` bunların hepsiyle taşınmak zorunda kalırdı ve tek bir
 * noktayı unutmak sessiz, kalıcı bir puan kayması üretirdi. Üstelik gerçekten gerektiği tek
 * yerde (kuyruk) zaten var: `queues.spent_gold/spent_food`.
 */

/**
 * ⭐⭐ **TEK OKUMA, İKİ DEĞERLEME** — bu fonksiyonun şeklinin tamamı bir yarışı yok etmek için.
 *
 * ⚠️ Akla ilk gelen tasarım (`snapshotHoldings` → ayarı uygula → yeniden oku → farkı yaz)
 * **yapısı gereği yarışlıdır**: iki okuma arasında bir savaş çözülürse ölen birim `önce`de var,
 * `sonra`da yok → farkı bir kez daha düşülür; savaş da `debitLosses` ile zaten düşmüştür ⇒
 * **çifte borç**, oyuncunun puanı sebepsiz çöker. Tam olarak "makul görünen ama yanlış sayı".
 *
 * Satırları **bir kez** okuyup aynı küme üzerinde iki cfg ile değerleyince eşzamanlı bir savaş
 * ya işlemin tamamen öncesinde ya tamamen sonrasında kalır; ikisi de doğru sonuç verir.
 * Sorgu sayısı da yarıya iner.
 */
export async function repriceDeltas(
  runner: Runner, worldId: number,
  cfgBefore: CatalogConfig | undefined, cfgAfter: CatalogConfig | undefined,
): Promise<Map<number, number>> {
  const rows = await holdingRows(runner, { worldId });
  const before = valueHoldings(rows, cfgBefore);
  const after = valueHoldings(rows, cfgAfter);

  const out = new Map<number, number>();
  for (const [pid, a] of after) {
    const d = a - (before.get(pid) ?? 0);
    if (d !== 0) out.set(pid, d);
  }
  // Yeni değerlemede hiç satırı kalmayan oyuncu (fiyat 0'a indi) — tam tersi yönde.
  for (const [pid, b] of before) if (!after.has(pid) && b !== 0) out.set(pid, -b);
  return out;
}

/**
 * N oyuncunun tabanını **tek deyimde** oynatır.
 *
 * ⚠️ `SET` ifadesi `addScoreBase` ile **BİT BİT AYNI** olmak zorunda. İkisi bilerek yan yana
 * duruyor ve `score-reprice.test.ts` eşitliklerini kilitliyor — ayrışırlarsa hata sessiz olur
 * (puanlar yavaşça iki farklı kurala göre hesaplanmaya başlar).
 */
export async function addScoreBaseBulk(
  runner: Runner, worldId: number, deltas: ReadonlyMap<number, number>,
): Promise<number> {
  const entries = [...deltas].filter(([, d]) => Number.isFinite(d) && d !== 0);
  if (entries.length === 0) return 0;
  const perPoint = resourcePerPoint(worldId);

  // 1.000'lik parçalar: tek deyimde on binlerce VALUES satırı ayrıştırıcıyı zorlar.
  for (let i = 0; i < entries.length; i += 1000) {
    const values = sql.join(
      entries.slice(i, i + 1000).map(([pid, d]) => sql`(${pid}::bigint, ${d}::numeric)`),
      sql`, `,
    );
    await runner.execute(sql`
      UPDATE players p
         SET score_base = GREATEST(0::numeric, p.score_base + d.delta),
             score = FLOOR(GREATEST(0::numeric, p.score_base + d.delta) / ${perPoint}::numeric)
        FROM (VALUES ${values}) AS d(player_id, delta)
       WHERE p.id = d.player_id
    `);
  }
  return entries.length;
}

/**
 * Bir dünyanın tamamını yeniden fiyatlar. `saveSettings`/`resetSettings` bunu çağırır.
 *
 * ⚠️ `pg_advisory_xact_lock`: iki yönetici aynı anda kaydederse aynı fark iki kez uygulanırdı.
 * Kilit transaction'a bağlı, yani commit/rollback ile kendiliğinden bırakılıyor.
 *
 * ⚠️ **Bilinen sınır — kalan yarış penceresi.** `settings.update()`in `NOTIFY` yayını ile bu
 * geçişin bitmesi arasında worker yeni fiyatlarla bir savaş çözerse o TEK savaşın birimleri
 * eski fiyattan kredilenip yeni fiyattan düşülür. Etkisi bir savaşın fiyat farkı kadar ve
 * kendini sınırlıyor. Sıfırlamak isteyen operatör değişikliği **bakım modunda** yapmalı:
 * bakımda `SchedulerService` hiçbir görev çalıştırmıyor, yani hiçbir savaş çözülmüyor.
 *
 * @returns tabanı oynatılan oyuncu sayısı
 */
export async function repriceWorld(
  db: Db, worldId: number,
  cfgBefore: CatalogConfig | undefined, cfgAfter: CatalogConfig | undefined,
): Promise<number> {
  return db.transaction(async (tx) => {
    const runner = tx as unknown as Runner;
    await runner.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`reprice:${worldId}`}))`);
    const deltas = await repriceDeltas(runner, worldId, cfgBefore, cfgAfter);
    return addScoreBaseBulk(runner, worldId, deltas);
  });
}

/** Yeniden fiyatlama önizlemesi/uygulaması: oyuncu oyuncu ne olacağını da döndürür. */
export interface RepriceRow {
  playerId: number;
  username: string;
  delta: number;
  scoreBefore: number;
  scoreAfter: number;
}

/**
 * ⭐⭐ KOD KAYNAKLI FİYAT DEĞİŞİMİNİN ONARIMI (kullanıcı, 2026-08-15).
 *
 * `repriceWorld` yalnız PANELDEN yapılan ayar değişikliklerinde çalışıyor: kanca
 * `saveSettings`/`resetSettings` içinde. Fiyat **kodda** değişince (katalog tabanları,
 * `DEFAULT_CATALOG_CONFIG`) hiçbir kanca tetiklenmiyor ve oyuncuların puanı ödedikleri ESKİ
 * fiyatta donuyor. 2026-08-14'te tam bu oldu: Akademi 1400/1000 → 900/700 ve
 * `techCostMultiplier` 1 → 0,75 indi, 8 oyuncunun puanı elle yazılan bir betikle düzeltildi.
 *
 * Bu fonksiyon o betiği kalıcı bir yönetici aracına çeviriyor. Operatör ESKİ değerleri
 * veriyor, gerisi `repriceWorld` ile aynı: **fark** işlenir, geçmiş silinmez.
 *
 * ⚠️ **Neden panelden "değiştir → geri al" İŞE YARAMAZ** (ilk akla gelen ve yanlış olan yol):
 * kanca `V(sonra) − V(önce)` işliyor. Gidip dönmek iki ters farkı toplar, sonuç **tam sıfır**.
 * Gereken tek yönlü bir düzeltmedir, çünkü taban bugünkü config ile zaten TUTARSIZ.
 *
 * ⚠️ `dryRun` varsayılan: toplu puan değişimi geri alınamaz, operatör önce görmeli.
 */
export async function repriceWithOldValues(
  db: Db, worldId: number, cfgNow: CatalogConfig, cfgOld: CatalogConfig,
  opts: { apply: boolean },
): Promise<{ rows: RepriceRow[]; total: number; applied: number }> {
  return db.transaction(async (tx) => {
    const runner = tx as unknown as Runner;
    await runner.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`reprice:${worldId}`}))`);

    const deltas = await repriceDeltas(runner, worldId, cfgOld, cfgNow);
    const players = await runner.execute<Record<string, unknown>>(sql`
      SELECT id, username, score_base FROM players WHERE world_id = ${worldId}
    `);
    const perPoint = resourcePerPoint(worldId);
    const rows: RepriceRow[] = [];
    let total = 0;
    for (const p of players) {
      const delta = deltas.get(Number(p['id'])) ?? 0;
      if (!delta) continue;
      const before = Number(p['score_base']);
      const after = Math.max(0, before + delta);
      rows.push({
        playerId: Number(p['id']), username: String(p['username']), delta,
        scoreBefore: Math.floor(Math.max(0, before) / perPoint),
        scoreAfter: Math.floor(after / perPoint),
      });
      total += delta;
    }
    rows.sort((a, b) => a.delta - b.delta);

    const applied = opts.apply ? await addScoreBaseBulk(runner, worldId, deltas) : 0;
    return { rows, total, applied };
  });
}
