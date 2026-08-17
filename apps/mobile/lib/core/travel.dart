/// ⭐⭐ MESAFE ve SEFER SÜRESİ — `packages/engine/src/travel.ts`in Dart karşılığı (§13.5).
///
///   D = Δşehir + U·Δdiyar + W·Δkıta                 U = 20, W = 4000  (toplamalı)
///   T = (TABAN + geçiş + K · D^p / (1 + 0,05·Haritacılık)) · (100/v)      tavan 24 saat
///
/// ⚠️⚠️ **Davranış vektörle kilitli**: `packages/contracts/fixtures/travel-vectors.json` hem
/// TS hem Dart testinden okunuyor. Saat portunda (`clock.dart`) olduğu gibi, «tam eşitlik»
/// umut değil kapı — üstelik burada kaçış daha sinsi olurdu: `pow` iki dilde son basamakta
/// ayrışabilir ve ekrandaki süre sunucununkinden bir saniye sapabilir.
///
/// ⚠️ İstemci bu hesabı YALNIZ önizleme için yapar; otorite `execute_at` yazan sunucudur.
///
/// ─ ⛔ WEB'DEN AYRILAN TEK YER: HIZ NEREDEN GELİYOR ───────────────────────────────────────
/// Web'in `armySpeed`i birim hızlarını `UNITS_BY_ID`den, yani derlenmiş katalogdan okuyor.
/// **Dart'ta bu yapılamaz**: katalog Dart'a üretilmiyor çünkü değerleri dünya başına
/// override edilebiliyor (`catalog_model.dart` başlığı). Bu yüzden hızlar dışarıdan, sunucudan
/// gelen katalogdan geçiriliyor. Aynı kural, aynı sonuç, farklı kaynak — ve bu fark bilerek.
library;

import 'dart:math' as math;

/// ⭐ Kahramanın hızı. ⚠️ Sunucuda da düz bir sabit (`packages/catalog` · `HERO_SPEED`) ve
/// dünya ayarlarından geçmiyor — `travel.ts` onu doğrudan import ediyor. Ayarlanabilir hâle
/// gelirse buraya değil, **sunucu yanıtına** taşınmalı.
const int kHeroSpeed = 200;

/// Harita sabitleri.
///
/// ⚠️⚠️ Varsayılanlar burada duruyor ama **istemci onlara güvenmemeli**: panelden dünya başına
/// ayarlanabiliyorlar ve şehir yanıtı (`/cities/:id` → `map`) gerçek değerleri gönderiyor.
/// Varsayılan yalnız alan hiç gelmediğinde devreye giriyor.
class MwMapConfig {
  const MwMapConfig({
    this.districtWeight = 20,
    this.continentWeight = 4000,
    this.k = 1200,
    this.p = 0.42,
    this.baseSeconds = 1200,
    this.districtCrossSeconds = 0,
    this.continentCrossSeconds = 0,
    this.capHours = 24,
    this.cartographyStep = 0.05,
  });

  /// Bir diyar farkının kaç «şehir» ettiği.
  final num districtWeight;

  /// Bir kıta farkının kaç «şehir» ettiği.
  final num continentWeight;

  /// Yol terimi katsayısı.
  final num k;

  /// Mesafe sıkıştırma üssü.
  final num p;

  /// Taban süre (sn), hız 100 için. ⚠️ Casus kuşun AYRI tabanı yok; farkı hızı yaratıyor.
  final num baseSeconds;

  /// Diyar/kıta değiştiren sefere eklenen süre. ⚠️ Haritacılık bunları KISALTMAZ.
  final num districtCrossSeconds;
  final num continentCrossSeconds;

  /// Süre tavanı (saat).
  final num capHours;

  /// Haritacılık seviye başına hız kazancı.
  final num cartographyStep;

  static const MwMapConfig defaults = MwMapConfig();

  /// Sunucudan gelen kısmi override'ı varsayılanla birleştirir (`mergeMapConfig` deseni).
  ///
  /// ⚠️ Alan alan okunuyor, toptan değil: sunucu yeni bir alan eklerse eski istemci onu
  /// görmezden gelir ve **çökmez**; eksik bırakırsa varsayılana düşer.
  static MwMapConfig fromJson(Object? raw) {
    if (raw is! Map) return defaults;
    num at(String key, num fallback) {
      final v = raw[key];
      return v is num ? v : fallback;
    }

    const d = defaults;
    return MwMapConfig(
      districtWeight: at('districtWeight', d.districtWeight),
      continentWeight: at('continentWeight', d.continentWeight),
      k: at('k', d.k),
      p: at('p', d.p),
      baseSeconds: at('baseSeconds', d.baseSeconds),
      districtCrossSeconds: at('districtCrossSeconds', d.districtCrossSeconds),
      continentCrossSeconds: at(
        'continentCrossSeconds',
        d.continentCrossSeconds,
      ),
      capHours: at('capHours', d.capHours),
      cartographyStep: at('cartographyStep', d.cartographyStep),
    );
  }
}

typedef MwCoordinates = ({int k, int d, int s});

/// Kademeli/toplamalı mesafe. **Öklid DEĞİL**: her koordinat basamağındaki fark süreye mutlaka
/// yansımalı, yoksa «1 kıta + 200 diyar» ile «1 kıta» aynı süreye inerdi (§13.5.1).
num distance(
  MwCoordinates a,
  MwCoordinates b, [
  MwMapConfig cfg = MwMapConfig.defaults,
]) =>
    (a.s - b.s).abs() +
    cfg.districtWeight * (a.d - b.d).abs() +
    cfg.continentWeight * (a.k - b.k).abs();

typedef MwRoute = ({num distance, bool crossesDistrict, bool crossesContinent});

/// Mesafe + geçiş bayrakları tek çağrıda.
///
/// ⚠️ Bayrakları çağıranın kendisi (`a.d != b.d`) hesaplamıyor: sunucuda dört ayrı çağrı
/// noktası var ve birinde unutulursa **önizleme ile gerçek varış anı sessizce ayrışır**.
MwRoute route(
  MwCoordinates a,
  MwCoordinates b, [
  MwMapConfig cfg = MwMapConfig.defaults,
]) => (
  distance: distance(a, b, cfg),
  crossesDistrict: a.d != b.d,
  crossesContinent: a.k != b.k,
);

/// Ordunun hızı = **en yavaş üyenin** hızı. Hesaplanamıyorsa `null`.
///
/// ⭐⭐ **KAHRAMAN DA ÜYEDİR.** Kural bir süre *"kahraman orduyu hızlandırmaz, hesaba hiç
/// girmez"* diye yazılıydı ve pratikte doğru sonuç veriyordu — kahramanın 200'ü her savaşçıdan
/// (80-160) hızlıydı, yani en yavaş hiç o olmuyordu. **Casus Kuş'un 6000'i varsayımı kırdı**:
/// «9 kuş + 1 kahraman» ordusu önizlemede 52 saniyede varıyor göründü. Doğrusu 200 — kuş
/// kahramanı bekler. Kural değişmedi, eksik olan **yavaşlatır** tarafıydı.
///
/// ⚠️ Hız çözümü **dışarıdan** (`speedOf`): katalog Dart'a üretilmiyor, gerekçe dosya başlığında.
/// ⚠️ Bilinmeyen id ya da yürüyemeyen birim (hız ≤ 0) → `null`. Çağıran bunu doğrulama hatası
/// sayar; sessizce 0 kabul etmek sonsuz süre üretirdi.
int? armySpeed(
  Map<String, int> counts,
  int? Function(String id) speedOf, {
  int heroCount = 0,
}) {
  int? enYavas;
  for (final e in counts.entries) {
    if (e.value <= 0) continue;
    final s = speedOf(e.key) ?? 0;
    if (s <= 0) return null;
    if (enYavas == null || s < enYavas) enYavas = s;
  }
  if (heroCount > 0 && (enYavas == null || kHeroSpeed < enYavas)) {
    enYavas = kHeroSpeed;
  }
  return enYavas;
}

/// Sefer süresi (saniye, yukarı yuvarlanmış).
///
/// Dönüş bacağı da AYNI süredir; **görev tipi süreyi değiştirmez** (saldırı = destek = nakliye
/// = casus). ⚠️ Tipe bakan tek bir dal bile yok: casus seferi de buradan geçer ve farkını
/// yalnız Casus Kuş'un hızından alır. Tipe özel bir sabit eklemek, katalogdaki hız sütununu
/// yeniden anlamsızlaştırırdı.
///
/// ⚠️ **Haritacılık YALNIZ yol terimini kısaltır** (taban ve geçiş hariç, §13.5.3). Baskın-
/// savunma dengesinin ayar vidası budur; her şeyi bölseydi Haritacılık 15'te komşu baskını
/// 23 dakikaya inerdi.
int travelSeconds({
  required num distance,
  required num speed,
  num cartography = 0,
  bool crossesDistrict = false,
  bool crossesContinent = false,
  num speedMultiplier = 1,
  MwMapConfig cfg = MwMapConfig.defaults,
}) {
  final v = math.max(1, speed);
  final haritacilik = 1 + cfg.cartographyStep * math.max(0, cartography);
  final yol = cfg.k * math.pow(math.max(0, distance), cfg.p) / haritacilik;
  final gecis =
      (crossesDistrict ? cfg.districtCrossSeconds : 0) +
      (crossesContinent ? cfg.continentCrossSeconds : 0);
  // ⭐ Taban ve geçiş de `100/v` ile ölçekleniyor → süre baştan sona hıza orantılı.
  final toplam = (cfg.baseSeconds + gecis + yol) * (100 / v);
  final kelepce = math.min(toplam, cfg.capHours * 3600);
  // Hızlı dünya seçeneği süreyi böler; tavan da aynı oranda iner (§13.5.6).
  return math.max(1, (kelepce / math.max(0.01, speedMultiplier)).ceil());
}
