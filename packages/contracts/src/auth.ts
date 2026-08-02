import { USERNAME_MAX, USERNAME_MIN, USERNAME_PATTERN, USERNAME_RULE_MESSAGE } from '@mobilwar/catalog';
import { z } from 'zod';

/** Orijinaldeki "3-8 karakter şifre" kuralı KULLANILMIYOR — modern minimum 8+ (§9). */
export const password = z.string().min(8).max(200);

export const registerRequest = z.object({
  email: z.string().email(),
  password,
  /**
   * Oyun içinde yalnız bu görünür ve **DEĞİŞTİRİLEMEZ**.
   *
   * ⚠️ Sayılar artık `@mobilwar/catalog` → `name-rules.ts`ten geliyor (2026-08-01). Burada
   * elle yazılıydı ve `Auth.tsx`teki tarayıcı kuralıyla ayrışmıştı: sunucu `\p{L}` ile
   * `Ayşe`yi kabul ederken tarayıcı `[A-Za-z0-9]` deseniyle reddediyordu.
   * Sınır 10'dan **15**'e çıktı (kullanıcı; hesap silmenin ürettiği `hükümdarN` adları için).
   */
  username: z.string().min(USERNAME_MIN).max(USERNAME_MAX)
    .regex(USERNAME_PATTERN, USERNAME_RULE_MESSAGE),
});
export type RegisterRequest = z.infer<typeof registerRequest>;

/**
 * ⭐ GİRİŞ **KULLANICI ADIYLA** (kullanıcı kararı 2026-07-28), e-posta ile değil.
 * E-posta hesabın kimliği olarak kalıyor (kayıt, parola sıfırlama); oyuncunun ezberlediği ve
 * oyunda gördüğü ad ise kullanıcı adı — girişte de onu istemek doğrusu.
 * ⚠️ Kullanıcı adı **dünya başına** tekildir → giriş isteğinde `worldId` şart.
 */
export const loginRequest = z.object({
  // ⚠️ Girişte desen kontrolü YOK: eski bir ad kurala uymuyor olsa bile sahibi giriş yapabilmeli.
  username: z.string().min(USERNAME_MIN).max(USERNAME_MAX),
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
