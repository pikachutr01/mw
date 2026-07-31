/**
 * ⭐ SOHBET LİMİTLERİ (§13.12.4).
 *
 * ⚠️ **Artık `.env`den değil AYARLARDAN okunuyor** (admin Faz 1). Varsayılanlar ve gerekçeler
 * `@mobiwar/settings` şemasında; `.env` yalnız geriye uyum için hâlâ okunuyor ve **DB'nin
 * ALTINDA** kalıyor — panelden kaydedilen değer env'i ezer. Tersi olsaydı panelden yapılan
 * değişiklik sunucu yeniden başlayınca sessizce geri alınırdı.
 *
 * ⚠️ `CHAT_LIMITS` sabiti KALDIRILDI, yerine `chatLimits()` geldi. Değer artık çalışma zamanında
 * değişebiliyor ve `const` görünen bir nesnenin altından değişmesi izlenmesi zor bir sürpriz
 * olurdu; açık fonksiyon çağrısı bunu görünür kılıyor. Fonksiyon **bellekten** okur — DB'ye
 * gitmez (gerekçe `settings/settings.service.ts` başlığında).
 *
 * Değerlerin gerekçesi:
 *  • **Kova (10 sn'de 5)** — normal yazışmada asla görünmez; makro/bot kullananı ilk saniyede durdurur.
 *  • **Mükerrer mesaj (aynı metin 15 sn)** — planda YOKTU; `mesajlar.txt`'teki rakip yapımın
 *    beta dökümü bunun gerçek bir ihtiyaç olduğunu gösterdi (aynı satır 5 kez üst üste).
 *  • **Acemi kısıtı 12 saat** — o dünyada 12 saatini doldurmayan oyuncu YENİ konuşma BAŞLATAMAZ,
 *    ama kendisine yazılmış bir sohbete **cevap verebilir**. Ölçüt `players.created_at`
 *    (o dünyaya katılım), hesap yaşı değil: sohbet dünya-kapsamlı.
 */
import { liveNumber } from '../settings/live.ts';

/**
 * ⚠️ Gövde uzunluğu AYARLANABİLİR DEĞİL ve şemaya da konmadı: `packages/contracts`teki
 * `max(500)` ile aynı sayı olmak zorunda. Panelden değiştirilebilseydi sözleşme ile sunucu
 * ayrışır, istemci geçerli saydığı bir mesajı sunucuya reddettirirdi.
 */
export const CHAT_BODY_MAX = 500;

export interface ChatLimits {
  /** Gövde uzunluğu — sözleşmedeki `max(500)` ile aynı. */
  bodyMax: number;
  /** Kova: `perSeconds` içinde en fazla `burst` mesaj (kanal değil OYUNCU başına). */
  burst: number;
  perSeconds: number;
  /** Aynı metnin tekrar gönderilemeyeceği süre. */
  duplicateSeconds: number;
  /** Yeni oyuncunun yeni konuşma başlatabilmesi için o dünyada geçirmesi gereken süre. */
  newPlayerHours: number;
  /** Geçmiş sayfası (keyset). */
  pageSize: number;
}

/** O anki etkin sohbet limitleri. */
export function chatLimits(): ChatLimits {
  return {
    bodyMax: CHAT_BODY_MAX,
    burst: liveNumber('chat', 'burst', 5),
    perSeconds: liveNumber('chat', 'perSeconds', 10),
    duplicateSeconds: liveNumber('chat', 'duplicateSeconds', 15),
    newPlayerHours: liveNumber('chat', 'newPlayerHours', 12),
    pageSize: liveNumber('chat', 'pageSize', 30),
  };
}
