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
        /* ⭐ DÜZ RENK DEĞİL, İNCE BİR DEĞRADE (kullanıcı, 2026-08-19: *"fazla sade"*).
           ⚠️ Ham renk yazılmıyor — ikisi de `panelHeader` token'ından TÜRETİLİYOR
           (§13.13.1). Böylece iki temada da doğru yönde koyulaşıyor ve `tokens:check`
           paleti değiştirdiğinde çubuk kendiliğinden uyuyor. */
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color.lerp(c.panelHeader, Colors.white, 0.10)!,
            c.panelHeader,
            Color.lerp(c.panelHeader, Colors.black, 0.10)!,
          ],
          stops: const [0, 0.55, 1],
        ),
        border: Border(bottom: BorderSide(color: c.borderStrong, width: 2)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      child: Row(
        children: [
          // ── SOL: kaynak (sabit genişlik) ──────────────────────────────────
          _Res(kind: 'gold', value: r.gold.floor()),
          const SizedBox(width: 6),
          _Res(kind: 'food', value: r.food.floor()),

          // ── ORTA: koordinat ───────────────────────────────────────────────
          // ⚠️ Şehir ADI burada YOK, web'in mobil düzeniyle aynı: ad zaten şeritte yazıyor
          // ve dar ekranda ikisini birden sığdırmak koordinatı kırpıyordu. Mobilde
          // koordinat sayfa başlığının yerini alıyor ve VURGULU (kullanıcı, 2026-07-30).
          Expanded(
            child: Center(
              child: city == null
                  ? const SizedBox.shrink()
                  : _Plaka(
                      child: Text(
                        '${city.coordinates.k}:${city.coordinates.d}'
                        ':${city.coordinates.s}',
                        style: TextStyle(
                          color: c.onPanelHeader,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.3,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
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
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: c.info.withValues(alpha: 0.15),
                  border: Border.all(color: c.info),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  'Tatilde',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: c.info,
                  ),
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

/// ⭐ ÇUBUK ÜZERİNDEKİ KABARTMA KUTU — kaynak ve koordinat aynı kabı paylaşıyor.
///
/// ⚠️ Tek bir yerde tanımlı olması şart: iki kutunun kenar yarıçapı ya da saydamlığı
/// birbirinden kayarsa çubuk "toplanmamış" görünür ve bu tam olarak düzeltmeye çalıştığımız
/// izlenim. Renkler `panelHeader`ın üstüne binen saydamlıklar — ham renk yok.
class _Plaka extends StatelessWidget {
  const _Plaka({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: Color.lerp(c.panelHeader, Colors.black, 0.14),
        border: Border.all(color: c.borderStrong.withValues(alpha: 0.55)),
        borderRadius: BorderRadius.circular(7),
      ),
      child: child,
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
    final c = MwColors.of(context);
    return _Plaka(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // ⭐ Web'in kendi görselleri (`assets/ui/gold.png` · `food.png`), Material ikonu değil.
          MwIcon(folder: 'ui', id: kind, size: 15),
          const SizedBox(width: 4),
          SizedBox(
            // ⚠️ 74 → 68: kutunun kendi dolgusu genişlik eklediği için sayı alanı biraz
            //    daraltıldı, yoksa üç kutu dar telefonda orta bölgeyi eziyordu.
            width: 68,
            child: Text(
              mwNumber(value),
              style: TextStyle(
                /* ⚠️⚠️ Sayı `gold`/`food` token'ıyla boyanmak İSTENDİ ama VAZGEÇİLDİ:
                   açık temada `panelHeader` (#C89B5A) ile `gold` (#9A7413) birbirine çok
                   yakın iki kahve tonu ve sayı okunmaz hâle geliyordu. Koyu temada sorun
                   yok, ama tek bir temada bozulan bir renk seçimi yine bozuk bir seçimdir.
                   Rengi İKONLAR taşıyor; sayı iki temada da garantili kontrastta. */
                color: c.onPanelHeader,
                fontSize: 13,
                fontWeight: FontWeight.w700,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
      ),
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

    /* ⭐ Nokta artık kendi kabında: 9 px'lik çıplak bir daire çubuğun sağ ucunda kaybolmuş
       gibi duruyordu. Halka onu bir GÖSTERGE hâline getiriyor ve renk aynı kalıyor.
       ⚠️ Dokunma hedefi büyütülmedi — nokta tıklanabilir değil, yalnız ipucu taşıyor. */
    return Tooltip(
      message: etiket,
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: renk.withValues(alpha: 0.18),
          shape: BoxShape.circle,
          border: Border.all(color: renk.withValues(alpha: 0.55)),
        ),
        child: Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: renk, shape: BoxShape.circle),
        ),
      ),
    );
  }
}
