/// ⭐ BİLGİ ÇUBUĞU — altın · yemek · şehir koordinatı · bağlantı göstergesi.
///
/// Web'deki `Shell.tsx` · `InfoBar` karşılığı ve **her ekranın üstünde** duruyor: oyuncunun
/// kaynağını görmek için Şehir'e gitmesi gerekmesin.
///
/// ⭐ ÜÇ BÖLGELİ DÜZEN (web'den bire bir) — `Row` + `Spacer` DEĞİL. Web'de her şey tek bir
/// ortalanmış satırdayken 6.000.000 altınlı şehirden 500 altınlı şehre geçince sayının
/// genişliği değişiyor ve **tüm içerik sağa sola zıplıyordu**. Çözüm: kaynak alanı SABİT
/// genişlikte, orta bölge onun zıplamasından etkilenmiyor.
///
/// ⚠️ Sabit genişlik `mwSayi` çıktısının en uzun hâline göre değil, `tabular` rakamlarla
/// 9 karaktere göre: `6.000.000` tam sığıyor, daha uzunu yalnız kendi kutusunu büyütüyor.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/city_progress.dart';
import '../../core/realtime.dart';
import '../../ui/primitives.dart';

class InfoBar extends ConsumerWidget {
  const InfoBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final activeId = ref.watch(activeCityProvider).value;
    final city = activeId == null
        ? null
        : ref.watch(cityProvider(activeId)).value;

    // Saniyelik sayaç — kaynak ekstrapolasyonu bunun üstünde akıyor.
    ref.watch(tickProvider);
    final clock = ref.watch(clockProvider);

    final r = city == null
        ? (gold: 0, food: 0)
        : extrapolateResources(
            ResourceInput(
              gold: city.gold,
              food: city.food,
              goldPerHour: city.goldPerHour,
              foodPerHour: city.foodPerHour,
              serverNow: city.serverNow,
            ),
            clock.serverNow(),
          );

    return Container(
      decoration: BoxDecoration(
        color: c.panelHeader,
        border: Border(bottom: BorderSide(color: c.borderStrong, width: 2)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      child: Row(
        children: [
          // ── SOL: kaynak (sabit genişlik) ──────────────────────────────────
          _Res(kind: 'gold', value: r.gold.floor()),
          const SizedBox(width: 10),
          _Res(kind: 'food', value: r.food.floor()),

          // ── ORTA: koordinat ───────────────────────────────────────────────
          // ⚠️ Şehir ADI burada YOK, web'in mobil düzeniyle aynı: ad zaten şeritte yazıyor
          // ve dar ekranda ikisini birden sığdırmak koordinatı kırpıyordu. Mobilde
          // koordinat sayfa başlığının yerini alıyor ve VURGULU (kullanıcı, 2026-07-30).
          Expanded(
            child: Center(
              child: Text(
                city == null
                    ? ''
                    : '${city.coordinates.k}:${city.coordinates.d}:${city.coordinates.s}',
                style: TextStyle(
                  color: c.onPanelHeader,
                  fontWeight: FontWeight.w600,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ),

          // ── SAĞ: göstergeler ──────────────────────────────────────────────
          // ⭐ Tatil rozeti: kaynak sayacı donduğu için oyuncunun "neden artmıyor" diye
          // sorması an meselesi. Rozet o soruyu sormadan yanıtlıyor.
          if (city?.onVacation ?? false) ...[
            GestureDetector(
              onTap: () => context.go('/options'),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  border: Border.all(color: c.info),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  'Tatilde',
                  style: TextStyle(fontSize: 10, color: c.info),
                ),
              ),
            ),
            const SizedBox(width: 8),
          ],
          const ConnectionDot(),
        ],
      ),
    );
  }
}

/// ⚠️ Sabit genişlik ŞART: şehir değişince sayının uzunluğu değişiyor ve sabitlenmezse orta
/// bölge sağa sola zıplıyor (web'de yaşandı, gerekçe dosya başlığında).
class _Res extends StatelessWidget {
  const _Res({required this.kind, required this.value});

  final String kind;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        // ⭐ Web'in kendi görselleri (`assets/ui/gold.png` · `food.png`), Material ikonu değil.
        MwIcon(folder: 'ui', id: kind, size: 16),
        const SizedBox(width: 4),
        SizedBox(
          width: 74,
          child: Text(
            mwNumber(value),
            style: TextStyle(
              color: MwColors.of(context).onPanelHeader,
              fontSize: 13,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ),
      ],
    );
  }
}

/// ⭐ BAĞLANTI GÖSTERGESİ — soketin gerçek durumu.
///
/// ⚠️⚠️ Bu noktanın YALAN söylememesi mobilde web'dekinden daha zor: Android arka planda
/// soketi öldürüp istemciyi «bağlı» sanısında bırakabiliyor. Onu `core/realtime.dart`taki
/// geri-dönüş kararı çözüyor; burada yalnız çizim var.
class ConnectionDot extends ConsumerWidget {
  const ConnectionDot({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final state = ref.watch(connectionProvider).value;

    final (renk, etiket) = switch (state) {
      MwConnectionState.online => (c.success, 'Sunucuya bağlandı'),
      MwConnectionState.connecting => (c.warning, 'Bağlanıyor…'),
      // ⚠️ `null` (akış henüz bir değer yaymadı) da kopuk sayılıyor: bilinmeyeni "bağlı"
      // göstermek, göstergenin var oluş sebebini ortadan kaldırırdı.
      _ => (c.danger, 'Bağlantı koptu'),
    };

    return Tooltip(
      message: etiket,
      child: Container(
        width: 9,
        height: 9,
        decoration: BoxDecoration(
          color: renk,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.black.withValues(alpha: 0.3)),
        ),
      ),
    );
  }
}
