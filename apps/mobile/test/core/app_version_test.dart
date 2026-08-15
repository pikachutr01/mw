/// SÜRÜM KAPISI — "güncelleme şart mı" kararı.
///
/// ⚠️⚠️ Bu kapının yanlış tarafa düşmesinin bedeli **asimetrik**: gereksiz yere açık kalırsa
/// eski bir uygulama biraz daha çalışır; gereksiz yere kapanırsa **oynayabilecek herkesi**
/// oyundan atarız ve düzeltmesi yeni bir mağaza sürümü gerektirir. Bu yüzden şüphede kalınan
/// her durumda `false` dönmesi tasarımın kendisi, ihmal değil — testlerin çoğu tam olarak
/// bunu ölçüyor.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/core/app_version.dart';

void main() {
  group('buildNumber', () {
    test('sürüm dizesinden yapı numarasını ayırır', () {
      expect(buildNumber('1.0.0+1'), 1);
      expect(buildNumber('1.2.3+45'), 45);
      expect(buildNumber('2.0.0+1234'), 1234);
    });

    test('⚠️ ayrıştırılamayan biçimler null döner (çökmez)', () {
      expect(buildNumber('1.0.0'), isNull, reason: 'yapı numarası yok');
      expect(buildNumber('1.0.0+'), isNull, reason: 'boş yapı numarası');
      expect(buildNumber('1.0.0+abc'), isNull, reason: 'sayı değil');
      expect(buildNumber(''), isNull);
    });

    test('birden çok artı varsa SONUNCUSU esas alınır', () {
      expect(buildNumber('1.0.0+beta+7'), 7);
    });
  });

  group('updateRequired', () {
    test('yapı numarası eşikten küçükse güncelleme gerekir', () {
      expect(updateRequired(version: '1.0.0+5', minBuild: 7), isTrue);
    });

    test('eşitse ya da büyükse gerekmez', () {
      expect(updateRequired(version: '1.0.0+7', minBuild: 7), isFalse);
      expect(updateRequired(version: '1.0.0+9', minBuild: 7), isFalse);
    });

    test('⚠️ eşik 0 ise kapı KAPALI — normal durum bu', () {
      expect(updateRequired(version: '1.0.0+1', minBuild: 0), isFalse);
    });

    test(
      '⚠️ eşik bilinmiyorsa kapı KAPALI (eski sunucu bu alanı göndermiyor olabilir)',
      () {
        expect(updateRequired(version: '1.0.0+1', minBuild: null), isFalse);
      },
    );

    test('⚠️ kendi sürümü okunamıyorsa kapı KAPALI', () {
      expect(updateRequired(version: null, minBuild: 99), isFalse);
      expect(updateRequired(version: 'bozuk', minBuild: 99), isFalse);
    });

    test('⚠️ negatif eşik kapıyı AÇMAZ (bozuk ayar oyuncuyu kilitlemesin)', () {
      expect(updateRequired(version: '1.0.0+1', minBuild: -5), isFalse);
    });

    test('⭐⭐ SEMVER DİZESİ DEĞİL, YAPI NUMARASI karşılaştırılıyor', () {
      // Metin karşılaştırmasında '1.10.0' < '1.9.0' çıkar ve kapı yanlış tarafa düşerdi.
      // Yapı numarası tam sayı olduğu için bu tuzak yapısal olarak yok.
      expect(updateRequired(version: '1.10.0+10', minBuild: 9), isFalse);
      expect(updateRequired(version: '1.9.0+9', minBuild: 10), isTrue);
    });
  });
}
