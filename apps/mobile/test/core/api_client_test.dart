/// ⭐⭐ API İSTEMCİSİ — yenileme, oturum düşürme ve başlıklar.
///
/// Bu dosyanın kilitlediği üç davranışın üçü de web'de GERÇEK hatalardan doğdu
/// (`apps/web/src/lib/api.ts` yorumları):
///
///   1. İki eşzamanlı 401 → İKİ yenileme → ikincisi iptal edilmiş jetonla gider ve oturumu
///      düşürür. Oyuncu sebepsiz giriş ekranına atılır.
///   2. Her `!ok` oturumu siliyordu → API yeniden başlarken gelen 503, jetonu hâlâ geçerli
///      olan oyuncuyu dışarı atıyordu. **Geçici arıza kimlik doğrulama kararı değildir.**
///   3. 409 `session_conflict` oturumu düşürmemeli — sahiplik başka kopyada, jeton geçerli.
library;

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/core/api_client.dart';
import 'package:mobilwar/core/client_hints.dart';
import 'package:mobilwar/core/device_identity.dart';
import 'package:mobilwar/core/session.dart';
import 'package:mobilwar/core/storage.dart';

const _kunye = IstemciKunyesi(
  platform: 'android',
  osVersion: 'Android 16',
  deviceModel: 'samsung SM-A346E',
  appVersion: '1.0.0+1',
  timezone: '+03',
  locale: 'tr_TR',
);

Oturum _oturum({DateTime? refreshAt}) => Oturum(
  accessToken: 'acc',
  refreshToken: 'ref',
  playerId: 7,
  worldId: 1,
  username: 'kaos',
  refreshAt: refreshAt,
);

/// Sunucunun `/auth/refresh` yanıt gövdesi.
Map<String, dynamic> _authGovde({String acc = 'acc2'}) => {
  'accessToken': acc,
  'refreshToken': 'ref2',
  'accessExpiresAt': '2026-08-15T12:00:00.000Z',
  'serverNow': '2026-08-15T00:00:00.000Z',
  'player': {'id': 7, 'username': 'kaos', 'worldId': 1},
};

/// Kaydeden sahte taşıma — **mock değil dikiş**: beklenti yok, programlanmış yanıt var.
class _Tasima {
  _Tasima(this.yanitla);

  final Future<HamYanit> Function(HamIstek, int sira) yanitla;
  final List<HamIstek> istekler = [];

  Future<HamYanit> call(HamIstek i) {
    istekler.add(i);
    return yanitla(i, istekler.length - 1);
  }

  Iterable<HamIstek> get yenilemeler =>
      istekler.where((i) => i.yol == '/api/v1/auth/refresh');
}

Future<MwApi> _api(
  _Tasima t, {
  Oturum? oturum,
  void Function(OturumCakismasi)? onCakisma,
  void Function()? onDustu,
  DateTime Function()? saat,
}) async {
  final depo = OturumDeposu(BellekDepo());
  if (oturum != null) await depo.yaz(oturum);
  final api = MwApi(
    gonderici: t.call,
    oturumDeposu: depo,
    kimlik: CihazKimligi(BellekDepo()),
    kunye: _kunye,
    onCakisma: onCakisma,
    onOturumDustu: onDustu,
    saat: saat,
    bekle: (_) async {}, // testte 800 ms beklenmez
  );
  await api.oturumuYukle();
  return api;
}

void main() {
  group('⭐⭐ yenileme uçuşta TEK söz', () {
    test('iki eşzamanlı 401 YALNIZ BİR yenileme başlatır', () async {
      final kapi = Completer<void>();
      final t = _Tasima((i, _) async {
        if (i.yol == '/api/v1/auth/refresh') {
          await kapi.future; // ikisi de burada birikecek
          return HamYanit(200, _authGovde());
        }
        // Yenilemeden önceki her oyun isteği 401.
        return const HamYanit(401, {'message': 'yok'});
      });
      final api = await _api(t, oturum: _oturum());

      final a = api.istek('GET', '/api/v1/cities');
      final b = api.istek('GET', '/api/v1/missions');
      await Future<void>.delayed(Duration.zero); // ikisi de yenilemeye ulaşsın
      kapi.complete();
      await Future.wait([
        a,
        b,
      ], eagerError: false).catchError((_) => <Object?>[]);

      expect(
        t.yenilemeler.length,
        1,
        reason:
            'ikinci yenileme iptal edilmiş jetonla gider ve OTURUMU DÜŞÜRÜRDÜ',
      );
    });

    test(
      'yenileme bittikten sonra yeni bir 401 yeniden yenileme başlatabilir',
      () async {
        var yenilemeSayisi = 0;
        final t = _Tasima((i, _) async {
          if (i.yol == '/api/v1/auth/refresh') {
            yenilemeSayisi++;
            return HamYanit(200, _authGovde());
          }
          return const HamYanit(401, {'message': 'yok'});
        });
        final api = await _api(t, oturum: _oturum());

        await api.istek('GET', '/a').catchError((_) => null);
        await api.istek('GET', '/b').catchError((_) => null);

        expect(
          yenilemeSayisi,
          2,
          reason: 'kilit kalıcı değil, yalnız UÇUŞTAKİ isteği paylaştırır',
        );
      },
    );
  });

  group('⚠️⚠️ oturum yalnız GERÇEK reddde düşer', () {
    test('yenileme 503 alınca oturum KORUNUR', () async {
      var dustu = false;
      final t = _Tasima((i, _) async {
        if (i.yol == '/api/v1/auth/refresh') {
          return const HamYanit(503, {'message': 'bakım'});
        }
        return const HamYanit(401, {'message': 'yok'});
      });
      final api = await _api(t, oturum: _oturum(), onDustu: () => dustu = true);

      await api.istek('GET', '/a').catchError((_) => null);

      expect(
        api.oturum,
        isNotNull,
        reason: 'geçici arıza kimlik doğrulama kararı DEĞİLDİR',
      );
      expect(dustu, isFalse);
    });

    test('yenileme 401 alınca oturum DÜŞER', () async {
      var dustu = false;
      final t = _Tasima(
        (i, _) async => const HamYanit(401, {'message': 'yok'}),
      );
      final api = await _api(t, oturum: _oturum(), onDustu: () => dustu = true);

      await api.istek('GET', '/a').catchError((_) => null);

      expect(api.oturum, isNull);
      expect(dustu, isTrue);
    });

    test(
      '⚠️ başarısız yenilemeden sonra 10 sn boyunca tekrar denenmez',
      () async {
        var an = DateTime(2026, 8, 15, 12);
        final t = _Tasima((i, _) async {
          if (i.yol == '/api/v1/auth/refresh') return const HamYanit(503);
          return const HamYanit(401, {'message': 'yok'});
        });
        final api = await _api(t, oturum: _oturum(), saat: () => an);

        await api.istek('GET', '/a').catchError((_) => null);
        an = an.add(const Duration(seconds: 5)); // henüz 10 sn dolmadı
        await api.istek('GET', '/b').catchError((_) => null);

        expect(
          t.yenilemeler.length,
          1,
          reason: 'API kapalıyken saniyede onlarca yenileme gitmemeli',
        );

        an = an.add(const Duration(seconds: 6)); // 10 sn geçti
        await api.istek('GET', '/c').catchError((_) => null);
        expect(t.yenilemeler.length, 2);
      },
    );

    test(
      'oyun ucundan gelen 503 BİR kez tekrarlanır ve oturuma dokunmaz',
      () async {
        final t = _Tasima(
          (i, sira) async => sira == 0
              ? const HamYanit(503)
              : const HamYanit(200, {'ok': true}),
        );
        final api = await _api(t, oturum: _oturum());

        final sonuc = await api.istek('GET', '/a');

        expect(sonuc, {'ok': true});
        expect(api.oturum, isNotNull);
      },
    );
  });

  group('⚠️ 409 session_conflict', () {
    test('geri çağrı tetiklenir, hata fırlatılır AMA oturum korunur', () async {
      OturumCakismasi? gorulen;
      final t = _Tasima(
        (i, _) async => const HamYanit(409, {
          'code': 'session_conflict',
          'message': 'başka cihazda açık',
          'holder': {'platform': 'web', 'seenAt': '2026-08-15T10:00:00.000Z'},
        }),
      );
      final api = await _api(
        t,
        oturum: _oturum(),
        onCakisma: (c) => gorulen = c,
      );

      await expectLater(api.istek('GET', '/a'), throwsA(isA<MwApiHatasi>()));

      expect(gorulen?.platform, 'web');
      expect(
        api.oturum,
        isNotNull,
        reason: 'jeton GEÇERLİ — yalnız sahiplik başka kopyada',
      );
    });
  });

  group('başlıklar', () {
    test('⭐ kimlik, örnek, künye ve yetki başlıkları birlikte gider', () async {
      final t = _Tasima((i, _) async => const HamYanit(200, {}));
      final api = await _api(t, oturum: _oturum());

      await api.istek('GET', '/a');

      final b = t.istekler.single.basliklar;
      expect(b['x-device-id'], isNotNull);
      expect(
        b['x-client-instance'],
        b['x-device-id'],
        reason: 'mobilde ikisi AYNI değer',
      );
      expect(b['x-platform'], 'android');
      expect(b['x-app-version'], '1.0.0+1');
      expect(b['authorization'], 'Bearer acc');
    });

    test(
      '⚠️ gövdesiz istekte content-type YAZILMAZ (Fastify boş gövdeye 400 veriyor)',
      () async {
        final t = _Tasima((i, _) async => const HamYanit(200, {}));
        final api = await _api(t, oturum: _oturum());

        await api.istek('GET', '/a');
        expect(
          t.istekler.single.basliklar.containsKey('content-type'),
          isFalse,
        );

        await api.istek('POST', '/b', govde: {'x': 1});
        expect(t.istekler.last.basliklar['content-type'], 'application/json');
      },
    );

    test('oturumsuzken authorization gönderilmez', () async {
      final t = _Tasima((i, _) async => const HamYanit(200, {}));
      final api = await _api(t);

      await api.istek('GET', '/a');
      expect(t.istekler.single.basliklar.containsKey('authorization'), isFalse);
    });

    test('⚠️ YENİLEME isteği de TAM künyeyi taşır', () async {
      // Yenileme, giriş sonrası cihaz sinyalinin yazıldığı EN SIK yol. Künyesiz gönderilirse
      // aylarca açık kalan oturumun künyesi ilk günden kalma olur.
      final t = _Tasima((i, _) async {
        if (i.yol == '/api/v1/auth/refresh') return HamYanit(200, _authGovde());
        return const HamYanit(401, {'message': 'yok'});
      });
      final api = await _api(t, oturum: _oturum());

      await api.istek('GET', '/a').catchError((_) => null);

      final y = t.yenilemeler.single.basliklar;
      expect(y['x-device-id'], isNotNull);
      expect(y['x-client-instance'], isNotNull);
      expect(y['x-app-version'], '1.0.0+1');
      expect(y['x-os-version'], 'Android 16');
    });
  });

  group('⭐ proaktif yenileme', () {
    test('refreshAt geçmişse istek ÖNCE yenilenir (401 beklenmez)', () async {
      final an = DateTime(2026, 8, 15, 12);
      final t = _Tasima((i, _) async {
        if (i.yol == '/api/v1/auth/refresh') {
          return HamYanit(200, _authGovde(acc: 'yeni'));
        }
        return const HamYanit(200, {'ok': true});
      });
      final api = await _api(
        t,
        oturum: _oturum(refreshAt: an.subtract(const Duration(minutes: 1))),
        saat: () => an,
      );

      await api.istek('GET', '/a');

      expect(
        t.istekler.first.yol,
        '/api/v1/auth/refresh',
        reason: 'yenileme İLK sırada olmalı',
      );
      expect(t.istekler.last.basliklar['authorization'], 'Bearer yeni');
    });

    test('refreshAt gelecekteyse yenileme yapılmaz', () async {
      final an = DateTime(2026, 8, 15, 12);
      final t = _Tasima((i, _) async => const HamYanit(200, {}));
      final api = await _api(
        t,
        oturum: _oturum(refreshAt: an.add(const Duration(hours: 1))),
        saat: () => an,
      );

      await api.istek('GET', '/a');
      expect(t.yenilemeler, isEmpty);
    });
  });
}
