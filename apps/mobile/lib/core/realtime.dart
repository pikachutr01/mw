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
///
/// ⚠️⚠️ **`battle:resolved` 2026-08-16'ya kadar tabloda HİÇ YOKTU.** Sunucu olayı aylardır
/// savunana da yayıyordu (`realtime.bus.ts`), mobil onu görmezden geliyordu: oyuncu saldırı
/// yerken Baraka ekranı açıksa ekrandaki ordu savaş öncesini göstermeye devam ediyordu.
/// Kullanıcının şartı tam bu ekrandı: *"özellikle de baraka ekranında … savaş sonrası kalan
/// ordu, savunma birimi hatta ganimet bilgisinin anlık olarak güncellenmesi gerekir."*
/// Bu, projedeki **dördüncü** "yazıldı ama eşlenmedi" olayı (öncekiler `city:incoming_spy`,
/// `city:changed`, `vacation:ended` — hepsi sunucu tarafındaydı, bu ilk istemci tarafı).
const Map<String, List<String>> kInvalidates = {
  'city:changed': ['city', 'catalog', 'overview'],
  'cities:changed': ['cities', 'city'],
  'missions:changed': ['missions'],
  'messages:changed': ['messages'],

  /// ⭐⭐ ORDU EVE DÖNDÜ (kullanıcı, 2026-08-21): *"ordu şehre geri döndüğünde oyun açık
  /// durumda olunca görevlerde anlık olarak kullanılabilir hâle gelmeli."*
  ///
  /// ⚠️⚠️ Bu satır 2026-08-21'e kadar YAZILAMIYORDU: sunucu olayı `missions:changed` konusuna
  /// düzleştiriyordu, yani `city:army_returned` adı istemciye hiç ulaşmıyordu
  /// (`realtime.bus.ts`). Bedeli dönen KAHRAMANDA görünüyordu: `temple` tazelenmediği için
  /// Tapınak onu hâlâ «görevde» gösteriyor, sefer formu seçtirmiyordu.
  ///
  /// ⚠️ Web'deki `INVALIDATES` ile **birebir aynı** liste; ikisi ayrışırsa aynı olay iki
  /// istemcide farklı ekranları tazeler.
  'city:army_returned': ['city', 'catalog', 'missions', 'temple', 'overview'],

  /// ⭐ ÖZEL MESAJ (2026-08-18) — sohbet listesi + açık sohbetin geçmişi.
  ///
  /// ⚠️ Olay **İKİ tarafa da** gidiyor: alıcı balonu görsün, gönderenin ikinci cihazı
  /// senkronlansın. ⚠️ Gövde TAŞIMIYOR (NOTIFY 8000 bayt sınırı + "olay haber taşır, veri
  /// değil" kuralı) — balonun metni tazelenen geçmişten geliyor, tek doğru kaynak sunucu.
  'chat:message': ['chat', 'chat-history'],

  /// ⭐ GENEL SOHBET (2026-08-19) — olay **KANAL ODASINDAN** geliyor.
  ///
  /// ⚠️⚠️ Odaya yalnız «Sohbete Bağlan» denince katılınıyor (`global:chat:open`), dolayısıyla
  /// bağlı değilken bu satır **HİÇ tetiklenmiyor**. Kullanıcı şartı olan *"bağlantıyı
  /// kopardığında sohbet çevrimdışı"* bir bayrakla değil, **oda üyeliğiyle** sağlanıyor.
  /// ⚠️ Açılış paketi (`global-chat`) BİLEREK tazelenmiyor: her mesajda yazma hakkını yeniden
  /// sormak gereksiz trafik olurdu.
  /// Ittifak sohbeti — genel sohbetle ayni kalip: olay **KANAL ODASINDAN** geliyor.
  ///
  /// Sheet kapaliyken odaya katilmiyoruz, dolayisiyla bu satir kapaliyken HIC tetiklenmiyor —
  /// kullanici sarti «kapaliyken tam sessizlik» boyle saglaniyor.
  /// Uye listesi (`alliance-chat`) BILEREK tazelenmiyor: her mesajda roster cekmek gereksiz
  /// trafik olurdu. Susturma yapildiginda elle tazeleniyor.
  /// Ittifak degisimi — uyelik, rutbe, ad, metin, dagitma.
  ///
  /// `alliance-chat` (sohbetin uye listesi) BILEREK yok: sohbet sheet'i acikken rutbe
  /// degisirse liste bir tur bayat kalir ve bedeli yalnizca bir dugmenin gec gorunmesi.
  /// Her uyelik olayinda roster cekmek ise her mesajda cekmek kadar gereksiz.
  'alliance:changed': ['alliance', 'overview'],
  'chat:alliance': ['alliance-chat-history'],

  /// Lider/konsey bir mesaji kaldirdi -> gecmis tazelenir, mesaj ekrandan duser.
  'chat:alliance:deleted': ['alliance-chat-history'],
  'chat:global': ['global-chat-history'],

  /// Yönetici bir mesajı kaldırdı → geçmiş tazelenir, mesaj ekrandan düşer.
  'chat:global:deleted': ['global-chat-history'],
  // ⭐ `temple` 2026-08-17'de eklendi (Tapınak ekranı geldi): savaşta kahraman ÖLÜYOR ve
  // ekran açıkken durumu «Şehirde» kalmaya devam ediyordu.
  // ⭐ `overview` 2026-08-18'de eklendi (Komuta Merkezi geldi) — böylece liste **web'in
  // `BATTLE_KEYS` dizisiyle birebir** oldu. Savaş şehirdeki orduyu, savunmayı ve kasayı
  // değiştiriyor; Genel Durum tablosu üçünü de gösteriyor ve eksikken toplamlar 5 dakikaya
  // kadar savaş öncesini yazardı.
  'battle:resolved': [
    'city',
    'catalog',
    'missions',
    'messages',
    'temple',
    'overview',
  ],
  // ⚠️ `city:changed` de `overview` taşıyor (web'de de öyle): bina dikmek şehrin kaynağını ve
  // yapı seviyesini değiştiriyor, tablo ikisini de gösteriyor.
};

/// Her şeyi tazele — kopukluk sonrası kaçan olaylar için.
const String kTopicAll = '*';

/// ⭐⭐ SOHBET ODASI TÜRLERİ — sunucuda **ÜÇ AYRI olay çifti ve ÜÇ AYRI slot** var.
///
/// ⚠️⚠️ Tek bir `chat:open` yeterli DEĞİL ve bu sunucuda gerekçesiyle yazılı
/// (`realtime.gateway.ts`): her slot TEK kanal kimliği tutuyor ve açılışta önce eskisinden
/// çıkılıyor. Oyuncu aynı anda bir DM sohbeti, ittifak sohbeti ve genel sohbet açık
/// tutabiliyor — ortak slot ikisini birbirinin odasından atardı.
enum MwChatRoom {
  /// `chat:open` — DM. ⚠️ Odanın tek işi «yazıyor…»: mesajın kendisi kişisel odaya gidiyor
  /// ki sohbet KAPALIYKEN de ulaşsın.
  dm('chat:open', 'chat:close', 'chat:typing'),

  /// `alliance:chat:open` — ittifak sohbeti. Mesaj olayı da bu odadan geliyor, yani sheet
  /// kapalıyken oyuncu hiçbir şey almıyor («kapalıyken tam sessizlik» şartı).
  alliance('alliance:chat:open', 'alliance:chat:close', 'alliance:chat:typing'),

  /// `global:chat:open` — genel sohbet. Aynı kural: bağlanmadan hiçbir olay gelmiyor.
  global('global:chat:open', 'global:chat:close', 'global:chat:typing');

  const MwChatRoom(this.openEvent, this.closeEvent, this.typingEvent);

  final String openEvent;
  final String closeEvent;
  final String typingEvent;
}

/// ⭐ YÜK TAŞIYAN OLAY — konu haberlerinden AYRI bir yol.
///
/// ⚠️⚠️ Bu ayrım tasarımın özü: `kInvalidates` olayları **haber** taşıyor (`{topic, ref}`) ve
/// istemci sorguyu tazeliyor — tek doğru kaynak HTTP kalıyor. Ama «yazıyor…» ve «kaç kişi
/// bağlı» kalıcı bir kayda dayanmıyor, **yalnız o anda** var. Onları sorguyla çekmenin bir
/// yolu yok; bu yüzden yükleriyle birlikte doğrudan iletiliyorlar.
///
/// ⚠️ Bu kapıdan **veri** geçirilmemeli. Bir mesajın gövdesini buradan almak, ekranı
/// veritabanından ayrışabilen ikinci bir kaynağa bağlamak olurdu (`chat:message` olayının
/// gövde taşımamasının sebebi de bu).
typedef MwRoomEvent = ({String name, Map<String, dynamic> data});

/// Dinlenen yük taşıyan olaylar.
///
/// ⚠️ Liste `kInvalidates`ten AYRI ve öyle kalmalı: o tablonun her satırı "bir sorguyu
/// tazele" demek, buradakilerin tazeleyecek bir sorgusu YOK. İkisini birleştirmek, gövde
/// taşıyan bir olayın yanlışlıkla sorgu tazelemesine (ya da tersine) yol açardı.
///
/// ⚠️ `global:chat:presence` yükü `{count}` taşıyor — kaç kişinin bağlı olduğu hiçbir tabloda
/// durmuyor, yalnız o anda var. Sorguyla çekmenin bir yolu yok.
const List<String> kRoomEvents = [
  'chat:typing',
  'alliance:chat:typing',
  'global:chat:typing',
  'global:chat:presence',
];

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
    this.platform = 'android',
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

  /// ⭐ El sıkışmaya binen platform (`android` · `ios`) — 2026-08-16.
  ///
  /// ⚠️ Soketin HTTP başlığı yok, yani `client_hints.headers()` buraya ulaşmıyor. Sahipliği
  /// asıl olarak soket aldığı için platform da el sıkışmada gitmek zorunda; gitmezse sunucu
  /// sahiplik satırına NULL yazıyor ve karşı taraftaki çakışma modalı «Android uygulamasında
  /// açık» diyemiyor, yalnız «başka bir yerde» diyor.
  final String platform;

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

  /// Yük taşıyan oda olayları — «yazıyor…» ve mevcudiyet sayacı.
  final _roomEvents = StreamController<MwRoomEvent>.broadcast();
  Stream<MwRoomEvent> get onRoomEvent => _roomEvents.stream;

  /// ⭐ AÇIK ODALAR — tür başına en fazla bir kanal (sunucudaki slot modeliyle birebir).
  ///
  /// ⚠️⚠️ Bu tablo **yeniden bağlanma için ŞART**. Soket koptuğunda sunucu tarafındaki oda
  /// üyeliği de gidiyor; istemci hangi odalarda olduğunu hatırlamazsa sohbet ekranı açık
  /// kalır ama hiçbir olay gelmez — üstelik ekran bunu fark etmez, yalnız sessizleşir. Tam
  /// olarak `battle:resolved`in bir zamanlar yaptığı sessiz arıza.
  final Map<MwChatRoom, int> _rooms = {};

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
      // ⚠️ `platform` da burada — gerekçe alanın kendi yorumunda.
      'auth': {
        'token': c.token,
        'instanceId': c.instanceId,
        'platform': platform,
      },
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
      // ⭐⭐ Odalara YENİDEN katıl: sunucu tarafındaki üyelik soketle birlikte öldü.
      // Bu satır olmadan sohbet ekranı açık kalır ve sessizce hiçbir olay almaz.
      for (final e in _rooms.entries) {
        s.emit(e.key.openEvent, {'channelId': e.value});
      }
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

    // Yük taşıyan oda olayları. ⚠️ Dinleyici kalıcı: oda kapalıyken olay zaten gelmiyor
    // (sunucu odaya yayın yapıyor), yani abonelikleri açıp kapamaya gerek yok.
    for (final ad in kRoomEvents) {
      s.on(ad, (raw) {
        if (_roomEvents.isClosed) return;
        _roomEvents.add((
          name: ad,
          data: raw is Map<String, dynamic>
              ? raw
              : raw is Map
              ? raw.map((k, v) => MapEntry('$k', v))
              : const <String, dynamic>{},
        ));
      });
    }

    s.connect();
  }

  /// ⭐ ODAYA KATIL — ekran açılırken çağrılıyor.
  ///
  /// ⚠️ Kayıt `_rooms`e ÖNCE yazılıyor, emit sonra: soket o anda kopuksa emit kayboluyor ama
  /// kayıt kalıyor ve yeniden bağlanınca `onConnect` odayı geri açıyor.
  void openRoom(MwChatRoom room, int channelId) {
    _rooms[room] = channelId;
    _socket?.emit(room.openEvent, {'channelId': channelId});
  }

  /// ⭐ ODADAN ÇIK — ekran kapanırken.
  ///
  /// ⚠️ Kayıt SİLİNİYOR, yoksa yeniden bağlanmada kapanmış bir sohbetin odasına geri
  /// katılırdık ve oyuncu kapattığı sohbetin «yazıyor…» olaylarını almaya devam ederdi.
  void closeRoom(MwChatRoom room) {
    if (_rooms.remove(room) == null) return;
    _socket?.emit(room.closeEvent, <String, dynamic>{});
  }

  /// «Yazıyor…» yayınla. ⚠️ Kısma (throttle) ÇAĞIRANIN işi: sunucu olay kovasıyla korunuyor
  /// ama her tuş vuruşunda paket yollamanın anlamı yok (web'de 2,5 sn'de bir).
  void sendTyping(MwChatRoom room) {
    final id = _rooms[room];
    if (id == null) return;
    // ⚠️ DM kanal kimliği İSTİYOR (sunucu açık kanalla karşılaştırıyor), oda sohbetleri
    // istemiyor — kimliği kendi slotlarından okuyorlar.
    _socket?.emit(
      room.typingEvent,
      room == MwChatRoom.dm ? {'channelId': id} : <String, dynamic>{},
    );
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
    _roomEvents.close();
  }
}

/// ⚠️ socket.io hata nesnesi platforma göre `String`, `Map` ya da başka bir şey olabiliyor;
/// metne çevirip aramak en dayanıklısı. Yanlış eşleşme riski düşük: `session_conflict` bu
/// projede yalnız tek cihaz kuralının ürettiği bir dize.
bool isConflictError(Object? e) => e.toString().contains('session_conflict');
