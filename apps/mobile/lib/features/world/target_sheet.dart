/// ⭐ HEDEF KÜNYESİ — diyar listesinde bir slota dokununca açılan sheet.
///
/// ⚠️⚠️ Bu sheet **bilgi kaybını telafi ediyor, süs değil.** Dar ekranda liste üç sütunu
/// gizliyor (Şehir · İttifak · Görev — web'in mobil görünümüyle aynı karar) ve gizlenen ilk
/// şey şehrin ADI. Karar şu ayrımdan geliyor: *"kim, ne kadar güçlü"* sorusu satırda,
/// *"hangi şehir"* sorusu burada cevaplanıyor.
///
/// ⚠️ **GİZLİLİK (§13.16.5):** burada da asker ve kaynak YOK. Sunucu göndermiyor, istemci de
/// türetmeye çalışmıyor — onu öğrenmenin yolu casusluk.
///
/// ⭐⭐ İKİ ADIMLI AKIŞ (web'le aynı): önce **seçenek listesi**, sonra **görev formu**.
///   1. Seçenekler SUNUCUDAN gelir (`GET /missions/options`) — istemci "kime ne gönderilebilir"i
///      kendi hesaplamaz; hesaplasaydı kural iki yerde yaşar ve kaçınılmaz olarak kayardı.
///   2. Seçilen tipe göre form açılır (`mission_form.dart`).
///
/// ⚠️ **Kapalı seçenek gizlenmez, sebebiyle gösterilir** — oyuncu neden yapamadığını görmeli.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../core/world_coords.dart';
import '../../gen/contracts.g.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import '../alliance/alliance_rules.dart';
import '../chat/chat_rules.dart';
import '../chat/chat_sheet.dart';
import 'mission_form.dart';
import 'mission_options.dart';
import 'mission_rules.dart';

/// Koruma sebebinin oyuncuya görünen karşılığı.
///
/// ⚠️ **SÜRE YAZMIYOR**, yalnız sebep (§13.16.5): kalan süreyi vermek, korumanın bittiği anı
/// dakikası dakikasına bekleyip saldırmayı kolaylaştırırdı.
const Map<String, String> kProtectionLabel = {
  'beginner': 'Acemi koruması altında — saldırıya kapalı.',
  'vacation': 'Tatil modunda — saldırıya kapalı.',
};

/// Şehir adından **« şehri»** ekini atar (web'deki `cityLabel` ile aynı).
///
/// ⚠️ Bu yardımcı **eski satırlar için** duruyor: kayıtta üretilen ad bir ara
/// `"<oyuncu> şehri"` biçimindeydi, yeni kayıtlarda ek artık üretilmiyor. Web'de de aynı
/// gerekçeyle korunuyor; iki istemciden birinde silmek adları ayrıştırırdı.
String cityLabel(String name) =>
    name.replaceFirst(RegExp(r'\s+şehri$', caseSensitive: false), '');

/// Hedef künyesi. `initialType` verilirse seçenekler gelir gelmez o görevin formu
/// kendiliğinden açılıyor (rapordan gelen `?m=` yolu).
Future<void> showTargetSheet(
  BuildContext context, {
  required WorldSlot slot,
  required MwRealm realm,
  String? initialType,
}) {
  final city = slot.city;
  final koord = '${realm.k}:${realm.d}:${slot.s}';

  return mwSheet<void>(
    // ⚠️ Boş slotta başlık koordinat: «—» yazmak sheet'i kimliksiz bırakırdı.
    context,
    title: city == null ? koord : cityLabel(city.name),
    /* ⭐ ŞEHİR ADI OYUNCUNUN YAZDIĞI METİN (kullanıcı, 2026-08-19): *"otomatik büyük harfle
       yazmayalım, orijinal şehir ve kullanıcı adlarını gösterelim"*. `mwSheet` bugüne kadar
       başlığı koşulsuz `mwUpper` + Cinzel ile çiziyordu — «Mithlond» ekranda «MİTHLOND»
       görünüyordu, yani depoda zaten yazılı olan kuralın (`primitives.dart` · Cinzel uyarısı)
       ihlaliydi. Boş slotta başlık koordinat olduğu için orada bayrak KAPALI kalıyor. */
    titleIsUserText: city != null,
    child: Builder(
      builder: (ctx) {
        final c = MwColors.of(ctx);

        if (city == null) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _Row(label: 'Koordinat', value: koord, tnum: true),
              const SizedBox(height: 10),
              Text(
                'Bu slot boş. Buraya şehir kurulabilir.',
                style: TextStyle(color: c.muted),
              ),
              const SizedBox(height: 8),
              _Options(slot: slot, realm: realm, initialType: initialType),
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const MwIcon(folder: 'buildings', id: 'city', size: 40),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              city.username,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                /* ⚠️ `c.own`, `scheme.primary` DEĞİL — künye Dünya
                                   listesinden açılıyor ve orada da aynı token kullanılıyor.
                                   Biri bronz biri lacivert kalsaydı aynı ekranın iki
                                   parçası «benim şehrim»i farklı renkle söylerdi.
                                   Gerekçe `MwColors.own` başlığında. */
                                color: city.isOwn ? c.own : null,
                              ),
                            ),
                          ),
                          if (city.isAlly) ...[
                            const SizedBox(width: 5),
                            const MwIcon(
                              folder: 'ui',
                              id: 'alliance',
                              size: 15,
                            ),
                          ],
                        ],
                      ),
                      Text(
                        koord,
                        style: TextStyle(
                          fontSize: 12,
                          color: c.muted,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // ⭐ «başkent» burada duruyor: listede yıldız YOK (web'de kullanıcı kaldırttı ve
            // orijinal oyun da dünya ekranında başkent işareti çizmiyor — bilgi modalda).
            if (city.isCapital) _Row(label: 'Şehir', value: 'Başkent'),
            _Row(label: 'İttifak', value: city.alliance ?? '—'),
            // ⚠️ `rank` yoksa puan da yazılmıyor — ikisi aynı anlık görüntüden geliyor.
            _Row(
              label: 'Sıra / Puan',
              value: city.rank == null
                  ? '—'
                  : city.rankScore == null
                  ? '${city.rank}'
                  : '${city.rank} / ${mwNumber(city.rankScore!)}',
              tnum: true,
            ),

            if (city.protection != null) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: c.info.withValues(alpha: 0.12),
                  border: Border.all(color: c.info),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  kProtectionLabel[city.protection] ?? 'Saldırıya kapalı.',
                  style: TextStyle(fontSize: 12, color: c.info),
                ),
              ),
            ],

            /* ⭐ MESAJ GÖNDER (2026-08-18, Sohbet turu) — orijinalin «Mesaj» maddesi.
             *
             * ⚠️ Yalnız BAŞKASININ şehrinde: kendine mesaj göndermek sunucuda `self_message`
             * ile reddediliyor ve reddedilecek bir düğmeyi sunmanın anlamı yok.
             * ⚠️ Sefer seçeneklerinin (`_Options`) ÜSTÜNDE değil altında: bu sheet'in asıl işi
             * ordu göndermek, mesaj ikincil bir eylem. */
            if (!city.isOwn) ...[
              const SizedBox(height: 10),
              _MessageButton(playerId: city.playerId, username: city.username),
              /* ⭐⭐ İTTİFAĞA DAVET (kullanıcı, 2026-08-22) — doküman zaten *"dünya ekranında
                 İttifak Daveti seçeneği"* diyordu ve web'de baştan beri vardı; mobilde
                 **hiç yoktu**, yani Konsey/Lider oyuncu telefondan kimseyi davet edemiyordu.

                 ⚠️ Düğme kendi yetkisini KENDİ soruyor (`_InviteButton` içinde), burada
                 koşul yok: karar iki veriye birden bağlı (benim rütbem + hedefin ittifakı)
                 ve rütbe ayrı bir sorgudan geliyor. Koşulu buraya yazsaydık o sorguyu bu
                 gövdede beklemek gerekirdi. */
              _InviteButton(
                playerId: city.playerId,
                username: city.username,
                targetHasAlliance: city.hasAlliance,
              ),
            ],

            const SizedBox(height: 6),
            _Options(slot: slot, realm: realm, initialType: initialType),
          ],
        );
      },
    ),
  );
}

/// ⭐ «MESAJ GÖNDER» — hedefin künyesinden doğrudan sohbet açar.
///
/// ⚠️ Sohbet **açılırken yaratılıyor** (`POST /chat/conversations`): iki yönde tek kanal var
/// (`dm_key`), yani ikinci kez basmak yeni bir sohbet doğurmuyor. İstemcinin "zaten var mı"
/// diye ayrıca sorması gerekmiyor.
///
/// ⚠️ Kanal yeni açıldığı için `blocked` bilgisi elimizde YOK — liste sorgusundan geliyor ve
/// o sorgu bu kanalı ilk mesaja kadar taşımayabiliyor. `false` veriliyor ve bu **güvenli
/// taraf**: kutu açık kalır, engel varsa sunucu `blocked_by_me` ile reddeder ve metni
/// `chatErrorText` yazar. Tersi (kutuyu kapatmak) engellemediği birine yazmayı imkânsız
/// kılardı.
class _MessageButton extends ConsumerStatefulWidget {
  const _MessageButton({required this.playerId, required this.username});

  final int playerId;
  final String username;

  @override
  ConsumerState<_MessageButton> createState() => _MessageButtonState();
}

class _MessageButtonState extends ConsumerState<_MessageButton> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_error != null) ...[MwErrorBox(_error!), const SizedBox(height: 8)],
        MwButton(
          label: 'Mesaj gönder',
          kind: MwButtonKind.ghost,
          busy: _busy,
          onTap: _open,
        ),
      ],
    );
  }

  Future<void> _open() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final channelId = await ref.read(chatProvider).open(widget.playerId);
      if (!mounted) return;
      // ⚠️ Hedef künyesi KAPANIYOR, sohbet onun üstüne açılmıyor: iki sheet üst üste
      // yığıldığında geri tuşu oyuncuyu beklemediği bir ekrana düşürüyor.
      Navigator.of(context).pop();
      await showChatSheet(context, (
        channelId: channelId,
        playerId: widget.playerId,
        username: widget.username,
        blocked: false,
      ));
    } on MwApiError catch (e) {
      await mwTapError();
      if (mounted) setState(() => _error = chatErrorText(e.code));
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// ⭐⭐ «İTTİFAĞA DAVET» — hedefin künyesinden doğrudan davet gönderir (2026-08-22).
///
/// Web'deki `PlayerActions` · `InviteRow` karşılığı. Karşı taraf daveti **posta kutusundan**
/// Kabul/Red ediyor; burada yapılan tek şey daveti yollamak.
///
/// ⚠️⚠️ Kendi rütbem AYRI bir sorgudan geliyor (`allianceProvider`) ve o sorgu **yalnız
/// gerektiğinde** açılıyor: hedefin zaten ittifakı varsa davet hiçbir hâlde gönderilemez,
/// o yüzden rütbeyi sormanın da anlamı yok. Web'de de aynı optimizasyon var
/// (`useAlliance(0, city.hasAlliance !== true)`).
///
/// ⚠️ Sorgu henüz gelmemişken düğme ÇİZİLMİYOR (`?? 0` kapalı tarafa düşüyor): bir an görünüp
/// kaybolan bir düğme, yanlışlıkla basılabilen bir düğmedir.
/// ⚠️ Onay isteniyor (`mwConfirmSheet`): davet karşı tarafın kutusuna düşen, geri alınamayan
/// bir bildirim. Web'de de onaylı.
class _InviteButton extends ConsumerStatefulWidget {
  const _InviteButton({
    required this.playerId,
    required this.username,
    required this.targetHasAlliance,
  });

  final int playerId;
  final String username;
  final bool targetHasAlliance;

  @override
  ConsumerState<_InviteButton> createState() => _InviteButtonState();
}

class _InviteButtonState extends ConsumerState<_InviteButton> {
  bool _busy = false;
  bool _sent = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);

    /* ⚠️ Hedefin ittifakı varsa sorgu HİÇ açılmıyor — gereksiz istek atmamak için. */
    final myRole = widget.targetHasAlliance
        ? null
        : ref.watch(allianceProvider(0)).value?.mine?.myRole;

    if (!canInviteToAlliance(
      myRole: myRole,
      targetHasAlliance: widget.targetHasAlliance,
    )) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 8),
        if (_error != null) ...[MwErrorBox(_error!), const SizedBox(height: 8)],
        if (_sent)
          Text(
            'Davet gönderildi.',
            style: TextStyle(fontSize: 12, color: c.success),
          )
        else
          MwButton(
            label: 'İttifağa davet',
            kind: MwButtonKind.ghost,
            busy: _busy,
            onTap: _invite,
          ),
      ],
    );
  }

  Future<void> _invite() async {
    final ok = await mwConfirmSheet(
      context,
      title: 'İttifağa davet',
      body:
          '${widget.username} oyuncusuna ittifak daveti gönderilecek. Emin misiniz!',
      confirmLabel: 'Gönder',
    );
    if (!ok || !mounted) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(allianceActionsProvider).invite(widget.playerId);
      if (mounted) setState(() => _sent = true);
    } on MwApiError catch (e) {
      await mwTapError();
      /* ⚠️ Sunucunun KENDİ metni yazılıyor, kod çevrilmiyor: `target_has_alliance`,
         `already_pending`, `forbidden` gibi dallar var ve her birine ayrı cümle uydurmak
         sunucuyla ayrışan ikinci bir metin kümesi üretirdi. */
      if (mounted) {
        setState(
          () => _error = e.message.isEmpty ? 'Davet gönderilemedi.' : e.message,
        );
      }
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// ⭐ SEÇENEK LİSTESİ — sunucunun bu hedefe izin verdiği görevler.
class _Options extends ConsumerStatefulWidget {
  const _Options({
    required this.slot,
    required this.realm,
    required this.initialType,
  });

  final WorldSlot slot;
  final MwRealm realm;

  /// Rapordan gelen sefer türü; seçenekler gelince o görevin formu kendiliğinden açılıyor.
  final String? initialType;

  @override
  ConsumerState<_Options> createState() => _OptionsState();
}

/// ⚠️⚠️ DURUMLU olmasının tek sebebi `initialType`: form **bir kez** açılmalı. Durumsuz bir
/// widget'ta her yeniden çizim (saat vuruşu, seçenek tazelenmesi) formu geri açar ve oyuncu
/// kapatamaz. `world_screen.dart` · `_ListState` ile aynı disiplin.
class _OptionsState extends ConsumerState<_Options> {
  bool _formAcildi = false;

  /// ⚠️ Sunucunun İZİN VERDİĞİ listede yoksa form açılmıyor — kapalı bir seçeneğin formunu
  /// zorla açmak, oyuncuyu doldurup göndermeye davet edip sunucuya reddettirmek olurdu.
  /// Seçenek listede ama `enabled: false` ise form yine açılıyor: sebep formun içinde yazılı
  /// ve oyuncu neden yapamadığını orada görüyor (bu ekranın kurulu kuralı).
  void _formuAc(MissionOptions o, int aktif) {
    final tur = widget.initialType;
    if (_formAcildi || tur == null || tur.isEmpty || o.activeCity) return;
    final opt = o.options.where((x) => x.type == tur).firstOrNull;
    if (opt == null) return;
    _formAcildi = true;
    // ⚠️ Çizim SIRASINDA sheet açılamaz; kare bitince açılıyor.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      showMissionForm(
        context,
        type: opt.type,
        originCityId: aktif,
        target: (k: widget.realm.k, d: widget.realm.d, s: widget.slot.s),
        option: opt,
        attacksLeft: o.attacksLeft,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final slot = widget.slot;
    final realm = widget.realm;
    final c = MwColors.of(context);
    final aktif = ref.watch(activeCityProvider).value;
    if (aktif == null) return const SizedBox.shrink();

    final istek = ref.watch(
      missionOptionsProvider((
        originCityId: aktif,
        k: realm.k,
        d: realm.d,
        s: slot.s,
      )),
    );

    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: istek.when(
        loading: () => Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Center(
            child: Text(
              'Seçenekler yükleniyor…',
              style: TextStyle(fontSize: 12, color: c.muted),
            ),
          ),
        ),
        error: (e, _) => MwErrorBox('Seçenekler alınamadı: $e'),
        data: (o) {
          // ⭐ Rapordan gelen sefer türü burada forma dönüşüyor — izin listesi elde.
          _formuAc(o, aktif);

          /// ⚠️ «Aktif şehrin kendisi» ile «seçenek yok» AYRI cümleler: biri *"buradan
          /// bakıyorsun zaten"*, diğeri *"bu hedefe hiçbir şey gönderemezsin"* diyor.
          if (o.activeCity) {
            return Text(
              'Bu, şu anki aktif şehrin. Kendine görev gönderemezsin; başka bir şehrini '
              'seçersen nakliye, destek ve teleport açılır.',
              style: TextStyle(fontSize: 12, color: c.muted),
            );
          }
          if (o.options.isEmpty) {
            return Text(
              'Bu hedefe gönderilebilecek görev yok.',
              style: TextStyle(fontSize: 12, color: c.muted),
            );
          }

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Divider(height: 1, color: c.border),
              for (final opt in o.options)
                _OptionRow(
                  option: opt,
                  teleportReadyAt: o.teleportReadyAt,
                  onTap: () => showMissionForm(
                    context,
                    type: opt.type,
                    originCityId: aktif,
                    target: (k: realm.k, d: realm.d, s: slot.s),
                    option: opt,
                    attacksLeft: o.attacksLeft,
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _OptionRow extends ConsumerWidget {
  const _OptionRow({
    required this.option,
    required this.teleportReadyAt,
    required this.onTap,
  });

  final MissionOption option;
  final String? teleportReadyAt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final info = kMissionInfo[option.type];
    final acik = option.enabled;

    /// ⭐ Teleport beklemesi: *"hazır değil"* yetmiyor (kullanıcı, 2026-08-03), NE KADAR
    /// kaldığı lazım. ⚠️ Süre OYUN saatinde işliyor.
    final clock = ref.watch(clockProvider);
    ref.watch(tickProvider);
    final geriSayim = option.type == 'teleport' && !acik
        ? clock.remaining(teleportReadyAt)
        : null;

    return InkWell(
      // ⚠️ Kapalı seçenek TIKLANAMAZ ama görünür kalıyor: sebebi okunacak.
      onTap: acik ? onTap : null,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: c.border)),
        ),
        child: Opacity(
          opacity: acik ? 1 : 0.6,
          child: Row(
            children: [
              MwIcon(folder: 'missions', id: info?.icon ?? 'attack', size: 40),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      // ⚠️ Sunucunun `label`ı yedek: yeni bir tip eklenirse ekran boş kalmasın.
                      info?.title ?? option.label,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      acik
                          ? (info?.hint ?? '')
                          : (option.reason ?? 'Şu anda gönderilemez.'),
                      style: TextStyle(
                        fontSize: 11,
                        color: acik ? c.muted : c.danger,
                      ),
                    ),
                    if (geriSayim != null)
                      Text(
                        'Hazır olmasına $geriSayim',
                        style: TextStyle(
                          fontSize: 11,
                          color: c.warning,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                  ],
                ),
              ),
              if (acik) Icon(Icons.chevron_right, size: 20, color: c.muted),
            ],
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value, this.tnum = false});

  final String label;
  final String value;
  final bool tnum;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 92,
            child: Text(label, style: TextStyle(color: c.muted)),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontFeatures: tnum
                    ? const [FontFeature.tabularFigures()]
                    : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
