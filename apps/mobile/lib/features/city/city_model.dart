/// ŞEHİR DURUMU — `GET /api/v1/cities/:id` yanıtının okunan kısmı.
///
/// ⚠️⚠️ **SÖZLEŞME BORCU** (`MOBIL_MIMARI.md` §4). Bu model elle yazıldı; `contracts.g.dart`a
/// ÜRETİLMEDİ ve bu bilinçli bir karar, ihmal değil:
///
/// Sunucudaki `city.controller.ts` · `get()` kuyruk satırlarını **`...q` yayılımıyla**
/// döndürüyor. Dönüş tipini `z.infer<typeof cityDetail>`e daraltmak DERLENİRDİ ama hiçbir şey
/// ölçmezdi: TypeScript'in fazla-alan denetimi nesne literaline uygulanıyor, **yayılıma
/// uygulanmıyor**. Yani şema "kapsandı" görünür, gerçekte kapsamazdı — sahte bir kapı.
///
/// ⭐ Borcun ödenmesi için ÖNCE `QueueService.openQueues` açık bir şekil döndürmeli. O iş
/// yapılana kadar borç burada, adıyla duruyor.
///
/// ⚠️ Bu dosyada `?? 0` YOK ve olmamalı: "alan yok" ile "alan sıfır" farklı şeyler
/// (`contracts.g.dart` başlığındaki aynı kural). Eksik alan `null` kalır, ekran onu gösterir.
library;

import '../../core/travel.dart';

/// Yalnız ekranın okuduğu alanlar. ⚠️ Tam yanıt çok daha büyük (mağara, sur onarımı, teknik
/// kuyrukları, kapasite…); okunmayan alanı modele koymak, kullanılmadığı için hiç
/// doğrulanmayan bir sözleşme yazmak olurdu.
class CityDetail {
  const CityDetail({
    required this.id,
    required this.name,
    required this.coordinates,
    required this.isCapital,
    required this.gold,
    required this.food,
    required this.goldPerHour,
    required this.foodPerHour,
    required this.onVacation,
    required this.buildings,
    required this.units,
    required this.defenses,
    required this.techs,
    required this.caveUnits,
    required this.caveStoreUnits,
    required this.queues,
    required this.techQueues,
    required this.wallRepair,
    required this.map,
    required this.speed,
    required this.serverNow,
    required this.gameNow,
  });

  final int id;
  final String name;
  final ({int k, int d, int s}) coordinates;
  final bool isCapital;

  final int gold;
  final int food;
  final num goldPerHour;
  final num foodPerHour;

  /// ⭐ Ayrı alan — «0/sa ⇒ tatilde» çıkarımı YANLIŞ olurdu: madeni olmayan yeni bir şehrin
  /// de üretimi 0'dır. Sunucu bu ayrımı bilerek veriyor.
  final bool onVacation;

  final Map<String, int> buildings;
  final Map<String, int> units;

  /// ⚠️ Sur ve Büyü Kalkanı BURADA yaşıyor, `buildings`te değil — ama ön koşullarda bir
  /// **yapı** olarak yazılı. Yalnız `buildings`e bakmak Sur'u daima 0 gösteriyor ve Sur ön
  /// koşullu her savunma birimi kilitli kalıyordu (web'de ve sunucuda aynı hata yaşandı).
  final Map<String, int> defenses;

  /// Teknik seviyeleri — oyuncu geneli, şehre değil.
  final Map<String, int> techs;

  /// ⭐ Mağaradaki birimler. Orijinal Baraka kartında da yazıyor («Mağarada : 0»).
  final Map<String, int> caveUnits;

  /// ⭐⭐ MAĞARAYA SÖZ VERİLMİŞ askerler — sefer formundaki **serbest ordu** hesabı bunu düşüyor.
  ///
  /// Kullanıcının örneği (2026-08-11): 50 Cüce var, 30'u mağaraya işaretli → sefere en çok
  /// 20 Cüce çıkabilir. Askerler hâlâ barakada duruyor ama söz verilmişler ve sunucu
  /// (`reserveUnits`) onlarla sefere çıkmayı reddediyor. Ham sayıyı göstermek, oyuncuya
  /// sunucunun kabul etmeyeceği bir seçim yaptırmak olurdu — tam kaçınmak istediğimiz sürpriz.
  ///
  /// ⚠️ YALNIZ `store` yönü: `withdraw` emrindeki askerler mağaradadır, zaten barakada
  /// görünmezler; onları da düşmek aynı askeri iki kez saymak olurdu.
  final Map<String, int> caveStoreUnits;

  final List<CityQueue> queues;

  /// ⭐⭐ AÇIK TEKNİK ARAŞTIRMALARI — **oyuncunun TÜM şehirlerinden** (2026-08-17).
  ///
  /// ⚠️ `queues` yalnız BU şehrin satırlarını taşıyor; teknikte bu yetmez çünkü Akademiler
  /// ortak: teknik başka bir şehirde araştırılıyorsa burada da düğme kapalı olmalı ve nerede
  /// araştırıldığı yazmalı. Yalnız `queues`e bakan bir Akademi ekranı, aynı tekniği iki
  /// şehirden başlatmaya davet ederdi (sunucu reddeder, oyuncu sebebini anlamaz).
  final List<TechQueue> techQueues;

  /// ⭐ Sur onarımı sürüyorsa penceresi; yoksa `null`. Onarımdaki Sur yükseltilemez.
  final ({num integrity, String? from, String until})? wallRepair;

  /// ⭐⭐ HARİTA SABİTLERİ — sefer süresi önizlemesi bunları `travelSeconds`e veriyor.
  ///
  /// ⚠️ İstemci `MwMapConfig.defaults`a **güvenemez**: sabitler panelden dünya başına
  /// ayarlanabiliyor ve bir sayı değişir değişmez ekranda yazan süre gerçek varış anından
  /// sapardı. Sunucu bu yüzden bunları şehir yanıtında gönderiyor.
  final MwMapConfig map;

  /// ⭐ Dünyanın TEMPOSU — dört ayrı çarpan (`worlds.*_multiplier`).
  ///
  /// ⚠️ `map`in içinde değil: sunucuda da ayrı (`snap.speed`) ve haritanın geometrisiyle
  /// ilgisi yok.
  /// ⚠️ 2026-08-22'ye kadar burada yalnız `travel` vardı; navbar rozeti (web'deki
  /// `SpeedBadge`) dördünü birden gösterdiği için tamamı okunur oldu.
  final MwWorldSpeed speed;

  /// Sefer süresinin TAMAMINI bölen çarpan. ⚠️ Kısayol olarak duruyor: `speed.travel`in
  /// çağıranları bu adla yazılmıştı ve hepsini değiştirmek bu turun işi değildi.
  num get travelSpeedMultiplier => speed.travel;

  /// Kaynak sayacının çıpası (gerçek saat).
  final String serverNow;

  /// Üretim bandının çıpası (oyun saati).
  final String gameNow;

  /// ⭐ Ön koşullarda geçen "yapı" seviyeleri: `buildings` + **seviye taşıyan savunma
  /// yapıları**. Gerekçe `defenses` alanının başında; sunucudaki `structureLevels` ile aynı.
  Map<String, int> get structureLevels => {
    ...buildings,
    'wall': defenses['wall'] ?? 0,
    'magic_shield': defenses['magic_shield'] ?? 0,
  };

  static CityDetail fromJson(Map<String, dynamic> j) {
    final c = j['coordinates'] as Map<String, dynamic>;
    final res = j['resources'] as Map<String, dynamic>;
    final pro = j['production'] as Map<String, dynamic>;
    return CityDetail(
      id: (j['id'] as num).toInt(),
      name: j['name'] as String,
      coordinates: (
        k: (c['k'] as num).toInt(),
        d: (c['d'] as num).toInt(),
        s: (c['s'] as num).toInt(),
      ),
      isCapital: j['isCapital'] as bool? ?? false,
      gold: (res['gold'] as num).toInt(),
      food: (res['food'] as num).toInt(),
      goldPerHour: pro['goldPerHour'] as num,
      foodPerHour: pro['foodPerHour'] as num,
      onVacation: j['onVacation'] as bool? ?? false,
      buildings: _counts(j['buildings']),
      units: _counts(j['units']),
      defenses: _counts(j['defenses']),
      techs: _counts(j['techs']),
      caveUnits: _counts((j['cave'] as Map<String, dynamic>?)?['units']),
      caveStoreUnits: _caveStore(j['cave']),
      queues: (j['queues'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(CityQueue.fromJson)
          .toList(),
      techQueues: (j['techQueues'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(TechQueue.fromJson)
          .toList(),
      wallRepair: _wallRepair(j['wallRepair']),
      map: MwMapConfig.fromJson(j['map']),
      // ⚠️ `?? 1` burada anlamlı bir varsayılan, savunma değil: çarpan yoksa dünya normal
      // tempoda demektir. `?? 0` olsaydı süre sonsuza giderdi.
      speed: MwWorldSpeed.fromJson(j['speed']),
      serverNow: j['serverNow'] as String,
      gameNow: j['gameNow'] as String,
    );
  }
}

/// ⭐⭐ DÜNYANIN TEMPOSU — dört çarpan (`worlds.*_multiplier`), web'deki `snap.speed`.
///
/// ⚠️ Varsayılan **1** ve bu anlamlı bir değer, savunma değil: çarpan yoksa dünya normal
/// tempoda demektir. `0` olsaydı süreler sonsuza giderdi.
class MwWorldSpeed {
  const MwWorldSpeed({
    this.resource = 1,
    this.travel = 1,
    this.training = 1,
    this.construction = 1,
  });

  final num resource;
  final num travel;
  final num training;
  final num construction;

  static const MwWorldSpeed normal = MwWorldSpeed();

  static MwWorldSpeed fromJson(Object? raw) {
    if (raw is! Map) return normal;
    num at(String key) {
      final v = raw[key];
      return v is num ? v : 1;
    }

    return MwWorldSpeed(
      resource: at('resource'),
      travel: at('travel'),
      training: at('training'),
      construction: at('construction'),
    );
  }

  /// ⭐⭐ ROZETİN İÇERİĞİ — **yalnız 1'den farklı satırlar** (web'de kullanıcı kararı,
  /// 2026-08-09).
  ///
  /// ⚠️ Eskiden web'de dördü birden çiziliyor, normal olanlar soluk «1x» diye görünüyordu.
  /// Rozetin başlığı zaten «Hızlandırılmış dünya»; altında «Sefer hızı 1x» yazması oyuncuya
  /// hiçbir şey söylemiyor, üstelik gerçekten değişmiş olan satırı gürültüye gömüyordu.
  /// ⚠️ Liste BOŞSA rozetin kendisi de çizilmiyor — dünya klasikse ekranda hiçbir şey yok.
  List<({String label, num value})> get hizlandirilmis => [
    (label: 'Kaynak üretimi', value: resource),
    (label: 'Sefer hızı', value: travel),
    (label: 'Birim üretimi', value: training),
    (label: 'İnşaat/araştırma', value: construction),
  ].where((e) => e.value != 1).toList();
}

/// Başka şehirde de sürebilen teknik araştırması.
///
/// ⚠️ `cityId` ŞART: iptal yalnız araştırmayı BAŞLATAN şehirden yapılabiliyor (kullanıcı
/// kuralı) ve ekran o kararı ancak bu alanla verebilir.
class TechQueue {
  const TechQueue({
    required this.id,
    required this.itemType,
    required this.targetLevel,
    required this.cityId,
    required this.cityName,
    required this.startedAt,
    required this.finishAt,
  });

  final int id;
  final String itemType;
  final int? targetLevel;
  final int cityId;
  final String cityName;
  final String startedAt;
  final String finishAt;

  static TechQueue fromJson(Map<String, dynamic> j) => TechQueue(
    id: (j['id'] as num).toInt(),
    itemType: j['itemType'] as String,
    targetLevel: (j['targetLevel'] as num?)?.toInt(),
    cityId: (j['cityId'] as num).toInt(),
    cityName: j['cityName'] as String? ?? '',
    startedAt: j['startedAt'] as String,
    finishAt: j['finishAt'] as String,
  );
}

/// Mağaraya GİRMEKTE olan askerler; başka her durumda boş.
///
/// ⚠️ Yön denetimi şart: `withdraw` emrindeki askerler mağaranın içinde ve barakada zaten
/// görünmüyorlar. Yönü ayırmadan düşmek, aynı askeri iki kez saymak olurdu.
Map<String, int> _caveStore(Object? cave) {
  if (cave is! Map) return const {};
  final job = cave['job'];
  if (job is! Map || job['direction'] != 'store') return const {};
  return _counts(job['units']);
}

({num integrity, String? from, String until})? _wallRepair(Object? raw) {
  if (raw is! Map) return null;
  final until = raw['until'];
  if (until is! String) return null;
  return (
    integrity: raw['integrity'] as num? ?? 0,
    from: raw['from'] as String?,
    until: until,
  );
}

/// Açık kuyruk satırı — üretim bandının girdisi.
class CityQueue {
  const CityQueue({
    required this.id,
    required this.category,
    required this.itemType,
    required this.targetLevel,
    required this.count,
    required this.startedAt,
    required this.finishAt,
    required this.perUnitSeconds,
    required this.done,
    required this.position,
  });

  final int id;

  /// `building` · `unit` · `defense` · `tech`
  final String category;
  final String itemType;
  final int? targetLevel;
  final int? count;
  final String startedAt;
  final String finishAt;
  final num? perUnitSeconds;

  /// ⭐⭐ SUNUCUNUN **ZATEN SAYDIĞI** ÜRETİM ADEDİ (2026-08-17).
  ///
  /// ⚠️ `city_progress.dart` `done`u ilerleme hesabından bilerek dışlıyor ve gerekçesi doğru:
  /// orada `done` **bayat** bir sayıdır, ilerleme `startedAt` çıpasından türetilmeli.
  /// Buradaki kullanımı ise tamamen farklı bir soru: *"bu yanıt hazırlanırken kaç birim
  /// `units` tablosuna İŞLENMİŞTİ?"* Ve o sorunun cevabı tam olarak `done`dur.
  ///
  /// ⭐ Baraka'daki eldeki adet bununla düzeltiliyor: sunucu tembel üretiyor (`units.count`
  /// yalnız şehir okunduğunda ilerliyor), yani toplu bir emirde sayı okuma anında donuyor ve
  /// oyuncu *"üretimi biten askerler anlık olarak eklenmiyor"* diyordu. Ekranda gösterilen
  /// adet artık `units + (istemcide türetilen üretim − done)`; fark okuma anında sıfır,
  /// zaman geçtikçe büyüyor ve bir sonraki okumada kendiliğinden sıfırlanıyor.
  final int done;

  /// Banttaki sıra; **1 = üretimi süren**. Bekleyen emirde tek-birim penceresi yok.
  final int? position;

  /// ⚠️ Bu satır adetli bir üretim mi (asker/savunma birimi) yoksa seviye ilerletme mi?
  /// Bant yalnız birincisinde çizilir.
  bool get isBatch => (count ?? 0) > 0 && (perUnitSeconds ?? 0) > 0;

  /// Bant bu satırın mı? ⚠️ `position` yoksa 1 varsayılıyor — sunucu tek satırlı kuyrukta
  /// alanı göndermeyebiliyor ve o durumda satır elbette aktiftir.
  bool get isActive => (position ?? 1) == 1;

  static CityQueue fromJson(Map<String, dynamic> j) => CityQueue(
    id: (j['id'] as num).toInt(),
    category: j['category'] as String,
    itemType: j['itemType'] as String,
    targetLevel: (j['targetLevel'] as num?)?.toInt(),
    count: (j['count'] as num?)?.toInt(),
    startedAt: j['startedAt'] as String,
    finishAt: j['finishAt'] as String,
    perUnitSeconds: j['perUnitSeconds'] as num?,
    done: (j['done'] as num?)?.toInt() ?? 0,
    position: (j['position'] as num?)?.toInt(),
  );
}

Map<String, int> _counts(Object? raw) {
  if (raw is! Map) return const {};
  final out = <String, int>{};
  raw.forEach((k, v) {
    if (k is String && v is num) out[k] = v.toInt();
  });
  return out;
}
