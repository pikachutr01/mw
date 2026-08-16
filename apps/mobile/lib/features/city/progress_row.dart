/// ⭐ SATIR İÇİ İLERLEME — süren bir yapı/teknik/yapı-savunma emrinin geri sayımı.
///
/// Web'deki `ProgressRow` karşılığı. Üretim bandından (`ProductionBand`) FARKLI ve bu ayrım
/// bilinçli: bant **adetli** emirleri sırayla gösteriyor (tek bant, sıralanabilir), bu satır ise
/// **seviye ilerleten** tek bir emri kendi satırında gösteriyor. İkisi paralel akıyor (§13.21.3),
/// yani aynı ekranda ikisi birden görünebilir.
///
/// ⚠️ Çıpa **oyun saati**: `startedAt`/`finishAt` oyun saatinde geliyor. Gerçek saatle
/// çizilirse dünyanın duraklama toplamı kadar sapar ve çubuk yazının yanında yanlış yerde durur
/// (web'de tam olarak bu hata yaşandı).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../ui/primitives.dart';

class ProgressRow extends ConsumerWidget {
  const ProgressRow({
    super.key,
    required this.startedAt,
    required this.finishAt,
    required this.label,
    this.onCancel,
    this.busy = false,
  });

  final String startedAt;
  final String finishAt;

  /// «seviye 12» ya da «seviye 3 · Karakol» gibi.
  final String label;

  /// `null` → iptal edilemez (sur onarımı, mağara onarımı).
  final VoidCallback? onCancel;
  final bool busy;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final clock = ref.watch(clockProvider);
    // Saniyelik sayaç — geri sayımı gösteren HER ekran aynı akışı dinliyor.
    ref.watch(tickProvider);
    final now = clock.gameNow();

    final start = DateTime.tryParse(startedAt)?.millisecondsSinceEpoch;
    final end = DateTime.tryParse(finishAt)?.millisecondsSinceEpoch;
    final pct = (start == null || end == null || end <= start)
        ? 0.0
        : ((now - start) / (end - start)).clamp(0.0, 1.0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: c.border)),
          ),
          padding: const EdgeInsets.only(top: 6, bottom: 4),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(fontSize: 11, color: c.muted),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                // ⚠️ «birazdan biter…»: süre dolduğunda sunucu emri henüz işlememiş olabilir.
                // «0:00» yazmak, oyuncuya bitmiş bir şeyin donduğunu düşündürüyordu.
                clock.remaining(finishAt, now: now) ?? 'birazdan biter…',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: c.warning,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              if (onCancel != null) ...[
                const SizedBox(width: 8),
                MwSmallButton(
                  label: 'İptal',
                  onTap: busy ? null : onCancel,
                  kind: MwButtonKind.danger,
                  minWidth: 52,
                ),
              ],
            ],
          ),
        ),
        MwBar(value: pct),
      ],
    );
  }
}
