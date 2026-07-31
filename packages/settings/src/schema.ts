/**
 * ⭐ AYAR KATALOĞU — panelden düzenlenebilen her sayı burada tanımlı.
 *
 * Faz 1 kapsamı: **işletim limitleri** (sohbet · bildirim · posta). Dünya hız çarpanları
 * BURADA DEĞİL — onlar `worlds` tablosunda kolon olarak duruyor ve zaten her sorguda
 * okunuyor; buraya kopyalamak ikinci bir doğruluk kaynağı yaratırdı.
 *
 * Sonraki fazlar bu listeyi büyütür: Faz 4 savaş motoru, Faz 5 katalog.
 */
import type { SettingDef, SettingGroup } from './types.ts';

export const SETTING_GROUPS: readonly SettingGroup[] = [
  {
    id: 'chat',
    label: 'Sohbet',
    description: 'Özel mesajlaşmanın akış ve kötüye kullanım sınırları (§13.12.4).',
  },
  {
    id: 'notify',
    label: 'Bildirim',
    description: 'Toast ve push davranışı; metin sınırları ve ölü abonelik temizliği (§7.2).',
  },
  {
    id: 'mail',
    label: 'E-posta',
    description: 'Doğrulama ve şifre sıfırlama bağlantılarının ömrü ile kotalar (§9.2).',
  },
] as const;

export const SETTINGS: readonly SettingDef[] = [
  /* ── Sohbet ──────────────────────────────────────────────────────────────── */
  {
    key: 'chat.burst',
    label: 'Kova: pencere başına mesaj',
    type: 'int', default: 5, min: 1, max: 100, tag: 'design', unit: 'adet',
    env: 'CHAT_RATE_BURST',
    description: 'Aşağıdaki pencerede bir oyuncunun gönderebileceği en fazla mesaj. '
      + 'Normal yazışmada asla görünmez; makro kullananı ilk saniyede durdurur.',
  },
  {
    key: 'chat.perSeconds',
    label: 'Kova penceresi',
    type: 'int', default: 10, min: 1, max: 600, tag: 'design', unit: 'sn',
    env: 'CHAT_RATE_WINDOW_SECONDS',
    description: 'Kovanın ölçüldüğü süre.',
  },
  {
    key: 'chat.duplicateSeconds',
    label: 'Aynı metin bekleme süresi',
    type: 'int', default: 15, min: 0, max: 600, tag: 'design', unit: 'sn',
    env: 'CHAT_DUPLICATE_SECONDS',
    description: 'Aynı metnin tekrar gönderilemeyeceği süre. 0 = kapalı.',
  },
  {
    key: 'chat.newPlayerHours',
    label: 'Acemi kısıtı',
    type: 'int', default: 12, min: 0, max: 720, tag: 'design', unit: 'sa',
    env: 'CHAT_DM_MIN_AGE_HOURS',
    description: 'Bu süreyi doldurmayan oyuncu YENİ konuşma başlatamaz; kendisine yazılana '
      + 'cevap verebilir. Ölçüt o dünyaya katılım (`players.created_at`), hesap yaşı değil.',
  },
  {
    key: 'chat.pageSize',
    label: 'Geçmiş sayfa boyutu',
    type: 'int', default: 30, min: 5, max: 100, tag: 'design', unit: 'adet',
    env: 'CHAT_PAGE_SIZE',
    description: 'Sohbet penceresinin bir seferde çektiği mesaj sayısı.',
  },

  /* ── Bildirim ────────────────────────────────────────────────────────────── */
  {
    key: 'notify.titleMax',
    label: 'Başlık uzunluğu',
    type: 'int', default: 60, min: 20, max: 200, tag: 'design', unit: 'karakter',
    description: 'Uzunu işletim sistemi zaten kırpar; biz kaynakta kesiyoruz.',
  },
  {
    key: 'notify.bodyMax',
    label: 'Gövde uzunluğu',
    type: 'int', default: 120, min: 40, max: 400, tag: 'design', unit: 'karakter',
    description: 'Push gövdesinin en fazla uzunluğu.',
  },
  {
    key: 'notify.productionCoalesceSeconds',
    label: 'Üretim bildirimi birleştirme',
    type: 'int', default: 600, min: 0, max: 86_400, tag: 'design', unit: 'sn',
    env: 'NOTIFY_PRODUCTION_COALESCE_SECONDS',
    description: 'Bu pencerede oyuncu başına TEK üretim push\'u gider. 0 = birleştirme kapalı. '
      + 'Toast birleştirilmez — uygulama açıkken oyuncu her satırı görmek ister.',
  },
  {
    key: 'notify.sendTimeoutMs',
    label: 'Push zaman aşımı',
    type: 'int', default: 8000, min: 1000, max: 60_000, tag: 'design', unit: 'ms',
    env: 'NOTIFY_SEND_TIMEOUT_MS',
    description: 'Push servisi yavaşsa outbox tıkanmasın.',
  },
  {
    key: 'notify.maxFailures',
    label: 'Ölü abonelik eşiği',
    type: 'int', default: 5, min: 1, max: 50, tag: 'design', unit: 'deneme',
    env: 'NOTIFY_MAX_FAILURES',
    description: 'Bu kadar arka arkaya başarısız olan abonelik silinir. '
      + '404/410 zaten anında siler; bu eşik geçici hatalar için.',
  },

  /* ── E-posta ─────────────────────────────────────────────────────────────── */
  {
    key: 'mail.verifyTtlHours',
    label: 'Doğrulama bağlantısı ömrü',
    type: 'int', default: 24, min: 1, max: 720, tag: 'design', unit: 'sa',
    env: 'MAIL_VERIFY_TTL_HOURS',
    description: 'Acele ettirmeyecek kadar uzun tutuldu.',
  },
  {
    key: 'mail.resetTtlMinutes',
    label: 'Sıfırlama bağlantısı ömrü',
    type: 'int', default: 60, min: 5, max: 1440, tag: 'design', unit: 'dk',
    env: 'MAIL_RESET_TTL_MINUTES',
    description: '⚠️ KISA tutulmalı: bu bağlantı hesabı ele geçirmeye yeter. Posta kutusuna '
      + 'erişen biri için pencere ne kadar dar olursa o kadar iyi.',
  },
  {
    key: 'mail.resendCooldownSeconds',
    label: 'Tekrar gönderme bekleme süresi',
    type: 'int', default: 60, min: 0, max: 3600, tag: 'design', unit: 'sn',
    env: 'MAIL_RESEND_COOLDOWN_SECONDS',
    description: '⚠️ Bekleme AMACA göre ayrı sayılır (doğrulama / sıfırlama). Tek sayaç '
      + 'olsaydı kayıt olup hemen şifre sıfırlamak isteyen oyuncu sessizce engellenirdi.',
  },
  {
    key: 'mail.dailyPerAccount',
    label: 'Hesap başına günlük',
    type: 'int', default: 10, min: 1, max: 200, tag: 'design', unit: 'adet',
    env: 'MAIL_DAILY_PER_ACCOUNT',
    description: 'Hem maliyet hem posta kutusu bombalama koruması.',
  },
  {
    key: 'mail.dailyPerIp',
    label: 'IP başına günlük',
    type: 'int', default: 30, min: 1, max: 500, tag: 'design', unit: 'adet',
    env: 'MAIL_DAILY_PER_IP',
    description: 'Aynı IP\'den farklı hesaplara dağıtılan bombardıman için.',
  },
  {
    key: 'mail.sendTimeoutMs',
    label: 'Gönderim zaman aşımı',
    type: 'int', default: 10_000, min: 1000, max: 60_000, tag: 'design', unit: 'ms',
    env: 'MAIL_SEND_TIMEOUT_MS',
    description: 'Resend yavaşsa outbox tıkanmasın.',
  },
] as const;

/** Anahtar → tanım. Doğrulama ve panel bunun üzerinden çalışır. */
export const SETTINGS_BY_KEY: Readonly<Record<string, SettingDef>> = Object.freeze(
  Object.fromEntries(SETTINGS.map((s) => [s.key, s])),
);
