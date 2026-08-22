/// ⭐⭐ İTTİFAK SOHBETİ (§13.15c) — üyelere özel oda.
///
/// Genel Sohbetle **aynı iskelet** (ters liste · bahsetme vurgusu · «yazıyor…» şeridi ·
/// eski sayfa) ama üç yerde ayrılıyor ve üçü de yetkiyle ilgili:
///
///   1. ⭐⭐ **MODERASYON VAR.** Genel sohbette susturma/silme `AdminGuard` altında ve web
///      panelinde yapılıyor; burada kapı **ittifak rütbesi** ve o kişi oyunu telefondan
///      oynuyor olabilir. Bu yüzden taşındı — kararı `alliance_chat_rules.dart` veriyor.
///   2. **Üye listesi var** (`members`) — hem susturma hedefi hem de "kim ayrılmış" sorusunun
///      cevabı (`AllianceRoomOpen.roleOf` → `null` ise ayrılmış).
///   3. **Mevcudiyet sayacı YOK** — sunucu ittifak odasına `presence` yaymıyor; onun yerine
///      üye listesinde satır başına çevrimiçilik noktası var.
///
/// ⚠️ «Kapalıyken tam sessizlik» şartı burada da geçerli: sheet kapalıyken odaya
/// katılmıyoruz, dolayısıyla `chat:alliance` olayı hiç tetiklenmiyor ve hiçbir sorgu dönmüyor.
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
import 'alliance_chat_rules.dart';
import 'chat_rules.dart';
import 'room_line.dart';
import 'room_message.dart';
import 'room_rules.dart';
import 'terms_sheet.dart';

Future<void> showAllianceChatSheet(BuildContext context) => mwTallSheet<void>(
  context,
  title: 'İttifak Sohbeti',
  trailing: const _RosterButton(),
  child: const _Body(),
);

/// Üye listesini açan düğme. ⚠️ Başlıkta duruyor çünkü moderasyonun tek kapısı bu — mesaja
/// uzun basmak yalnız o mesajı kaldırıyor, üyeyi susturmak listeden yapılıyor.
class _RosterButton extends ConsumerWidget {
  const _RosterButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) => IconButton(
    icon: const Icon(Icons.group_outlined),
    tooltip: 'Üyeler',
    onPressed: () => showAllianceRosterSheet(context),
  );
}

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

  /// Şu an yazanlar: ad → kaydın ölme zamanı (Genel Sohbet'le aynı model; gerekçe orada).
  final Map<String, DateTime> _typing = {};

  StreamSubscription<MwRoomEvent>? _events;
  DateTime _lastTypingSent = DateTime.fromMillisecondsSinceEpoch(0);

  static const _typingTtl = Duration(seconds: 3);

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) => _join());
  }

  Future<void> _join() async {
    if (!mounted) return;
    final rt = ref.read(realtimeProvider);
    _events = rt.onRoomEvent.listen(_onRoomEvent);
    try {
      final open = await ref.read(allianceChatOpenProvider.future);
      if (!mounted) return;
      rt.openRoom(MwChatRoom.alliance, open.channelId);
    } catch (_) {
      // Açılış paketi düşerse ekran hatayı gösteriyor; oda açılmıyor.
    }
  }

  void _onRoomEvent(MwRoomEvent e) {
    if (!mounted || e.name != 'alliance:chat:typing') return;
    // ⚠️ Sunucu ittifak odasında yalnız `playerId` yayıyor; adı üye listesinden çözüyoruz.
    final id = (e.data['playerId'] as num?)?.toInt();
    if (id == null) return;
    final uyeler =
        ref.read(allianceChatOpenProvider).value?.members ?? const [];
    final ad = uyeler
        .where((m) => m.playerId == id)
        .map((m) => m.username)
        .firstOrNull;
    if (ad == null) return;
    setState(() => _typing[ad] = DateTime.now().add(_typingTtl));
  }

  @override
  void dispose() {
    ref.read(realtimeProvider).closeRoom(MwChatRoom.alliance);
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
    final acilis = ref.watch(allianceChatOpenProvider);
    final gecmis = ref.watch(allianceChatHistoryProvider);
    ref.watch(tickProvider);

    if (acilis.hasError) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: MwErrorBox(
          // ⚠️ İttifaksız oyuncuda sunucu `not_alliance_member` dönüyor ve sebebi yazmak şart.
          acilis.error is MwApiError
              ? roomErrorText(
                  (acilis.error! as MwApiError).code,
                  (acilis.error! as MwApiError).message,
                )
              : 'İttifak sohbeti açılamadı.',
        ),
      );
    }

    final mesajlar = _merge(gecmis.value?.items ?? const []);
    final open = acilis.value;

    final dogrulandi = ref.watch(accountProvider).value?.emailVerified;
    final kapi = writeGate(blockedByMe: false, emailVerified: dogrulandi);
    final yazabilir = (open?.canWrite ?? false) && kapi.canWrite;
    final sebep = open != null && !open.canWrite
        ? (open.blockedText ?? 'Bu sohbette yazamıyorsun.')
        : kapi.reason;

    final simdi = DateTime.now();
    final yazanlar = [
      for (final e in _typing.entries)
        if (e.value.isAfter(simdi)) e.key,
    ];

    return Column(
      children: [
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
                    /* ⭐ Kaldırma yetkisi SATIR BAŞINA hesaplanıyor: kendi mesajım serbest,
                       ayrılmış üyeninki serbest, Lider'inki asla (karar `canDeleteMessage`de,
                       testli). ⚠️ `roleOf` listede olmayan gönderene `null` dönüyor ve o
                       `null` "ayrılmış" demek — gerçek bir anlam taşıyor. */
                    final silebilir =
                        open != null &&
                        myId != null &&
                        canDeleteMessage(
                          myRole: open.myRole,
                          myPlayerId: myId,
                          senderId: m.senderId,
                          senderRole: open.roleOf(m.senderId),
                        );
                    /* ⚠️ «Önceki» = daha ESKİ mesaj ve ters listede o `i + 1`. */
                    return MwRoomLine(
                      m: m,
                      myId: myId,
                      onceki: i + 1 < mesajlar.length ? mesajlar[i + 1] : null,
                      onDelete: silebilir ? () => _delete(m) : null,
                    );
                  },
                ),
        ),

        // ⭐ Şerit koşulsuz — gerekçesi `global_chat_sheet.dart`ta.
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
    final page = ref.read(allianceChatHistoryProvider).value;
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
          .request('GET', '/api/v1/alliance/chat/messages?before=${enEski.id}');
      final gelen = body is Map<String, dynamic>
          ? RoomHistoryPage.fromJson(body)
          : RoomHistoryPage.empty;
      if (!mounted) return;
      setState(() {
        _older.addAll(gelen.items);
        _exhausted = !gelen.hasMore || gelen.items.isEmpty;
      });
    } catch (_) {
      if (mounted) setState(() {});
    } finally {
      if (mounted) setState(() => _loadingOlder = false);
    }
  }

  void _typingPing() {
    final simdi = DateTime.now();
    if (simdi.difference(_lastTypingSent) <
        const Duration(milliseconds: 2500)) {
      return;
    }
    _lastTypingSent = simdi;
    ref.read(realtimeProvider).sendTyping(MwChatRoom.alliance);
  }

  Future<void> _delete(RoomMessage m) async {
    final ok = await mwConfirmSheet(
      context,
      title: 'Mesaj kaldırılsın mı?',
      // ⚠️ «Kaldır», «sil» değil: satır gerçekten silinmiyor, `deleted_at` işaretleniyor ve
      // denetim izi kalıyor. Metnin bunu yansıtması gerekiyor.
      body:
          'Mesaj sohbetten kaldırılacak ve ittifağın üyeleri artık göremeyecek. '
          'Emin misiniz!',
      confirmLabel: 'Kaldır',
    );
    if (!ok || !mounted) return;
    try {
      await ref.read(allianceChatProvider).deleteMessage(m.id);
    } on MwApiError catch (e) {
      await mwTapError();
      if (mounted) setState(() => _error = roomErrorText(e.code, e.message));
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
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
      await ref.read(allianceChatProvider).send(metin, const Uuid().v4());
      _controller.clear();
      await mwTapOk();
    } on MwApiError catch (e) {
      await mwTapError();
      /* ⭐ Kural onayı istenmişse HATA GÖSTERMİYORUZ, kuralları açıyoruz: oyuncunun yapması
         gereken şey bir hata okumak değil, metni okuyup kabul etmek. Onaylarsa mesaj
         kendiliğinden yeniden gidiyor — yazdığı metni ikinci kez yazdırmak cezalandırma olurdu.
         ⚠️ İttifak kapsamında `channelId` VERİLMİYOR: onay oyun başına. */
      if (e.code == 'terms_required' && mounted) {
        final ok = await showChatTermsSheet(context);
        if (ok && mounted) {
          setState(() => _sending = false);
          await _send();
          return;
        }
        if (mounted) setState(() => _error = null);
      } else if (mounted) {
        setState(() => _error = roomErrorText(e.code, e.message));
      }
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }
}

/// ⭐ ÜYE LİSTESİ — susturmanın tek kapısı.
///
/// ⚠️ Ayrı bir sheet: sohbetin içine gömseydik on üyelik bir listede mesajlar görünmez olurdu.
Future<void> showAllianceRosterSheet(BuildContext context) =>
    mwSheet<void>(context, title: 'Üyeler', child: const _Roster());

class _Roster extends ConsumerWidget {
  const _Roster();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final myId = ref.watch(sessionProvider)?.playerId;
    final open = ref.watch(allianceChatOpenProvider).value;
    if (open == null || myId == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final m in open.members)
          _MemberRow(
            m: m,
            /* ⭐ Düğme yalnız GERÇEKTEN yetkim varsa çiziliyor. Kural sunucudan kopyalandı ve
               karar VERMİYOR — sunucu son sözü söylüyor; buradaki iş reddedilecek bir düğmeyi
               hiç göstermemek. */
            canModerate: canMute(
              myRole: open.myRole,
              myPlayerId: myId,
              targetRole: m.role,
              targetPlayerId: m.playerId,
            ),
          ),
        /* ⚠️ Kırpılmış liste AÇIKÇA söyleniyor: eksik bir listede aranan üyeyi bulamamak
           "ittifakta değil" diye okunurdu. */
        if (open.truncated)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(
              'Liste kırpıldı — tüm üyeler gösterilmiyor.',
              style: TextStyle(fontSize: 11, color: c.muted),
            ),
          ),
      ],
    );
  }
}

class _MemberRow extends ConsumerStatefulWidget {
  const _MemberRow({required this.m, required this.canModerate});

  final AllianceMember m;
  final bool canModerate;

  @override
  ConsumerState<_MemberRow> createState() => _MemberRowState();
}

class _MemberRowState extends ConsumerState<_MemberRow> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final m = widget.m;
    final c = MwColors.of(context);
    final etiket = muteLabel(muted: m.muted, until: m.mutedUntil);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          /* ⭐ Çevrimiçilik noktası — yalnız ittifak İÇİNDE sızıyor (sunucu kararı). Sayı
             değil nokta: "kaç dakikadır çevrimiçi" diye bir soru yok. */
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: m.online ? c.success : c.border,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  // ⚠️ Oyuncunun adı — gövde fontu, büyütme yok.
                  m.username,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13),
                ),
                Row(
                  children: [
                    Text(
                      roleLabel(m.role),
                      style: TextStyle(fontSize: 11, color: c.muted),
                    ),
                    if (etiket.isNotEmpty) ...[
                      const SizedBox(width: 6),
                      Text(
                        etiket,
                        style: TextStyle(fontSize: 11, color: c.danger),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          if (widget.canModerate)
            MwSmallButton(
              label: m.muted ? 'Aç' : 'Sustur',
              kind: m.muted ? MwButtonKind.ghost : MwButtonKind.danger,
              onTap: _busy ? null : (m.muted ? _unmute : _mute),
            ),
        ],
      ),
    );
  }

  Future<void> _mute() async {
    /* ⚠️⚠️ Süre AÇIKÇA seçtiriliyor ve «Kalıcı» listede duruyor. Sözleşmede alan zorunlu +
       nullable ve gerekçesi aynı: en yıkıcı seçenek varsayılan olarak DÜŞMEMELİ. */
    final secim = await mwSheet<int?>(
      context,
      title: '${widget.m.username} ne kadar susturulsun?',
      child: Builder(
        builder: (ctx) => Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final d in kMuteDurations) ...[
              MwButton(
                label: d.label,
                kind: d.minutes == null
                    ? MwButtonKind.danger
                    : MwButtonKind.ghost,
                // ⚠️ `null` "iptal" ile karışıyor → kalıcı seçenek -1 ile taşınıyor ve
                // aşağıda geri çevriliyor. Sheet iptal edilirse de `null` dönüyor.
                onTap: () => Navigator.of(ctx).pop(d.minutes ?? -1),
              ),
              const SizedBox(height: 8),
            ],
          ],
        ),
      ),
    );
    if (secim == null || !mounted) return;

    setState(() => _busy = true);
    try {
      await ref
          .read(allianceChatProvider)
          .mute(widget.m.playerId, minutes: secim == -1 ? null : secim);
      await mwTapDestructive();
    } catch (_) {
      await mwTapError();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _unmute() async {
    setState(() => _busy = true);
    try {
      await ref.read(allianceChatProvider).unmute(widget.m.playerId);
      await mwTapOk();
    } catch (_) {
      await mwTapError();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// Yazma kutusu — Genel Sohbet'inkiyle aynı.
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
