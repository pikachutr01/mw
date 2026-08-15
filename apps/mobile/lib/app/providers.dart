/// SAĞLAYICILAR — Riverpod bağımlılık grafiği.
///
/// ⚠️ **`@riverpod` codegen'i KULLANILMIYOR.** `build_runner` ikinci bir üretim zinciri
/// demekti; depoda tek codegen kapısı var (`contracts:check`) ve öyle kalıyor
/// (MOBIL_MIMARI.md §2). Elle yazılan sağlayıcı biraz daha uzun, karşılığında tek kapı.
///
/// ⚠️ Künye ve depo **önyüklemede** kuruluyor (`bootstrap.dart`) ve buraya `override` ile
/// giriyor. Alternatif olan `FutureProvider` zinciri, künyeye ihtiyaç duyan HER sağlayıcıyı
/// async yapardı — oysa künye uygulama ömrü boyunca değişmiyor.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/client_hints.dart';
import '../core/clock.dart';
import '../core/device_identity.dart';
import '../core/http_transport.dart';
import '../core/session.dart';
import '../core/storage.dart';

/// Önyüklemede override edilir. Override edilmeden okunursa bilerek patlar: sessizce
/// varsayılan bir künye üretmek, cihaz sinyalini aylarca yanlış toplamak demekti.
final clientHintsProvider = Provider<ClientHints>(
  (ref) =>
      throw StateError('clientHintsProvider önyüklemede override edilmeli'),
);

final storeProvider = Provider<Store>((ref) => SecureStore());

final identityProvider = Provider<DeviceIdentity>(
  (ref) => DeviceIdentity(ref.watch(storeProvider)),
);

/// Tek cihaz çakışması. Doluysa kapanamaz bir perde gösterilir.
class ConflictNotifier extends Notifier<SessionConflict?> {
  @override
  SessionConflict? build() => null;

  void update(SessionConflict? c) => state = c;
}

final conflictProvider = NotifierProvider<ConflictNotifier, SessionConflict?>(
  ConflictNotifier.new,
);

/// Oturum durumu. **Tek doğruluk kaynağı `MwApi`** — burası onun UI'ya yansıması.
/// İki yerde ayrı ayrı tutulsaydı, yenilemenin oturumu değiştirdiği anlar kaçardı.
class SessionNotifier extends Notifier<Session?> {
  @override
  Session? build() => null;

  void update(Session? s) => state = s;
}

final sessionProvider = NotifierProvider<SessionNotifier, Session?>(
  SessionNotifier.new,
);

/// ⭐⭐ Zaman çıpası. Uygulama boyunca **tek örnek** olmak zorunda: sapma ve bakım durumu
/// ondan okunuyor ve ikinci bir örnek hiç beslenmemiş (sapması 0) bir saat demek olurdu.
///
/// ⚠️ Tekil (global) bir değişken yerine sağlayıcı: testte sahte cihaz saatiyle kurulabilmesi
/// şart. Web'de modül düzeyinde durum tutuluyor ve orada da aynı gerekçeyle test edilebilmesi
/// için `noteServerTime` dışarıdan çağrılabilir bırakılmış.
final clockProvider = Provider<MwClock>((ref) => MwClock());

final apiProvider = Provider<MwApi>((ref) {
  return MwApi(
    sender: dioSender(),
    sessionStore: SessionStore(ref.watch(storeProvider)),
    identity: ref.watch(identityProvider),
    hints: ref.watch(clientHintsProvider),
    // ⚠️ `ref.read` (watch değil): geri çağrılar gelecekte çalışıyor, sağlayıcıyı yeniden
    // kurmamalı. `watch` burada döngü kurardı.
    onConflict: (c) => ref.read(conflictProvider.notifier).update(c),
    onSessionLost: () => ref.read(sessionProvider.notifier).update(null),
    // ⭐ Saat HER başarılı yanıttan besleniyor — web'deki `queries.ts` · `get<T>` ile aynı yer.
    onServerTime: (s, g) => ref.read(clockProvider).noteServerTime(s, g),
  );
});

/// Giriş/kayıt/çıkış — oturum yazan tek yer.
class Auth {
  const Auth(this._ref);

  final Ref _ref;

  MwApi get _api => _ref.read(apiProvider);

  Future<void> login({
    required String username,
    required String password,
    required int worldId,
  }) async {
    final body = await _api.request(
      'POST',
      '/api/v1/auth/login',
      body: {'username': username, 'password': password, 'worldId': worldId},
    );
    await _applySession(body);
  }

  Future<void> register({
    required String email,
    required String password,
    required String username,
    required int worldId,
  }) async {
    final body = await _api.request(
      'POST',
      '/api/v1/auth/register',
      body: {
        'email': email,
        'password': password,
        'username': username,
        'worldId': worldId,
      },
    );
    await _applySession(body);
  }

  Future<void> logout() async {
    // ⚠️ Sunucuya ulaşılamasa bile YEREL oturum düşer: aksi hâlde ağı olmayan oyuncu
    // uygulamadan çıkamazdı (web'de aynı karar).
    try {
      await _api.request('POST', '/api/v1/auth/logout');
    } catch (_) {
      // yut
    }
    await _api.setSession(null);
    _ref.read(sessionProvider.notifier).update(null);
    _ref.read(conflictProvider.notifier).update(null);
  }

  Future<void> _applySession(Object? body) async {
    final s = body is Map<String, dynamic>
        ? Session.fromAuthResponse(body)
        : null;
    if (s == null) {
      throw const MwApiError(0, 'Sunucu beklenmeyen bir yanıt döndürdü.');
    }
    await _api.setSession(s);
    _ref.read(sessionProvider.notifier).update(s);
    _ref.read(conflictProvider.notifier).update(null);
  }
}

final authProvider = Provider<Auth>(Auth.new);

/// Açık dünya listesi + en düşük istemci yapı numarası.
///
/// ⚠️ Oturum GEREKTİRMEZ (`/worlds` herkese açık) ve bu **şart**: sürümü çok eski olan
/// uygulama giriş DENEMEDEN önce durdurulmalı. Kimlikli bir uca bağlasaydık, eski uygulama
/// önce giriş yapar, jeton alır, sonra bozuk çalışırdı.
///
/// ⭐ İki tüketici tek istek paylaşıyor: giriş formundaki dünya seçici ve sürüm kapısı.
/// Ayrı sağlayıcılar açsaydık her açılışta aynı uca iki istek giderdi.
typedef BootInfo = ({List<({int id, String name})> worlds, int minBuild});

final bootProvider = FutureProvider<BootInfo>((ref) async {
  final body = await ref.read(apiProvider).request('GET', '/api/v1/worlds');
  final m = body is Map ? body : const {};
  final list = m['worlds'] as List<dynamic>? ?? const [];
  return (
    worlds: list
        .whereType<Map<String, dynamic>>()
        .map((w) => (id: (w['id'] as num).toInt(), name: w['name'] as String))
        .toList(),
    // ⚠️ Alan yoksa 0 → kapı KAPALI. Eski bir sunucuya bağlanan yeni uygulama, sunucu bu
    // alanı hiç göndermediği için kendini kilitlememeli.
    minBuild: (m['minAndroidBuild'] as num?)?.toInt() ?? 0,
  );
});
