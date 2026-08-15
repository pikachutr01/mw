/// ⭐ GERÇEK ZAMANLI BAĞLANTI (socket.io) — web'deki `apps/web/src/lib/realtime.ts` karşılığı
/// **artı mobilin kendi sorunu: uygulama arka plana gidip geri geliyor.**
///
/// Kullanıcı kuralı: *"biri bize casus kuş gönderdiği ANDA görünmeli"*. Sunucu olayı yalnız
/// **haber** olarak yolluyor (`{topic, ref}`), veri taşımıyor; istemci ilgili sorguyu tazeliyor.
/// Tek doğru kaynak HTTP uçları kalıyor — WS yükü ile veritabanının kayma ihtimali yok.
///
/// ⭐⭐ **Soket sahipliğin ASIL sahibi** (`realtime.gateway.ts`): tek cihaz kuralı el sıkışmada
/// uygulanıyor ve **soket koptuğu an sahiplik bırakılıyor**. Yalnız HTTP'ye dayansaydık
/// uygulamayı kapatan oyuncunun sahipliği 90 sn asılı kalır, kendi hesabına dönemezdi.
///
/// ⚠️⚠️ **MOBİLİN WEB'DE OLMAYAN TUZAĞI — arka plan.**
///
/// Tarayıcı sekmesi arka plandayken soket yaşamaya devam eder; Android'de etmez. İşletim
/// sistemi uygulamayı dondurunca:
///   1. **Zamanlayıcılar durur.** socket.io'nun üstel backoff'u bir `Timer`a dayanıyor; donmuş
///      uygulamada o zamanlayıcı hiç çalışmaz. Uygulama geri geldiğinde istemci "birazdan
///      yeniden denerim" diye bekliyor olabilir ve o «birazdan» dakikalar sonra gelir.
///   2. **HAYALET SOKET.** İşletim sistemi TCP bağlantısını sessizce öldürür ama istemci hâlâ
///      `connected == true` sanır. Ekranda yeşil nokta yanar, hiçbir olay gelmez. Kullanıcı
///      açısından en kötü hâl: gösterge YALAN söyler.
///
/// Bu yüzden geri dönüşte socket.io'nun kendi durumuna **güvenilmiyor**; karar
/// `shouldForceReconnect` ile açıkça veriliyor (aşağıda, gerekçesiyle) ve testle kilitli.
///
/// ⚠️ Arka plana geçerken soket **bilerek KAPATILMIYOR**: oyuncu üç saniyeliğine başka bir
/// uygulamaya baksa bile sahipliği bırakırdı ve web'de açık bir sekmesi varsa oyun oraya
/// kaçardı. Bırakma işini işletim sistemine ve sunucunun ping zaman aşımına bırakıyoruz.
///
/// ⚠️ Faz 0 spike'ı (`tool/ws_spike.dart`) bu istemcinin sunucunun socket.io 4.8.3'üyle
/// konuşabildiğini **canlı sunucuda kanıtladı** — sürüm tablosuna güvenilmedi.
library;

import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import 'http_transport.dart';

/// ⚠️ Kopmuş bağlantı «çevrimdışı» değil **«bilinmiyor»** demek: kopan bizim soketimizdir,
/// oyunun ya da karşı oyuncunun durumu hakkında bir şey söylemez. Adlandırma web ile aynı.
enum MwConnectionState { connecting, online, offline }

/// Sunucu olayı → tazelenecek şeyler. ⚠️ Eşleme TEK yerde ve web'deki `INVALIDATES` ile aynı
/// konu adlarını kullanıyor. Bir olay burada karşılıksız kalırsa ekran ancak emniyet ağı
/// yoklaması dönene kadar (60 sn) eski veriyi gösterir.
///
/// ⚠️ Şimdilik yalnız çizilmiş ekranların konuları var. Tam tablo `packages/contracts`a
/// taşınacak ve sunucuda *"gateway'in yaydığı HER konu istemci tablosunda karşılık buluyor"*
/// kapısıyla ölçülecek (MOBIL_MIMARI §5.3).
const Map<String, List<String>> kInvalidates = {
  'city:changed': ['city', 'catalog'],
  'cities:changed': ['cities', 'city'],
  'missions:changed': ['missions'],
  'messages:changed': ['messages'],
};

/// Her şeyi tazele — kopukluk sonrası kaçan olaylar için.
const String kTopicAll = '*';

/// ⚠️ Engine.IO varsayılan `pingTimeout` 20 sn. Bundan uzun süre uzakta kaldıysak bağlantının
/// SAĞ olduğunu iddia eden bir soket bile şüpheli: sunucu bizi çoktan düşürmüş olabilir ve
/// istemci bunu henüz fark etmemiş olabilir (hayalet soket).
///
/// ⚠️ Sayı bilerek biraz DÜŞÜK (15 sn): gereksiz bir yeniden bağlanmanın bedeli bir el sıkışma,
/// kaçırılan bir hayalet soketin bedeli ise oyuncunun hiç olay almadan yeşil nokta görmesi.
/// Asimetri açık.
const Duration kGhostSocketThreshold = Duration(seconds: 15);

/// ⭐⭐ GERİ DÖNÜŞTE YENİDEN BAĞLANILSIN MI?
///
/// Saf fonksiyon — deponun deseni (`routing_rules.dart`, `city-progress.ts` ile aynı gerekçe):
/// yaşam döngüsü geri çağrısının içine gömülseydi sınanamazdı, oysa burada yanlış cevabın
/// bedeli **sessiz**. Yanlış "hayır" dersek oyuncu hiç olay almaz ama ekranda her şey yolunda
/// görünür.
///
/// İki sebep, ikisi de bağımsız:
///   • Bağlı DEĞİLSEK → hemen bağlan. socket.io'nun backoff'u donmuş uygulamada ilerlemedi;
///     onu beklemek dakikalarca sessizlik demek.
///   • Uzun süre uzaktaysak → bağlı GÖRÜNSEK bile yeniden kur (hayalet soket).
bool shouldForceReconnect({
  required MwConnectionState state,
  required Duration awayFor,
  Duration threshold = kGhostSocketThreshold,
}) {
  if (state != MwConnectionState.online) return true;
  return awayFor >= threshold;
}

/// Soket bağlantısını yöneten ince katman.
///
/// ⚠️ İş mantığı yok: hangi sorgunun tazeleneceği `kInvalidates`te, tazeleme işini çağıran
/// yapıyor. Buradaki tek iş "bağlan, durumu bildir, olayları ilet, geri dönüşte toparlan".
class Realtime {
  Realtime({
    required this.credentials,
    required this.onTopic,
    required this.onTakeover,
    required this.onRevoked,
    String? root,
    io.Socket Function(String root, Map<String, dynamic> opts)? factory,
    DateTime Function()? clock,
  }) : _root = root ?? kApiRoot,
       _factory = factory ?? io.io,
       _clock = clock ?? DateTime.now;

  /// ⭐ Jeton **her bağlanışta yeniden okunuyor**, kurucuda yakalanmıyor: erişim jetonu
  /// yenilendiğinde (12 saatte bir) eski jetonla bağlanmak el sıkışmada reddedilirdi ve
  /// istemci bunu ağ arızası sanıp durmadan denerdi.
  final ({String token, String instanceId})? Function() credentials;

  /// Sunucudan bir konu geldi → çağıran ilgili sorguları tazeler. `'*'` = her şey.
  final void Function(String topic) onTopic;

  /// ⭐ DEVRALINDIK — başka bir cihaz «Bu cihazda devam et» dedi.
  /// ⚠️ Oturum DÜŞÜRÜLMEZ: jeton hâlâ geçerli, kaybedilen yalnız sahiplik.
  final void Function() onTakeover;

  /// ⭐ Oturum uzaktan kapatıldı (admin, parola değişimi, "bu cihazı çıkar").
  /// ⚠️ Bunun aksine oturum GERÇEKTEN düşer.
  final void Function() onRevoked;

  final String _root;
  final io.Socket Function(String, Map<String, dynamic>) _factory;
  final DateTime Function() _clock;

  io.Socket? _socket;
  DateTime? _pausedAt;

  MwConnectionState _state = MwConnectionState.offline;
  MwConnectionState get state => _state;

  final _states = StreamController<MwConnectionState>.broadcast();
  Stream<MwConnectionState> get onStateChange => _states.stream;

  void _setState(MwConnectionState next) {
    if (_state == next) return;
    _state = next;
    if (!_states.isClosed) _states.add(next);
  }

  /// Bağlan. Zaten bir soket varsa önce kapatılır — jeton yenilendiğinde bu şart.
  ///
  /// ⚠️ Oturum yoksa hiçbir şey yapmaz ve **durumu `offline` bırakır**: misafirde sonsuz
  /// «bağlanıyor» göstermek, olmayan bir arızayı varmış gibi gösterirdi.
  void connect() {
    final c = credentials();
    disconnect();
    if (c == null) return;

    _setState(MwConnectionState.connecting);

    final s = _factory(_root, <String, dynamic>{
      'path': '/ws',
      // ⚠️ `instanceId` el sıkışmada: sahipliği asıl olarak SOKET alıyor.
      'auth': {'token': c.token, 'instanceId': c.instanceId},
      'transports': ['websocket', 'polling'],
      'autoConnect': false,
      // Üstel backoff + jitter: sunucu yeniden başlarken tüm istemciler aynı anda vurmasın.
      'reconnection': true,
      'reconnectionDelay': 500,
      'reconnectionDelayMax': 10000,
      'randomizationFactor': 0.5,
    });
    _socket = s;

    s.onConnect((_) {
      _setState(MwConnectionState.online);
      // ⭐ Kopukken kaçan olaylar olabilir → bağlanır bağlanmaz HER ŞEYİ tazele.
      // WS "hızlı" katman, "kayıpsız" katman değil; kalıcı kayıt zaten veritabanında.
      onTopic(kTopicAll);
    });
    s.onDisconnect((_) => _setState(MwConnectionState.offline));

    s.onConnectError((e) {
      _setState(MwConnectionState.offline);
      // ⚠️⚠️ El sıkışma reddi tek cihaz kuralından geliyorsa AYIRMAK ŞART: socket.io bunu ağ
      // arızası sanıp sonsuz yeniden bağlanma döngüsüne girer, oysa yapılması gereken perdeyi
      // açmak. Sunucu bu yüzden genel `unauthorized` yerine açık bir kod yolluyor.
      if (isConflictError(e)) {
        s.io.options?['reconnection'] = false;
        onTakeover();
      }
    });

    s.on('session:takeover', (_) => onTakeover());
    s.on('session:revoked', (_) => onRevoked());

    // Konu haberleri — gövde `{topic, ref}`; yalnız konu adı okunuyor.
    for (final konu in kInvalidates.keys) {
      s.on(konu, (_) => onTopic(konu));
    }

    s.connect();
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _setState(MwConnectionState.offline);
  }

  /// Uygulama arka plana gitti. ⚠️ Soket KAPATILMIYOR (dosya başlığındaki gerekçe); yalnız
  /// ne zaman gittiğimiz not ediliyor.
  void pause() => _pausedAt = _clock();

  /// ⭐⭐ Uygulama geri geldi — mobilin en kolay atlanan noktası.
  ///
  /// İki iş, ikisi de şart:
  ///   1. Gerekiyorsa **hemen** yeniden bağlan (backoff beklenmez, hayalet soket kabul edilmez).
  ///   2. Uzaktayken ne olduğunu bilmiyoruz → **her koşulda** veriyi tazele. Yeniden bağlanma
  ///      olursa `onConnect` zaten tazeliyor; olmazsa bu satır tazeliyor.
  void resume() {
    final away = _pausedAt == null
        ? Duration.zero
        : _clock().difference(_pausedAt!);
    _pausedAt = null;

    if (shouldForceReconnect(state: _state, awayFor: away)) {
      connect();
    } else {
      onTopic(kTopicAll);
    }
  }

  void dispose() {
    disconnect();
    _states.close();
  }
}

/// ⚠️ socket.io hata nesnesi platforma göre `String`, `Map` ya da başka bir şey olabiliyor;
/// metne çevirip aramak en dayanıklısı. Yanlış eşleşme riski düşük: `session_conflict` bu
/// projede yalnız tek cihaz kuralının ürettiği bir dize.
bool isConflictError(Object? e) => e.toString().contains('session_conflict');
