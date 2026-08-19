/// ⭐ SIRALAMA — `GET /api/v1/command/rankings?kind=&page=`.
///
/// Üç dal, üçü de aynı satır tipini kullanıyor ve **alanların çoğu dala göre boş**:
/// oyuncuda `score`/`alliance`, ittifakta `score`/`memberCount`, kahramanda `level`/`xp`.
/// Üç ayrı sınıf yazmak, üçünü aynı listede çizen ekranı üç kez dallandırmak olurdu.
///
/// ⚠️⚠️ **SIRA CANLI DEĞİL** (§13.17.2): 8 saatte bir alınan anlık görüntüden geliyor ve
/// ekran bunu **söylemek zorunda**. Söylemezse oyuncu puanını artırıp sırasının değişmemesini
/// hata sanar — web'de tam bu bildirildi.
library;

class RankingRow {
  const RankingRow({
    required this.rank,
    required this.change,
    required this.id,
    required this.name,
    required this.isMine,
    required this.playerId,
    required this.score,
    required this.alliance,
    required this.memberCount,
    required this.owner,
    required this.level,
    required this.xp,
  });

  final int rank;

  /// Sıra değişimi; önceki anlık görüntü yoksa `null`. Pozitif = yukarı çıktı.
  final int? change;

  /// ⚠️ Kahraman dalında bu **KAHRAMAN kimliği**, oyuncu kimliği değil. Mesaj gönderme
  /// `playerId`yi kullanmak zorunda; `id`yi kullansaydık rastgele bir oyuncuya yazılırdı.
  final int id;
  final String name;
  final bool isMine;

  /// Satırın oyuncusu. ⚠️ İttifak dalında **yok** — orada satır bir ittifağı gösteriyor.
  final int? playerId;

  final int? score;
  final String? alliance;
  final int? memberCount;

  /// Kahraman dalı: kahramanın sahibi.
  final String? owner;
  final int? level;
  final int? xp;

  /* ⛔ `dead` alanı BİLEREK okunmuyor (kullanıcı, 2026-08-11): *"Bir oyuncunun kahramanının
     ölü olduğunu bilmek stratejik bir kayıp olur."* Sunucu artık göndermiyor; burada da
     okumuyoruz ki bir gün geri gelirse ekrana sessizce düşmesin. Kendi kahramanının durumu
     Tapınak ekranında, diriltme akışıyla birlikte duruyor. */

  static RankingRow fromJson(Map<String, dynamic> j) => RankingRow(
    rank: (j['rank'] as num?)?.toInt() ?? 0,
    change: (j['change'] as num?)?.toInt(),
    id: (j['id'] as num?)?.toInt() ?? 0,
    name: j['name'] as String? ?? '',
    isMine: j['isMine'] as bool? ?? false,
    playerId: (j['playerId'] as num?)?.toInt(),
    score: (j['score'] as num?)?.toInt(),
    alliance: j['alliance'] as String?,
    memberCount: (j['memberCount'] as num?)?.toInt(),
    owner: j['owner'] as String?,
    level: (j['level'] as num?)?.toInt(),
    xp: (j['xp'] as num?)?.toInt(),
  );
}

class RankingPage {
  const RankingPage({
    required this.kind,
    required this.page,
    required this.pages,
    required this.myRank,
    required this.myPage,
    required this.takenAt,
    required this.nextAt,
    required this.unavailable,
    required this.rows,
  });

  final String kind;
  final int page;
  final int pages;

  /// «Beni göster» düğmesinin kaynağı. ⚠️ Sıralamaya hiç girmemiş oyuncuda ikisi de `null`
  /// ve düğme çizilmiyor — 1. sayfaya atan bir düğme, oyuncuya orada olduğunu düşündürürdü.
  final int? myRank;
  final int? myPage;

  final String? takenAt;
  final String nextAt;

  /// Dolu ise liste yerine bu sebep gösteriliyor (ör. ittifaklar henüz açılmadı).
  /// ⚠️ Metni SUNUCU yazıyor: hangi dalın neden kapalı olduğu sunucunun bilgisi.
  final String? unavailable;

  final List<RankingRow> rows;

  static const empty = RankingPage(
    kind: 'player',
    page: 1,
    pages: 1,
    myRank: null,
    myPage: null,
    takenAt: null,
    nextAt: '',
    unavailable: null,
    rows: [],
  );

  static RankingPage fromJson(Map<String, dynamic> j) => RankingPage(
    kind: j['kind'] as String? ?? 'player',
    page: (j['page'] as num?)?.toInt() ?? 1,
    pages: (j['pages'] as num?)?.toInt() ?? 1,
    myRank: (j['myRank'] as num?)?.toInt(),
    myPage: (j['myPage'] as num?)?.toInt(),
    takenAt: j['takenAt'] as String?,
    nextAt: j['nextAt'] as String? ?? '',
    unavailable: j['unavailable'] as String?,
    rows: (j['rows'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(RankingRow.fromJson)
        .toList(),
  );
}

/// ⭐ ARAMA SONUCU — `GET /api/v1/command/search`.
///
/// ⚠️⚠️ Alan adları Dünya ekranının `city` nesnesiyle **AYNI olmak zorunda**: sonuç satırı
/// doğrudan hedef künyesine veriliyor ve ikinci bir şekil dönüşümü yok (sunucu tarafında da
/// aynı not yazılı).
///
/// ⚠️ Ada göre arama YALNIZ BAŞKENT döndürüyor (§13.16.5) ve bu bir gizlilik kuralı: oyuncunun
/// tüm şehirlerini adından bulabilmek, koloni saklamayı imkânsız kılardı.
class SearchHit {
  const SearchHit({
    required this.k,
    required this.d,
    required this.s,
    required this.name,
    required this.playerId,
    required this.username,
    required this.isOwn,
    required this.rank,
    required this.alliance,
  });

  final int k;
  final int d;
  final int s;
  final String name;
  final int playerId;
  final String username;
  final bool isOwn;
  final int? rank;
  final String? alliance;

  static SearchHit fromJson(Map<String, dynamic> j) => SearchHit(
    k: (j['k'] as num?)?.toInt() ?? 0,
    d: (j['d'] as num?)?.toInt() ?? 0,
    s: (j['s'] as num?)?.toInt() ?? 0,
    name: j['name'] as String? ?? '',
    playerId: (j['playerId'] as num?)?.toInt() ?? 0,
    username: j['username'] as String? ?? '',
    isOwn: j['isOwn'] as bool? ?? false,
    rank: (j['rank'] as num?)?.toInt(),
    alliance: j['alliance'] as String?,
  );
}
