/**
 * Parola özetleme — **argon2id** (SİSTEM PLANI §9).
 *
 * `@node-rs/argon2` seçildi: önceden derlenmiş ikili taşır, kurulum sırasında C derleyicisi
 * istemez (sunucuda derleme YASAK — §4.0) ve Windows/WSL/Ubuntu'da aynı şekilde çalışır.
 *
 * Orijinaldeki "3-8 karakter şifre" kuralı KULLANILMIYOR; modern minimum 8+ (zod tarafında).
 */
import { hash, verify } from '@node-rs/argon2';

/**
 * OWASP'ın argon2id için önerdiği ölçüler (2024): 19 MiB bellek, 2 tur, 1 paralellik.
 * Bellek maliyeti GPU saldırısını pahalı kılar; 2 GB'lık sunucuda 19 MiB güvenle karşılanır.
 */
// Algorithm ambient const enum olduğu için `verbatimModuleSyntax` altında import edilemiyor;
// Argon2id = 2 (kütüphanenin sabiti). Sayıyı doğrulayan test: özet `$argon2id$` ile başlamalı.
const ARGON2ID = 2;

const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class PasswordService {
  async hash(plain: string): Promise<string> {
    return hash(plain, OPTIONS);
  }

  /**
   * Parolayı doğrular. Bozuk/eski biçimli özette **istisna fırlatmaz, false döner** — aksi halde
   * veritabanındaki tek bozuk satır giriş ucunu 500 ile çökertirdi.
   */
  async verify(storedHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(storedHash, plain);
    } catch {
      return false;
    }
  }
}
