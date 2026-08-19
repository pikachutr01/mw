/// ⭐ POSTA KUTUSU SATIRI — `GET /api/v1/messages` yanıtındaki tek kayıt.
///
/// ⚠️⚠️ **SÖZLEŞME BORCU** (`MOBIL_MIMARI.md` §4, `movement.dart` ile aynı gerekçe): bu uç
/// `battle.controller.ts` içinde elle kurulmuş bir `Record<string, unknown>` döndürüyor,
/// yani paylaşılan bir şemadan geçmiyor. Dart tarafını şemayla daraltmak DERLENİR ama hiçbir
/// şey ölçmez — sahte bir kapı olurdu.
///
/// ⚠️ **`body` bu tipte YOK** ve bu sunucu tarafında bilinçli bir karar (2026-08-03): liste
/// ucu 60 saniyede bir dönüyordu ve gövdeleri de taşıyordu; oysa gövdeyi yalnız detay
/// açılınca okuyoruz. Gövde `GET /api/v1/messages/:id` ile ayrı geliyor.
library;

/// Sunucunun tek satırı. Ekranda görünen her şey burada; gerisi detayda.
class MessageRow {
  const MessageRow({
    required this.id,
    required this.kind,
    required this.side,
    required this.battleId,
    required this.missionId,
    required this.subject,
    required this.at,
    required this.readAt,
    required this.favorite,
  });

  final int id;

  /// `battle_report` · `spy_report` · `transport_report` · `support_report` ·
  /// `found_city_report` · `return_report` · `alliance_invite` · `alliance_application` ·
  /// `alliance_message` · `system`.
  ///
  /// ⚠️ **Kapalı bir küme DEĞİL** — bir enum'a çevirmedik. Sunucu yeni bir rapor türü
  /// eklediğinde (§EKSIK «Mağara Raporu») istemci ham `kind` ile devam edebilmeli; enum
  /// olsaydı ayrıştırma bilinmeyen değerde patlar ya da sessizce satırı yutardı.
  final String kind;

  /// Okuyanın savaştaki yüzü: `attacker` · `defender` · `spy` · `target` · `sender` ·
  /// `receiver` · `owner`. Aynı olayın iki tarafı aynı `kind`i taşır, başlığı `side` ayırır.
  final String? side;

  /// Doluysa gövde `messages` tablosunda DEĞİL, `battles` kaydında: rapor okuma anında
  /// türetiliyor (`buildBattleReport`).
  final int? battleId;

  final int? missionId;

  /// Sunucunun yazdığı konu. ⚠️ Ekranda **başlık olarak kullanılmıyor**: tür kataloğu
  /// (`kReportType`) daha kararlı bir ad veriyor, konu ikinci satırda ayrıntı olarak yaşıyor.
  final String subject;

  final String at;

  /// `null` → okunmamış. Okundu damgası, sayı değil: "kaç kez okundu" diye bir soru yok.
  final String? readAt;

  /// ⭐ Oyuncunun favorilediği rapor (2026-08-19). ⚠️ Sunucu damga tutuyor
  /// (`favorited_at`), tel üzerinde BOOL geliyor: istemci "ne zaman"ı hiçbir yerde
  /// göstermiyor ve göstermeyeceği bir alanı her satırda taşımanın anlamı yok.
  final bool favorite;

  bool get unread => readAt == null;

  static MessageRow fromJson(Map<String, dynamic> j) => MessageRow(
    id: (j['id'] as num).toInt(),
    kind: j['kind'] as String? ?? '',
    side: j['side'] as String?,
    battleId: (j['battleId'] as num?)?.toInt(),
    missionId: (j['missionId'] as num?)?.toInt(),
    subject: j['subject'] as String? ?? '',
    at: j['at'] as String? ?? '',
    readAt: j['readAt'] as String?,
    favorite: j['favorite'] as bool? ?? false,
  );
}

/// Bir sayfa + sekme rozetlerinin beslendiği sayaçlar.
///
/// ⚠️ Sayaçlar **süzgeçten bağımsız** geliyor: ekran hangi sekmede olursa olsun iki rozeti de
/// aynı anda çizebilmeli. `total` ise süzgeçli — sayfa sayısı ondan hesaplanıyor.
class MessagePage {
  const MessagePage({
    required this.items,
    required this.unread,
    required this.total,
    required this.counts,
  });

  final List<MessageRow> items;

  /// İki sekmenin TOPLAM okunmamışı — alt bardaki rozet bunu okuyor.
  final int unread;

  /// Süzgeçli toplam kayıt (sayfa sayısının kaynağı).
  final int total;

  final MessageCounts counts;

  static const empty = MessagePage(
    items: [],
    unread: 0,
    total: 0,
    counts: MessageCounts(
      reports: 0,
      messages: 0,
      unreadReports: 0,
      unreadMessages: 0,
      favorites: 0,
    ),
  );

  static MessagePage fromJson(Map<String, dynamic> j) {
    final list = j['items'] as List<dynamic>? ?? const [];
    final c = j['counts'] as Map<String, dynamic>? ?? const {};
    int n(String k) => (c[k] as num?)?.toInt() ?? 0;
    return MessagePage(
      items: list
          .whereType<Map<String, dynamic>>()
          .map(MessageRow.fromJson)
          .toList(),
      unread: (j['unread'] as num?)?.toInt() ?? 0,
      total: (j['total'] as num?)?.toInt() ?? 0,
      counts: MessageCounts(
        reports: n('reports'),
        messages: n('messages'),
        unreadReports: n('unreadReports'),
        unreadMessages: n('unreadMessages'),
        favorites: n('favorites'),
      ),
    );
  }
}

class MessageCounts {
  const MessageCounts({
    required this.reports,
    required this.messages,
    required this.unreadReports,
    required this.unreadMessages,
    required this.favorites,
  });

  final int reports;
  final int messages;
  final int unreadReports;
  final int unreadMessages;

  /// ⭐ Favori sayısı — süzgeç çipinin yanındaki rozet.
  final int favorites;
}
