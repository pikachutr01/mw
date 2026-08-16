/**
 * ⭐⭐ YERLEŞİM ALGORİTMASI (§13.6) — yeni oyuncunun başkenti nereye kurulur?
 *
 * ⭐ **KUŞAK (BANT) MODELİ (kullanıcı, 2026-08-16).** Dünya `bandSize` diyarlık bantlara
 * bölünür. Yeni başkentler o an **açık olan bandın içine rastgele** dağıtılır; bant doyunca
 * bir sonraki bant açılır ve **bir daha geri dönülmez** (`worlds.placement_band`).
 *
 * ─ Neden değişti ─────────────────────────────────────────────────────────────────────────
 * ⚠️⚠️ Önceki model cepheyi **nüfusa** göre açıyor ve içinde `A×B×C` ile skorluyordu. İki tur
 * üst üste istenmeyen uçlara gitti:
 *   • 2026-08-08 öncesi: herkes ilk 7 diyara yığıldı (cephe nüfusu asla geçemiyordu).
 *   • 2026-08-08 sonrası: **fazla düzeltme.** Ölçüldü — gerçek servis, canlı veri, 300 sanal
 *     kayıt: yeni oyuncuların **%88,7'si diyar 9+**'a düşüyordu; diyar 1, 3, 7 hiç
 *     seçilmiyordu. Canlı veri de bunu doğruladı: onarımdan önce yerleşen 23 oyuncunun
 *     **23'ü** diyar 1-7'de, sonraki 11 oyuncunun **11'i** diyar 9-28'de. Sıfır örtüşme.
 *
 * İki arızanın ortak kaynağı aynıydı: **cephe genişliği doygunluğa değil nüfusa bağlıydı.**
 * Üstelik kendini besliyordu — cephe «dolu diyar + `emptyReserve`» olduğu için geçmişteki
 * saçılma cepheyi genişletiyor, geniş cephe daha çok saçılma üretiyordu.
 *
 * ⭐ Bant modeli bu bağı koparıyor: cephe **yalnız doygunlukla** ilerler. Skorlama (A×B×C)
 * tamamen kaldırıldı — bandın içinde seçim rastgeledir, çünkü bant zaten "yakınlık" garantisi
 * veriyor ve ikinci bir tercih katmanı iki turdur ölçülemez yan etkiler üretti.
 *
 * ─ Nasıl çalışıyor ───────────────────────────────────────────────────────────────────────
 *   1. **Açık bant**: `worlds.placement_band`ten başla, uygun diyarı olan ilk bandı bul.
 *      İlerlediyse su seviyesini yaz (yalnız `GREATEST` ile — geri gitmez).
 *   2. **Taşma**: bant doldukça küçük bir olasılıkla bir SONRAKİ bant kullanılır (aşağıya bak).
 *   3. **Diyar seçimi**: banttaki uygun diyarlar arasında, **kalan başkent kotasıyla orantılı**
 *      rastgele seçim. Böylece bant peş peşe değil dengeli dolar.
 *   4. **Şehir yeri**: diyarın boş yerlerinden biri (rastgele).
 *
 * ⚠️ **Tohumlu** (`hash(worldSeed, accountId)`): aynı hesap aynı dünyada hep aynı sonucu
 * verir → *"bu oyuncu neden buraya düştü"* sorusu cevaplanabilir. `Math.random()` bunu
 * imkânsız kılardı.
 *
 * ⚠️ Kotalar KORUNDU: `capitalQuota` (diyar başına otomatik başkent) ve `neighborQuota`
 * (diyarda şehri olan farklı oyuncu — koloniler ve yoldaki `found_city` görevleri dâhil).
 * Bant modeli kotanın yerine geçmiyor, onun İÇİNDE çalışıyor.
 */
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Db } from '../db/client.ts';
import { liveNumberFor } from '../settings/live.ts';
import { TOTAL_DISTRICTS, WORLD_SHAPE, districtAt, districtIndex } from './world-shape.ts';

export interface Coords { k: number; d: number; s: number }

/** Panelden ayarlanabilen yerleşim sabitleri (§13.6.5: *"tüm sabitler world_config'te"*). */
export interface PlacementConfig {
  /** Bir kuşağın (bandın) kaç diyar geniş olduğu. */
  bandSize: number;
  /** Diyar başına OTOMATİK yerleştirilebilecek en fazla başkent. Koloniler bu kotaya girmez. */
  capitalQuota: number;
  /**
   * ⭐ Diyarda şehri (başkent VEYA koloni) bulunan en fazla FARKLI oyuncu — bu sayıya ulaşan
   * diyara yeni başkent atanmaz. `capitalQuota`dan farkı: koloniler de sayılır (2026-08-08).
   */
  neighborQuota: number;
  /**
   * ⭐⭐ **TAŞMA — bandın SONRAKİ banda sızma olasılığının tavanı** (kullanıcı, 2026-08-16).
   *
   * Gerçek olasılık sabit değil, bandın doluluğuyla büyüyor:
   *
   *     taşma = spillChance × doluluk²        (doluluk = banttaki başkent / bant kapasitesi)
   *
   * ⚠️ **İki somut gerekçesi var, ikisi de ölçülebilir:**
   *
   *  1. **Bant sonundaki yığılmayı çözer.** Bant dolmaya yaklaşırken uygun diyar sayısı
   *     bire düşer ve o noktada yerleşen HERKES aynı diyara iner. Canlı örnek (2026-08-16):
   *     bant 1'de kotası dolmamış tek diyar 1:4 kalmıştı — taşma olmasa sıradaki iki kayıt
   *     da oraya düşecekti. Kare alma tam bunu hedefliyor: bant boşken taşma ~0, dolarken
   *     devreye giriyor.
   *  2. **Öngörülebilirliği kırar.** Cephe kesin 5 diyar olsaydı, çoklu hesap açan biri
   *     hesaplarını hangi 5 diyarda arayacağını **tam olarak** bilirdi. Küçük bir taşma hedef
   *     kümesini bulanıklaştırıyor — bu, algoritmanın ilk yazımındaki *"tahmin edilebilir
   *     olmasın"* kaygısının bant modelindeki karşılığı.
   *
   * ⚠️ Taşma bandı da doluysa mevcut banda geri dönülür — taşma bir tercih, kaçış değil.
   */
  spillChance: number;
}

export function placementConfig(worldId: number): PlacementConfig {
  const n = (key: string, fallback: number): number =>
    liveNumberFor(worldId, 'placement', key, fallback);
  return {
    bandSize: n('bandSize', 5),
    capitalQuota: n('capitalQuota', 3),
    neighborQuota: n('neighborQuota', 5),
    spillChance: n('spillChance', 0.12),
  };
}

/**
 * Tohumdan üretilen deterministik akış (mulberry32).
 * ⚠️ Kriptografik değil — olması da gerekmiyor; tek istenen tekrar üretilebilirlik.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedOf = (worldId: number, accountId: number): number =>
  parseInt(createHash('sha256').update(`${worldId}:${accountId}`).digest('hex').slice(0, 8), 16);

/** Ağırlıklı rastgele seçim. Tüm ağırlıklar 0 ise ilk aday döner. */
function pickWeighted<T>(items: readonly T[], weights: readonly number[], r: number): T | null {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (items.length === 0) return null;
  if (!(total > 0)) return items[0] ?? null;
  let x = r * total;
  for (let i = 0; i < items.length; i++) {
    x -= Math.max(0, weights[i] ?? 0);
    if (x <= 0) return items[i] ?? null;
  }
  return items[items.length - 1] ?? null;
}

interface DistrictRow {
  g: number;
  /** Diyardaki TOPLAM şehir (koloni + yoldaki şehir kurma görevi dâhil) — doluluk bundan. */
  cities: number;
  /** Diyardaki BAŞKENT sayısı — `capitalQuota` bundan. */
  capitals: number;
  /** ⭐ Diyarda şehri olan FARKLI oyuncu sayısı — `neighborQuota` bundan (koloniler dâhil). */
  players: number;
}

export class PlacementService {
  constructor(private readonly db: Db) {}

  /**
   * Yeni başkent için koordinat seç.
   *
   * ⚠️ Yarış: seçilen şehir yeri iki kayıt arasında kapılmış olabilir. Çağıran
   * `INSERT ... ON CONFLICT DO NOTHING` ile denemeli ve başarısızsa tekrar sormalı;
   * `attempt` her denemede tohumu kaydırıyor ki ikinci deneme aynı yeri seçmesin.
   */
  async pickCapital(
    worldId: number, accountId: number, tx?: Db, attempt = 0,
  ): Promise<Coords> {
    const db = tx ?? this.db;
    const cfg = placementConfig(worldId);
    const next = rng(seedOf(worldId, accountId) + attempt * 7919);
    const size = Math.max(1, Math.round(cfg.bandSize));

    const band = await this.currentBand(worldId, cfg, size, db);

    /**
     * ⭐ Taşma olasılığı bandın doluluğunun KARESİYLE büyüyor — gerekçe `spillChance`
     * başlığında. Bant boşken ~0, dolarken devreye giriyor.
     */
    const capacity = size * cfg.capitalQuota;
    const fullness = capacity > 0 ? Math.min(1, band.capitals / capacity) : 0;
    const spill = Math.max(0, Math.min(1, cfg.spillChance)) * fullness * fullness;
    const spilled = next() < spill;

    const first = spilled ? band.first + size : band.first;
    let rows = await this.describeBand(worldId, first, first + size - 1, db);
    let eligible = rows.filter((r) => this.eligible(r, cfg));

    // ⚠️ Taşma bandı da doluysa mevcut banda DÖN — taşma bir tercih, kaçış değil.
    if (eligible.length === 0 && spilled) {
      rows = await this.describeBand(worldId, band.first, band.first + size - 1, db);
      eligible = rows.filter((r) => this.eligible(r, cfg));
    }
    // Her iki bant da doluysa son çare (dünya dolmaya yakın): en küçük boş indeks.
    if (eligible.length === 0) return this.firstFreeSlot(worldId, db);

    /**
     * ⭐ **KALAN KOTAYLA ORANTILI rastgele seçim** (kullanıcı: *"rastgele olsun … diyarların
     * peş peşe değil rastgele şekilde dolması önemli"*).
     *
     * ⚠️ Düz eşit olasılık DEĞİL: kotasında daha çok yer olan diyar daha olası. Böylece bant
     * **dengeli** dolar; eşit olasılık, bir diyarı erken doldurup diğerini boş bırakabilirdi
     * ve bandın son slotlarında yığılmayı ağırlaştırırdı.
     */
    const weights = eligible.map((r) => Math.max(1, cfg.capitalQuota - r.capitals));
    const chosen = pickWeighted(eligible, weights, next()) ?? eligible[0]!;

    const { k, d } = districtAt(chosen.g);
    const s = await this.freeSlotIn(worldId, k, d, next, db);
    // Diyar "boş yeri var" diyordu ama arada kapılmış olabilir → bir üst kata haber ver.
    return s == null ? this.firstFreeSlot(worldId, db) : { k, d, s };
  }

  /** Diyar yeni başkent alabilir mi? Üç kota da SINIR, tercih değil. */
  private eligible(r: DistrictRow, cfg: PlacementConfig): boolean {
    return r.capitals < cfg.capitalQuota
      && r.players < cfg.neighborQuota
      && r.cities < WORLD_SHAPE.citiesPerDistrict;
  }

  /**
   * ⭐⭐ AÇIK KUŞAK — su seviyesinden başla, uygun diyarı olan ilk bandı bul, ilerlediyse yaz.
   *
   * ⚠️ **Su seviyesi (`worlds.placement_band`) veriden TÜRETİLMİYOR**, saklanıyor: aksi hâlde
   * bant 1'deki bir şehir silinince cephe geri açılırdı. Gerekçe `0049_placement_band.sql`
   * başlığında — kuşak ayrımı ve "hesap silip prim slot boşalt" açığı.
   *
   * ⚠️ Yazma `GREATEST` ile: iki kayıt aynı anda ilerletirse küçük olan büyüğü geri alamaz.
   *
   * ⚠️ Tarama sınırlı (`maxScan`): dünya tamamen dolarsa döngü sonsuza gitmemeli. Sınıra
   * dayanılırsa son bant döndürülür ve `pickCapital` `firstFreeSlot`a düşer.
   */
  private async currentBand(
    worldId: number, cfg: PlacementConfig, size: number, db: Db,
  ): Promise<{ index: number; first: number; capitals: number }> {
    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT placement_band FROM worlds WHERE id = ${worldId}
    `);
    const start = Math.max(1, Number(rows[0]?.['placement_band'] ?? 1));
    const maxScan = Math.ceil(TOTAL_DISTRICTS / size);

    let index = start;
    let first = (index - 1) * size + 1;
    let capitals = 0;
    for (let guard = 0; guard < maxScan; guard++) {
      first = (index - 1) * size + 1;
      if (first > TOTAL_DISTRICTS) break;
      const band = await this.describeBand(worldId, first, first + size - 1, db);
      capitals = band.reduce((a, r) => a + r.capitals, 0);
      if (band.some((r) => this.eligible(r, cfg))) break;
      index += 1;
    }

    if (index > start) {
      await db.execute(sql`
        UPDATE worlds SET placement_band = GREATEST(placement_band, ${index}) WHERE id = ${worldId}
      `);
    }
    return { index, first, capitals };
  }

  /**
   * Bir bandın diyar künyesi — TEK sorgu.
   *
   * ⭐ `players` ve `cities` sayımına **yoldaki `found_city` görevleri de** giriyor
   * (2026-08-08 kuralı korundu): o koordinat zaten rezerve, boş sayılırsa yeni oyuncu oraya
   * doğar ve gelen ordu eli boş döner.
   */
  private async describeBand(
    worldId: number, firstG: number, lastG: number, db: Db,
  ): Promise<DistrictRow[]> {
    const per = WORLD_SHAPE.districtsPerContinent;
    const son = Math.min(TOTAL_DISTRICTS, lastG);
    if (firstG > son) return [];
    const rows = await db.execute<Record<string, unknown>>(sql`
      -- Cast ŞART: bağlı parametreler unknown gelir ve Postgres generate_series'in hangi
      -- aşırı yüklemesini kullanacağını seçemez ("function ... is not unique").
      WITH cand AS (SELECT generate_series(${firstG}::int, ${son}::int) AS g),
      city AS (
        SELECT (c.k - 1) * ${per} + c.d AS g, c.is_capital, c.player_id
          FROM cities c WHERE c.world_id = ${worldId}
        UNION ALL
        SELECT (m.target_k - 1) * ${per} + m.target_d AS g, false AS is_capital,
               m.owner_player_id AS player_id
          FROM missions m
         WHERE m.world_id = ${worldId} AND m.type = 'found_city'
           AND m.status IN ('scheduled', 'running')
           AND m.target_k IS NOT NULL AND m.target_d IS NOT NULL
      )
      SELECT cand.g,
             COALESCE((SELECT COUNT(*)::int FROM city WHERE city.g = cand.g), 0) AS cities,
             COALESCE((SELECT COUNT(*)::int FROM city WHERE city.g = cand.g AND city.is_capital), 0) AS capitals,
             COALESCE((SELECT COUNT(DISTINCT city.player_id)::int FROM city WHERE city.g = cand.g), 0) AS players
        FROM cand ORDER BY cand.g
    `);
    return rows.map((r) => ({
      g: Number(r['g']),
      cities: Number(r['cities'] ?? 0),
      capitals: Number(r['capitals'] ?? 0),
      players: Number(r['players'] ?? 0),
    }));
  }

  /** Diyardaki boş şehir yerlerinden biri (rastgele). Hiç yoksa `null`. */
  private async freeSlotIn(
    worldId: number, k: number, d: number, next: () => number, db: Db,
  ): Promise<number | null> {
    /**
     * ⚠️ **TAKMA AD `gs`, `s` DEĞİL.** İlk yazımda `generate_series(...) AS s` idi ve
     * korelasyonlu alt sorgudaki çıplak `s`, Postgres tarafından dış fonksiyona değil
     * **`cities.s` sütununa** çözülüyordu: koşul `c.s = c.s` oluyor, yani diyarda BİR TANE
     * bile şehir varsa `EXISTS` daima doğru çıkıyor ve fonksiyon *"boş yer yok"* diyordu.
     *
     * Sonuç sessiz ve sinsiydi: yerleşim her seferinde `firstFreeSlot`a düşüyor, yani
     * yepyeni algoritma eski **sıralı doldurma** davranışını üretiyordu. Testte «kota
     * aşılıyor» diye göründü (bir diyarda 10 başkent), asıl sebep buydu.
     * ⚠️ Tamamen BOŞ diyarda hata görünmez (EXISTS zaten yanlış) — hatayı yakalamak için
     * kısmen dolu bir diyarla denemek şart.
     *
     * ⭐ **YOLDAKİ ŞEHİR KURMA GÖREVLERİ DE YER TUTAR** (kullanıcı, 2026-08-03).
     * Bir oyuncunun ordusu o koordinata şehir kurmaya gidiyorsa orası "boş" sayılmaz: yeni
     * oyuncu oraya doğarsa gelen ordu `slot_taken` ile eli boş geri döner ve saatlerce süren
     * bir sefer boşa gitmiş olur.
     * ⚠️ Kullanıcı iki seçenek sunmuştu (görevi iptal et / başka yer seç); **başka yer**
     * seçildi — kayıt sırasında başkasının seferini iptal etmek, hiç kimsenin beklemediği
     * bir kayıp yaratırdı. Yeni oyuncunun nereye doğduğu ise onun için fark etmez.
     */
    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT gs AS s FROM generate_series(1, ${WORLD_SHAPE.citiesPerDistrict}) AS gs
       WHERE NOT EXISTS (
         SELECT 1 FROM cities c
          WHERE c.world_id = ${worldId} AND c.k = ${k} AND c.d = ${d} AND c.s = gs
       )
       AND NOT EXISTS (
         SELECT 1 FROM missions m
          WHERE m.world_id = ${worldId} AND m.type = 'found_city'
            AND m.status IN ('scheduled', 'running')
            AND m.target_k = ${k} AND m.target_d = ${d} AND m.target_s = gs
       )
       ORDER BY gs
    `);
    if (rows.length === 0) return null;
    return Number(rows[Math.floor(next() * rows.length)]?.['s']);
  }

  /**
   * Son çare: dünyadaki **en küçük boş indeks**. Bu, algoritmanın eski hâli — artık yalnız
   * "açık cephede hiç yer kalmadı" durumunda çalışıyor.
   *
   * ⚠️ Kaldırılmadı: yerleşim algoritmasının her koşulda bir koordinat üretmesi ŞART, yoksa
   * dünya dolmaya yaklaştığında kayıt ekranı 500 vermeye başlar.
   */
  private async firstFreeSlot(worldId: number, db: Db): Promise<Coords> {
    const perDistrict = WORLD_SHAPE.citiesPerDistrict;
    const perContinent = perDistrict * WORLD_SHAPE.districtsPerContinent;
    /**
     * ⚠️ **YOLDAKİ ŞEHİR KURMA GÖREVLERİ DE DOLU SAYILIR.** Bu yedek yol `freeSlotIn`in
     * filtresini atlıyordu ve test bunu yakaladı: diyarın tek boş yeri bir `found_city`
     * hedefiyken `freeSlotIn` doğru şekilde `null` döndü, sonra `firstFreeSlot` aynı yeri
     * verdi. Kural iki yerde birden geçerli olmalı, yoksa yedek yol kuralı deliyor.
     */
    const rows = await db.execute<{ idx: number } & Record<string, unknown>>(sql`
      WITH used AS (
        SELECT ((k - 1) * ${WORLD_SHAPE.districtsPerContinent} + (d - 1)) * ${perDistrict} + (s - 1) AS idx
          FROM cities WHERE world_id = ${worldId}
        UNION
        SELECT ((target_k - 1) * ${WORLD_SHAPE.districtsPerContinent} + (target_d - 1)) * ${perDistrict}
               + (target_s - 1) AS idx
          FROM missions
         WHERE world_id = ${worldId} AND type = 'found_city'
           AND status IN ('scheduled', 'running')
           AND target_k IS NOT NULL AND target_d IS NOT NULL AND target_s IS NOT NULL
      )
      SELECT MIN(i)::int AS idx
        FROM generate_series(0, COALESCE((SELECT MAX(idx) FROM used), -1) + 1) AS i
       WHERE i NOT IN (SELECT idx FROM used)
    `);
    const idx = Number(rows[0]?.idx ?? 0);
    return {
      k: Math.floor(idx / perContinent) + 1,
      d: (Math.floor(idx / perDistrict) % WORLD_SHAPE.districtsPerContinent) + 1,
      s: (idx % perDistrict) + 1,
    };
  }
}

/** Test ve denetim için: skorun bileşenleri ayrı ayrı görünsün. */
export const _internals = { rng, seedOf, pickWeighted, districtIndex };
