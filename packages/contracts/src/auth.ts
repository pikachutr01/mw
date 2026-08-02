import {
  USERNAME_MAX, USERNAME_MIN, USERNAME_PATTERN, USERNAME_RULE_MESSAGE, normalizeName,
} from '@mobilwar/catalog';
import { z } from 'zod';

/**
 * ⭐ KULLANICI ADI — normalizasyon ÖNCE, doğrulama SONRA.
 *
 * Boşluk 2026-08-02'de serbest bırakılınca (`Eru Ilúvatar`) görünmez bir tuzak açıldı:
 * baştaki/sondaki ya da içerideki çoklu boşluk ekranda fark edilmez ama girişte eşleşmeyi
 * bozar — oyuncu doğru yazdığını sanıp giremez. `normalizeName` kırpıp çoklu boşluğu teke
 * indiriyor, doğrulama ondan SONRA koşuyor; yani "  Eru   Ilúvatar " geçerli sayılıp
 * "Eru Ilúvatar" olarak saklanıyor.
 *
 * ⚠️ Bu şema hem KAYIT hem GİRİŞ tarafında kullanılmalı. Biri normalize edip diğeri
 * etmezse kayıt bir adı yazar, giriş başka bir adı arar.
 *
 * ⚠️ Öndeki `max(200)`: `normalizeName` bir üst sınır uygulamıyor, o yüzden dev bir dizeyi
 * işlemeden önce burada kesiyoruz.
 */
const usernameField = z.string().max(200).transform(normalizeName);

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
  username: usernameField.pipe(
    z.string()
      .min(USERNAME_MIN, USERNAME_RULE_MESSAGE)
      .max(USERNAME_MAX, USERNAME_RULE_MESSAGE)
      .regex(USERNAME_PATTERN, USERNAME_RULE_MESSAGE),
  ),
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
  // Normalizasyon yine de VAR — kayıtta ne yazıldıysa girişte de o aranmalı.
  username: usernameField.pipe(z.string().min(USERNAME_MIN).max(USERNAME_MAX)),
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
