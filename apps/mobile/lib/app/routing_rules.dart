/// ⭐ YÖNLENDİRME KURALI — oturumlu/misafir kapısının TEK karar noktası.
///
/// Saf fonksiyon olması bilinçli ve deponun yerleşik deseni (`lib/city-screens.ts`,
/// `lib/deep-link.ts` ile aynı gerekçe): bir `redirect` geri çağrısının içine gömülseydi
/// **hiçbir şekilde sınanamazdı** — Flutter'da yönlendirici testi bütün bir uygulama ağacı
/// ayağa kaldırmayı gerektiriyor.
///
/// ⚠️⚠️ Burada yapılabilecek en pahalı hata bir **yönlendirme döngüsü**: A → B → A. go_router
/// bunu çalışma anında yakalayıp uygulamayı kırmızı hata ekranına çeviriyor, üstelik yalnız o
/// yola giden oyuncuda. `routing_rules_test.dart` her yol için "hedefin kendisi artık
/// yönlendirmiyor" değişmezini tarayarak bu sınıfı bütünüyle kapatıyor.
library;

/// Giriş ekranı. ⚠️ Web'de karşılığı YOK (orada giriş bir modal), bu yüzden «yollar web ile
/// aynı» kuralının dışında — hiçbir bildirim yükü buraya işaret etmiyor.
const String kAuthPath = '/auth';

/// Misafirin karşılandığı ana sayfa — web'deki `Landing` (`App.tsx` misafir dalı).
const String kLandingPath = '/';

/// Giriş yaptıktan sonra HER KOŞULDA gidilen yer.
/// ⭐ Web ile aynı karar (`App.tsx:135`): oyun zamanlanmış olaylar üzerine kurulu, oyuncunun
/// ilk sorusu daima *"şu an ne oluyor?"*.
const String kHomePath = '/armies';

/// ⭐ Oturum İSTEMEYEN yollar — web'deki `GuestApp` rota tablosuyla aynı küme.
///
/// ⚠️ `/simulate` sunucuda gerçekten oturumsuz çalışıyor: uç `OptionalAuthGuard` ile korunuyor
/// ve kimlik yoksa dünya-0 denge katmanına düşüyor (`simulate.controller.ts:38`). Yani bu liste
/// bir istemci nezaketi değil, sunucunun davranışının aynası.
///
/// ⚠️ `/destek` misafire açık olmak ZORUNDA (kullanıcı şartı): desteğe en çok ihtiyaç duyan
/// kişi zaten giriş YAPAMAYAN kişidir.
const Set<String> kGuestPaths = {
  kLandingPath,
  kAuthPath,
  '/simulate',
  '/help',
  '/destek',
};

/// Bu yol misafire açık mı?
///
/// ⚠️ Eşleşme `==` DEĞİL, **sınır kontrollü ön ek** — `lib/city-screens.ts`teki
/// `matchCityScreen` ile aynı gerekçe. Düz `startsWith` yazılsaydı ileride eklenecek
/// `/helpdesk` gibi bir rota sessizce misafire açılırdı; tam eşitlik ise `/help/sefer`
/// alt yolunu sessizce kapatırdı. İkisinin arası: ya tam eşit ya da hemen ardından `/`.
///
/// ⚠️ `kLandingPath` (`/`) bu kuralın dışında tutuluyor: her yol `/` ile başladığı için
/// ön ek kontrolü onu «her şey misafire açık»a çevirirdi.
bool isGuestPath(String location) {
  if (location == kLandingPath) return true;
  return kGuestPaths.any(
    (p) => p != kLandingPath && (location == p || location.startsWith('$p/')),
  );
}

/// Gidilecek yer — değişiklik gerekmiyorsa `null`.
///
/// İki kural, ikisi de tek yönlü:
///   • Misafir, oturum isteyen bir yola gidemez → ana sayfa.
///   • Oturumlu oyuncunun karşılama/giriş ekranında durmasının anlamı yok → oyuna al.
///
/// ⚠️ Oturumlu oyuncu `/simulate`, `/help`, `/destek`e **girebilir** — o ekranlar ikisine de
/// açık. Misafir kümesini "yalnız misafir" diye okumak, oturumlu oyuncuyu kendi
/// simülatöründen atardı.
String? authRedirect({required String location, required bool signedIn}) {
  if (!signedIn) return isGuestPath(location) ? null : kLandingPath;
  if (location == kLandingPath || location == kAuthPath) return kHomePath;
  return null;
}
