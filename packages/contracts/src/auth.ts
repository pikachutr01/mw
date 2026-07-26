import { z } from 'zod';

/** Orijinaldeki "3-8 karakter şifre" kuralı KULLANILMIYOR — modern minimum 8+ (§9). */
export const password = z.string().min(8).max(200);

export const registerRequest = z.object({
  email: z.string().email(),
  password,
  /**
   * Oyun içinde yalnız bu görünür ve **DEĞİŞTİRİLEMEZ**.
   * Kural oyunun kendi dokümanından: *"en az 3, en fazla 10 karakter. Boşluk ve noktalama
   * işaretleri kullanılamaz."* (Önceki max 20 bizim uydurmamızdı.)
   */
  username: z.string().min(3).max(10).regex(/^[\p{L}\p{N}]+$/u, 'Boşluk ve noktalama kullanılamaz.'),
});
export type RegisterRequest = z.infer<typeof registerRequest>;

export const loginRequest = z.object({
  email: z.string().email(),
  password,
});
export type LoginRequest = z.infer<typeof loginRequest>;

export const uiTheme = z.enum(['system', 'light', 'dark']);
export type UiTheme = z.infer<typeof uiTheme>;

/** Tema tercihi HESAP düzeyindedir → cihazlar arası taşınır (§13.13.4). */
export const updatePreferencesRequest = z.object({
  theme: uiTheme.optional(),
  locale: z.enum(['tr', 'en']).optional(),
});
export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesRequest>;
