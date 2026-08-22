/// ⭐ DM MESAJI — `GET /api/v1/chat/conversations/:id/messages` satırı.
///
/// ⚠️⚠️ **NEDEN ÜRETİLMEDİ.** Kardeşi `ChatConversation` `contracts.g.dart`ten geliyor
/// (`registry.ts`), bu ELLE yazıldı ve bu bir tutarsızlık değil, bilinçli bir ayrım:
/// `packages/contracts/src/chat.ts` · `chatMessage` şeması **daha geniş** — `senderName`,
/// `isPinned`, `deletedAt` taşıyor. DM geçmişi ucu ise `chat.service.ts` · `MessageRow`
/// döndürüyor ve onda bu üç alan **yok**. Şemayı Dart'a üretmek, istemciye hiç gelmeyen üç
/// alanı varmış gibi göstermek olurdu; üstelik üçü de `null`/`false` degrade ederdi ve
/// hiçbir kapı bunu yakalamazdı — tam olarak "sözleşme borcu defteri"nin sahte kapı dediği
/// şey (`MOBIL_MIMARI.md` §4).
///
/// ⭐ Gövde **DÜZ METİN**: sunucu HTML/markdown kabul etmiyor, XSS yüzeyi sıfır. Flutter da
/// zaten biçimlendirme yorumlamıyor, yani metin ne ise o çiziliyor.
library;

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.channelId,
    required this.senderId,
    required this.body,
    required this.createdAt,
  });

  final int id;
  final int channelId;

  /// ⚠️ `null` = **sistem duyurusu** (beta/bakım). Kendi mesajım sanılmamalı: baloncuğun
  /// hangi tarafa yaslanacağı `isMine`'da kararlaştırılıyor ve orada `null` açıkça eleniyor.
  final int? senderId;

  final String body;
  final String createdAt;

  static ChatMessage fromJson(Map<String, dynamic> j) => ChatMessage(
    id: (j['id'] as num).toInt(),
    channelId: (j['channelId'] as num?)?.toInt() ?? 0,
    senderId: (j['senderId'] as num?)?.toInt(),
    body: j['body'] as String? ?? '',
    createdAt: j['createdAt'] as String? ?? '',
  );
}

/// Bir geçmiş sayfası. ⚠️ Sunucu **en YENİ mesajı önce** döndürüyor (keyset, `before` =
/// ekrandaki en eski mesajın id'si). Ekranda eskiden yeniye çizmek çağıranın işi.
/// ⭐⭐ BEKLEYEN MESAJ İSTEĞİ (kullanıcı, 2026-08-22) — alıcı kabul edene kadar gövde
/// YERİNE bu geliyor.
///
/// ⚠️ Önizleme ya da gövde YOK ve olmamalı: korumanın tamamı gövdeyi göstermemek üzerine
/// kurulu. Oyuncunun karar vermek için gördüğü tek şey kim olduğu ve kaç mesaj beklediği.
typedef MwDmRequest = ({
  int fromPlayerId,
  String fromUsername,
  int count,
  String firstAt,
});

class ChatHistoryPage {
  const ChatHistoryPage({
    required this.items,
    required this.hasMore,
    this.request,
  });

  final List<ChatMessage> items;
  final bool hasMore;

  /// `null` → yazışma kabul edilmiş, mesajlar `items`ta.
  final MwDmRequest? request;

  static const empty = ChatHistoryPage(items: [], hasMore: false);

  static ChatHistoryPage fromJson(Map<String, dynamic> j) {
    final r = j['request'];
    return ChatHistoryPage(
      items: (j['items'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ChatMessage.fromJson)
          .toList(),
      hasMore: j['hasMore'] as bool? ?? false,
      request: r is Map<String, dynamic>
          ? (
              fromPlayerId: (r['fromPlayerId'] as num?)?.toInt() ?? 0,
              fromUsername: r['fromUsername'] as String? ?? '',
              count: (r['count'] as num?)?.toInt() ?? 0,
              firstAt: r['firstAt'] as String? ?? '',
            )
          : null,
    );
  }
}
