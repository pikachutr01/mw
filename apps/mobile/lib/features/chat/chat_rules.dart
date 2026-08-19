/// ⭐⭐ SOHBET KURALLARI — hata metni · baloncuk yönü · yazma hakkı · sayfa imleci.
/// **Saf fonksiyonlar.**
///
/// ⚠️⚠️ Buradaki en kritik karar bir **gizlilik sınırı**: engellenen tarafa sebep
/// SÖYLENMEZ. Sunucu `blocked` kodunu gönderiyor ama ekranda «seni engelledi» yazmıyor —
/// yalnız «Mesajınız iletilemedi!». Bu kullanıcı kararı ve kodun içine gömülseydi bir
/// sonraki düzenlemede farkında olmadan delinebilirdi.
library;

import 'chat_message.dart';

/// ⭐ SUNUCU HATA KODU → OYUNCUYA GÖSTERİLECEK METİN.
///
/// ⚠️⚠️ Kaynak liste `packages/contracts/src/chat.ts` · `chatErrorCode`. O enum'un yorumu
/// açıkça uyarıyor: karşılığı yazılmayan bir kod `default` dalına düşer ve **ham sunucu
/// mesajı sızabilir**. Bu yüzden DM'de görülebilecek kodların hepsi burada.
///
/// ⚠️ Oda sohbetlerinin kodları (`alliance_*`, `global_*`, `mute_*`) BİLEREK yok: o ekranlar
/// mobilde henüz yok ve karşılıksız bir satır, hangi kodun gerçekten kullanıldığını
/// bulanıklaştırırdı. Oda sohbeti gelince buraya eklenecek.
const Map<String, String> kChatError = {
  /// ⚠️⚠️ **SEBEP SÖYLENMEZ** (kullanıcı kararı): bir şeylerin ters gittiği anlaşılır ama
  /// engelin varlığı DOĞRULANMAZ. Sunucu bu yüzden 4xx sınıfını da ayırmıyor.
  'blocked': 'Mesajınız iletilemedi!',

  /// ⚠️ Bu tarafta sebep AÇIKÇA söyleniyor — engeli koyan benim, bilmem gereken benim.
  'blocked_by_me':
      'Bu oyuncuyu engelledin. Mesaj göndermek için engeli kaldır.',
  'rate_limited': 'Çok hızlı yazıyorsun, birkaç saniye bekle.',
  'duplicate_message': 'Aynı mesajı az önce gönderdin.',
  'slow_mode': 'Yavaş mod açık, biraz beklemen gerekiyor.',
  'too_long': 'Mesaj çok uzun.',
  'dm_new_player_restricted': 'Yeni konuşma başlatman için biraz beklemelisin.',
  'self_message': 'Kendine mesaj gönderemezsin.',
  'conversation_not_found': 'Bu sohbet artık yok.',
  'banned': 'Sohbet hakkın kapatılmış.',
  'wrong_world': 'Bu oyuncu başka bir dünyada.',
};

/// ⚠️ Bilinmeyen kod için **sunucunun ham metni DEĞİL**, sabit bir cümle: sunucu mesajları
/// geliştirici diliyle yazılmış olabiliyor ve oyuncuya İngilizce bir teknik dize göstermek
/// §13.14'ün ihlali olurdu.
String chatErrorText(String? code) =>
    kChatError[code ?? ''] ?? 'Mesaj gönderilemedi.';

/// Baloncuk hangi tarafa yaslanacak?
///
/// ⚠️ `senderId == null` **sistem duyurusu** ve benim değil. `m.senderId == myId`
/// karşılaştırması `null == null` durumunda doğru dönerdi (ikisi de null olabilir: kimliğim
/// henüz yüklenmediyse) — o yüzden iki taraf da açıkça eleniyor.
bool isMine(ChatMessage m, int? myId) =>
    m.senderId != null && myId != null && m.senderId == myId;

/// ⭐ ESKİ SAYFA İMLECİ — keyset sayfalama.
///
/// ⚠️ Sunucu **en yeni mesajı önce** döndürüyor, yani sayfanın SON elemanı en eskisi ve bir
/// sonraki isteğin `before` değeri o. İlk elemanı verseydik aynı sayfa sonsuza kadar
/// dönerdi.
/// ⚠️ `hasMore` false ya da sayfa boşsa `null` — çağıran "daha var mı" diye ikinci bir
/// koşul yazmasın.
int? olderCursor(ChatHistoryPage page) {
  if (!page.hasMore || page.items.isEmpty) return null;
  return page.items.last.id;
}

/// ⭐ YAZMA HAKKI — üç kapı, üçü de AYRI sebep.
///
/// ⚠️ **Doğrulanmamış hesap yazamaz ama OKUYABİLİR** (kullanıcı şartı, §verify). Kutuyu
/// baştan kapatmak, oyuncunun mesajı yazıp gönderdikten SONRA reddedilmesinden dürüst.
///
/// ⚠️ `emailVerified` bilgisi **henüz gelmediyse ENGELLEME**: son sözü sunucu söylüyor ve
/// bilgi yokken kutuyu kapatmak, ağ yavaş olduğunda doğrulanmış bir oyuncuyu da susturur.
/// Bu yüzden parametre `bool?` ve yalnız açıkça `false` iken kapatıyor.
({bool canWrite, String? reason}) writeGate({
  required bool blockedByMe,
  required bool? emailVerified,
}) {
  if (blockedByMe) {
    return (canWrite: false, reason: kChatError['blocked_by_me']);
  }
  if (emailVerified == false) {
    return (
      canWrite: false,
      reason:
          'E-postanı doğrulamadan mesaj yazamazsın. Gelen mesajları okuyabilirsin.',
    );
  }
  return (canWrite: true, reason: null);
}

/// Gönder düğmesi açık mı?
///
/// ⚠️ **Kırpılmış** uzunluğa bakılıyor: sunucu da `z.string().trim().min(1)` diyor. Kırpmadan
/// baksaydık boşluklardan ibaret bir mesaj düğmeyi açar ve sunucu reddederdi.
bool canSendDraft(String draft, {required bool canWrite, required bool busy}) =>
    canWrite && !busy && draft.trim().isNotEmpty;

/// ⭐ Gövde üst sınırı — `chat.ts` · `sendChatRequest` ile **aynı sayı**.
///
/// ⚠️ İstemcide elle yazılan bir sınır sunucununkinden ayrışırsa oyuncu yazdığı mesajın
/// reddedildiğini ancak göndermeye çalışınca öğrenir (ad kuralında tam bu yaşanmıştı, bkz.
/// `facts.g.dart` · `kNameMax`).
const int kChatBodyMax = 500;

/// Sayaç ne zaman görünsün — sınıra yaklaşınca. ⚠️ Sürekli görünen bir sayaç, 500 karakterin
/// pratikte hiç dolmadığı bir kutuda yalnız gürültü.
bool showCounter(String draft) => draft.length > 400;

/// ⭐ ÖNİZLEME METNİ — sohbet listesindeki satırın ikinci satırı.
///
/// ⚠️ «Sen: » öneki yalnız son mesajı BEN yazdıysam: karşı tarafın mesajını kendi mesajım
/// sanmak, listede en çok yapılan okuma hatası olurdu.
/// ⚠️ Mesaj hiç yoksa boş dize — «(mesaj yok)» gibi bir yer tutucu, yeni açılmış bir
/// sohbette gereksiz gürültü.
String previewText({required String? lastMessage, required bool lastFromMe}) {
  final m = lastMessage;
  if (m == null || m.isEmpty) return '';
  return lastFromMe ? 'Sen: $m' : m;
}
