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

/**
 * ⭐ BARAKA ve SAVUNMA sayfaları (§10) — birim bilgi kutusunun **metin** kısmı.
 *
 * Kullanıcı isteği (2026-08-11): askerlerin yanına Yapılar'dakine benzer bir popover; en üstte
 * kısa açıklama, altında çizgiyle ayrılmış bölümlerde özellikler ve etkilendiği teknikler.
 *
 * ⚠️ **Yalnız METİN burada.** Teknik listesi, vuruş fazı ve sayısal özellikler `lib/unit-facts.ts`
 * üzerinden **savaş motorunun kataloğundan** türetiliyor. Buraya elle yazmak, motor değiştiğinde
 * ekranın sessizce yalan söylemesi demekti — ve oyunun kendi dokümanı motorla üç yerde zaten
 * çelişiyor (gerekçesi `unit-facts.ts` başlığında).
 *
 * ⚠️ Metinler `docs/referans/tekniklere_ve_yapilara_iliskin_on_bilgiler.txt`ten **esinlendi**,
 * kopyalanmadı: oradaki bazı cümleler ölçümle çürütülmüş iddialar taşıyor (Ogre'nin Demircilik'ten
 * etkilenmesi gibi) ve birebir alınsalardı kutunun metniyle listesi birbirini yalanlardı.
 *
 * ⚠️ `extra` alanı **oynanışı değiştiren** bir kural içindir, süs değil: mağara yıkma, casus kuş
 * vurma, sabotaj, «bu birim hasar vermez» gibi. Doldurulacak bir şey yoksa boş bırakılır ve kutuda
 * o bölüm hiç çizilmez.
 */
export interface UnitInfoText {
  /** Kutunun en üstündeki kısa tanım. */
  desc: string;
  /** Oynanışı değiştiren özel kural. Yoksa bölüm çizilmez. */
  extra?: string;
}

export const UNIT_INFO: Readonly<Record<string, UnitInfoText>> = {
  /* ── Savaşçılar ─────────────────────────────────────────────────────────── */
  dwarf: {
    desc: 'İri cüsseleri ve büyük baltalarıyla yakın çarpışmanın belkemiğidirler. Ucuzdurlar ve '
      + 'kaynak başına dayanıklılıkları yüksektir; buna karşılık uzaktan gelen ok yağmuruna '
      + 'karşı korunaksızdırlar.',
    extra: 'Yeterince kalabalık bir cüce birliği düşmanın mağarasını yıkabilir. Demircilik '
      + 'seviyesi arttıkça bunun için gereken cüce sayısı azalır.',
  },
  elf: {
    desc: 'Okçulukta ustadırlar; uzaktan gelen atışlara karşı da iyi korunurlar. Göğüs göğüse '
      + 'çarpışmada ise belirgin bir zayıflıkları vardır.',
    extra: 'Düşmanın casus kuşlarını vurabilmek için şehrinde Elf ya da Okçu Kulesi bulunmalıdır.',
  },
  cavalry: {
    desc: 'Kalın zırhları özellikle oklara karşı dayanıklıdır; göğüs göğüse çarpışmada karşı '
      + 'konulması güç bir üstünlük kurarlar. Büyüye karşı Cüce kadar dirençli değillerdir.',
  },
  pegasus: {
    desc: 'Mızrak ve okla vuran binicileriyle tanınırlar. Uçtukları için yerden gelen tehlikelerin '
      + 'çoğundan kurtulurlar. Büyü güçleri vardır ama büyüye karşı hassastırlar.',
    extra: 'Uçarlar: yere kurulan tuzaklara basmazlar.',
  },
  dragon: {
    desc: 'Kalın derileri zırh gibi koruyan, ağzından alev saçan devasa yaratıklardır. Büyü '
      + 'güçleri çok yüksek, büyüye dirençleri son derece kuvvetlidir. Kaos\'tan sonra bir '
      + 'ordunun en güçlü silahıdır.',
    extra: 'Uçarlar: yere kurulan tuzaklara basmazlar.',
  },
  mangonel: {
    desc: 'Fırlattıkları kaya kütleleri ve ateş toplarıyla düşman şehrinin direncini kırar, '
      + 'ordunun saldırısına destek verirler.',
    extra: 'Büyü savunmaları yoktur, Tılsım onlara işlemez. Ayrıca düşmanın gnomları tarafından '
      + 'sabote edilebilirler.',
  },
  ogre: {
    desc: 'Ejderhadan sonra gelen en dayanıklı yaratıktır. Devasa tokmaklarıyla yakın dövüşün en '
      + 'ağır vuruşunu yapar ve göğüs göğüse çarpışmada üzerine geleni emer. Büyüye karşı '
      + 'Ejderha kadar dirençli değildir.',
  },
  shaman: {
    desc: 'Canlıları iyileştiren özel güçleriyle bilinirler. Savaşçılık güçleri yok gibidir; asıl '
      + 'işlevleri çevrelerindeki canlıları ayakta tutmaktır.',
    extra: 'Yeterli sayıda şaman küçük bir saldırıyı tamamen durdurabilir. ',
  },
  spy_bird: {
    desc: 'Gönderildikleri şehrin üstünde uçarak yapıları, savunmayı ve orduyu rapor ederler.',
    extra: 'Savaş güçleri yoktur ve saldırıya katılamazlar, yalnız casusluk görevine çıkarlar. '
      + 'Casusluk tekniği yükseldikçe hem daha çok bilgi getirir hem daha az kayıp verirler. '
      + 'Düşmanın Okçu Kuleleri ve Elfleri tarafından vurulabilirler.',
  },
  cargo_wagon: {
    desc: 'Büyük hayvanların çektiği yük arabalarıdır. Taşıma kapasiteleri diğer bütün '
      + 'savaşçılardan çok yüksektir; ganimet taşımak ve şehirler arasında kaynak aktarmak için '
      + 'kullanılırlar.',
    extra: 'Savaşta vuruş güçleri yoktur. Ordu bozguna uğrarsa taşıdıklarıyla birlikte ele '
      + 'geçirilirler.',
  },
  gnome: {
    desc: 'Teknik yetenekleriyle tanınırlar: düşmanın tuzaklarını bozar, savunma ünitelerini '
      + 'sabote ederler. Saldırı ve savunma güçleri diğer savaşçılara göre zayıftır.',
  },
  chaos: {
    desc: 'Yalnız çok büyük hükümdarlıkların ulaşabildiği, dünyanın en güçlü yaratığıdır. '
      + 'Onlarca Ejderha gücündeki Kaos, geniş bir alandaki savaşçıları bir anda yok edebilir. '
      + 'Bir Kaos\'u öldürmek son derece zordur.',
  },

  /* ── Savunma ────────────────────────────────────────────────────────────── */
  wall: {
    desc: 'Şehri kuşatan taş duvardır. Ayakta kaldığı sürece savunmadaki savaşçıların üzerine '
      + 'gelen hasarın bir kısmını kendi üstüne çeker; savunmanın temel direği odur.',
    extra: 'Seviyesi arttıkça gücü katlanarak büyür ve pek çok savunma ünitesinin ön koşuludur. '
      + 'Savaşta yıkılırsa kendini onarır; onarım bitene kadar yeni savunma ünitesi üretilemez.',
  },
  magic_shield: {
    desc: 'Saldıran ordudaki büyü gücüne sahip birimlerin etkisini azaltır. Her seviyesi daha '
      + 'fazla büyü koruması sağlar.',
    extra: 'Yalnız büyülü saldırılara karşı iş görür: Cüce ya da Süvari gibi büyüsüz bir orduya '
      + 'karşı hiçbir şey yapmaz. Seviye 1 kalkan çoğu savaşta erir; asıl korumasına 2. seviyeden '
      + 'itibaren ulaşır.',
  },
  archer_tower: {
    desc: 'Sur savunmasının omurgasını oluştururlar. Hem canlı hem mekanize hedeflere karşı '
      + 'etkili vuruş güçleri vardır ve menzilleri sayesinde uzaktaki birimlere de ulaşırlar.',
    extra: 'Elflerle birlikte, düşmanın casus kuşlarını vurabilen iki şeyden biridir.',
  },
  trap: {
    desc: 'Surun dış çevresine yerleştirilirler. Saldıran ordu şehre yaklaşmadan yer birimlerine '
      + 'ciddi zarar verirler.',
    extra: 'Bir kez patlar, sonra tükenirler. Uçan birimler tuzağa basmaz; gnomlar ise tuzakları '
      + 'bozabilir.',
  },
  oil_cauldron: {
    desc: 'Surun üzerinde görev yapan, yakın savaşta etkili birimlerdir. Düşman sura saldırırken '
      + 'büyük kazanlarla kızgın yağ dökerek ciddi zarar verirler.',
  },
  mangonel_tower: {
    desc: 'Surun üzerine monte edilmiş, büyük taş kütlelerini uzaklara fırlatabilen kulelerdir. '
      + 'Şehre saldıran ordu henüz uzaktayken geniş bir alandaki savaşçılara zarar verirler.',
  },
  guard: {
    desc: 'Surlardan ok atabilen, yakın savaşta kılıç kullanan güçlü kale muhafızlarıdır. '
      + 'Kaynak başına düşen dayanıklılıkları oyundaki en yüksek değerdir.',
    extra: 'Yalnız bulundukları şehrin savunmasıyla görevlidirler; başka şehre gönderilemezler.',
  },
  ballista: {
    desc: 'Çok büyük ve etkili okların atıldığı makinelerdir. Savunmanın en pahalı ve en güçlü '
      + 'ünitesidir: hem oklarıyla hem büyüyle vurur, dayanıklılığı da en yüksek olanıdır.',
  },
};

/**
 * ⭐ AKADEMİ sayfası (§10) — teknik bilgi kutusunun **metin** kısmı.
 *
 * Kullanıcı isteği (2026-08-11): tekniklere de Baraka'dakine benzer kutular; *"çok teknik detay
 * vermeden, oyuncuların anlayabileceği türden"*.
 *
 * ⚠️ **Oran ve etkilenen birim listesi burada YOK**, `lib/tech-facts.ts` üzerinden savaş
 * motorunun kataloğundan geliyor. Referans dokümanın oranları yanlış (Tılsım'ı %5 diyor,
 * savaşçılarda gerçekte %6) ve elle yazsaydık kutu o yanlışı öğretirdi. ⚠️ Üstelik tek bir
 * oran da yetmiyor: Tılsım **Büyü Kalkanı'nda gerçekten %5** (ayrı ölçekleyici, 2026-08-11
 * ölçümü) — istisna `TechDef.rateByUnit`ten türetiliyor.
 *
 * ⚠️ Metinler **ne yaptığını** anlatır, **kaç yaptığını** değil: sayı hep türetilmiş bölümde
 * durur. Bir teknik yeniden dengelenince metne dokunulması gerekmesin.
 */
export const TECH_INFO: Readonly<Record<string, string>> = {
  archery:
    'Ok kullanan savaşçıların ve menzilli savunma ünitelerinin atış gücünü geliştirir. '
    + 'Menzilli birimler düşman yaklaşmadan vurmaya başladığı için erken yatırım karşılığını '
    + 'çabuk verir.',
  blacksmithing:
    'Silah ustalarının becerisini artırır; kılıç, balta ve mızrakla yakın dövüşe giren '
    + 'birimlerin vuruşunu güçlendirir. Ayrıca cücelerin düşman mağarasını yıkmasını '
    + 'kolaylaştırır — seviye yükseldikçe daha az cüce yeter.',
  chemistry:
    'Fırlatılan taşları ve okları yanıcı hâle getirir. Kuşatma makinelerinin ve kızgın yağın '
    + 'düşürdüğü hasarı artırır.',
  instinct:
    'Ejderha, Ogre ve Kaos gibi yaratıkların doğal savaşçılık içgüdüsünü keskinleştirir. '
    + 'Listesi dar ama oyunun en büyük vuruş güçlerini çarptığı için geç oyunun belkemiğidir.',
  sorcery:
    'Büyü gücü olan savaşçıların büyü kapasitesini artırır. Büyü, savaşçının uzaktan mı yakından '
    + 'mı dövüştüğüne bakmadan işler; bu yüzden etkisi geniştir. Ayrıca pek çok üst seviye '
    + 'birimin ve yapının ön koşuludur.',
  armor:
    'Demir ustaları daha iyi zırhlar üretir; birimlerin fiziksel saldırılara karşı emdiği hasarı '
    + 'artırır. Zırh yeterince kalınsa gelen darbe hiç kayıp vermeden savuşturulur. Hem saldırıda '
    + 'hem savunmada, oyundaki en geniş birim listesinde işler.',
  masonry:
    'Taş ustaları daha sağlam savunma yapıları kurar; Sur\'un ve sur üzerindeki ünitelerin '
    + 'fiziksel dayanıklılığını artırır. Yalnız savunmada iş görür; saldırıya çıkan orduya '
    + 'hiçbir katkısı yoktur.',
  talisman:
    'Savaşçıları büyüyle yapılan saldırılara karşı korur; Büyü Kalkanı\'nın gücünü de bu teknik '
    + 'belirler. Üst seviye ordular ağırlıkla büyüyle vurduğu için önemi oyun ilerledikçe artar.',
  espionage:
    'Casusluk yeteneği üstün hükümdarlar rakipleri hakkında daha çok şey öğrenir. Ne kadar bilgi '
    + 'geldiğini, sizin casusluk seviyenizle rakibinkinin FARKI belirler — mutlak seviyeniz değil.',
  cartography:
    'Yol ve harita bilgisi geliştikçe ordular hedefe daha çabuk ulaşır. Uzak hedeflere yapılan '
    + 'seferlerde kazancı en yüksektir.',
  colonization:
    'Boş koordinatlara yeni şehir kurma hakkı verir. Her yeni şehir kendi ekonomisini, ordusunu '
    + 've savunmasını getirir; üstelik teknikler tüm şehirlerde ortak olduğu için bütün teknik '
    + 'yatırımınızın getirisini büyütür.',
  night_vision:
    'Gece (00:00–08:00) yapılan savaşlarda görüş azalır ve her iki tarafın vuruş gücü düşer. '
    + 'Bu teknik gecenin getirdiği kaybı kapatır. Sur ve Büyü Kalkanı geceden hiç etkilenmez; '
    + 'yani gece saldırmak savunanın işine yarar.',
};
