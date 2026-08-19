// dart format off
// ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: packages/design-tokens/tokens.json
// Flutter tarafı web ile AYNI paleti kullanır (§13.13.1).
//
// ⚠️⚠️ Yukarıdaki `dart format off` DİREKTİFİ ŞART, süs değil. Olmadan `dart format` bu
// dosyayı yeniden sarıyor, sarılmış hâli üretecin çıktısıyla eşleşmiyor ve `tokens:check`
// kırılıyor — yani biçim kapısı ile sürüklenme kapısı birbirini kilitliyor. 2026-08-15'te
// tam olarak bu yaşandı: `dart format lib` çağrısı üretilmiş dosyaları da yeniden yazdı ve
// CI kırıldı. Direktif, çağrı biçiminden bağımsız olarak sorunu kökten kapatıyor.
import 'package:flutter/material.dart';

class MwLightColors {
  static const Color bg = Color(0xFFF3E9D6);
  static const Color surface = Color(0xFFFAF3E3);
  static const Color surfaceRaised = Color(0xFFFFFBF0);
  static const Color border = Color(0xFFD6C3A1);
  static const Color borderStrong = Color(0xFFB99F76);
  static const Color textPrimary = Color(0xFF2B2116);
  static const Color textMuted = Color(0xFF6A5942);
  static const Color accent = Color(0xFF8A5A2B);
  static const Color accentHover = Color(0xFF6F4720);
  static const Color onAccent = Color(0xFFFFFBF0);
  static const Color gold = Color(0xFF9A7413);
  static const Color food = Color(0xFF4F6B33);
  static const Color danger = Color(0xFF9E3324);
  static const Color warning = Color(0xFFB3701A);
  static const Color success = Color(0xFF4F6B33);
  static const Color info = Color(0xFF2F5D8C);
  static const Color own = Color(0xFF2F5D8C);
  static const Color focusRing = Color(0xFF8A5A2B);
  static const Color panelHeader = Color(0xFFC89B5A);
  static const Color onPanelHeader = Color(0xFF2B2116);
  static const Color rowAlt = Color(0xFFF3E9D6);
  static const Color bolt = Color(0xFFA97540);
}

class MwDarkColors {
  static const Color bg = Color(0xFF15110C);
  static const Color surface = Color(0xFF1E1810);
  static const Color surfaceRaised = Color(0xFF2A2218);
  static const Color border = Color(0xFF3B3124);
  static const Color borderStrong = Color(0xFF574733);
  static const Color textPrimary = Color(0xFFEFE3CC);
  static const Color textMuted = Color(0xFFB0A188);
  static const Color accent = Color(0xFFD6A24A);
  static const Color accentHover = Color(0xFFE8B75F);
  static const Color onAccent = Color(0xFF15110C);
  static const Color gold = Color(0xFFE3B84C);
  static const Color food = Color(0xFF8FB05E);
  static const Color danger = Color(0xFFD4674F);
  static const Color warning = Color(0xFFE08A3C);
  static const Color success = Color(0xFF8FB05E);
  static const Color info = Color(0xFF7FA9D4);
  static const Color own = Color(0xFF7FA9D4);
  static const Color focusRing = Color(0xFFE8B75F);
  static const Color panelHeader = Color(0xFF8A5A2B);
  static const Color onPanelHeader = Color(0xFFFAF3E3);
  static const Color rowAlt = Color(0xFF2A2218);
  static const Color bolt = Color(0xFFB8862F);
}

/// Yazı tipleri — web ile AYNI aileler (`tokens.json` · `font`).
///
/// ⚠️ Dosyalar uygulamaya GÖMÜLÜ (`apps/mobile/assets/fonts/`, `pubspec.yaml`); çalışma
/// anında indirilmiyor. Gerekçe MOBIL_MIMARI.md §3.6'da.
///
/// ⚠️ `display` (Cinzel) KÜÇÜK HARF TAŞIMIYOR — küçük harfleri büyük harf gibi çiziyor.
/// Oyuncunun yazdığı metinde (şehir adı, kullanıcı adı) KULLANILMAZ; web'de tam olarak bu
/// hata yaşandı ve «Mithlond» ekranda «MİTHLOND» görünüyordu. Yalnız sabit başlıklarda.
class MwFonts {
  static const String display = 'Cinzel';
  static const List<String> displayFallback = ['EB Garamond', 'Georgia'];
  static const String body = 'Spectral';
  static const List<String> bodyFallback = ['EB Garamond', 'Georgia'];
  static const String mono = 'JetBrains Mono';
  static const List<String> monoFallback = ['Cascadia Mono', 'Segoe UI Mono', 'Menlo', 'Consolas'];
}

class MwTheme {
  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final bg = isDark ? MwDarkColors.bg : MwLightColors.bg;
    final surface = isDark ? MwDarkColors.surface : MwLightColors.surface;
    final accent = isDark ? MwDarkColors.accent : MwLightColors.accent;
    final onAccent = isDark ? MwDarkColors.onAccent : MwLightColors.onAccent;
    final textPrimary = isDark ? MwDarkColors.textPrimary : MwLightColors.textPrimary;
    final danger = isDark ? MwDarkColors.danger : MwLightColors.danger;

    return ThemeData(
      brightness: brightness,
      scaffoldBackgroundColor: bg,
      /* ⭐⭐ SAYFA GEÇİŞİNİN ZEMİNİ (kullanıcı bildirimi, 2026-08-19): *"bir sayfayı ilk
         açtığım anda arka plan kahverengi iken çok kısa bir süre sonra siyaha dönüşüyor."*

         ⚠️⚠️ Sebep Flutter'ın varsayılanıydı, bizim kodumuz değil: Android'de sayfa geçişi
         `ZoomPageTransitionsBuilder` ve o, geçiş süresince zemini **`colorScheme.surface`**
         ile boyuyor. Bizim palette `surface` (#1E1810) sıcak bir koyu kahve, ekranın asıl
         zemini `bg` (#15110C) ise neredeyse siyah — yani her sayfa açılışında yarım saniye
         kahve, sonra siyah. Renk yanıp sönmesi kod hatası gibi görünüyordu.

         ⭐ Çözüm geçişi kaldırmak DEĞİL, zeminini doğru renge bağlamak: animasyon duruyor,
         yalnız arkasındaki renk artık ekranın gerçek zeminiyle aynı.
         ⚠️ YALNIZ Android yazılı: iOS'un varsayılan geçişi böyle bir zemin boyamıyor ve
         listeye eklenmeyen platform Flutter'ın kendi varsayılanını kullanmaya devam ediyor.
         Ürün bugün Android (`MOBIL_MIMARI.md` §1); olmayan bir sorunu iOS için de yazmak,
         yarın Flutter varsayılanı değişince bakımı bize kalan ikinci bir satır olurdu. */
      pageTransitionsTheme: PageTransitionsTheme(
        builders: {
          TargetPlatform.android: ZoomPageTransitionsBuilder(backgroundColor: bg),
        },
      ),
      // ⭐ Gövde fontu uygulamanın TAMAMINA uygulanıyor — web'de `body` ile aynı.
      // ⚠️ Sayılar da bu fontta: web'de sayılar bir ara monospace'teydi ve o fontun ÇİZGİLİ
      // sıfırı 8 ile karışıyordu; gövde fontuna alınınca sorun çözüldü (kullanıcı kararı).
      fontFamily: MwFonts.body,
      fontFamilyFallback: MwFonts.bodyFallback,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: accent,
        onPrimary: onAccent,
        secondary: accent,
        onSecondary: onAccent,
        error: danger,
        onError: onAccent,
        surface: surface,
        onSurface: textPrimary,
      ),
    );
  }
}
