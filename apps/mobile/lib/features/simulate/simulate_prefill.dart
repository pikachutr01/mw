/// ⭐⭐ SİMÜLATÖRE AKTAR — casusluk raporundaki künyeyi forma taşıyan tek atımlık devir.
///
/// Web'de karşılığı `lib/sim-prefill.ts`. ⚠️ Orada taşıyıcı `sessionStorage`; burada
/// `Store` (güvenli depo). Ayrım biçimsel: telefonda "sekme" diye bir şey yok, uygulama
/// kapanınca kaybolmasını sağlayan mekanizma da yok. Bunun yerine **okuyan siler**.
///
/// ⚠️⚠️ OKUYAN SİLER ve bu kural pazarlıksız: kayıt kalsaydı oyuncu bir hafta sonra
/// simülatörü açtığında formu eski bir casusluk raporunun verisiyle dolmuş bulurdu ve
/// nereden geldiğini anlayamazdı. Web'de de `removeItem` **parse'tan önce** çağrılıyor,
/// yani bozuk bir kayıt bile temizleniyor.
library;

import 'dart:convert';

import '../../gen/facts.g.dart';
import 'simulate_model.dart';

/// ⚠️ Web'le **aynı anahtar** (`sessionStorage['mw-sim-prefill']`). Değerler paylaşılmıyor
/// ama adlandırma paylaşılıyor — iki istemcinin aynı kavramı aynı adla tuttuğunu belgeliyor.
const String kSimPrefillKey = 'mw-sim-prefill';

/// Şema sürüm damgası. ⚠️ Uyuşmayan kayıt sessizce ATILIYOR: depo elle düzenlenebilir ve
/// eski bir biçimi zorla okumak formu çöple doldururdu.
const int kSimPrefillVersion = 1;

/// Bir tarafın devredilen alanları. ⚠️ Hepsi isteğe bağlı: **bilinmeyen alan yazılmıyor**.
/// Boş bir harita ile `null` farklı şeyler — biri "casus baktı, hiçbir şey yok", diğeri
/// "casus o kademeye hiç ulaşamadı".
class MwSimPrefill {
  const MwSimPrefill({
    this.counts = const {},
    this.tech = const {},
    this.heroes = const [],
    this.heroCount,
    this.vision,
  });

  final Map<String, int> counts;
  final Map<String, int> tech;
  final List<MwSimHero> heroes;
  final int? heroCount;
  final int? vision;

  bool get bos =>
      counts.isEmpty &&
      tech.isEmpty &&
      heroes.isEmpty &&
      heroCount == null &&
      vision == null;

  Map<String, dynamic> toJson() => {
    if (counts.isNotEmpty) 'counts': counts,
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
    if (heroCount != null) 'heroCount': heroCount,
    if (vision != null) 'vision': vision,
  };

  static Map<String, int> _ints(Object? raw) {
    if (raw is! Map) return const {};
    return {
      for (final e in raw.entries)
        if (e.value is num) '${e.key}': (e.value as num).toInt(),
    };
  }

  static int _i(Object? v) => v is num ? v.toInt() : 0;

  factory MwSimPrefill.fromJson(Map<String, dynamic> j) => MwSimPrefill(
    counts: _ints(j['counts']),
    tech: _ints(j['tech']),
    heroes: (j['heroes'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(
          (h) => (
            level: _i(h['level']),
            fAtk: _i(h['fAtk']),
            fDef: _i(h['fDef']),
            mAtk: _i(h['mAtk']),
            mDef: _i(h['mDef']),
          ),
        )
        .toList(),
    heroCount: (j['heroCount'] as num?)?.toInt(),
    vision: (j['vision'] as num?)?.toInt(),
  );
}

/// Devredilen paket — bugün yalnız savunan taraf doluyor (casusluk raporundan).
class MwSimTransfer {
  const MwSimTransfer({this.attacker, this.defender});

  final MwSimPrefill? attacker;
  final MwSimPrefill? defender;

  String encode() => jsonEncode({
    'v': kSimPrefillVersion,
    if (attacker != null) 'attacker': attacker!.toJson(),
    if (defender != null) 'defender': defender!.toJson(),
  });

  /// ⚠️ Bozuk/eski kayıtta `null`: çağıran hiçbir şey yapmıyor ve form boş açılıyor.
  static MwSimTransfer? decode(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final j = jsonDecode(raw);
      if (j is! Map<String, dynamic>) return null;
      if (j['v'] != kSimPrefillVersion) return null;
      MwSimPrefill? taraf(Object? v) =>
          v is Map<String, dynamic> ? MwSimPrefill.fromJson(v) : null;
      return MwSimTransfer(
        attacker: taraf(j['attacker']),
        defender: taraf(j['defender']),
      );
    } catch (_) {
      return null;
    }
  }
}

/// ⭐ Casusluk künyesinden savunan tarafı üretir — web'deki `sideFromIntel` karşılığı.
///
/// ⚠️⚠️ SUR ve BÜYÜ KALKANI `defenses`ten AYIKLANMIŞ hâlde geliyor: adet değil seviye
/// taşıdıkları için "toplam savunma ünitesi"ne girmemeleri gerekiyordu ve sunucu onları ayrı
/// bir `structures` kaydına yazıyor. Simülatörde ise ikisi de aynı `counts` tablosunda,
/// seviye olarak. Birleştirme burada yapılıyor — atlanırsa casusluktan gelen bir savunmada
/// sur hep sıfır görünürdü.
MwSimPrefill simSideFromIntel(Map<String, dynamic> intel) {
  final counts = <String, int>{};

  void topla(Object? raw) {
    if (raw is! Map) return;
    for (final e in raw.entries) {
      final v = e.value;
      if (v is num && v > 0) counts['${e.key}'] = v.toInt();
    }
  }

  topla(intel['warriors']);
  topla(intel['defenses']);

  final yapilar = intel['structures'];
  if (yapilar is Map) {
    for (final id in kLevelBased) {
      // ⚠️ Tapınak DIŞARIDA: `kLevelBased` onu da içeriyor ama tapınak savaş yapısı değil,
      //    simülatörde ayrı bir alanda kahraman ihtimalini besliyor.
      if (id == 'temple') continue;
      final lv = yapilar[id];
      if (lv is num && lv > 0) counts[id] = lv.toInt();
    }
  }

  final tech = <String, int>{};
  final teknikler = intel['techs'];
  if (teknikler is Map) {
    for (final e in teknikler.entries) {
      final id = '${e.key}';
      final v = e.value;
      // ⚠️ Savaşa girmeyen teknikler (Casusluk, Haritacılık, Sömürgecilik) devredilmiyor:
      //    simülatörde kutuları yok, yazsaydık sessizce kaybolurlardı.
      if (v is num && v > 0 && kCombatTechs.contains(id)) tech[id] = v.toInt();
    }
  }

  final kahramanlar = (intel['heroes'] as List<dynamic>? ?? const [])
      .whereType<Map<String, dynamic>>()
      .take(5)
      .map((h) {
        final y = h['skills'];
        int s(String k) => y is Map && y[k] is num ? (y[k] as num).toInt() : 0;
        return (
          level: (h['level'] as num?)?.toInt() ?? 0,
          fAtk: s('fAtk'),
          fDef: s('fDef'),
          mAtk: s('mAtk'),
          mDef: s('mDef'),
        );
      })
      .toList();

  final gece = teknikler is Map ? teknikler['night_vision'] : null;

  return MwSimPrefill(
    counts: counts,
    tech: tech,
    heroes: kahramanlar,
    heroCount: (intel['heroCount'] as num?)?.toInt(),
    vision: gece is num && gece > 0 ? gece.toInt() : null,
  );
}

/// Raporun simülatöre aktarılmaya değecek bir şeyi var mı?
///
/// ⚠️ Web'deki `intelIsTransferable` ile aynı ölçüt: casusluk kademeli ve düşük kademede
/// yalnız kaynak sızıyor. Boş bir formu "aktardım" diye açmak, düğmenin çalışmadığını
/// düşündürürdü.
bool simIntelTransferable(Map<String, dynamic> intel) =>
    intel['warriors'] != null ||
    intel['defenses'] != null ||
    intel['heroes'] != null ||
    intel['heroCount'] is num;
