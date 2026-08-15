/// ŞEHİR EKRANLARI — eşleştirme kuralı ve alt bardaki sekme vurgusu.
///
/// Web'deki `apps/web/test/city-screens.test.ts`in aynadaki karşılığı. İki karar ölçülüyor ve
/// ikisinin de yanlışı **sessiz**:
///
///   1. **Sınır kontrollü ön ek.** Düz `startsWith` ileride eklenecek `/academy-x` gibi bir
///      rotayı sessizce şehir ekranı sayardı; tam eşitlik ise `/barracks/123` alt yolunu
///      sessizce kaybederdi.
///   2. **«Şehir» sekmesi alt ekranlarda da yanar.** Üst bar kaldırıldığı için (`shell.dart`)
///      alt bardaki vurgu «neredeyim» sorusunun TEK cevabı; yanmazsa oyuncu beş ekranda
///      hiçbir ipucu görmez.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/core/city_screens.dart';
import 'package:mobilwar/features/shell/shell.dart';

void main() {
  group('matchCityScreen', () {
    test('beş şehir ekranı da eşleşir', () {
      for (final s in kCityScreens) {
        expect(matchCityScreen(s.path)?.path, s.path);
      }
    });

    test('⭐ alt yol da eşleşir (`/barracks/123`)', () {
      expect(matchCityScreen('/barracks/123')?.path, '/barracks');
    });

    test('⚠️ ÖN EK BENZERLİĞİ eşleşmez — `/academy-x` ≠ `/academy`', () {
      expect(matchCityScreen('/academy-x'), isNull);
      expect(matchCityScreen('/barracksXY'), isNull);
    });

    test('şehir dışı ekranlar eşleşmez', () {
      for (final p in ['/armies', '/city', '/world', '/messages', '/']) {
        expect(matchCityScreen(p), isNull, reason: '$p şehir ekranı değil');
      }
    });

    test('⚠️ liste web ile AYNI beşli', () {
      // Ayrışırsa iki istemcide farklı şehir menüsü olur — «tam eşitlik» kararının ihlali.
      expect(kCityScreens.map((s) => s.path).toList(), [
        '/barracks',
        '/buildings',
        '/defense',
        '/academy',
        '/temple',
      ]);
    });
  });

  group('⭐⭐ activeTabIndex — alt bardaki vurgu', () {
    final cityIndex = tabs.indexWhere((t) => t.path == '/city');

    test('doğrudan sekme yolları kendi sekmesini yakar', () {
      for (var i = 0; i < tabs.length; i++) {
        expect(activeTabIndex(tabs[i].path), i);
      }
    });

    test(
      '⚠️⚠️ ŞEHİR ALT EKRANLARI «Şehir» sekmesini yakar (üst bar kalktı, tek ipucu bu)',
      () {
        for (final s in kCityScreens) {
          expect(
            activeTabIndex(s.path),
            cityIndex,
            reason: '${s.path} açıkken alt barda hiçbir sekme yanmıyordu',
          );
        }
      },
    );

    test('alt sayfalar da üst sekmeyi yakar (`/command/rankings`)', () {
      expect(
        activeTabIndex('/command/rankings'),
        tabs.indexWhere((t) => t.path == '/command'),
      );
    });

    test('⚠️ hiçbiriyle eşleşmeyen yol -1 döner (çağıran kelepçeliyor)', () {
      // `NavigationBar` -1'i kabul etmiyordu; elle çizilen çubukta da hiçbir sekme yanmıyor.
      // Önemli olan burada patlamaması.
      expect(activeTabIndex('/help'), -1);
      expect(activeTabIndex('/bilinmeyen'), -1);
    });
  });
}
