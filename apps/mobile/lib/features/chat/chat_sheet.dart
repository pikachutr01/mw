/// ⭐⭐ SOHBET — bir oyuncuyla özel yazışma (§13.12).
///
/// Web'de masaüstünde sağ alt köşe penceresi, mobilde bottom sheet; burada da bottom sheet
/// (`mwTallSheet`). ⚠️ `mwTallSheet` seçildi çünkü klavye açılınca sheet'i onun üstüne
/// çıkaran `viewInsets` dolgusu **onda hazır**: yazma kutusu klavyenin altında kalırsa sohbet
/// kullanılamaz hâle gelir.
///
/// ─ ⭐⭐ TERS LİSTE — web'in en karmaşık parçası mobilde BEDAVA ────────────────────────────
/// Web `ChatWindow` kaydırma konumunu elle yönetiyor: yeni mesajda dibe in, ESKİ sayfa
/// eklenince `scrollHeight` farkını hesaplayıp konumu koru (`prevHeight` · `useLayoutEffect`).
/// Burada `ListView(reverse: true)` kullanılıyor ve iki davranış da kendiliğinden doğru
/// çıkıyor:
///   • index 0 ekranın DİBİNDE duruyor → en yeni mesaj daima görünür,
///   • listenin SONUNA eski sayfa eklenmek, görünen alanı hiç oynatmıyor.
/// ⭐ Üstelik sunucu zaten **en yeniyi önce** döndürüyor, yani veriyi ters çevirmeye de
/// gerek yok — web'deki `.slice().reverse()` burada hiç yok.
///
/// ─ ⚠️ ESKİ SAYFALAR SAĞLAYICIDA DEĞİL, BURADA ────────────────────────────────────────────
/// `chatHistoryProvider` yalnız **en yeni sayfayı** veriyor; eskiler bu durumda birikiyor.
/// Gerekçe sağlayıcının başlığında: Riverpod'da "sonsuz sorgu" karşılığı yok ve ekrana özel
/// bir Notifier kurmak sefer formunda bir kez denenip bırakılmıştı. Bölünme sağlam çünkü iki
/// taraf da **id ile tekilleşiyor** (`_merge`).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../core/realtime.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'chat_message.dart';
import 'chat_rules.dart';
import 'room_rules.dart';

/// Sohbetin karşı tarafı. `blocked` liste sorgusundan geliyor — «engeli kaldır» metnini ve
/// yazma kutusunun açık olup olmadığını o belirliyor.
typedef ChatTarget = ({
  int channelId,
  int playerId,
  String username,
  bool blocked,
});

Future<void> showChatSheet(
  BuildContext context,
  ChatTarget target,
) => mwTallSheet<void>(
  context,
  title: target.username,
  // ⚠️ Oyuncunun adı — Cinzel YASAK (gerekçe `mwTallSheet`te ve `mwDisplayStyle`da).
  titleIsUserText: true,
  trailing: _Menu(target: target),
  child: _Body(target: target),
);

/// Sohbet menüsü — engelle · şikayet et · sohbeti sil.
///
/// ⚠️ Üçü de `PopupMenuButton` altında: üçünü de başlığa düğme olarak koymak dar ekranda
/// adın yerini yerdi ve üçü de **nadir** işlemler. ⚠️ Üçü de onaydan geçiyor; sohbeti silmek
/// yıkıcı olduğu için `mwConfirmSheet` (titreşim + alta yaslı düğmeler).
class _Menu extends ConsumerWidget {
  const _Menu({required this.target});

  final ChatTarget target;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_vert),
      tooltip: 'Sohbet menüsü',
      onSelected: (v) => _run(context, ref, v),
      itemBuilder: (_) => [
        PopupMenuItem(
          value: 'block',
          child: Text(target.blocked ? 'Engeli kaldır' : 'Oyuncuyu engelle'),
        ),
        const PopupMenuItem(value: 'report', child: Text('Şikayet Et')),
        const PopupMenuItem(value: 'clear', child: Text('Sohbeti sil')),
      ],
    );
  }

  Future<void> _run(BuildContext context, WidgetRef ref, String action) async {
    final chat = ref.read(chatProvider);
    final ad = target.username;

    /* ⚠️ Onay metinleri orijinalin kalıbıyla bitiyor: *"… Emin misiniz!"* (soru işareti değil
       ünlem — `g.java` · `k.java`, `BASLANGIC.md` "Orijinal menü ağacı"). */
    switch (action) {
      case 'block':
        final ok = await mwConfirmSheet(
          context,
          title: target.blocked ? 'Engeli kaldır' : 'Oyuncuyu engelle',
          body: target.blocked
              ? '$ad sana yeniden mesaj gönderebilecek. Emin misiniz!'
              : '$ad sana mesaj gönderemeyecek. Emin misiniz!',
          confirmLabel: target.blocked ? 'Engeli kaldır' : 'Engelle',
          danger: !target.blocked,
        );
        if (!ok) return;
        await chat.setBlocked(target.playerId, blocked: !target.blocked);
        // ⚠️ Sheet KAPANIYOR: `target.blocked` bu sheet açılırken kopyalandı ve artık bayat.
        // Açık bırakmak, yazma kutusunun yanlış durumda kalması demekti.
        if (context.mounted) Navigator.of(context).pop();

      case 'report':
        final ok = await mwConfirmSheet(
          context,
          title: 'Şikayet Et',
          body:
              'Bu sohbet MobilWar yöneticilerine şikayet edilecek. Emin misiniz!',
          confirmLabel: 'Şikayet et',
          danger: false,
        );
        if (!ok) return;
        await chat.report(target.channelId);

      case 'clear':
        final ok = await mwConfirmSheet(
          context,
          title: 'Sohbeti sil',
          // ⚠️ Tek taraflılık AÇIKÇA yazılıyor: oyuncu "karşı taraftan da sildim" sanmamalı.
          body:
              'Bu sohbet yalnız senin için silinecek; karşı tarafta görünmeye devam eder. '
              'Emin misiniz!',
          confirmLabel: 'Sil',
        );
        if (!ok) return;
        await chat.clear(target.channelId);
        if (context.mounted) Navigator.of(context).pop();
    }
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.target});

  final ChatTarget target;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();

  /// Sağlayıcının verdiği en yeni sayfanın ÖNCESİ — elle biriktirilen eski sayfalar.
  final List<ChatMessage> _older = [];

  bool _sending = false;
  bool _loadingOlder = false;

  /// Sunucu «daha yok» dedi. ⚠️ `_older.isEmpty` ile karıştırma: hiç eski sayfa
  /// yüklenmemiş olması "daha yok" demek değil.
  bool _exhausted = false;

  String? _error;

  /// Okundu işaretinin gönderildiği son mesaj. ⚠️ Kimliğe bağlı, sayaca değil: liste her
  /// tazelendiğinde yeniden istek atmamak için (web'de aynı ölçüt, `lastId`).
  int _readUpTo = 0;

  /// ⭐⭐ «YAZIYOR…» (2026-08-19) — iki turdur ertelenen parça, oda katmanı gelince açıldı.
  ///
  /// ⚠️ Damga tutuluyor, zamanlayıcı DEĞİL: web'de her olay kendi 3 sn'lik zamanlayıcısını
  /// kuruyor ve hiçbiri iptal edilmiyordu → karşı taraf durmadan yazarken gösterge yanıp
  /// sönüyordu. Damga + saniyelik süzme o sınıf hatayı yapısal olarak imkânsız kılıyor.
  DateTime? _peerTypingUntil;

  StreamSubscription<MwRoomEvent>? _events;
  DateTime _lastTypingSent = DateTime.fromMillisecondsSinceEpoch(0);

  static const _typingTtl = Duration(seconds: 3);

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    // ⚠️ İlk çerçeveden SONRA: `initState` içinde sağlayıcı okumak Riverpod'da hatadır.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final rt = ref.read(realtimeProvider);
      // ⭐ Odanın TEK işi «yazıyor…»: mesajın kendisi kişisel odaya gidiyor ki sohbet
      // kapalıyken de ulaşsın (sunucu yorumu bunu açıkça yazıyor).
      rt.openRoom(MwChatRoom.dm, widget.target.channelId);
      _events = rt.onRoomEvent.listen(_onRoomEvent);
    });
  }

  void _onRoomEvent(MwRoomEvent e) {
    if (!mounted || e.name != 'chat:typing') return;
    // ⚠️ Kanal SÜZGECİ şart: soket başka bir kanalın odasında da olabilir ve karşı tarafın
    // başkasına yazması bizim şeridimizi yakmamalı.
    if ((e.data['channelId'] as num?)?.toInt() != widget.target.channelId) {
      return;
    }
    setState(() => _peerTypingUntil = DateTime.now().add(_typingTtl));
  }

  @override
  void dispose() {
    ref.read(realtimeProvider).closeRoom(MwChatRoom.dm);
    _events?.cancel();
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// ⚠️ İstemcide KISILIYOR (2,5 sn): her tuş vuruşunda paket yollamanın anlamı yok.
  void _typingPing() {
    final simdi = DateTime.now();
    if (simdi.difference(_lastTypingSent) <
        const Duration(milliseconds: 2500)) {
      return;
    }
    _lastTypingSent = simdi;
    ref.read(realtimeProvider).sendTyping(MwChatRoom.dm);
  }

  /// ⚠️ Ters listede «sona yaklaşmak» EKRANIN ÜSTÜ demek: index büyüdükçe yukarı çıkılıyor.
  /// `maxScrollExtent`e yaklaşmak, en eski mesajın görünmek üzere olması.
  void _onScroll() {
    if (!_scroll.hasClients) return;
    final kalan = _scroll.position.maxScrollExtent - _scroll.position.pixels;
    if (kalan < 240) _loadOlder();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.target;
    final c = MwColors.of(context);
    final myId = ref.watch(sessionProvider)?.playerId;
    final page = ref.watch(chatHistoryProvider(t.channelId));
    // Damgalar («12 dakika önce») saniyelik sayaçla tazeleniyor — web'deki `useTick`.
    ref.watch(tickProvider);

    final mesajlar = _merge(page.value?.items ?? const []);
    _markReadIfNeeded(mesajlar);

    /* ⭐ §verify — okumak serbest, yazmak değil (kullanıcı şartı). Bilgi HENÜZ GELMEDİYSE
       engellenmiyor: son sözü sunucu söylüyor ve ağ yavaşken doğrulanmış bir oyuncuyu
       susturmak yanlış olurdu (karar `writeGate`te, testli). */
    final dogrulandi = ref.watch(accountProvider).value?.emailVerified;
    final kapi = writeGate(blockedByMe: t.blocked, emailVerified: dogrulandi);

    return Column(
      children: [
        Expanded(
          child: page.isLoading && mesajlar.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : page.hasError && mesajlar.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: MwErrorBox('Sohbet okunamadı: ${page.error}'),
                )
              : mesajlar.isEmpty
              ? const MwEmpty('Henüz mesaj yok. İlk mesajı sen yaz.')
              : ListView.builder(
                  controller: _scroll,
                  // ⭐ Gerekçesi dosya başlığında: index 0 DİPTE, eski sayfa eklemek görüntüyü
                  // hiç oynatmıyor. Web'in `prevHeight` hesabının tamamı bu satırla düşüyor.
                  reverse: true,
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                  itemCount: mesajlar.length + (_loadingOlder ? 1 : 0),
                  itemBuilder: (_, i) {
                    if (i >= mesajlar.length) {
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Center(
                          child: Text(
                            'eski mesajlar yükleniyor…',
                            style: TextStyle(fontSize: 11, color: c.muted),
                          ),
                        ),
                      );
                    }
                    final m = mesajlar[i];
                    return _Bubble(m: m, mine: isMine(m, myId));
                  },
                ),
        ),

        /* ⭐⭐ «YAZIYOR…» KENDİ ŞERİDİNDE ve **koşulsuz** çiziliyor (kullanıcı, 2026-08-09):
           *"Yazıyor alanı için altta küçük bir alan bırakalım, böylece son mesajı sürekli
           yukarı zıplatarak gözükmez."* Şerit belirip kaybolsaydı aynı zıplamayı bir kat
           aşağıda tekrarlardı — yer DAİMA ayrılı, yalnız metin gidip geliyor. */
        SizedBox(
          height: 16,
          child: Align(
            alignment: Alignment.centerLeft,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                // ⚠️ Süresi geçmiş damga burada eleniyor — ayrı bir zamanlayıcı yok.
                _peerTypingUntil?.isAfter(DateTime.now()) ?? false
                    ? typingText([t.username])
                    : '',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, color: c.muted),
              ),
            ),
          ),
        ),

        if (_error != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: MwErrorBox(_error!),
          ),

        if (kapi.reason != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: _Notice(kapi.reason!),
          ),

        _Composer(
          controller: _controller,
          canWrite: kapi.canWrite,
          busy: _sending,
          onSend: _send,
          onTyping: _typingPing,
        ),
      ],
    );
  }

  /// En yeni sayfa + biriken eskiler, **id'ye göre tekilleştirilmiş ve azalan sırada**.
  ///
  /// ⚠️ Tekilleştirme şart: WS olayı en yeni sayfayı tazelediğinde gelen satırlar, daha önce
  /// «eski sayfa» olarak çekilmiş satırlarla çakışabiliyor. Anahtar `id`, `clientMsgId`
  /// değil — sunucunun verdiği kimlik tek doğru kaynak.
  List<ChatMessage> _merge(List<ChatMessage> newest) {
    final gorulen = <int>{};
    final hepsi = <ChatMessage>[];
    for (final m in [...newest, ..._older]) {
      if (gorulen.add(m.id)) hepsi.add(m);
    }
    hepsi.sort((a, b) => b.id.compareTo(a.id));
    return hepsi;
  }

  /// ⭐ OKUNDU İŞARETİ — **listenin kendisine** bağlı (web'de de aynı ölçüt).
  ///
  /// ⚠️ WS aboneliğine bağlanmıştı ve rozet sessizce asılı kalabiliyordu: olay iki kez
  /// işleniyor, zamanlama kaçınca hiç işlenmiyordu. Tek ölçüt kaldı: sohbet açık ve listede
  /// yeni bir mesaj belirdi → okundu.
  void _markReadIfNeeded(List<ChatMessage> mesajlar) {
    if (mesajlar.isEmpty) return;
    final sonId = mesajlar.first.id; // ters sıralı: ilk eleman EN YENİ
    if (sonId <= _readUpTo) return;
    _readUpTo = sonId;
    // ⚠️ Çerçeve sonrası: `build` içinde sağlayıcı tazelemek Flutter'da hatadır.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(chatProvider).markRead(widget.target.channelId).catchError((
        Object _,
      ) {
        /* rozet bir tur geç düşer — sohbeti bozmaz */
      });
    });
  }

  Future<void> _loadOlder() async {
    if (_loadingOlder || _exhausted) return;
    final page = ref.read(chatHistoryProvider(widget.target.channelId)).value;
    if (page == null) return;

    // ⚠️ İmleç BİRLEŞTİRİLMİŞ listenin en eskisinden: yalnız sunucu sayfasına baksaydık,
    // ikinci «daha eski» isteği aynı sayfayı tekrar getirirdi.
    final enEski = _merge(page.items).lastOrNull;
    if (enEski == null) return;
    if (_older.isEmpty && olderCursor(page) == null) {
      setState(() => _exhausted = true);
      return;
    }

    setState(() => _loadingOlder = true);
    try {
      final body = await ref
          .read(apiProvider)
          .request(
            'GET',
            '/api/v1/chat/conversations/${widget.target.channelId}'
                '/messages?before=${enEski.id}',
          );
      final gelen = body is Map<String, dynamic>
          ? ChatHistoryPage.fromJson(body)
          : ChatHistoryPage.empty;
      if (!mounted) return;
      setState(() {
        _older.addAll(gelen.items);
        // ⚠️ Boş sayfa da tükenme sayılıyor: sunucu `hasMore: true` derken boş dönerse
        // (yarış hâli) sonsuz döngüye girerdik.
        _exhausted = !gelen.hasMore || gelen.items.isEmpty;
      });
    } catch (_) {
      // Sessiz geç: eski mesaj gelmemesi sohbeti bozmaz, kaydırma tekrar deneyecek.
      if (mounted) setState(() {});
    } finally {
      if (mounted) setState(() => _loadingOlder = false);
    }
  }

  Future<void> _send() async {
    final metin = _controller.text.trim();
    if (metin.isEmpty || _sending) return;

    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref
          .read(chatProvider)
          .send(widget.target.channelId, metin, const Uuid().v4());
      _controller.clear();
      await mwTapOk();
    } on MwApiError catch (e) {
      await mwTapError();
      // ⚠️ Metin `code`tan üretiliyor, sunucunun mesajından DEĞİL: ham sunucu metni
      // İngilizce olabiliyor ve §13.14 ekranda İngilizce yasaklıyor (karar `chatErrorText`te).
      if (mounted) setState(() => _error = chatErrorText(e.code));
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }
}

/// Tek baloncuk. ⚠️ Kendi mesajım vurgulu zeminde ve SAĞDA; karşı tarafınki çerçeveli ve
/// solda — web'le aynı görsel dil.
class _Bubble extends ConsumerWidget {
  const _Bubble({required this.m, required this.mine});

  final ChatMessage m;
  final bool mine;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final scheme = Theme.of(context).colorScheme;
    final clock = ref.watch(clockProvider);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: mine
            ? MainAxisAlignment.end
            : MainAxisAlignment.start,
        children: [
          Container(
            // ⚠️ %80 tavan: tam genişlik baloncuk, kimin yazdığı bilgisini görsel olarak
            // siler — hizalama ancak boşluk kalınca okunuyor.
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.78,
            ),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: mine ? scheme.primary : c.raised,
              border: Border.all(color: mine ? scheme.primary : c.border),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                // ⚠️ Oyuncunun yazdığı metin → gövde fontu, düz metin. Sunucu HTML/markdown
                // kabul etmiyor ve Flutter da yorumlamıyor: XSS yüzeyi sıfır.
                Text(
                  m.body,
                  style: TextStyle(
                    fontSize: 14,
                    color: mine ? scheme.onPrimary : scheme.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  clock.timeAgo(m.createdAt),
                  style: TextStyle(
                    fontSize: 10,
                    color: mine
                        ? scheme.onPrimary.withValues(alpha: 0.75)
                        : c.muted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Yazma kutusu + Gönder.
///
/// ⚠️ `maxLines: null` + `minLines: 1`: kutu içerikle birlikte yukarı büyüyor (web'de
/// `useAutoGrow` ile elle yapılıyor, Flutter'da hazır). ⚠️ `maxLength` sunucununkiyle aynı
/// sabitten (`kChatBodyMax`) — elle yazılan bir sınır sunucudan ayrışırsa oyuncu reddi ancak
/// göndermeye çalışınca öğrenir.
class _Composer extends StatefulWidget {
  const _Composer({
    required this.controller,
    required this.canWrite,
    required this.busy,
    required this.onSend,
    required this.onTyping,
  });

  final TextEditingController controller;
  final bool canWrite;
  final bool busy;
  final VoidCallback onSend;
  final VoidCallback onTyping;

  @override
  State<_Composer> createState() => _ComposerState();
}

class _ComposerState extends State<_Composer> {
  @override
  void initState() {
    super.initState();
    // Gönder düğmesinin açılıp kapanması yazdıkça güncellensin.
    widget.controller.addListener(_yenile);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_yenile);
    super.dispose();
  }

  void _yenile() {
    setState(() {});
    if (widget.controller.text.isNotEmpty) widget.onTyping();
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final metin = widget.controller.text;
    final acik = canSendDraft(
      metin,
      canWrite: widget.canWrite,
      busy: widget.busy,
    );

    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
      decoration: BoxDecoration(
        color: c.raised,
        border: Border(top: BorderSide(color: c.borderStrong, width: 2)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: widget.controller,
                  enabled: widget.canWrite,
                  minLines: 1,
                  maxLines: 4,
                  maxLength: kChatBodyMax,
                  // ⚠️ Sayaç kendi satırımızda: `TextField`in yerleşiği her zaman görünüyor
                  // ve 500 karakterin pratikte hiç dolmadığı bir kutuda yalnız gürültü.
                  buildCounter:
                      (
                        _, {
                        required currentLength,
                        required isFocused,
                        required maxLength,
                      }) => null,
                  textInputAction: TextInputAction.newline,
                  keyboardType: TextInputType.multiline,
                  textCapitalization: TextCapitalization.sentences,
                  inputFormatters: [
                    LengthLimitingTextInputFormatter(kChatBodyMax),
                  ],
                  decoration: InputDecoration(
                    hintText: widget.canWrite ? 'Mesaj yaz…' : 'Yazamazsın',
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 10,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(6),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              MwSmallButton(
                label: 'Gönder',
                onTap: acik ? widget.onSend : null,
              ),
            ],
          ),
          if (showCounter(metin))
            Align(
              alignment: Alignment.centerRight,
              child: Text(
                '${mwNumber(metin.length)}/$kChatBodyMax',
                style: TextStyle(
                  fontSize: 10,
                  color: c.muted,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Uyarı şeridi — engel ve doğrulama kapıları.
class _Notice extends StatelessWidget {
  const _Notice(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: c.warning.withValues(alpha: 0.12),
        border: Border.all(color: c.warning),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(text, style: TextStyle(fontSize: 12, color: c.warning)),
    );
  }
}
