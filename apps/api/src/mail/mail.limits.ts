/**
 * ⭐ E-POSTA AYARLARI (§9.2) — `chat.limits.ts` / `notify.limits.ts` deseninin aynısı:
 * hepsi env ile ayarlanır, kod deploy'u gerektirmez.
 *
 * ⚠️ Anahtar yoksa posta **sessizce kapalı** değildir — `LogSender`'a düşer ve gövde konsola
 * basılır. Böylece anahtarsız bir geliştirme ortamında doğrulama/sıfırlama akışının TAMAMI
 * denenebilir: bağlantı loglarda görünür, elle açılır. "Mail gitmiyor" diye akışın yarısını
 * test edilemez bırakmak en pahalı seçenekti.
 */
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

export const MAIL_LIMITS = {
  /** Doğrulama bağlantısı — acele ettirmeyecek kadar uzun. */
  verifyTtlHours: num('MAIL_VERIFY_TTL_HOURS', 24),
  /**
   * Sıfırlama bağlantısı KISA: bu bağlantı hesabı ele geçirmeye yeter. Posta kutusuna erişen
   * biri için pencere ne kadar dar olursa o kadar iyi.
   */
  resetTtlMinutes: num('MAIL_RESET_TTL_MINUTES', 60),
  /** Aynı hesaba arka arkaya mail yağdırmayı engeller (kullanıcı "tekrar gönder"e basar durur). */
  resendCooldownSeconds: num('MAIL_RESEND_COOLDOWN_SECONDS', 60),
  /** Günlük tavan — hem maliyet hem "posta kutusu bombalama" saldırısı için. */
  dailyPerAccount: num('MAIL_DAILY_PER_ACCOUNT', 10),
  /** Aynı IP'den günde en fazla kaç jeton (farklı hesaplara dağıtılan bombardıman). */
  dailyPerIp: num('MAIL_DAILY_PER_IP', 30),
  /** Gönderim zaman aşımı — Resend yavaşsa outbox tıkanmasın. */
  sendTimeoutMs: num('MAIL_SEND_TIMEOUT_MS', 10_000),
} as const;

/** Anahtar varsa gerçek gönderim, yoksa konsola yazan geliştirme göndericisi. */
export const mailEnabled = (): boolean => MAIL.apiKey !== '';
