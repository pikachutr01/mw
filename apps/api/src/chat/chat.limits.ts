/**
 * ⭐ SOHBET LİMİTLERİ (§13.12.4) — hepsi env ile ayarlanabilir, kod deploy'u gerektirmez.
 *
 * Değerlerin gerekçesi:
 *  • **Kova (10 sn'de 5)** — plandaki değer. Normal yazışmada asla görünmez; makro/bot
 *    kullanan birini ilk saniyede durdurur.
 *  • **Mükerrer mesaj (aynı metin 15 sn)** — planda YOKTU. `mesajlar.txt`'teki rakip
 *    yapımın beta dökümü bunun gerçek bir ihtiyaç olduğunu gösteriyor (aynı satırın 5 kez
 *    üst üste gönderildiği örnekler var; o yapım da 15 sn koymuş).
 *  • **Acemi kısıtı 12 saat** (kullanıcı kararı 2026-07-31): o dünyada 12 saatini doldurmayan
 *    oyuncu YENİ konuşma BAŞLATAMAZ — ama kendisine yazılmış bir sohbete **cevap verebilir**.
 *    Ölçüt `players.created_at` (o dünyaya katılım), hesap yaşı değil: sohbet dünya-kapsamlı.
 */
const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const CHAT_LIMITS = {
  /** Gövde uzunluğu — sözleşmedeki `max(500)` ile aynı olmalı. */
  bodyMax: 500,
  /** Kova: `perSeconds` içinde en fazla `burst` mesaj (kanal değil OYUNCU başına). */
  burst: num('CHAT_RATE_BURST', 5),
  perSeconds: num('CHAT_RATE_WINDOW_SECONDS', 10),
  /** Aynı metnin tekrar gönderilemeyeceği süre. */
  duplicateSeconds: num('CHAT_DUPLICATE_SECONDS', 15),
  /** Yeni oyuncunun yeni konuşma başlatabilmesi için o dünyada geçirmesi gereken süre. */
  newPlayerHours: num('CHAT_DM_MIN_AGE_HOURS', 12),
  /** Geçmiş sayfası (keyset). */
  pageSize: num('CHAT_PAGE_SIZE', 30),
} as const;
