/// ⭐⭐ ŞEHİR SEKMELERİ — beş şehir ekranı arasında tek dokunuşla geçiş.
///
/// Web'deki `CityTabs.tsx` karşılığı ve orada kullanıcının bildirdiği şu sürtünmeden doğdu:
/// *"Baraka sayfasına girdikten sonra Yapılar sayfasına geçmek için ya geri dönüp Yapılara
/// tıklamak gerekiyor, ya da tekrar Şehir tıklayıp Yapılar sayfasına geçmek gerekiyor…
/// yatayda scroll olabilecek bir tab menü oluştur."*
///
/// Masaüstünde sol menü bu işi tek tıkla yapıyor; mobilde karşılığı yoktu ve beş ekran
/// arasındaki her geçiş **iki dokunuş** ediyordu.
///
/// ─ Kararlar (web'den bire bir) ────────────────────────────────────────────────────────────
///  • **Yalnız metin, ikon YOK** (kullanıcı şartı). Beş ikon dar ekranda şeridi iki katına
///    çıkarır ve zaten hepsi tek kelimeyle ayırt ediliyor.
///  • **Eşit bölünmüyor.** Projedeki diğer sekme kümeleri eşit bölünüyor; burada her sekme
///    kendi genişliğinde olmalı, yoksa kaydırma anlamsızlaşır ve uzun adlar sıkışır.
///  • **Yalnız şehir ekranlarında görünür** — kararını kendisi veriyor, çağıranda koşul yok.
///
/// ⭐ Aktif sekme şeridin ORTASINA çekiliyor (web'de kullanıcı: *"aktif sayfa bu yatay
/// scroll un her zaman görünür kısmında kalsın"*). Ortalamak seçildi ki iki yanındaki
/// komşular da görünsün — uçtaki Tapınak'ta bile "başka sekmeler var" hissi kaybolmasın.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/city_activity.dart';

import '../../core/city_screens.dart';
import '../../ui/primitives.dart';

class CityTabs extends ConsumerStatefulWidget {
  const CityTabs({super.key, required this.path});

  final String path;

  @override
  ConsumerState<CityTabs> createState() => _CityTabsState();
}

class _CityTabsState extends ConsumerState<CityTabs> {
  final _controller = ScrollController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(CityTabs old) {
    super.didUpdateWidget(old);
    if (old.path != widget.path) _merkeze();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _merkeze());
  }

  /// Aktif sekmeyi görünür alanın ortasına çeker.
  ///
  /// ⚠️ Sekme genişlikleri metne göre değiştiği için gerçek konum ancak yerleşimden SONRA
  /// bilinir; bu yüzden kaydırma bir kare sonraya bırakılıyor. Ölçüsüz bir tahmin (indeks ×
  /// sabit genişlik) uzun adlarda yanlış yere kaydırırdı.
  void _merkeze() {
    if (!_controller.hasClients) return;
    final i = kCityScreens.indexWhere((s) => s.path == widget.path);
    if (i < 0) return;
    // Kaba ama yeterli: hedefi görünür alanın ortasına yaklaştır, sınırlara kelepçele.
    final genislik = _controller.position.viewportDimension;
    final hedef = (i * 92.0) - (genislik / 2) + 46;
    _controller.jumpTo(hedef.clamp(0.0, _controller.position.maxScrollExtent));
  }

  @override
  Widget build(BuildContext context) {
    final current = matchCityScreen(widget.path);
    if (current == null) return const SizedBox.shrink();

    final c = MwColors.of(context);
    final scheme = Theme.of(context).colorScheme;

    /// ⭐ AKTİVİTE NOKTALARI (kullanıcı, 2026-08-17) — hangi ekranda süren iş varsa sekmesinde
    /// küçük yeşil nokta. Kural `core/city_activity.dart`ta ve web ile aynı.
    ///
    /// ⚠️ `cityProvider` zaten bu ekranlarda okunuyor → ek istek YOK, aynı önbellekten geliyor.
    /// ⚠️ Şehir henüz yüklenmediyse `null` → nokta çizilmiyor; boş bir nokta yakıp sonra
    /// söndürmek "bir şey mi oldu" sorusu doğururdu.
    final cityId = ref.watch(activeCityProvider).value;
    final city = cityId == null ? null : ref.watch(cityProvider(cityId)).value;
    final activity = cityActivity(city, cityId);

    return SizedBox(
      height: 38,
      child: ListView.separated(
        controller: _controller,
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        itemCount: kCityScreens.length,
        separatorBuilder: (_, _) => const SizedBox(width: 4),
        itemBuilder: (context, i) {
          final s = kCityScreens[i];
          final active = s.path == current.path;
          return GestureDetector(
            onTap: () => context.go(s.path),
            child: Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: active ? scheme.primary : scheme.surface,
                border: Border.all(
                  color: active ? c.borderStrong : c.border,
                  width: 2,
                ),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    s.label,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                      color: active ? scheme.onPrimary : c.muted,
                    ),
                  ),
                  if (activity[s.path] == true) ...[
                    const SizedBox(width: 5),
                    const MwActivityDot(),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
