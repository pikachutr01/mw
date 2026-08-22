/// ⭐ SİMÜLATÖR — istek ve yanıt modelleri (`POST /api/v1/simulate`).
///
/// ⚠️ Bu tipler `packages/contracts/src/simulate.ts` ve `packages/engine/src/types.ts`in
/// karşılığı. `contracts.g.dart`a ÜRETİLMEDİLER çünkü üreteç yalnız istemcinin ortak
/// kullandığı sözleşmeleri taşıyor; simülatör tek ekranlık ve alanları burada okunuyor.
///
/// ⚠️ Eksik alan `null` bırakılıyor, varsayılana düşürülmüyor (`MOBIL_MIMARI.md` §3.4):
/// «savaşa girmedi» ile «yok oldu» farklı şeyler ve simülatörün bütün anlamı o farkta.
library;

/// Bir kahraman satırı — seviye + dört yetenek.
typedef MwSimHero = ({int level, int fAtk, int fDef, int mAtk, int mDef});

const MwSimHero kBosKahraman = (level: 0, fAtk: 0, fDef: 0, mAtk: 0, mDef: 0);

/// Bir tarafın girdisi.
class MwSimSide {
  const MwSimSide({
    required this.counts,
    required this.tech,
    required this.heroes,
    this.temple,
    this.heroCount,
  });

  /// Birim id → adet. ⚠️ `wall` ve `magic_shield` burada **adet değil SEVİYE** taşıyor.
  final Map<String, int> counts;
  final Map<String, int> tech;
  final List<MwSimHero> heroes;

  /// Oyuncunun TÜM şehirlerinin tapınak toplamı — kahraman çıkma ihtimalini besliyor.
  final int? temple;

  /// Kahraman **sayısı**; savaşa girmiyor, yalnız çıkma ihtimalini besliyor.
  final int? heroCount;

  Map<String, dynamic> toJson() => {
    'counts': counts,
    if (tech.isNotEmpty) 'tech': tech,
    if (heroes.isNotEmpty)
      'heroes': [
        for (final h in heroes)
          {
            'level': h.level,
            'fAtk': h.fAtk,
            'fDef': h.fDef,
            'mAtk': h.mAtk,
            'mDef': h.mDef,
          },
      ],
    if (temple != null) 'temple': temple,
    if (heroCount != null) 'heroCount': heroCount,
  };
}

class MwSimRequest {
  const MwSimRequest({
    required this.attacker,
    required this.defender,
    required this.night,
    required this.visionAttacker,
    required this.visionDefender,
    required this.repeat,
  });

  final MwSimSide attacker;
  final MwSimSide defender;
  final bool night;
  final int visionAttacker;
  final int visionDefender;
  final int repeat;

  Map<String, dynamic> toJson() => {
    'attacker': attacker.toJson(),
    'defender': defender.toJson(),
    'night': night,
    'nightVisionAttacker': visionAttacker,
    'nightVisionDefender': visionDefender,
    'repeat': repeat,
  };
}

/// Savaş sonrası bir kahramanın durumu.
typedef MwSimHeroResult = ({int level, num durum, bool alive});

class MwSimSideResult {
  const MwSimSideResult({
    required this.alive,
    required this.lost,
    required this.counts,
    required this.floorRestored,
    required this.heroes,
    this.wallIntegrity,
    this.shieldIntegrity,
  });

  final int alive;
  final int lost;

  /// Hayatta kalan birimler. ⚠️ Anahtar YOKSA o birim savaşa hiç girmedi demek; sıfırla
  /// karıştırılmamalı (`?? 0` bilerek yazılmıyor).
  final Map<String, int> counts;

  /// Savunma tabanının geri getirdikleri.
  final Map<String, int> floorRestored;
  final List<MwSimHeroResult> heroes;

  /// 0..1 — sur yoksa `null`.
  final num? wallIntegrity;
  final num? shieldIntegrity;

  static Map<String, int> _sayilar(Object? raw) {
    if (raw is! Map) return const {};
    return {
      for (final e in raw.entries)
        if (e.value is num) '${e.key}': (e.value as num).toInt(),
    };
  }

  factory MwSimSideResult.fromJson(Map<String, dynamic> j) => MwSimSideResult(
    alive: (j['alive'] as num?)?.toInt() ?? 0,
    lost: (j['lost'] as num?)?.toInt() ?? 0,
    counts: _sayilar(j['counts']),
    floorRestored: _sayilar(j['floorRestored']),
    heroes: (j['heroes'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(
          (h) => (
            level: (h['level'] as num?)?.toInt() ?? 0,
            durum: (h['durum'] as num?) ?? 0,
            alive: h['alive'] as bool? ?? false,
          ),
        )
        .toList(),
    wallIntegrity: j['wallIntegrity'] as num?,
    shieldIntegrity: j['shieldIntegrity'] as num?,
  );
}

class MwSimResult {
  const MwSimResult({
    required this.winner,
    required this.turns,
    required this.attacker,
    required this.defender,
    required this.debrisGold,
    required this.debrisFood,
    required this.xp,
    required this.captureChance,
    required this.carryCapacity,
  });

  /// `attacker` · `defender` · `draw`.
  final String winner;
  final int turns;
  final MwSimSideResult attacker;
  final MwSimSideResult defender;
  final int debrisGold;
  final int debrisFood;
  final int xp;
  final num captureChance;
  final int carryCapacity;

  factory MwSimResult.fromJson(Map<String, dynamic> j) {
    final debris = j['debris'] is Map ? j['debris'] as Map : const {};
    return MwSimResult(
      winner: j['winner'] as String? ?? 'draw',
      turns: (j['turns'] as num?)?.toInt() ?? 0,
      attacker: MwSimSideResult.fromJson(
        j['attacker'] as Map<String, dynamic>? ?? const {},
      ),
      defender: MwSimSideResult.fromJson(
        j['defender'] as Map<String, dynamic>? ?? const {},
      ),
      debrisGold: (debris['gold'] as num?)?.toInt() ?? 0,
      debrisFood: (debris['food'] as num?)?.toInt() ?? 0,
      xp: (j['xp'] as num?)?.toInt() ?? 0,
      captureChance: (j['captureChance'] as num?) ?? 0,
      carryCapacity: (j['attackerCarryCapacity'] as num?)?.toInt() ?? 0,
    );
  }
}
