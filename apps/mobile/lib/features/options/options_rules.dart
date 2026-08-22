/// ⭐ SEÇENEKLER — saf kurallar. Ekrandan bağımsız, ölçülebilir.
library;

import 'package:flutter/material.dart' show ThemeMode;

/// ⭐⭐ TEMA TERCİHİNİN DEPO ANAHTARI — web'le **birebir aynı** (`localStorage['mw-theme']`).
///
/// ⚠️ Değerler de aynı: `system` · `light` · `dark` (`apps/web/src/lib/hooks.ts` · `useTheme`).
/// İki istemci aynı kavramı aynı adla saklıyor; değerler paylaşılmıyor (biri tarayıcıda, biri
/// cihazda) ama adlandırmayı ayrıştırmanın hiçbir kazancı olmazdı.
const String kThemeKey = 'mw-theme';

/// Diskteki dize → `ThemeMode`.
///
/// ⚠️⚠️ Bilinmeyen/bozuk değer **`system`e** düşüyor, patlamıyor: tema tercihi oyuncunun
/// elinin altındaki bir dosyada duruyor ve bozuk bir değer yüzünden uygulamanın açılmaması
/// orantısız olurdu. `system` aynı zamanda varsayılan — yani "hiç seçim yapılmamış" ile
/// "değer bozuk" aynı yere düşüyor ve ikisi de doğru davranış.
ThemeMode themeModeFromString(String? raw) => switch (raw) {
  'light' => ThemeMode.light,
  'dark' => ThemeMode.dark,
  _ => ThemeMode.system,
};

/// `ThemeMode` → diske yazılacak dize. `themeModeFromString`in tersi.
String themeModeToString(ThemeMode m) => switch (m) {
  ThemeMode.light => 'light',
  ThemeMode.dark => 'dark',
  ThemeMode.system => 'system',
};

/// Seçicideki etiket. ⚠️ «Sistem» ilk sırada: varsayılan o ve çoğu oyuncu ona dokunmuyor.
const List<({ThemeMode mode, String label})> kThemeChoices = [
  (mode: ThemeMode.system, label: 'Sistem'),
  (mode: ThemeMode.light, label: 'Gündüz'),
  (mode: ThemeMode.dark, label: 'Gece'),
];

/* ══ CİHAZ KÜNYESİ (2026-08-22) ═══════════════════════════════════════════════════════════
   Sunucu ham alanlar döndürüyor (`platform`, `deviceModel`, `ua`); okunur tek satıra
   çevirmek istemcinin işi. Web'de aynı iş `DevicesPanel.tsx` içindeki `describe()`
   yapıyor — buradaki karşılığı onunla aynı çıktıyı vermeli, yoksa aynı telefon iki
   istemcide iki farklı adla görünürdü. */

/// Platform kodu → ekran etiketi. ⚠️ Web'deki `PLATFORM_LABEL` ile birebir.
const Map<String, String> kPlatformLabels = {
  'web': 'Tarayıcı',
  'android': 'Android',
  'ios': 'iPhone / iPad',
};

/// ⚠️ Bilinmeyen platform **ham değeriyle** yazılıyor, gizlenmiyor: sunucu yarın yeni bir
/// platform eklerse oyuncu onu görebilmeli. `null` ise elde hiçbir şey yok, o zaman genel
/// etiket.
String platformLabel(String? raw) {
  if (raw == null || raw.isEmpty) return 'Bilinmeyen cihaz';
  return kPlatformLabels[raw] ?? raw;
}

/// User-Agent'tan tarayıcı adı.
///
/// ⚠️⚠️ SIRA ÖNEMLİ ve rastgele değil: Edge ve Opera kendilerini `Chrome/` olarak da
/// tanıtıyor, Chrome da kendini `Safari/` olarak tanıtıyor. Genelden özele bakmak hepsini
/// "Chrome" ya da "Safari" gösterirdi. Web'deki `browserOf` ile aynı sıra.
String? browserOf(String? ua) {
  if (ua == null || ua.isEmpty) return null;
  if (ua.contains('Edg/')) return 'Edge';
  if (ua.contains('OPR/')) return 'Opera';
  if (ua.contains('Firefox/')) return 'Firefox';
  if (ua.contains('Chrome/')) return 'Chrome';
  if (ua.contains('Safari/')) return 'Safari';
  return null;
}

/// Cihazın tek satırlık künyesi: «Android · SM-G991B», «Tarayıcı · Chrome».
///
/// ⚠️ Ayrıntı yoksa yalnız platform yazılıyor; boş bir orta nokta bırakmak «bir şey
/// eksik» hissi verirdi. Telefonda `deviceModel` dolu gelir, tarayıcıda boştur ve yerini
/// User-Agent'tan çıkarılan tarayıcı adı alır.
String describeDevice({
  String? platform,
  String? deviceModel,
  String? userAgent,
}) {
  final detay = (deviceModel != null && deviceModel.isNotEmpty)
      ? deviceModel
      : browserOf(userAgent);
  final ad = platformLabel(platform);
  return detay == null ? ad : '$ad · $detay';
}

/// İkinci satır: «Son görülme 5 dakika önce · 88.1.2.3 · uygulama 1.4.0 · Android 14».
///
/// ⚠️ Boş alanlar parçalarıyla birlikte düşüyor (`null` ip → « · » de yok): web'de de öyle.
/// ⚠️ Mutlak tarih YOK, göreli süre var — `clock.dart` bilerek `intl` bağımlılığı taşımıyor
/// ve uygulamanın geri kalanı da her yerde göreli süre gösteriyor. Web mutlak tarih
/// yazıyor; ayrışma bilinçli, çünkü ayrışan şey biçim, bilgi değil.
String deviceDetails({
  required String gorulme,
  String? ip,
  String? appVersion,
  String? osVersion,
}) {
  final parcalar = <String>['Son görülme $gorulme'];
  if (ip != null && ip.isNotEmpty) parcalar.add(ip);
  if (appVersion != null && appVersion.isNotEmpty) {
    parcalar.add('uygulama $appVersion');
  }
  if (osVersion != null && osVersion.isNotEmpty) parcalar.add(osVersion);
  return parcalar.join(' · ');
}
