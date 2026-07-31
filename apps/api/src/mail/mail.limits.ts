/**
 * ⭐ E-POSTA AYARLARI (§9.2) — `chat.limits.ts` / `notify.limits.ts` deseninin aynısı:
 * hepsi env ile ayarlanır, kod deploy'u gerektirmez.
 *
 * ⚠️ Anahtar yoksa posta **sessizce kapalı** değildir — `LogSender`'a düşer ve gövde konsola
 * basılır. Böylece anahtarsız bir geliştirme ortamında doğrulama/sıfırlama akışının TAMAMI
 * denenebilir: bağlantı loglarda görünür, elle açılır. "Mail gitmiyor" diye akışın yarısını
 * test edilemez bırakmak en pahalı seçenekti.
 */
import { liveNumber } from '../settings/live.ts';

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const str = (name: string, fallback: string): string => {
  const raw = process.env[name]?.trim();
  return raw == null || raw === '' ? fallback : raw;
};

export const MAIL = {
  apiKey: str('RESEND_API_KEY', ''),
  /** `"Mobiwar <noreply@send.scrabblecozucu.site>"` biçiminde. */
  from: str('MAIL_FROM', 'Mobiwar <noreply@localhost>'),
  /** Bağlantı üretimi — doğrulama/sıfırlama e-postalarındaki adres bundan kurulur. */
  appOrigin: str('APP_ORIGIN', 'http://localhost:5173'),
  /** Resend uç noktası (test/proxy için değiştirilebilir). */
  endpoint: str('RESEND_ENDPOINT', 'https://api.resend.com/emails'),
} as const;

/**
 * ⚠️ **Artık AYARLARDAN okunuyor** (admin Faz 1); `.env` geriye uyum için hâlâ geçerli ama
 * DB'nin altında. `MAIL_LIMITS` sabiti `mailLimits()` fonksiyonuna dönüştü.
 *
 * ⚠️ `MAIL` bloğu (API anahtarı, gönderen adresi, uç nokta) ayarlara TAŞINMADI ve taşınmayacak:
 * bunlar **sır ve dağıtım bilgisi**, denge düğmesi değil. Bir API anahtarını veri tabanına
 * yazıp panelde göstermek onu yedeklere ve tarayıcı geçmişine sızdırmak olurdu.
 */
export interface MailLimits {
  verifyTtlHours: number;
  resetTtlMinutes: number;
  resendCooldownSeconds: number;
  dailyPerAccount: number;
  dailyPerIp: number;
  sendTimeoutMs: number;
}

export function mailLimits(): MailLimits {
  return {
    /** Doğrulama bağlantısı — acele ettirmeyecek kadar uzun. */
    verifyTtlHours: liveNumber('mail', 'verifyTtlHours', num('MAIL_VERIFY_TTL_HOURS', 24)),
    /**
     * Sıfırlama bağlantısı KISA: bu bağlantı hesabı ele geçirmeye yeter. Posta kutusuna erişen
     * biri için pencere ne kadar dar olursa o kadar iyi.
     */
    resetTtlMinutes: liveNumber('mail', 'resetTtlMinutes', num('MAIL_RESET_TTL_MINUTES', 60)),
    /** Aynı hesaba arka arkaya mail yağdırmayı engeller. ⚠️ Bekleme AMACA göre ayrı sayılır. */
    resendCooldownSeconds: liveNumber('mail', 'resendCooldownSeconds',
      num('MAIL_RESEND_COOLDOWN_SECONDS', 60)),
    /** Günlük tavan — hem maliyet hem "posta kutusu bombalama" saldırısı için. */
    dailyPerAccount: liveNumber('mail', 'dailyPerAccount', num('MAIL_DAILY_PER_ACCOUNT', 10)),
    /** Aynı IP'den günde en fazla kaç jeton (farklı hesaplara dağıtılan bombardıman). */
    dailyPerIp: liveNumber('mail', 'dailyPerIp', num('MAIL_DAILY_PER_IP', 30)),
    /** Gönderim zaman aşımı — Resend yavaşsa outbox tıkanmasın. */
    sendTimeoutMs: liveNumber('mail', 'sendTimeoutMs', num('MAIL_SEND_TIMEOUT_MS', 10_000)),
  };
}

/** Anahtar varsa gerçek gönderim, yoksa konsola yazan geliştirme göndericisi. */
export const mailEnabled = (): boolean => MAIL.apiKey !== '';
