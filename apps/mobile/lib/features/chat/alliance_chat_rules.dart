/// ⭐⭐ İTTİFAK SOHBETİ YETKİ MATRİSİ — kim kimi susturabilir, kimin mesajı kaldırılabilir.
/// **Saf fonksiyonlar.**
///
/// ⚠️⚠️ **NEDEN İSTEMCİDE DE VAR.** Kural sunucuda (`assertCanModerate`) ve son sözü o
/// söylüyor; buradaki kopya karar VERMİYOR, yalnız **düğmeyi göstermiyor**. Ayrımı korumak
/// şart: gösterilen bir düğmenin reddedilmesi, hiç gösterilmemesinden çok daha kötü bir
/// deneyim — üstelik ittifak yönetimi nadir bir iş ve oyuncu neden reddedildiğini anlamıyor.
///
/// ⚠️ Matris sunucudan **kopyalandığı için** ayrışma riski taşıyor. Bu yüzden testler kuralı
/// tek tek sayıyor ve her birinin gerekçesi sunucudaki cümleyle birlikte yazılı.
library;

/// İttifak rütbeleri — sunucudaki `ROLE` ile **aynı sayılar** (`alliance.service.ts`).
///
/// ⚠️ Sayılar sıralı ve karşılaştırmalar (`>=`) buna dayanıyor: Konsey Asker'den büyük, Lider
/// Konsey'den büyük. Enum yapmadık çünkü sunucu ham sayı gönderiyor ve bilinmeyen bir değer
/// (ileride eklenecek bir rütbe) enum'da ayrıştırma hatası olurdu.
abstract final class MwRole {
  static const int member = 1;
  static const int council = 2;
  static const int leader = 3;
}

String roleLabel(int role) => switch (role) {
  MwRole.leader => 'Lider',
  MwRole.council => 'Konsey',
  _ => 'Asker',
};

/// ⭐ SUSTURABİLİR MİYİM?
///
/// Sunucudaki üç kapının birebir karşılığı:
///   1. **Konsey ya da Lider olmalıyım** — Asker kimseyi susturamaz.
///   2. **Kendimi susturamam** (`mute_self`).
///   3. **Konsey yalnız Asker'i susturabilir**; Lider susturulamaz (`mute_hierarchy`).
///
/// ⚠️ Üçüncü kural İKİ ayrı satır ve ikisi de gerekli: Lider olmayan biri Konsey'e
/// dokunamıyor, ve Lider bile başka bir Lider'e dokunamıyor (tek liderli ittifakta ikinci
/// koşul yalnız kendisi için tetiklenir ama kural rütbeye bakıyor, kimliğe değil).
bool canMute({
  required int myRole,
  required int myPlayerId,
  required int targetRole,
  required int targetPlayerId,
}) {
  if (myRole < MwRole.council) return false;
  if (targetPlayerId == myPlayerId) return false;
  if (myRole != MwRole.leader && targetRole >= MwRole.council) return false;
  if (targetRole == MwRole.leader) return false;
  return true;
}

/// ⭐⭐ MESAJI KALDIRABİLİR MİYİM?
///
/// Rütbe matrisi susturmayla **birebir aynı** (kullanıcı, 2026-08-11: *"susturmayla aynı
/// yetki"*) — ayrışan yalnız «kime uygulanır» sorusu, çünkü öteki bir ÜYEYE, bu bir MESAJA
/// uygulanıyor:
///
/// ⚠️⚠️ **KENDİ MESAJIM SERBEST** — susturmanın tersine. «Kendini susturamazsın» anlamlı bir
/// koruma; «kendi sözünü geri alamazsın» değil. Susturma ileriye, silme geriye bakıyor. Bu
/// asimetri istemci kopyasında en kolay kaçırılacak yer ve testle kilitli.
///
/// ⚠️⚠️ **AYRILMIŞ ÜYENİN MESAJI SERBEST.** Mesajlar üyelikten bağımsız yaşıyor (`sender_id`
/// yabancı anahtar taşımıyor); rütbesi artık bu ittifağın rütbesi olmadığı için hiyerarşi
/// sorusu anlamsız. Kapatsaydık ayrılan bir üyenin küfrü kanalda **kalıcı** olurdu — tam da
/// silmenin var olma sebebi. İstemcide "ayrılmış" demek: gönderen üye listesinde YOK.
///
/// ⚠️ `senderId` `null` (sistem duyurusu) → kaldırılamaz: silinecek bir sahibi yok.
bool canDeleteMessage({
  required int myRole,
  required int myPlayerId,
  required int? senderId,
  required int? senderRole,
}) {
  if (myRole < MwRole.council) return false;
  if (senderId == null) return false;
  // Kendi sözüm — rütbeye hiç bakılmıyor.
  if (senderId == myPlayerId) return true;
  // Üye listesinde yok → ittifaktan ayrılmış; hiyerarşi sorusu anlamsız.
  if (senderRole == null) return true;
  if (myRole != MwRole.leader && senderRole >= MwRole.council) return false;
  if (senderRole == MwRole.leader) return false;
  return true;
}

/// ⭐ SUSTURMA SÜRESİ SEÇENEKLERİ.
///
/// ⚠️⚠️ `null` = **KALICI** ve sözleşmede alan `.optional()` DEĞİL, zorunlu + nullable. Sunucu
/// yorumu gerekçeyi yazıyor: isteğe bağlı olsaydı alanı unutmak **en ağır cezayı kazara**
/// verirdi. İstemcide de aynı disiplin — kalıcı seçenek listede AÇIKÇA duruyor, varsayılan
/// olarak düşmüyor.
///
/// ⚠️ Üst sınır 30 gün (43.200 dk) — daha uzunu için kalıcı susturma var.
const List<({String label, int? minutes})> kMuteDurations = [
  (label: '10 dakika', minutes: 10),
  (label: '1 saat', minutes: 60),
  (label: '1 gün', minutes: 1440),
  (label: '7 gün', minutes: 10080),
  (label: 'Kalıcı', minutes: null),
];

/// Üye satırındaki susturma etiketi. Boş dize → susturulmamış.
///
/// ⚠️ Süreli ile kalıcı AYRI yazılıyor: «susturuldu» tek başına, cezanın ne zaman biteceğini
/// soran üyeye cevap vermiyor.
String muteLabel({required bool muted, required String? until}) {
  if (!muted) return '';
  return until == null || until.isEmpty ? 'kalıcı susturuldu' : 'susturuldu';
}
