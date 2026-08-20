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
/// `View.of` masum bir okuma değil, **inherited bağımlılık KAYDEDEN** bir arama
/// (`dependOnInheritedWidgetOfExactType`). Onu `build`/`didChangeDependencies` dışında çağırmak
/// bağımlılık defterini bozuyor ve arıza çağrıldığı yerde değil, ilgili inherited öge
/// kaldırılırken patlıyor. Bu yüzden bağımlılık **yaşam döngüsünün kendi yerinde** kuruluyor,
/// `didChangeMetrics` yalnız saklanan nesneden **okuyor** (okuma bağımlılık üretmez).
///
/// ⚠️⚠️ **DÜZELTME (2026-08-20) — bu blok bir gün boyunca YANLIŞ bir neden yazıyordu.**
/// Burada *"ilk yazımdaki `View.of` çağrısı kullanıcının bildirdiği kırmızı ekrana yol açtı"*
/// diyordu. **Yanlış.** O kırmızı ekran cihazda yeniden üretildi ve kök nedeni başka bir
/// dosyaydı: `native.dart` · `mwTextSheet` denetleyiciyi `TextField` hâlâ ağaçtayken atıyordu
/// (ayrıntı orada). Yanılgının sebebi öğretici: kırmızı ekran **son** istisnayı yazıyor,
/// ilkini değil. Ekranda `_dependents.isEmpty` görünüyordu; oysa `flutter run` konsolundaki
/// İLK blok *"A TextEditingController was used after being disposed"* diyordu ve gerisi
/// artçıydı.
///
/// ⭐ Yukarıdaki kural yine de DOĞRU ve kalıyor — yalnız gerekçesi "şu çökmeyi düzeltti" değil,
/// "böylesi zaten geçersiz kullanım". ⚠️ Bir düzeltmeyi, hatayı üreten deneyi tekrarlamadan
/// "tamam" diye yazmanın bedeli tam olarak bu paragraf.
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
