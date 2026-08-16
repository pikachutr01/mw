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

/// ⭐ SEVİYE TAŞIYAN KALEM — yapı ve teknik ortak şekli.
///
/// İkisi de "şu an sv N, sonraki seviye şu kadara ve şu kadar sürede" diyor; alanları birebir
/// aynı. Ayrı iki sınıf yazmak, aynı satır widget'ını iki kez yazmayı zorunlu kılardı.
///
/// ⚠️ `nextCost` **null olabilir**: yapı tavanına ulaşmışsa sunucu maliyeti hiç göndermiyor
/// (`maxLevel`e gelen yapının bir sonraki seviyesi yok). Teknikte tavan kavramı yok, orada
/// alan daima dolu. Null'ı `0` ile doldurmak "bedava yükseltme" gibi görünürdü.
class CatalogUpgradable {
  const CatalogUpgradable({
    required this.id,
    required this.name,
    required this.level,
    required this.maxLevel,
    required this.nextGold,
    required this.nextFood,
    required this.nextSeconds,
    required this.baseSeconds,
    required this.production,
    required this.requirements,
  });

  final String id;
  final String name;

  /// Şu anki seviye.
  final int level;

  /// Tavan. ⚠️ Teknikte tavan yok → `null`.
  final int? maxLevel;

  /// Bir sonraki seviyenin bedeli. ⚠️ Tavandaki yapıda `null`.
  final int? nextGold;
  final int? nextFood;

  /// Bir sonraki seviyenin süresi (dünya çarpanı uygulanmış). Tavandaysa `null`.
  final num? nextSeconds;

  /// Çarpansız süre — yalnız `nextSeconds`ten FARKLIYSA dolu.
  final num? baseSeconds;

  /// ⭐ Saatlik üretim önizlemesi — yalnız Çiftlik ve Maden'de dolu, diğerlerinde `null`.
  /// ⚠️ İstemci HESAPLAMIYOR: oran ve dünya çarpanı panelden ayarlanabiliyor.
  final ({int perHour, int? nextPerHour})? production;

  final List<NamedRequirement> requirements;

  /// Tavana ulaşıldı mı? ⚠️ `>=` (sunucudaki kuralın aynısı).
  bool get maxed => maxLevel != null && level >= maxLevel!;

  static CatalogUpgradable fromJson(Map<String, dynamic> j) {
    // ⚠️ Yapıda `nextCost`, teknikte de `nextCost` — ad ortak, o yüzden tek okuma yeter.
    final cost = j['nextCost'] as Map<String, dynamic>?;
    final pro = j['production'] as Map<String, dynamic>?;
    return CatalogUpgradable(
      id: j['id'] as String,
      name: j['name'] as String,
      level: (j['level'] as num?)?.toInt() ?? 0,
      maxLevel: (j['maxLevel'] as num?)?.toInt(),
      nextGold: (cost?['gold'] as num?)?.toInt(),
      nextFood: (cost?['food'] as num?)?.toInt(),
      nextSeconds: j['nextSeconds'] as num?,
      baseSeconds: j['baseSeconds'] as num?,
      production: pro == null
          ? null
          : (
              perHour: (pro['perHour'] as num?)?.toInt() ?? 0,
              nextPerHour: (pro['nextPerHour'] as num?)?.toInt(),
            ),
      requirements: (j['requirementNames'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(NamedRequirement.fromJson)
          .toList(),
    );
  }
}

/// ⭐ §verify tavanları — e-posta doğrulaması yapmamış oyuncunun sınırları.
///
/// ⚠️ Alan **`null` = kısıt yok** demek (hesap doğrulanmış ya da anahtar kapalı) ve nesnenin
/// kendisi de null olabiliyor. İkisi aynı anlama geliyor; ekran her iki durumda da tavan
/// çizmiyor.
class VerifyCaps {
  const VerifyCaps({
    required this.maxBuildingLevel,
    required this.maxTechLevel,
    required this.maxDefenseLevel,
  });

  final int maxBuildingLevel;
  final int maxTechLevel;
  final int maxDefenseLevel;

  /// ⚠️ Eskiden yalnız `maxDefenseLevel` okunuyordu ve alan yoksa **tüm nesne null** dönüyordu.
  /// Yapı/teknik tavanları eklenince o kısayol tehlikeli hâle geldi: sunucu bir alanı
  /// göndermese diğer iki tavan da sessizce kaybolurdu. Artık nesne varsa okunuyor, eksik alan
  /// yerine "pratikte sonsuz" bir tavan konuyor — kısıt UYDURMAK, kısıtı kaçırmaktan kötü.
  static VerifyCaps? fromJson(Object? raw) {
    if (raw is! Map) return null;
    int at(String key) {
      final v = raw[key];
      return v is num ? v.toInt() : 1 << 30;
    }

    return VerifyCaps(
      maxBuildingLevel: at('maxBuildingLevel'),
      maxTechLevel: at('maxTechLevel'),
      maxDefenseLevel: at('maxDefenseLevel'),
    );
  }
}

class CityCatalog {
  const CityCatalog({
    required this.buildings,
    required this.units,
    required this.defenses,
    required this.techs,
    required this.verify,
  });

  /// ⭐ Yapılar — Yapılar ekranının kaynağı (2026-08-17). Eskiden hiç okunmuyordu: ekran
  /// yalnız şehirdeki seviyeleri listeliyor, yükseltme sunmuyordu.
  final List<CatalogUpgradable> buildings;

  final List<CatalogUnit> units;
  final List<CatalogUnit> defenses;

  /// ⭐ Teknikler — Akademi ekranının kaynağı.
  final List<CatalogUpgradable> techs;

  /// `null` = tavan yok (oyuncu doğrulanmış).
  final VerifyCaps? verify;

  /// ⚠️ Sıra SUNUCUDAN geliyor (`WARRIOR_ORDER`, `BUILDING_ORDER`, `TECH_ORDER`) ve korunuyor:
  /// alfabetik sıralamak, oyunun kendi sırasını (zayıftan güçlüye) bozardı.
  static CityCatalog fromJson(Map<String, dynamic> j) => CityCatalog(
    buildings: _upgradables(j['buildings']),
    units: _list(j['units']),
    defenses: _list(j['defenses']),
    techs: _upgradables(j['techs']),
    verify: VerifyCaps.fromJson(j['verify']),
  );

  static List<CatalogUpgradable> _upgradables(Object? raw) =>
      (raw as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(CatalogUpgradable.fromJson)
          .toList();

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
