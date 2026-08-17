/// TASARIM SİSTEMİ PRİMİTİFLERİ.
///
/// ⚠️ **Ham renk YAZILMAZ** — her şey `Theme.of(context).colorScheme`ten ya da
/// `lib/gen/tokens.dart`ten gelir (§13.13.1, README "Değişmez kurallar" madde 3).
/// Golden testler yalnız BU dosyadaki bileşenleri kilitliyor (`MOBIL_MIMARI.md` §5.4):
/// `tokens:check` paletin içeriğini, golden ise paletin gerçekten BOYANDIĞINI ölçüyor.
library;

import 'package:flutter/material.dart';

import '../gen/tokens.dart';

/// Semantik renklere tema üzerinden erişim — `MwLightColors`/`MwDarkColors` seçimini
/// tek yerde yapar. Bileşenler `MwColors.of(context).gold` yazar, `isDark ? ... : ...` değil.
class MwColors {
  const MwColors._(this.dark);

  factory MwColors.of(BuildContext c) =>
      MwColors._(Theme.of(c).brightness == Brightness.dark);

  final bool dark;

  Color get gold => dark ? MwDarkColors.gold : MwLightColors.gold;
  Color get food => dark ? MwDarkColors.food : MwLightColors.food;
  Color get danger => dark ? MwDarkColors.danger : MwLightColors.danger;
  Color get warning => dark ? MwDarkColors.warning : MwLightColors.warning;
  Color get success => dark ? MwDarkColors.success : MwLightColors.success;
  Color get info => dark ? MwDarkColors.info : MwLightColors.info;
  Color get muted => dark ? MwDarkColors.textMuted : MwLightColors.textMuted;
  Color get border => dark ? MwDarkColors.border : MwLightColors.border;
  Color get borderStrong =>
      dark ? MwDarkColors.borderStrong : MwLightColors.borderStrong;
  Color get raised =>
      dark ? MwDarkColors.surfaceRaised : MwLightColors.surfaceRaised;
  Color get panelHeader =>
      dark ? MwDarkColors.panelHeader : MwLightColors.panelHeader;
  Color get onPanelHeader =>
      dark ? MwDarkColors.onPanelHeader : MwLightColors.onPanelHeader;
}

/// ⭐ BAŞLIK YAZI TİPİ — web'deki `.display` sınıfının karşılığı (Cinzel).
///
/// ⚠️⚠️ **Oyuncunun yazdığı metinde KULLANILMAZ.** Cinzel tasarımı gereği küçük harf
/// taşımıyor: küçük harfleri büyük harf gibi çiziyor. Web'de bir ara şehir adına uygulandı ve
/// oyuncu «Mithlond» yazdığı hâlde ekranda «MİTHLOND» görünüyordu. Yalnız SABİT başlıklarda —
/// şehir adı, kullanıcı adı ve sohbet metni gövde fontunda kalır.
///
/// ⚠️ `fontVariations` ŞART: Cinzel değişken bir font (Google Fonts'ta statik sürümü yok) ve
/// yalnız `fontWeight` yazmak varyasyon eksenini oynatmıyor — başlık ince çizilirdi.
TextStyle mwDisplayStyle({Color? color, double fontSize = 13}) => TextStyle(
  fontFamily: MwFonts.display,
  fontFamilyFallback: MwFonts.displayFallback,
  fontVariations: const [FontVariation('wght', 600)],
  fontWeight: FontWeight.w600,
  fontSize: fontSize,
  letterSpacing: 0.8,
  color: color,
);

/// Web'deki `Panel` — başlık bandı + çerçeve. Ana görsel birim.
class MwPanel extends StatelessWidget {
  const MwPanel({super.key, this.title, required this.child, this.trailing});

  final String? title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border.all(color: c.border),
        borderRadius: BorderRadius.circular(10),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        // ⚠️ `min` ŞART: varsayılan `max` paneli dikeyde EKRANIN TAMAMINA yayıyor. Giriş
        // ekranında fark edilmemişti çünkü orası `SingleChildScrollView` içinde (sonsuz
        // yükseklik → kendiliğinden daralıyor); sürüm kapısı ekranında panel bomboş bir
        // şekilde alta kadar uzadı. Paylaşılan primitifteki bu kusur her yeni ekranı ısırırdı.
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null)
            Container(
              color: c.panelHeader,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      // ⚠️ Web'de de büyük harf (`uppercase` sınıfı). Cinzel zaten küçük harf
                      // taşımıyor; metni açıkça büyütmek harf aralığının tutarlı olmasını
                      // sağlıyor ve fontun yüklenmediği durumda da aynı görünüyor.
                      mwUpper(title!),
                      style: mwDisplayStyle(
                        color: c.onPanelHeader,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  ?trailing,
                ],
              ),
            ),
          Padding(padding: const EdgeInsets.all(12), child: child),
        ],
      ),
    );
  }
}

enum MwButtonKind { primary, ghost, danger }

class MwButton extends StatelessWidget {
  const MwButton({
    super.key,
    required this.label,
    this.onTap,
    this.kind = MwButtonKind.primary,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onTap;
  final MwButtonKind kind;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = MwColors.of(context);
    final (bg, fg) = switch (kind) {
      MwButtonKind.primary => (scheme.primary, scheme.onPrimary),
      MwButtonKind.danger => (c.danger, scheme.onPrimary),
      MwButtonKind.ghost => (Colors.transparent, scheme.onSurface),
    };

    return FilledButton(
      // ⚠️ `busy` iken `onTap` null verilir → düğme hem görsel hem işlevsel olarak kapanır.
      // Yalnız görsel kapatmak çift gönderime açık kapı bırakırdı.
      onPressed: busy ? null : onTap,
      style: FilledButton.styleFrom(
        backgroundColor: bg,
        foregroundColor: fg,
        side: kind == MwButtonKind.ghost
            ? BorderSide(color: c.borderStrong)
            : null,
        minimumSize: const Size.fromHeight(46),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
      child: busy
          ? SizedBox(
              height: 18,
              width: 18,
              child: CircularProgressIndicator(strokeWidth: 2, color: fg),
            )
          : Text(label),
    );
  }
}

/// Web'deki `ErrorBox`.
class MwErrorBox extends StatelessWidget {
  const MwErrorBox(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: c.danger.withValues(alpha: 0.12),
        border: Border.all(color: c.danger),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(message, style: TextStyle(color: c.danger)),
    );
  }
}

/// Web'deki `Empty`.
class MwEmpty extends StatelessWidget {
  const MwEmpty(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 32),
    child: Center(
      child: Text(message, style: TextStyle(color: MwColors.of(context).muted)),
    ),
  );
}

/// Kaynak göstergesi (altın/yemek). Sayı biçimi Türkçe binlik ayracıyla.
///
/// ⚠️⚠️ **OYUNUN KENDİ GÖRSELLERİ — Material ikonu DEĞİL** (kullanıcı bildirimi, 2026-08-17).
/// Bu bileşen bir ara `Icons.circle` ve `Icons.eco` çiziyordu: ekranda altın yerine düz bir
/// daire, yemek yerine bir yaprak görünüyordu. Oysa `assets/ui/gold.png` ve `food.png` zaten
/// depoda ve bilgi çubuğu (`info_bar.dart` · `_Res`) onları kullanıyordu — yani iki kaynak
/// gösterimi **aynı ekranda ayrışıyordu**.
///
/// ⭐ Kural: kaynak, birim, yapı, teknik ve görev simgelerinin hepsi web'le AYNI dosyalardan
/// gelir (`pnpm assets:build` eşitler, `assets:check` sürüklenmeyi kırar). Material ikonu
/// yalnız oyunun kendi görseli OLMAYAN yerlerde (ok, çarpı, geri) kullanılabilir.
class MwResource extends StatelessWidget {
  const MwResource({
    super.key,
    required this.kind,
    required this.amount,
    this.size = 16,
  });

  /// `gold` · `food` — dosya adıyla birebir aynı.
  final String kind;
  final int amount;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        MwIcon(folder: 'ui', id: kind, size: size),
        const SizedBox(width: 4),
        Text(
          mwNumber(amount),
          style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
        ),
      ],
    );
  }
}

/// ⭐ MENÜ İKONU — web ile **birebir aynı görsel** (`apps/web/public/assets/menu/`).
///
/// Material ikonları yerine oyunun kendi ikonları kullanılıyor: iki istemcinin aynı oyunu
/// göstermesi kullanıcının «tam eşitlik» kararının görünen yüzü. Dosyalar `pnpm assets:build`
/// ile eşitleniyor, `pnpm assets:check` sürüklenmeyi kırıyor.
///
/// ⚠️ `errorBuilder` ŞART: dosya adı katalog `id`'sinden üretiliyor ve eşleşmeyen bir id
/// (ör. sunucuya yeni birim eklendi, görseli henüz yok) ekranı kırmızı hata kutusuna
/// çevirirdi. Yerine aynı ölçüde boşluk bırakılıyor — web'deki `CatalogIcon` ile aynı karar.
class MwIcon extends StatelessWidget {
  const MwIcon({
    super.key,
    required this.folder,
    required this.id,
    this.size = 24,
    this.color,
  });

  /// `menu` · `units` · `buildings` · `techs` · `defenses` · `missions` · `hero` · `ranks` · `ui`
  final String folder;
  final String id;
  final double size;

  /// Verilirse ikon tek renge boyanır (alt sekmede seçili/seçili değil ayrımı için).
  final Color? color;

  @override
  Widget build(BuildContext context) => Image.asset(
    'assets/$folder/$id.png',
    width: size,
    height: size,
    color: color,
    filterQuality: FilterQuality.medium,
    errorBuilder: (_, _, _) => SizedBox(width: size, height: size),
  );
}

/// `tr-TR` binlik ayracı — web'deki `fmt()` ile aynı görünüm.
/// ⚠️ `intl` paketi EKLENMEDİ: tek ihtiyacımız binlik ayracı ve `intl` yalnız bunun için
/// ~1 MB ve bir yerelleştirme kurulum adımı getiriyor.
String mwNumber(int n) {
  final s = n.abs().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write('.');
    b.write(s[i]);
  }
  return '${n < 0 ? '-' : ''}$b';
}

/// ⭐ AKTİVİTE NOKTASI — «bu şehirde burada süren bir iş var».
///
/// Web'deki `ActivityDot` karşılığı, aynı ölçü ve aynı parıltı. ⚠️ Sayı DEĞİL nokta: kaç iş
/// olduğu değil, olup olmadığı soruluyor; sayı koymak sekme şeridini şişirirdi.
class MwActivityDot extends StatelessWidget {
  const MwActivityDot({super.key});

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Container(
      width: 7,
      height: 7,
      decoration: BoxDecoration(
        color: c.success,
        shape: BoxShape.circle,
        // Web'de de gölge var (`shadow-[0_0_4px_…]`): koyu zeminde nokta yoksa kayboluyor.
        boxShadow: [BoxShadow(color: c.success, blurRadius: 4)],
      ),
    );
  }
}

/// ⭐ ALARM NOKTASI — «bu şehre düşmanca bir hareket geliyor».
///
/// ⚠️ `MwActivityDot`la KARIŞTIRILMAMALI, ikisi farklı soruyu cevaplıyor:
///   • yeşil, sabit  → *benim* burada süren bir işim var (üretim, yükseltme)
///   • kırmızı, atan → *bana* bir şey geliyor ve iyi bir şey değil
/// Aynı görsel dili paylaşsalardı oyuncu kendi çiftlik yükseltmesiyle gelen saldırıyı bir
/// bakışta ayıramazdı.
///
/// ⚠️ Atma (pulse) **süsleme değil**: web'de de `animate-pulse` var ve sebebi şu — nokta
/// küçük, kale simgesinin köşesinde duruyor ve hareket etmeyen küçük bir kırmızı leke,
/// ekrandaki onlarca sabit ögenin arasında görülmüyor.
class MwAlertDot extends StatefulWidget {
  const MwAlertDot({super.key, this.size = 9});

  final double size;

  @override
  State<MwAlertDot> createState() => _MwAlertDotState();
}

class _MwAlertDotState extends State<MwAlertDot>
    with SingleTickerProviderStateMixin {
  // ⚠️ `repeat(reverse: true)`: `Curves` ile ileri geri sönen bir nabız. Tek yönlü tekrar,
  // her turun başında sert bir sıçrama üretir.
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return FadeTransition(
      // Tam saydamlığa inmiyor: kaybolan bir uyarı, "acaba var mıydı?" sorusu doğuruyor.
      opacity: Tween<double>(begin: 1, end: 0.35).animate(_c),
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          color: c.danger,
          shape: BoxShape.circle,
          border: Border.all(color: c.borderStrong, width: 0.5),
          boxShadow: [BoxShadow(color: c.danger, blurRadius: 4)],
        ),
      ),
    );
  }
}

/// ⭐⭐ TÜRKÇE BÜYÜK HARF — `i` → `İ` (kullanıcı bildirimi, 2026-08-17).
///
/// ⚠️ Dart'ın `toUpperCase()`i **yerelden bağımsızdır** ve Unicode'un varsayılan eşlemesini
/// uygular: `i` → `I`. Türkçede doğrusu `İ` (U+0130). Ekranda «AKADEMI», «İNŞAAT» yerine
/// «INSAAT» görünmesinin sebebi buydu.
///
/// ⚠️ Yalnız `i` düzeltiliyor, `ı` DEĞİL: `ı` (U+0131) zaten doğru şekilde `I`ya dönüyor.
/// İkisini birden ele almaya çalışmak (ör. `I` → `ı` ters yönü) burada gereksiz — bu
/// fonksiyon yalnız büyütüyor, küçültmüyor.
///
/// ⚠️ `İ` girdide zaten varsa dokunulmuyor: `'İ'.toUpperCase()` `İ` döndürüyor (ölçüldü).
///
/// ⚠️ **Dart `intl` paketine gerek yok.** `toUpperCase` yerel almıyor; yerel duyarlı büyütme
/// için ayrı bir paket taşımak, tek bir harf için koca bir bağımlılık olurdu.
String mwUpper(String s) => s.replaceAll('i', 'İ').toUpperCase();

/// ⭐ ONAY DİYALOĞU — geri alınamaz işlemlerin tek kapısı.
///
/// ⚠️ Web'de de global (`ConfirmProvider`): her çağıran kendi diyaloğunu kursa metinler ve
/// davranış ayrışırdı.
///
/// ⚠️ Gövdede **RAKAM YOK** (kullanıcı kararı, 2026-08-03): *"Ekranda görünen değerle iptal
/// onayını verildiği anda farklılık olur. Sadece bilgilendirme olması yeterli."* Web'de bir ara
/// iade tutarı istemcide hesaplanıp gösteriliyordu; gerçek iade sunucuda ONAY ANINDA yeniden
/// hesaplandığı için arada geçen saniyeler iki sayıyı kaçınılmaz olarak ayrıştırıyordu.
Future<bool> mwConfirm(
  BuildContext context, {
  required String title,
  required String body,
  String confirmLabel = 'Onayla',
  bool danger = false,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) {
      final c = MwColors.of(ctx);
      return AlertDialog(
        // ⚠️ Cinzel küçük harfi büyük harf gibi çiziyor → `i` noktasız kalıyordu (`mwUpper`).
        title: Text(mwUpper(title), style: mwDisplayStyle(fontSize: 15)),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Vazgeç'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: danger ? c.danger : null,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(confirmLabel),
          ),
        ],
      );
    },
  );
  return ok ?? false;
}

/// Adet kutusu — web'deki `AmountInput`.
///
/// ⚠️ Değer **dize** olarak tutuluyor, sayı olarak değil. Sayı tutup her tuşta kelepçelemek
/// (`max(1, …)`) alanın hiç boşalamamasına yol açıyor: oyuncu `1`i silmek isteyince alan
/// anında 1'e geri sıçrıyor ve `23` yazmak için önce metni seçmek gerekiyordu. Web'de tam
/// olarak bu hata yaşandı (kullanıcı: *"1 yazısı minimum değer olduğu için silinemiyor"*).
class MwAmountInput extends StatelessWidget {
  const MwAmountInput({
    super.key,
    required this.controller,
    this.hint = 'adet',
    this.width = 78,
    this.enabled = true,
    this.onChanged,
  });

  final TextEditingController controller;
  final String hint;
  final double width;
  final bool enabled;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      height: 38,
      child: TextField(
        controller: controller,
        enabled: enabled,
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        onChanged: onChanged,
        style: const TextStyle(
          fontSize: 14,
          fontFeatures: [FontFeature.tabularFigures()],
        ),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: TextStyle(fontSize: 12, color: MwColors.of(context).muted),
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 6,
            vertical: 8,
          ),
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }
}

/// İnce ilerleme çubuğu — geri sayımların altında.
///
/// ⚠️ `LinearProgressIndicator` yerine elle çizildi: yeni bir birime geçerken çubuğun
/// **animasyonsuz** sıfırlanması gerekiyor. Yumuşak geçiş, dolmuş çubuğun geri sarması gibi
/// görünüyor (web'de aynı karar).
class MwBar extends StatelessWidget {
  const MwBar({super.key, required this.value, this.animate = true});

  final double value;
  final bool animate;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: Container(
        height: 6,
        decoration: BoxDecoration(
          color: c.raised,
          border: Border.all(color: c.border),
          borderRadius: BorderRadius.circular(999),
        ),
        child: FractionallySizedBox(
          alignment: Alignment.centerLeft,
          widthFactor: value.clamp(0.0, 1.0),
          child: AnimatedContainer(
            duration: animate
                ? const Duration(milliseconds: 950)
                : Duration.zero,
            curve: Curves.linear,
            color: Theme.of(context).colorScheme.primary,
          ),
        ),
      ),
    );
  }
}

/// Küçük düğme — satır içi eylemler (Üret · İptal et · ↑ ↓).
class MwSmallButton extends StatelessWidget {
  const MwSmallButton({
    super.key,
    required this.label,
    this.onTap,
    this.kind = MwButtonKind.primary,
    this.minWidth = 0,
  });

  final String label;
  final VoidCallback? onTap;
  final MwButtonKind kind;
  final double minWidth;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = MwColors.of(context);
    final (bg, fg) = switch (kind) {
      MwButtonKind.primary => (scheme.primary, scheme.onPrimary),
      MwButtonKind.danger => (c.danger, scheme.onPrimary),
      MwButtonKind.ghost => (Colors.transparent, scheme.onSurface),
    };

    return FilledButton(
      onPressed: onTap,
      style: FilledButton.styleFrom(
        backgroundColor: bg,
        foregroundColor: fg,
        side: kind == MwButtonKind.ghost
            ? BorderSide(color: c.borderStrong)
            : null,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        minimumSize: Size(minWidth, 34),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
      child: Text(label),
    );
  }
}
