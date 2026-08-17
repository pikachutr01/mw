/// ⭐ TAPINAK — `GET /api/v1/cities/:id/temple` yanıtı.
///
/// ⚠️ **SÖZLEŞME BORCU** (`city_model.dart` ile aynı gerekçe): elle yazıldı, üretilmedi.
///
/// ⚠️ Bu dosyada `?? 0` savunma amaçlı DEĞİL, alanların anlamı gereği: sunucu hepsini
/// gönderiyor ve eksik gelen bir alan zaten bozuk bir yanıt demek. Yine de çökmemek için
/// varsayılan veriliyor — Tapınak ekranı oyunun akışını durdurmamalı.
library;

/// Kahramanın durumu — istemcinin kendi sözlüğü (`k.java`).
///
/// ⭐ `returning` = savaşta öldü, henüz eve varmadı. Etiketi de «Yok Edildi» ama Dirilt kapalı.
/// ⚠️ `destroyed` KALKTI (2026-08-01): kahraman artık hiç silinmiyor.
/// ⭐ Mağara durumları (2026-08-11): `in_cave` savaşa katılmaz ve casusa görünmez;
/// `entering_cave` HÂLÂ ŞEHİRDEDİR (savunmaya katılır, ölebilir) ama başka bir göreve
/// gönderilemez — mağaraya söz verilmiştir.
typedef MwHeroSkills = ({int fAtk, int fDef, int mAtk, int mDef});

class HeroRow {
  const HeroRow({
    required this.id,
    required this.name,
    required this.level,
    required this.xp,
    required this.xpForNext,
    required this.skills,
    required this.pointsTotal,
    required this.pointsSpent,
    required this.state,
    required this.reviveUntil,
    required this.returningAt,
    required this.caveAt,
    required this.reviveCost,
    required this.reviveSeconds,
  });

  final int id;
  final String name;
  final int level;
  final int xp;

  /// Bir sonraki seviyenin eşiği — ekranda `mevcut / eşik` yazar (oyunun kendi biçimi).
  final int xpForNext;

  final MwHeroSkills skills;
  final int pointsTotal;
  final int pointsSpent;

  /// `in_city` · `on_mission` · `dead` · `returning` · `reviving` ·
  /// `in_cave` · `entering_cave` · `leaving_cave`
  final String state;

  final String? reviveUntil;

  /// `returning` iken şehre varış anı — geri sayım bunu gösterir.
  final String? returningAt;

  /// Mağara geçişinin biteceği an — yalnız `entering_cave` / `leaving_cave` iken dolu.
  final String? caveAt;

  /// ⚠️ `null` olabilir: yalnız `dead` durumunda dolu. Sıfırla doldurmak «bedava diriltme»
  /// gibi görünürdü.
  final ({int gold, int food})? reviveCost;
  final int? reviveSeconds;

  /// Dağıtılmayı bekleyen puan. ⭐ Seviye savaşta kendiliğinden atlıyor; oyuncuya kalan tek
  /// iş bu puanları dağıtmak, o yüzden ekranda öne çıkıyor.
  int get pointsLeft => pointsTotal - pointsSpent;

  /// Savaşta düştü: ya yolda (`returning`) ya evde bekliyor (`dead`). İkisi de gri portre.
  bool get fallen => state == 'returning' || state == 'dead';

  static HeroRow fromJson(Map<String, dynamic> j) {
    final s = j['skills'] as Map<String, dynamic>? ?? const {};
    int at(String k) => (s[k] as num?)?.toInt() ?? 0;
    final cost = j['reviveCost'];

    return HeroRow(
      id: (j['id'] as num).toInt(),
      name: j['name'] as String? ?? '',
      level: (j['level'] as num?)?.toInt() ?? 1,
      xp: (j['xp'] as num?)?.toInt() ?? 0,
      xpForNext: (j['xpForNext'] as num?)?.toInt() ?? 0,
      skills: (
        fAtk: at('fAtk'),
        fDef: at('fDef'),
        mAtk: at('mAtk'),
        mDef: at('mDef'),
      ),
      pointsTotal: (j['pointsTotal'] as num?)?.toInt() ?? 0,
      pointsSpent: (j['pointsSpent'] as num?)?.toInt() ?? 0,
      state: j['state'] as String? ?? 'in_city',
      reviveUntil: j['reviveUntil'] as String?,
      returningAt: j['returningAt'] as String?,
      caveAt: j['caveAt'] as String?,
      reviveCost: cost is Map
          ? (
              gold: (cost['gold'] as num?)?.toInt() ?? 0,
              food: (cost['food'] as num?)?.toInt() ?? 0,
            )
          : null,
      reviveSeconds: (j['reviveSeconds'] as num?)?.toInt(),
    );
  }

  /// Yetenek anahtarından değeri okur — `kHeroSkills` üzerinden dönerken gerekiyor.
  int skill(String key) => switch (key) {
    'fAtk' => skills.fAtk,
    'fDef' => skills.fDef,
    'mAtk' => skills.mAtk,
    'mDef' => skills.mDef,
    _ => 0,
  };
}

class TempleView {
  const TempleView({
    required this.templeLevel,
    required this.heroCount,
    required this.maxHeroes,
    required this.heroes,
  });

  final int templeLevel;
  final int heroCount;
  final int maxHeroes;
  final List<HeroRow> heroes;

  static TempleView fromJson(Map<String, dynamic> j) => TempleView(
    templeLevel: (j['templeLevel'] as num?)?.toInt() ?? 0,
    heroCount: (j['heroCount'] as num?)?.toInt() ?? 0,
    maxHeroes: (j['maxHeroes'] as num?)?.toInt() ?? 0,
    heroes: (j['heroes'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(HeroRow.fromJson)
        .toList(),
  );
}
