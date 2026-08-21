/* ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: packages/design-tokens/tokens.json */
export const lightColors = {
  "bg": "#F3E9D6",
  "surface": "#FAF3E3",
  "surfaceRaised": "#FFFBF0",
  "border": "#D6C3A1",
  "borderStrong": "#B99F76",
  "textPrimary": "#2B2116",
  "textMuted": "#6A5942",
  "accent": "#8A5A2B",
  "accentHover": "#6F4720",
  "onAccent": "#FFFBF0",
  "gold": "#9A7413",
  "food": "#4F6B33",
  "danger": "#9E3324",
  "warning": "#B3701A",
  "success": "#4F6B33",
  "info": "#2F5D8C",
  "own": "#2F5D8C",
  "focusRing": "#8A5A2B",
  "panelHeader": "#C89B5A",
  "onPanelHeader": "#2B2116",
  "rowAlt": "#EDE0C6",
  "bolt": "#A97540"
} as const;

export const darkColors = {
  "bg": "#15110C",
  "surface": "#1E1810",
  "surfaceRaised": "#2A2218",
  "border": "#3B3124",
  "borderStrong": "#574733",
  "textPrimary": "#EFE3CC",
  "textMuted": "#B0A188",
  "accent": "#D6A24A",
  "accentHover": "#E8B75F",
  "onAccent": "#15110C",
  "gold": "#E3B84C",
  "food": "#8FB05E",
  "danger": "#D4674F",
  "warning": "#E08A3C",
  "success": "#8FB05E",
  "info": "#7FA9D4",
  "own": "#7FA9D4",
  "focusRing": "#E8B75F",
  "panelHeader": "#8A5A2B",
  "onPanelHeader": "#FAF3E3",
  "rowAlt": "#2A2218",
  "bolt": "#B8862F"
} as const;

export type ColorToken = keyof typeof lightColors;
export const themes = { light: lightColors, dark: darkColors } as const;
