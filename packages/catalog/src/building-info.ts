/**
 * ⭐ YAPI AÇIKLAMALARI — oyuncunun yapı adının üstüne gelince gördüğü metin (kullanıcı, 2026-08-01).
 *
 * ⚠️⚠️ **BU METİNLER `BuildingDef`E EKLENEMEZ.** `catalogHash()` (`hash.ts:53`) `BUILDINGS`
 * dizisini **doğrudan** `JSON.stringify` ediyor ve özet her savaş satırına yazılıyor
 * (`battles.catalog_hash`). Tanıma bir alan eklemek geçmiş TÜM savaşların künyesini kaydırır
 * ve "denge değişti" diye sahte bir sinyal üretir. Bu yüzden açıklamalar **ayrı bir modülde**
 * ve özet yükünün dışında. `hash.test.ts`teki literal (`2ec624e6`) bu kuralın bekçisi.
 *
 * ⚠️ Metinlerin **9 tanesi kullanıcının kendi yazdığı metindir** ve birebir korunur. Bizim
 * eklediğimiz her cümle `extra` alanında ayrı duruyor — hangisinin oyunun kendi anlatımı,
 * hangisinin bizim notumuz olduğu karışmasın.
 */
import type { BuildingId } from './types.ts';

export interface BuildingInfo {
  /** Kullanıcının yazdığı metin — BİREBİR, düzenlenmez. */
  text: string;
  /**
   * ⭐ Bizim eklediğimiz eksik/uyarı satırları. Kullanıcının metni oyunun anlatımı; bunlar
   * ise **bizim uygulamamızın** o anlatıma eklediği ya da ondan saptığı yerler.
   */
  extra?: string[];
}

export const BUILDING_INFO: Readonly<Record<BuildingId, BuildingInfo>> = {
  farm: {
    text: 'Şehrin yiyecek üretimi çiftlik tarafından yapılır. Çiftlik seviyesi ne kadar '
      + 'yükseltilirse, saat başına çiftlikte üretilen yiyecek miktarı da o kadar artar. '
      + 'Yiyecek çiftliklerden üretilebildiği gibi savaşlarda ganimet olarak da elde edilebilir.',
    extra: ['Çiftlik ve Maden 40. seviyeye çıkabilir; diğer yapılar 20\'de durur.'],
  },
  mine: {
    text: 'Şehirde kazılan madenlerden altın çıkarılır. Altın madenin seviyesi ne kadar '
      + 'yükseltilirse, saat başına madenden çıkarılan altın miktarı da o kadar artar. '
      + 'Özellikle yeni kurulan bir şehirde maden, seviyesi öncelikle yükseltilmesi gereken '
      + 'yapıdır. Altın, madenlerden çıkarılabildiği gibi savaşlarda ganimet olarak da elde '
      + 'edilebilir.',
    extra: ['Çiftlik ve Maden 40. seviyeye çıkabilir; diğer yapılar 20\'de durur.'],
  },
  barracks: {
    text: 'Şehrin çevresindeki köylerden toplanan savaşçıların eğitilerek şehir ordusuna '
      + 'katıldığı yapıdır. Barakanın seviyesi yükseldikçe savaşçıların eğitim hızı artar. '
      + 'Bu şekilde daha kısa zamanda, daha çok savaşçı üretilebilir. Eğer bazı savaşçılar '
      + 'üretemiyorsanız, bunun nedeni henüz gerekli Baraka seviyesine ulaşılmaması olabilir.',
    /** ⭐ Metinde YOK ama kodda var: Baraka aynı zamanda iki sayacı birden sınırlıyor. */
    extra: [
      'Baraka seviyesi ayrıca iki sınırı belirler: aynı anda kaç üretim emri verebileceğini '
      + 've bu şehirden aynı anda kaç ordunun sefere çıkabileceğini.',
    ],
  },
  academy: {
    text: 'Akademi, çeşitli savaş ve ekonomi tekniklerin geliştirildiği yapıdır. Geliştirilen '
      + 'teknikler krallığın tüm şehirleri için ortaktır. Bir şehirdeki akademinin seviyesi '
      + 'yükseldikçe, sadece o akademideki tekniklerin yapılma süresi kısalır. Gerekli seviyeye '
      + 'ulaşmamış akademilerde bazı teknikler ilerletilemez.',
  },
  castle: {
    text: 'Kaleler, hükümdarların ordularını ve şehirlerini yönettikleri yerlerdir. Şehirlerde '
      + 'yapılacak diğer birçok yapının seviyelerinin ilerletilebilmesi kalenin seviyesine '
      + 'bağlıdır. Kale seviyelerine bakılarak bir şehrin gelişmişlik seviyesi hakkında fikir '
      + 'yürütülebilir. Artırılan her bir Kale seviyesi için diğer yapıların toplam 10 seviye '
      + 'ilerletilebilmesi mümkün olmaktadır.',
    extra: ['Kale\'nin kendisi ile Sur ve Büyü Kalkanı bu bütçeyi tüketmez.'],
  },
  architect_school: {
    /**
     * ⚠️ **METİN DÜZELTİLDİ — "diğer" kelimesi çıkarıldı** (2026-08-01).
     *
     * Kullanıcının yazdığı özgün cümle *"diğer şehir yapıları ve savunma ünitelerini"* diyordu
     * ve bizim kodumuzla ÇELİŞİYORDU: `buildingTimeSeconds` Mimar Okulu'nun **kendi inşasını
     * da** kendi seviyesiyle hızlandırıyor. Orijinal oyunda özel bir dal vardı (kendini
     * hızlandıramaz), 1,4'lük bölenin kaçışını frenlemek içindi; bölen 1,2'ye inince bilerek
     * kaldırıldı (`formulas.ts:318-320`). Kodu değil metni düzeltmek doğru: özel dalı geri
     * koymak sessiz bir tutarsızlık kaynağı olurdu.
     */
    text: 'Mimar okulunda yetişen yapı ustaları okulun seviyesi arttıkça, şehir yapılarını ve '
      + 'savunma ünitelerini daha kısa zamanda yapabilir hale gelir.',
    extra: ['Mimar Okulu kendi inşasını da hızlandırır.'],
  },
  cave: {
    text: 'Mağaralar cüceler tarafından kazılan yapılardır ve gerektiğinde savaşçıları düşman '
      + 'saldırılarından korumak için kullanılır. Mağaralara savaşçıları doldurmak ve boşaltmak '
      + 'için gereken süre, savaşçıların toplam kapladığı alana göre değişmektedir. Mağaralarda '
      + 'yiyecek ve altın depolanamaz. Mağarada bulunan savaşçılar şehir savunmasına katılamazlar.',
    extra: ['Yıkılan mağaranın kendini onarma süresi seviye yükseldikçe kısalır.'],
  },
  temple: {
    text: 'Tapınak, şehirdeki kahramanların yer aldığı yapıdır. Tapınak seviyesi artırıldığında '
      + 'hem savaşlarda kahraman çıkma olasılığı yükselir, hem de savaşta kaybedilen '
      + 'kahramanların dirilme süresi kısalır.',
    /**
     * ⭐ Metinde eksik olan ayrım: iki etki İKİ FARKLI tapınak sayısına bakıyor
     * (`battle.handlers.ts:498-513`) ve bu 28/28 ölçülmüş bir binary sabiti.
     */
    extra: [
      'Kahraman çıkma olasılığı, TÜM şehirlerindeki tapınakların toplam seviyesine bakar; '
      + 'dirilme süresini ise yalnız kahramanın bulunduğu şehrin tapınağı kısaltır.',
    ],
  },
  teleport: {
    text: 'Teleport sayesinde oyuncu bir şehrinden Boyut Geçidi olan başka bir şehrine zaman '
      + 'gerekmeksizin ordularını gönderebilir. Teleport ile kaynak taşıması yapılamaz. '
      + 'Teleport kullanıldıktan sonra tekrar kullanılmak için belirli bir süre gerekir. '
      + 'Teleport seviyesi artırılarak kısaltılabilir.',
    extra: ['Bekleme süresi her seviyede %2 kısalır.'],
  },
};
