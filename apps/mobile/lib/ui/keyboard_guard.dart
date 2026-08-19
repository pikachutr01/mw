/// ⭐⭐ KLAVYE KAPANINCA ODAK DA KALKAR — uygulamanın TAMAMI için tek bekçi.
///
/// Kullanıcı isteği (2026-08-19): *"oyundaki tüm inputlarda focus varken klavyeyi kapatınca
/// focusu da kaldıralım. Klavye kapanmış olsa bile cursor içinde yanıp sönmeye devam ediyor."*
///
/// ─ Neden gerçek bir arıza ────────────────────────────────────────────────────────────────
/// Android'de geri tuşuyla klavyeyi kapatmak `TextField`ın odağını **almıyor**: imleç yanıp
/// sönmeye devam ediyor ve alan hâlâ "aktif". Kullanıcının verdiği örnek tam da bunun pahalı
/// hâli: Baraka'da klavyeyi kapat, bir askere uzun bas, künye sheet'ini kapat → sheet
/// kapanırken odak hâlâ o alanda olduğu için **klavye kendiliğinden geri açılıyor**. Oyuncu
/// hiçbir yazı alanına dokunmadığı hâlde ekranın yarısını klavye kaplıyor.
///
/// ─ ⚠️⚠️ NEDEN "inset 0 ise odağı bırak" YETMEZ ──────────────────────────────────────────
/// Bir `TextField` odağı aldığı **anda** klavye henüz açılmamıştır, yani alt boşluk hâlâ 0.
/// Koşulsuz bir kural o karede odağı anında geri alır ve hiçbir alana yazı yazılamaz —
/// klavye açılır açılmaz kapanır. Bu yüzden bekçi **önce klavyeyi görmüş olmayı** şart
/// koşuyor (`_klavyeVardi`): yalnız açık→kapalı GEÇİŞİNDE odak bırakılıyor.
///
/// ─ ⚠️⚠️ GÖRÜNÜM `didChangeDependencies`TE ALINIYOR, `didChangeMetrics`TE DEĞİL ───────────
/// İlk yazımda `View.of(context)` doğrudan `didChangeMetrics` içinde çağrılıyordu ve bu
/// **kırmızı ekrana** yol açtı (kullanıcı bildirdi, 2026-08-20):
///
///   `'_dependents.isEmpty': is not true` — `InheritedElement.debugDeactivated`
///
/// Sebep: `View.of` masum bir okuma değil, **inherited bağımlılık KAYDEDEN** bir arama
/// (`dependOnInheritedWidgetOfExactType`). Onu `build`/`didChangeDependencies` dışında, hem de
/// çerçeve ağacı taşırken çağırmak bağımlılık defterini bozuyor; arıza da çağrıldığı yerde
/// değil, ilgili inherited öge kaldırılırken patlıyor — yani teşhisi zor.
///
/// ⭐ Doğrusu: bağımlılığı **yaşam döngüsünün kendi yerinde** kur (`didChangeDependencies`),
/// görünümü sakla, `didChangeMetrics` yalnız saklanan nesneden **okusun**. Okuma bir bağımlılık
/// üretmiyor.
///
/// ⚠️ Eşik 0 değil **`_kEsik`**: bazı cihazlarda klavye kapandığında gezinme çubuğu yüzünden
/// birkaç piksellik bir alt boşluk kalıyor ve tam sıfır arayan bir kural o cihazlarda hiç
/// çalışmazdı — sessizce, yalnız bazı telefonlarda.
library;

import 'dart:ui' show FlutterView;

import 'package:flutter/widgets.dart';

/// Bunun altındaki her boşluk "klavye kapalı" sayılır.
const double _kEsik = 40;

class MwKeyboardGuard extends StatefulWidget {
  const MwKeyboardGuard({super.key, required this.child});

  final Widget child;

  @override
  State<MwKeyboardGuard> createState() => _MwKeyboardGuardState();
}

class _MwKeyboardGuardState extends State<MwKeyboardGuard>
    with WidgetsBindingObserver {
  bool _klavyeVardi = false;

  /// ⚠️ `didChangeDependencies`te tazeleniyor — gerekçesi dosya başlığında.
  FlutterView? _view;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _view = View.maybeOf(context);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeMetrics() {
    final view = _view;
    if (view == null) return;
    final alt = view.viewInsets.bottom / view.devicePixelRatio;

    if (alt > _kEsik) {
      _klavyeVardi = true;
      return;
    }
    if (!_klavyeVardi) return;
    _klavyeVardi = false;

    /* ⚠️ Bir sonraki kareye erteleniyor: kapanma animasyonu sürerken odağı bırakmak, bazı
       cihazlarda klavyenin yarı yolda geri açılmasına yol açıyor (sistem hâlâ alanı aktif
       sanıyor). Kare sonunda durum oturmuş oluyor. */
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final odak = FocusManager.instance.primaryFocus;
      // ⚠️ Yalnız GERÇEKTEN bir alan odaktaysa: `unfocus` çağrısını koşulsuz yapmak
      //    kaydırma/gezinme odağını da bozabiliyor.
      if (odak != null && odak.hasPrimaryFocus) odak.unfocus();
    });
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
