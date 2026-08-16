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
    required this.queues,
    required this.techQueues,
    required this.wallRepair,
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
      queues: (j['queues'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(CityQueue.fromJson)
          .toList(),
      techQueues: (j['techQueues'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(TechQueue.fromJson)
          .toList(),
      wallRepair: _wallRepair(j['wallRepair']),
      serverNow: j['serverNow'] as String,
      gameNow: j['gameNow'] as String,
    );
  }
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
