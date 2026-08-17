// dart format off
// ⚠️⚠️ ÜRETİLMİŞ DOSYA — ELLE DÜZENLEMEYİN.
//
// Kaynak: `ops/facts-to-dart.ts` · `pnpm facts:build`
// Kapı:   `pnpm facts:check` (CI) — web ile mobil ayrışırsa derleme kırılır.
//
// ⚠️ `dart format off` ŞART: biçimlendirici bu dosyaya dokunursa `facts:check` HER koşuda
//    kırılır — üreteç bir çıktı üretir, formatçı başkasını ve ikisi asla eşitlenmez.
//    `contracts.g.dart` de aynı satırı taşıyor; ölçülerek öğrenildi (2026-08-17).
//
// İçindekiler iki türden:
//   • `kUnitInfo` · `kBuildingInfo` · `kTechInfo` → elle yazılmış arayüz kopyası
//   • `kUnitTechNames` · `kUnitStrike` · `kUnitKind` → savaş motorunun kataloğundan
//     TÜRETİLMİŞ olgular. Bunları elle yazmak mobili yalancı yapar; gerekçe üreteçte.
library;

/// Birimin bilgi kutusundaki metinler.
class MwUnitInfo {
  const MwUnitInfo({required this.desc, this.extra});

  /// Ana açıklama.
  final String desc;

  /// «Özel» başlığı altındaki ek not; çoğu birimde yok.
  final String? extra;
}

const Map<String, MwUnitInfo> kUnitInfo = {
  'dwarf': MwUnitInfo(desc: 'İri cüsseleri ve büyük baltalarıyla yakın çarpışmanın belkemiğidirler. Ucuzdurlar ve kaynak başına dayanıklılıkları yüksektir; buna karşılık uzaktan gelen ok yağmuruna karşı korunaksızdırlar.', extra: 'Yeterince kalabalık bir cüce birliği düşmanın mağarasını yıkabilir. Demircilik seviyesi arttıkça bunun için gereken cüce sayısı azalır.'),
  'elf': MwUnitInfo(desc: 'Okçulukta ustadırlar; uzaktan gelen atışlara karşı da iyi korunurlar. Göğüs göğüse çarpışmada ise belirgin bir zayıflıkları vardır.', extra: 'Düşmanın casus kuşlarını vurabilmek için şehrinde Elf ya da Okçu Kulesi bulunmalıdır.'),
  'cavalry': MwUnitInfo(desc: 'Kalın zırhları özellikle oklara karşı dayanıklıdır; göğüs göğüse çarpışmada karşı konulması güç bir üstünlük kurarlar. Büyüye karşı Cüce kadar dirençli değillerdir.'),
  'pegasus': MwUnitInfo(desc: 'Mızrak ve okla vuran binicileriyle tanınırlar. Uçtukları için yerden gelen tehlikelerin çoğundan kurtulurlar. Büyü güçleri vardır ama büyüye karşı hassastırlar.', extra: 'Uçarlar: yere kurulan tuzaklara basmazlar.'),
  'dragon': MwUnitInfo(desc: 'Kalın derileri zırh gibi koruyan, ağzından alev saçan devasa yaratıklardır. Büyü güçleri çok yüksek, büyüye dirençleri son derece kuvvetlidir. Kaos\'tan sonra bir ordunun en güçlü silahıdır.', extra: 'Uçarlar: yere kurulan tuzaklara basmazlar.'),
  'mangonel': MwUnitInfo(desc: 'Fırlattıkları kaya kütleleri ve ateş toplarıyla düşman şehrinin direncini kırar, ordunun saldırısına destek verirler.', extra: 'Büyü vuruşları yoktur; büyü fazında saldıramaz, yalnız hasar alırlar. Ayrıca düşmanın gnomları tarafından sabote edilebilirler.'),
  'ogre': MwUnitInfo(desc: 'Ejderhadan sonra gelen en dayanıklı yaratıktır. Devasa tokmaklarıyla yakın dövüşün en ağır vuruşunu yapar ve göğüs göğüse çarpışmada üzerine geleni emer. Büyüye karşı Ejderha kadar dirençli değildir.'),
  'shaman': MwUnitInfo(desc: 'Canlıları iyileştiren özel güçleriyle bilinirler. Savaşçılık güçleri yok gibidir; asıl işlevleri çevrelerindeki canlıları ayakta tutmaktır.', extra: 'Yeterli sayıda şaman küçük bir saldırıyı tamamen durdurabilir. '),
  'spy_bird': MwUnitInfo(desc: 'Gönderildikleri şehrin üstünde uçarak yapıları, savunmayı ve orduyu rapor ederler.', extra: 'Savaş güçleri yoktur ve saldırıya katılamazlar, yalnız casusluk görevine çıkarlar. Casusluk tekniği yükseldikçe hem daha çok bilgi getirir hem daha az kayıp verirler. Düşmanın Okçu Kuleleri ve Elfleri tarafından vurulabilirler.'),
  'cargo_wagon': MwUnitInfo(desc: 'Büyük hayvanların çektiği yük arabalarıdır. Taşıma kapasiteleri diğer bütün savaşçılardan çok yüksektir; ganimet taşımak ve şehirler arasında kaynak aktarmak için kullanılırlar.', extra: 'Savaşta vuruş güçleri yoktur. Ordu bozguna uğrarsa taşıdıklarıyla birlikte ele geçirilirler.'),
  'gnome': MwUnitInfo(desc: 'Teknik yetenekleriyle tanınırlar: düşmanın tuzaklarını bozar, savunma ünitelerini sabote ederler. Saldırı ve savunma güçleri diğer savaşçılara göre zayıftır.'),
  'chaos': MwUnitInfo(desc: 'Yalnız çok büyük hükümdarlıkların ulaşabildiği, dünyanın en güçlü yaratığıdır. Onlarca Ejderha gücündeki Kaos, geniş bir alandaki savaşçıları bir anda yok edebilir. Bir Kaos\'u öldürmek son derece zordur.'),
  'wall': MwUnitInfo(desc: 'Şehri kuşatan taş duvardır. Ayakta kaldığı sürece savunmadaki savaşçıların üzerine gelen hasarın bir kısmını kendi üstüne çeker; savunmanın temel direği odur.', extra: 'Seviyesi arttıkça gücü katlanarak büyür ve pek çok savunma ünitesinin ön koşuludur. Savaşta yıkılırsa kendini onarır; onarım bitene kadar yeni savunma ünitesi üretilemez.'),
  'magic_shield': MwUnitInfo(desc: 'Saldıran ordudaki büyü gücüne sahip birimlerin etkisini azaltır. Her seviyesi daha fazla büyü koruması sağlar.', extra: 'Yalnız büyülü saldırılara karşı iş görür: Cüce ya da Süvari gibi büyüsüz bir orduya karşı hiçbir şey yapmaz. Seviye 1 kalkan çoğu savaşta erir; asıl korumasına 2. seviyeden itibaren ulaşır.'),
  'archer_tower': MwUnitInfo(desc: 'Sur savunmasının omurgasını oluştururlar. Hem canlı hem mekanize hedeflere karşı etkili vuruş güçleri vardır ve menzilleri sayesinde uzaktaki birimlere de ulaşırlar.', extra: 'Elflerle birlikte, düşmanın casus kuşlarını vurabilen iki şeyden biridir.'),
  'trap': MwUnitInfo(desc: 'Surun dış çevresine yerleştirilirler. Saldıran ordu şehre yaklaşmadan yer birimlerine ciddi zarar verirler.', extra: 'Bir kez patlar, sonra tükenirler. Uçan birimler tuzağa basmaz; gnomlar ise tuzakları bozabilir.'),
  'oil_cauldron': MwUnitInfo(desc: 'Surun üzerinde görev yapan, yakın savaşta etkili birimlerdir. Düşman sura saldırırken büyük kazanlarla kızgın yağ dökerek ciddi zarar verirler.'),
  'mangonel_tower': MwUnitInfo(desc: 'Surun üzerine monte edilmiş, büyük taş kütlelerini uzaklara fırlatabilen kulelerdir. Şehre saldıran ordu henüz uzaktayken geniş bir alandaki savaşçılara zarar verirler.'),
  'guard': MwUnitInfo(desc: 'Surlardan ok atabilen, yakın savaşta kılıç kullanan güçlü kale muhafızlarıdır. Kaynak başına düşen dayanıklılıkları oyundaki en yüksek değerdir.', extra: 'Yalnız bulundukları şehrin savunmasıyla görevlidirler; başka şehre gönderilemezler.'),
  'ballista': MwUnitInfo(desc: 'Çok büyük ve etkili okların atıldığı makinelerdir. Savunmanın en pahalı ve en güçlü ünitesidir: hem oklarıyla hem büyüyle vurur, dayanıklılığı da en yüksek olanıdır.'),
};

/// Birimi ölçekleyen tekniklerin Türkçe adları, Akademi ekranındaki sırayla.
///
/// ⚠️ **Boş liste GERÇEK bir bilgidir** (Yük Arabası, Casus Kuş): "bu birimi hiçbir savaş
/// tekniği güçlendirmiyor". Bölümü hiç çizmemek "bilgi eksik" gibi okunurdu.
const Map<String, List<String>> kUnitTechNames = {
  'dwarf': ['Demircilik', 'Zırh', 'Tılsım'],
  'elf': ['Okçuluk', 'Zırh', 'Tılsım'],
  'cavalry': ['Demircilik', 'Zırh', 'Tılsım'],
  'pegasus': ['Okçuluk', 'Büyücülük', 'Zırh', 'Tılsım'],
  'dragon': ['Büyücülük', 'Zırh', 'İçgüdü', 'Tılsım'],
  'mangonel': ['Zırh', 'Kimya', 'Tılsım'],
  'ogre': ['Zırh', 'İçgüdü', 'Tılsım'],
  'shaman': ['Demircilik', 'Büyücülük', 'Zırh', 'Tılsım'],
  'spy_bird': [],
  'cargo_wagon': [],
  'gnome': ['Demircilik', 'Zırh', 'Tılsım'],
  'chaos': ['Büyücülük', 'Zırh', 'İçgüdü', 'Tılsım'],
  'archer_tower': ['Okçuluk', 'Taş Ustalığı'],
  'trap': ['Demircilik'],
  'oil_cauldron': ['Zırh', 'Kimya', 'Tılsım'],
  'mangonel_tower': ['Kimya', 'Taş Ustalığı'],
  'guard': ['Demircilik', 'Zırh', 'Tılsım'],
  'ballista': ['Okçuluk', 'Taş Ustalığı'],
  'wall': ['Taş Ustalığı (%5)'],
  'magic_shield': ['Tılsım (%5)'],
  'temple': [],
};

/// Birimin hangi faz(lar)da hasar verdiği. ⚠️ Haritada YOKSA satır çizilmez.
const Map<String, String> kUnitStrike = {
  'dwarf': 'Yakın dövüş',
  'elf': 'Menzilli',
  'cavalry': 'Yakın dövüş',
  'pegasus': 'Menzilli · Büyü',
  'dragon': 'Menzilli · Büyü',
  'mangonel': 'Menzilli',
  'ogre': 'Yakın dövüş',
  'chaos': 'Yakın dövüş · Büyü',
  'archer_tower': 'Menzilli',
  'oil_cauldron': 'Yakın dövüş',
  'mangonel_tower': 'Menzilli',
  'guard': 'Yakın dövüş · Büyü',
  'ballista': 'Menzilli · Büyü',
};

/// `warrior` · `defense` — «Alan» satırının yalnız savaşçıda çizilmesi için.
const Map<String, String> kUnitKind = {
  'dwarf': 'warrior',
  'elf': 'warrior',
  'cavalry': 'warrior',
  'pegasus': 'warrior',
  'dragon': 'warrior',
  'mangonel': 'warrior',
  'ogre': 'warrior',
  'shaman': 'warrior',
  'spy_bird': 'warrior',
  'cargo_wagon': 'warrior',
  'gnome': 'warrior',
  'chaos': 'warrior',
  'archer_tower': 'defense',
  'trap': 'defense',
  'oil_cauldron': 'defense',
  'mangonel_tower': 'defense',
  'guard': 'defense',
  'ballista': 'defense',
  'wall': 'defense',
  'magic_shield': 'defense',
  'temple': 'defense',
};

const Map<String, String> kBuildingInfo = {
  'castle': 'Artırılan her bir Kale seviyesi için diğer yapıların toplam 10 seviye ilerletilebilmesini sağlar.',
  'barracks': 'Barakanın seviyesi yükseldikçe savaşçıların eğitim hızı artar.',
  'farm': 'Şehrin yiyecek üretimi çiftlik tarafından yapılır.',
  'mine': 'Şehirde kazılan madenlerden altın çıkarılır.',
  'academy': 'Akademi, çeşitli savaş ve ekonomi tekniklerin geliştirildiği yapıdır. Geliştirilen teknikler krallığın tüm şehirleri için ortaktır. Bir şehirdeki akademinin seviyesi yükseldikçe, sadece o akademideki tekniklerin yapılma süresi kısalır.',
  'architect_school': 'Mimar Okulu seviyesi arttıkça savunma ünitelerinin ve diğer yapıların yükseltmelerinin süreleri kısalır.',
  'cave': 'Mağara savaşçıları düşman saldırılarından korur. Mağara doldurmak ve boşaltmak, savaşçıların toplam kapladığı alana göre değişir. Mağarada bulunan birimler şehir savunmasına katılamaz. Yeteri kadar cüce saldırısı mağarayı yıkabilir.',
  'temple': 'Tapınak, şehirdeki kahramanların yer aldığı yapıdır. Tapınak seviyesi artırıldığında hem savaşlarda kahraman çıkma olasılığı yükselir, hem de savaşta kaybedilen kahramanların dirilme süresi kısalır.',
  'teleport': 'Teleport bulunan iki şehir arasında savaşçılar anlık olarak geçiş yapabilir. Tekrar kullanabilmek için bir süre beklemek gerekir. Teleport seviyesi arttıkça bu süre kısalır.',
};

const Map<String, String> kTechInfo = {
  'archery': 'Ok kullanan savaşçıların ve menzilli savunma ünitelerinin atış gücünü geliştirir. Menzilli birimler düşman yaklaşmadan vurmaya başladığı için erken yatırım karşılığını çabuk verir.',
  'blacksmithing': 'Silah ustalarının becerisini artırır; kılıç, balta ve mızrakla yakın dövüşe giren birimlerin vuruşunu güçlendirir. Ayrıca cücelerin düşman mağarasını yıkmasını kolaylaştırır — seviye yükseldikçe daha az cüce yeter.',
  'chemistry': 'Fırlatılan taşları ve okları yanıcı hâle getirir. Kuşatma makinelerinin ve kızgın yağın düşürdüğü hasarı artırır.',
  'instinct': 'Ejderha, Ogre ve Kaos gibi yaratıkların doğal savaşçılık içgüdüsünü keskinleştirir. Listesi dar ama oyunun en büyük vuruş güçlerini çarptığı için geç oyunun belkemiğidir.',
  'sorcery': 'Büyü gücü olan savaşçıların büyü kapasitesini artırır. Büyü, savaşçının uzaktan mı yakından mı dövüştüğüne bakmadan işler; bu yüzden etkisi geniştir. Ayrıca pek çok üst seviye birimin ve yapının ön koşuludur.',
  'armor': 'Demir ustaları daha iyi zırhlar üretir; birimlerin fiziksel saldırılara karşı emdiği hasarı artırır. Zırh yeterince kalınsa gelen darbe hiç kayıp vermeden savuşturulur. Hem saldırıda hem savunmada, oyundaki en geniş birim listesinde işler.',
  'masonry': 'Taş ustaları daha sağlam savunma yapıları kurar; Sur\'un ve sur üzerindeki ünitelerin fiziksel dayanıklılığını artırır. Yalnız savunmada iş görür; saldırıya çıkan orduya hiçbir katkısı yoktur.',
  'talisman': 'Savaşçıları büyüyle yapılan saldırılara karşı korur; Büyü Kalkanı\'nın gücünü de bu teknik belirler. Üst seviye ordular ağırlıkla büyüyle vurduğu için önemi oyun ilerledikçe artar.',
  'espionage': 'Casusluk yeteneği üstün hükümdarlar rakipleri hakkında daha çok şey öğrenir. Ne kadar bilgi geldiğini, sizin casusluk seviyenizle rakibinkinin FARKI belirler — mutlak seviyeniz değil.',
  'cartography': 'Yol ve harita bilgisi geliştikçe ordular hedefe daha çabuk ulaşır. Uzak hedeflere yapılan seferlerde kazancı en yüksektir.',
  'colonization': 'Boş koordinatlara yeni şehir kurma hakkı verir. Her yeni şehir kendi ekonomisini, ordusunu ve savunmasını getirir; üstelik teknikler tüm şehirlerde ortak olduğu için bütün teknik yatırımınızın getirisini büyütür.',
  'night_vision': 'Gece (00:00–08:00) yapılan savaşlarda görüş azalır ve her iki tarafın vuruş gücü düşer. Bu teknik gecenin getirdiği kaybı kapatır. Sur ve Büyü Kalkanı geceden hiç etkilenmez; yani gece saldırmak savunanın işine yarar.',
};

/// ⭐ KAHRAMAN YETENEKLERİ — dört anahtar, oyunun kendi sırasıyla.
///
/// ⚠️ Sıra fiziksel saldırı → fiziksel savunma → büyü saldırı → büyü savunma. İki istemcide
/// farklı olsaydı sayılar yanlış okunurdu.
/// ⚠️ Büyü yetenekleri ziyan DEĞİL: kahramanın büyü tabanı fizikselle aynı (1200, binary'den
/// doğrulandı). Bu yüzden ekranda büyüden caydıran bir uyarı yok.
const List<({String key, String icon, String label})> kHeroSkills = [
  (key: 'fAtk', icon: 'fiz_sal', label: 'Fiziksel Saldırı'),
  (key: 'fDef', icon: 'fiz_sav', label: 'Fiziksel Savunma'),
  (key: 'mAtk', icon: 'buy_sal', label: 'Büyü Saldırı'),
  (key: 'mDef', icon: 'buy_sav', label: 'Büyü Savunma'),
];

/// ⭐ OYUNCUNUN YAZDIĞI ADLARIN SINIRI — şehir ve kahraman için aynı.
///
/// ⚠️ Sınır orijinalden geliyor (J2ME «Şehir Adı» formu) ve **sunucu doğrulaması aynı
/// sayılara bakıyor**. İstemcide elle yazılsaydı, kutu sunucunun reddedeceği bir adı kabul
/// edip düğmeyi açardı — web'de tam bu yaşandı (kutu 2-24 diyordu, sunucu 3-10 istiyordu).
const int kNameMin = 3;
const int kNameMax = 15;
const String kNameRuleMessage = 'Ad 3-15 karakter olmalı; harf, rakam ve boşluk kullanılabilir.';
