/// ⭐⭐ GENEL SOHBET — dünya geneli tek oda (§13.12).
///
/// ─ ⭐⭐ «BAĞLAN / KOPAR» MODELİ ───────────────────────────────────────────────────────────
/// Kullanıcı tarifi: *"sürekli bir bağlantı olmayacak. Yalnızca istediği anda «sohbete
/// bağlan» düğmesi ile bağlanıp gerçek zamanlı sohbete katılabilecek."* Mobil için de ayrıca:
/// *"alttan açılsın, açık olduğu sürece sohbete bağlı kabul edilsin."*
///
/// ⚠️⚠️ Bu yüzden **«bağlı mıyım» diye bir bayrak YOK**: sheet açıksa bağlıyım, kapalıysa
/// değilim. Açılışta `global:chat:open` gidiyor, kapanışta `global:chat:close`. İki ayrı
/// kavram (pencere açık / sohbete bağlı) tutsaydık ayrışacakları ilk hata kaçınılmazdı —
/// web'de de tek boolean tutuluyor ve gerekçesi aynı.
///
/// ⚠️ Kopukken **hiçbir sorgu dönmüyor**: açılış paketi de geçmiş de yalnız bu sheet mount
/// olduğunda okunuyor, WS olayı da yalnız odadayken geliyor. Sessizlik bir bayrakla değil,
/// yaşam döngüsüyle sağlanıyor.
///
/// ─ ⛔ TAŞINMAYANLAR ──────────────────────────────────────────────────────────────────────
/// • **`@` önerisi (autocomplete)** — yalnız bir kolaylık: bahsetmeyi sunucu gövdeden
///   çözüyor (`chatRoomSendRequest` yalnız metin taşıyor), yani `@ad` elle yazıldığında da
///   çalışıyor. Öneri kutusu dar ekranda klavyenin üstünde ayrı bir katman ister.
/// • **Yönetici susturma / mesaj silme** — `AdminGuard` altında ve yönetim işleri web
///   panelinde. Mobil istemciye koymak, yetki modelini ikinci bir yüzeyde tekrar etmek olurdu.
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
import 'chat_rules.dart';
import 'room_message.dart';
import 'room_rules.dart';

Future<void> showGlobalChatSheet(BuildContext context) =>
    mwTallSheet<void>(context, title: 'Genel Sohbet', child: const _Body());

class _Body extends ConsumerStatefulWidget {
  const _Body();

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  final List<RoomMessage> _older = [];

  bool _sending = false;
  bool _loadingOlder = false;
  bool _exhausted = false;
  String? _error;

  /// Kaç kişi bağlı — `global:chat:presence` olayından. ⚠️ Hiçbir tabloda durmuyor.
  int? _presence;

  /// Şu an yazanlar: ad → kaydın ölme zamanı.
  ///
  /// ⚠️⚠️ **Kayıt başına TEK zamanlayıcı yerine son-görülme damgası** tutuluyor. Web'de her
  /// olay kendi 3 sn'lik zamanlayıcısını kuruyordu ve hiçbiri iptal edilmiyordu: karşı taraf
  /// durmadan yazarken ilk olayın zamanlayıcısı ateşleyip göstergeyi KAPATIYORDU — «yazıyor…»
  /// yanıp sönüyordu. Damga + saniyelik süzme o sınıf hatayı yapısal olarak imkânsız kılıyor.
  final Map<String, DateTime> _typing = {};

  StreamSubscription<MwRoomEvent>? _events;
  DateTime _lastTypingSent = DateTime.fromMillisecondsSinceEpoch(0);

  /// «Yazıyor» kaydının ömrü — istemci 2,5 sn'de bir yayınlıyor, yani 3 sn güvenli üst sınır.
  static const _typingTtl = Duration(seconds: 3);

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    // ⚠️ İlk çerçeveden SONRA: `initState` içinde sağlayıcı okumak Riverpod'da hatadır.
    WidgetsBinding.instance.addPostFrameCallback((_) => _join());
  }

  Future<void> _join() async {
    if (!mounted) return;
    final rt = ref.read(realtimeProvider);
    _events = rt.onRoomEvent.listen(_onRoomEvent);

    // ⚠️ Odaya katılmak kanal kimliği istiyor ve o yalnız açılış paketinde geliyor.
    try {
      final open = await ref.read(globalChatOpenProvider.future);
      if (!mounted) return;
      rt.openRoom(MwChatRoom.global, open.channelId);
    } catch (_) {
      // Açılış paketi düşerse ekran zaten hatayı gösteriyor; oda açılmıyor.
    }
  }

  void _onRoomEvent(MwRoomEvent e) {
    if (!mounted) return;
    switch (e.name) {
      case 'global:chat:presence':
        setState(() => _presence = (e.data['count'] as num?)?.toInt());
      case 'global:chat:typing':
        final ad = e.data['username'] as String?;
        if (ad == null || ad.isEmpty) return;
        setState(() => _typing[ad] = DateTime.now().add(_typingTtl));
    }
  }

  @override
  void dispose() {
    // ⚠️⚠️ Odadan ÇIKMAK şart: çıkmazsak sheet kapandıktan sonra da olay almaya devam eder
    // ve «bağlantıyı kopardığında sessizlik» şartı delinir.
    ref.read(realtimeProvider).closeRoom(MwChatRoom.global);
    _events?.cancel();
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final kalan = _scroll.position.maxScrollExtent - _scroll.position.pixels;
    if (kalan < 240) _loadOlder();
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final myId = ref.watch(sessionProvider)?.playerId;
    final acilis = ref.watch(globalChatOpenProvider);
    final gecmis = ref.watch(globalChatHistoryProvider);
    // Saniyelik sayaç: damgaları da «yazıyor» süzgecini de o tazeliyor.
    ref.watch(tickProvider);

    if (acilis.hasError) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: MwErrorBox(
          // ⚠️ Panelden kapatıldıysa sunucu `global_disabled` dönüyor ve sebebi yazmak şart:
          // boş bir sohbet ekranı "bozuk" gibi görünürdü.
          acilis.error is MwApiError
              ? roomErrorText(
                  (acilis.error! as MwApiError).code,
                  (acilis.error! as MwApiError).message,
                )
              : 'Genel sohbet açılamadı.',
        ),
      );
    }

    final mesajlar = _merge(gecmis.value?.items ?? const []);
    final open = acilis.value;

    /* ⚠️ İki kapı AYRI: sunucunun susturması (`canWrite`) ve e-posta doğrulaması. İkincisi
       DM'le ortak (`writeGate`), birincisi yalnız odalarda var. */
    final dogrulandi = ref.watch(accountProvider).value?.emailVerified;
    final kapi = writeGate(blockedByMe: false, emailVerified: dogrulandi);
    final yazabilir = (open?.canWrite ?? false) && kapi.canWrite;
    final sebep = open != null && !open.canWrite
        ? (open.blockedText ?? 'Bu sohbette yazamıyorsun.')
        : kapi.reason;

    // ⚠️ Süresi geçmiş «yazıyor» kayıtları burada eleniyor — ayrı bir zamanlayıcı yok.
    final simdi = DateTime.now();
    final yazanlar = [
      for (final e in _typing.entries)
        if (e.value.isAfter(simdi)) e.key,
    ];

    return Column(
      children: [
        if (presenceText(_presence).isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              presenceText(_presence),
              style: TextStyle(fontSize: 11, color: c.muted),
            ),
          ),

        Expanded(
          child: gecmis.isLoading && mesajlar.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : gecmis.hasError && mesajlar.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: MwErrorBox('Sohbet okunamadı: ${gecmis.error}'),
                )
              : mesajlar.isEmpty
              ? const MwEmpty('Henüz mesaj yok. İlk mesajı sen yaz.')
              : ListView.builder(
                  controller: _scroll,
                  // ⭐ Ters liste — gerekçesi `chat_sheet.dart` başlığında: index 0 dipte ve
                  // eski sayfa eklemek görüntüyü hiç oynatmıyor.
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
                    return _RoomLine(m: m, mine: m.senderId == myId);
                  },
                ),
        ),

        /* ⭐⭐ «YAZIYOR…» KENDİ ŞERİDİNDE ve **koşulsuz** çiziliyor (kullanıcı, 2026-08-09):
           *"Yazıyor alanı için altta küçük bir alan bırakalım, böylece son mesajı sürekli
           yukarı zıplatarak gözükmez."* Şerit belirip kaybolsaydı aynı zıplamayı bir kat
           aşağıda tekrarlardı — bu yüzden yer DAİMA ayrılı, yalnız metin gidip geliyor. */
        SizedBox(
          height: 16,
          child: Align(
            alignment: Alignment.centerLeft,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                typingText(yazanlar),
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

        if (sebep != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: _Notice(sebep),
          ),

        _Composer(
          controller: _controller,
          canWrite: yazabilir,
          busy: _sending,
          onSend: _send,
          onTyping: _typingPing,
        ),
      ],
    );
  }

  /// ⚠️ Tekilleştirme `id` ile: WS tazelemesi en yeni sayfayı getirdiğinde, daha önce «eski
  /// sayfa» olarak çekilmiş satırlarla çakışabiliyor.
  List<RoomMessage> _merge(List<RoomMessage> newest) {
    final gorulen = <int>{};
    final hepsi = <RoomMessage>[];
    for (final m in [...newest, ..._older]) {
      if (gorulen.add(m.id)) hepsi.add(m);
    }
    hepsi.sort((a, b) => b.id.compareTo(a.id));
    return hepsi;
  }

  Future<void> _loadOlder() async {
    if (_loadingOlder || _exhausted) return;
    final page = ref.read(globalChatHistoryProvider).value;
    if (page == null) return;
    final enEski = _merge(page.items).lastOrNull;
    if (enEski == null) return;
    if (_older.isEmpty && !page.hasMore) {
      setState(() => _exhausted = true);
      return;
    }

    setState(() => _loadingOlder = true);
    try {
      final body = await ref
          .read(apiProvider)
          .request('GET', '/api/v1/chat/global/messages?before=${enEski.id}');
      final gelen = body is Map<String, dynamic>
          ? RoomHistoryPage.fromJson(body)
          : RoomHistoryPage.empty;
      if (!mounted) return;
      setState(() {
        _older.addAll(gelen.items);
        // ⚠️ Boş sayfa da tükenme sayılıyor: sunucu `hasMore: true` derken boş dönerse
        // (yarış hâli) sonsuz döngüye girerdik.
        _exhausted = !gelen.hasMore || gelen.items.isEmpty;
      });
    } catch (_) {
      if (mounted) setState(() {});
    } finally {
      if (mounted) setState(() => _loadingOlder = false);
    }
  }

  /// ⚠️ İstemcide KISILIYOR (2,5 sn): sunucunun olay kovası zaten koruyor ama her tuş
  /// vuruşunda paket yollamanın anlamı yok.
  void _typingPing() {
    final simdi = DateTime.now();
    if (simdi.difference(_lastTypingSent) <
        const Duration(milliseconds: 2500)) {
      return;
    }
    _lastTypingSent = simdi;
    ref.read(realtimeProvider).sendTyping(MwChatRoom.global);
  }

  Future<void> _send() async {
    final metin = _controller.text.trim();
    if (metin.isEmpty || _sending) return;

    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(globalChatProvider).send(metin, const Uuid().v4());
      _controller.clear();
      await mwTapOk();
    } on MwApiError catch (e) {
      await mwTapError();
      // ⚠️ Sunucu metni de geçiliyor: `slow_mode` gibi kodlarda o metin SÜRE taşıyor.
      if (mounted) setState(() => _error = roomErrorText(e.code, e.message));
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }
}

/// Oda satırı — DM'in baloncuğundan FARKLI: burada **yazarın adı** görünmek zorunda.
///
/// ⚠️ Baloncuk yerine satır: on kişilik bir odada sağ/sol hizalama okumayı kolaylaştırmıyor,
/// zorlaştırıyor (kim yazdı sorusunun cevabı hizalama değil, ad). Kendi mesajım yalnız adın
/// renginden ayrılıyor.
class _RoomLine extends ConsumerWidget {
  const _RoomLine({required this.m, required this.mine});

  final RoomMessage m;
  final bool mine;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final scheme = Theme.of(context).colorScheme;
    final clock = ref.watch(clockProvider);
    final parts = splitMentions(m.body, m.mentions);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Flexible(
                child: Text(
                  // ⚠️ Ad çözümü `senderLabel`da: kaldırılmış oyuncuda ham `id` ASLA yazılmaz.
                  senderLabel(m),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: mine ? scheme.primary : c.info,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Text(
                clock.timeAgo(m.createdAt),
                style: TextStyle(fontSize: 10, color: c.muted),
              ),
            ],
          ),
          const SizedBox(height: 1),
          /* ⚠️ Bahsetme parçaları `TextSpan` olarak basılıyor — Flutter işaretleme
             yorumlamıyor, yani gövdeye gömülü bir şey metin olarak görünür. */
          Text.rich(
            TextSpan(
              children: [
                for (final p in parts)
                  TextSpan(
                    text: p.text,
                    style: p.mentionId == null
                        ? null
                        : TextStyle(
                            fontWeight: FontWeight.w700,
                            color: scheme.primary,
                          ),
                  ),
              ],
            ),
            style: const TextStyle(fontSize: 14),
          ),
        ],
      ),
    );
  }
}

/// Yazma kutusu — DM'inkiyle aynı kalıp, ek olarak «yazıyor» yayını.
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
                    // ⚠️ `@ad` ipucu kutuda: öneri listesi taşınmadı ve oyuncunun elle
                    // yazabileceğini bilmesi gerekiyor (sunucu gövdeden çözüyor).
                    hintText: widget.canWrite
                        ? 'Mesaj yaz… (@ad ile birine seslen)'
                        : 'Yazamazsın',
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
