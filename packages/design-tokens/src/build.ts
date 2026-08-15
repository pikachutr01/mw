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

/**
 * ⭐ CSS font yığınını Dart'a çevirir: `'Spectral', 'EB Garamond', Georgia, serif`
 * → ailesi `Spectral`, yedekleri `['EB Garamond', 'Georgia']`.
 *
 * ⚠️ Flutter tek bir `fontFamily` + ayrı bir yedek LİSTESİ istiyor; CSS'teki tek dizeyi
 * olduğu gibi vermek sessizce varsayılan fonta düşerdi.
 *
 * ⚠️ `serif`/`sans-serif`/`monospace` gibi CSS jenerik adları atılıyor: onlar tarayıcı
 * kavramı, Flutter'da karşılıkları yok ve yedek listesinde bulunmaları bir işe yaramaz.
 */
const CSS_GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'ui-monospace']);

function dartFontStack(stack: string): { family: string; fallback: string[] } {
  const parts = stack.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
  const real = parts.filter((p) => !CSS_GENERIC.has(p));
  return { family: real[0] ?? 'Roboto', fallback: real.slice(1) };
}

function buildDart(): string {
  const emit = (theme: ThemeName): string =>
    Object.entries(resolveTheme(theme))
      .map(([name, hex]) => `  static const Color ${name} = Color(${dartColor(hex)});`)
      .join('\n');

  const fontLines = Object.entries(source.font)
    .map(([k, v]) => {
      const { family, fallback } = dartFontStack(v as string);
      const fb = fallback.map((f) => `'${f}'`).join(', ');
      return `  static const String ${k} = '${family}';\n`
        + `  static const List<String> ${k}Fallback = [${fb}];`;
    })
    .join('\n');

  return `// dart format off
// ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: packages/design-tokens/tokens.json
// Flutter tarafı web ile AYNI paleti kullanır (§13.13.1).
//
// ⚠️⚠️ Yukarıdaki \`dart format off\` DİREKTİFİ ŞART, süs değil. Olmadan \`dart format\` bu
// dosyayı yeniden sarıyor, sarılmış hâli üretecin çıktısıyla eşleşmiyor ve \`tokens:check\`
// kırılıyor — yani biçim kapısı ile sürüklenme kapısı birbirini kilitliyor. 2026-08-15'te
// tam olarak bu yaşandı: \`dart format lib\` çağrısı üretilmiş dosyaları da yeniden yazdı ve
// CI kırıldı. Direktif, çağrı biçiminden bağımsız olarak sorunu kökten kapatıyor.
import 'package:flutter/material.dart';

class MwLightColors {
${emit('light')}
}

class MwDarkColors {
${emit('dark')}
}

/// Yazı tipleri — web ile AYNI aileler (\`tokens.json\` · \`font\`).
///
/// ⚠️ Dosyalar uygulamaya GÖMÜLÜ (\`apps/mobile/assets/fonts/\`, \`pubspec.yaml\`); çalışma
/// anında indirilmiyor. Gerekçe MOBIL_MIMARI.md §3.6'da.
///
/// ⚠️ \`display\` (Cinzel) KÜÇÜK HARF TAŞIMIYOR — küçük harfleri büyük harf gibi çiziyor.
/// Oyuncunun yazdığı metinde (şehir adı, kullanıcı adı) KULLANILMAZ; web'de tam olarak bu
/// hata yaşandı ve «Mithlond» ekranda «MİTHLOND» görünüyordu. Yalnız sabit başlıklarda.
class MwFonts {
${fontLines}
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
      // ⭐ Gövde fontu uygulamanın TAMAMINA uygulanıyor — web'de \`body\` ile aynı.
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
