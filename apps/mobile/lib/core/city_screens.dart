/// ⭐ ŞEHİR EKRANLARININ TEK KAYNAĞI — Baraka · Yapılar · Savunma · Akademi · Tapınak.
///
/// Web'deki `apps/web/src/lib/city-screens.ts` ile **birebir aynı liste ve aynı eşleştirme
/// kuralı**. Orada bu liste bir ara üç ayrı yerde duruyordu (sol menü, geri butonunun koşulu,
/// mobil hub) ve biri güncellenip diğeri unutulunca aktivite noktası sessizce kayboluyordu;
/// mobil şerit **dördüncü kopya** olacaktı.
///
/// ⚠️ Yollar web ile aynı — bildirim derin bağlantısı için şart (`shell.dart` gerekçesi).
library;

class CityScreen {
  const CityScreen({
    required this.path,
    required this.label,
    required this.hint,
    required this.icon,
  });

  /// Rota — web'deki `<Route path>` ile birebir.
  final String path;

  /// Sekmede ve liste satırında görünen ad.
  final String label;

  /// Yalnız hub liste satırının ikinci satırı; sekmede kullanılmaz.
  final String hint;

  /// `assets/buildings/<icon>.png` — yalnız hub. ⚠️ Sekmeler İKONSUZ (kullanıcı şartı):
  /// beş ikon dar ekranda şeridi iki katına çıkarır ve hepsi tek kelimeyle ayırt ediliyor.
  final String icon;
}

const List<CityScreen> kCityScreens = [
  CityScreen(
    path: '/barracks',
    label: 'Baraka',
    hint: 'Savaşçı üret',
    icon: 'barracks',
  ),
  CityScreen(
    path: '/buildings',
    label: 'Yapılar',
    hint: 'Bina yükselt',
    icon: 'castle',
  ),
  CityScreen(
    path: '/defense',
    label: 'Savunma',
    hint: 'Sur ve savunma birimleri',
    icon: 'architect_school',
  ),
  CityScreen(
    path: '/academy',
    label: 'Akademi',
    hint: 'Teknik araştır',
    icon: 'academy',
  ),
  CityScreen(
    path: '/temple',
    label: 'Tapınak',
    hint: 'Kahramanlar',
    icon: 'temple',
  ),
];

/// Bu yol bir şehir ekranı mı? Değilse `null`.
///
/// ⚠️ Eşleşme `==` DEĞİL, **sınır kontrollü ön ek** — web'deki `matchCityScreen` ile aynı kural.
/// Düz `startsWith` yazılsaydı ileride eklenecek `/academy-x` gibi bir rota **sessizce** şehir
/// ekranı sayılırdı; tam eşitlik ise `/barracks/123` biçiminde bir alt yol eklendiğinde şeridi
/// sessizce kaybederdi. İkisinin arası: ya tam eşit ya da hemen ardından `/`.
CityScreen? matchCityScreen(String path) {
  for (final s in kCityScreens) {
    if (path == s.path || path.startsWith('${s.path}/')) return s;
  }
  return null;
}
