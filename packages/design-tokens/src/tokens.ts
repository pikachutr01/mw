import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface TokenSource {
  meta: { name: string; version: string };
  palette: Record<string, Record<string, string>>;
  semantic: Record<string, { light: string; dark: string }>;
  overlay: { light: string; dark: string };
  contrastPairs: { fg: string; bg: string; min: number }[];
  radius: Record<string, string>;
  space: Record<string, string>;
  font: Record<string, string>;
  shadow: Record<string, { light: string; dark: string }>;
}

export type ThemeName = 'light' | 'dark';

/** tokens.json — TEK KAYNAK. */
export const source: TokenSource = require('../tokens.json') as TokenSource;

/** "bronze.600" → "#8A5A2B" */
export function resolvePaletteRef(ref: string): string {
  const [ramp, shade] = ref.split('.');
  const value = ramp && shade ? source.palette[ramp]?.[shade] : undefined;
  if (!value) throw new Error(`Palette referansı çözülemedi: ${ref}`);
  return value;
}

/** Bir temanın tüm semantik renklerini hex olarak döndürür. */
export function resolveTheme(theme: ThemeName): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, refs] of Object.entries(source.semantic)) {
    out[name] = resolvePaletteRef(refs[theme]);
  }
  return out;
}

/** camelCase → kebab-case (CSS değişkeni adı için). */
export const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
