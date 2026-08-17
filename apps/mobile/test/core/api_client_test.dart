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

const _hints = ClientHints(
  platform: 'android',
  osVersion: 'Android 16',
  deviceModel: 'samsung SM-A346E',
  appVersion: '1.0.0+1',
  timezone: '+03',
  locale: 'tr_TR',
);

Session _session({DateTime? refreshAt}) => Session(
  accessToken: 'acc',
  refreshToken: 'ref',
  playerId: 7,
  worldId: 1,
  username: 'kaos',
  refreshAt: refreshAt,
);

/// Sunucunun `/auth/refresh` yanıt gövdesi.
Map<String, dynamic> _authBody({String acc = 'acc2'}) => {
  'accessToken': acc,
  'refreshToken': 'ref2',
  'accessExpiresAt': '2026-08-15T12:00:00.000Z',
  'serverNow': '2026-08-15T00:00:00.000Z',
  'player': {'id': 7, 'username': 'kaos', 'worldId': 1},
};

/// Kaydeden sahte taşıma — **mock değil dikiş**: beklenti yok, programlanmış yanıt var.
class _Transport {
  _Transport(this.respond);

  final Future<RawResponse> Function(RawRequest, int index) respond;
  final List<RawRequest> requests = [];

  Future<RawResponse> call(RawRequest r) {
    requests.add(r);
    return respond(r, requests.length - 1);
  }

  Iterable<RawRequest> get refreshes =>
      requests.where((r) => r.path == '/api/v1/auth/refresh');
}

Future<MwApi> _api(
  _Transport t, {
  Session? session,
  void Function(SessionConflict)? onConflict,
  void Function()? onLost,
  void Function(Session?)? onChanged,
  void Function(String?, String?)? onServerTime,
  DateTime Function()? clock,
}) async {
  final store = SessionStore(MemoryStore());
  if (session != null) await store.write(session);
  final api = MwApi(
    sender: t.call,
    sessionStore: store,
    identity: DeviceIdentity(MemoryStore()),
    hints: _hints,
    onConflict: onConflict,
    onSessionLost: onLost,
    onSessionChanged: onChanged,
    onServerTime: onServerTime,
    clock: clock,
    sleep: (_) async {}, // testte 800 ms beklenmez
  );
  await api.loadSession();
  return api;
}

void main() {
  group('⭐⭐ yenileme uçuşta TEK söz', () {
    test('iki eşzamanlı 401 YALNIZ BİR yenileme başlatır', () async {
      final gate = Completer<void>();
      final t = _Transport((r, _) async {
        if (r.path == '/api/v1/auth/refresh') {
          await gate.future; // ikisi de burada birikecek
          return RawResponse(200, _authBody());
        }
        // Yenilemeden önceki her oyun isteği 401.
        return const RawResponse(401, {'message': 'yok'});
      });
      final api = await _api(t, session: _session());

      final a = api.request('GET', '/api/v1/cities');
      final b = api.request('GET', '/api/v1/missions');
      await Future<void>.delayed(Duration.zero); // ikisi de yenilemeye ulaşsın
      gate.complete();
      await Future.wait([
        a,
        b,
      ], eagerError: false).catchError((_) => <Object?>[]);

      expect(
        t.refreshes.length,
        1,
        reason:
            'ikinci yenileme iptal edilmiş jetonla gider ve OTURUMU DÜŞÜRÜRDÜ',
      );
    });

    test(
      'yenileme bittikten sonra yeni bir 401 yeniden yenileme başlatabilir',
      () async {
        var refreshCount = 0;
        final t = _Transport((r, _) async {
          if (r.path == '/api/v1/auth/refresh') {
            refreshCount++;
            return RawResponse(200, _authBody());
          }
          return const RawResponse(401, {'message': 'yok'});
        });
        final api = await _api(t, session: _session());

        await api.request('GET', '/a').catchError((_) => null);
        await api.request('GET', '/b').catchError((_) => null);

        expect(
          refreshCount,
          2,
          reason: 'kilit kalıcı değil, yalnız UÇUŞTAKİ isteği paylaştırır',
        );
      },
    );
  });

  group('⚠️⚠️ oturum yalnız GERÇEK reddde düşer', () {
    test('yenileme 503 alınca oturum KORUNUR', () async {
      var lost = false;
      final t = _Transport((r, _) async {
        if (r.path == '/api/v1/auth/refresh') {
          return const RawResponse(503, {'message': 'bakım'});
        }
        return const RawResponse(401, {'message': 'yok'});
      });
      final api = await _api(t, session: _session(), onLost: () => lost = true);

      await api.request('GET', '/a').catchError((_) => null);

      expect(
        api.session,
        isNotNull,
        reason: 'geçici arıza kimlik doğrulama kararı DEĞİLDİR',
      );
      expect(lost, isFalse);
    });

    test('yenileme 401 alınca oturum DÜŞER', () async {
      var lost = false;
      final t = _Transport(
        (r, _) async => const RawResponse(401, {'message': 'yok'}),
      );
      final api = await _api(t, session: _session(), onLost: () => lost = true);

      await api.request('GET', '/a').catchError((_) => null);

      expect(api.session, isNull);
      expect(lost, isTrue);
    });

    test(
      '⚠️ başarısız yenilemeden sonra 10 sn boyunca tekrar denenmez',
      () async {
        var now = DateTime(2026, 8, 15, 12);
        final t = _Transport((r, _) async {
          if (r.path == '/api/v1/auth/refresh') return const RawResponse(503);
          return const RawResponse(401, {'message': 'yok'});
        });
        final api = await _api(t, session: _session(), clock: () => now);

        await api.request('GET', '/a').catchError((_) => null);
        now = now.add(const Duration(seconds: 5)); // henüz 10 sn dolmadı
        await api.request('GET', '/b').catchError((_) => null);

        expect(
          t.refreshes.length,
          1,
          reason: 'API kapalıyken saniyede onlarca yenileme gitmemeli',
        );

        now = now.add(const Duration(seconds: 6)); // 10 sn geçti
        await api.request('GET', '/c').catchError((_) => null);
        expect(t.refreshes.length, 2);
      },
    );

    test(
      'oyun ucundan gelen 503 BİR kez tekrarlanır ve oturuma dokunmaz',
      () async {
        final t = _Transport(
          (r, index) async => index == 0
              ? const RawResponse(503)
              : const RawResponse(200, {'ok': true}),
        );
        final api = await _api(t, session: _session());

        final result = await api.request('GET', '/a');

        expect(result, {'ok': true});
        expect(api.session, isNotNull);
      },
    );
  });

  group('⚠️ 409 session_conflict', () {
    test('geri çağrı tetiklenir, hata fırlatılır AMA oturum korunur', () async {
      SessionConflict? seen;
      final t = _Transport(
        (r, _) async => const RawResponse(409, {
          'code': 'session_conflict',
          'message': 'başka cihazda açık',
          'holder': {'platform': 'web', 'seenAt': '2026-08-15T10:00:00.000Z'},
        }),
      );
      final api = await _api(
        t,
        session: _session(),
        onConflict: (c) => seen = c,
      );

      await expectLater(api.request('GET', '/a'), throwsA(isA<MwApiError>()));

      expect(seen?.platform, 'web');
      expect(
        api.session,
        isNotNull,
        reason: 'jeton GEÇERLİ — yalnız sahiplik başka kopyada',
      );
    });
  });

  group('başlıklar', () {
    test('⭐ kimlik, örnek, künye ve yetki başlıkları birlikte gider', () async {
      final t = _Transport((r, _) async => const RawResponse(200, {}));
      final api = await _api(t, session: _session());

      await api.request('GET', '/a');

      final h = t.requests.single.headers;
      expect(h['x-device-id'], isNotNull);
      expect(
        h['x-client-instance'],
        h['x-device-id'],
        reason: 'mobilde ikisi AYNI değer',
      );
      expect(h['x-platform'], 'android');
      expect(h['x-app-version'], '1.0.0+1');
      expect(h['authorization'], 'Bearer acc');
    });

    test(
      '⚠️ gövdesiz istekte content-type YAZILMAZ (Fastify boş gövdeye 400 veriyor)',
      () async {
        final t = _Transport((r, _) async => const RawResponse(200, {}));
        final api = await _api(t, session: _session());

        await api.request('GET', '/a');
        expect(t.requests.single.headers.containsKey('content-type'), isFalse);

        await api.request('POST', '/b', body: {'x': 1});
        expect(t.requests.last.headers['content-type'], 'application/json');
      },
    );

    test('oturumsuzken authorization gönderilmez', () async {
      final t = _Transport((r, _) async => const RawResponse(200, {}));
      final api = await _api(t);

      await api.request('GET', '/a');
      expect(t.requests.single.headers.containsKey('authorization'), isFalse);
    });

    test('⚠️ YENİLEME isteği de TAM künyeyi taşır', () async {
      // Yenileme, giriş sonrası cihaz sinyalinin yazıldığı EN SIK yol. Künyesiz gönderilirse
      // aylarca açık kalan oturumun künyesi ilk günden kalma olur.
      final t = _Transport((r, _) async {
        if (r.path == '/api/v1/auth/refresh') {
          return RawResponse(200, _authBody());
        }
        return const RawResponse(401, {'message': 'yok'});
      });
      final api = await _api(t, session: _session());

      await api.request('GET', '/a').catchError((_) => null);

      final h = t.refreshes.single.headers;
      expect(h['x-device-id'], isNotNull);
      expect(h['x-client-instance'], isNotNull);
      expect(h['x-app-version'], '1.0.0+1');
      expect(h['x-os-version'], 'Android 16');
    });
  });

  group('⭐⭐ saat çıpası her yanıttan besleniyor', () {
    /// ⚠️ Bu kancanın kopması **sessiz** bir arıza: ekranlar çizilmeye devam eder, yalnız
    /// geri sayımlar cihaz saatiyle hesaplanır. Saati doğru olan geliştirici cihazında hiçbir
    /// şey görünmez; sapması olan oyuncuda süreler yanlış çıkar. Testle kilitleniyor.
    test('başarılı yanıttaki serverNow ve gameNow geçilir', () async {
      final gorulen = <(String?, String?)>[];
      final t = _Transport(
        (r, _) async => const RawResponse(200, {
          'serverNow': '2026-08-15T12:00:00.000Z',
          'gameNow': '2026-08-15T11:50:00.000Z',
        }),
      );
      final api = await _api(
        t,
        session: _session(),
        onServerTime: (s, g) => gorulen.add((s, g)),
      );

      await api.request('GET', '/a');

      expect(gorulen.single, (
        '2026-08-15T12:00:00.000Z',
        '2026-08-15T11:50:00.000Z',
      ));
    });

    test('⚠️ damgasız yanıt null geçer — çıpayı bozmaz', () async {
      // `MwClock` null gördüğünde çıpayı KORUYOR; buradaki iş yalnız "uydurma değer üretme".
      final gorulen = <(String?, String?)>[];
      final t = _Transport(
        (r, _) async => const RawResponse(200, {'ok': true}),
      );
      final api = await _api(
        t,
        session: _session(),
        onServerTime: (s, g) => gorulen.add((s, g)),
      );

      await api.request('GET', '/a');
      expect(gorulen.single, (null, null));
    });

    test('⚠️ BAŞARISIZ yanıt saati beslemez', () async {
      // 500'ün gövdesindeki bir damga (varsa) güvenilmez; hata yolunda çıpa oynatılmamalı.
      var cagrildi = false;
      final t = _Transport(
        (r, _) async =>
            const RawResponse(500, {'serverNow': '2026-08-15T12:00:00.000Z'}),
      );
      final api = await _api(
        t,
        session: _session(),
        onServerTime: (_, _) => cagrildi = true,
      );

      await api.request('GET', '/a').catchError((_) => null);
      expect(cagrildi, isFalse);
    });

    test('⭐ YENİLEME yanıtı da saati besler', () async {
      // Aylarca açık kalan bir oturumda çıpanın tazelendiği en güvenilir an bu olabiliyor.
      final gorulen = <(String?, String?)>[];
      final t = _Transport((r, _) async {
        if (r.path == '/api/v1/auth/refresh') {
          return RawResponse(200, _authBody());
        }
        return const RawResponse(401, {'message': 'yok'});
      });
      final api = await _api(
        t,
        session: _session(),
        onServerTime: (s, g) => gorulen.add((s, g)),
      );

      await api.request('GET', '/a').catchError((_) => null);

      expect(gorulen.first.$1, '2026-08-15T00:00:00.000Z');
    });
  });

  group('⭐ proaktif yenileme', () {
    test('refreshAt geçmişse istek ÖNCE yenilenir (401 beklenmez)', () async {
      final now = DateTime(2026, 8, 15, 12);
      final t = _Transport((r, _) async {
        if (r.path == '/api/v1/auth/refresh') {
          return RawResponse(200, _authBody(acc: 'yeni'));
        }
        return const RawResponse(200, {'ok': true});
      });
      final api = await _api(
        t,
        session: _session(refreshAt: now.subtract(const Duration(minutes: 1))),
        clock: () => now,
      );

      await api.request('GET', '/a');

      expect(
        t.requests.first.path,
        '/api/v1/auth/refresh',
        reason: 'yenileme İLK sırada olmalı',
      );
      expect(t.requests.last.headers['authorization'], 'Bearer yeni');
    });

    test('refreshAt gelecekteyse yenileme yapılmaz', () async {
      final now = DateTime(2026, 8, 15, 12);
      final t = _Transport((r, _) async => const RawResponse(200, {}));
      final api = await _api(
        t,
        session: _session(refreshAt: now.add(const Duration(hours: 1))),
        clock: () => now,
      );

      await api.request('GET', '/a');
      expect(t.refreshes, isEmpty);
    });
  });

  /// ⭐⭐ OTURUM DEĞİŞİMİ HABER VERİLİR — kullanıcı cihazda gördü: *"sağ üstteki ws bağlantı
  /// noktası neden kırmızı?"*
  ///
  /// ⚠️⚠️ `setSession` yalnız `s == null` iken haber veriyordu. Jeton YENİLENDİĞİNDE kimse
  /// haberdar olmuyordu → `sessionProvider` eski oturumu tutuyor → onu izleyen
  /// `realtimeProvider` yeniden kurulmuyor → soket el sıkışmada yakalanmış BAYAT jetonla
  /// sonsuza kadar deniyor. HTTP sağlam kalıyor (`MwApi` kendi alanını okuyor), yani arıza
  /// yalnız gerçek zamanlı katmanda görünüyordu — teşhisi en zor arıza biçimi.
  group('⭐⭐ oturum değişimi haber verilir', () {
    test('⭐ jeton YENİLENİNCE haber gider (kırmızı nokta hatası)', () async {
      final gelen = <Session?>[];
      final t = _Transport((r, i) async {
        if (r.path == '/api/v1/auth/refresh') {
          return RawResponse(200, _authBody(acc: 'taze-jeton'));
        }
        // İlk oyun isteği 401, yenilemeden SONRAKİ tekrar 200.
        return i == 0 ? RawResponse(401) : RawResponse(200, {'ok': true});
      });
      final api = await _api(t, session: _session(), onChanged: gelen.add);

      await api.request('GET', '/api/v1/cities');

      expect(gelen, isNotEmpty, reason: 'yenilenme sessiz kalmamalı');
      expect(gelen.last?.accessToken, 'taze-jeton');
    });

    /// ⚠️ Düşme de haber vermeye devam etmeli — iki kanca birbirinin yerine geçmiyor.
    test('oturum DÜŞÜNCE de haber gider ve null taşır', () async {
      final gelen = <Session?>[];
      // Yenileme de 401 → oturum gerçekten düşer.
      final t = _Transport((r, i) async => RawResponse(401));
      final api = await _api(t, session: _session(), onChanged: gelen.add);

      await api.request('GET', '/api/v1/cities').catchError((_) => null);

      expect(gelen.last, isNull);
    });
  });
}
