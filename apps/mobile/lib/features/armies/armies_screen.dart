/// ⭐⭐ ORDULAR — giriş sonrası oyuncuyu KARŞILAYAN ekran (`kHomePath`).
///
/// Ekranın tamamı **tek bir şey**: şehirler yan yana, her birinin altında o şehrin hareketleri
/// simge simge asılı. Web'deki `CityStrip` düzeninin birebir karşılığı.
///
/// ─ ⚠️⚠️ METİNLİ LİSTE KALDIRILDI (kullanıcı kararı, 2026-08-17) ───────────────────────────
/// İlk yazımda tam tersi yapılmıştı: simgeler taşınmamış, yerine metinli bir liste konmuştu.
/// Kullanıcının kararı net: *"Üstteki hareket simgeleri kalıp alttaki listeyi tamamen
/// kaldıralım."* Gerekçe de birlikte geldi: **bant zaten yalnız bu sayfada görünüyor**, yani
/// başka ekranlarda içerikten yer çalma sorunu yok; bir şehirde çok hareket varsa bant aşağı
/// uzar ve gerekirse sayfa kaydırılır.
///
/// ⚠️ Benim gerekçem (*"üstteki bant alttaki listenin tekrarı"*) yanlış değildi ama **yanlış
/// tarafı sildi**: tekrarı kaldırmanın iki yolu vardı ve oyunun kendi dili simgelerden yana —
/// hareket haritada duran bir şey, bir tablo satırı değil.
///
/// ─ ⭐ ŞERİT NEDEN KABUKTA DEĞİL, SAYFADA ─────────────────────────────────────────────────
/// Diğer ekranlarda şerit `GameShell`in içinde ve **sabit yükseklikte** duruyor (bkz.
/// `city_strip.dart`). Buradaki sürüm hareket sayısına göre büyüyor, yani sınırsız yükseklik
/// istiyor; kabuktaki `Column`a konsaydı taşardı. Sayfanın gövdesinde ise kaydırma bedava
/// geliyor. Bu yüzden `CityStrip` `/armies`te kendini hiç çizmiyor ve iş buraya geçiyor.
///
/// ⚠️ Şehir DEĞİŞTİRME buradan da çalışıyor — kaleye dokunmak aktif şehri seçiyor. Kaybolan
/// bir yetenek yok.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../gen/contracts.g.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'movement.dart';
import 'movement_icon.dart';
import 'movement_rules.dart';
import 'movement_sheet.dart';

class ArmiesScreen extends ConsumerWidget {
  const ArmiesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cities = ref.watch(citiesProvider).value ?? const <CitySummary>[];
    final movements = ref.watch(movementsProvider);

    if (cities.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    return movements.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(16),
        child: MwErrorBox('Hareketler alınamadı: $e'),
      ),
      data: (all) => _Strip(cities: cities, all: all),
    );
  }
}

class _Strip extends ConsumerWidget {
  const _Strip({required this.cities, required this.all});

  final List<CitySummary> cities;
  final List<Movement> all;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeId = ref.watch(activeCityProvider).value;
    final tehdit = threatenedCityIds(all);

    /// ⚠️⚠️ **İKİ YÖNLÜ KAYDIRMA.** Dıştaki dikey, içteki yatay:
    ///   • şehir sayısı arttıkça şerit sağa taşıyor → yatay,
    ///   • bir şehirdeki hareket sayısı arttıkça sütun uzuyor → dikey.
    /// İkisi dik açıda olduğu için iç içe kaydırma çakışmıyor (aynı eksende olsalardı
    /// jestler birbirini yerdi).
    /* ⚠️ Aşağı çekip tazeleme DIŞTAKİ (dikey) kaydırıcıya bağlı: içteki yatay ve `RefreshIndicator`
       yatay kaydırmadan jest üretmiyor. İkisi dik açıda olduğu için çakışma da yok. */
    return MwRefresh(
      onRefresh: () {
        ref.invalidate(movementsProvider);
        ref.invalidate(citiesProvider);
        return mwRefreshAll([
          ref.read(movementsProvider.future),
          ref.read(citiesProvider.future),
        ]);
      },
      builder: (physics) => LayoutBuilder(
        builder: (context, kutu) {
          /* ⭐⭐ HÜCRE GENİŞLİĞİ ARTIK EKRANA GÖRE (kullanıcı, 2026-08-19: *"şehirler yan yana
             eşit genişlik kaplasın… yatayda scroll oluşturmayacak şekilde ekrana sığsın"*).

             Eskiden sabit 76 px'ti ve dört-beş şehirli oyuncuda toplam genişlik ekranı
             aşıyordu: şerit yatayda kayıyor, sondaki şehir yarım görünüyordu — yani "kimisi
             dar" izlenimi buradan geliyordu, hücreler aslında eşitti.

             ⚠️⚠️ Düz `Expanded` KULLANILMADI ve bu eski bir ders: tek şehirli oyuncuda hücre
             ekranın tamamına yayılır, kale ortada asılı kalırdı (web'de yaşandı, önceki
             yorumda yazılıydı). Bunun yerine genişlik **hesaplanıyor ve kelepçeleniyor**:
                • az şehir → `_kEnFazla`yı geçmiyor, kale şişmiyor,
                • çok şehir → `_kEnAz`ın altına inmiyor; sığmıyorsa yatay kaydırma
                  KALIYOR. Onuncu şehri 30 px'e sıkıştırmak "sığdı" demek olmazdı. */
          const bosluk = 4.0;
          final kullanilabilir =
              kutu.maxWidth - 16 - bosluk * (cities.length - 1);
          final genislik = (kullanilabilir / cities.length).clamp(
            _kEnAz,
            _kEnFazla,
          );
          final sigiyor =
              genislik * cities.length + bosluk * (cities.length - 1) <=
              kutu.maxWidth - 16;

          final serit = Row(
            // ⚠️ `start`: az hareketi olan şehir yukarıda hizalı kalsın. `center` olsaydı
            // kaleler birbirine göre kayar ve şeridin üst hattı bozulurdu.
            crossAxisAlignment: CrossAxisAlignment.start,
            // ⚠️ Sığıyorsa `min`: hücreler sola yaslı kalsın, ortaya toplanmasın.
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < cities.length; i++) ...[
                if (i > 0) const SizedBox(width: bosluk),
                _Cell(
                  city: cities[i],
                  width: genislik,
                  active: cities[i].id == activeId,
                  threat: tehdit.contains(cities[i].id),
                  // ⚠️ Sıra SUNUCUDAN geliyor (`ORDER BY m.created_at, m.id`) ve **korunuyor**:
                  // hareketler şehrin altına ASILDIKLARI sırayla dizili kalmalı (kullanıcı
                  // kuralı). Varışa göre dizilseydi simgeler her saniye yer değiştirir,
                  // oyuncunun parmağı hedefi kaçırırdı.
                  movements: all
                      .where((m) => m.cityId == cities[i].id)
                      .toList(),
                ),
              ],
            ],
          );

          return SingleChildScrollView(
            physics: physics,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 10, 8, 16),
              // ⚠️ Sığıyorsa yatay kaydırıcı HİÇ kurulmuyor: boşta duran bir kaydırıcı,
              //    parmağı yanlışlıkla yatay sürüklendiğinde şeridi oynatıp "kaydı" hissi
              //    veriyordu.
              child: sigiyor
                  ? serit
                  : SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: serit,
                    ),
            ),
          );
        },
      ),
    );
  }
}

/// Hücrenin inebileceği en dar ölçü — altına inince kale simgesi ve koordinat okunmaz olur.
const double _kEnAz = 58;

/// En geniş ölçü — tek şehirli oyuncuda kalenin ekrana yayılmasını önler.
const double _kEnFazla = 96;

class _Cell extends ConsumerWidget {
  const _Cell({
    required this.city,
    required this.width,
    required this.active,
    required this.threat,
    required this.movements,
  });

  final CitySummary city;

  /// Şeritten geliyor — bütün hücrelerde AYNI (gerekçe `_Strip`te).
  final double width;
  final bool active;
  final bool threat;
  final List<Movement> movements;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final scheme = Theme.of(context).colorScheme;
    final co = city.coordinates;

    return SizedBox(
      width: width,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          GestureDetector(
            onTap: () => ref.read(activeCityProvider.notifier).select(city.id),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 3),
              decoration: BoxDecoration(
                color: active ? scheme.primary.withValues(alpha: 0.15) : null,
                border: Border.all(
                  color: active ? scheme.primary : Colors.transparent,
                  width: 2,
                ),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      MwIcon(
                        folder: 'buildings',
                        id: 'city',
                        size: active ? 40 : 38,
                      ),
                      if (threat)
                        const Positioned(
                          top: -2,
                          right: -2,
                          child: MwAlertDot(),
                        ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    city.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      height: 1.1,
                      fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                      color: active ? scheme.primary : null,
                    ),
                  ),
                  Text(
                    '${co.k}:${co.d}:${co.s}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10,
                      height: 1.1,
                      color: c.muted,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
          ),
          // ⭐ Hareketler kalenin ALTINA asılıyor — sütun onlarla birlikte uzuyor.
          for (final m in movements)
            MovementIcon(m: m, onTap: () => showMovementSheet(context, m)),
        ],
      ),
    );
  }
}
