/// OTURUM — yenileme anı hesabı ve kalıcılık.
///
/// ⭐⭐ `refreshDeadline`'ın tek işi **saat sapmasını denklemden çıkarmak**. Cihaz saati
/// sunucununkinden dakikalarca sapabiliyor; sunucunun mutlak damgasını yerel saatle
/// karşılaştırsaydık, saati ileri olan cihaz her istekte yenileme yapar (sunucu yükü), saati
/// geri olan hiç yapmaz (oyuncu 12 saat sonra sessizce düşer). Hesap yalnız sunucunun KENDİ
/// İÇİNDEKİ farkı kullanıyor; bu testlerin çoğu tam olarak bunu ölçüyor.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/core/session.dart';
import 'package:mobilwar/core/storage.dart';

void main() {
  group('⭐⭐ refreshDeadline — saat sapmasına bağışık', () {
    final now = DateTime.utc(2026, 8, 15, 12);

    test('ömrün son %10\'unda yenilenir (12 saatlik jeton → 10 dk tavanı)', () {
      final deadline = refreshDeadline(
        serverNow: '2026-08-15T00:00:00.000Z',
        accessExpiresAt: '2026-08-15T12:00:00.000Z', // 12 saat
        now: now,
      );
      // %10 = 72 dk ama tavan 10 dk → 12 sa − 10 dk = 11 sa 50 dk sonra.
      expect(deadline, now.add(const Duration(hours: 11, minutes: 50)));
    });

    test('kısa jeton: taban 30 sn (1 dakikalık jeton)', () {
      final deadline = refreshDeadline(
        serverNow: '2026-08-15T00:00:00.000Z',
        accessExpiresAt: '2026-08-15T00:01:00.000Z', // 60 sn
        now: now,
      );
      // %10 = 6 sn ama taban 30 sn → 60 − 30 = 30 sn sonra.
      expect(deadline, now.add(const Duration(seconds: 30)));
    });

    test(
      'orta jeton: %10 taban ile tavan ARASINDA kalır (1 saatlik jeton)',
      () {
        final deadline = refreshDeadline(
          serverNow: '2026-08-15T00:00:00.000Z',
          accessExpiresAt: '2026-08-15T01:00:00.000Z', // 3600 sn
          now: now,
        );
        // %10 = 360 sn (30 ile 600 arasında) → 3600 − 360 = 54 dk sonra.
        expect(deadline, now.add(const Duration(minutes: 54)));
      },
    );

    test('⭐⭐ CİHAZ SAATİ SAPMIŞ olsa bile sonuç aynı süre sonrasıdır', () {
      // Aynı sunucu yanıtı, saati 5 saat ileri olan bir cihazda çözülüyor. Sonuç, o cihazın
      // KENDİ "şimdi"sine göre yine 11 sa 50 dk sonrası olmalı — mutlak damga kullansaydık
      // bu cihaz jetonu daha doğmadan "süresi geçmiş" sayardı.
      final skewedDevice = now.add(const Duration(hours: 5));
      final deadline = refreshDeadline(
        serverNow: '2026-08-15T00:00:00.000Z',
        accessExpiresAt: '2026-08-15T12:00:00.000Z',
        now: skewedDevice,
      );
      expect(
        deadline!.difference(skewedDevice),
        const Duration(hours: 11, minutes: 50),
      );
    });

    test(
      '⚠️ hesaplanamayan durumlar null döner — proaktif yenileme kapanır, kimse düşmez',
      () {
        expect(
          refreshDeadline(serverNow: null, accessExpiresAt: 'x', now: now),
          isNull,
        );
        expect(
          refreshDeadline(serverNow: 'x', accessExpiresAt: null, now: now),
          isNull,
        );
        expect(
          refreshDeadline(serverNow: 'çöp', accessExpiresAt: 'çöp', now: now),
          isNull,
        );
        expect(
          refreshDeadline(
            serverNow: '2026-08-15T12:00:00.000Z',
            accessExpiresAt: '2026-08-15T00:00:00.000Z', // zaten geçmiş
            now: now,
          ),
          isNull,
        );
      },
    );
  });

  group('sunucu yanıtından oturum', () {
    test('alanlar doğru eşlenir', () {
      final s = Session.fromAuthResponse({
        'accessToken': 'a',
        'refreshToken': 'r',
        'accessExpiresAt': '2026-08-15T12:00:00.000Z',
        'serverNow': '2026-08-15T00:00:00.000Z',
        'player': {'id': 7, 'username': 'kaos', 'worldId': 1},
      }, now: DateTime.utc(2026, 8, 15, 12));

      expect(s!.accessToken, 'a');
      expect(s.playerId, 7);
      expect(s.worldId, 1);
      expect(s.username, 'kaos');
      expect(s.refreshAt, isNotNull);
    });

    test('⚠️ eksik gövde null döner (çökmez)', () {
      expect(Session.fromAuthResponse({'accessToken': 'a'}), isNull);
      expect(Session.fromAuthResponse({}), isNull);
    });
  });

  group('kalıcılık', () {
    test('yazılan oturum aynen geri okunur', () async {
      final store = SessionStore(MemoryStore());
      final s = Session(
        accessToken: 'a',
        refreshToken: 'r',
        playerId: 7,
        worldId: 1,
        username: 'kaos',
        refreshAt: DateTime.utc(2026, 8, 15, 12),
      );

      await store.write(s);
      final back = await store.read();

      expect(back!.accessToken, 'a');
      expect(back.username, 'kaos');
      expect(back.refreshAt, s.refreshAt);
      // ⚠️ Dart'ta `isUtc` EŞİTLİĞİN PARÇASI. `fromMillisecondsSinceEpoch` varsayılan yerel
      // saat döndürdüğü için gidiş-dönüş damgayı sessizce "farklı" yapıyordu (2026-08-15'te
      // bu test yakaladı). Değişmez açıkça yazılıyor ki bir daha kaymasın.
      expect(back.refreshAt!.isUtc, isTrue);
    });

    test('null yazmak oturumu siler', () async {
      final store = SessionStore(MemoryStore());
      await store.write(
        const Session(
          accessToken: 'a',
          refreshToken: 'r',
          playerId: 1,
          worldId: 1,
          username: 'x',
        ),
      );
      await store.write(null);
      expect(await store.read(), isNull);
    });

    test(
      '⚠️ BOZUK kayıt oturumu kilitlemez — silinir, misafir olarak devam edilir',
      () async {
        final raw = MemoryStore({kSessionKey: 'bu json değil {{{'});
        final store = SessionStore(raw);

        expect(await store.read(), isNull);
        expect(
          raw.contents.containsKey(kSessionKey),
          isFalse,
          reason: 'bozuk kayıt temizlenmeli',
        );
      },
    );
  });
}
