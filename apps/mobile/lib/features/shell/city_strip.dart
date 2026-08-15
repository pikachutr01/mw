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
/// ⚠️ Ordular ekranında katlanmıyor: orası zaten "ordularımı gör" ekranı, şeridi orada
/// kapatabilmek ekranın asıl işini gizlemek olurdu.
///
/// ⭐ **KAPALIYKEN DE AKTİF ŞEHİR YAZAR.** Yalnız bir ok koysaydık oyuncu Baraka'da "hangi
/// şehrin barakası bu?" sorusunu cevaplayamazdı — kapalıyken ad başka hiçbir yerde yazmıyor.
/// Bir satır, iki iş: bağlam + düğme.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
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
    final cities = ref.watch(citiesProvider).value ?? const [];
    if (cities.isEmpty) return const SizedBox.shrink();

    final activeId = ref.watch(activeCityProvider).value;
    final active =
        cities.where((c) => c.id == activeId).firstOrNull ?? cities.first;

    final onArmies = path.startsWith('/armies');
    final collapsible = !onArmies;
    final open = ref.watch(stripOpenProvider).value ?? false;
    final show = !collapsible || open;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (collapsible) _Header(active: active, open: open),
        if (show) _Strip(cities: cities, activeId: active.id),
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
            const MwIcon(folder: 'buildings', id: 'city', size: 20),
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
          return _Cell(city: city, active: city.id == activeId);
        },
      ),
    );
  }
}

class _Cell extends ConsumerWidget {
  const _Cell({required this.city, required this.active});

  final CitySummary city;
  final bool active;

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
            MwIcon(folder: 'buildings', id: 'city', size: active ? 34 : 32),
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
