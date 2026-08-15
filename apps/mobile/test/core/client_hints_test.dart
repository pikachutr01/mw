/// İSTEMCİ KÜNYESİ başlıkları — sunucunun okuduğu adlarla birebir eşleşmeli.
///
/// ⚠️ Bu testin asıl işi **başlık ADLARINI** kilitlemek. Yanlış yazılmış bir başlık adı
/// (`x-app-ver` gibi) hiçbir yerde hata üretmez: sunucu onu okumaz, alan `null` kalır,
/// `player_devices` sessizce eksik dolar ve bu ancak aylar sonra çoklu hesap analizine
/// bakarken fark edilir. Sessiz arıza → testle kilitlenir.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/core/client_hints.dart';

IstemciKunyesi ornek({
  String platform = 'android',
  String osVersion = 'Android 16 (SDK 36)',
  String deviceModel = 'samsung SM-A346E',
  String appVersion = '1.0.0+1',
  String timezone = '+03',
  String locale = 'tr_TR',
}) => IstemciKunyesi(
  platform: platform,
  osVersion: osVersion,
  deviceModel: deviceModel,
  appVersion: appVersion,
  timezone: timezone,
  locale: locale,
);

void main() {
  group('başlıklar', () {
    test('⭐ sunucunun okuduğu ALTI başlık adı birebir üretilir', () {
      // Sunucu tarafı: `apps/api/src/abuse/device-context.ts` · `extractDeviceContext`.
      expect(ornek().basliklar().keys.toSet(), {
        'x-platform',
        'x-os-version',
        'x-device-model',
        'x-app-version',
        'x-timezone',
        'x-locale',
      });
    });

    test('⚠️ cihaz kimliği ve Authorization künyede DEĞİL', () {
      // İkisi de oturuma/kuruluma ait; künye yalnız "bu cihaz nedir" sorusunu cevaplıyor.
      // Karıştırmak, künyeyi oturumsuz isteklerde de göndermemek gibi bir hataya yol açardı.
      final b = ornek().basliklar();
      expect(b.containsKey('x-device-id'), isFalse);
      expect(b.containsKey('x-client-instance'), isFalse);
      expect(b.containsKey('authorization'), isFalse);
    });

    test('boş alan hiç gönderilmez (null yerine yokluk)', () {
      final b = ornek(deviceModel: '', locale: '').basliklar();
      expect(b.containsKey('x-device-model'), isFalse);
      expect(b.containsKey('x-locale'), isFalse);
      expect(b['x-platform'], 'android');
    });

    test('değerler olduğu gibi taşınır', () {
      final b = ornek().basliklar();
      expect(b['x-platform'], 'android');
      expect(b['x-os-version'], 'Android 16 (SDK 36)');
      expect(b['x-device-model'], 'samsung SM-A346E');
      expect(b['x-app-version'], '1.0.0+1');
      expect(b['x-timezone'], '+03');
      expect(b['x-locale'], 'tr_TR');
    });
  });

  group('⚠️ uzunluk sınırları sunucudakiyle aynı', () {
    test('sabitler `device-context.ts` ile eşleşir', () {
      // Sunucu: trim(osVersion,60) · trim(deviceModel,100) · trim(appVersion,40) ·
      //         trim(timezone,60) · trim(locale,20)
      expect(kOsVersionMax, 60);
      expect(kDeviceModelMax, 100);
      expect(kAppVersionMax, 40);
      expect(kTimezoneMax, 60);
      expect(kLocaleMax, 20);
    });
  });
}
