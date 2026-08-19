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
class ChatHistoryPage {
  const ChatHistoryPage({required this.items, required this.hasMore});

  final List<ChatMessage> items;
  final bool hasMore;

  static const empty = ChatHistoryPage(items: [], hasMore: false);

  static ChatHistoryPage fromJson(Map<String, dynamic> j) => ChatHistoryPage(
    items: (j['items'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ChatMessage.fromJson)
        .toList(),
    hasMore: j['hasMore'] as bool? ?? false,
  );
}
