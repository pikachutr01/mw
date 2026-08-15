/// OTURUM — yenileme anı hesabı ve kalıcılık.
///
/// ⭐⭐ `yenilemeAni`'nın tek işi **saat sapmasını denklemden çıkarmak**. Cihaz saati
/// sunucununkinden dakikalarca sapabiliyor; sunucunun mutlak damgasını yerel saatle
/// karşılaştırsaydık, saati ileri olan cihaz her istekte yenileme yapar (sunucu yükü), saati
/// geri olan hiç yapmaz (oyuncu 12 saat sonra sessizce düşer). Hesap yalnız sunucunun KENDİ
/// İÇİNDEKİ farkı kullanıyor; bu testlerin çoğu tam olarak bunu ölçüyor.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/core/session.dart';
import 'package:mobilwar/core/storage.dart';

void main() {
  group('⭐⭐ yenilemeAni — saat sapmasına bağışık', () {
    final simdi = DateTime.utc(2026, 8, 15, 12);

    test('ömrün son %10\'unda yenilenir (12 saatlik jeton → 10 dk tavanı)', () {
      final an = yenilemeAni(
        serverNow: '2026-08-15T00:00:00.000Z',
        accessExpiresAt: '2026-08-15T12:00:00.000Z', // 12 saat
        simdi: simdi,
      );
      // %10 = 72 dk ama tavan 10 dk → 12 sa − 10 dk = 11 sa 50 dk sonra.
      expect(an, simdi.add(const Duration(hours: 11, minutes: 50)));
    });

    test('kısa jeton: taban 30 sn (1 dakikalık jeton)', () {
      final an = yenilemeAni(
        serverNow: '2026-08-15T00:00:00.000Z',
        accessExpiresAt: '2026-08-15T00:01:00.000Z', // 60 sn
        simdi: simdi,
      );
      // %10 = 6 sn ama taban 30 sn → 60 − 30 = 30 sn sonra.
      expect(an, simdi.add(const Duration(seconds: 30)));
    });

    test(
      'orta jeton: %10 taban ile tavan ARASINDA kalır (1 saatlik jeton)',
      () {
        final an = yenilemeAni(
          serverNow: '2026-08-15T00:00:00.000Z',
          accessExpiresAt: '2026-08-15T01:00:00.000Z', // 3600 sn
          simdi: simdi,
        );
        // %10 = 360 sn (30 ile 600 arasında) → 3600 − 360 = 54 dk sonra.
        expect(an, simdi.add(const Duration(minutes: 54)));
      },
    );

    test('⭐⭐ CİHAZ SAATİ SAPMIŞ olsa bile sonuç aynı süre sonrasıdır', () {
      // Aynı sunucu yanıtı, saati 5 saat ileri olan bir cihazda çözülüyor. Sonuç, o cihazın
      // KENDİ "şimdi"sine göre yine 11 sa 50 dk sonrası olmalı — mutlak damga kullansaydık
      // bu cihaz jetonu daha doğmadan "süresi geçmiş" sayardı.
      final sapmisCihaz = simdi.add(const Duration(hours: 5));
      final an = yenilemeAni(
        serverNow: '2026-08-15T00:00:00.000Z',
        accessExpiresAt: '2026-08-15T12:00:00.000Z',
        simdi: sapmisCihaz,
      );
      expect(
        an!.difference(sapmisCihaz),
        const Duration(hours: 11, minutes: 50),
      );
    });

    test(
      '⚠️ hesaplanamayan durumlar null döner — proaktif yenileme kapanır, kimse düşmez',
      () {
        expect(
          yenilemeAni(serverNow: null, accessExpiresAt: 'x', simdi: simdi),
          isNull,
        );
        expect(
          yenilemeAni(serverNow: 'x', accessExpiresAt: null, simdi: simdi),
          isNull,
        );
        expect(
          yenilemeAni(serverNow: 'çöp', accessExpiresAt: 'çöp', simdi: simdi),
          isNull,
        );
        expect(
          yenilemeAni(
            serverNow: '2026-08-15T12:00:00.000Z',
            accessExpiresAt: '2026-08-15T00:00:00.000Z', // zaten geçmiş
            simdi: simdi,
          ),
          isNull,
        );
      },
    );
  });

  group('sunucu yanıtından oturum', () {
    test('alanlar doğru eşlenir', () {
      final o = Oturum.sunucuYanitindan({
        'accessToken': 'a',
        'refreshToken': 'r',
        'accessExpiresAt': '2026-08-15T12:00:00.000Z',
        'serverNow': '2026-08-15T00:00:00.000Z',
        'player': {'id': 7, 'username': 'kaos', 'worldId': 1},
      }, simdi: DateTime.utc(2026, 8, 15, 12));

      expect(o!.accessToken, 'a');
      expect(o.playerId, 7);
      expect(o.worldId, 1);
      expect(o.username, 'kaos');
      expect(o.refreshAt, isNotNull);
    });

    test('⚠️ eksik gövde null döner (çökmez)', () {
      expect(Oturum.sunucuYanitindan({'accessToken': 'a'}), isNull);
      expect(Oturum.sunucuYanitindan({}), isNull);
    });
  });

  group('kalıcılık', () {
    test('yazılan oturum aynen geri okunur', () async {
      final depo = OturumDeposu(BellekDepo());
      final o = Oturum(
        accessToken: 'a',
        refreshToken: 'r',
        playerId: 7,
        worldId: 1,
        username: 'kaos',
        refreshAt: DateTime.utc(2026, 8, 15, 12),
      );

      await depo.yaz(o);
      final geri = await depo.oku();

      expect(geri!.accessToken, 'a');
      expect(geri.username, 'kaos');
      expect(geri.refreshAt, o.refreshAt);
      // ⚠️ Dart'ta `isUtc` EŞİTLİĞİN PARÇASI. `fromMillisecondsSinceEpoch` varsayılan yerel
      // saat döndürdüğü için gidiş-dönüş damgayı sessizce "farklı" yapıyordu (2026-08-15'te
      // bu test yakaladı). Değişmez açıkça yazılıyor ki bir daha kaymasın.
      expect(geri.refreshAt!.isUtc, isTrue);
    });

    test('null yazmak oturumu siler', () async {
      final depo = OturumDeposu(BellekDepo());
      await depo.yaz(
        const Oturum(
          accessToken: 'a',
          refreshToken: 'r',
          playerId: 1,
          worldId: 1,
          username: 'x',
        ),
      );
      await depo.yaz(null);
      expect(await depo.oku(), isNull);
    });

    test(
      '⚠️ BOZUK kayıt oturumu kilitlemez — silinir, misafir olarak devam edilir',
      () async {
        final ham = BellekDepo({kOturumKey: 'bu json değil {{{'});
        final depo = OturumDeposu(ham);

        expect(await depo.oku(), isNull);
        expect(
          ham.icerik.containsKey(kOturumKey),
          isFalse,
          reason: 'bozuk kayıt temizlenmeli',
        );
      },
    );
  });
}
