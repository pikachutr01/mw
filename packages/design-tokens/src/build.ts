/**
 * Token üreteci — `tokens.json` → `dist/*` (SİSTEM PLANI §13.13.1).
 *
 *   pnpm tokens:build   → dosyaları yazar
 *   pnpm tokens:check   → yazmadan karşılaştırır, fark varsa ÇIKIŞ KODU 1 (CI kırılır)
 *
 * Web (Tailwind v4 @theme) ve Flutter (ThemeData) AYNI kaynaktan beslenir → palet değişikliği
 * tek satırdır ve iki istemcide birden döner.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kebab, resolveTheme, source, type ThemeName } from './tokens.ts';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, '..', 'dist');

const HEADER = '/* ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: packages/design-tokens/tokens.json */';

function cssVars(theme: ThemeName, indent: string): string {
  const colors = resolveTheme(theme);
  const lines = Object.entries(colors).map(([name, hex]) => `${indent}--mw-color-${kebab(name)}: ${hex};`);
  lines.push(`${indent}--mw-color-overlay: ${source.overlay[theme]};`);
  for (const [name, v] of Object.entries(source.shadow)) {
    lines.push(`${indent}--mw-shadow-${kebab(name)}: ${v[theme]};`);
  }
  return lines.join('\n');
}

function staticVars(indent: string): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(source.radius)) lines.push(`${indent}--mw-radius-${k}: ${v};`);
  for (const [k, v] of Object.entries(source.space)) lines.push(`${indent}--mw-space-${k}: ${v};`);
  for (const [k, v] of Object.entries(source.font)) lines.push(`${indent}--mw-font-${kebab(k)}: ${v};`);
  return lines.join('\n');
}

function buildCss(): string {
  return `${HEADER}
/* Gündüz varsayılan; gece iki yoldan gelir:
   1) işletim sistemi tercihi (prefers-color-scheme)  → "system" modu
   2) kök elemandaki data-theme                        → kullanıcı seçimi (her zaman KAZANIR) */
:root {
${staticVars('  ')}
${cssVars('light', '  ')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${cssVars('dark', '    ')}
  }
}

:root[data-theme='dark'] {
${cssVars('dark', '  ')}
}

:root[data-theme='light'] {
${cssVars('light', '  ')}
}
`;
}

function buildTailwind(): string {
  const names = Object.keys(source.semantic);
  const colorLines = names.map((n) => `  --color-${kebab(n)}: var(--mw-color-${kebab(n)});`);
  colorLines.push('  --color-overlay: var(--mw-color-overlay);');
  const radiusLines = Object.keys(source.radius).map((k) => `  --radius-${k}: var(--mw-radius-${k});`);
  const fontLines = Object.keys(source.font).map((k) => `  --font-${kebab(k)}: var(--mw-font-${kebab(k)});`);
  return `${HEADER}
/* Tailwind v4: @import bu dosyayı, tokens.css'ten SONRA. Sınıflar: bg-surface, text-text-muted, ... */
@theme inline {
${colorLines.join('\n')}
${radiusLines.join('\n')}
${fontLines.join('\n')}
}
`;
}

function buildTs(): string {
  const light = resolveTheme('light');
  const dark = resolveTheme('dark');
  return `${HEADER}
export const lightColors = ${JSON.stringify(light, null, 2)} as const;

export const darkColors = ${JSON.stringify(dark, null, 2)} as const;

export type ColorToken = keyof typeof lightColors;
export const themes = { light: lightColors, dark: darkColors } as const;
`;
}

/** "#AABBCC" → "0xFFAABBCC" (Dart Color literali) */
const dartColor = (hex: string): string => `0xFF${hex.replace('#', '').toUpperCase()}`;

function buildDart(): string {
  const emit = (theme: ThemeName): string =>
    Object.entries(resolveTheme(theme))
      .map(([name, hex]) => `  static const Color ${name} = Color(${dartColor(hex)});`)
      .join('\n');

  return `// ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: packages/design-tokens/tokens.json
// Flutter tarafı web ile AYNI paleti kullanır (§13.13.1).
import 'package:flutter/material.dart';

class MwLightColors {
${emit('light')}
}

class MwDarkColors {
${emit('dark')}
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
`;
}

/**
 * ⭐ Hedefler — dosya adı DEĞİL tam yol, çünkü `tokens.dart` İKİ yere yazılıyor.
 *
 * ⚠️ **Mobil kopya neden var:** Flutter, `packages/design-tokens/dist/`i pub bağımlılığı
 * olarak göremiyor (Dart `pubspec.yaml` ister, orada yok). En ucuz çözüm üretecin ikinci bir
 * yola da yazması. ⚠️ Kopya `tokens:check` KAPSAMINDA — kapsam dışı kalsaydı mobil palet
 * sessizce sürüklenirdi ve bunu kimse görmezdi (§13.13.1'in tüm gerekçesi buydu).
 */
const MOBILE_GEN = join(here, '..', '..', '..', 'apps', 'mobile', 'lib', 'gen');

const TARGETS: { path: string; make: () => string }[] = [
  { path: join(distDir, 'tokens.css'), make: buildCss },
  { path: join(distDir, 'tokens.tw.css'), make: buildTailwind },
  { path: join(distDir, 'tokens.ts'), make: buildTs },
  { path: join(distDir, 'tokens.dart'), make: buildDart },
  { path: join(MOBILE_GEN, 'tokens.dart'), make: buildDart },
];

const check = process.argv.includes('--check');
mkdirSync(distDir, { recursive: true });
if (!check) mkdirSync(MOBILE_GEN, { recursive: true });

let drift = false;
for (const { path, make } of TARGETS) {
  const file = path.split(/[\\/]/).slice(-3).join('/');   // günlükte okunabilir kısa yol
  const next = make();
  if (check) {
    let current: string | null = null;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      current = null;
    }
    if (current !== next) {
      drift = true;
      console.error(`✗ ${file} güncel değil — 'pnpm tokens:build' çalıştırıp sonucu commit'leyin.`);
    }
  } else {
    writeFileSync(path, next, 'utf8');
    console.log(`✓ ${file}`);
  }
}

if (check) {
  if (drift) process.exit(1);
  console.log('✓ Tasarım token’ları kaynakla senkron.');
}
