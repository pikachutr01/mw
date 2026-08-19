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
import '../features/armies/movement.dart';
import '../features/alliance/alliance_model.dart';
import '../features/chat/chat_message.dart';
import '../features/chat/room_message.dart';
import '../features/command/overview_model.dart';
import '../features/command/ranking_model.dart';
import '../features/city/catalog_model.dart';
import '../features/city/city_model.dart';
import '../features/messages/battle_report.dart';
import '../features/messages/message.dart';
import '../features/temple/hero_model.dart';
import '../features/world/mission_options.dart';
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
      case 'overview':
        // ⭐ 2026-08-18: Komuta Merkezi gelince web'in tablosundaki `overview` anahtarı
        // mobilde de karşılık buldu. ⚠️ Savaş şehirdeki orduyu, savunmayı ve kasayı
        // değiştiriyor; Genel Durum tablosu üçünü de gösteriyor.
        ref.invalidate(overviewProvider);
      case 'catalog':
        // ⚠️⚠️ **`catalogProvider` 2026-08-16'ya kadar EKSİKTİ** — yalnız ad sözlüğü
        // tazeleniyordu. Oysa Baraka ekranının kendisi `catalogProvider`ı okuyor
        // (`barracks_screen.dart:37`) ve savaşta değişen Sur/Büyü Kalkanı **seviyesi** de
        // oradan geliyor. Yani WS olayı geliyor, doğru anahtara çevriliyor ve son adımda
        // sessizce yanlış sağlayıcıya düşüyordu: ekran hiç tazelenmiyordu.
        // İkisi birlikte, çünkü ikisi de aynı ucun (`/catalog`) farklı okumaları.
        ref.invalidate(catalogProvider);
        ref.invalidate(catalogNamesProvider);
      case 'missions':
        // ⭐ 2026-08-17: Ordular ekranı gelince tabloda karşılıksız duran ilk konu bağlandı.
        // ⚠️ Bu satır olmadan hareket listesi yalnız 60 sn'lik emniyet ağıyla tazelenirdi:
        // oyuncu orduyu yola çıkarır, ekranda bir dakikaya kadar hiçbir şey görmezdi.
        ref.invalidate(movementsProvider);
      case 'temple':
        // ⭐ Savaşta kahraman ölüyor; ekran açıkken durumu «Şehirde» kalmaya devam ediyordu.
        ref.invalidate(templeProvider);
      case 'messages':
        // ⭐ 2026-08-18: Posta kutusu ekranı gelince tablodaki son karşılıksız konu bağlandı.
        // ⚠️ **Aile ayrımı yapılmıyor** (`invalidate(messagesProvider)` — tek argümanla tüm
        // aile): alt bardaki rozet sorgusu (`pageSize: 1`) ile ekranın liste sorgusu ayrı
        // anahtarlarda ve ikisi de aynı anda düşmeli. Web'de bu tam olarak yanlış yapılmıştı
        // (`getQueryData(['messages'])` TAM eşleşme arıyordu) ve iyimser rozet düşüşü aylarca
        // sessizce ölü kaldı.
        ref.invalidate(messagesProvider);
      case 'chat':
        ref.invalidate(chatConversationsProvider);
      case 'alliance':
        // 2026-08-19: Ittifak ekrani gelince tabloda karsiliksiz duran konu baglandi.
        // Aile ayrimi yok: hangi sayfa acikse o tazelensin.
        ref.invalidate(allianceProvider);
      case 'alliance-chat-history':
        ref.invalidate(allianceChatHistoryProvider);
      case 'global-chat-history':
        ref.invalidate(globalChatHistoryProvider);
      case 'chat-history':
        // ⚠️ Aile ayrımı yapılmıyor: açık sohbet hangisiyse onun geçmişi tazelenmeli ve olay
        // hangi kanala ait olduğunu **taşımıyor** (kural: olay haber taşır, veri değil).
        // Kapalı kanalların tazelenmesi bedava — dinleyicisi olmayan aile üyesi zaten ölü.
        ref.invalidate(chatHistoryProvider);
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

/// ⭐⭐ ORDU HAREKETLERİ — gidip gelen tüm görevler, **tek istekte tüm şehirler**.
///
/// ⚠️ Şehre göre AİLE (`family`) yapılmadı, oysa uç `?cityId=` süzgecini destekliyor. Sebep:
/// şerit BÜTÜN şehirleri yan yana çiziyor ve her birinin altına kendi hareketlerini asıyor —
/// aile olsaydı beş şehirli oyuncuda her tazelemede beş istek giderdi. Süzme istemcide, tek
/// listeden (web'de de aynı karar).
///
/// ⚠️ Emniyet ağı şehirle aynı 60 sn. Gerçek tazeleme WS'ten geliyor (`missions:changed`,
/// `battle:resolved`); bu yalnız soket kopuk kaldığı pencerede ekran donmasın diye.
final movementsProvider = FutureProvider<List<Movement>>((ref) async {
  // ⚠️ Oturuma bağlı: çıkışta liste boşalsın. Aksi hâlde önceki oyuncunun orduları ekranda
  // kalırdı (`citiesProvider` ile aynı gerekçe).
  if (ref.watch(sessionProvider) == null) return const [];

  final timer = Timer(kCitySafetyNet, ref.invalidateSelf);
  ref.onDispose(timer.cancel);

  final body = await ref.read(apiProvider).request('GET', '/api/v1/missions');
  final list = body is Map ? body['movements'] as List<dynamic>? : null;
  return (list ?? const [])
      .whereType<Map<String, dynamic>>()
      .map(Movement.fromJson)
      .toList();
});

/// ⭐ DİYAR LİSTESİ — `GET /api/v1/world/:k/:d`, on slot.
///
/// ⚠️ Anahtar **kayıt (record)**: Riverpod ailesi tek parametre alıyor ve `(k, d)` bir çift.
/// Kayıtlar değer eşitliğine sahip, yani aynı diyar için ikinci bir istek gitmiyor.
///
/// ⚠️ Emniyet ağı şehirle aynı 60 sn. Diyar listesi nadiren değişiyor; şehir kurulunca
/// `cities:changed` zaten geliyor.
final worldProvider = FutureProvider.family<List<WorldSlot>, ({int k, int d})>((
  ref,
  realm,
) async {
  if (ref.watch(sessionProvider) == null) return const [];

  final timer = Timer(kCitySafetyNet, ref.invalidateSelf);
  ref.onDispose(timer.cancel);

  final body = await ref
      .read(apiProvider)
      .request('GET', '/api/v1/world/${realm.k}/${realm.d}');
  final list = body is Map ? body['slots'] as List<dynamic>? : null;
  return (list ?? const [])
      .whereType<Map<String, dynamic>>()
      .map(WorldSlot.fromJson)
      .toList();
});

/// ⭐ SEFER SEÇENEKLERİ — bir hedefe hangi görevlerin gönderilebileceği.
///
/// ⚠️ Kural sunucuda; istemci hesaplamıyor (gerekçe `mission_options.dart` başlığında).
/// ⚠️ **Önbelleğe alınmıyor** (emniyet ağı yok, `keepAlive` yok): saldırı hakkı ve teleport
/// beklemesi zamanla değişiyor, bayat bir seçenek listesi oyuncuya kapalı bir görevi açık
/// gösterirdi. Sheet her açılışta taze soruyor.
final missionOptionsProvider =
    FutureProvider.family<
      MissionOptions,
      ({int originCityId, int k, int d, int s})
    >((ref, q) async {
      final body = await ref
          .read(apiProvider)
          .request(
            'GET',
            '/api/v1/missions/options'
                '?originCityId=${q.originCityId}&k=${q.k}&d=${q.d}&s=${q.s}',
          );
      if (body is! Map<String, dynamic>) {
        throw const MwApiError(0, 'Sefer seçenekleri okunamadı.');
      }
      return MissionOptions.fromJson(body);
    });

/// ⭐ TAPINAK — şehrin kahramanları, seviyesi ve kapasitesi.
///
/// ⚠️ Emniyet ağı şehirle aynı 60 sn: diriltme ve dönüş geri sayımları istemcide akıyor ama
/// **bitişi sunucu yazıyor**. Çıpa tazelenmezse ekran «birazdan biter» hâlinde asılı kalırdı.
final templeProvider = FutureProvider.family<TempleView, int>((
  ref,
  cityId,
) async {
  final timer = Timer(kCitySafetyNet, ref.invalidateSelf);
  ref.onDispose(timer.cancel);

  final body = await ref
      .read(apiProvider)
      .request('GET', '/api/v1/cities/$cityId/temple');
  if (body is! Map<String, dynamic>) {
    throw const MwApiError(0, 'Tapınak okunamadı.');
  }
  return TempleView.fromJson(body);
});

/// ⭐ SEFERE KATILABİLECEK KAHRAMANLAR — sefer formundaki seçici.
///
/// ⚠️ `templeProvider`dan TÜREİYOR, ayrı bir istek DEĞİL: ikisi aynı uca gidiyor ve ayrı
/// sağlayıcı açsaydık Tapınak ekranı açıkken sefer formu aynı veriyi ikinci kez çekerdi.
/// ⚠️ Süzgeç yalnız `in_city`: gerekçe `MwCityHero`da.
final cityHeroesProvider = FutureProvider.family<List<MwCityHero>, int>((
  ref,
  cityId,
) async {
  final temple = await ref.watch(templeProvider(cityId).future);
  return [
    for (final h in temple.heroes)
      if (h.state == 'in_city')
        MwCityHero(id: h.id, name: h.name, level: h.level),
  ];
});

/// ⭐ KAHRAMAN EYLEMLERİ — puan dağıt · adını değiştir · dirilt · diriltmeyi durdur.
///
/// ⚠️ Hepsi tapınağı, şehri VE şehir listesini tazeliyor: diriltme kaynak harcıyor (şehir),
/// puan dağıtımı oyuncunun gücünü değiştiriyor (liste puanı gösteriyor).
class Heroes {
  const Heroes(this._ref);

  final Ref _ref;

  Future<void> _post(int cityId, String path, [Object? body]) async {
    await _ref
        .read(apiProvider)
        .request('POST', '/api/v1/heroes/$path', body: body);
    _ref.invalidate(templeProvider(cityId));
    _tazele(_ref, 'cities:changed');
    _tazele(_ref, 'city:changed');
  }

  Future<void> setSkills(int cityId, int heroId, Map<String, int> skills) =>
      _post(cityId, '$heroId/skills', skills);

  Future<void> rename(int cityId, int heroId, String name) =>
      _post(cityId, '$heroId/rename', {'name': name});

  Future<void> revive(int cityId, int heroId) =>
      // ⚠️ Gövdesiz istekte `content-type` yazılmıyor ve Fastify boş gövdeye 400 veriyor —
      // bu yüzden boş bir nesne gönderiliyor (`missions/:id/cancel` ile aynı gerekçe).
      _post(cityId, '$heroId/revive', const {});

  Future<void> cancelRevive(int cityId, int heroId) =>
      _post(cityId, '$heroId/revive/cancel', const {});
}

final heroesProvider = Provider<Heroes>(Heroes.new);

/// ⭐ GÖREV İPTALİ — yoldaki orduyu geri çağırır.
///
/// ⚠️ Başarıdan sonra `city` de tazeleniyor, yalnız `missions` değil: iptal edilen görev bir
/// dönüş bacağı doğuruyor ve o ordu eve varınca şehrin asker sayısı değişiyor. Web'de de aynı
/// ikili (`useCancelMission` → `invalidate(['missions', 'city'])`).
class Missions {
  const Missions(this._ref);

  final Ref _ref;

  Future<void> cancel(int missionId) async {
    await _ref
        .read(apiProvider)
        .request('POST', '/api/v1/missions/$missionId/cancel', body: const {});
    _tazele(_ref, 'missions:changed');
    _tazele(_ref, 'city:changed');
  }

  /// ⭐⭐ SEFER GÖNDER — saldırı dâhil **tüm tipler tek uçtan** (`POST /missions/send`).
  ///
  /// ⚠️ Başarıdan sonra `city` de tazeleniyor: birlikler ANINDA şehirden düşüyor ve kargo
  /// kasadan çıkıyor. Yalnız `missions` tazelenseydi oyuncu, gönderdiği orduyu barakada
  /// durur hâlde görmeye devam ederdi.
  ///
  /// ⚠️ `heroIds` ve `cargo` **yalnız doluysa** gönderiliyor: sunucu şeması ikisini de
  /// isteğe bağlı tanımlıyor ve boş bir `cargo: {0,0}` göndermek, kargosuz görevlerde
  /// anlamsız bir alan taşımak olurdu.
  Future<void> send({
    required String type,
    required int originCityId,
    required ({int k, int d, int s}) target,
    required Map<String, int> units,
    List<int> heroIds = const [],
    ({int gold, int food})? cargo,
  }) async {
    await _ref
        .read(apiProvider)
        .request(
          'POST',
          '/api/v1/missions/send',
          body: {
            'type': type,
            'originCityId': originCityId,
            'target': {'k': target.k, 'd': target.d, 's': target.s},
            'units': units,
            if (heroIds.isNotEmpty) 'heroIds': heroIds,
            if (cargo != null)
              'cargo': {'gold': cargo.gold, 'food': cargo.food},
          },
        );
    _tazele(_ref, 'missions:changed');
    _tazele(_ref, 'city:changed');
  }
}

final missionsProvider = Provider<Missions>(Missions.new);

/// ⭐⭐ POSTA KUTUSU — `GET /api/v1/messages`, **sunucu tarafında sayfalı ve süzgeçli**.
///
/// ⚠️ Anahtar `kind` ve `page` TAŞIYOR: sekme ya da sayfa değişince gerçekten yeni bir istek
/// gidiyor. Bir ara web'de tek bir `['messages']` anahtarı vardı ve istemci `slice` ile
/// "sayfalıyordu" — yani sayfalama görsel bir yanılsamaydı.
///
/// ⚠️ **Rozet sorgusu da BU sağlayıcı**, `pageSize: 1` ile (web'de de öyle: `Shell.tsx`).
/// Ayrı bir sayaç ucu açmak, aynı sayıyı iki yoldan getirmek olurdu; alt bar yalnız `unread`i
/// okuyor ve tek satırlık bir sayfa onu da taşıyor.
///
/// ⚠️ Emniyet ağı diğerleriyle aynı 60 sn. Gerçek tazeleme WS'ten geliyor
/// (`messages:changed`, `battle:resolved`).
final messagesProvider =
    FutureProvider.family<
      MessagePage,
      ({String kind, int page, int pageSize})
    >((ref, q) async {
      // ⚠️ Oturuma bağlı: çıkışta kutu boşalsın, yeni girişte yeniden çekilsin
      // (`citiesProvider` ile aynı gerekçe).
      if (ref.watch(sessionProvider) == null) return MessagePage.empty;

      final timer = Timer(kCitySafetyNet, ref.invalidateSelf);
      ref.onDispose(timer.cancel);

      final body = await ref
          .read(apiProvider)
          .request(
            'GET',
            '/api/v1/messages'
                '?kind=${q.kind}&page=${q.page}&limit=${q.pageSize}',
          );
      if (body is! Map<String, dynamic>) {
        throw const MwApiError(0, 'Posta kutusu okunamadı.');
      }
      return MessagePage.fromJson(body);
    });

/// ⭐ ALT BARDAKİ OKUNMAMIŞ ROZETİ — tek satırlık sayfa.
///
/// ⚠️ Sayı **iki sekmenin toplamı** (`unread`), sekme ayrımı yok: alt bardaki tek rozet
/// "posta kutusunda bekleyen bir şey var mı" sorusuna cevap veriyor, hangi sekmede olduğu
/// ekran açılınca zaten görünüyor.
const kUnreadQuery = (kind: 'all', page: 0, pageSize: 1);

/// ⭐ TEK MESAJIN GÖVDESİ — liste ucundan AYRI (sunucuda 2026-08-03'te ayrıldı).
///
/// Liste 60 saniyede bir dönüyor ve gövdeler küçük değil: bir savaş raporunda ganimet
/// dökümü, mağara dökümü ve iki birim sözlüğü; bir casus raporunda hedefin TÜM birim ve
/// savunma sayımı. Gövde yalnız detay açılınca gerekiyor.
///
/// ⚠️ Emniyet ağı YOK ve olmamalı: gövde yazıldığı gibi kalıyor, tazelenecek bir şeyi yok.
/// ⚠️ Sözleşme borcu: gövde `jsonb` ve türü sunucuda da `Record<string, unknown>` — burada
/// tiplemek sahte bir kapı olurdu. Alanlar okunduğu yerde savunmayla çözülüyor.
final messageBodyProvider = FutureProvider.family<Map<String, dynamic>, int>((
  ref,
  id,
) async {
  final body = await ref
      .read(apiProvider)
      .request('GET', '/api/v1/messages/$id');
  final icerik = body is Map ? body['body'] : null;
  return icerik is Map<String, dynamic> ? icerik : const {};
});

/// ⭐⭐ SAVAŞ RAPORU — `GET /api/v1/battles/:id`.
///
/// ⚠️ **Her açılışta sunucudan** çekiliyor: emniyet ağı yok ama önbellek de tutulmuyor
/// (`autoDispose` varsayılan). Rapor bir savaşın KANITI; önbellekten bayat gösterilmesi
/// "sayılar tutmuyor" tartışması doğurur. Web'de aynı karar (`staleTime: 0` +
/// `refetchOnMount: 'always'`).
final battleProvider = FutureProvider.family<BattleReport, int>((
  ref,
  battleId,
) async {
  final body = await ref
      .read(apiProvider)
      .request('GET', '/api/v1/battles/$battleId');
  if (body is! Map<String, dynamic>) {
    throw const MwApiError(0, 'Rapor okunamadı.');
  }
  return BattleReport.fromJson(body);
});

/// ⭐ POSTA KUTUSU EYLEMLERİ — okundu işaretle · sil · ittifak davetini karara bağla.
///
/// ⚠️ **İyimser güncelleme YOK** (web'den bilinçli ayrılma). Web `markRead`i iyimser yapıyor:
/// rozet sunucu yanıtını beklemeden düşüyor. Burada gerek kalmadı çünkü mobilde detay bir
/// **sheet** ve açılış animasyonu zaten sunucu turundan uzun; iyimser yol, karşılığında
/// geri-alma dalı ve ikinci bir doğruluk kaynağı isterdi.
class Messages {
  const Messages(this._ref);

  final Ref _ref;

  /// ⚠️ Sunucu 204 dönüyor ve zaten okunmuş satırı hiç güncellemiyor: ikinci kez çağırmak
  /// zararsız. Bu yüzden istemcide "okunmuş muydu" kontrolü yapılmıyor.
  Future<void> markRead(int id) async {
    await _ref
        .read(apiProvider)
        .request('POST', '/api/v1/messages/$id/read', body: const {});
    _tazele(_ref, 'messages:changed');
  }

  /// ⭐ Tek satır da toplu seçim de **AYNI uçtan** (`ids` dizisi) — sunucuda tek sahiplik
  /// koşulu var, ikinci bir yol açsaydık sızıntı tam oradan çıkardı.
  Future<void> delete(List<int> ids) async {
    if (ids.isEmpty) return;
    await _ref
        .read(apiProvider)
        .request('POST', '/api/v1/messages/delete', body: {'ids': ids});
    _tazele(_ref, 'messages:changed');
  }

  /// ⭐ İTTİFAK DAVETİ / BAŞVURUSU — Kabul/Red, mesaj kutusundan (orijinal t=8/9 akışı).
  ///
  /// ⚠️ İstek çoktan sonuçlandıysa sunucu 409 dönüyor ve hata kutusunda görünüyor; istemci
  /// "hâlâ açık mı" diye ayrıca sormuyor — cevap ancak sunucuda kesin.
  Future<void> decideInvite(int inviteId, {required bool accept}) async {
    await _ref
        .read(apiProvider)
        .request(
          'POST',
          '/api/v1/alliance/invites/$inviteId/${accept ? 'accept' : 'reject'}',
          body: const {},
        );
    _tazele(_ref, 'messages:changed');
    _tazele(_ref, 'cities:changed');
  }
}

final messagesActionsProvider = Provider<Messages>(Messages.new);

/// ⭐ DÜNYA DURUMU — `GET /api/v1/world/state`.
///
/// ⚠️ Bugün yalnız **Genel Sohbet açık mı** okunuyor. Aynı uç bakım perdesini de besliyor
/// (`paused` · `notice`) ama o perde mobilde HENÜZ YOK; alanı okuyup kullanmamak, ekranda
/// karşılığı olmayan bir veri taşımak olurdu. Perde geldiğinde bu sağlayıcı büyüyecek.
///
/// ⚠️ Sohbet bayrağı burada olmak ZORUNDA: kart ve kısayol, oyuncu sohbete **bağlanmadan
/// önce** çizilip çizilmeyeceğini bilmeli — cevabı sohbetin kendi açılış paketinden okuyamaz
/// (o paket ancak bağlanınca geliyor). Sunucu bu isteği bellekten karşılıyor, sorgu yok.
final worldStateProvider = FutureProvider<({bool globalChat})>((ref) async {
  if (ref.watch(sessionProvider) == null) return (globalChat: false);
  final body = await ref
      .read(apiProvider)
      .request('GET', '/api/v1/world/state');
  return (
    globalChat: (body is Map ? body['globalChat'] as bool? : null) ?? false,
  );
});

/// ⭐⭐ GENEL SOHBET AÇILIŞ PAKETİ — kanal kimliği ve yazma hakkı.
///
/// ⚠️⚠️ **YALNIZ bağlanınca çekiliyor.** Sağlayıcıyı ekran mount olduğunda okuyoruz ve ekran
/// yalnız «Sohbete Bağlan» denince mount oluyor — yani kopukken hiç istek gitmiyor.
/// Kullanıcı şartı olan *"bağlantıyı kopardığında sohbet çevrimdışı"* bir bayrakla değil,
/// **hiç sorgu açmamakla** sağlanıyor (web'de de aynı karar).
final globalChatOpenProvider = FutureProvider<RoomOpen>((ref) async {
  final body = await ref
      .read(apiProvider)
      .request('GET', '/api/v1/chat/global');
  if (body is! Map<String, dynamic>) {
    throw const MwApiError(0, 'Genel sohbet açılamadı.');
  }
  return RoomOpen.fromJson(body);
});

/// ⭐ GENEL SOHBET GEÇMİŞİ — en yeni sayfa.
///
/// ⚠️ Eski sayfalar burada değil, ekranın durumunda birikiyor (DM'le aynı gerekçe:
/// Riverpod'da "sonsuz sorgu" karşılığı yok).
/// ⚠️ Emniyet ağı YOK: tazeleme `chat:global` olayından geliyor ve o olay **kanal odasından**,
/// yani bağlı değilken hiç tetiklenmiyor — istenen tam da bu.
final globalChatHistoryProvider = FutureProvider<RoomHistoryPage>((ref) async {
  final body = await ref
      .read(apiProvider)
      .request('GET', '/api/v1/chat/global/messages');
  return body is Map<String, dynamic>
      ? RoomHistoryPage.fromJson(body)
      : RoomHistoryPage.empty;
});

/// ⭐⭐ İTTİFAĞIM — `GET /api/v1/alliance`.
///
/// ⚠️ Yanıt İKİ ŞEKİLDEN biri: üyeysem `alliance` dolu, değilsem `null` + kurma şartı. İki
/// ayrı sağlayıcı açmadık çünkü **tek istek** ikisini de karara bağlıyor ve hangisinin
/// geleceğini istemci önceden bilmiyor.
///
/// ⚠️ Aile anahtarı SAYFA: üye listesi sunucuda sayfalı (0 tabanlı).
/// ⚠️ Emniyet ağı YOK — üyelik ve rütbe `alliance:changed` olayıyla tazeleniyor; sıra ve puan
/// zaten 8 saatte bir donuyor, 60 saniyede bir çekmenin anlamı olmazdı.
final allianceProvider =
    FutureProvider.family<({AllianceView? mine, AllianceNone? none}), int>((
      ref,
      page,
    ) async {
      if (ref.watch(sessionProvider) == null) return (mine: null, none: null);
      final body = await ref
          .read(apiProvider)
          .request('GET', '/api/v1/alliance?page=$page');
      if (body is! Map<String, dynamic>) {
        throw const MwApiError(0, 'Ittifak okunamadi.');
      }
      final a = body['alliance'];
      if (a is Map<String, dynamic>) {
        return (mine: AllianceView.fromJson(a), none: null);
      }
      return (mine: null, none: AllianceNone.fromJson(body));
    });

/// Ittifak arama/listesi — bos sorgu en iyi 25'i getiriyor.
final allianceListProvider =
    FutureProvider.family<List<AllianceListRow>, String>((ref, query) async {
      final body = await ref
          .read(apiProvider)
          .request(
            'GET',
            '/api/v1/alliances?query=${Uri.encodeQueryComponent(query.trim())}',
          );
      final list = body is Map ? body['alliances'] as List<dynamic>? : null;
      return (list ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(AllianceListRow.fromJson)
          .toList();
    });

/// Herkese acik ittifak kunyesi. Uye listesi buradan SIZMAZ — yalniz toplamlar.
final allianceProfileProvider = FutureProvider.family<AllianceProfile, int>((
  ref,
  id,
) async {
  final body = await ref
      .read(apiProvider)
      .request('GET', '/api/v1/alliances/$id');
  if (body is! Map<String, dynamic>) {
    throw const MwApiError(0, 'Ittifak kunyesi okunamadi.');
  }
  return AllianceProfile.fromJson(body);
});

/// ⭐⭐ İTTİFAK SOHBETİ AÇILIŞ PAKETİ — kanal · rütbem · üye listesi.
///
/// ⚠️ Genel sohbetle aynı model: **yalnız sheet açıkken** okunuyor, kopukken hiç istek
/// gitmiyor. Kullanıcı şartı «kapalıyken tam sessizlik» burada da geçerli.
///
/// ⚠️ Üye listesi mesaj geldikçe TAZELENMİYOR (`chat:alliance` yalnız geçmişi tazeliyor):
/// her mesajda roster çekmek gereksiz trafik olurdu. Susturma yapıldığında elle tazeleniyor —
/// o anda liste gerçekten değişiyor.
final allianceChatOpenProvider = FutureProvider<AllianceRoomOpen>((ref) async {
  final body = await ref
      .read(apiProvider)
      .request('GET', '/api/v1/alliance/chat');
  if (body is! Map<String, dynamic>) {
    throw const MwApiError(0, 'Ittifak sohbeti acilamadi.');
  }
  return AllianceRoomOpen.fromJson(body);
});

/// Ittifak sohbeti gecmisinin en yeni sayfasi. Emniyet agi YOK — tazeleme `chat:alliance`
/// olayindan ve o olay **kanal odasindan**, yani sheet kapaliyken hic tetiklenmiyor.
final allianceChatHistoryProvider = FutureProvider<RoomHistoryPage>((
  ref,
) async {
  final body = await ref
      .read(apiProvider)
      .request('GET', '/api/v1/alliance/chat/messages');
  return body is Map<String, dynamic>
      ? RoomHistoryPage.fromJson(body)
      : RoomHistoryPage.empty;
});

/// ⭐ HESAP KÜNYESİ — e-posta + doğrulama durumu (`GET /api/v1/auth/me`).
///
/// ⚠️ Ayrı bir sorgu olmasının sebebi §verify: doğrulanmamış hesap gerçekten kısıtlı
/// (saldırı/nakliye/mesaj yok, seviye ve savaşçı tavanı var) ve ekranın bunu **düğmeyi
/// sunmadan önce** bilmesi gerekiyor. Bugün tek okuyanı sohbetin yazma kutusu.
///
/// ⚠️ Yoklama YOK: doğrulama tek yönlü ve nadir bir olay. Web'de de aynı karar (`useAccount`,
/// `staleTime` 5 dk).
///
/// ⚠️ Hata **yutulmuyor** ama sonucu `null`: `writeGate` bilgiyi bilmiyorken kutuyu AÇIK
/// bırakıyor (gerekçe orada — son sözü sunucu söyler).
final accountProvider = FutureProvider<({String? email, bool emailVerified})>((
  ref,
) async {
  if (ref.watch(sessionProvider) == null) {
    return (email: null, emailVerified: false);
  }
  final body = await ref.read(apiProvider).request('GET', '/api/v1/auth/me');
  return (
    email: body is Map ? body['email'] as String? : null,
    emailVerified:
        (body is Map ? body['emailVerified'] as bool? : null) ?? false,
  );
});

/// ⭐⭐ SOHBET LİSTESİ — `GET /api/v1/chat/conversations`, DM konuşmaları.
///
/// ⚠️ **Posta kutusundan AYRI bir veri yolu ve bu sunucu tarafında da böyle**: rapor kutusu
/// (`messages`) kalıcı ve oyuncu-bazlı, sohbet anlık ve kanal-bazlı. DM satırı `messages`
/// tablosuna hiç yazılmıyor (rapor kutusunu kirletmesin diye). İki kaynağı Mesajlar
/// sekmesinde **istemci** birleştiriyor — web'de de aynı karar (2026-07-31).
///
/// ⚠️ Sayfalanmıyor, **bilerek**: DM listesi doğası gereği kısa (aktif konuşmalar) ve iki
/// kaynağı sunucuda birleştirmek `messages ∪ chat_channels` gibi bir birleşim sorgusu ister;
/// kazanç yok, karmaşa çok.
///
/// ⚠️ Emniyet ağı YOK ve olmamalı: tazeleme `chat:message` olayından geliyor, kopukluktan
/// dönüşte de `kTopicAll` her şeyi tazeliyor (`realtime.dart`). Web'de de yoklama yok.
final chatConversationsProvider =
    FutureProvider<({List<ChatConversation> items, int unread})>((ref) async {
      if (ref.watch(sessionProvider) == null) {
        return (items: const <ChatConversation>[], unread: 0);
      }
      final body = await ref
          .read(apiProvider)
          .request('GET', '/api/v1/chat/conversations');
      final list = body is Map ? body['items'] as List<dynamic>? : null;
      final items = (list ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ChatConversation.fromJson)
          .toList();
      return (
        items: items,
        unread: (body is Map ? (body['unread'] as num?)?.toInt() : null) ?? 0,
      );
    });

/// ⭐ SOHBET GEÇMİŞİNİN **EN YENİ SAYFASI**.
///
/// ⚠️ Eski sayfalar bu sağlayıcıdan gelmiyor: onları sheet kendi durumunda biriktiriyor
/// (`chat_sheet.dart`). Sebep, Riverpod'da "sonsuz sorgu" karşılığının olmaması ve depodaki
/// formların durumu düz `setState` ile tutması — ekrana özel bir Notifier kurmak, sefer
/// formunda bir kez denenip **bırakılan** yol (`MOBIL_MIMARI.md` §9, 2026-08-17).
///
/// ⚠️ Bölünme sağlam çünkü iki taraf da **id ile tekilleşiyor**: WS olayı bu sağlayıcıyı
/// tazelediğinde gelen sayfa, biriktirilmiş eski sayfalarla çakışsa bile mükerrer balon
/// çıkmıyor.
final chatHistoryProvider = FutureProvider.family<ChatHistoryPage, int>((
  ref,
  channelId,
) async {
  final body = await ref
      .read(apiProvider)
      .request('GET', '/api/v1/chat/conversations/$channelId/messages');
  return body is Map<String, dynamic>
      ? ChatHistoryPage.fromJson(body)
      : ChatHistoryPage.empty;
});

/// ⭐ SOHBET EYLEMLERİ — aç · gönder · okundu · sil · engelle · şikayet et.
///
/// ⚠️ Hepsi `chat:message` konusunu elle tazeliyor, çünkü bu uçların hiçbiri WS olayı
/// üretmiyor (olay yalnız KARŞI tarafa mesaj düştüğünde yazılıyor). Kendi işlemimin sonucunu
/// kendi ekranımda görmek için tazelemeyi burada yapmak zorundayım.
class Chat {
  const Chat(this._ref);

  final Ref _ref;

  MwApi get _api => _ref.read(apiProvider);

  /// Sohbeti açar; yoksa yaratır. Dönen kanal kimliğiyle geçmiş çekiliyor.
  ///
  /// ⚠️ İki yönde TEK kanal var (`dm_key`), yani aynı oyuncuyla ikinci kez "aç" demek yeni
  /// bir sohbet doğurmuyor — istemcinin "zaten var mı" diye ayrıca sorması gerekmiyor.
  Future<int> open(int withPlayerId) async {
    final body = await _api.request(
      'POST',
      '/api/v1/chat/conversations',
      body: {'withPlayerId': withPlayerId},
    );
    final id = body is Map ? (body['channelId'] as num?)?.toInt() : null;
    if (id == null) throw const MwApiError(0, 'Sohbet açılamadı.');
    _tazele(_ref, 'chat:message');
    return id;
  }

  /// ⚠️ `clientMsgId` **şart**: ağ tekrarında çift gönderimi, WS yankısında çift balonu
  /// engelliyor. Sunucu şeması onu `uuid` olarak doğruluyor.
  Future<void> send(int channelId, String text, String clientMsgId) async {
    await _api.request(
      'POST',
      '/api/v1/chat/conversations/$channelId/messages',
      body: {'body': text, 'clientMsgId': clientMsgId},
    );
    _ref.invalidate(chatHistoryProvider(channelId));
    _ref.invalidate(chatConversationsProvider);
  }

  Future<void> markRead(int channelId) async {
    await _api.request(
      'POST',
      '/api/v1/chat/conversations/$channelId/read',
      body: const {},
    );
    _ref.invalidate(chatConversationsProvider);
  }

  /// ⚠️ **YALNIZ bende siler**; karşı tarafta sohbet aynen duruyor. Posta kutusunun toplu
  /// silme ucundan (`messages/delete`) bu yüzden ayrı: orada satır gerçekten yok oluyor.
  Future<void> clear(int channelId) async {
    await _api.request('DELETE', '/api/v1/chat/conversations/$channelId');
    _tazele(_ref, 'chat:message');
  }

  /// ⚠️ Engel **dünya kapsamlı ve tek tablo** (`player_blocks`): DM'den engellenen de genel
  /// sohbetten engellenen de aynı listede. İkinci bir liste tutmak ikisini senkron tutma
  /// yükü getirirdi.
  Future<void> setBlocked(int playerId, {required bool blocked}) async {
    if (blocked) {
      await _api.request(
        'POST',
        '/api/v1/chat/blocks',
        body: {'playerId': playerId},
      );
    } else {
      await _api.request('DELETE', '/api/v1/chat/blocks/$playerId');
    }
    _tazele(_ref, 'chat:message');
  }

  /// Şikayet — **yalnız KAYIT**, otomatik ceza yok (§9.1.1).
  Future<void> report(int channelId, {String reason = 'abuse'}) async {
    await _api.request(
      'POST',
      '/api/v1/chat/reports',
      body: {'channelId': channelId, 'reason': reason},
    );
  }
}

final chatProvider = Provider<Chat>(Chat.new);

/// ⭐ GENEL SOHBET EYLEMLERİ — gönder.
///
/// ⚠️ Susturma ve mesaj silme **taşınmadı**: ikisi de `AdminGuard` altında ve yönetim işleri
/// web panelinde yapılıyor. Mobil istemciye yönetici düğmesi koymak, panelin yetki modelini
/// ikinci bir yüzeyde tekrar etmek olurdu. `RoomOpen.isStaff` yine de okunuyor — ileride
/// eklenecek düğme için sunucuya ikinci bir istek gerekmesin diye.
class GlobalChat {
  const GlobalChat(this._ref);

  final Ref _ref;

  Future<void> send(String text, String clientMsgId) async {
    await _ref
        .read(apiProvider)
        .request(
          'POST',
          '/api/v1/chat/global/messages',
          body: {'body': text, 'clientMsgId': clientMsgId},
        );
    // ⚠️ Kendi mesajım için WS olayı BANA gelmiyor (sunucu `socket.to(...)` ile yayıyor,
    // yani göndereni hariç tutuyor) → geçmişi elle tazelemek ŞART.
    _ref.invalidate(globalChatHistoryProvider);
  }
}

final globalChatProvider = Provider<GlobalChat>(GlobalChat.new);

/// Ittifak sohbeti eylemleri — gonder · sustur · susturmayi kaldir · mesaj kaldir.
///
/// Moderasyon **BURADA VAR**, genel sohbette YOK ve fark bilincli: orada yetki `AdminGuard`
/// (oyun yonetimi, web paneli), burada **ittifak rutbesi** — ve ittifak lideri oyunu
/// telefondan oynuyor olabilir.
class AllianceChat {
  const AllianceChat(this._ref);

  final Ref _ref;

  MwApi get _api => _ref.read(apiProvider);

  Future<void> send(String text, String clientMsgId) async {
    await _api.request(
      'POST',
      '/api/v1/alliance/chat/messages',
      body: {'body': text, 'clientMsgId': clientMsgId},
    );
    // Kendi mesajim icin WS olayi BANA gelmiyor (sunucu gondereni haric tutuyor).
    _ref.invalidate(allianceChatHistoryProvider);
  }

  /// `minutes: null` **KALICI** demek ve alan zorunlu: govdeden dusseydi en agir ceza kazara
  /// verilirdi (sozlesmedeki gerekce).
  Future<void> mute(int playerId, {required int? minutes}) async {
    await _api.request(
      'POST',
      '/api/v1/alliance/chat/mutes',
      body: {'playerId': playerId, 'minutes': minutes},
    );
    // Uye listesi gercekten degisti -> roster tazeleniyor.
    _ref.invalidate(allianceChatOpenProvider);
  }

  Future<void> unmute(int playerId) async {
    // Govdesiz istek: uc 204 donuyor ve govde beklemiyor.
    await _api.request('DELETE', '/api/v1/alliance/chat/mutes/$playerId');
    _ref.invalidate(allianceChatOpenProvider);
  }

  /// Satir SILINMIYOR, `deleted_at` isaretleniyor — denetim izi kaliyor.
  Future<void> deleteMessage(int messageId) async {
    await _api.request('DELETE', '/api/v1/alliance/chat/messages/$messageId');
    _ref.invalidate(allianceChatHistoryProvider);
  }
}

final allianceChatProvider = Provider<AllianceChat>(AllianceChat.new);

/// Ittifak yonetimi — kur · katil · ayril · dagit · adlandir · metin · toplu mesaj · uye islemleri.
///
/// Hepsi basaridan sonra `alliance:changed` konusunu tazeliyor: uyelik, rutbe ve uye listesi
/// ayni olayla besleniyor ve sunucu da onu yayiyor.
class Alliance {
  const Alliance(this._ref);

  final Ref _ref;

  MwApi get _api => _ref.read(apiProvider);

  void _tazeleHepsi() {
    _tazele(_ref, 'alliance:changed');
    // Genel Durum panelindeki ittifak satirlari da degisiyor.
    _ref.invalidate(overviewProvider);
  }

  Future<void> found(String name) async {
    await _api.request('POST', '/api/v1/alliance', body: {'name': name});
    _tazeleHepsi();
  }

  /// Basvuru — sonuc ANINDA gelmiyor: yonetim kabul edene kadar bekliyor.
  /// Bu yuzden ekran «Basvuruldu» rozetine donuyor, ittifaga girmis gibi davranmiyor.
  Future<void> apply(int allianceId) async {
    await _api.request(
      'POST',
      '/api/v1/alliance/applications',
      body: {'allianceId': allianceId},
    );
    _tazeleHepsi();
  }

  /// Davet — Konsey ve ustu. Karsi taraf posta kutusundan Kabul/Red veriyor.
  Future<void> invite(int playerId) async {
    await _api.request(
      'POST',
      '/api/v1/alliance/invites',
      body: {'playerId': playerId},
    );
    _tazele(_ref, 'messages:changed');
  }

  /// Lider tek uye kalmissa ayrilmak ittifagi DAGITIYOR — onay metni bunu soylemek zorunda.
  Future<void> leave() async {
    await _api.request('POST', '/api/v1/alliance/leave', body: const {});
    _tazeleHepsi();
  }

  Future<void> disband() async {
    await _api.request('POST', '/api/v1/alliance/disband', body: const {});
    _tazeleHepsi();
  }

  Future<void> rename(String name) async {
    await _api.request('POST', '/api/v1/alliance/rename', body: {'name': name});
    _tazeleHepsi();
  }

  Future<void> setText(String text) async {
    await _api.request('POST', '/api/v1/alliance/text', body: {'text': text});
    _tazeleHepsi();
  }

  /// Toplu mesaj — her uyenin posta kutusuna satir dusuyor, sohbete DEGIL.
  Future<void> broadcast(String text) async {
    await _api.request(
      'POST',
      '/api/v1/alliance/message',
      body: {'text': text},
    );
    _tazele(_ref, 'messages:changed');
  }

  /// `kick` · `promote` · `demote` · `transfer` — dordu de ayni kalipta.
  Future<void> memberAction(int playerId, String action) async {
    await _api.request(
      'POST',
      '/api/v1/alliance/members/$playerId/$action',
      body: const {},
    );
    _tazeleHepsi();
  }
}

final allianceActionsProvider = Provider<Alliance>(Alliance.new);

/// ⭐⭐ GENEL DURUM — `GET /api/v1/command/overview`.
///
/// ⚠️ Emniyet ağı şehirle aynı 60 sn: tablodaki kaynak sayıları şehir okumasıyla birlikte
/// **tembel birikimi işletiyor**, yani "şu an"ı gösteriyor ve akıyor. Sıra/puan ise donuk
/// (8 saatte bir) — aynı ekranda iki farklı tazelik var ve bunu ekran açıkça yazıyor
/// (`snapshotNote`).
///
/// ⚠️ `battle:resolved` bu sağlayıcıyı da tazeliyor (aşağıdaki `_tazele`): savaş şehirdeki
/// orduyu, savunmayı ve kasayı değiştiriyor ve tablo üçünü de gösteriyor. Web'in tablosunda
/// `overview` tam bu yüzden var.
final overviewProvider = FutureProvider<Overview>((ref) async {
  if (ref.watch(sessionProvider) == null) {
    throw const MwApiError(0, 'Oturum yok.');
  }
  final timer = Timer(kCitySafetyNet, ref.invalidateSelf);
  ref.onDispose(timer.cancel);

  final body = await ref
      .read(apiProvider)
      .request('GET', '/api/v1/command/overview');
  if (body is! Map<String, dynamic>) {
    throw const MwApiError(0, 'Genel durum okunamadı.');
  }
  return Overview.fromJson(body);
});

/// ⭐ SIRALAMA — üç dal, sunucu sayfalaması.
///
/// ⚠️ Emniyet ağı YOK ve olmamalı: sıralama **8 saatte bir** donuyor, yani 60 saniyede bir
/// tazelemek aynı veriyi 480 kez çekmek olurdu. `ranking:updated` olayı web'de bunu
/// tazeliyor; mobilde o konu tabloya henüz girmedi (Komuta Merkezi'nden önce karşılığı yoktu)
/// ve donmuş bir veri için emniyet ağı doğru araç değil — ekran açıkken güncelleme anına denk
/// gelmek nadir.
///
/// ⚠️ Sayfa **1 tabanlı** (sunucu da öyle). Posta kutusu 0 tabanlı; ikisi ayrı sözleşme.
final rankingsProvider =
    FutureProvider.family<RankingPage, ({String kind, int page})>((
      ref,
      q,
    ) async {
      final body = await ref
          .read(apiProvider)
          .request(
            'GET',
            '/api/v1/command/rankings?kind=${q.kind}&page=${q.page}',
          );
      return body is Map<String, dynamic>
          ? RankingPage.fromJson(body)
          : RankingPage.empty;
    });

/// ⭐ ARAMA — oyuncu adına ya da koordinata göre.
///
/// ⚠️ **Önbelleğe alınmıyor** (`family` anahtarı sorgunun kendisi): her tuş vuruşunda yeni bir
/// anahtar doğuyor ve eskiler dinleyicisi kalmayınca kendiliğinden düşüyor. Sonuçları
/// önbellekte tutmanın bir değeri yok — arama bir kerelik bir eylem.
///
/// ⚠️ Kısa sorgu **hiç istek atmıyor**: sunucu 2 karakterden kısa sorguda boş liste dönüyor
/// (indeks önekle çalışıyor) ve boşuna gidiş-dönüş yapmanın anlamı yok. Karar `canSearch`te.
final searchProvider = FutureProvider.family<List<SearchHit>, String>((
  ref,
  query,
) async {
  final body = await ref
      .read(apiProvider)
      .request(
        'GET',
        '/api/v1/command/search?kind=player&name=${Uri.encodeQueryComponent(query.trim())}',
      );
  final list = body is Map ? body['items'] as List<dynamic>? : null;
  return (list ?? const [])
      .whereType<Map<String, dynamic>>()
      .map(SearchHit.fromJson)
      .toList();
});

/// ⭐ «DÜNYADA BUL» — oyuncu kimliğinden BAŞKENT koordinatı.
///
/// ⚠️ Aynı uç, farklı kip (`byId`). Ayrı bir uç açılmadı çünkü gizlilik kuralı (yalnız
/// başkent) o ucun içinde tek yerde duruyor; ikinci bir uç onu ikinci kez uygulamak zorunda
/// kalırdı ve biri unutulduğunda sızıntı tam oradan çıkardı.
///
/// ⚠️ Sağlayıcı DEĞİL, düz bir fonksiyon ve `MwApi`yi parametre alıyor: tek çağıranı bir
/// düğme ve sonucu önbelleğe alınacak bir şey değil. `Ref` almasaydı widget'tan
/// çağrılamazdı (`WidgetRef` ile `Ref` ayrı tipler) — API'yi geçirmek ikisini de kurtarıyor.
Future<SearchHit?> findInWorld(MwApi api, int playerId) async {
  final body = await api.request(
    'GET',
    '/api/v1/command/search?kind=player&byId=$playerId',
  );
  final list = body is Map ? body['items'] as List<dynamic>? : null;
  for (final e in (list ?? const []).whereType<Map<String, dynamic>>()) {
    final hit = SearchHit.fromJson(e);
    if (hit.playerId == playerId) return hit;
  }
  return null;
}

/// ⭐ RAPOR SÖZLÜĞÜ — posta kutusundaki ham `id`'lerin adı ve **katalog sırası**.
///
/// ⚠️ Rapor bir ŞEHRE bağlı değil ama katalog aile ve şehir istiyor. Adlar dünya ölçeğinde
/// (şehre göre değişen şey süre ve maliyet, ad değil), bu yüzden **aktif şehrin** kataloğu
/// okunuyor: şehir ekranları onu zaten çekmiş oluyor, ikinci bir istek gitmiyor.
///
/// ⚠️ Şehri olmayan oyuncuda boş sözlük → rapor ham `id` gösterir, çökmez (web'deki `nameOf`
/// ile aynı degrade).
///
/// ⚠️ **Sıra yalnız birim ve savunmadan** kuruluyor: rapordaki kartlar Baraka/Savunma
/// ekranlarıyla aynı sırada dizilmeli. Teknik ve yapı adları sözlükte var ama sıraya
/// girmiyor — onlar kart olarak değil, düz metin olarak yazılıyor.
final reportNamesProvider =
    FutureProvider<({Map<String, String> names, List<String> order})>((
      ref,
    ) async {
      final cityId = await ref.watch(activeCityProvider.future);
      if (cityId == null) {
        return (names: const <String, String>{}, order: const <String>[]);
      }
      final cat = await ref.watch(catalogProvider(cityId).future);
      final askerler = [...cat.units, ...cat.defenses];
      return (
        names: {
          for (final u in askerler) u.id: u.name,
          for (final b in cat.buildings) b.id: b.name,
          for (final t in cat.techs) t.id: t.name,
        },
        order: [for (final u in askerler) u.id],
      );
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
