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
    this.pending = false,
    this.lockNote,
    this.capNote,
    this.alt = false,
    this.progress,
    this.trailingInfo,
    this.onNameTap,
    this.infoText,
  });

  final CatalogUpgradable item;

  /// `assets/<folder>/<id>.png` — yapıda `buildings`, teknikte `techs`.
  final String folder;

  final Map<String, int> structures;
  final Map<String, int> techs;
  final List<NamedRequirement> unmet;

  final bool enabled;
  final VoidCallback onUpgrade;

  /// ⭐⭐ **YALNIZ BU SATIRIN** isteği uçuşta mı (kullanıcı bildirimi, 2026-08-17).
  ///
  /// ⚠️ Kullanıcı şöyle tarif etti: *"bir butona basınca ekrandaki tüm butonlar anlık olarak
  /// bir patlama efekti veriyorlar."* Sebep, uçuştaki isteğin **tek bir ekran bayrağıyla**
  /// (`_busy`) tutulmasıydı: bayrak kalkınca listedeki HER düğme aynı anda pasife düşüyor,
  /// Material her birinde zemin geçişini animasyonla oynatıyordu — on düğme birden yanıp
  /// sönüyordu.
  ///
  /// ⭐ Artık uçuştaki istek satır bazında: yalnız basılan düğme dönen bir göstergeye
  /// çeviriliyor, diğerleri **hiç değişmiyor**. Çift gönderim koruması görsel değil mantıksal
  /// (ekran ikinci dokunuşu yutuyor), böylece koruma için ekranı titretmek gerekmiyor.
  final bool pending;

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

  /// ⭐ Künyenin AÇIKLAMA metni — üretilmiş olgulardan geliyor (`gen/facts.g.dart`).
  /// ⚠️ Web'de bu metin popover'ın ilk satırı; mobilde sheet'in. Aynı kaynak, aynı sıra.
  final String? infoText;

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
                // ⭐ Uçuştaki istek YALNIZ bu düğmede dönen bir gösterge — gerekçe `pending`de.
                SizedBox(
                  width: 64,
                  child: pending
                      ? const Center(
                          child: SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : MwSmallButton(
                          label: maxed ? '—' : 'sv ${item.level + 1}',
                          onTap: enabled ? onUpgrade : null,
                          minWidth: 64,
                        ),
                ),
              ],
            ),
            if (progress != null) ...[const SizedBox(height: 6), progress!],
          ],
        ),
      ),
    );
  }

  /// ⭐⭐ KÜNYE ARTIK WEB'İN POPOVER'IYLA BİREBİR (kullanıcı, 2026-08-19: *"bilgileri gerçek
  /// değerlerle güncelleyelim. Web ile aynı bilgileri vermeleri gerekir. Mevcut seviye
  /// bilgisinin bottom sheet de yazmasına gerek yok… en yüksek seviyeyi de burada
  /// göstermeyelim."*).
  ///
  /// Web (`City.tsx` · `BuildingInfo`) yalnız İKİ şey gösteriyor: açıklama metni ve —
  /// üreten yapılarda — saatlik üretimin şimdiki/sonraki değeri. Mobil bunlara üç şey daha
  /// ekliyordu ve üçü de kaldırıldı:
  ///
  /// ⚠️ **«Şu anki seviye»** — satırın kendisinde zaten yazıyor, sheet onu tekrar ediyordu.
  /// ⚠️ **«En yüksek seviye»** — web hiç göstermiyor; oyuncunun kararına girmiyor.
  /// ⚠️ **Ön koşullar** — kaldırıldı ama bilgi KAYBOLMADI: karşılanmayan koşullar satırın
  ///    kendisinde «Gerekli: …» olarak yazıyor (`catalog_bits.dart`). Sheet'te ikinci bir
  ///    kopya tutmak, ikisinin ayrışabileceği bir yer daha açardı.
  ///
  /// ⚠️ Üretim satırlarına **birim adı eklendi** (`altın`/`yemek`). Eskiden yalnız «/ saat»
  /// yazıyordu ve Çiftlik ile Maden künyeleri birbirinden ayırt edilemiyordu — web bu ayrımı
  /// baştan beri yapıyor.
  ///
  /// ⚠️ Rakamlar SUNUCUDAN (`item.production`), istemcide hesaplanmıyor: oranlar panelden
  /// dünya başına değiştirilebiliyor ve ikinci bir hesap yeri, yönetici oranı değiştirdiği
  /// anda ekranın yalan söylemesi olurdu (web'de aynı kural yazılı).
  Future<void> _showInfo(BuildContext context) async {
    final c = MwColors.of(context);
    final p = item.production;
    final birim = item.id == 'farm' ? 'yemek' : 'altın';

    await mwInfoSheet(
      context,
      title: item.name,
      lines: [
        // ⭐ Açıklama EN ÜSTTE — web'deki popover sırası (metin, sonra sayılar).
        if (infoText != null) Text(infoText!, style: TextStyle(color: c.muted)),
        // ⭐ Üretim önizlemesi — yalnız Çiftlik ve Maden'de dolu geliyor.
        if (p != null) ...[
          if (infoText != null) ...[
            const SizedBox(height: 12),
            Divider(height: 1, color: c.border),
            const SizedBox(height: 10),
          ],
          _UretimSatiri(
            label: 'Şu an (sv ${item.level})',
            value: '${mwNumber(p.perHour)} $birim / saat',
          ),
          // ⚠️ Tavandaki yapıda "sonraki seviye" YOK — satırı hiç çizme, «—» yazma
          //    (web'deki aynı karar).
          if (p.nextPerHour != null) ...[
            const SizedBox(height: 4),
            _UretimSatiri(
              label: 'Sonraki seviye (sv ${item.level + 1})',
              value: '${mwNumber(p.nextPerHour!)} $birim / saat',
              vurgu: true,
            ),
          ],
        ],
      ],
    );
  }
}

/// Künyedeki etiket/değer satırı — web'deki `PopoverRow` karşılığı.
class _UretimSatiri extends StatelessWidget {
  const _UretimSatiri({
    required this.label,
    required this.value,
    this.vurgu = false,
  });

  final String label;
  final String value;

  /// Sonraki seviye satırı vurgulu: oyuncunun karar verdiği sayı o.
  final bool vurgu;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(fontSize: 13, color: c.muted)),
        Text(
          value,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: vurgu ? Theme.of(context).colorScheme.primary : null,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}
