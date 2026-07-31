/**
 * ⭐ OYUNCUNUN YAZDIĞI ADLAR — şehir ve kahraman için TEK kural kaynağı.
 *
 * Sınır orijinalden geliyor: J2ME istemcisinin "Şehir Adı" formu `m.a(2, 10, …)` ile açılıyor
 * (`DecompiledSrc/src/g.java:1893`) ve `m.java:541` imzasına göre ikinci parametre **en fazla
 * karakter**. Kullanıcı 2026-07-31'de aynı sınırın kahraman adına da uygulanmasını istedi
 * (eskiden 2-24'tü) — ekranda "ad" denen her alan artık aynı boyda.
 *
 * ⚠️ Kural neden **katalogda**: hem sunucu doğrulaması (`apps/api/src/cities/city-name.ts`)
 * hem ad ÜRETENLER (`hero-names.ts` havuzu, koloni adı üreteci) aynı sayıya bakmak zorunda.
 * Ayrı yerlerde dursaydı üreteç, doğrulamanın reddedeceği bir ad üretebilirdi — nitekim
 * `"<oyuncu> kolonisi N"` tam olarak bunu yapıyordu.
 *
 * ⚠️ **Türkçe karakter serbest** (kullanıcı şartı): `\p{L}` sınıfı ç/ğ/ı/ö/ş/ü'yü zaten
 * kapsıyor, o yüzden ASCII'ye daraltan bir desen YAZILMADI. Boşluk da serbest ("Kara Ova");
 * noktalama serbest DEĞİL — ad tablo başlığında, tooltip'te ve rapor metninde geçiyor,
 * ayraç karakterleri oraları okunmaz hâle getiriyordu.
 */

export const NAME_MIN = 3;
export const NAME_MAX = 10;

/** Harf (her alfabe) · rakam · boşluk. Emoji ve noktalama dışarıda. */
export const NAME_PATTERN = /^[\p{L}\p{N} ]+$/u;

export const NAME_RULE_MESSAGE =
  `Ad ${NAME_MIN}-${NAME_MAX} karakter olmalı; harf, rakam ve boşluk kullanılabilir.`;

/** Baş/son boşluk kırpılır, içerideki çoklu boşluk teke iner ("A   B" → "A B"). */
export const normalizeName = (raw: string): string => raw.trim().replace(/\s+/g, ' ');

/**
 * Kural DIŞINDAN gelen adları (koloni üreteci, kahraman ad havuzu) sınıra sokar.
 * Doğrulama değil **kırpma**: bu adları oyuncu yazmıyor, biz üretiyoruz — reddedecek bir
 * muhatap yok, uyacak şekilde üretmek zorundayız.
 *
 * ⚠️ `slice` UTF-16 birimi keser. Türkçe harfler BMP'de olduğu için bölünmezler; havuz ve
 * üreteç zaten yalnız Türkçe/ASCII üretiyor.
 */
export const clampName = (raw: string): string =>
  normalizeName(raw).slice(0, NAME_MAX).trim();
