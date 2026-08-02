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

/**
 * ⚠️ **Tavan 10'dan 15'e çıktı** (kullanıcı, 2026-08-01). Gerekçe hesap silme akışından geldi:
 * silinen oyuncuya `hükümdar1`, `hükümdar2`… deseninde anonim bir ad veriliyor ve sayı
 * büyüdükçe 10 karakter yetmiyor (`hükümdar` tek başına 8 karakter). Kullanıcı sınırı hem
 * kullanıcı adı hem şehir adı için birlikte yükseltti — ikisi aynı boyda kalsın diye.
 */
export const NAME_MIN = 3;
export const NAME_MAX = 15;

/** Harf (her alfabe) · rakam · boşluk. Emoji ve noktalama dışarıda. */
export const NAME_PATTERN = /^[\p{L}\p{N} ]+$/u;

export const NAME_RULE_MESSAGE =
  `Ad ${NAME_MIN}-${NAME_MAX} karakter olmalı; harf, rakam ve boşluk kullanılabilir.`;

/* ── KULLANICI ADI ───────────────────────────────────────────────────────────
 * ⭐ **Boşluk 2026-08-02'de SERBEST bırakıldı** (kullanıcı): `Eru Ilúvatar` gibi iki parçalı
 * adlar reddediliyordu. Kural artık şehir/kahraman adıyla aynı — harf, rakam ve boşluk.
 * (Aksanlı harfler zaten geçiyordu: `\p{L}` `ú`yü de kapsıyor; reddedilen şey boşluktu.)
 *
 * ⚠️ Boşluğu serbest bırakmanın tek gerçek riski şuydu: baştaki/sondaki ya da içerideki
 * çoklu boşluk **görünmez** ama girişte eşleşmeyi bozar — oyuncu doğru yazdığını sanıp
 * giremez. Bu yüzden kullanıcı adı hem KAYITTA hem GİRİŞTE `normalizeName`den geçiyor
 * (`packages/contracts/src/auth.ts`); yani "  Eru   Ilúvatar " ile "Eru Ilúvatar" aynı ada
 * çözülüyor. Normalizasyon şemada, servis katmanında değil: iki uçtan biri unutulursa
 * kayıt bir adı, giriş başka bir adı arar.
 *
 * ⚠️ **Neden burada, `contracts`ta değil**: uzunluk sınırı üç yerde birden gerekiyor (zod
 * şeması · tarayıcı `maxLength` · hesap silmenin ürettiği anonim ad) ve üçü ayrı sayı
 * tutarsa biri kaçınılmaz olarak bayatlar — nitekim `Temple.tsx` tam olarak bunu yaşadı
 * (24 yazıyordu, sunucu 10 istiyordu). `catalog`un hiç bağımlılığı yok, `contracts → catalog`
 * kenarı tek yönlü ve güvenli (`settings → catalog` ile aynı gerekçe).
 */
export const USERNAME_MIN = NAME_MIN;
export const USERNAME_MAX = NAME_MAX;
export const USERNAME_PATTERN = /^[\p{L}\p{N} ]+$/u;
export const USERNAME_RULE_MESSAGE =
  `Kullanıcı adı ${USERNAME_MIN}-${USERNAME_MAX} karakter olmalı; harf, rakam ve boşluk `
  + `kullanılabilir, noktalama ve simge kullanılamaz.`;

/**
 * ⭐ HESAP SİLMEDE ÜRETİLEN ANONİM AD DESENİ — `hükümdar12`.
 *
 * ⚠️ Kayıt bu deseni **REZERVE EDER**: gerçek bir oyuncu "hükümdar1" alırsa, sonraki hesap
 * silme aynı adı üretmek isteyip dünya-içi tekillik kısıtına çarpardı.
 */
export const DELETED_NAME_PREFIX = 'hükümdar';
export const DELETED_NAME_RE = /^hükümdar\d+$/iu;
export const deletedName = (n: number): string => `${DELETED_NAME_PREFIX}${n}`;

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
