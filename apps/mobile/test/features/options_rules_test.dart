/// ⭐ SEÇENEKLER KURALLARI — tema tercihinin diske gidip gelmesi.
///
/// ⚠️ Bu dosyanın derdi küçük ama arıza sınıfı sinsi: tema tercihi **diskte dize** olarak
/// duruyor ve iki yönlü dönüşümün bozulması sessizce "tercih hatırlanmıyor"a dönüşür — hata
/// yok, yalnız oyuncu her açılışta yanlış temayı görür.
library;

import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/options/options_rules.dart';

void main() {
  group('tema tercihi', () {
    /// ⚠️⚠️ Değerler WEB'LE aynı olmak ZORUNDA (`localStorage['mw-theme']`): aynı kavramı iki
    /// istemcide farklı adlandırmak, ileride tercihi hesaba taşımak istediğimizde iki farklı
    /// biçimi birbirine çevirmek demek olurdu.
    test('⭐ diske yazılan dizeler web ile birebir', () {
      expect(themeModeToString(ThemeMode.system), 'system');
      expect(themeModeToString(ThemeMode.light), 'light');
      expect(themeModeToString(ThemeMode.dark), 'dark');
    });

    test('okuma yazmanın tersi', () {
      for (final m in ThemeMode.values) {
        expect(themeModeFromString(themeModeToString(m)), m);
      }
    });

    /// ⚠️ Bozuk ya da eksik değer `system`e düşüyor, PATLAMIYOR: tercih oyuncunun elinin
    /// altındaki bir dosyada ve bozuk bir değer yüzünden uygulamanın açılmaması orantısız
    /// olurdu. «Hiç seçim yapılmamış» ile «değer bozuk» aynı yere düşüyor; ikisi de doğru.
    test('⭐ bilinmeyen değer ve null → system', () {
      expect(themeModeFromString(null), ThemeMode.system);
      expect(themeModeFromString(''), ThemeMode.system);
      expect(themeModeFromString('koyu'), ThemeMode.system);
      // ⚠️ Büyük harf eşleşmiyor: `switch` birebir dize karşılaştırması yapıyor.
      expect(themeModeFromString('Dark'), ThemeMode.system);
    });

    test('seçenek listesi üç tane ve «Sistem» başta', () {
      expect(kThemeChoices, hasLength(3));
      expect(kThemeChoices.first.mode, ThemeMode.system);
      expect(
        kThemeChoices.map((c) => c.mode).toSet(),
        ThemeMode.values.toSet(),
      );
    });
  });
}
