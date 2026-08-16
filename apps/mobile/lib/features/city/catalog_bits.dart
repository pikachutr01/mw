/// ŞEHİR EKRANLARININ ORTAK PARÇALARI — maliyet satırı · süre · ön koşul · not.
///
/// ⚠️⚠️ Bu dosya bir ayıklama (2026-08-17). Parçalar `barracks_screen.dart` içinde **private**
/// duruyordu; Yapılar, Savunma ve Akademi de aynılarına ihtiyaç duyunca üç kopya çıkarmak
/// gerekecekti. Bu depoda tekrar tekrar ısırılan hata tam olarak bu: *"aynı kural iki yerde"*.
/// Özellikle `MwDuration` kritik — indirim etiketinin nasıl çizildiği bir kullanıcı
/// bildiriminden doğdu ve dört ekranda farklı davranırsa fark ancak canlıda görülür.
library;

import 'package:flutter/material.dart';

import '../../core/clock.dart';
import '../../ui/primitives.dart';
import 'catalog_model.dart';

/// Maliyet satırı: altın · yemek · süre. Birim başına ya da seviye başına, çağıran belirler.
class MwCostLine extends StatelessWidget {
  const MwCostLine({
    super.key,
    required this.gold,
    required this.food,
    required this.seconds,
    required this.baseSeconds,
  });

  final int gold;
  final int food;
  final num seconds;
  final num? baseSeconds;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Wrap(
      spacing: 12,
      runSpacing: 2,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        MwChip(icon: 'gold', text: mwNumber(gold), color: c.muted),
        MwChip(icon: 'food', text: mwNumber(food), color: c.muted),
        MwDuration(seconds: seconds, baseSeconds: baseSeconds),
      ],
    );
  }
}

/// Girilen adedin toplamı — yetmiyorsa kırmızı.
class MwTotalLine extends StatelessWidget {
  const MwTotalLine({
    super.key,
    required this.gold,
    required this.food,
    required this.seconds,
    required this.baseSeconds,
    required this.afford,
  });

  final int gold;
  final int food;
  final num seconds;
  final num? baseSeconds;
  final bool afford;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final renk = afford ? c.muted : c.danger;
    return Wrap(
      spacing: 8,
      runSpacing: 2,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text('Toplam:', style: TextStyle(fontSize: 11, color: renk)),
        MwChip(icon: 'gold', text: mwNumber(gold), color: renk),
        MwChip(icon: 'food', text: mwNumber(food), color: renk),
        MwDuration(seconds: seconds, baseSeconds: baseSeconds, color: renk),
      ],
    );
  }
}

class MwChip extends StatelessWidget {
  const MwChip({
    super.key,
    required this.icon,
    required this.text,
    required this.color,
  });

  final String icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      MwIcon(folder: 'ui', id: icon, size: 13),
      const SizedBox(width: 3),
      Text(
        text,
        style: TextStyle(
          fontSize: 11,
          color: color,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    ],
  );
}

/// ⭐ SÜRE — dünya hız çarpanı devredeyse **indirim etiketi** gibi.
///
/// ⚠️ Web'de bu, gerçek bir arızanın düzeltmesi: çarpan yalnız kuyruğa uygulanıyordu, ekrana
/// değil. Oyuncu *"geri sayım hızlanmış görünüyor ama binanın yanında yazan süre 1x hâliyle
/// duruyor"* dedi. Artık sunucu ikisini de gönderiyor ve ikisi birden gösteriliyor.
///
/// ⚠️ `baseSeconds` **yalnız farklıysa** dolu geliyor; çarpan 1'ken bu bileşen tek satır çizer.
class MwDuration extends StatelessWidget {
  const MwDuration({
    super.key,
    required this.seconds,
    required this.baseSeconds,
    this.color,
  });

  final num seconds;
  final num? baseSeconds;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final style = TextStyle(
      fontSize: 11,
      color: color ?? c.muted,
      fontFeatures: const [FontFeature.tabularFigures()],
    );

    if (baseSeconds == null || baseSeconds == seconds) {
      return Text('⏳ ${formatDuration(seconds)}', style: style);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          formatDuration(baseSeconds!),
          style: TextStyle(
            fontSize: 10,
            color: c.muted,
            decoration: TextDecoration.lineThrough,
            decorationColor: c.danger,
            decorationThickness: 2,
          ),
        ),
        Text(
          '⏳ ${formatDuration(seconds)}',
          style: style.copyWith(
            color: Theme.of(context).colorScheme.primary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

/// Kilit/uyarı notu — ön koşul ve §verify uyarılarıyla aynı ton.
class MwNote extends StatelessWidget {
  const MwNote(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(fontSize: 11, color: MwColors.of(context).warning),
  );
}

/// ⭐ KARŞILANMAYAN ÖN KOŞULLAR — kırmızı, «Gerekli: Kale 5 (3) · Mimarlık 2 (0)» biçiminde.
///
/// Parantez içindeki sayı **eldeki** seviye: oyuncu neyin eksik olduğunu değil, ne kadar
/// eksik olduğunu görmeli.
///
/// ⚠️ Boş listede `SizedBox.shrink` — çağıranların her birinde `if` yazmamak için.
class MwRequirements extends StatelessWidget {
  const MwRequirements({
    super.key,
    required this.unmet,
    required this.structures,
    required this.techs,
  });

  /// Yalnız KARŞILANMAYANLAR (`unmetFor` / `unmetRequirements` çıktısı).
  final List<NamedRequirement> unmet;
  final Map<String, int> structures;
  final Map<String, int> techs;

  @override
  Widget build(BuildContext context) {
    if (unmet.isEmpty) return const SizedBox.shrink();
    final text = unmet
        .map((r) {
          final lv = r.kind == 'building'
              ? (structures[r.id] ?? 0)
              : (techs[r.id] ?? 0);
          return '${r.name} ${r.level} ($lv)';
        })
        .join(' · ');
    return Padding(
      padding: const EdgeInsets.only(top: 3),
      child: Text(
        'Gerekli: $text',
        style: TextStyle(fontSize: 11, color: MwColors.of(context).danger),
      ),
    );
  }
}
