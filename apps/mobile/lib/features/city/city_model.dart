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
    required this.queues,
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
  final List<CityQueue> queues;

  /// Kaynak sayacının çıpası (gerçek saat).
  final String serverNow;

  /// Üretim bandının çıpası (oyun saati).
  final String gameNow;

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
      queues: (j['queues'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(CityQueue.fromJson)
          .toList(),
      serverNow: j['serverNow'] as String,
      gameNow: j['gameNow'] as String,
    );
  }
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
