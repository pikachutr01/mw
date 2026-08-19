/// ⭐ İTTİFAK — `GET /api/v1/alliance` (benimki) ve `GET /api/v1/alliances/:id` (herkese açık).
///
/// ⚠️⚠️ **İKİ UÇ, İKİ FARKLI GİZLİLİK SEVİYESİ ve model bunu yansıtıyor:**
///   • `AllianceView` (benimki) — üye listesi, çevrimiçilik, **askerî ünvanlar**.
///   • `AllianceProfile` (herkese açık) — yalnız TOPLAMLAR: kaç üye, kaç puan, kaçıncı sıra,
///     lider kim, metin.
///
/// ⚠️ Üye listesi herkese açık uçtan **SIZMAZ** ve bu bir kullanıcı kararı: askerî ünvan
/// *"ordusu yeni kırıldı"* istihbaratı (*"Bunu gören düşmanlar sistematik olarak saldırı
/// yaparlar"*). İki modeli tek sınıfa birleştirmek, o sınırı istemcide bulanıklaştırırdı.
///
/// ⚠️⚠️ **SÖZLEŞME BORCU** (`MOBIL_MIMARI.md` §4): uçlar `Record<string, unknown>` döndürüyor.
library;

class AllianceView {
  const AllianceView({
    required this.id,
    required this.name,
    required this.text,
    required this.leader,
    required this.myRole,
    required this.score,
    required this.rank,
    required this.rankChange,
    required this.memberCount,
    required this.page,
    required this.pages,
    required this.members,
  });

  final int id;
  final String name;

  /// İttifak metni — tanıtım/duyuru alanı. ⚠️ 2026-08-09'dan beri **herkese açık**: kapalı
  /// olması yeni oyuncunun hangi ittifağa başvuracağına karar vermesini imkânsız kılıyordu.
  final String text;

  final String leader;

  /// 1 Asker · 2 Konsey · 3 Lider.
  final int myRole;

  /// ⚠️⚠️ **DONMUŞ puan değil, canlı toplam** — ama süzgeci ittifak SIRALAMASIYLA aynı
  /// (`banned_at IS NULL AND alliance_score_excluded = false`). Süzgeç sunucuda bir dönem
  /// YOKTU ve panel bir sayı, sıralama başka bir sayı gösteriyordu.
  final int score;

  final int? rank;
  final int? rankChange;
  final int memberCount;

  /// Üye listesi sayfası — **0 tabanlı** (sunucu da öyle). ⚠️ Sıralama sayfası 1 tabanlı;
  /// ikisi ayrı uç, ayrı sözleşme.
  final int page;
  final int pages;

  final List<AllianceMemberRow> members;

  static AllianceView fromJson(Map<String, dynamic> j) => AllianceView(
    id: (j['id'] as num?)?.toInt() ?? 0,
    name: j['name'] as String? ?? '',
    text: j['text'] as String? ?? '',
    leader: j['leader'] as String? ?? '',
    myRole: (j['myRole'] as num?)?.toInt() ?? 1,
    score: (j['score'] as num?)?.toInt() ?? 0,
    rank: (j['rank'] as num?)?.toInt(),
    rankChange: (j['rankChange'] as num?)?.toInt(),
    memberCount: (j['memberCount'] as num?)?.toInt() ?? 0,
    page: (j['page'] as num?)?.toInt() ?? 0,
    pages: (j['pages'] as num?)?.toInt() ?? 1,
    members: (j['members'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(AllianceMemberRow.fromJson)
        .toList(),
  );
}

class AllianceMemberRow {
  const AllianceMemberRow({
    required this.playerId,
    required this.username,
    required this.score,
    required this.role,
    required this.worldRank,
    required this.online,
    required this.onVacation,
    required this.meritTier,
  });

  final int playerId;
  final String username;

  /// ⚠️ Bu ÜYENİN puanı ve **süzülmüyor** — takım toplamının aksine. Toplam bir sıralama
  /// değeri, bu ise kişinin kendi puanı.
  final int score;

  final int role;
  final int? worldRank;

  /// ⚠️ Çevrimiçilik yalnız İTTİFAK İÇİNDE sızıyor.
  final bool online;

  /// ⚠️ `online` ile BİRLEŞTİRİLMEDİ ve sunucu da ayrı tutuyor: tatildeki oyuncu teknik
  /// olarak bağlı olabilir. Üçlü bir enum'a sıkıştırmak «tatilde ve çevrimiçi» hâlini
  /// temsil edilemez kılardı — hangisinin gösterileceği ekranın kararı (`memberState`).
  final bool onVacation;

  /// ⭐ Askerî ünvan — **YALNIZ ittifak içinde** görünüyor (kullanıcı şartı). Dünya, Sıralama,
  /// Arama ve savaş raporu uçlarına eklenmemeli: rozet bir başarı göstergesi ama aynı zamanda
  /// «ordusu yeni kırıldı» istihbaratı.
  final int? meritTier;

  static AllianceMemberRow fromJson(Map<String, dynamic> j) =>
      AllianceMemberRow(
        playerId: (j['playerId'] as num?)?.toInt() ?? 0,
        username: j['username'] as String? ?? '',
        score: (j['score'] as num?)?.toInt() ?? 0,
        role: (j['role'] as num?)?.toInt() ?? 1,
        worldRank: (j['worldRank'] as num?)?.toInt(),
        online: j['online'] as bool? ?? false,
        onVacation: j['onVacation'] as bool? ?? false,
        meritTier: (j['meritTier'] as num?)?.toInt(),
      );
}

/// İttifaksız oyuncunun gördüğü paket: kurma şartı + bekleyen başvurularım.
class AllianceNone {
  const AllianceNone({
    required this.canFound,
    required this.needCastle,
    required this.currentCastle,
    required this.pendingApplications,
  });

  final bool canFound;
  final int needCastle;
  final int currentCastle;

  /// ⚠️ Başvurduğum ittifakların kimlikleri — liste satırında «Başvuruldu» rozeti bunu
  /// okuyor. Rozet olmasaydı oyuncu ikinci kez başvurmayı dener ve reddedilirdi.
  final List<int> pendingApplications;

  static AllianceNone fromJson(Map<String, dynamic> j) {
    final cf = j['canFound'] as Map<String, dynamic>? ?? const {};
    return AllianceNone(
      canFound: cf['ok'] as bool? ?? false,
      needCastle: (cf['need'] as num?)?.toInt() ?? 0,
      currentCastle: (cf['current'] as num?)?.toInt() ?? 0,
      pendingApplications:
          (j['pendingApplications'] as List<dynamic>? ?? const [])
              .whereType<num>()
              .map((e) => e.toInt())
              .toList(),
    );
  }
}

/// Arama/liste satırı — `GET /api/v1/alliances`.
class AllianceListRow {
  const AllianceListRow({
    required this.id,
    required this.name,
    required this.memberCount,
    required this.score,
    required this.rank,
  });

  final int id;
  final String name;
  final int memberCount;
  final int score;
  final int? rank;

  static AllianceListRow fromJson(Map<String, dynamic> j) => AllianceListRow(
    id: (j['id'] as num?)?.toInt() ?? 0,
    name: j['name'] as String? ?? '',
    memberCount: (j['memberCount'] as num?)?.toInt() ?? 0,
    score: (j['score'] as num?)?.toInt() ?? 0,
    rank: (j['rank'] as num?)?.toInt(),
  );
}

/// ⭐ HERKESE AÇIK KÜNYE — sıralamadan ve arama sonucundan açılıyor.
///
/// ⚠️⚠️ **`canApply` ve `applyBlockedReason` SUNUCUDAN geliyor; istemci karar VERMİYOR.**
/// Kural (`alliance.service.apply`) zaten orada yaşıyor ve iki yerde tutmak kaçınılmaz olarak
/// kayardı. İstemcinin işi sebebi YAZMAK — düğmeyi sessizce gizlemek değil.
class AllianceProfile {
  const AllianceProfile({
    required this.id,
    required this.name,
    required this.text,
    required this.leader,
    required this.memberCount,
    required this.score,
    required this.rank,
    required this.rankChange,
    required this.isMine,
    required this.alreadyApplied,
    required this.canApply,
    required this.applyBlockedReason,
  });

  final int id;
  final String name;
  final String text;
  final String leader;
  final int memberCount;
  final int score;
  final int? rank;
  final int? rankChange;
  final bool isMine;
  final bool alreadyApplied;
  final bool canApply;

  /// ⚠️ Dolu ise ekranda YAZILIYOR. «Düğme yok» sebebi söylenmeden bırakılırsa oyuncu
  /// ekranın bozuk olduğunu sanar (`AllianceModal.tsx`taki sözleşme).
  final String? applyBlockedReason;

  static AllianceProfile fromJson(Map<String, dynamic> j) => AllianceProfile(
    id: (j['id'] as num?)?.toInt() ?? 0,
    name: j['name'] as String? ?? '',
    text: j['text'] as String? ?? '',
    leader: j['leader'] as String? ?? '',
    memberCount: (j['memberCount'] as num?)?.toInt() ?? 0,
    score: (j['score'] as num?)?.toInt() ?? 0,
    rank: (j['rank'] as num?)?.toInt(),
    rankChange: (j['rankChange'] as num?)?.toInt(),
    isMine: j['isMine'] as bool? ?? false,
    alreadyApplied: j['alreadyApplied'] as bool? ?? false,
    canApply: j['canApply'] as bool? ?? false,
    applyBlockedReason: j['applyBlockedReason'] as String?,
  );
}
