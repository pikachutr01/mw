/// ŞEHİR KATALOĞU — `GET /api/v1/cities/:id/catalog` yanıtının okunan kısmı.
///
/// ⛔⛔ **`packages/catalog` Dart'a ÜRETİLMEZ** ve bu kararın sebebi adlar değil **değerler**:
/// katalog değerleri dünya başına çalışma anında override edilebiliyor (bu depoda Akademi
/// maliyeti tam olarak böyle değiştirildi). Derlenmiş bir Dart kataloğu override'lı dünyada
/// **sessizce yanlış** olurdu. Maliyet, süre ve ön koşullar sunucudan gelir.
///
/// ⚠️ **SÖZLEŞME BORCU** (`city_model.dart` ile aynı gerekçe, MOBIL_MIMARI §4.0).
///
/// ⚠️ Süre alanları İKİ tane ve ikisi de sunucudan geliyor:
///   • `seconds`     — dünya hız çarpanı UYGULANMIŞ, gerçek süre
///   • `baseSeconds` — çarpansız; **yalnız `seconds`ten farklıysa dolu**
/// İstemci çarpanı kendisi hesaplamıyor. Web'de bir ara hesaplıyordu ve kullanıcı
/// *"geri sayım hızlanmış görünüyor ama binanın yanında yazan süre 1x hâliyle duruyor"*
/// dedi — yani başlatmadan önce görülen süre başladıktan sonrakiyle tutmuyordu.
library;

class NamedRequirement {
  const NamedRequirement({
    required this.id,
    required this.name,
    required this.level,
    required this.kind,
  });

  final String id;
  final String name;
  final int level;

  /// `building` · `tech` — hangi tablodan bakılacağını belirler.
  final String kind;

  static NamedRequirement fromJson(Map<String, dynamic> j) => NamedRequirement(
    id: j['id'] as String,
    name: j['name'] as String,
    level: (j['level'] as num).toInt(),
    kind: j['kind'] as String,
  );
}

class CatalogUnit {
  const CatalogUnit({
    required this.id,
    required this.name,
    required this.area,
    required this.gold,
    required this.food,
    required this.seconds,
    required this.baseSeconds,
    required this.levelBased,
    required this.current,
    required this.requirements,
  });

  final String id;
  final String name;

  /// Kale/Sur alan bütçesinden yediği yer.
  final int area;

  /// **Bir** birimin maliyeti; adetle çarpılır.
  final int gold;
  final int food;

  /// **Bir** birimin süresi (saniye), dünya çarpanı uygulanmış; adetle çarpılır.
  final num seconds;

  /// Çarpansız süre — ⚠️ yalnız `seconds`ten FARKLIYSA dolu.
  final num? baseSeconds;

  /// ⭐ Sur ve Büyü Kalkanı ADET değil **SEVİYE** taşır: adet kutusu çizilmez, düğme
  /// «sv N+1» yazar ve maliyet adetle çarpılmaz.
  final bool levelBased;

  /// `levelBased` kalemlerde o anki seviye.
  final int current;

  final List<NamedRequirement> requirements;

  static CatalogUnit fromJson(Map<String, dynamic> j) {
    final cost = j['cost'] as Map<String, dynamic>;
    return CatalogUnit(
      id: j['id'] as String,
      name: j['name'] as String,
      area: (j['area'] as num?)?.toInt() ?? 0,
      gold: (cost['gold'] as num).toInt(),
      food: (cost['food'] as num).toInt(),
      seconds: j['seconds'] as num? ?? 0,
      // ⚠️ `?? 0` YOK: "alan yok" ile "çarpan uygulanmamış" farklı şeyler. Null kalırsa
      // indirim etiketi hiç çizilmiyor — doğrusu bu.
      baseSeconds: j['baseSeconds'] as num?,
      levelBased: j['levelBased'] as bool? ?? false,
      current: (j['current'] as num?)?.toInt() ?? 0,
      requirements: (j['requirementNames'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(NamedRequirement.fromJson)
          .toList(),
    );
  }
}

/// ⭐ §verify tavanları — e-posta doğrulaması yapmamış oyuncunun sınırları.
class VerifyCaps {
  const VerifyCaps({required this.maxDefenseLevel});

  final int maxDefenseLevel;

  static VerifyCaps? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final v = raw['maxDefenseLevel'];
    if (v is! num) return null;
    return VerifyCaps(maxDefenseLevel: v.toInt());
  }
}

class CityCatalog {
  const CityCatalog({
    required this.units,
    required this.defenses,
    required this.verify,
  });

  final List<CatalogUnit> units;
  final List<CatalogUnit> defenses;

  /// `null` = tavan yok (oyuncu doğrulanmış).
  final VerifyCaps? verify;

  /// ⚠️ Sıra SUNUCUDAN geliyor (`WARRIOR_ORDER`) ve korunuyor: alfabetik sıralamak, oyunun
  /// kendi birim sırasını (zayıftan güçlüye) bozardı.
  static CityCatalog fromJson(Map<String, dynamic> j) => CityCatalog(
    units: _list(j['units']),
    defenses: _list(j['defenses']),
    verify: VerifyCaps.fromJson(j['verify']),
  );

  /// `id` → görünen ad; birim, savunma, yapı ve tekniklerin hepsi.
  static Map<String, String> namesFrom(Map<String, dynamic> j) {
    final out = <String, String>{};
    for (final key in ['buildings', 'units', 'defenses', 'techs']) {
      for (final e in (j[key] as List<dynamic>? ?? const [])) {
        if (e is Map && e['id'] is String && e['name'] is String) {
          out[e['id'] as String] = e['name'] as String;
        }
      }
    }
    return out;
  }

  static List<CatalogUnit> _list(Object? raw) =>
      (raw as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(CatalogUnit.fromJson)
          .toList();
}
