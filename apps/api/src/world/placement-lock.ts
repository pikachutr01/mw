/**
 * ⭐ YERLEŞİM KİLİDİ — «bu dünyada boş bir koordinatı kim kapıyor» sorusunun TEK kapısı.
 *
 * `pg_advisory_xact_lock(PLACEMENT_LOCK, worldId)` — dünya başına, transaction ömürlü.
 * İki yol buradan geçer:
 *   1. **Kayıt** — yeni oyuncunun başkenti yerleşir (`auth.service.ts`).
 *   2. **Şehir kurma varışı** — `found_city` görevi boş koordinata şehir yazar
 *      (`mission.handlers.ts` `createFoundCityHandler`).
 *
 * ⚠️ **İkincisi 2026-08-07'ye kadar kilitsizdi.** Handler önce «burada şehir var mı» diye
 * bakıp sonra `INSERT` ediyordu; arada bir oku-yaz penceresi vardı. Aynı koordinata eşzamanlı
 * iki varışta (ya da bir varış + bir kayıt) `cities_world_coords` benzersizliği ihlal ediliyor,
 * görev `failed` olup 5 denemede `dead`e düşüyordu — o noktada **birlikler şehirden çoktan
 * düşmüş ve dönüş görevi hiç yazılmamış** oluyordu, yani ordu kalıcı kaybolurdu. Kargo
 * eklendikten sonra aynı yoldan kaynak da kaybolacaktı.
 *
 * ⚠️ **`lockCity` ile ÇAKIŞMAZ.** PostgreSQL'de advisory kilitlerin iki ayrı anahtar uzayı
 * vardır: tek `bigint` ve `(int, int)` çifti. `lockCity` birincisini (`cities.id`), bu kilit
 * ikincisini kullanıyor — ikisi birbirini hiçbir zaman engellemez. Bu **kazara çakışma yok**
 * demek olduğu kadar **kasıtlı sıraya sokma da yok** demek: aynı yeri koruması gereken iki
 * yolun AYNI kilidi istemesi şart, bu yüzden sabit tek dosyada.
 *
 * ⚠️ Kilit sırası kuralı: **önce `lockPlacement()`, sonra `lockCity()`.** Tersini yapan bir
 * handler eklenirse iki kilit arasında döngü (deadlock) doğar.
 *
 * ⚠️ Maliyeti ölçülemez: kayıt «dünya başına saniyede bir bile olmayan» bir işlem
 * (`auth.service.ts`), bir oyuncu da ömrü boyunca en fazla 5 şehir kurar.
 *
 * ⚠️ Sabit **kopyalanmamalı** — `WORLD_SHAPE`'in başına gelen tam olarak buydu: iki dosyada
 * kopyaydı ve biri değişince diğeri sessizce eskiyordu.
 */
export const PLACEMENT_LOCK = 4713;
