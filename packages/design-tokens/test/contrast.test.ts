/**
 * ⭐ KONTRAST KALİTE KAPISI (§13.13.5).
 * Paleti değiştirip okunabilirliği bozmak DERLEMEYİ KIRAR — antik renkler güzel olacak ama
 * gözü yormayacak.
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/contrast.ts';
import { resolveTheme, source, type ThemeName } from '../src/tokens.ts';

const THEMES: ThemeName[] = ['light', 'dark'];

describe('WCAG kontrastı', () => {
  for (const theme of THEMES) {
    const colors = resolveTheme(theme);
    for (const pair of source.contrastPairs) {
      it(`${theme}: ${pair.fg} / ${pair.bg} ≥ ${pair.min}:1`, () => {
        const fg = colors[pair.fg];
        const bg = colors[pair.bg];
        expect(fg, `${pair.fg} tanımsız`).toBeTruthy();
        expect(bg, `${pair.bg} tanımsız`).toBeTruthy();
        const ratio = contrastRatio(fg as string, bg as string);
        expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(pair.min);
      });
    }
  }
});

describe('token bütünlüğü', () => {
  it('her semantik token iki temada da çözülür', () => {
    for (const theme of THEMES) {
      const colors = resolveTheme(theme);
      for (const name of Object.keys(source.semantic)) {
        expect(colors[name], `${theme}.${name}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it('gündüz ve gece paletleri birbirinden farklı', () => {
    const light = resolveTheme('light');
    const dark = resolveTheme('dark');
    expect(light['bg']).not.toBe(dark['bg']);
    expect(light['textPrimary']).not.toBe(dark['textPrimary']);
  });
});
