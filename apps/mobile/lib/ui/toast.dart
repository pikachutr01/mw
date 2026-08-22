/// ⭐⭐ TOAST — ekranın altında beliren, kendiliğinden sönen kısa bildirim.
///
/// Kullanıcı isteği (2026-08-21): *"görev emri verilince toast/notify"*. Web'de karşılığı
/// `components/Toaster.tsx`; buradaki davranış onunla **bilerek eşleniyor** (6 sn, en fazla 3,
/// tıklanınca rotaya git) çünkü aynı oyun iki istemcide farklı ritimde konuşmamalı.
///
/// ─ ⚠️ NEDEN HAZIR PAKET DEĞİL ────────────────────────────────────────────────────────────
/// `SnackBar`/`ScaffoldMessenger` depoda hiç kullanılmıyor ve kullanılmaması bilinçli: Material
/// tonu oyunun ahşap/parşömen temasına ait değil ve `SnackBar` en fazla bir tane gösteriyor,
/// oysa web'de üç toast yığılabiliyor. Depo diğer bütün ilkelleri (`MwPanel`, `MwButton`,
/// `MwTapTip`) kendi yazıyor; bu da onlardan biri.
///
/// ─ ⚠️ NEDEN `Overlay` DEĞİL, `Stack` ────────────────────────────────────────────────────
/// `session_conflict.dart`ın kurduğu desen izleniyor: perde, router'ın `builder`ında sarmalayan
/// bir `Stack`. `OverlayEntry` elle eklenip silinen bir kaynak ve ekran değişimlerinde sızıntı
/// üretiyor; `Stack` + sağlayıcı ise Riverpod'un ömrüne bağlı ve kendiliğinden temizleniyor.
///
/// ⚠️ Yerleşim `SessionConflictGate`in **İÇİNDE** (bkz. `bootstrap.dart`): oturum devralındığında
/// perde toast'ın da üstünü örtmeli. O anda oyuncunun okuması gereken tek şey perdenin kendisi.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'primitives.dart';

/// ⚠️ `id` kuyruğun kendi sayacı, sunucudan gelen bir kimlik DEĞİL: yerel onaylar da toast
/// üretiyor ve onların sunucuda karşılığı yok.
typedef MwToastData = ({
  int id,
  String title,
  String? body,
  String? url,
  String? category,
});

/// Web'deki `DWELL_MS` ile aynı. ⚠️ 6 sn: daha kısası iki satırlık bir gövdeyi okutmuyor,
/// daha uzunu ekranda unutulmuş gibi duruyor.
const Duration kToastDwell = Duration(seconds: 6);

/// Web'deki `MAX_STACK` ile aynı. ⚠️ Sınır olmasaydı arka arkaya gelen emirler ekranı
/// baştan aşağı kaplardı; en eskisi düşüyor çünkü en yenisi en ilgili olan.
const int kToastMaxStack = 3;

/// Giriş/çıkış animasyonu — web'deki 260/220 ms'e yakın, tek değerde birleştirildi.
const Duration kToastMotion = Duration(milliseconds: 240);

class ToastQueue extends Notifier<List<MwToastData>> {
  int _sayac = 0;
  final Map<int, Timer> _zamanlayicilar = {};

  @override
  List<MwToastData> build() {
    // ⚠️ Sağlayıcı ölürken zamanlayıcılar iptal ediliyor: kalan bir `Timer` sökülmüş bir
    //    duruma yazmaya çalışır ve Flutter bunu hata olarak bildirir.
    ref.onDispose(() {
      for (final t in _zamanlayicilar.values) {
        t.cancel();
      }
      _zamanlayicilar.clear();
    });
    return const [];
  }

  /// ⚠️ Başlıksız toast **yutuluyor** (web'de aynı kural): gövdesi olsa bile başlıksız bir
  /// kutu ekranda "bir şey oldu ama ne" diyor.
  void show({
    required String title,
    String? body,
    String? url,
    String? category,
  }) {
    if (title.trim().isEmpty) return;
    final id = ++_sayac;
    final yeni = [
      ...state,
      (id: id, title: title, body: body, url: url, category: category),
    ];

    /* ⚠️ Taşan en ESKİLER düşüyor ve zamanlayıcıları da iptal ediliyor: yalnız listeden
       çıkarsaydık, ölü bir kaydın zamanlayıcısı 6 sn sonra uyanıp `dismiss` çağırırdı.
       Zararsız ama gereksiz bir durum güncellemesi ve sızıntının ta kendisi. */
    final fazla = yeni.length - kToastMaxStack;
    if (fazla > 0) {
      for (final eski in yeni.take(fazla)) {
        _zamanlayicilar.remove(eski.id)?.cancel();
      }
      state = yeni.sublist(fazla);
    } else {
      state = yeni;
    }

    _zamanlayicilar[id] = Timer(kToastDwell, () => dismiss(id));
  }

  void dismiss(int id) {
    _zamanlayicilar.remove(id)?.cancel();
    state = state.where((t) => t.id != id).toList();
  }
}

final toastProvider = NotifierProvider<ToastQueue, List<MwToastData>>(
  ToastQueue.new,
);

/// Kategoriye göre simge — web'deki `ICON` tablosunun karşılığı.
///
/// ⚠️ Material ikonu kullanılıyor, `assets/` değil: bunlar oyun nesnesi değil arayüz
/// işaretleri (`MwResource` yorumundaki ayrım). Bilinmeyen kategori nötr noktaya düşüyor.
IconData toastIcon(String? category) => switch (category) {
  'attack' => Icons.gpp_maybe_outlined,
  'dm' => Icons.mail_outline,
  'report' => Icons.description_outlined,
  'production' => Icons.construction_outlined,
  'mention' => Icons.alternate_email,
  _ => Icons.circle_outlined,
};

/// ⭐ TOAST KATMANI — `bootstrap.dart`ta bir kez sarmalanıyor.
class MwToastHost extends ConsumerWidget {
  const MwToastHost({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final liste = ref.watch(toastProvider);
    if (liste.isEmpty) return child;

    /* ⚠️⚠️ ALT ÇUBUĞUN ÜSTÜNDE. Toast ekranın dibine yapışsaydı gezinme çubuğunu örterdi ve
       oyuncu toast sönene kadar sekme değiştiremezdi. 78 px kaba bir sayı değil: alt çubuk
       ~64 px ve üstünde bir parmak payı bırakıyor. `viewPadding.bottom` jest çubuğu olan
       telefonlarda ayrıca ekleniyor. */
    final alt = 78 + MediaQuery.of(context).viewPadding.bottom;

    return Stack(
      children: [
        child,
        Positioned(
          left: 12,
          right: 12,
          bottom: alt,
          /* ⚠️ `IgnorePointer` DEĞİL: toast tıklanabilir olmalı. Ama `Column` yalnız kendi
             yüksekliği kadar yer kaplıyor (`MainAxisSize.min`), yani altındaki ekranın geri
             kalanı dokunmaya açık kalıyor. */
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            // ⚠️ En YENİ altta (web'deki `flex-col-reverse` ile aynı): göz en son geleni
            //    parmağa en yakın yerde arıyor.
            children: [
              for (final t in liste) _Toast(key: ValueKey(t.id), data: t),
            ],
          ),
        ),
      ],
    );
  }
}

class _Toast extends ConsumerStatefulWidget {
  const _Toast({super.key, required this.data});

  final MwToastData data;

  @override
  ConsumerState<_Toast> createState() => _ToastState();
}

class _ToastState extends ConsumerState<_Toast>
    with SingleTickerProviderStateMixin {
  late final _ac = AnimationController(vsync: this, duration: kToastMotion)
    ..forward();

  @override
  void dispose() {
    _ac.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final scheme = Theme.of(context).colorScheme;
    final t = widget.data;

    return SlideTransition(
      // ⚠️ ALTTAN giriyor, web'de sağdan. Ayrım bilinçli: telefonda toast zaten ekranın
      //    dibinde duruyor ve yanlamasına giriş, dar ekranda bir kaydırma jesti gibi okunuyor.
      position: Tween<Offset>(
        begin: const Offset(0, 0.35),
        end: Offset.zero,
      ).animate(CurvedAnimation(parent: _ac, curve: Curves.easeOutCubic)),
      child: FadeTransition(
        opacity: _ac,
        child: Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(8),
              // ⚠️ Yolu olmayan toast tıklanmıyor (web'de de öyle): tıklanabilir görünüp
              //    hiçbir yere gitmemek, bozuk bir düğmeden farksız olurdu.
              onTap: t.url == null
                  ? null
                  : () {
                      ref.read(toastProvider.notifier).dismiss(t.id);
                      context.go(t.url!);
                    },
              child: Container(
                padding: const EdgeInsets.fromLTRB(10, 9, 6, 9),
                decoration: BoxDecoration(
                  color: c.raised,
                  border: Border.all(color: c.borderStrong, width: 2),
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x55000000),
                      blurRadius: 10,
                      offset: Offset(0, 3),
                    ),
                  ],
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(toastIcon(t.category), size: 18, color: c.muted),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          /* ⚠️⚠️ BAŞLIKTA CINZEL YOK. Web'de kural «`dm` kategorisinde gövde
                             fontu» diye yazılmıştı; burada koşulsuz gövde fontu çünkü toast
                             başlığı sık sık oyuncu adı taşıyor ve Cinzel'in küçük harfi yok.
                             Koşullu yazsaydık, bir gün `report` kategorisiyle gelen bir
                             oyuncu adı sessizce bozulurdu. */
                          Text(
                            t.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: scheme.onSurface,
                            ),
                          ),
                          if (t.body != null && t.body!.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              t.body!,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 12, color: c.muted),
                            ),
                          ],
                        ],
                      ),
                    ),
                    // ⚠️ Kapatma düğmesi ŞART: 6 sn beklemek istemeyen oyuncunun tek çıkışı,
                    //    ve toast tıklanamaz olduğunda (yolu yoksa) tek etkileşim noktası.
                    IconButton(
                      icon: const Icon(Icons.close, size: 16),
                      color: c.muted,
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                        minWidth: 32,
                        minHeight: 32,
                      ),
                      onPressed: () =>
                          ref.read(toastProvider.notifier).dismiss(t.id),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
