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
  group('yapiNumarasi', () {
    test('sürüm dizesinden yapı numarasını ayırır', () {
      expect(yapiNumarasi('1.0.0+1'), 1);
      expect(yapiNumarasi('1.2.3+45'), 45);
      expect(yapiNumarasi('2.0.0+1234'), 1234);
    });

    test('⚠️ ayrıştırılamayan biçimler null döner (çökmez)', () {
      expect(yapiNumarasi('1.0.0'), isNull, reason: 'yapı numarası yok');
      expect(yapiNumarasi('1.0.0+'), isNull, reason: 'boş yapı numarası');
      expect(yapiNumarasi('1.0.0+abc'), isNull, reason: 'sayı değil');
      expect(yapiNumarasi(''), isNull);
    });

    test('birden çok artı varsa SONUNCUSU esas alınır', () {
      expect(yapiNumarasi('1.0.0+beta+7'), 7);
    });
  });

  group('guncellemeGerekli', () {
    test('yapı numarası eşikten küçükse güncelleme gerekir', () {
      expect(guncellemeGerekli(surum: '1.0.0+5', enDusukYapi: 7), isTrue);
    });

    test('eşitse ya da büyükse gerekmez', () {
      expect(guncellemeGerekli(surum: '1.0.0+7', enDusukYapi: 7), isFalse);
      expect(guncellemeGerekli(surum: '1.0.0+9', enDusukYapi: 7), isFalse);
    });

    test('⚠️ eşik 0 ise kapı KAPALI — normal durum bu', () {
      expect(guncellemeGerekli(surum: '1.0.0+1', enDusukYapi: 0), isFalse);
    });

    test(
      '⚠️ eşik bilinmiyorsa kapı KAPALI (eski sunucu bu alanı göndermiyor olabilir)',
      () {
        expect(guncellemeGerekli(surum: '1.0.0+1', enDusukYapi: null), isFalse);
      },
    );

    test('⚠️ kendi sürümü okunamıyorsa kapı KAPALI', () {
      expect(guncellemeGerekli(surum: null, enDusukYapi: 99), isFalse);
      expect(guncellemeGerekli(surum: 'bozuk', enDusukYapi: 99), isFalse);
    });

    test('⚠️ negatif eşik kapıyı AÇMAZ (bozuk ayar oyuncuyu kilitlemesin)', () {
      expect(guncellemeGerekli(surum: '1.0.0+1', enDusukYapi: -5), isFalse);
    });

    test('⭐⭐ SEMVER DİZESİ DEĞİL, YAPI NUMARASI karşılaştırılıyor', () {
      // Metin karşılaştırmasında '1.10.0' < '1.9.0' çıkar ve kapı yanlış tarafa düşerdi.
      // Yapı numarası tam sayı olduğu için bu tuzak yapısal olarak yok.
      expect(guncellemeGerekli(surum: '1.10.0+10', enDusukYapi: 9), isFalse);
      expect(guncellemeGerekli(surum: '1.9.0+9', enDusukYapi: 10), isTrue);
    });
  });
}
