// ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: packages/design-tokens/tokens.json
// Flutter tarafı web ile AYNI paleti kullanır (§13.13.1).
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
  static const Color focusRing = Color(0xFFE8B75F);
  static const Color panelHeader = Color(0xFF8A5A2B);
  static const Color onPanelHeader = Color(0xFFFAF3E3);
  static const Color rowAlt = Color(0xFF2A2218);
  static const Color bolt = Color(0xFFB8862F);
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
