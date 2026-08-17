/// ⭐⭐ HAREKET DETAYI — hareketin künyesi ve **iptal**.
///
/// Web'de bu bir modal (`MovementModal`); mobilde bottom sheet. Gerekçe `ui/native.dart`ta:
/// telefonda başparmak ekranın ALTINDA ve ortaya çıkan bir diyaloğun düğmesine uzanmak gerekiyor.
///
/// ⭐ İptal geri alınamaz ve bir bedeli var (ordu gittiği yol kadar geri döner) → ikinci bir
/// onaydan geçiyor (`mwConfirmSheet`). Bedel onay metninde AÇIKÇA yazıyor; oyuncu «iptal =
/// anında geri geldi» sanmamalı.
///
/// ⚠️ Onay sheet'i detay sheet'inin ÜSTÜNE açılıyor ve onaydan sonra ikisi birden kapanıyor:
/// arkada iptal edilmiş bir görevin detayını açık bırakmak, oyuncuya hâlâ iptal edilebilir bir
/// şey varmış gibi görünürdü.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'movement.dart';
import 'movement_rules.dart';

Future<void> showMovementSheet(BuildContext context, Movement m) =>
    mwSheet<void>(
      context,
      title: titleOf(m),
      child: _Detail(m: m),
    );

class _Detail extends ConsumerStatefulWidget {
  const _Detail({required this.m});

  final Movement m;

  @override
  ConsumerState<_Detail> createState() => _DetailState();
}

class _DetailState extends ConsumerState<_Detail> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final m = widget.m;
    final c = MwColors.of(context);
    final clock = ref.watch(clockProvider);
    // Saniyelik sayaç — sheet açıkken varış süresi akmaya devam etmeli.
    ref.watch(tickProvider);

    /// ⚠️ Adlar hareketin **kendi şehrinden** okunuyor, aktif şehirden değil: şerit tüm
    /// şehirlerin hareketlerini gösteriyor ve oyuncu başka bir şehrin ordusuna dokunabilir.
    final names = ref.watch(catalogNamesProvider(m.cityId)).value ?? const {};
    final ordu = describeUnits(m.units, (id) => names[id] ?? id, mwNumber);
    final kahramanlar = describeHeroes(m.heroes);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            MwIcon(folder: 'missions', id: m.icon, size: 52),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    titleOf(m),
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    // ⚠️ «varıyor»: süre dolduğunda sunucu görevi henüz işlememiş olabilir.
                    // «0 sn» yazmak bitmiş bir şeyin donduğunu düşündürürdü.
                    'Varış: ${clock.remaining(m.executeAt) ?? 'varıyor'}',
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

        _Row(
          label: 'Kaynak',
          value: coordText(m.origin),
          extra: m.originPlayer,
          tnum: true,
        ),
        _Row(
          label: 'Hedef',
          value: coordText(m.target),
          extra: m.targetPlayer,
          tnum: true,
        ),
        // ⭐ İÇERİK HER harekette açık (kullanıcı, 2026-07-31): gelen saldırıda da hangi
        // birimden kaç tane geldiği görünür. Gizli olan yalnız görevin TÜRÜ (§13.6.5 maskesi).
        if (ordu.isNotEmpty) _Row(label: 'Ordu', value: ordu),
        // ⭐ Kahraman ad + seviye; yetenek dağılımı sunucuda bilerek verilmiyor.
        if (kahramanlar.isNotEmpty)
          _Row(label: 'Kahraman', value: kahramanlar, color: c.warning),

        /// ⚠️ Kargo satırı **`null` ise hiç çizilmiyor** ve bu bir gizlilik sınırı: saldırı ve
        /// casusluk gidişinde payload'da kargo YOK, yani savunan savaştan önce kaynak bilgisi
        /// görmüyor. `(0, 0)` ile `null`u aynı saymak o sınırı istemcide delerdi.
        if (m.cargo != null && (m.cargo!.gold > 0 || m.cargo!.food > 0)) ...[
          const SizedBox(height: 6),
          Row(
            children: [
              SizedBox(
                width: 84,
                child: Text('Taşınan', style: TextStyle(color: c.muted)),
              ),
              MwResource(kind: 'gold', amount: m.cargo!.gold),
              const SizedBox(width: 14),
              MwResource(kind: 'food', amount: m.cargo!.food),
            ],
          ),
        ],

        if (_error != null) ...[
          const SizedBox(height: 12),
          MwErrorBox(_error!),
        ],

        // ⚠️ Bilgi kutuları («sana doğru geliyor», «ganimet kasaya eklenecek») BİLEREK yok —
        // web'de ikisi de kullanıcı isteğiyle kaldırıldı: biri zaten görünen bilgiyi tekrar
        // ediyordu, diğeri nakliye dönüşünde düpedüz yanlıştı (yük alıcıya bırakılmış oluyor).
        if (m.canCancel) ...[
          const SizedBox(height: 16),
          MwButton(
            label: 'Görevi iptal et',
            kind: MwButtonKind.danger,
            busy: _busy,
            onTap: _cancel,
          ),
        ] else if (m.direction == 'out') ...[
          const SizedBox(height: 14),
          Text(
            'Görev işlenmeye başladı, artık iptal edilemez.',
            style: TextStyle(fontSize: 12, color: c.muted),
          ),
        ],
      ],
    );
  }

  Future<void> _cancel() async {
    final m = widget.m;
    final ok = await mwConfirmSheet(
      context,
      title: '${titleOf(m)} iptal edilsin mi?',
      // ⚠️ RAKAM YOK (kullanıcı, 2026-08-03): gerçek dönüş süresini sunucu ONAY ANINDA
      // hesaplıyor ve ekranda gösterilen bir tahmin kaçınılmaz olarak ondan ayrışıyor.
      body: 'Ordu geri çağrılacak ve gittiği yol kadar sürede şehre dönecek.',
      confirmLabel: 'Orduyu geri çağır',
    );
    if (!ok || !mounted) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(missionsProvider).cancel(m.id);
      // Onay titreşimi `mwConfirmSheet`te zaten verildi; burada ikinciyi eklemek
      // "iki kez oldu" hissi yaratırdı.
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

/// «etiket · değer» satırı. ⚠️ Etiket sabit genişlikte: değerler farklı uzunlukta ve sola
/// yaslı bir sütun olmadan satırlar birbirinden kayıyor.
class _Row extends StatelessWidget {
  const _Row({
    required this.label,
    required this.value,
    this.extra,
    this.color,
    this.tnum = false,
  });

  final String label;
  final String value;

  /// Oyuncu adı — koordinatın yanına parantez içinde.
  final String? extra;
  final Color? color;
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
            width: 84,
            child: Text(label, style: TextStyle(color: c.muted)),
          ),
          Expanded(
            child: Text(
              extra == null ? value : '$value ($extra)',
              style: TextStyle(
                color: color,
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
