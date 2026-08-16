/// ⭐ SEVİYE İLERLETME SATIRI — Yapılar ve Akademi ortak kullanıyor.
///
/// İkisi de aynı şeyi soruyor: *"şu an sv N, sv N+1'e çıkayım mı?"* Alanları, kapıları ve
/// düğmesi birebir aynı; ayrıştıkları tek yer hangi kilidin geçerli olduğu ve o da dışarıdan
/// **hazır metin** olarak geliyor (`lockNote`). Satırı iki kez yazmak, ön koşul gösterimini ya
/// da §verify uyarısını bir ekranda düzeltip diğerinde unutmak demekti.
///
/// ⚠️ Kapı kararı BURADA VERİLMİYOR: `enabled` dışarıdan geliyor ve `train_rules.dart`taki saf
/// fonksiyonlardan hesaplanıyor. Widget'ın içine koşul yazmak, o koşulu sınanamaz yapardı.
///
/// ⭐ NATIVE: satıra **uzun basmak** künyeyi bottom sheet olarak açıyor (`mwInfoSheet`).
/// Web'de bu bir tooltip; telefonda tooltip yok, parmak üstünde durmuyor.
library;

import 'package:flutter/material.dart';

import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'catalog_bits.dart';
import 'catalog_model.dart';

class UpgradeRow extends StatelessWidget {
  const UpgradeRow({
    super.key,
    required this.item,
    required this.folder,
    required this.structures,
    required this.techs,
    required this.unmet,
    required this.enabled,
    required this.onUpgrade,
    this.lockNote,
    this.capNote,
    this.alt = false,
    this.progress,
    this.trailingInfo,
    this.onNameTap,
  });

  final CatalogUpgradable item;

  /// `assets/<folder>/<id>.png` — yapıda `buildings`, teknikte `techs`.
  final String folder;

  final Map<String, int> structures;
  final Map<String, int> techs;
  final List<NamedRequirement> unmet;

  final bool enabled;
  final VoidCallback onUpgrade;

  /// Karşılıklı kilit gibi, satırın TAMAMINI kapatan sebep. Yazılıysa gösterilir.
  final String? lockNote;

  /// §verify tavanı uyarısı.
  final String? capNote;

  final bool alt;

  /// Süren emrin geri sayımı — satırın ALTINDA çizilir.
  final Widget? progress;

  /// Adın sağında küçük bir bilgi (mağarada «12 / 40 alan» gibi).
  final Widget? trailingInfo;

  /// Ada dokunulunca — bugün yalnız Mağara kullanıyor (ileride doldurma sheet'i).
  final VoidCallback? onNameTap;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final maxed = item.maxed;

    return InkWell(
      // ⭐ Uzun basma → künye. Kısa dokunma bilerek BOŞ: satırın gerçek eylemi sağdaki düğme
      // ve satırın her yerini ona bağlamak yanlışlıkla yükseltmeye davet ederdi.
      onLongPress: () => _showInfo(context),
      child: Container(
        color: alt ? c.raised.withValues(alpha: 0.35) : null,
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                MwIcon(folder: folder, id: item.id, size: 36),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: GestureDetector(
                              onTap: onNameTap,
                              child: Text.rich(
                                TextSpan(
                                  children: [
                                    TextSpan(
                                      text: item.name,
                                      style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                        // Tıklanabilir ad altı çizili — dokunulabilir olduğu
                                        // görünmeli, yoksa kimse denemez.
                                        decoration: onNameTap == null
                                            ? null
                                            : TextDecoration.underline,
                                      ),
                                    ),
                                    TextSpan(
                                      text: '  sv ${item.level}',
                                      style: TextStyle(
                                        color: Theme.of(
                                          context,
                                        ).colorScheme.primary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          if (trailingInfo != null) ...[
                            const SizedBox(width: 8),
                            trailingInfo!,
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      // ⚠️ Tavandaki yapıda maliyet YOK (sunucu göndermiyor) → satır çizilmez.
                      if (!maxed &&
                          item.nextGold != null &&
                          item.nextFood != null)
                        MwCostLine(
                          gold: item.nextGold!,
                          food: item.nextFood!,
                          seconds: item.nextSeconds ?? 0,
                          baseSeconds: item.baseSeconds,
                        ),
                      MwRequirements(
                        unmet: unmet,
                        structures: structures,
                        techs: techs,
                      ),
                      if (capNote != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 3),
                          child: MwNote(capNote!),
                        ),
                      if (lockNote != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 3),
                          child: MwNote(lockNote!),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                // ⭐ Tavandaki yapıda düğme yerine «—»: pasif bir «sv 31» düğmesi, oyuncuya
                // hâlâ ilerleyebilecekmiş gibi görünür.
                MwSmallButton(
                  label: maxed ? '—' : 'sv ${item.level + 1}',
                  onTap: enabled ? onUpgrade : null,
                  minWidth: 64,
                ),
              ],
            ),
            if (progress != null) ...[const SizedBox(height: 6), progress!],
          ],
        ),
      ),
    );
  }

  Future<void> _showInfo(BuildContext context) async {
    final c = MwColors.of(context);
    await mwInfoSheet(
      context,
      title: item.name,
      lines: [
        Text('Şu anki seviye: ${item.level}', style: TextStyle(color: c.muted)),
        if (item.maxLevel != null)
          Text(
            'En yüksek seviye: ${item.maxLevel}',
            style: TextStyle(color: c.muted),
          ),
        // ⭐ Üretim önizlemesi — yalnız Çiftlik ve Maden'de dolu geliyor.
        if (item.production != null) ...[
          const SizedBox(height: 8),
          Text(
            'Üretim: ${mwNumber(item.production!.perHour)} / saat',
            style: TextStyle(color: c.muted),
          ),
          if (item.production!.nextPerHour != null)
            Text(
              'Sonraki seviyede: ${mwNumber(item.production!.nextPerHour!)} / saat',
              style: TextStyle(color: Theme.of(context).colorScheme.primary),
            ),
        ],
        if (item.requirements.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text('Ön koşullar', style: TextStyle(fontWeight: FontWeight.w600)),
          for (final r in item.requirements)
            Text(
              '${r.name} ${r.level}'
              '  (${r.kind == 'building' ? (structures[r.id] ?? 0) : (techs[r.id] ?? 0)})',
              style: TextStyle(color: c.muted),
            ),
        ],
      ],
    );
  }
}
