/// ⭐⭐ İTTİFAK EKRANI — Komuta Merkezi'nin altında (orijinalde de öyle: `g.java` ekran 17).
///
/// ─ ⚠️⚠️ TEK EKRAN, İKİ YÜZ ─────────────────────────────────────────────────────────────
/// Sunucu **tek istekte** hangi yüzü göreceğimizi söylüyor: üyeysem künye + üye listesi,
/// değilsem kurma şartı + ittifak listesi. İki ayrı ekran yazmadık çünkü hangisinin
/// geleceğini istemci **önceden bilmiyor** ve iki sağlayıcı açmak, bilinmeyen bir dalın
/// isteğini boşuna atmak olurdu.
///
/// ─ ⭐ YETKİ MATRİSİ EKRANDA DEĞİL ────────────────────────────────────────────────────────
/// Kim kimi atabilir/terfi ettirebilir kararı `alliance_rules.dart`ta ve testli. Buradaki iş
/// yalnız kararı uygulamak: **reddedilecek bir düğmeyi hiç göstermemek.** Son sözü sunucu
/// söylüyor; istemci kopyası bir kolaylık, kapı değil.
///
/// ⚠️ Başvuru düğmesinin görünürlüğü ise **sunucudan** geliyor (`canApply`) ve istemci onu
/// yeniden türetmiyor — o kural `alliance.service.apply`te yaşıyor ve iki yerde tutmak
/// kaçınılmaz olarak kayardı.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import '../chat/alliance_chat_rules.dart';
import '../chat/alliance_chat_sheet.dart';
import '../command/command_rules.dart';
import '../command/command_screen.dart';
import 'alliance_model.dart';
import 'alliance_rules.dart';

class AllianceScreen extends ConsumerStatefulWidget {
  const AllianceScreen({super.key});

  @override
  ConsumerState<AllianceScreen> createState() => _AllianceScreenState();
}

class _AllianceScreenState extends ConsumerState<AllianceScreen> {
  /// ⚠️ Üye listesi sayfası **0 tabanlı** — sunucu da öyle. Sıralama ekranı 1 tabanlı; ikisi
  /// ayrı uç ve karıştırmak sessizce bir sayfa kaydırırdı.
  int _page = 0;

  @override
  Widget build(BuildContext context) {
    return ref
        .watch(allianceProvider(_page))
        .when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (e, _) => MwErrorBox('İttifak alınamadı: $e'),
          data: (d) {
            final mine = d.mine;
            if (mine == null) {
              return _NoAlliance(none: d.none);
            }
            return _MyAlliance(
              a: mine,
              onPage: (p) => setState(() => _page = p),
            );
          },
        );
  }
}

/* ═══ ÜYEYİM ════════════════════════════════════════════════════════════════ */

class _MyAlliance extends ConsumerWidget {
  const _MyAlliance({required this.a, required this.onPage});

  final AllianceView a;
  final void Function(int) onPage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final myId = ref.watch(sessionProvider)?.playerId ?? 0;

    return Column(
      children: [
        MwPanel(
          // ⚠️ Oyuncuların yazdığı ad — panel başlığı Cinzel uyguluyor, bu yüzden ad
          // BAŞLIKTA değil gövdede yazılıyor (`mwDisplayStyle` kuralı).
          title: 'İttifak',
          trailing: Text(
            roleLabel(a.myRole),
            style: TextStyle(fontSize: 11, color: c.onPanelHeader),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                a.name,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              _Line(label: 'Puan', value: mwNumber(a.score)),
              _Line(
                label: 'Sıra',
                value: a.rank == null ? '—' : mwNumber(a.rank!),
              ),
              _Line(label: 'Sıra Değişim', child: MwChangeText(a.rankChange)),
              _Line(label: 'Lider', value: a.leader),
              _Line(label: 'Üye', value: mwNumber(a.memberCount)),

              if (a.text.trim().isNotEmpty) ...[
                const SizedBox(height: 10),
                Divider(height: 1, color: c.border),
                const SizedBox(height: 8),
                /* ⚠️ Metin **herkese açık** (2026-08-09 kararı) ve oyuncunun yazdığı bir
                   metin: gövde fontu, ham basılıyor. Flutter işaretleme yorumlamıyor. */
                Text(a.text, style: const TextStyle(fontSize: 13)),
              ],

              const SizedBox(height: 12),
              // ⭐ Sohbetin DOĞRU EVİ burası — «Daha» menüsündeki geçici madde kalktı.
              MwButton(
                label: 'İttifak Sohbeti',
                kind: MwButtonKind.ghost,
                onTap: () => showAllianceChatSheet(context),
              ),
            ],
          ),
        ),

        const SizedBox(height: 10),
        _Actions(a: a),

        const SizedBox(height: 10),
        MwPanel(
          title: 'Üyeler',
          trailing: Text(
            '${a.page + 1} / ${a.pages}',
            style: TextStyle(
              fontSize: 11,
              color: c.onPanelHeader,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          child: Column(
            children: [
              for (var i = 0; i < a.members.length; i++) ...[
                if (i > 0) Divider(height: 1, color: c.border),
                _MemberRow(a: a, m: a.members[i], myId: myId),
              ],
              if (a.pages > 1) ...[
                Divider(height: 1, color: c.border),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      onPressed: a.page <= 0 ? null : () => onPage(a.page - 1),
                      icon: const Icon(Icons.chevron_left),
                    ),
                    Text(
                      '${a.page + 1} / ${a.pages}',
                      style: TextStyle(color: c.muted),
                    ),
                    IconButton(
                      onPressed: a.page >= a.pages - 1
                          ? null
                          : () => onPage(a.page + 1),
                      icon: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// Yönetim düğmeleri — hangisinin çizileceği rütbeye bağlı.
class _Actions extends ConsumerStatefulWidget {
  const _Actions({required this.a});

  final AllianceView a;

  @override
  ConsumerState<_Actions> createState() => _ActionsState();
}

class _ActionsState extends ConsumerState<_Actions> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final a = widget.a;
    final kapi = leaveGate(myRole: a.myRole, memberCount: a.memberCount);

    return MwPanel(
      title: 'Yönetim',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null) ...[
            MwErrorBox(_error!),
            const SizedBox(height: 10),
          ],

          if (canEditText(a.myRole))
            _btn('İttifak metnini düzenle', _editText, ghost: true),
          if (canBroadcast(a.myRole))
            _btn('Üyelere toplu mesaj', _broadcast, ghost: true),
          if (canRename(a.myRole))
            _btn('İttifağı yeniden adlandır', _rename, ghost: true),

          /* ⚠️⚠️ **LİDER HİÇBİR KOŞULDA AYRILAMAZ** — düğme çizilmiyor ve sebebi yazılıyor.
             Gizlemek tek başına yanlış olurdu: oyuncu düğmenin nereye gittiğini sorar.
             ⚠️ Tek üye kalan lider için sebep «dağıtmalısın» diyor ve dağıtma düğmesi hemen
             altında duruyor, yani çıkış yolu ekranda. */
          if (kapi.canLeave)
            _btn('İttifaktan ayrıl', _leave, danger: true)
          else if (kapi.reason != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                kapi.reason!,
                style: TextStyle(
                  fontSize: 12,
                  color: MwColors.of(context).muted,
                ),
              ),
            ),

          /* ⚠️ Dağıtma yalnız Lider'de ve ayrı bir düğme: "ayrıl" ile aynı şey değil.
             ⚠️⚠️ `memberCount > 1` koşulu KALDIRILDI (2026-08-21): tek üye kalan liderde
             düğme gizleniyordu çünkü onun için «Ayrıl» zaten dağıtıyordu. Artık ayrılmak
             hata veriyor — koşul kalsaydı son üye lider ittifağını **hiçbir yoldan**
             kapatamazdı. */
          if (canDisband(a.myRole))
            _btn('İttifağı dağıt', _disband, danger: true),
        ],
      ),
    );
  }

  Widget _btn(
    String label,
    Future<void> Function() onTap, {
    bool danger = false,
    bool ghost = false,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: MwButton(
      label: label,
      kind: danger
          ? MwButtonKind.danger
          : ghost
          ? MwButtonKind.ghost
          : MwButtonKind.primary,
      busy: _busy,
      onTap: () => _run(onTap),
    ),
  );

  Future<void> _run(Future<void> Function() f) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await f();
    } on MwApiError catch (e) {
      await mwTapError();
      // ⚠️ Sunucunun metni gösteriliyor: ittifak hataları Türkçe yazılmış ve **sebep
      // taşıyor** («Lider ittifaktan ayrılamaz — önce Liderlik Devri yapmalısın»).
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _editText() async {
    final metin = await mwTextSheet(
      context,
      title: 'İttifak metni',
      initial: widget.a.text,
      maxLength: kAllianceTextMax,
      hint: 'Üyelere ve başvuracaklara görünür',
      // ⚠️ Metnin HERKESE AÇIK olduğu yazılıyor (2026-08-09 kararı): yazan kişi bunu
      // bilerek yazsın diye web'de de aynı not eklendi.
      note: 'Bu metni ittifakta olmayan oyuncular da görebilir.',
      multiline: true,
    );
    if (metin == null || !mounted) return;
    await ref.read(allianceActionsProvider).setText(metin);
  }

  Future<void> _broadcast() async {
    final metin = await mwTextSheet(
      context,
      title: 'Üyelere toplu mesaj',
      initial: '',
      maxLength: kAllianceTextMax,
      hint: 'Mesaj',
      // ⚠️ Sohbete DEĞİL posta kutusuna düşüyor — ikisi ayrı yer ve oyuncu hangisine
      // yazdığını bilmeli.
      note: 'Mesaj her üyenin posta kutusuna düşer, sohbete değil.',
      multiline: true,
    );
    if (metin == null || !mounted) return;
    await ref.read(allianceActionsProvider).broadcast(metin);
  }

  Future<void> _rename() async {
    final ad = await mwTextSheet(
      context,
      title: 'İttifağı yeniden adlandır',
      initial: widget.a.name,
      maxLength: kAllianceNameMax,
      hint: 'Yeni ad',
      note: '$kAllianceNameMin-$kAllianceNameMax karakter.',
      validate: isAllianceNameOk,
    );
    if (ad == null || !mounted) return;
    await ref.read(allianceActionsProvider).rename(ad);
  }

  /// ⚠️ Bu akışa artık YALNIZ lider olmayan üye giriyor (`leaveGate` liderde düğmeyi
  /// çizmiyor), bu yüzden onay metninin «dağılır» dalı da kalktı.
  Future<void> _leave() async {
    final ok = await mwConfirmSheet(
      context,
      title: 'İttifaktan ayrıl',
      body: '${widget.a.name} ittifağından ayrılacaksın. Emin misiniz!',
      confirmLabel: 'Ayrıl',
    );
    if (!ok || !mounted) return;
    await ref.read(allianceActionsProvider).leave();
  }

  Future<void> _disband() async {
    final ok = await mwConfirmSheet(
      context,
      title: 'İttifağı dağıt',
      body:
          'Tüm üyeler ittifaktan çıkarılacak ve ittifak silinecek. '
          'Bu işlem geri alınamaz. Emin misiniz!',
      confirmLabel: 'Dağıt',
    );
    if (!ok || !mounted) return;
    await ref.read(allianceActionsProvider).disband();
  }
}

class _MemberRow extends ConsumerWidget {
  const _MemberRow({required this.a, required this.m, required this.myId});

  final AllianceView a;
  final AllianceMemberRow m;
  final int myId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final scheme = Theme.of(context).colorScheme;
    final unvan = meritOf(m.meritTier);
    final durum = memberState(onVacation: m.onVacation, online: m.online);

    /* Üç yetkinin üçü de AYRI kapı ve üçü de testli: atmak Konsey'e açık, rütbe değiştirmek
       ve liderlik devri yalnız Lider'e. */
    final yonetilebilir =
        canKick(
          myRole: a.myRole,
          myPlayerId: myId,
          targetRole: m.role,
          targetPlayerId: m.playerId,
        ) ||
        canSetCouncil(
          myRole: a.myRole,
          myPlayerId: myId,
          targetRole: m.role,
          targetPlayerId: m.playerId,
        ) ||
        canTransferLeadership(
          myRole: a.myRole,
          myPlayerId: myId,
          targetPlayerId: m.playerId,
        );

    return InkWell(
      // ⚠️ Yönetim yetkisi yoksa satır pasif — dokunulabilir görünen ama hiçbir şey yapmayan
      // bir satır, ekranın bozuk olduğunu düşündürürdü.
      onTap: yonetilebilir
          ? () => showMemberSheet(context, a: a, m: m, myId: myId)
          : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 2),
        child: Row(
          children: [
            /* ⭐ Tatil, çevrimiçilikten ÖNCE geliyor (karar `memberState`te): oyuncunun
               bilmesi gereken şey "saldırılamaz" olduğu, o an bağlı olup olmadığı değil. */
            switch (durum) {
              MwMemberState.vacation => Text(
                'Tatilde',
                style: TextStyle(fontSize: 10, color: c.info),
              ),
              _ => Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: durum == MwMemberState.online ? c.success : c.border,
                  shape: BoxShape.circle,
                ),
              ),
            },
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          m.username,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: m.playerId == myId ? scheme.primary : null,
                          ),
                        ),
                      ),
                      /* ⭐ Askerî ünvan rozeti **YALNIZ BURADA** görünüyor (kullanıcı şartı):
                         Dünya, Sıralama ve savaş raporunda YOK, çünkü rozet aynı zamanda
                         «ordusu yeni kırıldı» istihbaratı. */
                      if (unvan != null) ...[
                        const SizedBox(width: 5),
                        MwIcon(folder: 'ranks', id: unvan.id, size: 15),
                      ],
                    ],
                  ),
                  Text(
                    '${roleLabel(m.role)} · ${mwNumber(m.score)} puan'
                    '${m.worldRank == null ? '' : ' · ${m.worldRank}.'}',
                    style: TextStyle(fontSize: 11, color: c.muted),
                  ),
                ],
              ),
            ),
            if (yonetilebilir)
              Icon(Icons.chevron_right, size: 18, color: c.muted),
          ],
        ),
      ),
    );
  }
}

/// Üye yönetim sheet'i — at · Konseye al/çıkar · liderlik devri.
Future<void> showMemberSheet(
  BuildContext context, {
  required AllianceView a,
  required AllianceMemberRow m,
  required int myId,
}) => mwSheet<void>(
  context,
  // ⚠️ Başlık sistem sözcüğü; oyuncunun adı gövdede (Cinzel kuralı).
  title: 'Üye',
  child: _MemberActions(a: a, m: m, myId: myId),
);

class _MemberActions extends ConsumerStatefulWidget {
  const _MemberActions({required this.a, required this.m, required this.myId});

  final AllianceView a;
  final AllianceMemberRow m;
  final int myId;

  @override
  ConsumerState<_MemberActions> createState() => _MemberActionsState();
}

class _MemberActionsState extends ConsumerState<_MemberActions> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final a = widget.a;
    final m = widget.m;
    final c = MwColors.of(context);

    final atabilir = canKick(
      myRole: a.myRole,
      myPlayerId: widget.myId,
      targetRole: m.role,
      targetPlayerId: m.playerId,
    );
    final rutbe = canSetCouncil(
      myRole: a.myRole,
      myPlayerId: widget.myId,
      targetRole: m.role,
      targetPlayerId: m.playerId,
    );
    final devir = canTransferLeadership(
      myRole: a.myRole,
      myPlayerId: widget.myId,
      targetPlayerId: m.playerId,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          m.username,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        Text(
          '${roleLabel(m.role)} · ${mwNumber(m.score)} puan',
          style: TextStyle(fontSize: 12, color: c.muted),
        ),

        if (_error != null) ...[
          const SizedBox(height: 12),
          MwErrorBox(_error!),
        ],
        const SizedBox(height: 16),

        if (rutbe) ...[
          MwButton(
            label: m.role >= MwRole.council ? 'Konseyden çıkar' : 'Konseye al',
            kind: MwButtonKind.ghost,
            busy: _busy,
            onTap: () => _act(
              m.role >= MwRole.council ? 'demote' : 'promote',
              title: m.role >= MwRole.council
                  ? 'Konseyden çıkarılsın mı?'
                  : 'Konseye alınsın mı?',
              body: m.role >= MwRole.council
                  ? '${m.username} rütbesi Asker olacak; davet ve başvuru yetkisi kalkacak. '
                        'Emin misiniz!'
                  : '${m.username} davet gönderebilecek, başvuruları sonuçlandırabilecek ve '
                        'ittifak metnini düzenleyebilecek. Emin misiniz!',
              danger: m.role >= MwRole.council,
            ),
          ),
          const SizedBox(height: 8),
        ],

        if (devir) ...[
          MwButton(
            label: 'Liderliği devret',
            kind: MwButtonKind.danger,
            busy: _busy,
            onTap: () => _act(
              'transfer',
              title: 'Liderlik devredilsin mi?',
              /* ⚠️ Devirden sonra **Konsey'e düşüyorum**, ittifaktan çıkmıyorum — metin
                 bunu söylemek zorunda: "liderliği bırakmak" ile "ayrılmak" oyuncunun
                 kafasında aynı şey olabilir. */
              body:
                  '${m.username} yeni lider olacak, sen Konsey rütbesine düşeceksin. '
                  'Bu işlem geri alınamaz. Emin misiniz!',
            ),
          ),
          const SizedBox(height: 8),
        ],

        if (atabilir)
          MwButton(
            label: 'İttifaktan çıkar',
            kind: MwButtonKind.danger,
            busy: _busy,
            onTap: () => _act(
              'kick',
              title: 'İttifaktan çıkarılsın mı?',
              body:
                  '${m.username} ittifaktan çıkarılacak ve posta kutusuna bildirim düşecek. '
                  'Emin misiniz!',
            ),
          ),
      ],
    );
  }

  Future<void> _act(
    String action, {
    required String title,
    required String body,
    bool danger = true,
  }) async {
    final ok = await mwConfirmSheet(
      context,
      title: title,
      body: body,
      confirmLabel: 'Onayla',
      danger: danger,
    );
    if (!ok || !mounted) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(allianceActionsProvider)
          .memberAction(widget.m.playerId, action);
      if (mounted) Navigator.of(context).pop();
    } on MwApiError catch (e) {
      await mwTapError();
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/* ═══ ÜYE DEĞİLİM ═══════════════════════════════════════════════════════════ */

class _NoAlliance extends ConsumerStatefulWidget {
  const _NoAlliance({required this.none});

  final AllianceNone? none;

  @override
  ConsumerState<_NoAlliance> createState() => _NoAllianceState();
}

class _NoAllianceState extends ConsumerState<_NoAlliance> {
  final _search = TextEditingController();
  String _query = '';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final n = widget.none;

    return Column(
      children: [
        MwPanel(
          title: 'İttifak Kur',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null) ...[
                MwErrorBox(_error!),
                const SizedBox(height: 10),
              ],
              /* ⭐ Kurma şartı SUNUCUDAN geliyor (`canFound`) ve sebebi rakamla yazılıyor:
                 «Kale 5 gerekiyor, sende 3» — «kuramazsın» tek başına oyuncuya ne yapması
                 gerektiğini söylemiyor. */
              if (n != null && !n.canFound)
                Text(
                  'İttifak kurmak için Kale seviyesi ${n.needCastle} gerekiyor '
                  '(en yüksek kalen: ${n.currentCastle}).',
                  style: TextStyle(fontSize: 13, color: c.muted),
                )
              else
                MwButton(label: 'İttifak kur', busy: _busy, onTap: _found),
            ],
          ),
        ),

        const SizedBox(height: 10),
        MwPanel(
          title: 'İttifaklar',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _search,
                      textInputAction: TextInputAction.search,
                      onSubmitted: (v) => setState(() => _query = v.trim()),
                      decoration: InputDecoration(
                        hintText: 'İttifak adı ara',
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 12,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(6),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  MwSmallButton(
                    label: 'Ara',
                    onTap: () => setState(() => _query = _search.text.trim()),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              /* ⚠️ Boş sorgu da geçerli: sunucu en iyi 25 ittifağı döndürüyor. Arama
                 ZORUNLU olsaydı yeni oyuncu hangi ittifakların var olduğunu hiç göremezdi. */
              _AllianceList(
                query: _query,
                pending: n?.pendingApplications ?? const [],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _found() async {
    final ad = await mwTextSheet(
      context,
      title: 'İttifak kur',
      initial: '',
      maxLength: kAllianceNameMax,
      hint: 'İttifak adı',
      note: '$kAllianceNameMin-$kAllianceNameMax karakter.',
      validate: isAllianceNameOk,
    );
    if (ad == null || !mounted) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(allianceActionsProvider).found(ad);
      await mwTapOk();
    } on MwApiError catch (e) {
      await mwTapError();
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _AllianceList extends ConsumerWidget {
  const _AllianceList({required this.query, required this.pending});

  final String query;
  final List<int> pending;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    return ref
        .watch(allianceListProvider(query))
        .when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 20),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (e, _) => MwErrorBox('İttifaklar alınamadı: $e'),
          data: (rows) {
            if (rows.isEmpty) return const MwEmpty('İttifak bulunamadı.');
            return Column(
              children: [
                for (var i = 0; i < rows.length; i++) ...[
                  if (i > 0) Divider(height: 1, color: c.border),
                  _ListRow(
                    row: rows[i],
                    // ⚠️ «Başvuruldu» rozeti: rozet olmasaydı oyuncu ikinci kez başvurmayı
                    // dener ve sunucu reddederdi.
                    applied: pending.contains(rows[i].id),
                  ),
                ],
              ],
            );
          },
        );
  }
}

class _ListRow extends StatelessWidget {
  const _ListRow({required this.row, required this.applied});

  final AllianceListRow row;
  final bool applied;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return InkWell(
      onTap: () => showAllianceProfileSheet(context, row.id),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 2),
        child: Row(
          children: [
            SizedBox(
              width: 36,
              child: Text(
                row.rank == null ? '—' : '${row.rank}.',
                style: TextStyle(
                  fontSize: 12,
                  color: c.muted,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    row.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    '${mwNumber(row.memberCount)} üye · ${mwNumber(row.score)} puan',
                    style: TextStyle(fontSize: 11, color: c.muted),
                  ),
                ],
              ),
            ),
            if (applied)
              Text(
                'Başvuruldu',
                style: TextStyle(fontSize: 11, color: c.warning),
              ),
            Icon(Icons.chevron_right, size: 18, color: c.muted),
          ],
        ),
      ),
    );
  }
}

/// ⭐ HERKESE AÇIK KÜNYE — sıralamadan ve arama sonucundan açılıyor.
///
/// ⚠️⚠️ **Üye listesi burada YOK** ve olmamalı: çevrimiçilik ve askerî ünvanlar ittifak içi
/// bilgi. Bu uç yalnız TOPLAMLARI veriyor.
Future<void> showAllianceProfileSheet(BuildContext context, int id) =>
    mwSheet<void>(
      context,
      title: 'İttifak',
      child: _Profile(id: id),
    );

class _Profile extends ConsumerStatefulWidget {
  const _Profile({required this.id});

  final int id;

  @override
  ConsumerState<_Profile> createState() => _ProfileState();
}

class _ProfileState extends ConsumerState<_Profile> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return ref
        .watch(allianceProfileProvider(widget.id))
        .when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (e, _) => MwErrorBox('Künye okunamadı: $e'),
          data: (p) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                p.name,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              _Line(
                label: 'Sıra',
                value: p.rank == null ? '—' : mwNumber(p.rank!),
              ),
              _Line(label: 'Puan', value: mwNumber(p.score)),
              _Line(label: 'Lider', value: p.leader),
              _Line(label: 'Üye', value: mwNumber(p.memberCount)),

              if (p.text.trim().isNotEmpty) ...[
                const SizedBox(height: 10),
                Divider(height: 1, color: c.border),
                const SizedBox(height: 8),
                Text(p.text, style: const TextStyle(fontSize: 13)),
              ],

              if (_error != null) ...[
                const SizedBox(height: 12),
                MwErrorBox(_error!),
              ],
              const SizedBox(height: 16),

              /* ⚠️⚠️ Görünürlük SUNUCUDAN (`canApply`) ve istemci yeniden türetmiyor.
                 Düğme yoksa sebebi YAZILIYOR — sessizce gizlemek, ekranın bozuk olduğunu
                 düşündürürdü (`AllianceModal.tsx`taki sözleşme). */
              if (p.canApply)
                MwButton(
                  label: 'Başvur',
                  busy: _busy,
                  onTap: () => _apply(p.id),
                )
              else if (p.applyBlockedReason != null)
                Text(
                  p.applyBlockedReason!,
                  style: TextStyle(fontSize: 12, color: c.muted),
                ),
            ],
          ),
        );
  }

  Future<void> _apply(int id) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(allianceActionsProvider).apply(id);
      await mwTapOk();
      // ⚠️ Başvuru ANINDA sonuçlanmıyor: yönetim kabul edene kadar bekliyor. Sheet kapanıyor
      // ve liste «Başvuruldu» rozetine dönüyor — ittifağa girmiş gibi davranmıyoruz.
      if (mounted) Navigator.of(context).pop();
    } on MwApiError catch (e) {
      await mwTapError();
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.label, this.value, this.child});

  final String label;
  final String? value;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: TextStyle(fontSize: 13, color: c.muted)),
          ),
          child ??
              Text(
                value ?? '',
                style: const TextStyle(
                  fontSize: 13,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
        ],
      ),
    );
  }
}
