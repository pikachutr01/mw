/**
 * ⭐ BİLDİRİM AYARLARI (§7.2) — `chat.limits.ts` deseninin aynısı: hepsi env ile ayarlanır,
 * kod deploy'u gerektirmez.
 *
 * VAPID anahtarları BURADA okunur ama **doğrulanmaz**: anahtar yoksa push sessizce kapalıdır
 * (`pushEnabled === false`) ve oyun her şeyiyle çalışmaya devam eder. Anahtarsız bir geliştirme
 * ortamında API'nin açılmaması, bildirimi "opsiyonel katman" olmaktan çıkarırdı.
 */
const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Bildirim kategorileri — oyuncu her birini ayrı kapatabilir (`accounts.notify_prefs`). */
export const NOTIFY_CATEGORIES = ['attack', 'dm', 'report', 'production'] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number];

/**
 * Varsayılanlar — **dördü de AÇIK** (kullanıcı kararı 2026-07-31).
 *
 * `accounts.notify_prefs`'te anahtar YOKSA buraya bakılır; `false` yazılıysa kapalıdır. Bu
 * yüzden ileride yeni bir kategori eklenince eski satırlara dokunmak gerekmez.
 */
export const NOTIFY_DEFAULTS: Readonly<Record<NotifyCategory, boolean>> = {
  attack: true,
  dm: true,
  report: true,
  production: true,
};

export const NOTIFY_LIMITS = {
  /** Push başlığı/gövdesi — uzunsa işletim sistemi zaten kırpar, biz kaynakta kesiyoruz. */
  titleMax: 60,
  bodyMax: 120,
  /**
   * ⭐ ÜRETİM BİRLEŞTİRME — kullanıcı `production` kategorisini de açık istedi, ama 5 emirlik
   * bir baraka kuyruğu 5 ayrı olay demek. Bu pencere içinde oyuncu başına **tek** üretim
   * push'u gider (toast birleştirilmez: uygulama zaten açıkken ekranda görmek istenir).
   * 0 yazılırsa birleştirme kapanır.
   */
  productionCoalesceSeconds: num('NOTIFY_PRODUCTION_COALESCE_SECONDS', 600),
  /** Tek push denemesinin zaman aşımı — push servisi yavaşsa outbox tıkanmasın. */
  sendTimeoutMs: num('NOTIFY_SEND_TIMEOUT_MS', 8000),
  /** Bu kadar arka arkaya başarısız olan abonelik silinir (410/404 zaten anında siler). */
  maxFailures: num('NOTIFY_MAX_FAILURES', 5),
} as const;

export const VAPID = {
  publicKey: process.env['VAPID_PUBLIC_KEY'] ?? '',
  privateKey: process.env['VAPID_PRIVATE_KEY'] ?? '',
  subject: process.env['VAPID_SUBJECT'] ?? 'mailto:admin@mobiwar.local',
} as const;

/** Push yalnız anahtar çifti varken çalışır; yoksa bildirim WS toast'ıyla sınırlı kalır. */
export const pushEnabled = (): boolean => VAPID.publicKey !== '' && VAPID.privateKey !== '';
