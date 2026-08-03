/**
 * ⭐ YERLEŞİM ALGORİTMASI (§13.6) — yeni oyuncunun başkenti nereye kurulur?
 *
 * ⚠️ **NE VARDI:** düpedüz *"en küçük boş indeks"*. `auth.service.ts` diyarları sırayla
 * dolduruyordu: 1:1:1 → 1:1:2 → … Kullanıcı bunu canlıda gördü — *"benden sonra kayıt olan
 * bir başka hesap da 1:1:2'ye yerleştirildi"* — ve haklıydı: kodun kendi yorumu da
 * *"yerleşim algoritması Faz 3'te; şimdilik ilk boş şehir yeri"* diyordu.
 *
 * ⚠️ Sıralı doldurmanın iki gerçek zararı var:
 *   1. **Komşuluk kaderdir.** Arka arkaya kaydolan iki oyuncu daima yan yana düşer; biri
 *      diğerini ilk gün ezebilir ve kaçacak yer yoktur.
 *   2. **Tahmin edilebilir.** Çoklu hesap açan biri, hesaplarını yan yana koymak için sadece
 *      arka arkaya kaydolmak zorundadır.
 *
 * ─ Kullanıcının kuralı (§13.6 başlığı) ────────────────────────────────────────────────────
 * *"1. kıtanın erken diyarlarından başla · diyar başına en fazla 4-5 başkent · erken safhada
 * herkesi aynı diyara yığma ama birbirinden de koparma · dünya büyüdükçe geriye dönüp
 * serpiştir."*
 *
 * ─ Nasıl çalışıyor ────────────────────────────────────────────────────────────────────────
 *   1. **Açık cephe** (§13.6.2): `clamp(ceil(oyuncu / (hedefDoluluk × kota)), min, 5000)`.
 *      Bölge her zaman `[1..N]` ÖNEKİ — bu yüzden eski diyarlar daima aday kalır ve
 *      "geriye dönüp serpiştirme" ayrı bir mekanizma gerektirmez.
 *   2. **Örneklem**: açık bölgeden rastgele ~60 diyar. Tüm bölgeyi puanlamak 5.000 satır
 *      okumak demekti; örneklem hem O(1) maliyet hem kümelenme kırıcı.
 *   3. **Skor** `A × B × C` (§13.6.3):
 *        A = (1 − doluluk)^1,5            → boş diyar tercihi
 *        B = exp(−(n − ideal)² / 2σ²)     → KOMŞULUK: ideal 2 başkent
 *        C = 1 / (1 + (tehdit/çıpa)^1,5)  → GÜÇ UYUMU: kendi kuşağının yanına
 *   4. **Ağırlıklı rastgele** seçim — deterministik "en iyi" DEĞİL, yoksa aynı anda kaydolan
 *      herkes aynı diyara giderdi.
 *   5. Diyar seçilince içindeki boş şehir yerlerinden biri (yine rastgele).
 *
 * ⚠️ **B çarpanı bu tasarımın özü.** Boş diyar (n=0) ağırlık 0,25; n=1 → 0,71; n=2 → 1,00;
 * n=4 → 0,25. Yani yeni oyuncu 1-2 komşusu olan diyara düşmeyi tercih eder: kimse ıssız
 * çölde tek başına uyanmaz (hedef ve müttefik bulur), kimse 5 kişinin ortasına düşmez.
 *
 * ⚠️ **Tohumlu** (`hash(worldSeed, accountId)`): aynı hesap aynı dünyada hep aynı sonucu
 * verir → hata ayıklanabilir ve denetlenebilir. `Math.random()` kullansaydık "bu oyuncu
 * neden buraya düştü" sorusu asla cevaplanamazdı.
 */
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Db } from '../db/client.ts';
import { liveNumber } from '../settings/live.ts';
import { TOTAL_DISTRICTS, WORLD_SHAPE, districtAt, districtIndex } from './world-shape.ts';

export interface Coords { k: number; d: number; s: number }

/** Panelden ayarlanabilen yerleşim sabitleri (§13.6.5: *"tüm sabitler world_config'te"*). */
export interface PlacementConfig {
  /** Diyar başına OTOMATİK yerleştirilebilecek en fazla başkent. Koloniler bu kotaya girmez. */
  capitalQuota: number;
  /** Açık cephenin hedef doluluğu — 0,60 = cephe hep ~%60 dolu kalsın. */
  targetOccupancy: number;
  /** Dünya bomboşken bile açık tutulacak en az diyar sayısı. */
  minOpenDistricts: number;
  /** Skorlanacak aday sayısı. */
  sampleSize: number;
  /** Gauss komşuluk tercihinin tepe noktası (kaç başkentli diyar ideal). */
  neighborIdeal: number;
  /** Gauss'un genişliği; büyütmek tercihi düzleştirir. */
  neighborSigma: number;
  /** Boşluk tercihinin üssü — büyütmek boş diyarları daha çok kayırır. */
  emptinessExponent: number;
  /** Güç uyumunun üssü. 0 = güç uyumu kapalı. */
  threatExponent: number;
  /** Tehdit çıpası: son kaç günde kaydolanların medyan puanı baz alınır. */
  threatWindowDays: number;
}

export function placementConfig(): PlacementConfig {
  return {
    capitalQuota: liveNumber('placement', 'capitalQuota', 5),
    targetOccupancy: liveNumber('placement', 'targetOccupancy', 0.6),
    minOpenDistricts: liveNumber('placement', 'minOpenDistricts', 8),
    sampleSize: liveNumber('placement', 'sampleSize', 60),
    neighborIdeal: liveNumber('placement', 'neighborIdeal', 2),
    neighborSigma: liveNumber('placement', 'neighborSigma', 1.2),
    emptinessExponent: liveNumber('placement', 'emptinessExponent', 1.5),
    threatExponent: liveNumber('placement', 'threatExponent', 1.5),
    threatWindowDays: liveNumber('placement', 'threatWindowDays', 14),
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
  /** Diyardaki TOPLAM şehir (koloni dâhil) — doluluk bundan. */
  cities: number;
  /** Diyardaki BAŞKENT sayısı — kota ve komşuluk bundan. */
  capitals: number;
  /** Diyar ve iki komşusundaki oyuncuların 75. persentil puanı. */
  threat: number;
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
    const cfg = placementConfig();
    const next = rng(seedOf(worldId, accountId) + attempt * 7919);

    const open = await this.openFrontier(worldId, cfg, db);
    const sample = this.sampleDistricts(open, cfg.sampleSize, next);
    const rows = await this.describeDistricts(worldId, sample, db);

    /**
     * ⚠️ Sert filtre: kotası dolmuş ya da hiç boş yeri kalmamış diyar elenir. Yumuşak
     * ağırlıkla halledilmez — kota bir SINIR, tercih değil.
     */
    const eligible = rows.filter(
      (r) => r.capitals < cfg.capitalQuota && r.cities < WORLD_SHAPE.citiesPerDistrict,
    );

    /**
     * Örneklemin tamamı elendiyse cepheyi genişletmek yerine **ilk boş yeri** ara: dünya
     * gerçekten doluyor demektir ve oyuncuyu kayıt ekranında bekletmenin anlamı yok.
     */
    if (eligible.length === 0) return this.firstFreeSlot(worldId, db);

    const anchor = await this.threatAnchor(worldId, cfg, db);
    const weights = eligible.map((r) => this.score(r, cfg, anchor));
    const chosen = pickWeighted(eligible, weights, next()) ?? eligible[0]!;

    const { k, d } = districtAt(chosen.g);
    const s = await this.freeSlotIn(worldId, k, d, next, db);
    // Diyar "boş yeri var" diyordu ama arada kapılmış olabilir → bir üst kata haber ver.
    return s == null ? this.firstFreeSlot(worldId, db) : { k, d, s };
  }

  /**
   * Skor = A × B × C (§13.6.3).
   *
   * ⚠️ ÇARPIM, toplam değil: her çarpan bir VETO gücü taşımalı. Toplam olsaydı kotası dolmaya
   * yaklaşmış ama "boş" görünen bir diyar, yüksek A'sıyla düşük B'yi örtebilirdi.
   */
  private score(r: DistrictRow, cfg: PlacementConfig, anchor: number): number {
    const occupancy = r.cities / WORLD_SHAPE.citiesPerDistrict;
    const A = Math.max(0, 1 - occupancy) ** cfg.emptinessExponent;

    const sigma = Math.max(0.1, cfg.neighborSigma);
    const B = Math.exp(-((r.capitals - cfg.neighborIdeal) ** 2) / (2 * sigma * sigma));

    // ⚠️ Çıpa 0 olabilir (dünyanın ilk oyuncuları) → güç uyumu o zaman nötr.
    const C = cfg.threatExponent <= 0 || anchor <= 0
      ? 1
      : 1 / (1 + (r.threat / anchor) ** cfg.threatExponent);

    return A * B * C;
  }

  /**
   * Açık yerleşim cephesi (§13.6.2) — `[1..N]` öneki.
   * Doluluk hep ~`targetOccupancy` civarında kalır: ne tıkış tıkış, ne hayalet.
   */
  private async openFrontier(worldId: number, cfg: PlacementConfig, db: Db): Promise<number> {
    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM cities WHERE world_id = ${worldId} AND is_capital
    `);
    const players = Number(rows[0]?.['n'] ?? 0);
    const per = Math.max(1, cfg.targetOccupancy * cfg.capitalQuota);
    const want = Math.ceil((players + 1) / per);
    return Math.min(TOTAL_DISTRICTS, Math.max(cfg.minOpenDistricts, want));
  }

  /** Açık bölgeden tekrarsız örneklem. Bölge küçükse tamamını döndürür. */
  private sampleDistricts(open: number, size: number, next: () => number): number[] {
    const want = Math.max(1, Math.min(Math.round(size), open));
    if (want >= open) return Array.from({ length: open }, (_, i) => i + 1);
    const picked = new Set<number>();
    // ⚠️ Deneme sayısı sınırlı: `want < open` olsa bile şanssız bir akış sonsuza dönebilir.
    for (let guard = 0; picked.size < want && guard < want * 20; guard++) {
      picked.add(Math.floor(next() * open) + 1);
    }
    return [...picked];
  }

  /** Örneklemdeki diyarların doluluk / başkent / tehdit künyesi — TEK sorgu. */
  private async describeDistricts(
    worldId: number, sample: readonly number[], db: Db,
  ): Promise<DistrictRow[]> {
    if (sample.length === 0) return [];
    const per = WORLD_SHAPE.districtsPerContinent;
    const list = sql.raw(`ARRAY[${sample.join(',')}]::int[]`);

    /**
     * ⚠️ Tehdit KOMŞU DİYARLARI da kapsıyor (§13.6.3 C): yalnız diyarın kendisine bakmak,
     * "yan diyarda bir dev var" durumunu görmezden gelirdi ve sefer süreleri komşu diyarı
     * zaten ulaşılabilir kılıyor.
     * ⚠️ Persentil `percentile_cont` ile: ortalama, tek bir devi kalabalığın içinde eritir.
     */
    const rows = await db.execute<Record<string, unknown>>(sql`
      WITH cand AS (SELECT unnest(${list}) AS g),
      city AS (
        SELECT (c.k - 1) * ${per} + c.d AS g, c.is_capital, c.player_id
          FROM cities c WHERE c.world_id = ${worldId}
      )
      SELECT cand.g,
             COALESCE((SELECT COUNT(*)::int FROM city WHERE city.g = cand.g), 0) AS cities,
             COALESCE((SELECT COUNT(*)::int FROM city WHERE city.g = cand.g AND city.is_capital), 0) AS capitals,
             COALESCE((
               SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY p.score)
                 FROM city JOIN players p ON p.id = city.player_id
                WHERE city.g BETWEEN cand.g - 1 AND cand.g + 1
             ), 0) AS threat
        FROM cand
    `);
    return rows.map((r) => ({
      g: Number(r['g']),
      cities: Number(r['cities'] ?? 0),
      capitals: Number(r['capitals'] ?? 0),
      threat: Number(r['threat'] ?? 0),
    }));
  }

  /**
   * Tehdit çıpası: son `threatWindowDays` içinde kaydolmuş oyuncuların **medyan** puanı.
   *
   * ⚠️ Tüm dünyanın ortalaması DEĞİL: çıpa "yeni oyuncunun kuşağı" olmalı. Aksi hâlde dünya
   * yaşlandıkça çıpa yükselir ve güç uyumu kendiliğinden işlevsizleşirdi.
   */
  private async threatAnchor(worldId: number, cfg: PlacementConfig, db: Db): Promise<number> {
    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY score), 0) AS med
        FROM players
       WHERE world_id = ${worldId}
         AND created_at >= now() - (${cfg.threatWindowDays} * interval '1 day')
    `);
    return Math.max(0, Number(rows[0]?.['med'] ?? 0));
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
