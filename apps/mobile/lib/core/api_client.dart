/// API İSTEMCİSİ — başlıklar, yenileme ve hata sınıflandırması.
///
/// Web'deki karşılığı `apps/web/src/lib/api.ts`. Üç davranış bire bir taşınıyor, üçü de gerçek
/// hatalardan doğdu (MOBIL_MIMARI.md §3.4):
///
///   1. **Yenileme uçuşta tek söz** — iki eşzamanlı 401 iki yenileme başlatırsa, ikincisi
///      artık iptal edilmiş jetonla gider ve OTURUMU DÜŞÜRÜR.
///   2. **Oturum yalnız GERÇEK reddde düşer (401/403).** 502/503 geçici arızadır ve kimlik
///      doğrulama kararı değildir; eskiden her `!ok` oturumu siliyordu ve API yeniden
///      başlarken oyuncu jetonu hâlâ geçerliyken giriş ekranına atılıyordu.
///   3. **409 `session_conflict`** ayrı ele alınır — hata fırlatılır AMA oturum korunur;
///      oyuncuya "bu cihazda devam et" seçeneği sunulacak.
library;

import 'dart:async';

import 'client_hints.dart';
import 'device_identity.dart';
import 'session.dart';

/// Ham taşıma — **dikiş**. Üretimde dio, testte fixture döndüren bir fonksiyon.
/// ⚠️ Mock değil: beklenti/`verify` yok, gerçek bayt/JSON akıyor.
typedef Sender = Future<RawResponse> Function(RawRequest request);

class RawRequest {
  const RawRequest({
    required this.method,
    required this.path,
    required this.headers,
    this.body,
  });

  final String method;
  final String path;
  final Map<String, String> headers;
  final Object? body;
}

class RawResponse {
  const RawResponse(this.status, [this.body]);

  final int status;
  final Object? body;

  bool get ok => status >= 200 && status < 300;
}

/// API hatası. `code` sunucunun makine-okur kodu (`maintenance`, `session_conflict`,
/// `email_unverified`, `rate_limited` …).
class MwApiError implements Exception {
  const MwApiError(this.status, this.message, {this.code, this.body});

  final int status;
  final String message;
  final String? code;
  final Object? body;

  @override
  String toString() =>
      'MwApiError($status${code == null ? '' : ' $code'}): $message';
}

/// Tek cihaz çakışması — oturum DÜŞMEZ, oyuncuya devralma seçeneği sunulur.
class SessionConflict {
  const SessionConflict({this.platform, this.seenAt});

  final String? platform;
  final String? seenAt;
}

class MwApi {
  MwApi({
    required Sender sender,
    required SessionStore sessionStore,
    required DeviceIdentity identity,
    required ClientHints hints,
    this.onConflict,
    this.onSessionLost,
    this.onSessionChanged,
    this.onServerTime,
    DateTime Function()? clock,
    Future<void> Function(Duration)? sleep,
    // ⚠️ Aşağıdaki iki `ignore` gerçek bir yanlış öneriyi susturuyor: `prefer_initializing_formals`
    // `required this._identity` diyor, ama o adlandırılmış parametreyi `_identity:` yapar ve Dart
    // **alt çizgiyle başlayan adlandırılmış argümanı kabul etmiyor** — çağrı DERLENMİYOR
    // (ölçüldü, 2026-08-15). Alan private olmalı, parametre public; ikisi aynı ad olamaz.
  }) : _send = sender,
       _store = sessionStore,
       // ignore: prefer_initializing_formals
       _identity = identity,
       // ignore: prefer_initializing_formals
       _hints = hints,
       _clock = clock ?? DateTime.now,
       _sleep = sleep ?? Future<void>.delayed;

  final Sender _send;
  final SessionStore _store;
  final DeviceIdentity _identity;
  final ClientHints _hints;
  final DateTime Function() _clock;
  final Future<void> Function(Duration) _sleep;

  /// Tek cihaz çakışması görülünce çağrılır (kapanamaz modal açılacak).
  final void Function(SessionConflict)? onConflict;

  /// Oturum gerçekten düştüğünde çağrılır (giriş ekranına dönülecek).
  ///
  /// ⚠️ **Yalnız DÜŞME.** Yenilenme için `onSessionChanged` var ve ikisi ayrı durmak zorunda
  /// değil ama ayrı duruyorlar çünkü çağıranların biri (giriş ekranına dönmek) diğerinden
  /// (soketi yeniden kurmak) farklı bir iş yapıyor.
  final void Function()? onSessionLost;

  /// ⭐⭐ OTURUM **HER DEĞİŞTİĞİNDE** çağrılır — yenilenme dâhil (2026-08-17).
  ///
  /// ⚠️⚠️ **Bu kancanın yokluğu gerçek bir arızaydı ve cihazda görüldü:** kullanıcı
  /// *"sağ üstteki ws bağlantı noktası neden kırmızı?"* diye sordu. HTTP çalışıyor, soket ölü.
  ///
  /// Sebep: `setSession` yalnız `s == null` iken haber veriyordu. Jeton başarıyla
  /// yenilendiğinde (12 saatte bir) `sessionProvider` **eski oturumu tutmaya devam ediyor**,
  /// dolayısıyla onu izleyen `realtimeProvider` yeniden kurulmuyor ve soket el sıkışmada
  /// yakalanmış **bayat jetonla** sonsuza kadar deniyor. HTTP sağlam kalıyor çünkü `MwApi`
  /// kendi `_session` alanını okuyor — yani arıza yalnız gerçek zamanlı katmanda görünüyor.
  ///
  /// ⚠️ Web'de bu bağ ZATEN vardı (`onSessionChange(() => start())`, `lib/realtime.ts`);
  /// eksik olan yalnız mobildi. Aynı gün web tarafında düzeltilen "devralmadan sonra soket
  /// dirilmiyor" hatasının ikizi: **HTTP toparlanıyor, soket toparlanmıyor.**
  final void Function(Session?)? onSessionChanged;

  /// ⭐⭐ Her BAŞARILI yanıttaki sunucu damgaları — saat çıpası buradan besleniyor.
  ///
  /// ⚠️ Web'de aynı kanca `queries.ts` · `get<T>` içinde (`noteServerTime(t?.serverNow,
  /// t?.gameNow)`). Ekranlara bırakılsaydı her yeni ekran onu çağırmayı hatırlamak zorunda
  /// kalırdı ve unutulan ekranda geri sayımlar cihaz saatiyle çizilirdi — sapması olan
  /// cihazda sessizce yanlış.
  ///
  /// ⚠️ İKİ alan da geçiliyor: `gameNow` olmadan bakım donması hiç görülmez.
  final void Function(String? serverNow, String? gameNow)? onServerTime;

  Session? _session;
  bool _loaded = false;

  /// ⭐ Uçuştaki yenileme. İkinci bir yenileme BAŞLATILMAZ, bunun sonucu beklenir.
  Future<bool>? _refreshInFlight;

  /// Yenileme geçici arızayla başarısız olduysa bu ana kadar tekrar denenmez.
  /// ⚠️ Olmasaydı API kapalıyken saniyede onlarca yenileme isteği giderdi.
  DateTime _refreshBlockedUntil = DateTime.fromMillisecondsSinceEpoch(0);

  Session? get session => _session;

  Future<Session?> loadSession() async {
    if (_loaded) return _session;
    _session = await _store.read();
    _loaded = true;
    return _session;
  }

  Future<void> setSession(Session? s) async {
    _session = s;
    _loaded = true;
    await _store.write(s);
    // ⚠️ Sıra: önce DEĞİŞTİ, sonra DÜŞTÜ. Tersi olsaydı giriş ekranına dönüş, soketin
    //    kapatılmasından önce koşar ve bir an ölü jetonla bağlanmaya çalışan bir soket kalırdı.
    onSessionChanged?.call(s);
    if (s == null) onSessionLost?.call();
  }

  /// Yetkili istek. `noRefresh` yalnız yenileme çağrısının kendisi için (sonsuz döngü).
  Future<Object?> request(
    String method,
    String path, {
    Object? body,
    bool noRefresh = false,
  }) async {
    await loadSession();

    // ⭐ PROAKTİF YENİLEME — 401 beklenmez. Jetonun son %10'una girildiyse önce tazele.
    final s = _session;
    if (!noRefresh &&
        s?.refreshAt != null &&
        !_clock().isBefore(s!.refreshAt!)) {
      await _refresh();
    }

    var response = await _dispatch(method, path, body);

    // 401 emniyet ağı: proaktif yenileme kaçırmışsa (ör. sunucu ömrü kısalttı) bir kez dene.
    if (response.status == 401 && !noRefresh && _session != null) {
      if (await _refresh()) {
        response = await _dispatch(method, path, body);
      }
    }

    // ⚠️ Geçici yukarı-akış arızası — BİR kez sessizce tekrarlanır. Oturuma dokunulmaz.
    if (const {502, 503, 504}.contains(response.status) && !noRefresh) {
      await _sleep(const Duration(milliseconds: 800));
      response = await _dispatch(method, path, body);
    }

    if (response.ok) {
      _noteTime(response.body);
      return response.body;
    }

    final error = _parseError(response);

    // ⚠️ 409 `session_conflict`: oturum GEÇERLİ, yalnız sahiplik başka kopyada. Düşürme.
    if (response.status == 409 && error.code == 'session_conflict') {
      onConflict?.call(_parseConflict(response.body));
    }
    throw error;
  }

  Future<RawResponse> _dispatch(
    String method,
    String path,
    Object? body,
  ) async {
    return _send(
      RawRequest(
        method: method,
        path: path,
        headers: await _headers(hasBody: body != null),
        body: body,
      ),
    );
  }

  Future<Map<String, String>> _headers({required bool hasBody}) async {
    final id = await _identity.deviceId();
    return {
      // ⚠️ Gövdesiz istekte `content-type` YAZILMAZ: Fastify boş gövdeye
      // "Body cannot be empty..." 400'ü veriyor (web'de yaşandı).
      if (hasBody) 'content-type': 'application/json',
      'x-device-id': id,
      'x-client-instance': await _identity.instanceId(),
      ..._hints.headers(),
      if (_session != null) 'authorization': 'Bearer ${_session!.accessToken}',
    };
  }

  /// ⭐ Yenileme — uçuşta tek söz.
  Future<bool> _refresh() {
    final s = _session;
    if (s == null) return Future.value(false);
    if (_clock().isBefore(_refreshBlockedUntil)) return Future.value(false);

    return _refreshInFlight ??= _doRefresh(
      s.refreshToken,
    ).whenComplete(() => _refreshInFlight = null);
  }

  Future<bool> _doRefresh(String refreshToken) async {
    try {
      // ⚠️ Künye BURADA da gönderiliyor: yenileme, giriş sonrası cihaz sinyalinin yazıldığı
      // EN SIK yol. Yalnız girişe koysaydık aylarca açık kalan oturumun künyesi ilk günden
      // kalma olurdu (`auth.service.ts` → `issueSession` → `devices.record`).
      final response = await _send(
        RawRequest(
          method: 'POST',
          path: '/api/v1/auth/refresh',
          headers: await _headers(hasBody: true),
          body: {'refreshToken': refreshToken},
        ),
      );

      // ⚠️⚠️ OTURUM YALNIZ GERÇEK REDDE DÜŞER.
      if (response.status == 401 || response.status == 403) {
        await setSession(null);
        return false;
      }
      if (!response.ok) {
        _refreshBlockedUntil = _clock().add(const Duration(seconds: 10));
        return false;
      }

      final body = response.body;
      // ⭐ Yenileme yanıtı da `serverNow` taşıyor ve saatlerce açık kalan bir oturumda
      // çıpanın tazelendiği en güvenilir an burası olabiliyor.
      _noteTime(body);
      final fresh = body is Map<String, dynamic>
          ? Session.fromAuthResponse(body, now: _clock())
          : null;
      if (fresh == null) {
        await setSession(null);
        return false;
      }
      await setSession(fresh);
      return true;
    } catch (_) {
      // Ağ hatası jeton hakkında hiçbir şey söylemez → oturum korunur.
      _refreshBlockedUntil = _clock().add(const Duration(seconds: 10));
      return false;
    }
  }

  /// ⚠️ Damgası olmayan yanıt saati BOZMAMALI. Uçların bir kısmı `serverNow` göndermiyor
  /// (ör. `204`, düz liste dönenler); onlara `null` geçilince `MwClock` çıpayı korur.
  void _noteTime(Object? body) {
    if (onServerTime == null || body is! Map) return;
    final s = body['serverNow'];
    final g = body['gameNow'];
    onServerTime!(s is String ? s : null, g is String ? g : null);
  }

  MwApiError _parseError(RawResponse r) {
    final body = r.body;
    if (body is Map) {
      final code =
          body['code'] ??
          (body['error'] is Map ? (body['error'] as Map)['code'] : null);
      final message = body['message'] ?? body['error'];
      return MwApiError(
        r.status,
        message is String ? message : 'İstek başarısız (${r.status})',
        code: code is String ? code : null,
        body: body,
      );
    }
    return MwApiError(r.status, 'İstek başarısız (${r.status})', body: body);
  }

  SessionConflict _parseConflict(Object? body) {
    // Sunucu gövdesi: {code, message, holder:{platform, seenAt}}
    final holder = body is Map ? body['holder'] : null;
    if (holder is Map) {
      return SessionConflict(
        platform: holder['platform'] as String?,
        seenAt: holder['seenAt'] as String?,
      );
    }
    return const SessionConflict();
  }
}
