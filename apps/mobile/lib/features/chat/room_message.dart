/// ⭐ ODA SOHBETİ MESAJI — **Genel Sohbet ve İttifak Sohbeti AYNI şekli kullanıyor.**
///
/// ⚠️ Sunucuda da tek şema (`chat.ts` · `chatRoomMessage`) ve iki ad ona takma isim:
/// alanları birebir aynı ve ayrışmaları için bir sebep yok. İki ayrı sınıf yazsaydık, birine
/// eklenen alanı diğerine eklemeyi unuttururdu.
///
/// ⚠️ DM'in `ChatMessage`ından AYRI ve bu bilinçli: DM'de `mentions` yok (roster yok, kime
/// bahsedileceği belli), oda mesajında `channelId` yok (kanal zaten bağlamdan belli).
library;

class RoomMessage {
  const RoomMessage({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.body,
    required this.mentions,
    required this.createdAt,
  });

  final int id;

  /// `null` = sistem duyurusu.
  final int? senderId;

  /// ⚠️ `null` = **dünyadan kaldırılmış oyuncu**. Ekran «kaldırılmış oyuncu» yazıyor; ham
  /// `id` ASLA görünmüyor (sunucu yorumu bunu açıkça şart koşuyor).
  final String? senderName;

  final String body;

  /// ⭐ **ÇÖZÜLMÜŞ** bahsetme aralıkları — sunucu üretiyor, istemci yalnız diliyor.
  ///
  /// ⚠️⚠️ İstemci **PARSE ETMİYOR** ve etmemeli: kullanıcı adında boşluk serbest olduğu için
  /// `@ad`ın nerede bittiği metinden çözülemez. Ayrımı üye listesini gören sunucu yapıyor.
  /// İki tarafta iki ayrı parse kuralı kaçınılmaz olarak ayrışırdı.
  final List<({int id, int at, int len})> mentions;

  final String createdAt;

  static RoomMessage fromJson(Map<String, dynamic> j) => RoomMessage(
    id: (j['id'] as num?)?.toInt() ?? 0,
    senderId: (j['senderId'] as num?)?.toInt(),
    senderName: j['senderName'] as String?,
    body: j['body'] as String? ?? '',
    mentions: (j['mentions'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(
          (m) => (
            id: (m['id'] as num?)?.toInt() ?? 0,
            at: (m['at'] as num?)?.toInt() ?? -1,
            len: (m['len'] as num?)?.toInt() ?? 0,
          ),
        )
        .toList(),
    createdAt: j['createdAt'] as String? ?? '',
  );
}

/// Oda geçmişinin bir sayfası. ⚠️ DM'le aynı keyset modeli: en yeni önce, `before` = ekrandaki
/// en eski mesajın kimliği.
class RoomHistoryPage {
  const RoomHistoryPage({required this.items, required this.hasMore});

  final List<RoomMessage> items;
  final bool hasMore;

  static const empty = RoomHistoryPage(items: [], hasMore: false);

  static RoomHistoryPage fromJson(Map<String, dynamic> j) => RoomHistoryPage(
    items: (j['items'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(RoomMessage.fromJson)
        .toList(),
    hasMore: j['hasMore'] as bool? ?? false,
  );
}

/// ⭐ GENEL SOHBET AÇILIŞ PAKETİ — `GET /api/v1/chat/global`.
///
/// ⚠️ **Yalnız oyuncu sohbete BAĞLANINCA çağrılıyor.** Kapalıyken hiç istek gitmiyor ve bu
/// «bağlantıyı kopardığında sessizlik» şartının bir parçası: sessizlik bir bayrakla değil,
/// hiç sorgu açmamakla sağlanıyor.
class RoomOpen {
  const RoomOpen({
    required this.channelId,
    required this.canWrite,
    required this.reason,
    required this.blockedText,
    required this.isStaff,
  });

  final int channelId;

  /// Yazma hakkı. ⚠️ `false` iken de OKUMAK serbest — susturulan oyuncu sohbeti görmeye
  /// devam ediyor, yalnız kutusu kapanıyor.
  final bool canWrite;

  final String? reason;

  /// ⚠️ Sunucunun yazdığı sebep metni ve **süre taşıyor** («14 dakika daha…»). İstemcide
  /// yeniden yazmak o bilgiyi kaybettirirdi — bu yüzden ham gösteriliyor.
  final String? blockedText;

  /// Moderatör/yönetici mi. ⚠️ Mobilde bugün hiçbir şeyi AÇMIYOR (yönetim işlemleri web
  /// panelinde); alan okunuyor ki ileride eklenecek düğme için sunucuya ikinci bir istek
  /// gerekmesin.
  final bool isStaff;

  static RoomOpen fromJson(Map<String, dynamic> j) => RoomOpen(
    channelId: (j['channelId'] as num?)?.toInt() ?? 0,
    canWrite: j['canWrite'] as bool? ?? false,
    reason: j['reason'] as String?,
    blockedText: j['blockedText'] as String?,
    isStaff: j['isStaff'] as bool? ?? false,
  );
}

/// ⭐ İTTİFAK SOHBETİ AÇILIŞ PAKETİ — `GET /api/v1/alliance/chat`.
///
/// ⚠️ Genel sohbetinkinden **iki alanla ayrılıyor** ve ikisi de yetkiyle ilgili: `myRole`
/// (moderasyon düğmeleri buna bakıyor) ve `members` (kimin susturulacağı ve **kimin ayrılmış
/// olduğu** oradan çözülüyor — bkz. `canDeleteMessage`).
///
/// ⚠️⚠️ Yetki burada **oyun yönetimi değil, ittifak rütbesi**. Genel sohbette moderasyonu
/// `AdminGuard` koruyor ve o yüzden mobile taşınmadı; burada kapı ittifak lideridir ve o kişi
/// oyunu telefondan oynuyor olabilir — bu yüzden İttifak sohbetinde moderasyon VAR.
class AllianceRoomOpen {
  const AllianceRoomOpen({
    required this.channelId,
    required this.myRole,
    required this.canWrite,
    required this.blockedText,
    required this.members,
    required this.truncated,
  });

  final int channelId;

  /// 1 Asker · 2 Konsey · 3 Lider (`MwRole`).
  final int myRole;

  final bool canWrite;

  /// ⚠️ Sunucunun yazdığı sebep ve **süre taşıyor**; istemcide yeniden yazmak bilgi kaybı olurdu.
  final String? blockedText;

  final List<AllianceMember> members;

  /// Üye listesi kırpıldı mı. ⚠️ Ekran bunu SÖYLEMELİ: eksik bir listede aranan üyeyi
  /// bulamamak "yok" diye okunurdu.
  final bool truncated;

  static AllianceRoomOpen fromJson(Map<String, dynamic> j) => AllianceRoomOpen(
    channelId: (j['channelId'] as num?)?.toInt() ?? 0,
    myRole: (j['myRole'] as num?)?.toInt() ?? 1,
    canWrite: j['canWrite'] as bool? ?? false,
    blockedText: j['blockedText'] as String?,
    members: (j['members'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(AllianceMember.fromJson)
        .toList(),
    truncated: j['truncated'] as bool? ?? false,
  );

  /// Bir oyuncunun rütbesi; **listede yoksa `null`** — yani ittifaktan ayrılmış.
  /// ⚠️ Bu `null` `canDeleteMessage`in girdisi ve orada gerçek bir anlam taşıyor.
  int? roleOf(int? playerId) {
    if (playerId == null) return null;
    for (final m in members) {
      if (m.playerId == playerId) return m.role;
    }
    return null;
  }
}

class AllianceMember {
  const AllianceMember({
    required this.playerId,
    required this.username,
    required this.role,
    required this.muted,
    required this.mutedUntil,
    required this.online,
  });

  final int playerId;
  final String username;
  final int role;
  final bool muted;

  /// ⚠️ `muted` true + `mutedUntil` null → **KALICI** susturma.
  final String? mutedUntil;

  /// ⚠️ Çevrimiçilik yalnız ittifak İÇİNDE sızıyor (istek sahibi zaten üye). Sunucu bunu
  /// bellek-içi sayaçtan dolduruyor; worker profilinde herkes çevrimdışı görünüyor.
  final bool online;

  static AllianceMember fromJson(Map<String, dynamic> j) => AllianceMember(
    playerId: (j['playerId'] as num?)?.toInt() ?? 0,
    username: j['username'] as String? ?? '',
    role: (j['role'] as num?)?.toInt() ?? 1,
    muted: j['muted'] as bool? ?? false,
    mutedUntil: j['mutedUntil'] as String?,
    online: j['online'] as bool? ?? false,
  );
}
