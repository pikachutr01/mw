/// ⭐ ŞEHİR ŞERİDİ — şehir değiştirmenin tek yolu. Web'deki `CityStrip.tsx` karşılığı.
///
/// ⚠️ Açılır liste (dropdown) DEĞİL, **kale resimleri yan yana**. Web'de de öyle ve sebebi
/// oyunun kendi dili: şehir bir satır metin değil, haritada duran bir yer. Altında adı, onun
/// altında koordinatı yazıyor.
///
/// ⭐⭐ **Ordular dışında KATLI** (web'de kullanıcı kararı, 2026-08-03). Şerit her ekranda
/// gerekli — Baraka'da başka şehre bakmak için Ordular'a gidip dönmek saçma olurdu — ama dar
/// ekranda her zaman açık durması içerikten yer çalıyor. Çözüm görünürlük değil **katlama**:
/// varsayılan kapalı, kapalıyken tek satırlık başlık (aktif şehrin adı + koordinatı), açınca
/// tam şerit iniyor.
///
/// ⛔⛔ **ORDULAR EKRANINDA BU BİLEŞEN HİÇ ÇİZİLMİYOR** (2026-08-17). Orada şeridin hareket
/// simgeli sürümü **sayfanın gövdesinde** duruyor (`features/armies/armies_screen.dart`) ve
/// sebebi yükseklik: o sürüm hareket sayısına göre büyüyor, yani sınırsız yükseklik istiyor.
/// Kabuktaki `Column`a konsaydı taşardı; sayfa gövdesinde ise kaydırma bedava geliyor.
/// ⚠️ İkisi aynı anda çizilirse ekranda **iki şerit** olur — web'de tam olarak bu yaşandı.
///
/// ⭐ **KAPALIYKEN DE AKTİF ŞEHİR YAZAR.** Yalnız bir ok koysaydık oyuncu Baraka'da "hangi
/// şehrin barakası bu?" sorusunu cevaplayamazdı — kapalıyken ad başka hiçbir yerde yazmıyor.
/// Bir satır, iki iş: bağlam + düğme.
///
/// ─ ⛔⛔ HAREKET SİMGELERİ BURAYA ASILMIYOR (2026-08-17) ────────────────────────────────────
/// Web'de her kalenin altına o şehrin hareketleri simge simge diziliyor (`CityStrip.tsx`) ve
/// Ordular ekranı bunun metinli tekrarı. Mobil uygulamaya **taşınmadı**, sebebi kullanıcının
/// kendi kararı: *"Yapılar sayfasında yükseltilen bina yalnızca kendi satırında görünür, üstte
/// ek olarak çıkmaz."* Aynı biçim: üstteki bant, alttaki listenin tekrarıydı ve dar ekranda
/// içerikten yer çalıyordu. Burada bedel daha da yüksek — şerit **kabuğun içinde**, yani
/// simgeler ekranın tamamını değil, hangi sayfada olursak olalım içeriği aşağı itiyor.
///
/// ⭐ Kaybolan bilgi telafi edildi ve İKİSİ de tekrar değil:
///   • **kırmızı alarm noktası** — "hangi ŞEHRİM tehdit altında" (liste koordinat veriyor,
///     kalemi değil) ve maliyeti sıfır piksel,
///   • **alt bardaki rozet** (`shell.dart`) — "kaç hareket var, en kötüsü ne renk", her
///     ekrandan görünüyor. Web'in kendi mobil düzeninde de aynı rozet var.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../features/armies/movement_rules.dart';
import '../../gen/contracts.g.dart';
import '../../ui/primitives.dart';

/// ⚠️ Katlama tercihi **cihaz hafızasında, TEK anahtar** — rota başına saklamak "Baraka'da
/// açtım, Yapılar'da yine kapalı" sürtünmesi yaratırdı. Web'de de aynı anahtar adı.
const String kStripCollapsedKey = 'mw-strip-collapsed';

/// Şeridin açık/kapalı durumu. ⚠️ Varsayılan KAPALI (web'deki kullanıcı kararı): yalnız
/// açıkça açılmışsa açık.
class StripOpen extends AsyncNotifier<bool> {
  @override
  Future<bool> build() async =>
      await ref.read(storeProvider).read(kStripCollapsedKey) == '0';

  Future<void> toggle() async {
    final next = !(state.value ?? false);
    await ref.read(storeProvider).write(kStripCollapsedKey, next ? '0' : '1');
    state = AsyncData(next);
  }
}

final stripOpenProvider = AsyncNotifierProvider<StripOpen, bool>(StripOpen.new);

class CityStrip extends ConsumerWidget {
  const CityStrip({super.key, required this.path});

  /// O anki rota — Ordular'da şerit katlanmıyor.
  final String path;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // ⛔ Ordular ekranı kendi şeridini çiziyor (dosya başlığındaki gerekçe).
    if (path.startsWith('/armies')) return const SizedBox.shrink();

    final cities = ref.watch(citiesProvider).value ?? const [];
    if (cities.isEmpty) return const SizedBox.shrink();

    final activeId = ref.watch(activeCityProvider).value;
    final active =
        cities.where((c) => c.id == activeId).firstOrNull ?? cities.first;

    final open = ref.watch(stripOpenProvider).value ?? false;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _Header(active: active, open: open),
        if (open) _Strip(cities: cities, activeId: active.id),
      ],
    );
  }
}

class _Header extends ConsumerWidget {
  const _Header({required this.active, required this.open});

  final CitySummary active;
  final bool open;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final co = active.coordinates;

    /// ⭐⭐ ALARM KAPALI ŞERİTTE DE GÖRÜNÜR. Şerit varsayılan olarak KAPALI ve oyuncu
    /// zamanının çoğunu şehir ekranlarında geçiriyor: noktayı yalnız `_Strip`e koysaydık
    /// uygulamanın olağan hâlinde **hiç görünmezdi** — yani özellik pratikte ölü olurdu.
    ///
    /// ⚠️ Alt bardaki rozetin YERİNE GEÇMEZ, onu tamamlar: rozet "bir yerde tehdit var"
    /// diyor, buradaki nokta "şu an baktığın şehirde" diyor. Çok şehirli oyuncuda ikisi
    /// farklı sorular.
    final tehdit = threatenedCityIds(
      ref.watch(movementsProvider).value ?? const [],
    ).contains(active.id);

    return InkWell(
      onTap: () => ref.read(stripOpenProvider.notifier).toggle(),
      child: Container(
        margin: const EdgeInsets.fromLTRB(8, 6, 8, 0),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: c.raised.withValues(alpha: 0.5),
          border: Border.all(color: c.border),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                const MwIcon(folder: 'buildings', id: 'city', size: 20),
                if (tehdit)
                  // ⚠️ Şeritteki noktadan küçük (9 → 7): burada simge de küçük ve aynı
                  // boyuttaki nokta kalenin yarısını kaplıyordu.
                  const Positioned(
                    top: -2,
                    right: -3,
                    child: MwAlertDot(size: 7),
                  ),
              ],
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                active.name,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
            ),
            // ⭐ Başkent etiketi burada: şerit kapalıyken "hangisi başkentim?" sorusunun
            // cevabı ekranda başka hiçbir yerde kalmıyor.
            if (active.isCapital) ...[
              const SizedBox(width: 6),
              Text(
                'BAŞKENT',
                style: TextStyle(
                  fontSize: 9,
                  color: c.muted,
                  letterSpacing: 0.5,
                ),
              ),
            ],
            const SizedBox(width: 8),
            Text(
              '${co.k}:${co.d}:${co.s}',
              style: TextStyle(
                fontSize: 12,
                color: c.muted,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            const Spacer(),
            AnimatedRotation(
              turns: open ? 0.5 : 0,
              duration: const Duration(milliseconds: 150),
              child: Icon(Icons.expand_more, size: 18, color: c.muted),
            ),
          ],
        ),
      ),
    );
  }
}

class _Strip extends ConsumerWidget {
  const _Strip({required this.cities, required this.activeId});

  final List<CitySummary> cities;
  final int activeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    /// ⭐ Alarm noktasının kaynağı. ⚠️ Sağlayıcı BURADA okunuyor, hücrede değil: her hücre
    /// kendi başına okusaydı beş şehirde aynı liste beş kez süzülürdü.
    /// ⚠️ `.value ?? const []` — liste henüz gelmediyse nokta çizilmez. Yükleme sırasında
    /// "tehdit yok" göstermek, "tehdit var" uydurmaktan iyi: birkaç yüz ms sonra beliriyor.
    final tehdit = threatenedCityIds(
      ref.watch(movementsProvider).value ?? const [],
    );

    // ⚠️ SOLA YASLI, her hücre kendi genişliğinde (web'de kullanıcı kararı). Eşit bölünen
    // hücreler kullanılsaydı TEK şehirde o hücre ekranın tamamını kaplar, simge ortasında
    // asılı kalırdı. Sabit 72 px: beş şehir 360 px'e sığıyor, taşarsa yatayda kayıyor.
    return SizedBox(
      height: 84,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(8, 6, 8, 4),
        itemCount: cities.length,
        separatorBuilder: (_, _) => const SizedBox(width: 4),
        itemBuilder: (context, i) {
          final city = cities[i];
          return _Cell(
            city: city,
            active: city.id == activeId,
            threat: tehdit.contains(city.id),
          );
        },
      ),
    );
  }
}

class _Cell extends ConsumerWidget {
  const _Cell({required this.city, required this.active, required this.threat});

  final CitySummary city;
  final bool active;

  /// ⭐ Bu şehre düşmanca bir hareket geliyor mu (saldırı ya da casusluk).
  ///
  /// ⚠️ Web bu noktayı YALNIZ Ordular ekranında gösteriyor ve bu bilinçli bir sapma: orada
  /// nokta, hareket listesinin bir yan ürünü (`onArmies ? movements : []`). Mobilde liste
  /// zaten her ekranda çekiliyor (alt bardaki rozet onu okuyor), yani noktayı Baraka'da da
  /// göstermenin ek bir maliyeti yok — ve "şehrime saldırı geliyor" bilgisinin en çok
  /// gerektiği an, oyuncunun başka bir ekranda oyalandığı andır.
  final bool threat;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final scheme = Theme.of(context).colorScheme;
    final co = city.coordinates;

    return GestureDetector(
      onTap: () => ref.read(activeCityProvider.notifier).select(city.id),
      child: Container(
        width: 72,
        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
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
            // ⚠️ `Stack` + `clipBehavior: none`: nokta simgenin köşesinden BİRAZ taşıyor.
            // Kırpılsaydı yarım bir daire olarak görünür, kasten çizilmiş gibi durmazdı.
            Stack(
              clipBehavior: Clip.none,
              children: [
                MwIcon(folder: 'buildings', id: 'city', size: active ? 34 : 32),
                if (threat)
                  const Positioned(top: -2, right: -2, child: MwAlertDot()),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              city.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 10,
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
                fontSize: 9,
                height: 1.1,
                color: c.muted,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
