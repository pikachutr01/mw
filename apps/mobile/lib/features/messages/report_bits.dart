/// Rapor gövdelerinin ortak parçaları — güzergâh · bölüm başlığı · birim kartları ·
/// kahraman kartları.
///
/// ⭐ Ayrı dosyada çünkü **üç gövde tipi** (savaş, casusluk, düz rapor) aynı parçaları
/// kullanıyor. Web'de bunlar `Messages.tsx`in içinde yerel bileşenlerdi ve savaş raporu
/// kendi kopyasını çizmeye başladığında ikisi ayrışmıştı (rapor güzergâhı 2026-08-02'de
/// tek yere toplandı).
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../ui/primitives.dart';

/// ⭐ RAPOR GÜZERGÂHI — «kaynak → hedef», iki uç da TIKLANABİLİR (kullanıcı, 2026-08-02).
///
/// Dokununca o diyar Dünya ekranında açılıyor (`/world/:k/:d`) ve **sheet kapanıyor**: raporu
/// okuyup "peki bu nerede?" diye soran oyuncunun bir sonraki adımı zaten haritaya bakmak.
/// Sheet açık kalsaydı altındaki ekranın değiştiğini görmezdi.
///
/// ⚠️ Şehir NUMARASI (`s`) bağlantıda yok — Dünya ekranı diyar listesi, şehir değil (§13.16).
/// Koordinatın tamamı yine yazılıyor, yalnız gidilen yer diyar düzeyinde.
///
/// ⭐ OYUNCU ADI koordinatın yanında (kullanıcı, 2026-08-07) ve **düğmenin İÇİNDE**: ad ile
/// koordinat aynı şeyi işaret ediyor, ikisini ayırıp yalnız birini dokunulabilir yapmak
/// gereksiz bir ayrım olurdu.
///
/// ⚠️ `owner` yoksa şehir adına düşülüyor: 2026-08-07'den eski raporlarda oyuncu adı
/// donmamıştı ve o raporlar adsız kalmamalı. İkisi de yoksa yalnız koordinat yazılıyor —
/// boş koordinata şehir kurmada gerçekten ikisi de yok.
class MwRouteLine extends StatelessWidget {
  const MwRouteLine({
    super.key,
    required this.origin,
    required this.target,
    this.onNavigate,
  });

  final ({int k, int d, int s, String? name, String? owner})? origin;
  final ({int k, int d, int s, String? name, String? owner})? target;

  /// Gidilmeden ÖNCE çağrılır — sheet'i kapatmak çağıranın işi.
  final VoidCallback? onNavigate;

  @override
  Widget build(BuildContext context) {
    if (origin == null && target == null) return const SizedBox.shrink();
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 6,
        runSpacing: 4,
        children: [
          _Part(origin, onNavigate),
          Text('→', style: TextStyle(color: c.muted)),
          _Part(target, onNavigate),
        ],
      ),
    );
  }
}

class _Part extends StatelessWidget {
  const _Part(this.c, this.onNavigate);

  final ({int k, int d, int s, String? name, String? owner})? c;
  final VoidCallback? onNavigate;

  @override
  Widget build(BuildContext context) {
    final colors = MwColors.of(context);
    final coord = c;
    if (coord == null) {
      return Text('—', style: TextStyle(color: colors.muted));
    }
    final ad = coord.owner ?? coord.name;
    return InkWell(
      onTap: () {
        onNavigate?.call();
        context.go('/world/${coord.k}/${coord.d}');
      },
      borderRadius: BorderRadius.circular(4),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 2),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '${coord.k}:${coord.d}:${coord.s}',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: colors.info,
                // ⚠️ `tnum` yalnız koordinatta: tablo rakamları ada uygulanınca harfler
                // seyreliyor (web'de de aynı ayrım).
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            if (ad != null && ad.isNotEmpty) ...[
              const SizedBox(width: 4),
              Text(ad, style: TextStyle(fontSize: 12, color: colors.info)),
            ],
          ],
        ),
      ),
    );
  }
}

/// Küçük başlık + içerik. Web'deki `Section` ile aynı görsel dil.
class MwReportSection extends StatelessWidget {
  const MwReportSection({super.key, required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            mwUpper(title),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
              color: c.muted,
            ),
          ),
          const SizedBox(height: 4),
          child,
        ],
      ),
    );
  }
}

/// ⭐ BİRİM KARTLARI (kullanıcı, 2026-08-07) — «Cüce 120 · Elf 30» yerine her birim kendi
/// görseliyle bir kart.
///
/// Kullanıcının şikâyeti destek raporundaydı: noktayla ayrılmış düz metin, oyunun her yerinde
/// görseliyle görünen birimleri raporda anonim bir listeye çeviriyordu.
///
/// ⚠️ **Sıra `order` ile dışarıdan** veriliyor (katalog sırası), `Map`in kendi sırası değil:
/// Baraka ve Ordular ekranı da aynı sırayı kullanıyor, rapor onlardan ayrışmamalı. Katalogda
/// olmayan bir id (eski kayıt) **sona düşer, gizlenmez**.
/// ⚠️ `Wrap`: dar telefonda kartlar alt satıra iniyor. Sabit sütunlu bir ızgara 320 px'te
/// taşardı.
///
/// ⚠️⚠️ **`folder` ŞART ve varsayılana güvenilmemeli.** Savaşçılar `assets/units/`, savunma
/// üniteleri `assets/defenses/` altında ve `MwIcon` bulunamayan dosyada **hata vermiyor**,
/// aynı ölçüde boşluk bırakıyor. Yani yanlış klasör verilmiş bir bölüm ekranda "ikonsuz
/// kartlar" olarak görünür ve hiçbir yerde iz bırakmaz — casusluk raporunun savunma bölümü
/// ilk yazımda tam olarak bu hâldeydi (2026-08-18'de yakalandı).
class MwUnitChips extends StatelessWidget {
  const MwUnitChips({
    super.key,
    required this.units,
    required this.nameOf,
    this.order = const [],
    this.folder = 'units',
  });

  final Map<String, int> units;
  final String Function(String id) nameOf;

  /// Katalog sırası. Boşsa gelen sıra korunur.
  final List<String> order;

  /// `units` (savaşçılar) · `defenses` (savunma üniteleri).
  final String folder;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final rows = units.entries.where((e) => e.value > 0).toList();
    if (rows.isEmpty) return const SizedBox.shrink();

    // ⚠️ Bilinmeyen id 999'a düşüyor: eski bir kayıttaki kaldırılmış birim listenin sonunda
    // görünmeye devam etsin, sessizce kaybolmasın.
    int rank(String id) {
      final i = order.indexOf(id);
      return i < 0 ? 999 : i;
    }

    rows.sort((a, b) => rank(a.key).compareTo(rank(b.key)));

    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final e in rows)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
            decoration: BoxDecoration(
              color: c.raised,
              border: Border.all(color: c.border),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                MwIcon(folder: folder, id: e.key, size: 28),
                const SizedBox(width: 6),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      nameOf(e.key),
                      style: TextStyle(fontSize: 11, color: c.muted),
                    ),
                    Text(
                      mwNumber(e.value),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Kahraman kartı — Tapınak'taki görsel dil: portre + ad + seviye + durum satırı.
///
/// ⚠️ Ölü kahraman **soluk değil, kırmızı etiketli**: Flutter'da gri tonlama bir
/// `ColorFilter` katmanı ister ve 34 px'lik bir portrede fark neredeyse görünmez. Etiket
/// («Yok Edildi !») tek başına daha okunur ve orijinalin kendi kalıbı.
class MwHeroCard extends StatelessWidget {
  const MwHeroCard({
    super.key,
    required this.name,
    required this.level,
    this.alive = true,
    this.xpGained = 0,
  });

  final String name;
  final int level;
  final bool alive;
  final int xpGained;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: c.raised,
        border: Border.all(color: c.border),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const MwIcon(folder: 'hero', id: 'kahraman', size: 34),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // ⚠️ Oyuncunun yazdığı ad → gövde fontu. Cinzel küçük harf taşımıyor
                  // (`mwDisplayStyle` başlığındaki kural).
                  Text(
                    name,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: 5),
                  Text(
                    'sv $level',
                    style: TextStyle(fontSize: 11, color: c.muted),
                  ),
                ],
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    // Orijinal kalıp (`k.java`): ölen her kahramanın tek etiketi
                    // (ordusu sağ kalsa da kalmasa da eve dönüyor).
                    alive ? 'Sağ' : 'Yok Edildi !',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: alive ? FontWeight.normal : FontWeight.w700,
                      color: alive ? c.success : c.danger,
                    ),
                  ),
                  if (xpGained > 0) ...[
                    const SizedBox(width: 6),
                    Text(
                      '+${mwNumber(xpGained)} tecrübe',
                      style: TextStyle(
                        fontSize: 10,
                        color: c.muted,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// «Taşınan: 🪙 1.200 🌾 300» — altın/yemek çifti.
///
/// ⚠️ İkonlar **oyunun kendi görselleri** (`MwResource` → `assets/ui/gold.png`). Material
/// ikonu kullanmak bu depoda düzeltilmiş bir kusur (`primitives.dart` · `MwResource`).
class MwResPair extends StatelessWidget {
  const MwResPair({
    super.key,
    required this.label,
    required this.gold,
    required this.food,
    this.size = 14,
    this.color,
  });

  final String label;
  final int gold;
  final int food;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 3),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 10,
        runSpacing: 2,
        children: [
          Text(label, style: TextStyle(fontSize: 12, color: color ?? c.muted)),
          MwResource(kind: 'gold', amount: gold, size: size),
          MwResource(kind: 'food', amount: food, size: size),
        ],
      ),
    );
  }
}
