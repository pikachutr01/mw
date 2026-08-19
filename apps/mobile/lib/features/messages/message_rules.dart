/// ⭐⭐ POSTA KUTUSU KURALLARI — tür kataloğu · sekme rozeti · sayfa kelepçesi · rapor
/// başlığı. **Saf fonksiyonlar.**
///
/// Web'de bu kararlar `screens/Messages.tsx` içinde bileşenlerin arasına serpilmişti; burada
/// tek dosyada ve ölçülebilir. Gerekçe `movement_rules.dart` ile aynı: dört ayrı yer bunları
/// okuyor (liste satırı, sekme rozeti, detay sheet'i, savaş raporu başlığı) ve widget'ın
/// içine yazılan bir kural ölçülmeyen bir karardır.
library;

import '../../gen/contracts.g.dart';
import 'message.dart';

/// ⭐ RAPOR TÜR KATALOĞU (kullanıcı, 2026-07-30): her türün kendi ikonu ve satır başlığı var —
/// **Ordular sayfasıyla AYNI görev ikonları** (`assets/missions/`).
///
/// Anahtar `kind:side`; aynı olayın iki tarafı aynı `kind`i taşıyor ve onları `side` ayırıyor.
/// ⚠️ `subject` başlık DEĞİL, ikinci satırdaki ayrıntı: sunucunun yazdığı konu olaydan olaya
/// değişiyor ve liste satırının tek tip kalması isteniyor.
///
/// ⚠️ `return_report` yalnız ESKİ kayıtlar için: dönüş artık rapor üretmiyor, bildirim
/// üretiyor. Satır silinmedi çünkü o tarihten önceki raporlar hâlâ posta kutusunda.
const Map<String, ({String? icon, String title})> kReportType = {
  'battle_report:attacker': (icon: 'attack', title: 'Saldırı Raporu'),

  /// ⭐⭐ **«ŞEHİR SAVUNMA RAPORU» — orijinalin kendi başlığı** (2026-08-11).
  ///
  /// Bir süre «Saldırı Önleme Raporu» yazıyordu; kulağa doğru geliyordu çünkü casusluğun
  /// savunan tarafı gerçekten «Casusluk Önleme Raporu» (`k.a[31]`). Ama orijinal istemci
  /// saldırı için **başka bir kelime** kullanıyor: `docs/JAVA_ROENTGEN.md` §6.4 → mesaj kutusu
  /// çizici `o.java:281-283` savunan tarafta başlığı `k.a[159]` = «Şehir Savunma» ile
  /// değiştirip sonuna `k.a[12]` = «` Raporu`» ekliyor. Dize tablosunda «Saldırı Önleme» diye
  /// bir kayıt **hiç yok**.
  ///
  /// ⚠️ Ders: «Casusluk Önleme»yi «Saldırı Önleme»ye genellemek makul bir çıkarımdı ama
  /// yanlıştı. Ekranda görünen her metin `k.java` dize tablosunda duruyor; genellemeden önce
  /// **aranmalı**.
  'battle_report:defender': (icon: 'attack_in', title: 'Şehir Savunma Raporu'),
  'spy_report:spy': (icon: 'spy_out', title: 'Casusluk Raporu'),
  'spy_report:target': (icon: 'spy_back', title: 'Casusluk Önleme Raporu'),
  'transport_report:receiver': (
    icon: 'transport_back',
    title: 'Gelen Nakliye Raporu',
  ),
  'transport_report:sender': (
    icon: 'transport_out',
    title: 'Giden Nakliye Raporu',
  ),
  'support_report:receiver': (icon: 'support_out', title: 'Destek Raporu'),
  'found_city_report:owner': (icon: 'found_city', title: 'Şehir Kurma Raporu'),
  'return_report:owner': (icon: 'teleport', title: 'Ordu Döndü'),

  /* İttifak satırları MESAJLAR sekmesinde yaşıyor (doküman: davetler mesaj kutusunda).
     ⚠️ İkonsuz: `assets/missions/` altında bir ordu hareketi karşılığı yok ve oraya bir görev
     ikonu koymak satırı gerçekte olmayan bir seferle ilişkilendirirdi. */
  'alliance_invite:owner': (icon: null, title: 'İttifak Daveti'),
  'alliance_application:owner': (icon: null, title: 'İttifak Başvurusu'),
  'alliance_message:owner': (icon: null, title: 'İttifak Mesajı'),
};

/// Satırın ikonu ve başlığı. ⚠️ Bilinmeyen tür **yutulmuyor**: sunucunun yazdığı konu
/// başlığa düşüyor, yani yeni bir tür eklendiğinde satır boş görünmüyor.
({String? icon, String title}) reportType(
  String kind,
  String? side,
  String subject,
) {
  final hit = kReportType['$kind:${side ?? ''}'];
  if (hit != null) return hit;
  if (kind == 'system') return (icon: null, title: 'Sistem');
  return (icon: null, title: subject);
}

/// ⭐ RAPOR MU MESAJ MI — sunucunun SQL deseninin (`kind LIKE '%\_report'`) birebir karşılığı.
///
/// ⚠️ Bugün süzme **sunucuda** yapılıyor; bu fonksiyon listeyi ayırmıyor. Yine de duruyor:
/// tür kataloğunun hangi satırının hangi sekmeye düştüğünü **testle kilitliyor**. Kural liste
/// olarak değil desen olarak yazıldı ki yeni bir rapor türü (§EKSIK «Mağara Raporu»)
/// eklendiğinde burayı güncellemek gerekmesin.
bool isReport(String kind) => kind.endsWith('_report');

/// Sayfa sayısı — en az 1. ⚠️ Boş kutuda `0 / 0` yazmak "veri gelmedi" gibi görünürdü.
int pageCount(int total, int pageSize) {
  if (pageSize <= 0) return 1;
  final n = (total + pageSize - 1) ~/ pageSize;
  return n < 1 ? 1 : n;
}

/// ⭐ SAYFA KELEPÇESİ — web'de gerçek bir kusurdu ve buraya taşındı.
///
/// ⚠️ Toplam **küçülebiliyor**: arka planda gelen bir tazeleme ya da başka bir cihazdan
/// silinen kayıtlar son sayfada duran oyuncuyu boş listeye bakar hâlde bırakıyor. Gösterilen
/// sayfa ile İSTENEN sayfa daima aynı olmalı, yoksa sayfalayıcı `2/1` gibi bir şey yazarken
/// sorgu hâlâ olmayan sayfayı ister.
int clampPage(int page, int pageCount) {
  if (page < 0) return 0;
  final last = pageCount - 1;
  return page > last ? last : page;
}

/// Sekmedeki okunmamış sayısı. `0` → rozet çizilmez.
///
/// ⚠️ Sayaçlar **sunucudan**: sayfalama sunucuya inince istemcinin elinde artık tüm liste
/// yok, "okunmamışları say" istemcide yapılamaz.
///
/// ⭐ **Sohbetlerin okunmamışı MESAJLAR sekmesine ekleniyor** (2026-08-18, Sohbet turunda
/// bağlandı). İki kaynak: `messages` tablosu (ittifak daveti, sistem duyurusu) ve `chat_*`
/// (DM). ⚠️ Raporlar sekmesine EKLENMİYOR — DM bir rapor değil ve oraya eklemek, oyuncuyu
/// savaş raporu ararken sohbete yönlendirirdi.
int tabUnread(
  ({int unreadReports, int unreadMessages}) counts,
  String tab, {
  int chatUnread = 0,
}) => tab == 'reports'
    ? counts.unreadReports
    : counts.unreadMessages + chatUnread;

/// ⭐⭐ POSTA KUTUSU SATIRI — oyun mesajı ya da DM sohbeti.
///
/// ⚠️ Mesajlar sekmesi **İKİ KAYNAKLI** (kullanıcı kararı, 2026-07-31): oyun mesajları
/// (`messages` tablosu) ile DM sohbetleri (`chat_*`) tarihe göre TEK listede yaşıyor.
/// **Sunucuda birleştirme YOK**: DM satırı `messages` tablosuna yazılmıyor (rapor kutusunu
/// kirletmemesi için), iki sorgu istemcide birleşiyor.
sealed class InboxRow {
  const InboxRow();

  /// Sıralama çıpası — ISO damga.
  String? get at;

  bool get unread;

  /// ⚠️ Seçim anahtarı **ön ekli**: iki kaynağın kimlikleri aynı sayı olabiliyor ve tek
  /// kümede yaşıyorlar. Ön ek olmasaydı 7 numaralı mesajı seçmek 7 numaralı sohbeti de
  /// seçili gösterirdi.
  String get key;
}

final class InboxMessage extends InboxRow {
  const InboxMessage(this.message);

  final MessageRow message;

  @override
  String? get at => message.at;

  @override
  bool get unread => message.unread;

  @override
  String get key => 'm${message.id}';
}

final class InboxChat extends InboxRow {
  const InboxChat(this.chat);

  final ChatConversation chat;

  @override
  String? get at => chat.lastMessageAt;

  @override
  bool get unread => chat.unreadCount > 0;

  @override
  String get key => 'c${chat.channelId}';
}

/// ⭐ İKİ KAYNAĞI BİRLEŞTİR — en yeni üstte.
///
/// ⚠️ Sohbetler **yalnız Mesajlar sekmesinde ve yalnız İLK SAYFADA**. Sebep: sohbetler
/// sayfalanmıyor (liste doğası gereği kısa) ve sayfalanan bir listeye sayfalanmayan bir
/// kaynağı her sayfada eklemek, aynı sohbetleri her sayfada tekrar göstermek olurdu.
///
/// ⚠️ Damgası olmayan sohbet (hiç mesaj yazılmamış) **en sona** düşüyor, gizlenmiyor: oyuncu
/// açtığı boş sohbeti listede görebilmeli.
///
/// ⚠️ Sıralama ISO dizesini **ayrıştırarak** yapıyor, dizeyi doğrudan karşılaştırarak değil:
/// iki kaynak aynı biçimi kullanıyor ama bu bir garanti değil ve sözlük sıralaması sessizce
/// yanlış sonuç verir.
List<InboxRow> mergeInbox({
  required List<MessageRow> messages,
  required List<ChatConversation> chats,
  required String tab,
  required int page,
}) {
  final satirlar = <InboxRow>[
    for (final m in messages) InboxMessage(m),
    if (tab == 'messages' && page == 0)
      for (final c in chats) InboxChat(c),
  ];

  int an(String? iso) =>
      DateTime.tryParse(iso ?? '')?.millisecondsSinceEpoch ?? 0;

  // ⚠️ Eşitlikte anahtara göre ayrılıyor: eşit damgalı iki satırda sıralama kararsız kalırsa
  // liste her tazelemede yer değiştirir ve oyuncunun dokunmak üzere olduğu satır kayar.
  satirlar.sort((a, b) {
    final fark = an(b.at).compareTo(an(a.at));
    return fark != 0 ? fark : a.key.compareTo(b.key);
  });
  return satirlar;
}

/// ⭐ SONUÇ BAŞLIĞI — orijinal oyunun kalıbı (`k.java`).
///
/// ⚠️ Beraberlik ayrı bir dal: `won` tek başına okunsaydı berabere biten savaş «Kaybettiniz !»
/// yazardı. Sunucu `won`u zaten doğru hesaplıyor ama beraberde ikisi de yanlış olurdu.
String battleHeadline({required String winner, required bool won}) {
  if (winner == 'draw') return 'Berabere';
  return won ? 'Kazandınız !' : 'Kaybettiniz !';
}

/// ⭐⭐ MAĞARANIN DURUMU — **ÜÇ hâl, iki değil** (sunucu turu, 2026-08-19'da birleştirildi).
///
/// ⚠️⚠️ Bu port düzeltme ÖNCESİ web kodundan yazıldığı için aynı kusuru taşıyordu: `broken`
/// olmayan her şeye «dayandı» (yeşil) deniyordu. Oysa mağara **zaten yıkıksa** saldırı onu
/// yıkmamış olur ama «dayandı» demek düpedüz yanlış — üstelik notta «zaten onarımdaydı»
/// yazarken kutu başarı rengiyle dayandığını söylüyordu, yani ekranın iki parçası birbirini
/// yalanlıyordu. Web'de aynı gün düzeltildi (`Messages.tsx`), mobil onu bu turda yakaladı.
///
/// ⚠️ Sözcük `reason` alanından geliyor ve o alan sunucuda zaten vardı: eksik olan istemcinin
/// onu OKUMASIYDI. `broken`a bakıp `reason`u yok saymak, üç hâli ikiye indiriyordu.
enum MwCaveState { broken, alreadyBroken, held }

MwCaveState caveState({required bool broken, required String? reason}) {
  if (broken) return MwCaveState.broken;
  if (reason == 'already_repairing') return MwCaveState.alreadyBroken;
  return MwCaveState.held;
}

String caveStateLabel(MwCaveState s) => switch (s) {
  MwCaveState.broken => 'YIKILDI',
  MwCaveState.alreadyBroken => 'zaten yıkıktı',
  MwCaveState.held => 'dayandı',
};

/// ⭐ MAĞARA İPUCU — «bir dahaki sefere kaç cüce gerekiyor».
///
/// ⚠️ Yalnız SALDIRANA ve yalnız mağara **dayandığında** gösteriliyor. Savunana göstermek
/// kendi mağarasının kırılma eşiğini rakibin gözünden okumak olurdu; kırılmış mağarada ise
/// sayının bir anlamı kalmıyor.
bool showCaveRequirement({
  required String side,
  required bool broken,
  required String? reason,
}) => side == 'attacker' && !broken && reason == 'not_enough_dwarves';

/// Sur bütünlüğü yüzdesi. ⚠️ Sunucu `0..1` aralığında oran gönderiyor, ekranda yüzde yazıyor.
int wallPercent(double integrity) => (integrity * 100).round();

/// ⭐ NE SIZDI — casusluk ÖNLEME raporundaki kademe etiketi (savunan tarafı).
///
/// ⚠️⚠️ Bu etiketler `gatherIntel`in kademeleriyle **AYNI ŞEYİ** anlatmak zorunda: kapsam
/// büyüyüp etiket olduğu yerde kalırsa savunan "ne sızdı" sorusuna yanlış cevap alır.
/// Kahraman ve Teleport 2026-08-07'de eklendi; buraya da yazıldı.
///
/// ⚠️ Bilinmeyen kademe ham adıyla dönüyor: sunucuya yeni bir kademe eklendiğinde savunan
/// boş bir cümle değil, en azından anahtarı görür.
const Map<String, String> kLeakLabel = {
  'resources': 'kaynak miktarı',
  'economy': 'kaynak + Maden/Çiftlik seviyesi',
  'armyTotals': '+ toplam savaşçı ve savunma sayısı',
  'armyTypes': '+ birim tipleri ve kahraman sayısı',
  'armyCounts':
      '+ savaşçıların tek tek sayıları, kahramanların seviye ve yetenekleri',
  'full':
      'TAM RAPOR (teknikler + Kale/Sur/Kalkan/Mağara/Teleport seviyesi dahil)',
};

String leakLabel(String level) => kLeakLabel[level] ?? level;

/// ⭐ ŞEHİR KURMA BAŞARISIZLIK GEREKÇESİ — sunucunun `reason` kodunun Türkçesi.
///
/// ⚠️ Bilinmeyen kod için `null`: uydurma bir cümle yazmaktansa hiçbir şey yazmamak doğru.
/// Raporun geri kalanı (koordinat, ordu) zaten oyuncuya ne olduğunu anlatıyor.
String? foundCityReason(Object? reason) => switch (reason) {
  'slot_taken' => 'Ordu varmadan önce oraya başka bir oyuncu şehir kurdu.',
  'city_limit' => 'Şehir hakkın dolduğu için kurulamadı; ordu geri dönüyor.',
  _ => null,
};

/// ⛔ **BU DOSYADA SIRALAMA FONKSİYONU YOK — bilinçli.** Sıra sunucudan geliyor
/// (`ORDER BY id DESC`, en yeni üstte) ve istemcide ikinci bir sıralama, aynı kuralın
/// ayrışabilecek bir kopyası olurdu (`movement_rules.dart` sonundaki notla aynı gerekçe).
