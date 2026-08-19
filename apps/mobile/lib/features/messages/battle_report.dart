/// ⭐ SAVAŞ RAPORU — `GET /api/v1/battles/:id`.
///
/// ⚠️⚠️ **Rapor SAKLANMIYOR, okuma anında türetiliyor** (`battle-report.ts` ·
/// `buildBattleReport`) ve okuyanın tarafına göre şekilleniyor: saldıran, mağaranın içindeki
/// kaçış dökümünü ASLA görmüyor — sunucu o anahtarı silerek gönderiyor. İstemci bu ayrımı
/// yeniden üretmiyor; gelen ne ise o çiziliyor.
///
/// ⭐ Birim ADLARI sunucudan hazır geliyor (`ReportLine.name`), katalogdan çözülmüyor. Bu,
/// raporun geçmişe sadık kalmasını sağlıyor: birim sonradan yeniden adlandırılsa bile eski
/// rapor savaş anındaki adı taşır. ⚠️ Mağara kaçış dökümü bunun **istisnası** — orada ham
/// `id` geliyor ve ad katalogtan çözülüyor (gerekçe `battle_report_view.dart`ta).
library;

typedef MwRes = ({int gold, int food});

/// Rapordaki koordinat. ⚠️ `name`/`owner` **olayın anına donmuş**; eski kayıtlarda ikisi de
/// yok ve satır yalnız koordinatı yazar.
typedef MwReportCoord = ({int k, int d, int s, String? name, String? owner});

/// Bir birim satırı: katılan → kalan, ölen.
class ReportLine {
  const ReportLine({
    required this.id,
    required this.name,
    required this.before,
    required this.after,
    required this.lost,
    required this.restoredByFloor,
  });

  final String id;

  /// ⚠️ Sunucunun çözdüğü TÜRKÇE ad; ham `id` ekranda İngilizce görünürdü (§13.14).
  final String name;
  final int before;
  final int after;
  final int lost;

  /// Savunma tabanının geri getirdiği adet; 0 ise satırda hiç yazılmıyor.
  final int restoredByFloor;

  static ReportLine fromJson(Map<String, dynamic> j) => ReportLine(
    id: j['id'] as String? ?? '',
    name: j['name'] as String? ?? '',
    before: (j['before'] as num?)?.toInt() ?? 0,
    after: (j['after'] as num?)?.toInt() ?? 0,
    lost: (j['lost'] as num?)?.toInt() ?? 0,
    restoredByFloor: (j['restoredByFloor'] as num?)?.toInt() ?? 0,
  );
}

class ReportSection {
  const ReportSection({
    required this.key,
    required this.title,
    required this.lines,
  });

  final String key;

  /// ⚠️ Başlığı da SUNUCU yazıyor («Ordun» · «Rakip ordu» · «Savunma birimleri»): hangi
  /// dökümün "benim" olduğu okuyanın yüzüne göre değişiyor ve o karar sunucuda.
  final String title;
  final List<ReportLine> lines;

  static ReportSection fromJson(Map<String, dynamic> j) => ReportSection(
    key: j['key'] as String? ?? '',
    title: j['title'] as String? ?? '',
    lines: (j['lines'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ReportLine.fromJson)
        .toList(),
  );
}

class ReportHeroLine {
  const ReportHeroLine({
    required this.name,
    required this.level,
    required this.alive,
    required this.xpGained,
  });

  final String name;
  final int level;

  /// `false` → «Yok Edildi !» (tek etiket, 2026-08-01): kahraman eve döner ve diriltilebilir.
  final bool alive;

  /// ⚠️ Yalnız KENDİ kahramanlarında dolu; rakipte 0 — sunucu sızdırmıyor.
  final int xpGained;

  static ReportHeroLine fromJson(Map<String, dynamic> j) => ReportHeroLine(
    name: j['name'] as String? ?? '',
    level: (j['level'] as num?)?.toInt() ?? 0,
    alive: j['alive'] as bool? ?? true,
    xpGained: (j['xpGained'] as num?)?.toInt() ?? 0,
  );
}

class BattleReport {
  const BattleReport({
    required this.battleId,
    required this.side,
    required this.winner,
    required this.won,
    required this.turns,
    required this.night,
    required this.at,
    required this.origin,
    required this.target,
    required this.sections,
    required this.myHeroes,
    required this.enemyHeroes,
    required this.captured,
    required this.wall,
    required this.cave,
    required this.loot,
    required this.lootBreakdown,
    required this.notes,
    required this.provenance,
  });

  final int battleId;

  /// `attacker` · `defender` — okuyanın yüzü.
  final String side;

  /// `attacker` · `defender` · `draw`.
  final String winner;

  /// ⚠️ «Kazandım mı» sorusunun cevabı SUNUCUDAN geliyor, `winner == side` diye
  /// hesaplanmıyor: beraberede o karşılaştırma yanlış cevap verirdi.
  final bool won;

  final int turns;
  final bool night;
  final String at;

  final MwReportCoord? origin;
  final MwReportCoord? target;

  final List<ReportSection> sections;
  final List<ReportHeroLine> myHeroes;
  final List<ReportHeroLine> enemyHeroes;

  /// Savaştan ÇIKAN yeni kahraman; `mine` false ise rakibe gitmiş demektir.
  final ({String name, bool mine})? captured;

  final ({int? level, double? integrity, bool destroyed})? wall;
  final BattleCave? cave;

  /// Saldıranda «Ganimet», savunanda «Yağmalanan». ⚠️ Saldıran kaybettiyse `null`.
  final MwRes? loot;

  final BattleLootBreakdown? lootBreakdown;
  final List<String> notes;
  final ({int seed, String engineVersion, String catalogHash}) provenance;

  static BattleReport fromJson(Map<String, dynamic> j) {
    final coords = j['coords'] as Map<String, dynamic>?;
    final heroes = j['heroes'] as Map<String, dynamic>? ?? const {};
    final cap = heroes['captured'] as Map<String, dynamic>?;
    final wall = j['wall'] as Map<String, dynamic>?;
    final prov = j['provenance'] as Map<String, dynamic>? ?? const {};

    List<ReportHeroLine> heroList(Object? raw) =>
        (raw as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(ReportHeroLine.fromJson)
            .toList();

    return BattleReport(
      battleId: (j['battleId'] as num?)?.toInt() ?? 0,
      side: j['side'] as String? ?? 'attacker',
      winner: j['winner'] as String? ?? 'draw',
      won: j['won'] as bool? ?? false,
      turns: (j['turns'] as num?)?.toInt() ?? 0,
      night: j['night'] as bool? ?? false,
      at: j['at'] as String? ?? '',
      origin: reportCoord(coords?['origin']),
      target: reportCoord(coords?['target']),
      sections: (j['sections'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ReportSection.fromJson)
          .toList(),
      myHeroes: heroList(heroes['mine']),
      enemyHeroes: heroList(heroes['enemy']),
      captured: cap == null
          ? null
          : (
              name: cap['name'] as String? ?? '',
              mine: cap['mine'] as bool? ?? false,
            ),
      wall: wall == null
          ? null
          : (
              level: (wall['level'] as num?)?.toInt(),
              integrity: (wall['integrity'] as num?)?.toDouble(),
              destroyed: wall['destroyed'] as bool? ?? false,
            ),
      cave: BattleCave.fromJson(j['cave']),
      loot: res(j['loot']),
      lootBreakdown: BattleLootBreakdown.fromJson(j['lootBreakdown']),
      notes: (j['notes'] as List<dynamic>? ?? const [])
          .whereType<String>()
          .toList(),
      provenance: (
        seed: (prov['seed'] as num?)?.toInt() ?? 0,
        engineVersion: prov['engineVersion'] as String? ?? '',
        catalogHash: prov['catalogHash'] as String? ?? '',
      ),
    );
  }

  /// ⚠️ `null` ile `(0, 0)` FARKLI: kaybeden saldıranda ganimet satırı hiç çizilmemeli.
  /// «0 altın» yazmak "ganimet çıkmadı" demek olurdu — oysa enkaz çıktı, tamamı savunana gitti.
  static MwRes? res(Object? raw) {
    if (raw is! Map) return null;
    return (
      gold: (raw['gold'] as num?)?.toInt() ?? 0,
      food: (raw['food'] as num?)?.toInt() ?? 0,
    );
  }

  static MwReportCoord? reportCoord(Object? raw) {
    if (raw is! Map) return null;
    final k = raw['k'], d = raw['d'], s = raw['s'];
    if (k is! num || d is! num || s is! num) return null;
    return (
      k: k.toInt(),
      d: d.toInt(),
      s: s.toInt(),
      name: raw['name'] as String?,
      owner: raw['owner'] as String?,
    );
  }
}

class BattleCave {
  const BattleCave({
    required this.present,
    required this.broken,
    required this.needed,
    required this.survivingDwarves,
    required this.reason,
    required this.escaped,
  });

  final bool present;
  final bool broken;

  /// Mağarayı kırmak için gereken cüce sayısı — saldırana tek işe yarar sayı.
  /// ⚠️ Sunucuda alan adı `required`; Dart'ta o bir anahtar kelime olduğu için `needed`.
  final int needed;
  final int survivingDwarves;
  final String? reason;

  /// ⚠️ **YALNIZ savunanda dolu.** Mağaranın içi saldırana asla gitmez; sunucu anahtarı
  /// silerek gönderiyor ve istemci onu yeniden türetmeye çalışmıyor.
  final Map<String, int> escaped;

  static BattleCave? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final esc = raw['escaped'];
    return BattleCave(
      present: raw['present'] as bool? ?? false,
      broken: raw['broken'] as bool? ?? false,
      needed: (raw['required'] as num?)?.toInt() ?? 0,
      survivingDwarves: (raw['survivingDwarves'] as num?)?.toInt() ?? 0,
      reason: raw['reason'] as String?,
      escaped: {
        if (esc is Map)
          for (final e in esc.entries)
            if (e.value is num) '${e.key}': (e.value as num).toInt(),
      },
    );
  }
}

/// ⭐ «Neden bu kadar az ganimet?» sorusunun cevabı (oyuncu bildirimi, 2026-08-08).
///
/// Yağma oranı şehrin kasasına uygulanıyor ama eve dönen yük TAŞIMA KAPASİTESİYLE sınırlı.
/// Rapor farktan söz etmediği sürece oyuncu ganimetin az OLUŞTUĞUNU sanıyor.
class BattleLootBreakdown {
  const BattleLootBreakdown({
    required this.revealed,
    required this.carried,
    required this.leftBehind,
    required this.capacity,
    required this.detail,
  });

  /// Savaşın ortaya çıkardığı TOPLAM: ölen ordunun enkazı + kasadan alınabilecek pay.
  final MwRes revealed;

  /// Fiilen eve taşınan yük; saldıran kaybettiyse `null`.
  final MwRes? carried;

  /// ⚠️ Ekranda satır olarak çizilmiyor (2026-08-19); `detail.plunderLeft` ile aynı sayı.
  final MwRes? leftBehind;

  final int? capacity;

  /// ⭐ Info ikonunun açtığı ayrıntı. `null` = eski savaş kaydı → ikon çizilmiyor.
  final BattleLootDetail? detail;

  static BattleLootBreakdown? fromJson(Object? raw) {
    if (raw is! Map) return null;
    return BattleLootBreakdown(
      revealed: BattleReport.res(raw['revealed']) ?? (gold: 0, food: 0),
      carried: BattleReport.res(raw['carried']),
      leftBehind: BattleReport.res(raw['leftBehind']),
      capacity: (raw['capacity'] as num?)?.toInt(),
      detail: BattleLootDetail.fromJson(raw['detail']),
    );
  }
}

/// ⭐⭐ AYRINTILI GANİMET HESABI (kullanıcı, 2026-08-19) — info ikonunun tooltip içeriği.
///
/// ⚠️⚠️ Var olma sebebi somut bir arıza: ekrandaki iki sayı birbirini tutmuyordu. Canlı
/// örnekte (savaş #29) «Ortaya çıkan» 7.046.425, «Taşınan» 223.819 ve aradaki 6.822.606'nın
/// yalnız 785.542'si kasadan sığmayan paydı; kalan 6.037.064 **enkazdan** sığmayan kısımdı ve
/// hiçbir yerde yazmıyordu.
///
/// ⭐ İki kaynak, her biri üç parça; toplamları daima `revealed`e eşit:
///   `debrisTotal  = debrisCarried  + debrisLeft`
///   `plunderTotal = plunderCarried + plunderLeft`
class BattleLootDetail {
  const BattleLootDetail({
    required this.debrisTotal,
    required this.debrisCarried,
    required this.debrisLeft,
    required this.plunderTotal,
    required this.plunderCarried,
    required this.plunderLeft,
  });

  final MwRes debrisTotal;
  final MwRes debrisCarried;
  final MwRes debrisLeft;
  final MwRes plunderTotal;
  final MwRes plunderCarried;
  final MwRes plunderLeft;

  /// ⚠️ Alanlardan biri eksikse `null` dönüyor, sıfırla doldurulmuyor: yarım bir döküm,
  /// düzeltmeye çalıştığımız "kapanmayan hesap" arızasının aynısını üretirdi.
  static BattleLootDetail? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final dt = BattleReport.res(raw['debrisTotal']);
    final dc = BattleReport.res(raw['debrisCarried']);
    final dl = BattleReport.res(raw['debrisLeft']);
    final pt = BattleReport.res(raw['plunderTotal']);
    final pc = BattleReport.res(raw['plunderCarried']);
    final pl = BattleReport.res(raw['plunderLeft']);
    if (dt == null || dc == null || dl == null) return null;
    if (pt == null || pc == null || pl == null) return null;
    return BattleLootDetail(
      debrisTotal: dt,
      debrisCarried: dc,
      debrisLeft: dl,
      plunderTotal: pt,
      plunderCarried: pc,
      plunderLeft: pl,
    );
  }
}
