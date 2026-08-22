/// ⭐ DESTEK — sunucu sözleşmesinin Dart karşılığı (`packages/contracts/src/support.ts`).
///
/// ⚠️ Gövdeler DÜZ METİN: sunucu HTML/markdown kabul etmiyor ve istemci de çizmemeli.
library;

class MwTicket {
  const MwTicket({
    required this.id,
    required this.subject,
    required this.category,
    required this.status,
    required this.lastSender,
    required this.createdAt,
    required this.updatedAt,
    required this.unreadCount,
  });

  final int id;
  final String subject;
  final String category;

  /// `open` · `closed`.
  final String status;

  /// `user` · `admin` — son yazan taraf.
  final String lastSender;
  final String createdAt;
  final String updatedAt;

  /// Oyuncunun okumadığı YÖNETİCİ mesajı sayısı.
  ///
  /// ⚠️ Yazışma açılınca sunucu bunu sıfırlıyor (`GET /support/:id` yan etkili), yani detayda
  /// daima 0 gelir. Sayaç yalnız listede anlamlı.
  final int unreadCount;

  bool get acik => status == 'open';

  factory MwTicket.fromJson(Map<String, dynamic> j) => MwTicket(
    id: (j['id'] as num?)?.toInt() ?? 0,
    subject: j['subject'] as String? ?? '',
    category: j['category'] as String? ?? 'other',
    status: j['status'] as String? ?? 'open',
    lastSender: j['lastSender'] as String? ?? 'user',
    createdAt: j['createdAt'] as String? ?? '',
    updatedAt: j['updatedAt'] as String? ?? '',
    unreadCount: (j['unreadCount'] as num?)?.toInt() ?? 0,
  );
}

class MwTicketMessage {
  const MwTicketMessage({
    required this.id,
    required this.sender,
    required this.authorName,
    required this.body,
    required this.createdAt,
    this.attachmentId,
  });

  final int id;

  /// `user` · `admin`.
  final String sender;

  /// ⚠️ Yönetici tarafında DAİMA «Yönetim» — personel kimliği oyuncuya sızmıyor.
  final String authorName;
  final String body;
  final String createdAt;

  /// ⚠️ Ek KİMLİĞİ; içerik ayrı bir uçtan yetkiyle iniyor. Mobilde ek gösterimi henüz yok
  /// (gerekçe `support_screen.dart` başlığında) ama alan okunuyor: eki olan bir mesajı
  /// "ek var ama gösteremiyoruz" diye işaretleyebilmek için.
  final int? attachmentId;

  bool get yonetici => sender == 'admin';

  factory MwTicketMessage.fromJson(Map<String, dynamic> j) => MwTicketMessage(
    id: (j['id'] as num?)?.toInt() ?? 0,
    sender: j['sender'] as String? ?? 'user',
    authorName: j['authorName'] as String? ?? '',
    body: j['body'] as String? ?? '',
    createdAt: j['createdAt'] as String? ?? '',
    attachmentId: (j['attachmentId'] as num?)?.toInt(),
  );
}

class MwTicketThread {
  const MwTicketThread({
    required this.ticket,
    required this.messages,
    required this.canReply,
  });

  final MwTicket ticket;
  final List<MwTicketMessage> messages;

  /// ⚠️ Kapalı talebe yalnız yönetici dokunuyor; kutu buna göre kapanıyor.
  final bool canReply;

  factory MwTicketThread.fromJson(Map<String, dynamic> j) => MwTicketThread(
    ticket: MwTicket.fromJson(j['ticket'] as Map<String, dynamic>? ?? const {}),
    messages: (j['messages'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(MwTicketMessage.fromJson)
        .toList(),
    canReply: j['canReply'] as bool? ?? false,
  );
}
