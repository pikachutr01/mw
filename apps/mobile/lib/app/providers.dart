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

import 'dart:async';

import 'package:flutter/widgets.dart' show AppLifecycleListener;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/client_hints.dart';
import '../core/clock.dart';
import '../core/device_identity.dart';
import '../core/http_transport.dart';
import '../core/realtime.dart';
import '../core/session.dart';
import '../core/storage.dart';
import '../features/city/catalog_model.dart';
import '../features/city/city_model.dart';
import '../gen/contracts.g.dart';

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
    // ⭐⭐ Jeton YENİLENİNCE de sağlayıcı güncellenmeli: `realtimeProvider` onu izliyor ve
    //    güncellenmezse soket bayat jetonla el sıkışmayı sonsuza kadar dener (kırmızı nokta).
    //    Gerekçenin tamamı `MwApi.onSessionChanged`de.
    onSessionChanged: (s) => ref.read(sessionProvider.notifier).update(s),
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

/// ⭐⭐ GERÇEK ZAMANLI BAĞLANTI — oturum varken açık durur, oturum düşünce kapanır.
///
/// ⚠️ `ref.watch(sessionProvider)`: jeton yenilenince (12 saatte bir) sağlayıcı yeniden kurulur
/// ve soket **yeni jetonla** bağlanır. Eski jetonla bağlanmak el sıkışmada reddedilir, istemci
/// bunu ağ arızası sanıp durmadan denerdi.
///
/// ⚠️⚠️ **Yaşam döngüsü BURADA dinleniyor** — arka plandan dönüşte yeniden bağlanma mobilin en
/// kolay atlanan noktası. Gerekçe `core/realtime.dart` başlığında; karar (`shouldForceReconnect`)
/// saf bir fonksiyonda ve testle kilitli.
final realtimeProvider = Provider<Realtime>((ref) {
  final session = ref.watch(sessionProvider);

  final rt = Realtime(
    // ⚠️ Kimlik her bağlanışta YENİDEN okunuyor, burada yakalanmıyor.
    credentials: () {
      final s = ref.read(sessionProvider);
      if (s == null) return null;
      // ⚠️ `instanceId` senkron gerekiyor; cihaz kimliği açılışta zaten önbelleğe alınmış
      // oluyor (`DeviceIdentity` bellek içi önbellek). Yine de boşsa bağlanmıyoruz —
      // kimliksiz el sıkışma sunucuda oturum kimliğine düşer ve tek cihaz kuralı şaşar.
      final id = ref.read(deviceIdProvider);
      if (id == null) return null;
      return (token: s.accessToken, instanceId: id);
    },
    onTopic: (topic) => _tazele(ref, topic),
    /* ⚠️ Künyeyle AYNI kaynak: HTTP başlığı ile el sıkışma yükü ayrışırsa sahiplik satırındaki
     * platform, isteği kimin attığına göre değişir ve modal yanlış cihazı gösterir. */
    platform: ref.read(clientHintsProvider).platform,
    // ⚠️ Devralınma oturumu DÜŞÜRMEZ — perde açılır, oyuncu geri alabilir.
    onTakeover: () =>
        ref.read(conflictProvider.notifier).update(const SessionConflict()),
    onRevoked: () async {
      await ref.read(apiProvider).setSession(null);
      ref.read(sessionProvider.notifier).update(null);
    },
  );

  // ⭐ Uygulama arka plana gidip geri geldiğinde toparlanma.
  final lifecycle = AppLifecycleListener(
    onResume: rt.resume,
    onPause: rt.pause,
    // ⚠️ `onHide`/`onInactive` DEĞİL: Android'de bildirim panelini açmak bile `inactive`
    // üretiyor ve her seferinde yeniden bağlanmak gereksiz el sıkışma yağmuru olurdu.
  );

  ref.onDispose(() {
    lifecycle.dispose();
    rt.dispose();
  });

  if (session != null) rt.connect();
  return rt;
});

/// Bağlantı durumu — üst çubuktaki gösterge bunu okuyor.
///
/// ⚠️ Başlangıç değeri sağlayıcının O ANKİ durumu; akış yalnız DEĞİŞİMLERİ yayıyor ve ilk
/// değeri kaçıran bir gösterge sonsuza kadar «bağlanıyor» gösterirdi.
final connectionProvider = StreamProvider<MwConnectionState>((ref) {
  final rt = ref.watch(realtimeProvider);
  return rt.onStateChange.transform(
    StreamTransformer.fromBind((s) async* {
      yield rt.state;
      yield* s;
    }),
  );
});

/// Cihaz kimliği — soketin el sıkışmada senkron olarak ihtiyaç duyduğu değer.
///
/// ⚠️ `DeviceIdentity.deviceId()` async; açılışta bir kez okunup buraya yazılıyor
/// (`bootstrap.dart`). Override edilmeden okunursa `null` döner ve soket bağlanmaz —
/// sessizce yanlış bir kimlikle bağlanmaktansa hiç bağlanmamak doğrusu.
final deviceIdProvider = Provider<String?>((ref) => null);

/// WS haberi → tazelenecek sağlayıcılar.
///
/// ⚠️ Eşleme `kInvalidates`te (tek yer); burada yalnız o adların Riverpod karşılığı var.
void _tazele(Ref ref, String topic) {
  final hedefler = topic == kTopicAll
      ? kInvalidates.values.expand((v) => v).toSet()
      : (kInvalidates[topic] ?? const []).toSet();

  for (final h in hedefler) {
    switch (h) {
      case 'cities':
        ref.invalidate(citiesProvider);
      case 'city':
        ref.invalidate(cityProvider);
      case 'catalog':
        // ⚠️⚠️ **`catalogProvider` 2026-08-16'ya kadar EKSİKTİ** — yalnız ad sözlüğü
        // tazeleniyordu. Oysa Baraka ekranının kendisi `catalogProvider`ı okuyor
        // (`barracks_screen.dart:37`) ve savaşta değişen Sur/Büyü Kalkanı **seviyesi** de
        // oradan geliyor. Yani WS olayı geliyor, doğru anahtara çevriliyor ve son adımda
        // sessizce yanlış sağlayıcıya düşüyordu: ekran hiç tazelenmiyordu.
        // İkisi birlikte, çünkü ikisi de aynı ucun (`/catalog`) farklı okumaları.
        ref.invalidate(catalogProvider);
        ref.invalidate(catalogNamesProvider);
      // ⚠️ `missions` ve `messages` ekranları henüz yok; konu tabloda duruyor ki sunucu
      // yaydığında sessizce düşmesin — ekran geldiğinde tek satır eklenecek.
    }
  }
}

/// ⭐ SANİYELİK SAYAÇ — geri sayım ve kaynak sayacı gösteren HER ekran bunu dinler.
///
/// ⚠️ Tek yerde: her bileşen kendi `Timer`ını kursaydı ekranda onlarca zamanlayıcı çalışırdı
/// (web'de aynı karar: `useTick`). Riverpod dinleyici kalmayınca akışı kendiliğinden kapatıyor,
/// yani arka planda boşa dönen sayaç kalmıyor.
final tickProvider = StreamProvider<int>(
  (ref) => Stream<int>.periodic(const Duration(seconds: 1), (i) => i),
);

/// Oyuncunun şehirleri. ⭐ `CitySummary` **üretilmiş sözleşme** (`contracts.g.dart`) — bu uç
/// borç defterinin ödenmiş tarafında.
final citiesProvider = FutureProvider<List<CitySummary>>((ref) async {
  // ⚠️ Oturuma bağlı: çıkışta liste boşalsın ve yeni girişte yeniden çekilsin. `watch`
  // olmasaydı önceki oyuncunun şehirleri ekranda kalırdı.
  if (ref.watch(sessionProvider) == null) return const [];
  final body = await ref.read(apiProvider).request('GET', '/api/v1/cities');
  final list = body is Map ? body['cities'] as List<dynamic>? : null;
  return (list ?? const [])
      .whereType<Map<String, dynamic>>()
      .map(CitySummary.fromJson)
      .toList();
});

/// ⚠️ Web'le **aynı anahtar** (`localStorage['mw-active-city']`). Aynı adı kullanmak iki
/// istemcinin aynı kavramı aynı isimle tuttuğunu belgeliyor; değerler zaten paylaşılmıyor.
const String kActiveCityKey = 'mw-active-city';

/// Seçili şehir. Diskte tutuluyor: uygulama her açıldığında oyuncuyu ilk şehrine geri
/// döndürmek, çok şehirli oyuncu için sürekli bir sürtünme olurdu.
class ActiveCity extends AsyncNotifier<int?> {
  @override
  Future<int?> build() async {
    final raw = await ref.read(storeProvider).read(kActiveCityKey);
    final saved = raw == null ? null : int.tryParse(raw);
    final cities = await ref.watch(citiesProvider.future);
    if (cities.isEmpty) return null;
    // ⚠️ Kayıtlı şehir ARTIK YOKSA (terk edildi, ele geçirildi) ilkine düş: yoksa ekran
    // kalıcı olarak 404 gösterirdi ve oyuncunun bunu düzeltmesinin bir yolu olmazdı.
    final gecerli = saved != null && cities.any((c) => c.id == saved);
    return gecerli ? saved : cities.first.id;
  }

  Future<void> select(int id) async {
    await ref.read(storeProvider).write(kActiveCityKey, '$id');
    state = AsyncData(id);
  }
}

final activeCityProvider = AsyncNotifierProvider<ActiveCity, int?>(
  ActiveCity.new,
);

/// ⚠️ Emniyet ağı — web'deki `SAFETY_NET_MS` ile aynı 60 sn.
///
/// Web bunu WS bağlıyken 5 dakikaya çıkarıyor (`WS_IDLE_MS`); mobilde **henüz WS yok**, yani
/// kısa aralık doğru olan. WS geldiğinde bu sabit de o karara bağlanacak.
const Duration kCitySafetyNet = Duration(seconds: 60);

/// Şehrin tam durumu.
final cityProvider = FutureProvider.family<CityDetail, int>((ref, id) async {
  // ⭐ Emniyet ağı: sunucu otoritedir, istemcinin ekstrapolasyonu yalnız aradaki saniyeleri
  // dolduruyor. Çıpa tazelenmezse sayaçlar yavaşça gerçeklikten ayrılır.
  final timer = Timer(kCitySafetyNet, ref.invalidateSelf);
  ref.onDispose(timer.cancel);

  final body = await ref.read(apiProvider).request('GET', '/api/v1/cities/$id');
  if (body is! Map<String, dynamic>) {
    throw const MwApiError(0, 'Şehir verisi okunamadı.');
  }
  return CityDetail.fromJson(body);
});

/// ⭐ ŞEHİR KATALOĞU — maliyet, süre, ön koşul ve adlar.
///
/// ⚠️ Şehre bağlı: süreler Baraka/Mimar Okulu seviyesine, maliyetler dünya ayarlarına göre
/// değişiyor. Tek bir "global katalog" tutmak, farklı Baraka seviyesindeki iki şehirde aynı
/// süreyi göstermek olurdu.
///
/// ⛔ Katalog Dart'a ÜRETİLMEZ — gerekçe `features/city/catalog_model.dart` başlığında.
final catalogProvider = FutureProvider.family<CityCatalog, int>((
  ref,
  cityId,
) async {
  final body = await ref
      .read(apiProvider)
      .request('GET', '/api/v1/cities/$cityId/catalog');
  if (body is! Map<String, dynamic>) {
    throw const MwApiError(0, 'Katalog okunamadı.');
  }
  return CityCatalog.fromJson(body);
});

/// `id` → oyuncuya görünen TÜRKÇE ad.
///
/// ⚠️ Kod, DB, URL ve katalog `id`'leri İngilizce; **ekranda İngilizce görünmez** (§13.14).
/// ⭐ Katalogla AYNI istekten türetiliyor: ayrı bir sağlayıcı açsaydık her ekranda aynı uca
/// iki istek giderdi.
/// ⚠️ Ad bulunamazsa `id`'nin kendisi gösteriliyor — web'deki `nameOf` ile aynı davranış:
/// sunucuya yeni bir birim eklendiğinde ekran boş kalmaz, ham adıyla görünür.
final catalogNamesProvider = FutureProvider.family<Map<String, String>, int>((
  ref,
  cityId,
) async {
  final body = await ref
      .read(apiProvider)
      .request('GET', '/api/v1/cities/$cityId/catalog');
  return body is Map<String, dynamic>
      ? CityCatalog.namesFrom(body)
      : const <String, String>{};
});

/// ⭐ KUYRUK İŞLEMLERİ — emir ver · iptal et · sırala.
///
/// ⚠️ Başarıdan sonra tazelenecek anahtarlar web'deki `useEnqueue`/`useCancelQueue`/
/// `useMoveQueue` ile **aynı**: kaynak ve kuyruk şehirden, maliyet katalogdan geliyor ve
/// ikisi de emirden sonra değişiyor. `cities` yalnız iptalde: bir emir iptal edilince
/// şehir puanı değişebiliyor ve şerit onu gösteriyor.
class CityQueues {
  const CityQueues(this._ref, this.cityId);

  final Ref _ref;
  final int cityId;

  MwApi get _api => _ref.read(apiProvider);

  Future<void> enqueue({
    required String category,
    required String type,
    int? count,
  }) async {
    await _api.request(
      'POST',
      '/api/v1/cities/$cityId/queues',
      body: {'category': category, 'type': type, 'count': ?count},
    );
    _tazele(_ref, 'city:changed');
  }

  Future<void> cancel(int queueId) async {
    await _api.request('DELETE', '/api/v1/cities/queues/$queueId');
    _tazele(_ref, 'cities:changed');
    _tazele(_ref, 'city:changed');
  }

  /// ⚠️ Yalnız BEKLEYEN emir taşınabilir; süren emri taşımayı sunucu reddediyor.
  Future<void> move(int queueId, String direction) async {
    await _api.request(
      'POST',
      '/api/v1/cities/queues/$queueId/move',
      body: {'direction': direction},
    );
    _tazele(_ref, 'city:changed');
  }
}

final cityQueuesProvider = Provider.family<CityQueues, int>(CityQueues.new);

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
