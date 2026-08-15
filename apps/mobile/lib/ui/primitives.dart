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
                      title!.toUpperCase(),
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
class MwResource extends StatelessWidget {
  const MwResource({super.key, required this.kind, required this.amount});

  final String kind; // 'gold' | 'food'
  final int amount;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          kind == 'gold' ? Icons.circle : Icons.eco,
          size: 14,
          color: kind == 'gold' ? c.gold : c.food,
        ),
        const SizedBox(width: 4),
        Text(mwNumber(amount)),
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
        title: Text(title, style: mwDisplayStyle(fontSize: 15)),
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
