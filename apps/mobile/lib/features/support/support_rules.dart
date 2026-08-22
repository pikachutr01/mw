/// ⭐⭐ DESTEK — saf kurallar. Ekrandan bağımsız, ölçülebilir.
///
/// ⚠️ Sınırlar `packages/contracts/src/support.ts` ile **birebir** aynı olmak zorunda.
/// İstemcide gevşek olsalar sunucu zod hatası döndürür ve oyuncu doldurduğu formu boşa
/// harcar; sıkı olsalar sunucunun kabul edeceği bir talebi reddederdik.
library;

/// Talep kategorileri — sunucunun `supportCategory` enum'ıyla aynı sıra ve aynı etiketler.
///
/// ⚠️ Anahtarlar SUNUCUNUN kodları: `bug` yerine `hata` yazmak isteği reddettirirdi.
const List<({String id, String label})> kSupportCategories = [
  (id: 'bug', label: 'Hata bildirimi'),
  (id: 'account', label: 'Hesap / giriş sorunu'),
  (id: 'suggestion', label: 'Öneri'),
  (id: 'report', label: 'Şikayet'),
  (id: 'other', label: 'Diğer'),
];

String supportCategoryLabel(String id) {
  for (final c in kSupportCategories) {
    if (c.id == id) return c.label;
  }
  // ⚠️ Bilinmeyen kategori ham koduyla dönüyor: sunucuya yeni bir kategori eklendiğinde
  //    satır boş kalmamalı.
  return id;
}

String supportStatusLabel(String status) => switch (status) {
  'open' => 'Açık',
  'closed' => 'Kapalı',
  _ => status,
};

/// Konu: 5..120 (`supportSubject`).
const int kSubjectMin = 5;
const int kSubjectMax = 120;

/// İlk gövde: 20..4000 (`supportBody`).
///
/// ⚠️⚠️ 20 karakter **yalnız AÇILIŞTA** ve bu bilinçli: spam freni kimliksiz bir formdan
/// gelen ilk gövdeyi süzüyor. Yazışmanın devamında zarar veriyordu — yönetici *"Sorun
/// çözüldü mü?"* diye soruyor, oyuncunun cevabı *"Evet, teşekkürler"* ve o 17 karakter
/// (kullanıcı bildirdi, `support.ts`).
const int kBodyMin = 20;
const int kBodyMax = 4000;

/// Yanıt gövdesi: 2..4000 (`supportReplyBody`).
///
/// ⚠️ Taban 1 DEĞİL 2: tek karakterlik bir gövde yanıt değil kazadır ve yöneticiye bildirim
/// üretirdi.
const int kReplyMin = 2;

const int kEmailMax = 254;

/// Konu geçerli mi — geçersizse oyuncuya gösterilecek sebep.
///
/// ⚠️ `trim()` sonrası ölçülüyor: sunucudaki şema da `.trim()` uyguluyor ve boşlukla
/// doldurulmuş bir konu orada reddedilirdi.
String? subjectError(String raw) {
  final t = raw.trim();
  if (t.isEmpty) return 'Konu gerekli.';
  if (t.length < kSubjectMin) return 'Konu en az $kSubjectMin karakter olmalı.';
  if (t.length > kSubjectMax) {
    return 'Konu en fazla $kSubjectMax karakter olabilir.';
  }
  return null;
}

String? bodyError(String raw, {required bool ilkMesaj}) {
  final t = raw.trim();
  final min = ilkMesaj ? kBodyMin : kReplyMin;
  if (t.isEmpty) return 'Mesaj gerekli.';
  if (t.length < min) return 'Mesaj en az $min karakter olmalı.';
  if (t.length > kBodyMax) {
    return 'Mesaj en fazla $kBodyMax karakter olabilir.';
  }
  return null;
}

/// ⚠️ Desen SUNUCUNUNKİNİN KOPYASI DEĞİL, kaba bir ön eleme: zod'un `.email()` kuralını
/// Dart'a çevirmeye çalışmak iki kuralın ayrışabileceği bir yer açardı. Buradaki iş yalnız
/// "bu alan besbelli e-posta değil" demek; asıl reddi sunucu veriyor.
final RegExp _kabaEposta = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

String? emailError(String raw, {required bool zorunlu}) {
  final t = raw.trim();
  if (t.isEmpty) return zorunlu ? 'E-posta adresi gerekli.' : null;
  if (t.length > kEmailMax) return 'E-posta adresi çok uzun.';
  if (!_kabaEposta.hasMatch(t)) return 'E-posta adresi geçerli görünmüyor.';
  return null;
}

/// Form gönderilebilir mi? ⚠️ Tek karar noktası: düğmenin açılması ile isteğin geçerliliği
/// aynı kurala bakmalı, yoksa açık bir düğme sunucudan hata döndürür.
bool canCreateTicket({
  required String subject,
  required String body,
  required String email,
  required bool emailRequired,
}) =>
    subjectError(subject) == null &&
    bodyError(body, ilkMesaj: true) == null &&
    emailError(email, zorunlu: emailRequired) == null;

bool canReply(String body) => bodyError(body, ilkMesaj: false) == null;
