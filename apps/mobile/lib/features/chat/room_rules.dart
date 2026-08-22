/// ⭐⭐ ODA SOHBETİ KURALLARI — bahsetme dilimleyici · hata metni · yazar adı · «yazıyor»
/// şeridi. **Saf fonksiyonlar.**
///
/// Genel Sohbet ve İttifak Sohbeti aynı kuralları paylaşıyor; ikisi de aynı sunucu şemasını
/// kullanıyor (`chat.ts` · `chatRoomMessage`).
library;

import 'room_message.dart';

/// Gövdenin bir parçası. `mentionId` doluysa bu parça bir bahsetme — vurgulu yazılıyor.
typedef MentionPart = ({String text, int? mentionId});

/// ⭐⭐ BAHSETME DİLİMLEYİCİ — gövdeyi sunucunun verdiği aralıklara göre parçalar.
///
/// ⚠️⚠️ **BURADA PARSE YOK.** Kullanıcı adında boşluk serbest olduğu için `@ad`ın nerede
/// bittiği metinden çözülemez; ayrımı üye listesini gören sunucu yapıyor ve sonucu **indeks**
/// olarak gönderiyor. İstemcinin işi yalnız o indekslerden dilim almak.
///
/// ⚠️⚠️ **Bozuk aralıklar SESSİZCE atılıyor** (sınır dışı `at`, gövdeyi aşan `len`, önceki
/// aralıkla çakışma) ve bu bilinçli bir asimetri: gövdenin kırpılması ya da karakterlerin
/// kaybolması, bir bahsetmenin vurgulanamamasından **çok daha kötü** bir hata olurdu. Metin
/// her hâlükârda eksiksiz çıkıyor — bu dosyanın en önemli garantisi ve testle kilitli.
///
/// ⚠️ Flutter'da işaretleme yorumlanmıyor (parçalar `TextSpan` olarak basılıyor), yani XSS
/// yüzeyi yok. Web'de de `dangerouslySetInnerHTML` kullanılmıyor — aynı karar.
List<MentionPart> splitMentions(
  String body,
  List<({int id, int at, int len})> mentions,
) {
  if (mentions.isEmpty) return [(text: body, mentionId: null)];

  final gecerli =
      mentions
          .where((m) => m.at >= 0 && m.len > 0 && m.at + m.len <= body.length)
          .toList()
        ..sort((a, b) => a.at.compareTo(b.at));

  final parts = <MentionPart>[];
  var imlec = 0;
  for (final m in gecerli) {
    // ⚠️ Çakışan aralık atılıyor: iki bahsetme aynı harfleri paylaşamaz ve ikisini birden
    // basmak metni ÇOĞALTIRDI.
    if (m.at < imlec) continue;
    if (m.at > imlec) {
      parts.add((text: body.substring(imlec, m.at), mentionId: null));
    }
    parts.add((text: body.substring(m.at, m.at + m.len), mentionId: m.id));
    imlec = m.at + m.len;
  }
  if (imlec < body.length) {
    parts.add((text: body.substring(imlec), mentionId: null));
  }
  return parts.isEmpty ? [(text: body, mentionId: null)] : parts;
}

/// ⭐ YAZARIN EKRANDA GÖRÜNEN ADI.
///
/// ⚠️⚠️ Ad `null` ise oyuncu **dünyadan kaldırılmış** demek ve ham `id` ASLA yazılmamalı
/// (sunucu şemasının yorumu bunu şart koşuyor): kimlik numarası oyuncuya hiçbir şey
/// anlatmıyor ama bir kimliği ifşa ediyor.
/// ⚠️ Gönderen `null` ise sistem duyurusu — o da ad taşımıyor ama anlamı farklı.
String senderLabel(RoomMessage m) {
  if (m.senderId == null) return 'Sistem';
  final ad = m.senderName;
  return ad == null || ad.isEmpty ? 'kaldırılmış oyuncu' : ad;
}

/// ⭐ ODA HATA KODU → TÜRKÇE METİN.
///
/// ⚠️⚠️ **Üç kodda sunucunun KENDİ metni kullanılıyor** (`slow_mode`, `banned`,
/// `global_account_too_new`): o metinler **SÜRE taşıyor** («14 dakika daha…») ve istemcide
/// yeniden yazmak o bilgiyi kaybettirirdi. Bu yüzden fonksiyon hem kodu hem sunucu mesajını
/// alıyor.
///
/// ⚠️ Kaynak liste `packages/contracts/src/chat.ts` · `chatErrorCode`. Karşılığı yazılmayan
/// bir kod genel cümleye düşer ve oyuncu neden reddedildiğini öğrenemez.
const Set<String> kServerWorded = {
  'slow_mode',
  'banned',
  'alliance_muted',
  'global_account_too_new',
  'alliance_new_member_restricted',
};

const Map<String, String> kRoomError = {
  'rate_limited': 'Çok hızlı yazıyorsun, birkaç saniye bekle.',
  'duplicate_message': 'Aynı mesajı az önce gönderdin.',
  'too_long': 'Mesaj çok uzun.',
  'global_disabled': 'Genel sohbet şu an kapalı.',
  'alliance_chat_disabled': 'İttifak sohbeti şu an kapalı.',
  'not_alliance_member': 'Bir ittifakta değilsin.',
  'not_a_member': 'Bu sohbete erişimin yok.',
};

String roomErrorText(String? code, String? serverMessage) {
  // ⚠️ Sunucu metni önce: süre taşıyan kodlarda istemcinin sabit cümlesi bilgi kaybı olurdu.
  if (code != null && kServerWorded.contains(code)) {
    final m = serverMessage;
    if (m != null && m.isNotEmpty) return m;
  }
  return kRoomError[code ?? ''] ?? 'Mesaj gönderilemedi.';
}

/// ⭐ «YAZIYOR…» ŞERİDİNİN METNİ.
///
/// ⚠️⚠️ Şerit **koşulsuz** çiziliyor, yalnız metni gidip geliyor (çağıranın işi): belirip
/// kaybolan bir şerit, son mesajı sürekli yukarı zıplatıyor. Web'de kullanıcı tam bunu
/// bildirdi: *"karşı taraftaki kişinin yazıyor bilgisi sohbet ekranı doluyken zıplamalara
/// sebep oluyor."*
///
/// ⚠️ Üçten fazla yazan varsa ad SAYILMIYOR: on kişilik bir odada on ad şeride sığmaz ve
/// zaten okunmaz.
String typingText(List<String> names) {
  if (names.isEmpty) return '';
  if (names.length == 1) return '${names.first} yazıyor…';
  if (names.length == 2) return '${names[0]} ve ${names[1]} yazıyor…';
  return 'birkaç kişi yazıyor…';
}

/// ⭐ MEVCUDİYET METNİ — «3 kişi bağlı».
///
/// ⚠️ Sayı `global:chat:presence` olayından geliyor ve **hiçbir tabloda durmuyor**: yalnız o
/// anda var. Bu yüzden sorguyla değil, yük taşıyan olayla geliyor.
/// ⚠️ Sayı bilinmiyorsa boş dize — «0 kişi bağlı» yazmak, kendisi bağlıyken yalan olurdu.
String presenceText(int? count) =>
    count == null || count <= 0 ? '' : '$count kişi bağlı';

/* ══ BALONCUK KARARLARI (F4, 2026-08-22) ══════════════════════════════════════════════════
   Oda sohbetleri bugüne kadar DÜZ SATIR çiziyordu; kullanıcı baloncuk, hizalama ve gönderen
   ayrımı istedi. Web'in üç sohbeti de baloncuk kullanıyor ve kararlar oradan alındı. */

/// Bu mesaj benim mi?
///
/// ⚠️⚠️ **`m.senderId == myId` YAZILAMAZ.** İki taraf da `null` olabiliyor: kimliğim henüz
/// yüklenmediyse `myId` null, **sistem duyurusunun `senderId`i de null**. `null == null`
/// doğru döndüğü için sistem duyurusu bir an "benim mesajım" gibi çizilirdi — sağa yaslı,
/// dolu accent baloncukla. `chat_rules.dart` · `isMine` aynı tuzağı DM tarafında anlatıyor;
/// oda tarafında kural yazılıydı ama iki sheet de onu çağırmayıp ham karşılaştırma
/// yapıyordu (2026-08-22'de bulundu).
bool roomIsMine(RoomMessage m, int? myId) =>
    m.senderId != null && myId != null && m.senderId == myId;

/// Sistem duyurusu mu? ⚠️ Ayrı çiziliyor: ne benim ne başkasının, bir tarafa yaslanmamalı.
bool isSystemMessage(RoomMessage m) => m.senderId == null;

/// Gönderen adı bu satırda yazılsın mı?
///
/// ⚠️⚠️ ARD ARDA GELEN AYNI GÖNDEREN GRUPLANIYOR (web'deki `sameAsPrev`): beş mesaj yazan
/// birinin adını beş kez yazmak, ekranın yarısını aynı adla doldurmak demek.
///
/// ⚠️ Kendi mesajımda ad HİÇ yazılmıyor: baloncuk zaten sağda ve dolu renkte, adı da
/// eklemek aynı bilgiyi üçüncü kez söylemek olurdu.
///
/// ⚠️⚠️ `onceki` **daha ESKİ** mesaj demek. Liste `reverse: true` çiziliyor (index 0 dipte,
/// en yeni), yani çağıranın vereceği şey `mesajlar[i + 1]` — `i - 1` DEĞİL. Ters listede
/// yanlış komşuyu vermek, grubun ilk mesajını adsız bırakıp sonuncusuna ad yazdırırdı.
bool showSenderName(RoomMessage m, RoomMessage? onceki, int? myId) {
  if (isSystemMessage(m)) return false;
  if (roomIsMine(m, myId)) return false;
  if (onceki == null) return true;
  if (isSystemMessage(onceki)) return true;
  return onceki.senderId != m.senderId;
}

/// Bu mesajda benden bahsedilmiş mi?
///
/// ⚠️ Baloncuğu kalın çerçeveyle işaretlemek için: gövdedeki vurgu tek başına yetmiyor,
/// kayan bir listede göz önce baloncuğun biçimine takılıyor.
bool mentionsMe(RoomMessage m, int? myId) =>
    myId != null && m.mentions.any((x) => x.id == myId);
