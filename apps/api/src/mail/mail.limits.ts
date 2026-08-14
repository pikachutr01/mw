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
  /** `"MobilWar <noreply@mailer.mobilwar.com>"` biçiminde. */
  from: str('MAIL_FROM', 'MobilWar <noreply@localhost>'),
  /**
   * Cevap adresi. `from` bir `noreply@` olduğu için, oyuncu doğrulama ya da sıfırlama
   * mailini **yanıtlarsa** cevabı kimsenin okumadığı bir kutuya değil desteğe gitsin.
   * Üretimde `destek@mobilwar.com`; o adres Cloudflare Email Routing ile gerçek bir
   * kutuya yönleniyor (kendi mail sunucumuz yok). Boşsa başlık hiç gönderilmez.
   */
  replyTo: str('MAIL_REPLY_TO', ''),
  /** Bağlantı üretimi — doğrulama/sıfırlama e-postalarındaki adres bundan kurulur. */
  appOrigin: str('APP_ORIGIN', 'http://localhost:5173'),
  /**
   * ⭐ YÖNETİM PANELİ kökeni (2026-08-14) — destek maillerindeki «Panelde Aç» düğmesi.
   *
   * ⚠️ Ayrı env, `appOrigin`den TÜRETİLMİYOR: panel ayrı bir alt alanda (`admin.mobilwar.com`)
   * ve önünde Cloudflare Access var. `https://admin.` öneki uydurmak, alan adı bir gün
   * değişince sessizce ölü bir bağlantı üretirdi.
   * ⚠️ Boşsa düğme oyunun kökenine düşer — kırık bir bağlantıdansa yanlış ama açılan bir sayfa.
   */
  adminOrigin: str('ADMIN_ORIGIN', str('APP_ORIGIN', 'http://localhost:5173')),
  /** Resend uç noktası (test/proxy için değiştirilebilir). */
  endpoint: str('RESEND_ENDPOINT', 'https://api.resend.com/emails'),
  /**
   * ⭐ OPERASYON ALARMI (Faz 3) — eşik aşımlarının ve çoklu hesap raporunun gittiği adres.
   *
   * ⚠️ Ayarlara DEĞİL env'e konuldu, `MAIL` bloğunun geri kalanıyla aynı gerekçeyle: bu bir
   * dağıtım bilgisi, denge düğmesi değil. Ayrıca panelden düzenlenebilir olsaydı, paneli ele
   * geçiren biri alarmları kendine yönlendirip sessizce susturabilirdi.
   *
   * ⚠️ Boşsa olaylar yine **kaydedilir** (`ops_events`), yalnız posta gitmez. Alarm kanalının
   * yokluğu geçmişin de tutulmamasına yol açmamalı — kullanıcının açık şartı.
   */
  alertTo: str('OPS_ALERT_EMAIL', ''),
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
