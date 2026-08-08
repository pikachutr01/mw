/**
 * ⭐ AÇIKLAMA METİNLERİ — oyuncuya "bu ne işe yarar" diye anlatan kısa yazılar.
 *
 * Kullanıcı isteği (2026-08-08): yapı adının yanındaki `i` düğmesine tıklayınca açılan
 * bilgi kutusunun metinleri. **Metinler kullanıcının yazdığı gibi**, kelimesi kelimesine —
 * bunlar oyunun kendi diliyle yazılmış tanımlar, benim yeniden ifade etmem sadeleştirme değil
 * anlam kayması olurdu.
 *
 * ⚠️ **Neden `@mobilwar/catalog`ta değil.** Katalog *denge verisi* taşır (maliyet, tavan, süre)
 * ve `display-order.ts` bu ayrımı zaten yazıyor: *"Sıralama SUNUM bilgisidir, denge verisi
 * DEĞİL → bu yüzden `BUILDINGS` içinde tutulmuyor."* Açıklama metni de aynı sınıfta: arayüz
 * kopyası. Kataloga koymak, sunucunun hiç kullanmadığı üç paragrafı her denge testine
 * taşımak olurdu.
 *
 * ⚠️ Ad ve seviye buraya YAZILMAZ — onlar katalogtan gelir (`lib/names.ts` kuralı). Burada
 * yalnız açıklayıcı düz metin var.
 *
 * ⭐ Dosya **büyümek üzere** tasarlandı: kullanıcı *"diğer sayfalar için de yapacağız"* dedi.
 * Yeni bölüm gerektiğinde ayrı bir `Record` eklenir, tüketici yine `?.[id]` ile okur — eksik
 * kayıt `undefined` döner ve o satırda hiç düğme çıkmaz (sessiz ve doğru varsayılan).
 */

/** Yapılar sayfası (§10). Anahtar = katalog yapı `id`'si. */
export const BUILDING_INFO: Readonly<Record<string, string>> = {
  castle:
    'Artırılan her bir Kale seviyesi için diğer yapıların toplam 10 seviye ilerletilebilmesini '
    + 'sağlar.',
  barracks:
    'Barakanın seviyesi yükseldikçe savaşçıların eğitim hızı artar.',
  farm:
    'Şehrin yiyecek üretimi çiftlik tarafından yapılır.',
  mine:
    'Şehirde kazılan madenlerden altın çıkarılır.',
  academy:
    'Akademi, çeşitli savaş ve ekonomi tekniklerin geliştirildiği yapıdır. Geliştirilen '
    + 'teknikler krallığın tüm şehirleri için ortaktır. Bir şehirdeki akademinin seviyesi '
    + 'yükseldikçe, sadece o akademideki tekniklerin yapılma süresi kısalır.',
  architect_school:
    'Mimar Okulu seviyesi arttıkça savunma ünitelerinin ve diğer yapıların yükseltmelerinin '
    + 'süreleri kısalır.',
  cave:
    'Mağara savaşçıları düşman saldırılarından korur. Mağara doldurmak ve boşaltmak, '
    + 'savaşçıların toplam kapladığı alana göre değişir. Mağarada bulunan birimler şehir '
    + 'savunmasına katılamaz. Yeteri kadar cüce saldırısı mağarayı yıkabilir.',
  temple:
    'Tapınak, şehirdeki kahramanların yer aldığı yapıdır. Tapınak seviyesi artırıldığında hem '
    + 'savaşlarda kahraman çıkma olasılığı yükselir, hem de savaşta kaybedilen kahramanların '
    + 'dirilme süresi kısalır.',
  teleport:
    'Teleport bulunan iki şehir arasında savaşçılar anlık olarak geçiş yapabilir. Tekrar '
    + 'kullanabilmek için bir süre beklemek gerekir. Teleport seviyesi arttıkça bu süre kısalır.',
};
