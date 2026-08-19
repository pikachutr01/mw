/// ŞEHİR HUB'I — beş şehir ekranının listesi. Web'deki `CityHub` karşılığı.
///
/// ⚠️ Şehir ADI KARTI burada YOK, bilerek: ad ve koordinat kabuktaki şehir şeridinde yazıyor
/// (web'de de 2026-08-03'te aynı sebeple kaldırıldı). İki yerde yazması, dar ekranda aynı
/// bilgiyi iki kez göstermek olurdu.
///
/// ⚠️ Kaynaklar da burada YOK: bilgi çubuğu onları **her ekranda** gösteriyor.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/city_activity.dart';
import '../../core/city_screens.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';

class CityHubScreen extends ConsumerWidget {
  const CityHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    /// ⭐ Aktivite noktaları — sekme şeridiyle AYNI kaynaktan (`core/city_activity.dart`).
    /// ⚠️ Ek istek yok: `cityProvider` zaten önbellekte.
    final cityId = ref.watch(activeCityProvider).value;
    final city = cityId == null ? null : ref.watch(cityProvider(cityId)).value;
    final activity = cityActivity(city, cityId);

    return MwRefresh(
      onRefresh: () {
        if (cityId == null) return mwRefreshAll(const []);
        ref.invalidate(cityProvider(cityId));
        ref.invalidate(citiesProvider);
        return mwRefreshAll([
          ref.read(cityProvider(cityId).future),
          ref.read(citiesProvider.future),
        ]);
      },
      /* ⭐⭐ MENÜ YENİDEN DÜZENLENDİ (kullanıcı, 2026-08-19: *"Menü biraz daha yüksek ve
         seçenekler de daha büyük görünebilir. İçerik ekranın yukarısında kalıyor, alt kısım
         boş görünüyor."*).

         İki değişiklik:
         1️⃣ **Dış `MwPanel` kaldırıldı.** Başlığı «Şehir» idi ve alt bardaki sekme zaten aynı
            kelimeyi yazıyor; panel başlığı + kendi dolgusu ~50 px'i tekrar eden bir bilgiye
            harcıyordu. Her seçenek artık kendi kartı — menüde istenen şey de tam olarak
            "ayrı ayrı seçilebilir beş şey" görüntüsü.
         2️⃣ **Satır yüksekliği ekrandan hesaplanıyor.** Sabit yükseklikli beş satır kısa
            telefonda taşıyor, uzun telefonda altta kocaman bir boşluk bırakıyordu; ikisi de
            "yerleşim düşünülmemiş" izlenimi veriyor. Yükseklik kelepçeli: çok kısa ekranda
            `_kEnAz`ın altına inmiyor (o zaman liste kayar, doğru davranış), çok uzun ekranda
            `_kEnFazla`yı geçmiyor — yoksa beş kart afiş gibi görünürdü. */
      builder: (physics) => LayoutBuilder(
        builder: (context, kutu) {
          const bosluk = 8.0;
          const dikeyDolgu = 12.0 * 2;
          final pay =
              kutu.maxHeight - dikeyDolgu - bosluk * (kCityScreens.length - 1);
          final yukseklik = (pay / kCityScreens.length).clamp(
            _kEnAz,
            _kEnFazla,
          );

          return ListView(
            physics: physics,
            padding: const EdgeInsets.all(12),
            children: [
              for (final s in kCityScreens) ...[
                if (s != kCityScreens.first) const SizedBox(height: bosluk),
                _Secenek(
                  screen: s,
                  height: yukseklik,
                  busy: activity[s.path] == true,
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// Kartın inebileceği en kısa ölçü — altına inince ikon ve iki satır yazı sıkışıyor.
const double _kEnAz = 74;

/// En uzun ölçü — uzun telefonda beş kartın afişe dönüşmesini önler.
const double _kEnFazla = 108;

class _Secenek extends StatelessWidget {
  const _Secenek({
    required this.screen,
    required this.height,
    required this.busy,
  });

  final CityScreen screen;
  final double height;

  /// Bu ekranda süren bir iş var mı (üretim, yükseltme, araştırma).
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final scheme = Theme.of(context).colorScheme;

    return SizedBox(
      height: height,
      child: Material(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.go(screen.path),
          child: Container(
            decoration: BoxDecoration(
              border: Border.all(
                // ⭐ İşi süren ekranın kenarı vurgulu: nokta tek başına küçük kalıyordu ve
                //    hub, oyuncunun "nerede ne oluyor" diye baktığı ilk yer.
                color: busy ? scheme.primary.withValues(alpha: 0.6) : c.border,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              children: [
                // ⚠️ İkon yüksekliğe göre büyüyor ama 52'yi geçmiyor: varlıklar 64 px
                //    çizildi, üstüne çıkmak bulanıklaştırır.
                MwIcon(
                  folder: 'buildings',
                  id: screen.icon,
                  size: (height * 0.46).clamp(32, 52),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        screen.label,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        screen.hint,
                        style: TextStyle(fontSize: 12.5, color: c.muted),
                      ),
                    ],
                  ),
                ),
                // ⚠️ Nokta okun SOLUNDA: ok her satırda var ve göz onu sınır sayıyor;
                //    dışına konan bir nokta satırdan kopuk görünürdü.
                if (busy) ...[const MwActivityDot(), const SizedBox(width: 10)],
                Icon(Icons.chevron_right, color: c.muted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
