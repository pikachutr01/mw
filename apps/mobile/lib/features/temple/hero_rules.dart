/// ⭐ TAPINAK KURALLARI — durum etiketi ve puan dağıtımının sınırları. **Saf fonksiyonlar.**
///
/// ⚠️ Ekrandan ayrı duruyorlar ki sınanabilsinler; buradaki kararların hepsi bir yanlış
/// okumaya açık ve ikisi zaten canlıda düzeltildi (etiket birleştirme, geri alma yasağı).
library;

/// Etiketin tonu — çağıran `MwColors`tan renge çeviriyor.
enum MwHeroTone { muted, success, warning, danger }

typedef MwHeroLabel = ({String text, MwHeroTone tone});

/// ⭐⭐ TEK ETİKET (kullanıcı, 2026-08-01): savaşta ölen kahraman — ordusu sağ kalsa da
/// kalmasa da — **«Yok Edildi»** yazar. Dönüş yolundayken de aynı etiket, yanında geri sayım;
/// şehre varınca Dirilt açılıyor.
///
/// ⚠️ Eskiden `destroyed` ayrı bir durumdu ve o kahraman **siliniyordu**. Artık hiç
/// silinmiyor; iki durum tek etikette birleşti çünkü oyuncu açısından fark yok — ikisinde de
/// kahraman savaşamaz hâlde.
///
/// ⭐ Üç mağara etiketi **orijinalin kendi metinleri** (`k.a[234..236]`) — çevrilmedi,
/// uydurulmadı. «Mağarada» yeşil, çünkü kahraman en güvenli hâlinde: savaşa girmiyor, casus
/// göremiyor. Geçişler nötr: henüz bir şey olmadı, yalnız sayaç işliyor.
///
/// ⚠️ Bilinmeyen durum **ham adıyla ve nötr** dönüyor: sunucuya yeni bir durum eklenirse ekran
/// boş kalmasın. Sessizce «Şehirde» demek, savaşamayan bir kahramanı hazır göstermek olurdu.
MwHeroLabel heroStateLabel(String state) => switch (state) {
  'in_city' => (text: 'Şehirde', tone: MwHeroTone.success),
  'on_mission' => (text: 'Görevde', tone: MwHeroTone.muted),
  'returning' || 'dead' => (text: 'Yok Edildi', tone: MwHeroTone.danger),
  'reviving' => (text: 'Diriltiliyor', tone: MwHeroTone.warning),
  'in_cave' => (text: 'Mağarada', tone: MwHeroTone.success),
  'entering_cave' => (text: 'Mağaraya Giriyor', tone: MwHeroTone.muted),
  'leaving_cave' => (text: 'Mağaradan Çıkıyor', tone: MwHeroTone.muted),
  _ => (text: state, tone: MwHeroTone.muted),
};

/// Tecrübe çubuğunun dolgu oranı (0..1).
///
/// ⚠️ `xpForNext` 0 olabiliyor (tavan seviye ya da sunucu hesaplamadı) — bölme yapılmıyor,
/// çubuk boş çiziliyor. Sıfıra bölmek `NaN` genişlik üretir ve Flutter'da çizim hatası verir.
double xpProgress(int xp, int xpForNext) {
  if (xpForNext <= 0) return 0;
  final o = xp / xpForNext;
  return o < 0 ? 0 : (o > 1 ? 1 : o);
}

/// ⭐⭐ PUAN DAĞITIMI GERİ ALINAMAZ — taslak, kaydedilmiş değerin ALTINA inemez.
///
/// Sunucu da aynı kuralı uyguluyor. İstemcide `−` düğmesini serbest bıraksaydık oyuncu
/// harcanmış bir puanı geri alabildiğini sanır, kaydedince sunucu reddederdi.
///
/// ⚠️ Ama taslak İÇİNDE serbestçe gezilebiliyor: bu turda eklenen puanı geri almak mümkün,
/// yalnız **kaydedilmiş taban** alt sınır. Kullanıcının «puanı saklayıp sonra dağıt» hakkı
/// da bundan çıkıyor.
bool canDecreaseSkill(int draft, int saved) => draft > saved;

/// Kalan puan bittiyse `+` kapanıyor.
bool canIncreaseSkill(int pointsLeft) => pointsLeft > 0;

/// Taslakta kalan puan.
int pointsLeftIn(Map<String, int> draft, int pointsTotal) {
  var harcanan = 0;
  for (final v in draft.values) {
    harcanan += v;
  }
  return pointsTotal - harcanan;
}

/// Kaydet düğmesi açık mı — **değişiklik yoksa kapalı**.
///
/// ⚠️ Sunucuya değişmemiş bir taslağı göndermek boş bir yazma isteği olurdu; üstelik düğmenin
/// açık durması oyuncuya "bir şey değiştirdim" hissi verirdi.
bool canSaveSkills(Map<String, int> draft, int pointsSpent) {
  var harcanan = 0;
  for (final v in draft.values) {
    harcanan += v;
  }
  return harcanan != pointsSpent;
}

/// Ad geçerli mi — **yalnız uzunluk**, desen değil.
///
/// ⚠️ Desen denetimi bilerek YOK: sunucu (`city-name.ts`) `\p{L}\p{N}` ile doğruluyor ve
/// istemcide ikinci bir kopya yazmak, iki kuralın ayrışabileceği bir yer açardı. Uzunluk
/// istemcide çünkü düğmenin ne zaman açılacağını o belirliyor; reddi önce söylemek daha
/// dürüst. ⚠️ Sayılar `gen/facts.g.dart`tan (katalogdan üretiliyor) — elle yazılsaydı web'de
/// yaşanan hata tekrarlanırdı (kutu 2-24 diyordu, sunucu 3-10 istiyordu).
bool isNameLengthOk(String name, {required int min, required int max}) {
  final t = name.trim();
  return t.length >= min && t.length <= max;
}
