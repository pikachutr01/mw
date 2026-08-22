/// ⭐⭐ HAREKET SİMGESİ — şehrin ALTINA asılan tek hareket.
///
/// Web'deki `movements.tsx` · `MovementIcon` karşılığı. Simge + altında geri sayım, dönüş
/// bacağında bir de ↩ rozeti.
///
/// ─ Kararlar ──────────────────────────────────────────────────────────────────────────────
///  • **Boyut şehir simgesiyle AYNI** (web'de kullanıcı kararı): olay simgeleri kalenin altında
///    küçücük kalınca dizi «kale + tozlar» gibi görünüyordu.
///  • **Geri sayım saat biçiminde** (`04:31`), `formatDuration` değil. Orijinal oyunun kendi
///    gösterimi bu ve 72 px'lik hücreye ancak böyle sığıyor — «2 sa 04 dk 27 sn» taşardı.
///  • ⭐ **Parıltı tehdidi anlatıyor**, süs değil: kırmızı hâle = bana gelen saldırı/casusluk,
///    turuncu = bana gelen dost hareket, yeşil = benim hareketim. Kural `movement_rules.dart`ta
///    ve liste ile şerit **aynı** fonksiyondan besleniyor.
///  • ⚠️ Dokunma hedefi simgeden BÜYÜK: simge 34 px ama sütunun tamamı (simge + yazı + boşluk)
///    ~52 px ve tıklanabilir. 34 px'lik bir hedef parmakla ıskalanır.
///
/// ─ ⭐⭐ `compact` KİPİ (kullanıcı, 2026-08-22) ─────────────────────────────────────────────
/// Dünya listesinin satırına asılınca bu simge **taştı**: cihazda gerçek bir
/// *«BOTTOM OVERFLOWED BY 9.0 PIXELS»* uyarısı çıktı ve geri sayımlar alt satıra sarktı.
/// Sebep basit — satır `height: 46` sabit, simge tek başına 34 px ve altında bir de saat var.
///
/// Kullanıcının kararı: *"ordular sayfasında göründüğü şekilde değil, buraya özel sadece
/// ikon olarak görünsün; altında geri sayım olmasın, simge satıra sığsın."*
///
/// ⚠️ Ayrı bir widget DEĞİL, bayrak: ton kuralı (`movementTone`) ve dokunma davranışı ikisinde
/// de aynı kalmalı. Ayrı yazsaydık tehdidin rengi iki yerde yaşar ve kaçınılmaz olarak ayrışırdı.
///
/// ⚠️⚠️ `compact` kipte `tickProvider` **İZLENMİYOR** ve bu yalnız gereksizlik meselesi değil:
/// geri sayım yoksa saniyede bir yeniden çizilecek bir şey de yok. İzleseydik on satırlık
/// Dünya listesi, hiçbir şey değişmediği hâlde her saniye baştan çizilirdi.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../ui/primitives.dart';
import 'movement.dart';
import 'movement_rules.dart';

class MovementIcon extends ConsumerWidget {
  const MovementIcon({
    super.key,
    required this.m,
    required this.onTap,
    this.compact = false,
  });

  final Movement m;
  final VoidCallback onTap;

  /// Dar bir satıra asılan hâli: yalnız simge, geri sayım yok, dönüş rozeti yok.
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);

    final tone = switch (movementTone(m)) {
      MwTone.danger => c.danger,
      MwTone.warning => c.warning,
      MwTone.success => c.success,
    };

    if (compact) {
      /* ⚠️ PARILTI KALDI ama küçüldü (9 → 4 bulanıklık). Tehdidin rengi bu simgenin tek
         bilgisi: geri sayım da rozet de gittiğine göre "bana gelen saldırı" ile "benim
         ordum" ayrımını yapan başka hiçbir şey kalmıyor. Süs değil, sinyal. */
      return InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(4),
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            Container(
              width: 16,
              height: 16,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(color: tone.withValues(alpha: 0.55), blurRadius: 4),
                ],
              ),
            ),
            MwIcon(folder: 'missions', id: m.icon, size: 20),
          ],
        ),
      );
    }

    final clock = ref.watch(clockProvider);
    // ⚠️ Bu satır olmadan geri sayım yalnız sunucu yanıtı geldiğinde güncellenirdi.
    ref.watch(tickProvider);

    /// ⚠️ Kendi dönüşüm `direction == 'own'` — `type == 'return'` DEĞİL. Sunucu gelen bir
    /// dönüşü de `return` tipiyle gönderebiliyor; rozeti belirleyen şey ordunun BENİM olması.
    final donus = m.direction == 'own';

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 3, horizontal: 2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.center,
              children: [
                // ⭐ PARILTI. ⚠️ `BoxShadow` şeffaf dolgulu DAİRE üstünde çiziliyor: doğrudan
                // resme gölge verilseydi PNG'nin kare sınırı hâle olarak görünürdü.
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: tone.withValues(alpha: 0.5),
                        blurRadius: 9,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                ),
                MwIcon(folder: 'missions', id: m.icon, size: 34),
                if (donus)
                  Positioned(
                    top: -3,
                    right: -5,
                    child: Container(
                      width: 15,
                      height: 15,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: c.success,
                        shape: BoxShape.circle,
                        border: Border.all(color: c.borderStrong, width: 0.5),
                      ),
                      // ⚠️⚠️ METİN OK KARAKTERİ (`↩`, U+21A9) **KULLANILAMAZ**: Android onu
                      // emoji varyantı olarak çiziyor ve rozet, renginden bağımsız olarak
                      // MAVİ bir kutuya dönüşüyor (cihazda görüldü, 2026-08-17). Web'de aynı
                      // karakter düz metin olarak çiziliyor, yani hata platforma özel.
                      // ⚠️ Material ikonu burada kurala uygun: oyunun bu iş için kendi
                      // görseli yok (`MwResource` yorumundaki ayrım).
                      child: Icon(
                        Icons.undo,
                        size: 10,
                        color: Theme.of(context).colorScheme.onPrimary,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 1),
            Text(
              // ⚠️ «varıyor»: süre dolduğunda sunucu görevi henüz işlememiş olabilir.
              // `00:00` yazmak bitmiş bir şeyin donduğunu düşündürürdü.
              clock.remainingClock(m.executeAt) ?? 'varıyor',
              maxLines: 1,
              style: TextStyle(
                fontSize: 11,
                height: 1.1,
                fontWeight: FontWeight.w600,
                color: tone,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
