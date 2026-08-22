/// ⭐⭐ MESAJ DETAYI — posta kutusundaki bir satırın gövdesi.
///
/// Web'de bu bir modal; mobilde bottom sheet (gerekçe `ui/native.dart`ta: telefonda başparmak
/// ekranın ALTINDA). ⚠️ `mwSheet` seçildi, `mwTallSheet` değil: `mwSheet` içerik kadar
/// büyüyüp gerektiğinde kaydırılıyor, yani üç satırlık bir ittifak daveti küçük, elli satırlık
/// bir savaş raporu ekran boyu açılıyor. Sabit yükseklikli sheet her ikisini de aynı kutuya
/// sokardı.
///
/// ─ ⚠️ GÖVDE LİSTEDEN GELMİYOR ────────────────────────────────────────────────────────────
/// Sunucu 2026-08-03'te gövdeyi liste ucundan ayırdı: liste 60 saniyede bir dönüyor ve
/// gövdeler küçük değil (savaş raporunda ganimet + mağara dökümü, casus raporunda hedefin TÜM
/// birim sayımı). Sheet açılınca `messageBodyProvider` ile ayrı çekiliyor.
///
/// ⚠️ Gövde `jsonb` ve türü sunucuda da `Record<string, unknown>`. Dart'ta tiplemek sahte bir
/// kapı olurdu (`MOBIL_MIMARI.md` §4) — alanlar okundukları yerde savunmayla çözülüyor.
///
/// ⛔ **«Simülatöre Aktar» düğmesi YOK** — bilerek. Web'de casusluk raporundan tek dokunuşla
/// simülatör dolduruluyor; mobilde Simülatör ekranı henüz yer tutucu ve olmayan bir ekrana
/// götüren düğme, çalışıyormuş gibi görünen bir kapı olurdu. O ekran gelince buraya eklenecek.
///
/// ⭐ **«Saldır» ve «Casus gönder» VAR** (2026-08-21) — gövdenin sonunda, çizgiyle ayrılmış
/// şeritte (`_SeferDugmeleri`). Yukarıdaki eksikle karıştırılmasın: o düğmenin gideceği ekran
/// yok, bunların gideceği ekran (Dünya) var ve zaten çalışıyor.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../gen/facts.g.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'battle_report.dart';
import 'battle_report_view.dart';
import 'message.dart';
import 'message_rules.dart';
import 'report_bits.dart';

Future<void> showMessageSheet(
  BuildContext context,
  MessageRow m,
) => mwSheet<void>(
  context,
  // ⚠️ Başlık tür kataloğundan, `subject`ten DEĞİL: konu olaydan olaya değişiyor ve sheet
  // başlığının kararlı olması gerekiyor. Konu ayrıntı olarak gövdenin üstünde yaşıyor.
  title: reportType(m.kind, m.side, m.subject).title,
  child: _Detail(m: m),
);

class _Detail extends ConsumerWidget {
  const _Detail({required this.m});

  final MessageRow m;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final clock = ref.watch(clockProvider);
    final tur = reportType(m.kind, m.side, m.subject);

    void kapat() {
      if (Navigator.of(context).canPop()) Navigator.of(context).pop();
    }

    /* ⭐ SAVAŞ RAPORUNDA KONU SATIRI KALKTI (kullanıcı, 2026-08-19). Konu
       *«Saldırın başarılı · alfa9lth»* biçimindeydi ve ilk yarısı, hemen altındaki
       *KAZANDINIZ !* bandının tekrarıydı. Kalan yarısı — karşı tarafın adı — damganın
       yanına taşındı, böylece bir satır tamamen kazanıldı.

       ⚠️ Yalnız SAVAŞ raporunda: diğer türlerde konu gerçek bilgi taşıyor (nakliyede ne
       geldiği, ittifak duyurusunun başlığı) ve orada kısaltmak bilgi kaybı olurdu.
       ⚠️ Ayırıcı bulunamazsa (`rakip == null`) konu eskisi gibi kendi satırında yazılıyor —
       sunucu biçimi değişirse düzen bozulur ama bilgi kaybolmaz. */
    final savas = m.battleId != null;
    final rakip = savas ? battleCounterpart(m.subject) : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        /* ⚠️⚠️ SOL GRUP `Expanded` İÇİNDE, YILDIZ DIŞINDA — `Spacer` YETMİYOR.
           Önceki düzen «damga · ad · Spacer · yıldız» idi ve yıldız sağa DEĞİL ortaya yakın
           duruyordu (kullanıcı bildirdi, 2026-08-20). Sebep: adı saran `Flexible` ile `Spacer`
           (kendisi de bir `Expanded`) **ikisi de `flex: 1`**, yani boşta kalan genişliği yarı
           yarıya bölüşüyorlardı. Ad kısa olduğu için `Flexible` payının çoğunu kullanmıyor ama
           payı yine ayrılıyor; artan yer satırın SONUNDA boşluk olarak kalıyor ve yıldız
           içeri kaymış görünüyordu.
           ⭐ Doğrusu tek esneyen kutu bırakmak: sol grubun tamamı `Expanded`, yıldız onun
           dışında → yıldız kenara yaslanıyor, ellipsis de iç `Flexible`la korunuyor. */
        Row(
          children: [
            Expanded(
              child: Row(
                children: [
                  // ⚠️ Damga **geçmişe** bakıyor → `timeAgo`, `remaining` değil. Çıpası da
                  // `serverNow`: rapor bir oyun olayı değil, geçmiş kaydı; bakımda yaşı
                  // donmamalı.
                  Text(
                    clock.timeAgo(m.at),
                    style: TextStyle(fontSize: 11, color: c.muted),
                  ),
                  if (rakip != null) ...[
                    Text(' · ', style: TextStyle(fontSize: 11, color: c.muted)),
                    // ⚠️ Oyuncunun yazdığı ad → gövde fontu, `mwUpper` YOK (Cinzel kuralı).
                    Flexible(
                      child: Text(
                        rakip,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            _FavoriDugmesi(m: m),
          ],
        ),
        // ⭐ Sunucunun yazdığı konu — başlığı tekrarlamıyorsa ve yukarı taşınmadıysa.
        if (rakip == null &&
            m.subject.isNotEmpty &&
            m.subject != tur.title) ...[
          const SizedBox(height: 2),
          Text(m.subject, style: const TextStyle(fontSize: 13)),
        ],
        const SizedBox(height: 10),

        if (m.battleId != null)
          BattleReportView(battleId: m.battleId!, onNavigate: kapat)
        else
          _PlainDetail(m: m, onDone: kapat),

        _SeferDugmeleri(m: m, onDone: kapat),
      ],
    );
  }
}

/// ⭐⭐ RAPORDAN SEFER (kullanıcı, 2026-08-21): casusluk · casusluk önleme · saldırı · şehir
/// savunma raporlarına ikon şeklinde «saldır» ve «casus gönder».
///
/// ⚠️ **Neden gövdenin SONUNDA:** `mwSheet`in altlığı (footer) yok — içerik nerede biterse
/// sheet orada bitiyor. Web'de bu düğmeler modalın footer'ında; buradaki en yakın karşılık
/// üstten çizgiyle ayrılmış son şerit. İttifak Kabul/Red düğmelerinin gövde İÇİNDE olması
/// başka bir karar (onlar raporun konusuyla ilgili, ekran değiştirmiyorlar) ve o ayrım
/// korunuyor: bu şerit çizgiyle ayrılıyor, onlar ayrılmıyor.
///
/// ⚠️ Hedef koordinatı İKİ ayrı kaynaktan geliyor ve `m` sheet ömrü boyunca değişmediği için
/// koşullu `watch` burada güvenli: savaş raporunda `battles` kaydı, diğerlerinde mesaj
/// gövdesi. İkisi de bu ağaçta zaten izleniyor, ek istek doğurmuyor.
class _SeferDugmeleri extends ConsumerWidget {
  const _SeferDugmeleri({required this.m, required this.onDone});

  final MessageRow m;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);

    MwReportCoord? origin;
    MwReportCoord? target;
    if (m.battleId != null) {
      final r = ref.watch(battleProvider(m.battleId!)).value;
      origin = r?.origin;
      target = r?.target;
    } else {
      final body = ref.watch(messageBodyProvider(m.id)).value;
      final rota = body?['route'];
      if (rota is Map) {
        origin = BattleReport.reportCoord(rota['origin']);
        target = BattleReport.reportCoord(rota['target']);
      }
    }

    /* ⚠️ Hangi ucun düşman olduğu `message_rules.dart` · `reportEnemyCoord`ta ve saf:
       savunma raporlarında hedef `origin`, yani düğme KARŞI SALDIRI açıyor. */
    final dusman = reportEnemyCoord(m.kind, m.side, origin, target);
    if (dusman == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Divider(height: 1, color: c.border),
          const SizedBox(height: 10),
          Row(
            children: [
              for (final r in kReportMissions) ...[
                /* ⚠️ Sefer formunu BURADA açmıyoruz, Dünya ekranına gidiyoruz — web'le aynı
                   yol ve aynı gerekçe: rapor tarihsel bir kayıt, koordinatın sahibi o günden
                   beri değişmiş olabilir. Dünya hedef künyesini TAZE listeden çözüyor ve
                   oyuncu kime saldırdığını görüyor. */
                _SeferDugmesi(
                  icon: r.icon,
                  label: r.label,
                  onTap: () {
                    onDone();
                    context.go(
                      '/world/${dusman.k}/${dusman.d}'
                      '?s=${dusman.s}&m=${r.type}',
                    );
                  },
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _SeferDugmesi extends StatelessWidget {
  const _SeferDugmesi({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final String icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    // ⚠️ İkonun YANINDA etiket var: web'de düğme `title` ile açıklanıyor ama dokunmatikte
    //    üzerine gelme diye bir şey yok ve çıplak bir ikon "bu ne yapar" sorusunu bırakırdı.
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            MwIcon(folder: 'missions', id: icon, size: 22),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(fontSize: 13, color: c.muted)),
          ],
        ),
      ),
    );
  }
}

/// ⭐⭐ FAVORİ YILDIZI (kullanıcı, 2026-08-19): *"bir raporu açıp gösterdikten sonra bu raporun
/// bir köşesine favorileme butonu koyalım… Yine aynı görüntüleme sayfasından favori
/// kaldırılabilsin."*
///
/// ⚠️⚠️ Durum **yerel olarak da tutuluyor** (`_favori`). Yalnız `m.favorite`e baksaydık: sheet
/// açılırken satırın bir KOPYASI alınıyor ve liste tazelenene kadar o kopya değişmiyor —
/// yıldıza basan oyuncu hiçbir şey olmadığını görürdü. İyimser durum + arkada istek, bu
/// depodaki diğer iyimser güncellemelerle aynı kalıp.
///
/// ⚠️ Hata olursa durum **geri alınıyor**: yıldızın yalan söylemesi, favorinin kaydolmamasından
/// daha kötü — oyuncu kaydettiğini sanıp bir daha bakmaz.
class _FavoriDugmesi extends ConsumerStatefulWidget {
  const _FavoriDugmesi({required this.m});

  final MessageRow m;

  @override
  ConsumerState<_FavoriDugmesi> createState() => _FavoriDugmesiState();
}

class _FavoriDugmesiState extends ConsumerState<_FavoriDugmesi> {
  late bool _favori = widget.m.favorite;
  bool _busy = false;

  Future<void> _degistir() async {
    final hedef = !_favori;
    setState(() {
      _favori = hedef;
      _busy = true;
    });
    try {
      await ref
          .read(messagesActionsProvider)
          .setFavorite(widget.m.id, favorite: hedef);
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _favori = !hedef);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return IconButton(
      onPressed: _busy ? null : () => unawaited(_degistir()),
      tooltip: _favori ? 'Favorilerden çıkar' : 'Favorilere ekle',
      visualDensity: VisualDensity.compact,
      icon: Icon(
        _favori ? Icons.star : Icons.star_border,
        size: 22,
        color: _favori ? c.gold : c.muted,
      ),
    );
  }
}

/// Savaş dışı rapor — gövde ayrı çekiliyor ve türüne göre dağıtılıyor.
class _PlainDetail extends ConsumerWidget {
  const _PlainDetail({required this.m, required this.onDone});

  final MessageRow m;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    return ref
        .watch(messageBodyProvider(m.id))
        .when(
          loading: () => Text(
            'Yükleniyor…',
            style: TextStyle(fontSize: 12, color: c.muted),
          ),
          error: (_, _) => const MwErrorBox('Mesaj okunamadı.'),
          data: (body) {
            final rota = body['route'];
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                /* ⚠️ Güzergâh TÜM savaş dışı raporlarda ve TEK yerde — gövde tipine göre
                   tekrarlanmıyor. Savaş raporu kendi koordinatını `battles` kaydından ayrıca
                   alıyor (eski kayıtlarda `route` yok) ve orada degrade ediyor. */
                if (rota is Map)
                  MwRouteLine(
                    origin: BattleReport.reportCoord(rota['origin']),
                    target: BattleReport.reportCoord(rota['target']),
                    onNavigate: onDone,
                  ),
                _body(context, ref, body),
              ],
            );
          },
        );
  }

  Widget _body(BuildContext context, WidgetRef ref, Map<String, dynamic> body) {
    if (m.kind == 'spy_report') {
      return m.side == 'target'
          ? _SpyDefenseBody(body: body)
          : _SpyBody(body: body);
    }
    if (m.kind == 'alliance_invite' || m.kind == 'alliance_application') {
      return _AllianceRequestBody(m: m, body: body, onDone: onDone);
    }
    if (m.kind == 'alliance_message') {
      return _AllianceMessageBody(body: body);
    }

    /* ⭐ SİSTEM DUYURUSU — yöneticiden gelen bildirim.
     *
     * ⚠️⚠️ **KOŞUL `kind` DEĞİL `text`.** `kind = 'system'` zaten kullanımda: ittifaktan
     * çıkarılma, liderlik devri, mağara girişinin iptali… Bu satırlar gövdelerinde metin
     * taşımıyor (`{allianceId, reason}` gibi yapısal alanlar taşıyorlar) ve türe bakan bir
     * koşul hepsini BOŞ bir kutuya çevirirdi. Metni olan buraya girer, olmayan aşağıdaki
     * genel gövdeye devam eder.
     *
     * ⚠️ Gönderen **yazılmıyor** (kullanıcı şartı: *"sistem tarafından gönderilmiş
     * gözükürler"*). Hangi yöneticinin yazdığı `audit_log`'ta duruyor.
     *
     * ⚠️ Metin ham yazılıyor — Flutter zaten biçimlendirme yorumlamıyor, yani duyuruya
     * gömülü bir işaretleme metin olarak görünür. */
    final metin = body['text'];
    if (m.kind == 'system' && metin is String && metin.trim().isNotEmpty) {
      final c = MwColors.of(context);
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: c.raised,
          border: Border.all(color: c.border),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(metin, style: const TextStyle(fontSize: 13)),
      );
    }

    return _GeneralBody(m: m, body: body);
  }
}

/// Dönüş · nakliye · destek · şehir kurma · yapısal sistem satırı.
class _GeneralBody extends ConsumerWidget {
  const _GeneralBody({required this.m, required this.body});

  final MessageRow m;
  final Map<String, dynamic> body;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final sozluk = ref.watch(reportNamesProvider).value;
    String adOf(String id) => sozluk?.names[id] ?? id;

    final koordinat = body['coordinates'];
    final birlikler = _counts(body['units']);
    final kahramanlar = (body['heroes'] as List<dynamic>? ?? const [])
        .whereType<String>()
        .toList();
    /* ⚠️ Dönüşte `loot` (getirilen ganimet), gidişte `cargo` (taşınan yük). İkisi aynı satırı
       besliyor ama etiketi farklı — sunucu hangisini yazdıysa o okunuyor. */
    final yuk = BattleReport.res(body['loot'] ?? body['cargo']);
    final gerekce = foundCityReason(body['reason']);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (koordinat is Map)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              'Koordinat: ${koordinat['k']}:${koordinat['d']}:${koordinat['s']}',
              style: const TextStyle(
                fontSize: 13,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
          ),

        if (birlikler.isNotEmpty)
          MwReportSection(
            title: 'Birlikler',
            child: MwUnitChips(
              units: birlikler,
              nameOf: adOf,
              order: sozluk?.order ?? const [],
            ),
          ),

        /* ⭐ Kahramanlar (kullanıcı, 2026-08-03): rapor yalnız birimleri yazıyordu — «9 casus
           kuş» görünüyor, kahramandan hiç söz edilmiyordu. Ayrı bölüm, çünkü kahraman bir
           "birim adedi" değil.
           ⚠️ Burada yalnız AD var (sunucu seviye göndermiyor) → kart seviye 0 yazmasın diye
           `MwHeroCard` yerine sade bir etiket. */
        if (kahramanlar.isNotEmpty)
          MwReportSection(
            title: 'Kahraman',
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final ad in kahramanlar)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: c.raised,
                      border: Border.all(color: c.border),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const MwIcon(folder: 'hero', id: 'kahraman', size: 28),
                        const SizedBox(width: 6),
                        Text(
                          ad,
                          style: TextStyle(fontSize: 12, color: c.warning),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),

        /* ⭐ TAŞINAN KAYNAK HEP YAZILIR (kullanıcı, 2026-08-07) — sıfır olsa bile. Eskiden
           koşul `gold > 0 || food > 0` idi ve kaynak götürmeyen bir destek raporunda satır
           HİÇ çıkmıyordu: oyuncu "kaynak da göndermiş miydim?" sorusuna raporda cevap
           bulamıyordu.
           ⚠️ Koşul artık ALANIN VARLIĞI: kargo taşımayan gövdeler (ittifak daveti, sistem
           duyurusu) yine hiçbir şey çizmiyor — onlarda «0 altın 0 yemek» anlamsız olurdu. */
        if (yuk != null)
          MwResPair(
            label: m.kind == 'return_report' ? 'Getirilen:' : 'Taşınan:',
            gold: yuk.gold,
            food: yuk.food,
          ),

        if (gerekce != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              gerekce,
              style: TextStyle(fontSize: 13, color: c.danger),
            ),
          ),
      ],
    );
  }
}

class _AllianceMessageBody extends StatelessWidget {
  const _AllianceMessageBody({required this.body});

  final Map<String, dynamic> body;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'Gönderen: ${body['from'] ?? ''}',
          style: TextStyle(fontSize: 11, color: c.muted),
        ),
        const SizedBox(height: 4),
        // ⚠️ Oyuncunun yazdığı metin → gövde fontu, Cinzel DEĞİL (`mwDisplayStyle` kuralı).
        Text('${body['text'] ?? ''}', style: const TextStyle(fontSize: 13)),
      ],
    );
  }
}

/// ⭐ İTTİFAK DAVETİ / BAŞVURUSU — mesaj kutusunda Kabul/Red (orijinal t=8/9 akışı).
///
/// Karar `alliance_invites` durum makinesine gidiyor; istek çoktan sonuçlandıysa sunucu 409
/// dönüyor ve hata kutusunda görünüyor. Davet: kabul eden BEN katılırım. Başvuru: ben
/// (yönetici) başvuranı kabul ederim.
///
/// ⚠️ Düğmeler gövdenin İÇİNDE (sheet'in altında değil): bunlar raporun **konusuyla** ilgili
/// eylemler, ekran değiştiren eylemler değil.
class _AllianceRequestBody extends ConsumerStatefulWidget {
  const _AllianceRequestBody({
    required this.m,
    required this.body,
    required this.onDone,
  });

  final MessageRow m;
  final Map<String, dynamic> body;
  final VoidCallback onDone;

  @override
  ConsumerState<_AllianceRequestBody> createState() =>
      _AllianceRequestBodyState();
}

class _AllianceRequestBodyState extends ConsumerState<_AllianceRequestBody> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final b = widget.body;
    final davet = widget.m.kind == 'alliance_invite';
    final inviteId = (b['inviteId'] as num?)?.toInt() ?? 0;
    final kim = '${b['by'] ?? ''}';
    final ittifak = '${b['allianceName'] ?? ''}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          davet
              ? '$kim seni $ittifak ittifağına davet etti.'
              : '$kim, $ittifak ittifağına başvuru gönderdi.',
          style: const TextStyle(fontSize: 13),
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          MwErrorBox(_error!),
        ],
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: MwButton(
                label: 'Kabul',
                busy: _busy,
                onTap: inviteId <= 0 ? null : () => _decide(inviteId, true),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: MwButton(
                label: 'Red',
                kind: MwButtonKind.danger,
                busy: _busy,
                onTap: inviteId <= 0 ? null : () => _decide(inviteId, false),
              ),
            ),
          ],
        ),
      ],
    );
  }

  /// ⭐ Karar verilince sheet KENDİLİĞİNDEN kapanıyor (kullanıcı, 2026-07-30) — sonuç zaten
  /// listede ve İttifak ekranında görünür, «İşlendi.» yazısına bakakalmak yok.
  Future<void> _decide(int inviteId, bool accept) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(messagesActionsProvider)
          .decideInvite(inviteId, accept: accept);
      await mwTapOk();
      if (mounted) widget.onDone();
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

/// ⭐ CASUSLUK ÖNLEME RAPORU (savunan tarafı) — alanları gönderen raporundan farklı:
/// `birdsShot` / `leakedLevel`. Savunan HER casuslukta bu raporu alıyor (2026-07-30).
///
/// ⚠️ `birdsBlocked` 2026-08-09'da KALKTI (engelleme diye bir sonuç kalmadı). Eski raporlarda
/// alan hâlâ duruyor; okunmadığı için sorun çıkarmıyor.
class _SpyDefenseBody extends StatelessWidget {
  const _SpyDefenseBody({required this.body});

  final Map<String, dynamic> body;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final gonderilen = (body['birdsSent'] as num?)?.toInt() ?? 0;
    final vurulan = (body['birdsShot'] as num?)?.toInt() ?? 0;
    final sizan = body['leakedLevel'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'Şehrinin üstünde ${mwNumber(gonderilen)} casus kuş uçtu'
          '${vurulan > 0 ? ' · ${mwNumber(vurulan)} tanesi vuruldu' : ''}',
          style: TextStyle(fontSize: 12, color: c.muted),
        ),
        const SizedBox(height: 8),
        if (sizan is String)
          _Notice(
            color: c.danger,
            text: 'Rakip bilgi SIZDIRDI: ${leakLabel(sizan)}.',
          )
        else
          /* ⚠️ **ESKİ RAPORLARIN DALI.** 2026-08-11'den beri kasa her hâlükârda sızıyor
             (`mission.handlers.ts`), yani `leakedLevel` asla null gelmiyor ve bu kutu yeni
             raporlarda HİÇ çizilmiyor. Silmedik: o tarihten önceki raporlar için doğru cümle
             hâlâ bu. */
          _Notice(
            color: c.success,
            text: 'Hiçbir bilgi sızmadı — casus kuşların hepsi vuruldu.',
          ),
      ],
    );
  }
}

/// ⭐ CASUSLUK RAPORU — **kademeli**. Doküman: fark büyüdükçe daha çok bilgi gelir; bu yüzden
/// **eksik bölümler gösterilmiyor** (boş kutu değil, hiç yok).
///
/// ⛔ «Daha fazla bilgi için daha çok kuş gönder / 8 kuş = +3 seviye» ipucu 2026-08-11'de
/// KALDIRILDI ve **yeniden eklenmemeli**: 2026-08-09'da `diff` de aynı gerekçeyle gövdeden
/// çıkarılmıştı. Oyuncu kendi seviyesini ve gönderdiği kuşu bildiği için formülü ekrana
/// yazmak `rakip = benim + log2(kuş) − fark` denklemini çözülebilir kılıyor, yani rakibin
/// casusluk seviyesini bedava veriyor.
class _SpyBody extends ConsumerWidget {
  const _SpyBody({required this.body});

  final Map<String, dynamic> body;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final sozluk = ref.watch(reportNamesProvider).value;
    String adOf(String id) => sozluk?.names[id] ?? id;
    final sira = sozluk?.order ?? const <String>[];

    final intel = body['intel'] as Map<String, dynamic>? ?? const {};
    final kaynak = BattleReport.res(intel['resources']);
    final eko = intel['economy'];
    final toplam = intel['totals'];
    final savascilar = _counts(intel['warriors']);
    final savunma = _counts(intel['defenses']);
    final sTipleri = _strings(intel['warriorTypes']);
    final dTipleri = _strings(intel['defenseTypes']);
    final teknikler = _counts(intel['techs']);
    final yapilar = _counts(intel['structures']);
    final kahramanlar = (intel['heroes'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList();
    final kahramanSayisi = (intel['heroCount'] as num?)?.toInt();

    final gonderilen = (body['birdsSent'] as num?)?.toInt() ?? 0;
    final kayip = (body['birdsLost'] as num?)?.toInt() ?? 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '${mwNumber(gonderilen)} casus kuş gönderildi'
          '${kayip > 0 ? ' · ${mwNumber(kayip)} tanesi vuruldu' : ' · kayıp yok'}',
          style: TextStyle(fontSize: 12, color: c.muted),
        ),
        const SizedBox(height: 10),

        /* ⚠️ **ESKİ RAPORLARIN DALI.** 2026-08-11'den beri `level` asla null gelmiyor:
           kuşların hepsi vurulsa bile kasa görülüyor, yani "bilgi alınamadı" diye bir sonuç
           kalmadı (kullanıcı kararı). Dal yalnız o tarihten ÖNCEKİ raporlar doğru okunsun
           diye duruyor. */
        if (body['level'] == null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              'Bilgi alınamadı.',
              style: TextStyle(fontSize: 13, color: c.danger),
            ),
          ),

        if (kaynak != null)
          MwReportSection(
            title: 'Kaynak',
            child: MwResPair(label: '', gold: kaynak.gold, food: kaynak.food),
          ),

        if (eko is Map)
          MwReportSection(
            title: 'Ekonomi',
            child: _Plain(
              'Maden ${eko['mine'] ?? 0} · Çiftlik ${eko['farm'] ?? 0}',
            ),
          ),

        if (toplam is Map)
          MwReportSection(
            title: 'Ordu büyüklüğü',
            child: _Plain(
              '${mwNumber((toplam['warriors'] as num?)?.toInt() ?? 0)} savaşçı · '
              '${mwNumber((toplam['defenses'] as num?)?.toInt() ?? 0)} savunma ünitesi',
            ),
          ),

        // ⭐ Kademe: sayılar varsa kartlar, yoksa yalnız TİPLER, o da yoksa bölüm hiç yok.
        if (savascilar.isNotEmpty)
          MwReportSection(
            title: 'Savaşçılar',
            child: MwUnitChips(units: savascilar, nameOf: adOf, order: sira),
          )
        else if (sTipleri.isNotEmpty)
          MwReportSection(
            title: 'Savaşçı tipleri',
            child: _Plain(sTipleri.map(adOf).join(' · ')),
          ),

        if (savunma.isNotEmpty)
          MwReportSection(
            title: 'Savunma',
            child: MwUnitChips(
              units: savunma,
              nameOf: adOf,
              order: sira,
              // ⚠️ Savunma üniteleri `assets/defenses/` altında; varsayılan `units` verilseydi
              // bölüm ikonsuz çizilir ve hiçbir yerde iz bırakmazdı.
              folder: 'defenses',
            ),
          )
        else if (dTipleri.isNotEmpty)
          MwReportSection(
            title: 'Savunma tipleri',
            child: _Plain(dTipleri.map(adOf).join(' · ')),
          ),

        /* ⭐ KAHRAMANLAR (§13.11.6, kullanıcı 2026-08-07) — iki kademeye yayılıyor:
           `armyCounts`ta her kahramanın seviyesi ve dört yeteneği, bir alt kademede yalnız
           SAYI.
           ⚠️ **Kahraman YOKSA bölüm hiç çizilmiyor**: kısa bir süre «Kahraman yok» yazıldı,
           kullanıcı raporu kalabalıklaştırdığı için kaldırttı. Casusluk raporunun genel
           kuralı da bu — eksik bölüm boş kutu değil, YOK. */
        if (kahramanlar.isNotEmpty)
          MwReportSection(
            title: 'Kahramanlar',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [for (final h in kahramanlar) _SpyHeroRow(h)],
            ),
          )
        else if (kahramanSayisi != null && kahramanSayisi > 0)
          MwReportSection(
            title: 'Kahramanlar',
            child: _Plain('${mwNumber(kahramanSayisi)} kahraman'),
          ),

        if (yapilar.isNotEmpty)
          MwReportSection(
            title: 'Yapılar',
            child: _Plain(_structureText(yapilar)),
          ),

        if (teknikler.isNotEmpty)
          MwReportSection(
            title: 'Teknikler',
            child: _Plain(
              teknikler.entries
                  .map((e) => '${adOf(e.key)} ${e.value}')
                  .join(' · '),
            ),
          ),
      ],
    );
  }
}

/// ⚠️ Yapı adları elle yazılıyor, katalogtan çözülmüyor: casus raporunda **sabit beşli**
/// geliyor ve sırası anlamlı (Kale → Sur → Kalkan → Mağara → Teleport). Katalog sırası burada
/// başka bir şey söylerdi.
///
/// ⚠️ Mağaranın yalnız SEVİYESİ yazılıyor; içindeki askerler casusa GÖRÜNMEZ — mağaranın
/// bütün varlık sebebi orduyu saklamak (`mission.handlers.ts` · `gatherIntel`).
///
/// ⚠️ Teleport 0 iken YAZILMIYOR: ön şartı Kale 12 + Mimar Okulu 12 + Büyücülük 12, yani
/// oyuncuların ezici çoğunluğunda yok ve her rapora «Teleport 0» eklemek gürültü olurdu.
String _structureText(Map<String, int> s) {
  final parts = [
    'Kale ${s['castle'] ?? 0}',
    'Sur ${s['wall'] ?? 0}',
    'Büyü Kalkanı ${s['magic_shield'] ?? 0}',
    'Mağara ${s['cave'] ?? 0}',
    if ((s['teleport'] ?? 0) > 0) 'Teleport ${s['teleport']}',
  ];
  return parts.join(' · ');
}

/// Casus raporundaki kahraman satırı: ad · seviye · dört yetenek ikonu.
class _SpyHeroRow extends StatelessWidget {
  const _SpyHeroRow(this.h);

  final Map<String, dynamic> h;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final skills = h['skills'] as Map<String, dynamic>? ?? const {};
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 10,
        runSpacing: 2,
        children: [
          Text(
            '${h['name'] ?? ''}',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
          Text(
            'Seviye ${(h['level'] as num?)?.toInt() ?? 0}',
            style: TextStyle(fontSize: 11, color: c.muted),
          ),
          // ⚠️ Yetenek listesi `facts.g.dart`ten (üretilmiş): sıra ve ikon dosyaları web ile
          // aynı kaynaktan geliyor, elle yazılsaydı iki istemci ayrışabilirdi.
          for (final s in kHeroSkills)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                MwIcon(folder: 'hero', id: s.icon, size: 16),
                const SizedBox(width: 3),
                Text(
                  '${(skills[s.key] as num?)?.toInt() ?? 0}',
                  style: const TextStyle(
                    fontSize: 11,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.color, required this.text});

  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
    decoration: BoxDecoration(
      // ⚠️ Zemin, çerçeve renginin **saydam** hâli: web'deki `bg-danger/10` karşılığı ve
      // iki temada da okunur kalıyor.
      color: color.withValues(alpha: 0.12),
      border: Border.all(color: color),
      borderRadius: BorderRadius.circular(6),
    ),
    child: Text(text, style: TextStyle(fontSize: 12, color: color)),
  );
}

class _Plain extends StatelessWidget {
  const _Plain(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(
      fontSize: 13,
      fontFeatures: [FontFeature.tabularFigures()],
    ),
  );
}

/// `{dwarf: 407}` — sayı olmayan değerler eleniyor.
/// ⚠️ Sıfır adet BURADA elenmiyor, çizen tarafta eleniyor (`MwUnitChips`): "bu birim vardı ama
/// hepsi öldü" bilgisini kaybetmemek için ayrım çizim katmanında yapılıyor.
Map<String, int> _counts(Object? raw) {
  if (raw is! Map) return const {};
  return {
    for (final e in raw.entries)
      if (e.value is num) '${e.key}': (e.value as num).toInt(),
  };
}

List<String> _strings(Object? raw) =>
    (raw as List<dynamic>? ?? const []).whereType<String>().toList();
