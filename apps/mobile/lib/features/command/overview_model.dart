/// ⭐ GENEL DURUM — `GET /api/v1/command/overview`.
///
/// Tek çağrı, çünkü ekran hepsini aynı anda gösteriyor; şehir başına ayrı istek atmak dört
/// şehirli bir oyuncuda beş gidiş-dönüş demekti.
///
/// ⚠️⚠️ **SÖZLEŞME BORCU** (`MOBIL_MIMARI.md` §4): uç `Record<string, unknown>` döndürüyor,
/// paylaşılan bir şemadan geçmiyor. `movement.dart` · `message.dart` ile aynı gerekçe.
///
/// ─ ⭐⭐ PUAN **DONMUŞ** SÜTUNDAN GELİYOR ─────────────────────────────────────────────────
/// Sunucu puanı `rankings.score`tan okuyor, canlı `players.score`ten değil (kullanıcı kararı,
/// 2026-08-03). Sebebi canlıda yakalandı: aynı panelde «güncelleme 08:00» yazarken puan
/// saniyesinde artıyordu ve Sıralamalar sayfasındakinden FARKLIYDI. ⚠️ İstemci bu yüzden
/// puanı **hiçbir yerde kendi hesabıyla tazelemiyor** — tek panelde iki ayrı tazelik iki ayrı
/// gerçek anlatır.
library;

class Overview {
  const Overview({
    required this.player,
    required this.ranking,
    required this.techs,
    required this.unitTypes,
    required this.defenseTypes,
    required this.cities,
    required this.totals,
  });

  final OverviewPlayer player;
  final ({String? takenAt, String nextAt}) ranking;

  /// Teknik seviyeleri — sunucunun verdiği sırayla (Akademi ekranıyla aynı).
  final List<({String id, String name, int level})> techs;

  /// ⚠️ Tablonun SATIR sırası bu listelerden geliyor, `Map`in kendi sırasından değil:
  /// Baraka ve Savunma ekranları da aynı sırayı kullanıyor.
  final List<({String id, String name})> unitTypes;
  final List<({String id, String name})> defenseTypes;

  final List<OverviewCity> cities;
  final OverviewTotals totals;

  static Overview fromJson(Map<String, dynamic> j) {
    final p = j['player'] as Map<String, dynamic>? ?? const {};
    final r = j['ranking'] as Map<String, dynamic>? ?? const {};

    List<({String id, String name})> named(Object? raw) =>
        (raw as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(
              (e) => (
                id: e['id'] as String? ?? '',
                name: e['name'] as String? ?? '',
              ),
            )
            .toList();

    return Overview(
      player: OverviewPlayer.fromJson(p),
      ranking: (
        takenAt: r['takenAt'] as String?,
        nextAt: r['nextAt'] as String? ?? '',
      ),
      techs: (j['techs'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(
            (e) => (
              id: e['id'] as String? ?? '',
              name: e['name'] as String? ?? '',
              level: (e['level'] as num?)?.toInt() ?? 0,
            ),
          )
          .toList(),
      unitTypes: named(j['unitTypes']),
      defenseTypes: named(j['defenseTypes']),
      cities: (j['cities'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(OverviewCity.fromJson)
          .toList(),
      totals: OverviewTotals.fromJson(
        j['totals'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class OverviewPlayer {
  const OverviewPlayer({
    required this.username,
    required this.score,
    required this.rank,
    required this.rankChange,
    required this.totalPlayers,
    required this.meritTier,
    required this.meritExpiresAt,
    required this.alliance,
    required this.allianceRank,
    required this.allianceRankChange,
  });

  final String username;

  /// ⚠️ **DONMUŞ** puan — anlık görüntüden. Gerekçe dosya başlığında.
  final int score;

  /// ⚠️ İlk anlık görüntü alınmadan `null` — «—» yazılıyor, `0` DEĞİL: sıfırıncı sıra diye
  /// bir şey yok ve `0` yazmak "en kötü sıradasın" gibi okunurdu.
  final int? rank;

  /// Pozitif = yukarı çıktı. Önceki anlık görüntü yoksa `null`.
  final int? rankChange;

  final int totalPlayers;

  /// ⭐ Kendi askerî unvanı. ⚠️ Oyuncu **kendi** rozetini her zaman görüyor; başkalarınınki
  /// yalnız ittifak listesinde açılıyor. Süresi geçmişse sunucu `null` gönderiyor.
  final int? meritTier;
  final String? meritExpiresAt;

  final String? alliance;
  final int? allianceRank;
  final int? allianceRankChange;

  static OverviewPlayer fromJson(Map<String, dynamic> j) => OverviewPlayer(
    username: j['username'] as String? ?? '',
    score: (j['score'] as num?)?.toInt() ?? 0,
    rank: (j['rank'] as num?)?.toInt(),
    rankChange: (j['rankChange'] as num?)?.toInt(),
    totalPlayers: (j['totalPlayers'] as num?)?.toInt() ?? 0,
    meritTier: (j['meritTier'] as num?)?.toInt(),
    meritExpiresAt: j['meritExpiresAt'] as String?,
    alliance: j['alliance'] as String?,
    allianceRank: (j['allianceRank'] as num?)?.toInt(),
    allianceRankChange: (j['allianceRankChange'] as num?)?.toInt(),
  );
}

class OverviewCity {
  const OverviewCity({
    required this.id,
    required this.name,
    required this.isCapital,
    required this.gold,
    required this.food,
    required this.units,
    required this.defenses,
  });

  final int id;
  final String name;
  final bool isCapital;
  final int gold;
  final int food;
  final Map<String, int> units;
  final Map<String, int> defenses;

  static OverviewCity fromJson(Map<String, dynamic> j) {
    final res = j['resources'] as Map<String, dynamic>? ?? const {};
    return OverviewCity(
      id: (j['id'] as num?)?.toInt() ?? 0,
      name: j['name'] as String? ?? '',
      isCapital: j['isCapital'] as bool? ?? false,
      gold: (res['gold'] as num?)?.toInt() ?? 0,
      food: (res['food'] as num?)?.toInt() ?? 0,
      units: counts(j['units']),
      defenses: counts(j['defenses']),
    );
  }

  static Map<String, int> counts(Object? raw) {
    if (raw is! Map) return const {};
    return {
      for (final e in raw.entries)
        if (e.value is num) '${e.key}': (e.value as num).toInt(),
    };
  }
}

class OverviewTotals {
  const OverviewTotals({
    required this.gold,
    required this.food,
    required this.units,
    required this.defenses,
  });

  final int gold;
  final int food;
  final Map<String, int> units;
  final Map<String, int> defenses;

  static OverviewTotals fromJson(Map<String, dynamic> j) => OverviewTotals(
    gold: (j['gold'] as num?)?.toInt() ?? 0,
    food: (j['food'] as num?)?.toInt() ?? 0,
    units: OverviewCity.counts(j['units']),
    defenses: OverviewCity.counts(j['defenses']),
  );
}
