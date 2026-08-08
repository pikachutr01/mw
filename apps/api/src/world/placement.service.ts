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
 *   1. **Açık cephe** (§13.6.2): `[1..N]` ÖNEKİ — bu yüzden eski diyarlar daima aday kalır ve
 *      "geriye dönüp serpiştirme" ayrı bir mekanizma gerektirmez.
 *   2. **Örneklem**: açık bölgeden rastgele ~60 diyar. Tüm bölgeyi puanlamak 5.000 satır
 *      okumak demekti; örneklem hem O(1) maliyet hem kümelenme kırıcı.
 *   3. **Skor** `A × B × C` (§13.6.3):
 *        A = (1 − doluluk)^1,5            → boş diyar tercihi
 *        B = exp(−(komşu − ideal)² / 2σ²) → KOMŞULUK: ideal 1 komşu
 *        C = max(taban, 1/(1 + (tehdit/çıpa)^1,5)) → GÜÇ UYUMU: kendi kuşağının yanına
 *   4. **Ağırlıklı rastgele** seçim — deterministik "en iyi" DEĞİL, yoksa aynı anda kaydolan
 *      herkes aynı diyara giderdi.
 *   5. Diyar seçilince içindeki boş şehir yerlerinden biri (yine rastgele).
 *
 * ⚠️ **Tohumlu** (`hash(worldSeed, accountId)`): aynı hesap aynı dünyada hep aynı sonucu
 * verir → hata ayıklanabilir ve denetlenebilir. `Math.random()` kullansaydık "bu oyuncu
 * neden buraya düştü" sorusu asla cevaplanamazdı.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * ⭐⭐ 2026-08-08 ONARIMI — algoritma canlıda TERS çalışıyordu (kullanıcı bildirdi)
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * Şikâyet: *"kayıt olan herkes ilk 7 diyara doluşmuş; bazı diyarda 5 başkent, bazısında 1.
 * Bir sürü boş diyar varken 5. başkentin 4 başkentli diyara düşmesi çok çok düşük ihtimal
 * olmalı."* Canlı veriyle (23 başkent, 34 şehir) skor bileşenleri birebir yeniden hesaplandı:
 *
 * | g | başkent | şehir | A     | B     | C        | ağırlık   |
 * |---|---------|-------|-------|-------|----------|-----------|
 * | 1 | **5**   | 5     | 0,354 | 0,044 | 3,1e-3   | **4,9e-5**| ← EN YÜKSEK
 * | 4 | 1       | 1     | 0,854 | 0,707 | 1,6e-5   | 9,6e-6    |
 * | 8 | 0       | 0     | 1,000 | 0,249 | 1,2e-5   | 3,0e-6    |
 * | 9+| 0       | 0     | 1,000 | 0,249 | 1,0      | **0,249** | ← ama ADAY DEĞİL
 *
 * **Üç bağımsız arıza vardı:**
 *
 * 1. ⚠️ **Cephe 8 diyarda kilitliydi.** `ceil(24/(0,6×5)) = 8`, taban da 8 → açık bölge tam
 *    olarak `[1..8]`. 9. diyar ağırlık tablosunun tepesinde ama **örnekleme hiç girmiyordu**.
 *    Cephe oyuncu başına 1/3 diyar büyüdüğü için nüfusu asla geçemiyordu: "yeni diyar açma"
 *    diye bir olay pratikte gerçekleşmiyordu.
 *
 * 2. ⚠️⚠️ **Tehdit çıpası çöktü, C diktatör oldu.** Çıpa = son 14 günün MEDYAN puanı = **7**
 *    (23 oyuncunun 9'u sıfır puanlı). Tehdit = komşuluğun 75. persentili = binler. Oran ~1600,
 *    üssü 1,5 → C **1e-5** mertebesine iniyor. Yumuşak bir tercih olması gereken çarpan, beş
 *    büyüklük mertebesiyle A ve B'yi tamamen bastırıyordu.
 *    ⭐ Ve etkisi tasarımın **tersineydi**: g=1'i kayırıyordu, çünkü g=1'in komşuluğunda güçlü
 *    oyuncu yok — g=1'in komşuluğu zayıf, çünkü bütün yeni oyuncular oraya yığılmıştı.
 *    Kendi kendini besleyen döngü: son üç kayıt (Sauron · SAVARONA · ShoWTiMe) **üçü de**
 *    g=1'e düştü ve diyarı 2 başkentten 5'e çıkardı.
 *    ⚠️ §13.6.3 zaten *"tehdit_ref … taban değerle korunur"* diyordu; **taban hiç yazılmamıştı.**
 *
 * 3. ⚠️ **Kota yalnız başkent sayıyordu.** g=3'te 9 şehir / 10 yer ve 6 farklı oyuncu vardı,
 *    başkent 4 olduğu için hâlâ adaydı. Kullanıcının ikinci isteği tam da buydu.
 *
 * ─ Neden testler yakalamadı ───────────────────────────────────────────────────────────────
 * ⚠️⚠️ `placement.test.ts`'in dağılım testleri her oyuncuyu **`score = 0`** ile yaratıyordu.
 * O zaman çıpa 0 olur, kodun `anchor <= 0 ? 1 : …` koruması devreye girer ve **C her adayda
 * 1 çıkar** — yani 200 kayıtlık test C'yi hiç çalıştırmamış. C'yi sınayan tek test ise iki
 * oyuncu kullanıyordu (5.000.000 ve 0 → çıpa 2,5M), yani sağlıklı ölçekteydi. Arızanın
 * yaşadığı bölge (çıpa≈0, tehdit≫0) test takımından **yapısal olarak erişilemezdi.**
 *
 * ─ Onarım ─────────────────────────────────────────────────────────────────────────────────
 * **K1. Kalabalık ölçüsü artık "diyardaki FARKLI oyuncu sayısı"** (koloni de sayılır, yoldaki
 *      şehir kurma görevi de). Hem sert kota (`neighborQuota`) hem B çarpanı bunu kullanır.
 *      Kullanıcı: *"başkent olmasa bile başka oyuncuların şehirleri varsa oraya başkent
 *      atanmamalı, çok kalabalık yapıyorlar."*
 * **K2. Kota = TAVAN, hedef değil.** `neighborIdeal` 2 → **1**, `neighborSigma` 1,2 → **0,9**.
 *      Ağırlıklar: boş 0,54 · 1 komşu **0,85** · 2 → 0,39 · 3 → 0,050 · 4 → **0,0027**.
 *      Boş diyar / 4 komşulu diyar oranı 2,1 katken **200 kat** oldu — istenen "çok çok düşük
 *      ihtimal" bu. ⭐ Tasarımın özü korunuyor: **tek komşulu diyar hâlâ en cazip aday**, yani
 *      kimse ıssız çölde yalnız kalmıyor; yalnızca doyma noktası 2-4'ten 1-2'ye indi.
 * **K3. C'nin dinamik aralığı iki taraftan bağlandı:** çıpa `minThreatAnchor` ile tabanlanır
 *      (§13.6.3'ün istediği taban) ve C'nin kendisi `threatFloor` altına inemez. Artık en fazla
 *      ~7 kat cezalandırır → belgelenmiş rolüne, *"yumuşak ağırlık, sert dışlama değil"*e döner.
 * **K4. Cephede BOŞ DİYAR REZERVİ.** Açık bölge yalnız nüfusla değil, "dolu diyar sayısı +
 *      `emptyReserve`" ile de büyür. Kullanıcının değişmezi — *"bir sürü boş diyar varken"* —
 *      artık bir yan etki değil, doğrudan yazılmış bir garanti.
 * **K5. Örneklem tümüyle elenirse** önce **ilk tamamen boş diyar** denenir; `firstFreeSlot`
 *      (eski sıralı doldurma) yalnızca o da yoksa çalışır.
 */
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Db } from '../db/client.ts';
import { liveNumberFor } from '../settings/live.ts';
import { TOTAL_DISTRICTS, WORLD_SHAPE, districtAt, districtIndex } from './world-shape.ts';

export interface Coords { k: number; d: number; s: number }

/** Panelden ayarlanabilen yerleşim sabitleri (§13.6.5: *"tüm sabitler world_config'te"*). */
export interface PlacementConfig {
  /** Diyar başına OTOMATİK yerleştirilebilecek en fazla başkent. Koloniler bu kotaya girmez. */
  capitalQuota: number;
  /**
   * ⭐ Diyarda şehri (başkent VEYA koloni) bulunan en fazla FARKLI oyuncu — bu sayıya ulaşan
   * diyara yeni başkent atanmaz. `capitalQuota`dan farkı: koloniler de sayılır (2026-08-08).
   */
  neighborQuota: number;
  /** Açık cephenin hedef doluluğu — cephe diyarı başına ortalama `bu × capitalQuota` başkent. */
  targetOccupancy: number;
  /** Dünya bomboşken bile açık tutulacak en az diyar sayısı. */
  minOpenDistricts: number;
  /** ⭐ Cephede her zaman bulunması garanti edilen BOŞ diyar sayısı (2026-08-08). */
  emptyReserve: number;
  /** Skorlanacak aday sayısı. */
  sampleSize: number;
  /** Gauss komşuluk tercihinin tepe noktası (kaç KOMŞULU diyar ideal). */
  neighborIdeal: number;
  /** Gauss'un genişliği; büyütmek tercihi düzleştirir. */
  neighborSigma: number;
  /** Boşluk tercihinin üssü — büyütmek boş diyarları daha çok kayırır. */
  emptinessExponent: number;
  /** Güç uyumunun üssü. 0 = güç uyumu kapalı. */
  threatExponent: number;
  /** Tehdit çıpası: son kaç günde kaydolanların medyan puanı baz alınır. */
  threatWindowDays: number;
  /** ⭐ Çıpanın tabanı — medyan bunun altındaysa bu kullanılır (§13.6.3 "taban değerle korunur"). */
  minThreatAnchor: number;
  /** ⭐ Güç uyumunun inebileceği en düşük değer: C'nin A ve B'yi bastırmasını engeller. */
  threatFloor: number;
}

/**
 * ⚠️⚠️ **`worldId` ŞART, ve 2026-08-08'e kadar YOKTU.** Ayarlar `liveNumber` ile yalnız dünya 0
 * katmanından okunuyordu; panel ise `worldId: 1`'e yazıyor. Yani bu on üç düğmenin hiçbiri
 * panelden gerçekten çevrilemiyordu — kaydediliyor, görünüyor, hiçbir şey değişmiyordu.
 * Arıza `combat.attackScoreRatio`ta yakalandı (kullanıcı bildirdi); aynı köprüyü kullanan
 * yerleşim ayarları da aynı kör noktadaydı. Gerekçenin tamamı `settings/live.ts`te.
 *
 * ⚠️ `worldId` isteğe bağlı DEĞİL: varsayılan verseydik çağrı noktalarının hangisinin dünyayı
 * geçmeyi unuttuğu görünmez olurdu — hatanın tam da bu sınıfı yeniden doğardı.
 */
export function placementConfig(worldId: number): PlacementConfig {
  const n = (key: string, fallback: number): number =>
    liveNumberFor(worldId, 'placement', key, fallback);
  return {
    capitalQuota: n('capitalQuota', 5),
    neighborQuota: n('neighborQuota', 5),
    targetOccupancy: n('targetOccupancy', 0.3),
    minOpenDistricts: n('minOpenDistricts', 16),
    emptyReserve: n('emptyReserve', 12),
    sampleSize: n('sampleSize', 60),
    neighborIdeal: n('neighborIdeal', 1),
    neighborSigma: n('neighborSigma', 0.9),
    emptinessExponent: n('emptinessExponent', 1.5),
    threatExponent: n('threatExponent', 1.5),
    threatWindowDays: n('threatWindowDays', 14),
    minThreatAnchor: n('minThreatAnchor', 250),
    threatFloor: n('threatFloor', 0.15),
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
  /** ⭐ Diyarda şehri olan FARKLI oyuncu sayısı — kalabalık ölçüsü: `neighborQuota` ve B bundan. */
  players: number;
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
    const cfg = placementConfig(worldId);
    const next = rng(seedOf(worldId, accountId) + attempt * 7919);

    const open = await this.openFrontier(worldId, cfg, db);
    const sample = this.sampleDistricts(open, cfg.sampleSize, next);
    const rows = await this.describeDistricts(worldId, sample, db);

    /**
     * ⚠️ Sert filtre: kotası dolmuş ya da hiç boş yeri kalmamış diyar elenir. Yumuşak
     * ağırlıkla halledilmez — kota bir SINIR, tercih değil.
     *
     * ⭐ `players` filtresi 2026-08-08'de eklendi (kullanıcı isteği): bir diyarda başka
     * oyuncuların KOLONİLERİ varsa orası da kalabalıktır. Öncesinde yalnız `capitals`
     * bakılıyordu ve 9 şehirli / 6 oyunculu bir diyar hâlâ aday sayılıyordu.
     */
    const eligible = rows.filter(
      (r) => r.capitals < cfg.capitalQuota
        && r.players < cfg.neighborQuota
        && r.cities < WORLD_SHAPE.citiesPerDistrict,
    );

    /**
     * Örneklemin tamamı elendiyse **önce ilk tamamen boş diyarı** dene (§K5). Örneklem
     * cephenin rastgele 60 diyarı olduğu için rezervdeki boşları ıskalamış olabilir; o
     * durumda eski sıralı doldurmaya düşmek, tam da şikâyet edilen 1:1:x davranışını
     * geri getirirdi.
     */
    if (eligible.length === 0) {
      return (await this.firstOpenDistrict(worldId, next, db)) ?? this.firstFreeSlot(worldId, db);
    }

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
   *
   * ⚠️⚠️ Ama çarpımın bedeli şu: bir çarpanın ölçeği kaçarsa **diğer ikisini yok eder**.
   * Canlıda tam olarak bu oldu — C 1e-5'e inip A ve B'yi anlamsız kıldı (dosya başındaki
   * onarım notu). Bu yüzden C artık `threatFloor` ile alttan bağlı: veto gücü var ama
   * diktatörlüğü yok.
   */
  private score(r: DistrictRow, cfg: PlacementConfig, anchor: number): number {
    const occupancy = r.cities / WORLD_SHAPE.citiesPerDistrict;
    const A = Math.max(0, 1 - occupancy) ** cfg.emptinessExponent;

    /**
     * ⭐ Gauss'un girdisi `capitals` DEĞİL `players`: kalabalığı yapan şey başkent değil,
     * kaç farklı oyuncuyla yan yana olacağın. Bir oyuncunun 3 kolonisi tek komşudur;
     * 3 farklı oyuncunun birer kolonisi üç komşudur.
     */
    const sigma = Math.max(0.1, cfg.neighborSigma);
    const B = Math.exp(-((r.players - cfg.neighborIdeal) ** 2) / (2 * sigma * sigma));

    // ⚠️ Çıpa 0 olabilir (taban da 0'a çekilmişse) → güç uyumu o zaman nötr.
    const C = cfg.threatExponent <= 0 || anchor <= 0
      ? 1
      : Math.max(
        Math.min(1, Math.max(0, cfg.threatFloor)),
        1 / (1 + (r.threat / anchor) ** cfg.threatExponent),
      );

    return A * B * C;
  }

  /**
   * Açık yerleşim cephesi (§13.6.2) — `[1..N]` öneki.
   *
   * ⭐⭐ **İKİ TABAN, ve asıl olan ikincisi** (2026-08-08).
   *
   * Eskiden yalnız nüfus vardı: `ceil((başkent+1) / (hedefDoluluk × kota))`. Bu, cepheyi
   * oyuncu başına 1/3 diyar büyütüyordu — yani cephe nüfusu **asla** geçemiyor, dolayısıyla
   * "yeni diyar aç" diye bir olay pratikte hiç olmuyordu. Canlıda 23 başkent → cephe tam
   * 8 diyar, 9. diyar ağırlık tablosunun tepesinde olmasına rağmen aday bile değildi.
   *
   * ⭐ İkinci taban bunu doğrudan yazıyor: **dolu diyar sayısı + `emptyReserve`**. Böylece
   * cephede her zaman en az `emptyReserve` kadar bomboş diyar bulunur — kullanıcının
   * *"bir sürü boş diyar varken"* değişmezi artık bir yan etki değil, garanti.
   *
   * ⚠️ Dolu diyar sayımı `cities` UNION `found_city` üzerinden: yolda bir koloni varsa o diyar
   * boş sayılmaz, yoksa rezerv olduğundan büyük görünürdü.
   * ⚠️ Sayım cephenin İÇİNDEKİ dolu diyarları değil TÜMÜNÜ sayar (koloniler cephe dışına da
   * kurulabiliyor — canlıda 1:28:5 var). Bu yönde hata güvenli: cepheyi yalnız genişletir.
   */
  private async openFrontier(worldId: number, cfg: PlacementConfig, db: Db): Promise<number> {
    const per = WORLD_SHAPE.districtsPerContinent;
    const rows = await db.execute<Record<string, unknown>>(sql`
      WITH occ AS (
        SELECT (k - 1) * ${per} + d AS g, is_capital
          FROM cities WHERE world_id = ${worldId}
        UNION ALL
        SELECT (target_k - 1) * ${per} + target_d AS g, false AS is_capital
          FROM missions
         WHERE world_id = ${worldId} AND type = 'found_city'
           AND status IN ('scheduled', 'running')
           AND target_k IS NOT NULL AND target_d IS NOT NULL
      )
      SELECT COUNT(*) FILTER (WHERE is_capital)::int AS capitals,
             COUNT(DISTINCT g)::int                  AS districts
        FROM occ
    `);
    const capitals = Number(rows[0]?.['capitals'] ?? 0);
    const districts = Number(rows[0]?.['districts'] ?? 0);

    const perDistrict = Math.max(0.5, cfg.targetOccupancy * cfg.capitalQuota);
    const byPopulation = Math.ceil((capitals + 1) / perDistrict);
    const byReserve = districts + Math.max(0, Math.round(cfg.emptyReserve));

    const want = Math.max(cfg.minOpenDistricts, byPopulation, byReserve);
    return Math.min(TOTAL_DISTRICTS, Math.max(1, want));
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
     *
     * ⭐ `city` artık yalnız kurulmuş şehirler değil, **yoldaki `found_city` hedefleri** de
     * (2026-08-08). `freeSlotIn` ve `firstFreeSlot` bu kuralı zaten uyguluyordu; kalabalık
     * sayımının onlardan farklı davranması, aynı sınıftan sessiz bir tutarsızlık olurdu.
     */
    const rows = await db.execute<Record<string, unknown>>(sql`
      WITH cand AS (SELECT unnest(${list}) AS g),
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
             COALESCE((SELECT COUNT(DISTINCT city.player_id)::int FROM city WHERE city.g = cand.g), 0) AS players,
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
      players: Number(r['players'] ?? 0),
      threat: Number(r['threat'] ?? 0),
    }));
  }

  /**
   * Tehdit çıpası: son `threatWindowDays` içinde kaydolmuş oyuncuların **medyan** puanı.
   *
   * ⚠️ Tüm dünyanın ortalaması DEĞİL: çıpa "yeni oyuncunun kuşağı" olmalı. Aksi hâlde dünya
   * yaşlandıkça çıpa yükselir ve güç uyumu kendiliğinden işlevsizleşirdi.
   *
   * ⚠️⚠️ **TABAN ŞART** (2026-08-08). §13.6.3 bunu *"taban değerle korunur"* diye yazmıştı ama
   * kodda `Math.max(0, …)` vardı — yani taban yoktu. Yeni bir dünyada oyuncuların çoğu sıfır
   * puanlı olur ve **medyan 0'a yapışır**; canlıda 23 oyuncunun 9'u sıfırdı ve çıpa **7**
   * çıkıyordu. Tehdit binler mertebesindeyken bu, C'yi 1e-5'e indirip A ve B'yi anlamsız
   * kılıyordu. Taban, oranı "gerçek bir güç farkı" ölçmeye zorluyor: çıpanın altındaki her
   * puan aynı derecede zayıf sayılır.
   */
  private async threatAnchor(worldId: number, cfg: PlacementConfig, db: Db): Promise<number> {
    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY score), 0) AS med
        FROM players
       WHERE world_id = ${worldId}
         AND created_at >= now() - (${cfg.threatWindowDays} * interval '1 day')
    `);
    const median = Math.max(0, Number(rows[0]?.['med'] ?? 0));
    return Math.max(median, Math.max(0, cfg.minThreatAnchor));
  }

  /**
   * ⭐ Cephedeki ilk **tamamen boş** diyarın rastgele bir şehir yeri (2026-08-08).
   *
   * `pickCapital`in örneklemi tümüyle elendiğinde devreye girer. Öncesinde doğrudan
   * `firstFreeSlot`a düşülüyordu ve o, tanımı gereği **eski sıralı doldurma** davranışı —
   * yani şikâyetin ta kendisi olan 1:1:x. Boş bir diyar varken oraya gitmemek için hiçbir
   * sebep yok; `firstFreeSlot` gerçekten hiç boş diyar kalmadığında anlamlı.
   *
   * ⚠️ Takma ad `gs`: çıplak `g`, korelasyonlu alt sorguda `occ.g` sütununa çözülürdü
   * (`freeSlotIn`de aynı tuzağa bir kez düşülmüştü).
   */
  private async firstOpenDistrict(
    worldId: number, next: () => number, db: Db,
  ): Promise<Coords | null> {
    const per = WORLD_SHAPE.districtsPerContinent;
    const rows = await db.execute<Record<string, unknown>>(sql`
      WITH occ AS (
        SELECT DISTINCT (k - 1) * ${per} + d AS g FROM cities WHERE world_id = ${worldId}
        UNION
        SELECT DISTINCT (target_k - 1) * ${per} + target_d AS g
          FROM missions
         WHERE world_id = ${worldId} AND type = 'found_city'
           AND status IN ('scheduled', 'running')
           AND target_k IS NOT NULL AND target_d IS NOT NULL
      )
      SELECT MIN(gs)::int AS g
        FROM generate_series(1, ${TOTAL_DISTRICTS}) AS gs
       WHERE NOT EXISTS (SELECT 1 FROM occ WHERE occ.g = gs)
    `);
    const g = rows[0]?.['g'];
    if (g == null) return null;
    const { k, d } = districtAt(Number(g));
    return { k, d, s: Math.floor(next() * WORLD_SHAPE.citiesPerDistrict) + 1 };
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
