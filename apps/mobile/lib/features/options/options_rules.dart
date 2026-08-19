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
