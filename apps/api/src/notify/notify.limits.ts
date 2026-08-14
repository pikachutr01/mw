/**
 * ⭐ BİLDİRİM AYARLARI (§7.2) — `chat.limits.ts` deseninin aynısı: hepsi env ile ayarlanır,
 * kod deploy'u gerektirmez.
 *
 * VAPID anahtarları BURADA okunur ama **doğrulanmaz**: anahtar yoksa push sessizce kapalıdır
 * (`pushEnabled === false`) ve oyun her şeyiyle çalışmaya devam eder. Anahtarsız bir geliştirme
 * ortamında API'nin açılmaması, bildirimi "opsiyonel katman" olmaktan çıkarırdı.
 */
import { liveNumber } from '../settings/live.ts';

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Bildirim kategorileri — oyuncu her birini ayrı kapatabilir (`accounts.notify_prefs`). */
export const NOTIFY_CATEGORIES = [
  'attack', 'dm', 'report', 'production', 'mention',
  /**
   * ⭐ Destek talebine yönetici yanıtı (2026-08-14).
   * ⚠️ Adı `support` DEĞİL **`ticket`**: oyunda «destek» zaten bir sefer türü (takviye) ve
   * `messages.kind` içinde `support_report` o anlamda kullanılıyor. Aynı sözcüğü ikinci bir
   * anlamda kullanmak `accounts.notify_prefs` JSON'unda kalıcı karışıklık yaratırdı.
   */
  'ticket',
] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number];

/**
 * Varsayılanlar — **hepsi AÇIK** (kullanıcı kararı 2026-07-31).
 *
 * `accounts.notify_prefs`'te anahtar YOKSA buraya bakılır; `false` yazılıysa kapalıdır. Bu
 * yüzden ileride yeni bir kategori eklenince eski satırlara dokunmak gerekmez —
 * ⭐ `mention` 2026-08-07'de tam olarak böyle eklendi: **göç yazılmadı**, mevcut hesaplarda
 * kendiliğinden açık geldi.
 */
export const NOTIFY_DEFAULTS: Readonly<Record<NotifyCategory, boolean>> = {
  attack: true,
  dm: true,
  report: true,
  production: true,
  /** İttifak sohbetinde `@` ile anılma (§13.15c). Oyuncu Seçenekler'den ayrıca kapatabilir. */
  mention: true,
  /** Destek talebine yönetici yanıtı. ⭐ `mention` gibi GÖÇSÜZ eklendi: anahtar yoksa açık. */
  ticket: true,
};

/**
 * ⚠️ **Artık AYARLARDAN okunuyor** (admin Faz 1); `.env` geriye uyum için hâlâ geçerli ama
 * DB'nin altında. `NOTIFY_LIMITS` sabiti `notifyLimits()` fonksiyonuna dönüştü — değer çalışma
 * zamanında değişebiliyor ve `const` görünen bir nesnenin altından değişmesi sürpriz olurdu.
 * Fonksiyon bellekten okur, sorgu yapmaz.
 */
export interface NotifyLimits {
  titleMax: number;
  bodyMax: number;
  productionCoalesceSeconds: number;
  sendTimeoutMs: number;
  maxFailures: number;
}

export function notifyLimits(): NotifyLimits {
  return {
    /** Push başlığı/gövdesi — uzunsa işletim sistemi zaten kırpar, biz kaynakta kesiyoruz. */
    titleMax: liveNumber('notify', 'titleMax', 60),
    bodyMax: liveNumber('notify', 'bodyMax', 120),
    /**
     * ⭐ ÜRETİM BİRLEŞTİRME — kullanıcı `production` kategorisini de açık istedi, ama 5 emirlik
     * bir baraka kuyruğu 5 ayrı olay demek. Bu pencere içinde oyuncu başına **tek** üretim
     * push'u gider (toast birleştirilmez: uygulama zaten açıkken ekranda görmek istenir).
     * 0 yazılırsa birleştirme kapanır.
     */
    productionCoalesceSeconds: liveNumber('notify', 'productionCoalesceSeconds',
      num('NOTIFY_PRODUCTION_COALESCE_SECONDS', 600)),
    /** Tek push denemesinin zaman aşımı — push servisi yavaşsa outbox tıkanmasın. */
    sendTimeoutMs: liveNumber('notify', 'sendTimeoutMs', num('NOTIFY_SEND_TIMEOUT_MS', 8000)),
    /** Bu kadar arka arkaya başarısız olan abonelik silinir (410/404 zaten anında siler). */
    maxFailures: liveNumber('notify', 'maxFailures', num('NOTIFY_MAX_FAILURES', 5)),
  };
}

export const VAPID = {
  publicKey: process.env['VAPID_PUBLIC_KEY'] ?? '',
  privateKey: process.env['VAPID_PRIVATE_KEY'] ?? '',
  subject: process.env['VAPID_SUBJECT'] ?? 'mailto:admin@mobilwar.com',
} as const;

/** Push yalnız anahtar çifti varken çalışır; yoksa bildirim WS toast'ıyla sınırlı kalır. */
export const pushEnabled = (): boolean => VAPID.publicKey !== '' && VAPID.privateKey !== '';
