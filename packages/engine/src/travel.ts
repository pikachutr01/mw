/**
 * ⭐ MESAFE ve SEFER SÜRESİ (SİSTEM PLANI §13.5)
 *
 * Referans uygulama `harita.html`; buradaki formüller onunla BİREBİR aynıdır (§13.5.5 cetveli
 * bu koddan da çıkar). Motor gibi bu modül de SAF: DB, zaman, IO bilmez.
 *
 *   D = Δşehir + U·Δdiyar + W·Δkıta                 U = 20, W = 4000  (Manhattan/toplamalı)
 *   T = (TABAN + geçiş + K · D^p / (1 + 0,05·Haritacılık)) · (100/v)      tavan 24 saat
 *
 * ⭐⭐ **HER ŞEY HIZLA ORANTILI** (kullanıcı kararı, 2026-08-03). Taban da `100/v` ile bölünür ve
 * casus kuşun **ayrı tabanı yoktur** — kuşun 6000 hızı farkı kendisi yaratır. Eski hâlde taban
 * hızdan bağımsızdı (ordu 600 sn / casus 120 sn) ve sonuç şuydu: 60 kat hızlı olan kuş komşu
 * şehre 2 dk 10 sn'de, ordu 20 dk'da gidiyordu — yani **hız birimi yok sayılıyordu**. Artık
 * kuşun süresi ordununkinin tam 1/60'ı.
 *
 * ⚠️ **Haritacılık YALNIZ yol terimini kısaltır** (taban ve geçiş ek süresi hariç, §13.5.3).
 * Baskın–savunma dengesinin ayar vidası budur: her şeyi bölseydi Haritacılık 15'te komşu
 * baskını 23 dakikaya inerdi ve erken oyundaki "hızlı yağma → hızlı gelişme" sarmalı geri
 * gelirdi (kullanıcı bu seçeneği bilerek almadı).
 *
 * İstemci aynı fonksiyonu YALNIZ önizleme için kullanır; otorite `execute_at` yazan sunucudur.
 */
import { HERO_SPEED, SPEED_EXEMPT_WHEN_ESCORTED, UNITS_BY_ID } from '@mobilwar/catalog';

export interface Coordinates {
  /** kıta */
  k: number;
  /** diyar */
  d: number;
  /** şehir yeri */
  s: number;
}

export interface MapConfig {
  /** Bir diyar farkının kaç "şehir" ettiği. */
  districtWeight: number;
  /** Bir kıta farkının kaç "şehir" ettiği (1 kıta = 200 diyar). */
  continentWeight: number;
  /** Yol terimi katsayısı. */
  k: number;
  /** Mesafe sıkıştırma üssü: mesafe 100× artınca süre ~7× artar. */
  p: number;
  /**
   * Taban süre (sn) — "orduyu toplayıp yola çıkarmak", hız 100 için.
   * ⚠️ Tek taban: casus kuşun ayrı tabanı YOK, hızı farkı kendisi yaratıyor.
   */
  baseSeconds: number;
  /** Diyar değiştiren sefere eklenen süre (sn, hız 100 için). Haritacılık kısaltmaz. */
  districtCrossSeconds: number;
  /** Kıta değiştiren sefere eklenen süre (sn, hız 100 için). Haritacılık kısaltmaz. */
  continentCrossSeconds: number;
  /** Süre tavanı (sa) — zıt köşe bile bunu aşmaz. */
  capHours: number;
  /** Haritacılık seviye başına hız kazancı. */
  cartographyStep: number;
  /**
   * ⭐⭐ YÜK ARABASI KAFİLEYİ YAVAŞLATMASIN (kullanıcı, 2026-08-21) — dünya ayarı.
   *
   * Açıkken (**varsayılan**) `SPEED_EXEMPT_WHEN_ESCORTED` birimleri, orduda başka yürüyen
   * birim varken en-yavaş hesabına girmiyor: araba kafilenin hızına ayak uyduruyor.
   * Kapalıyken davranış 2026-08-21 öncesiyle **bit-bit aynı**: arabanın 140 hızı da hesaba
   * giriyor ve bir ejderha ordusunu (160) 140'a çekiyor.
   *
   * ⚠️ Muafiyet **refakat şartlı**: araba yalnız başına gönderildiğinde (nakliye · destek ·
   * şehir kurma) yine kendi hızıyla yürüyor — yoksa "hızı olmayan birim" üretirdik.
   * ⚠️ Kahraman refakatçi SAYILMAZ: tek arabayla giden bir kahraman, arabayı kendi hızına
   * (200) çekseydi araba fiziksel olarak imkânsız bir hızda ilerlemiş olurdu.
   */
  cargoIgnoresSpeed: boolean;
}

/**
 * ⚠️ Sayılar 2026-08-03'te **iki katına** çıktı: komşu şehre sefer 20 dk'ydı ve kullanıcı bunu
 * erken oyunda *"hızlı yağma → hızlı gelişme"* sarmalı olarak gördü. Hedef 35-45 dk, seçilen
 * **40 dk**. Komşu şehirde `D=1` ve `1^p = 1` olduğu için mesafe terimi hiç iş yapmaz —
 * 40 dakikayı belirleyen tek şey `baseSeconds + k`. `p` yalnız uzağı şekillendirir ve
 * 0,46 → 0,42'ye indi ki K iki katına çıkınca kıtalar arası süreler tavana yapışmasın.
 */
export const DEFAULT_MAP_CONFIG: MapConfig = {
  districtWeight: 20,
  continentWeight: 4000,
  k: 1200,
  p: 0.42,
  baseSeconds: 1200,
  // ⚠️ Varsayılan 0 — bugün geçişin ek bir bedeli YOK. Kullanıcı bunu ileride açmak için
  //    ayarlanabilir istedi; sıfır bırakıldığı sürece cetvel yalnız `baseSeconds + k`'dan çıkar.
  districtCrossSeconds: 0,
  continentCrossSeconds: 0,
  capHours: 24,
  cartographyStep: 0.05,
  // ⭐ Varsayılan AÇIK (kullanıcı kararı, 2026-08-21).
  cargoIgnoresSpeed: true,
};

/** Kısmi override'ı varsayılanla birleştirir (`mergeCombatConfig` deseni). */
export function mergeMapConfig(patch?: Partial<MapConfig>): MapConfig {
  return patch ? { ...DEFAULT_MAP_CONFIG, ...patch } : DEFAULT_MAP_CONFIG;
}

/**
 * Kademeli/toplamalı mesafe. **Öklid DEĞİL**: her koordinat basamağındaki fark süreye mutlaka
 * yansır, yoksa "1 kıta + 200 diyar" ile "1 kıta" aynı süreye inerdi (§13.5.1).
 */
export function distance(a: Coordinates, b: Coordinates, cfg: MapConfig = DEFAULT_MAP_CONFIG): number {
  return Math.abs(a.s - b.s)
    + cfg.districtWeight * Math.abs(a.d - b.d)
    + cfg.continentWeight * Math.abs(a.k - b.k);
}

/**
 * Mesafe + geçiş bayrakları tek çağrıda.
 *
 * ⚠️ Bayrakları her çağıranın kendisi (`a.d !== b.d`) hesaplamasındansa burada üretiliyor:
 * dört ayrı çağrı noktası var (saldırı · yürüyüş · kahraman dönüşü · istemci önizlemesi) ve
 * birinde unutulursa **önizleme ile gerçek varış anı sessizce ayrışır**.
 */
export function route(a: Coordinates, b: Coordinates, cfg: MapConfig = DEFAULT_MAP_CONFIG): {
  distance: number; crossesDistrict: boolean; crossesContinent: boolean;
} {
  return {
    distance: distance(a, b, cfg),
    crossesDistrict: a.d !== b.d,
    crossesContinent: a.k !== b.k,
  };
}

/**
 * Ordunun hızı = **en yavaş üyenin** hızı.
 *
 * ⭐ **KAHRAMAN DA ÜYEDİR** (kullanıcı, 2026-08-03). Kural bir süre *"kahraman orduyu
 * hızlandırmaz, bu yüzden hesaba hiç girmez"* diye yazılıydı ve pratikte doğru sonuç
 * veriyordu — çünkü kahramanın hızı (200) her savaşçıdan yüksekti (80-160), yani en yavaş
 * hiçbir zaman o olmuyordu.
 *
 * ⚠️ Casus Kuş **6000** hızıyla bu varsayımı kırıyor. Kuş destek görevine katılabilir hâle
 * gelince (aynı gün) "9 kuş + 1 kahraman" ordusu ortaya çıktı ve önizleme **52 saniye**
 * gösterdi: kahraman ışınlanmış gibi. Doğrusu 200, yani kuş kahramanı bekler.
 * Yani kural değişmedi — *"kahraman hızlandırmaz"* hâlâ geçerli; eksik olan **yavaşlatır**
 * tarafıydı ve o zamana kadar hiç gözlemlenememişti.
 *
 * Bilinmeyen birim id'si veya yürüyemeyen (hız 0) birim varsa `null` döner — çağıran bunu
 * doğrulama hatası olarak işler.
 */
export function armySpeed(
  counts: Record<string, number>, heroCount = 0, cfg: MapConfig = DEFAULT_MAP_CONFIG,
): number | null {
  /**
   * ⭐⭐ İKİ ADAY BİRDEN (2026-08-21): tüm birimlerin en yavaşı ve **muaflar hariç** en yavaşı.
   *
   * ⚠️ Tek geçişte ikisini de toplamak şart, çünkü hangisinin kullanılacağı ancak döngü
   * bittiğinde belli oluyor: muaf olmayan hiç birim yoksa (yalnız yük arabası gönderilmiş)
   * muafiyet **düşüyor** ve arabanın kendi hızı geçerli oluyor.
   * ⚠️ Geçersizlik kapısı (`speed <= 0` → `null`) muaf birimler için de işliyor: muafiyet
   * "hızı yok sayılır" demek, "birim geçerlidir" demek değil.
   */
  let slowestAll = Infinity;
  let slowestEscort = Infinity;
  for (const [id, n] of Object.entries(counts)) {
    if (!(n > 0)) continue;
    const speed = UNITS_BY_ID[id]?.speed ?? 0;
    if (speed <= 0) return null;
    if (speed < slowestAll) slowestAll = speed;
    if (SPEED_EXEMPT_WHEN_ESCORTED.has(id)) continue;
    if (speed < slowestEscort) slowestEscort = speed;
  }

  /* Muafiyet YALNIZ refakatçi varken: `slowestEscort` sonsuzsa orduda muaf olmayan birim yok. */
  let slowest = cfg.cargoIgnoresSpeed && Number.isFinite(slowestEscort)
    ? slowestEscort
    : slowestAll;

  if (heroCount > 0 && HERO_SPEED < slowest) slowest = HERO_SPEED;
  return Number.isFinite(slowest) ? slowest : null;
}

export interface TravelInput {
  /** `distance()` çıktısı. */
  distance: number;
  /** Ordunun hızı (`armySpeed()`); casus seferinde casus kuşun hızı. */
  speed: number;
  /** Saldıranın Haritacılık seviyesi. */
  cartography?: number;
  /** Sefer diyar değiştiriyor mu (`districtCrossSeconds` eklenir)? */
  crossesDistrict?: boolean;
  /** Sefer kıta değiştiriyor mu (`continentCrossSeconds` eklenir)? */
  crossesContinent?: boolean;
  /** Dünya hız çarpanı — TÜM süreyi böler (`worlds.speed_multiplier`). */
  speedMultiplier?: number;
}

/**
 * Sefer süresi (saniye, yukarı yuvarlanmış tam sayı).
 *
 * Dönüş bacağı da AYNI süredir; görev tipi süreyi değiştirmez (saldırı = destek = nakliye = casus).
 *
 * ⚠️ Görev tipine bakan tek bir dal bile YOK — casus seferi de bu fonksiyondan geçer ve
 * farkını yalnız Casus Kuş'un hızından (6000) alır. Buraya tipe özel bir sabit eklemek,
 * katalogdaki hız sütununu yeniden anlamsızlaştırır.
 */
export function travelSeconds(input: TravelInput, cfg: MapConfig = DEFAULT_MAP_CONFIG): number {
  const speed = Math.max(1, input.speed);
  const cartographyFactor = 1 + cfg.cartographyStep * Math.max(0, input.cartography ?? 0);
  const road = cfg.k * Math.max(0, input.distance) ** cfg.p / cartographyFactor;
  const cross = (input.crossesDistrict ? cfg.districtCrossSeconds : 0)
    + (input.crossesContinent ? cfg.continentCrossSeconds : 0);
  // ⭐ Taban ve geçiş de `100/v` ile ölçeklenir → süre baştan sona hıza orantılı.
  const total = (cfg.baseSeconds + cross + road) * (100 / speed);
  const capped = Math.min(total, cfg.capHours * 3600);
  // Hızlı dünya seçeneği süreyi böler; tavan da aynı oranda iner (§13.5.6).
  return Math.max(1, Math.ceil(capped / Math.max(0.01, input.speedMultiplier ?? 1)));
}
