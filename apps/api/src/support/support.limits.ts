/**
 * ⭐ DESTEK SİSTEMİ SINIRLARI — `mail.limits.ts` deseninin aynısı: panelden ayarlanır,
 * kod dağıtımı gerektirmez.
 *
 * ⚠️ Sınırların çoğu **kimliksiz** bir uca bakıyor. Destek formu oyundaki tek anonim POST ucu
 * ve iki şeyi birden üretebiliyor: veritabanı satırı **ve posta**. İkincisi daha pahalı — bir
 * spam dalgası bizim Resend kotamızı yakar ve alan adımızın itibarını düşürür. O yüzden
 * frenler cömert değil.
 */
import { liveNumber } from '../settings/live.ts';

export interface SupportLimits {
  /** Bir hesabın aynı anda açık tutabileceği talep sayısı. */
  maxOpenPerAccount: number;
  /** Aynı IP'den saatte kaç ANONİM talep. */
  anonPerIpPerHour: number;
  /** Bir talepteki en fazla mesaj — sonsuz büyüyen bir iş parçacığı depolama sorunudur. */
  maxMessagesPerTicket: number;
  /** Ek boyutu (bayt). */
  maxAttachmentBytes: number;
  /** Piksel tavanı (genişlik × yükseklik) — sıkıştırma bombası savunması. */
  maxAttachmentPixels: number;
  /** Bir hesabın saatte kaç yükleme yapabileceği. */
  uploadsPerHour: number;
  /** Anonim takip bağlantısının ömrü (gün). */
  publicTokenDays: number;
  /** Yetim ek dosyasının (mesaja iliştirilmemiş) toplanma süresi (saat). */
  orphanHours: number;
}

export function supportLimits(): SupportLimits {
  return {
    maxOpenPerAccount: liveNumber('support', 'maxOpenPerAccount', 5),
    anonPerIpPerHour: liveNumber('support', 'anonPerIpPerHour', 3),
    maxMessagesPerTicket: liveNumber('support', 'maxMessagesPerTicket', 100),
    /**
     * 5 MB — telefon ekran görüntüsü rahat sığar. ⚠️ Bunu büyütmek nginx'teki
     * `client_max_body_size` ile **birlikte** yapılmalı, yoksa istek sunucuya hiç ulaşmaz
     * ve kullanıcı anlamsız bir 413 görür.
     */
    maxAttachmentBytes: liveNumber('support', 'maxAttachmentBytes', 5 * 1024 * 1024),
    /** 40 MP — 8K ekran görüntüsünün (33 MP) üstünde, bombanın altında. */
    maxAttachmentPixels: liveNumber('support', 'maxAttachmentPixels', 40_000_000),
    uploadsPerHour: liveNumber('support', 'uploadsPerHour', 10),
    publicTokenDays: liveNumber('support', 'publicTokenDays', 90),
    orphanHours: liveNumber('support', 'orphanHours', 24),
  };
}
