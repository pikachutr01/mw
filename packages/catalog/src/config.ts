/**
 * ⭐ KATALOG YAPILANDIRMASI (§admin Faz 5) — ekonomi eğrileri, süre modeli, mağara ve sur
 * sabitleri **çalışma zamanında** değiştirilebilir hâle geliyor.
 *
 * ⚠️ **Formüllerin imzası KIRILMIYOR.** Her formül son parametre olarak isteğe bağlı bir
 * `cfg` alıyor ve verilmezse `DEFAULT_CATALOG_CONFIG` kullanıyor. Yani:
 *   • parametresiz çağıran (testler, motor içi, istemci) **hiç değişmedi** ve sonucu aynı;
 *   • API çağrıları `settings.catalog(worldId)` geçiriyor.
 *
 * ⚠️ Paket **saf** kalıyor: burada DB, zaman, IO yok. Ayarları okuyup buraya nesne olarak
 * getirmek API'nin işi.
 */
/** ⚠️ Tek yönlü: `buildings.ts` yalnız `types.ts` okuyor, döngü yok. */
import { STARTING_RESOURCES } from './buildings.ts';

/** Ekonomi eğrileri ve süre modeli. */
export interface EconomyConfig {
  foodBase: number;
  foodRate: number;
  goldBase: number;
  goldRate: number;
  /** Yapı maliyeti eğrisi: `rate^(seviye−1)`. */
  buildingCostRate: number;
  /** Çiftlik/Maden eğrisi: `seviye × rate^(seviye−1)`. */
  economyCostRate: number;
  /** Teknik maliyeti: `base × rate^(seviye+1)`. */
  techCostRate: number;
  timeDivisorRate: number;
  /** Her hızlandırıcı yapı seviyesi süreyi böler: `rate^seviye`. */
  timeDecayRate: number;
  /**
   * ⚠️ **YALNIZ SAVAŞÇI ve SAVUNMA BİRİMİ** üretim süresinin üssü (`k.java:10`'un kendi 0,8'i).
   * Pahalı birimi saniye başına daha verimli yapar. Yapı/teknik/Sur/Kalkan için
   * `structureTimeExponent` geçerli — ikisi 2026-08-10'da AYRILDI, bkz. oranın yanındaki yorum.
   */
  timeExponent: number;
  /**
   * ⭐ **YAPI · TEKNİK · SUR · BÜYÜ KALKANI süre üssü** (2026-08-10'da eklendi).
   *
   * ⚠️⚠️ **NEDEN AYRI BİR ALAN.** `timeCurve` hem `timeFromCost` (yapısal kalemler) hem
   * `trainingTimeSeconds` (birimler) tarafından çağrılıyordu ve ikisi de `timeExponent` okuyordu.
   * Kullanıcı yapı/teknik sürelerinin üst seviyelerde günlere-haftalara çıkmasını istedi; tek üssü
   * büyütmek **Kaos ve Ejderha üretimini de patlatırdı** — üstelik 0,8 Java'nın kendi savaşçı
   * üssü ve ona sadık kalmak istiyoruz.
   *
   * ⭐ **Üssü büyütmek neden doğru araç:** eğri tam **1000 kaynak** noktasında dönüyor
   * (`1,0^0,80 = 1,0^0,95 = 1,0`). 1000'in altındaki kalemler yeni üsle **daha hızlı**,
   * üstündekiler **daha yavaş** oluyor. Yani erken oyuna hiç dokunmadan yalnız tepe uzuyor —
   * *"erken aşama kıtlıkla geçmesin"* şartının birebir matematiksel karşılığı. `structureTimeFactor`
   * (K) büyütmek yanlış araç olurdu: o her seviyeyi aynı katsayıyla çarpar, erken oyun dâhil.
   *
   * ⚠️ Java'nın kendi yapı üssü **1,0** (süre maliyetle doğru orantılı, `k.java:1400`). 0,95 ona
   * bir yaklaşma; 1,0'a tam çıkmak Kale 20'yi 2.869 güne fırlatıyordu (§13.11.3).
   */
  structureTimeExponent: number;
  /** Savaşçı ve savunma birimi süre katsayısı. */
  unitTimeFactor: number;
  /** Yapı / teknik / Sur / Kalkan süre katsayısı. */
  structureTimeFactor: number;
  /** 1 birim taşıma kapasitesi kaç kaynak sayılır. */
  carryTimeWeight: number;

  /**
   * ⭐ FİYAT ÇARPANLARI (Faz 5) — kataloğun taban fiyatlarını topluca ölçekler.
   *
   * Bu üç çarpan **topluca** ölçekler: "fiyatlar genel olarak yüksek mi" sorusunun düğmesi.
   *
   * ⚠️ **Yapı/teknik BAŞINA düzenleme de artık var** (`buildingTuning` / `techTuning`,
   * 2. nesil Tur 5). Bu yorum bir süre "tek tek düzenleme veri tarayıcısının işi (Faz 7)"
   * diyordu — o vaat gerçekleşmedi, çünkü tarayıcı yalnız DB tablolarını açıyor ve katalog
   * verisi veri tabanında değil derlenmiş TypeScript'te. Doğru yer buydu.
   *
   * ⚠️ İkisi birlikte yaşıyor: varlık başına kayıt YOKSA global çarpan geçerli. Sayı
   * düzeltmesi: katalogda **9** yapı var (Sur ve Kalkan `units.ts`te savunma birimi olarak
   * duruyor), 12 teknik, 21 birim.
   */
  buildingCostMultiplier: number;
  unitCostMultiplier: number;
  techCostMultiplier: number;

  /**
   * ⭐ BAŞLANGIÇ KESESİ — yeni oyuncunun BAŞKENTİNE konan altın/yemek (§13.11.1a).
   *
   * ⚠️ **Yalnız başkent alır**; kurulan koloni sıfırla doğar ve o sayı burada YOK, çünkü
   * `0` bir denge düğmesi değil bir **değişmez**: koloniye kese vermek "şehir kur → keseyi al
   * → terk et" döngüsüyle sınırsız kaynak basmayı açardı (`buildings.ts:51-53`).
   *
   * ⚠️ Buraya 2026-08-01'de taşındı (kullanıcı: *"panelden başlangıç altın ve yemek değeri
   * ayrı ayrı belirlenebilsin"*). Öncesinde `STARTING_RESOURCES` derleme-zamanı sabitti ve
   * `city.service.create()` dünya config'ine hiç bakmıyordu.
   */
  startingGold: number;
  startingFood: number;

  /**
   * ⭐ MİMAR OKULU KENDİNİ HIZLANDIRMASIN (kullanıcı, 2026-08-03).
   *
   * `true` iken Mimar Okulu'nun **kendi** yükseltmesi bölene 0 verir, yani hızlanma
   * uygulanmaz. Diğer bütün yapılar Mimar Okulu'nun mevcut seviyesiyle hızlanmaya devam eder.
   *
   * ⚠️ Bu, 2. nesilde BİLEREK KALDIRILMIŞ bir istisnanın geri gelmesi. O zamanki gerekçe
   * *"bölen 1,4'ten 1,2'ye inince frene gerek kalmadı"* idi; kullanıcı kararı bunun önünde.
   * Ayar olarak duruyor ki geri almak tek tık olsun.
   */
  architectSelfExempt: boolean;

  /* ── Emekli süre modelleri (yalnız denge düğmesi) ─────────────────────────── */
  trainTimeAreaDecay: number;
  originalTrainFactor: number;
  originalDivisorRate: number;
}

/**
 * ⭐ TELEPORT (§13.11.4) — anlık şehirler arası birlik transferi.
 *
 * Sabitler 2026-08-03'e kadar `formulas.ts`te gömülüydü; kullanıcı ikisini de panelden
 * ayarlanabilir istedi. Taban aynı gün **20 → 24 saate** çıkarıldı.
 */
export interface TeleportConfig {
  /** Seviye 1 teleportun yeniden hazır olma süresi (saat). */
  baseHours: number;
  /** Her seviyenin süreyi kısaltma oranı. 0,02 = seviye başına %2 (doküman). */
  levelStep: number;
}

/**
 * ⭐ CASUSLUK (kullanıcı, 2026-08-09 — sistem sadeleştirmesi).
 *
 * ⚠️ Bu yedi sayı 2026-08-09'a kadar `formulas.ts`te `SPY_CONSTANTS` diye gömülüydü ve
 * panelden ayarlanamıyordu. Kullanıcı sertliği seçerken *"biraz daha yumuşatabilmek için
 * admin panelden kritik sabitleri değiştirme imkânı sunulsun"* dedi; katalog config'ine
 * taşımak bunun **tek** yolu (`settings/catalog.ts` grup adına bakıp mekanik eşliyor).
 *
 * ⚠️ Bedeli `catalogHash`in değişmesi. Bilerek ödendi: casusluk sonucu artık dengeye bağlı
 * bir çıktı ve hangi denge sürümüyle üretildiği kaydedilebilmeli.
 */
export interface SpyConfig {
  /**
   * `log2(kuş)` bonusunun tavanı. 8 → 256 kuş; üstü bilgiye HİÇBİR ŞEY katmaz, yalnız ölür.
   * ⭐ *"On binlerce kuş göndermek zorunda olmasınlar"* şartını **yapısal** olarak kapatan sayı.
   */
  birdBonusCap: number;
  /**
   * Kayıp oranının mutlak tavanı (0..1).
   * ⚠️ **1'den KÜÇÜK olması bir tercih değil, bir garantinin dayanağı**: her akından en az bir
   * kuş sağ döner, yani yeterince kuş gönderen **daima** bir şey öğrenir. 1 yapılırsa
   * *"acemi, veteranın kaynak bilgisini alabilsin"* kuralı sessizce ölür.
   */
  lossMax: number;
  /** `S/(S+K)` doygunluğundaki K. KÜÇÜK = sert savunma (kullanıcı «sert» ucu seçti). */
  defenseSaturation: number;
  /** Kayıp eğrisinin denge noktası: `kayıp = P/(1+2^(E − balancePoint))`. 0 = eşitlikte P/2. */
  balancePoint: number;
  /** Okçu Kulesi ağırlığı — adanmış anti-hava yapısı (doküman onu ilk sayıyor). */
  wTower: number;
  /** Savunandaki Casus Kuş ağırlığı — silahsız, kovalar; maliyeti kulenin ~%40'ı. */
  wBird: number;
  /** Elf ağırlığı — savaşçı, anti-hava YAN görevi; bu yüzden bilerek düşük. */
  wElf: number;
}

/**
 * ⭐ VARLIK BAŞINA İNCE AYAR (2. nesil Tur 4) — yapı ve teknik **başına** taban fiyat,
 * büyüme oranı ve süre çarpanı.
 *
 * ⚠️ **Anahtar `<id>:<eksen>` biçiminde ve TEK PARÇA.** Ayar anahtarları (`buildingTuning.
 * castle:gold`) böylece `grup.alan` şeklinde iki parçalı kalıyor. Üç parçalı yapmak
 * (`bases.buildings.castle.gold`) iki yerdeki `key.split('.')` varsayımını kırardı —
 * `settings/catalog.ts` ve `admin.world.controller.ts:439` — ve ikincisi **sessizce**
 * varsayılan gösterirdi.
 *
 * ⚠️ Ayırıcı `:` bilinçli: id'ler snake_case (`architect_school`, `magic_shield`), `_gold`
 * soneki ayrıştırmayı belirsizleştirirdi.
 *
 * ⚠️⚠️ **SEYREKLİK SÖZLEŞMESİ — varsayılan BOŞ.** Dokunulmamış bir varlık için burada kayıt
 * OLMAZ ve formül global orana düşer. Buraya "yardımcı olsun" diye 9 yapının varsayılanını
 * doldurmak, `economy.buildingCostRate`'i **sessizce işlevsizleştirirdi**: global düğme
 * artık hiçbir yapıyı etkilemezdi.
 */
export type TuningAxis = 'gold' | 'food' | 'rate' | 'timeFactor';
export type TuningConfig = Partial<Record<string, number>>;

export interface CaveConfig {
  capacityBase: number;
  breakBase: number;
  breakRate: number;
  blacksmithingRelief: number;
  transferFactor: number;
  transferDecayRate: number;
  minTransferSeconds: number;
  repairBaseSeconds: number;
  repairDecayRate: number;
}

export interface WallConfig {
  repairBaseSeconds: number;
  repairDecayRate: number;
}

export interface CatalogConfig {
  economy: EconomyConfig;
  cave: CaveConfig;
  wall: WallConfig;
  teleport: TeleportConfig;
  spy: SpyConfig;
  /** `castle:gold` · `castle:rate` · `castle:timeFactor` … — bkz. `TuningConfig`. */
  buildingTuning: TuningConfig;
  /** `blacksmithing:gold` · `blacksmithing:rate` … */
  techTuning: TuningConfig;
}

/**
 * ⭐ VARSAYILANLAR — bu nesne kataloğun bugüne kadarki `ECONOMY_CONSTANTS` /
 * `CAVE_CONSTANTS` / `WALL_CONSTANTS` üçlüsüdür; sayılar taşınırken **hiçbiri değişmedi**.
 * Gerekçeleri `formulas.ts`teki yorumlarında duruyor ve orada kalmalı: burası veri, orası
 * o verinin nerede ve neden kullanıldığı.
 */
export const DEFAULT_CATALOG_CONFIG: CatalogConfig = {
  economy: {
    foodBase: 6,
    foodRate: 1.16,
    goldBase: 5,
    goldRate: 1.15,
    buildingCostRate: 1.8,
    /**
     * ⭐ **1,45 — `k.java:14`'ün kendi sabiti** (`a.a("1.45")`). 2026-08-10'da geri alındı.
     *
     * ⚠️ Bir süre **1,33** yazıyordu ve gerekçesi *"seviye 40 ulaşılabilir kalmalı"* idi
     * (2026-07-28). Kullanıcı bu turda amorti kuralını **açıkça terk etti**: *"illa da saatlik
     * üretimlerine göre … amorti etme zorunluluğu şeklinde bakmayalım."* Yerine geçen gerekçe:
     * **puan = harcanan kaynak / 1000** — kâr eşiğinin (≈sv24-26) ötesindeki seviyeler geliri
     * değil PUANI satın alıyor, yani ölü içerik değil geç oyunun asıl kaynak gideri. Orijinalin
     * üretim tablosu 1-40 arası VE maliyet oranı 1,45 olduğuna göre orijinalde de böyleydi.
     *
     * ⚠️⚠️ **Temponun asıl belirleyicisi bu tek sayı.** Ölçtüm: bina tabanlarını 6 katına çıkarıp
     * bunu 1,33'te bırakınca tek şehirli oyuncu yine **bir yılda her şeyi 20** yapıyordu.
     */
    economyCostRate: 1.45,
    techCostRate: 1.5,
    timeDivisorRate: 1.4,
    timeDecayRate: 1.2,
    timeExponent: 0.8,
    structureTimeExponent: 0.95,
    unitTimeFactor: 190,
    structureTimeFactor: 400,
    carryTimeWeight: 1,
    buildingCostMultiplier: 1,
    unitCostMultiplier: 1,
    techCostMultiplier: 1,
    // ⚠️ `STARTING_RESOURCES` ile AYNI sayılar — o sabit hâlâ tek gerçek kaynak (`buildings.ts`).
    startingGold: STARTING_RESOURCES.gold,
    startingFood: STARTING_RESOURCES.food,
    architectSelfExempt: true,
    trainTimeAreaDecay: 0.95,
    originalTrainFactor: 65,
    originalDivisorRate: 1.4,
  },
  // ⚠️ Taban 20 değil **24** saat (kullanıcı, 2026-08-03). Doküman süreyi vermiyor; 20 kurguydu.
  teleport: {
    baseHours: 24,
    levelStep: 0.02,
  },
  /**
   * ⚠️ Sertlik kullanıcının seçimi (2026-08-09): `defenseSaturation: 40` «sert» uç.
   * 100 kule + 300 kuş savunması → kayıp tavanı %82; etkin fark −2'de 64 kuşun 42'si ölür.
   * Yumuşatmak isteyen K'yi büyütür (150 → tavan %59).
   */
  spy: {
    birdBonusCap: 8,
    lossMax: 0.95,
    defenseSaturation: 40,
    balancePoint: 0,
    wTower: 1,
    wBird: 0.5,
    wElf: 0.25,
  },
  cave: {
    capacityBase: 50,
    breakBase: 100,
    breakRate: 1.5,
    blacksmithingRelief: 0.05,
    transferFactor: 25,
    transferDecayRate: 1.1,
    minTransferSeconds: 5,
    repairBaseSeconds: 20 * 3600,
    repairDecayRate: 0.9,
  },
  wall: {
    repairBaseSeconds: 12 * 3600,
    repairDecayRate: 0.92,
  },
  /**
   * ⚠️⚠️ **NEREDEYSE BOŞ KALMALI.** Dolu bir varsayılan, global fiyat/oran düğmelerini sessizce
   * işlevsizleştirir (bkz. `TuningConfig` yorumundaki seyreklik sözleşmesi). Buraya bir kayıt
   * girmesi için o kalemin **kuralı** diğerlerinden farklı olmalı — "yardımcı olsun" diye değil.
   *
   * ⭐⭐ **TEK KAYIT: Mimar Okulu'nun süre çarpanı — Java'nın `×10`'u** (2026-08-10).
   *
   * `k.java:1396-1403` yapı süresini iki dalda hesaplıyor ve fark **iki yerde**:
   * ```java
   * if (var11 == 67) {                                 // MİMAR OKULU'NUN KENDİSİ
   *    var9 = (altın + yemek) / 1.2^KENDİ_SEVİYESİ;    // ← ×10 YOK
   * } else {
   *    var9 = 10 * (altın + yemek) / 1.4^MimarOkulu;   // ← DİĞER HER YAPI
   * }
   * ```
   * Yani orijinalde Mimar Okulu `×10` çarpanını hiç almıyor (10 kat hızlı) ama karşılığında
   * kendi bölenini diğerlerinden **zayıf** bir tabanla (1,2 ↔ 1,4) alıyor.
   *
   * ⚠️ **Ham terimleri kopyalamak yanlış olurdu**, çünkü biz diğer yapılar için 1,4 değil 1,2
   * kullanıyoruz (bilinçli, `formulas.ts:300-302`). Java'nın ham kuralını taşırsak Mimar Okulu 20
   * **22 saate** düşer ve oyunun en ucuz yükseltmesi olur. Taşınması gereken şey **oran**:
   * ```
   * Java'da  MO / eşdeğer-maliyetli-diğer-yapı  =  (1/10) × (1,4/1,2)^L
   * Bizde    (architectSelfExempt + timeFactor) =  0,10   × 1,2^L
   *   L=1  → Java 0,117  ·  bizde 0,120        (Mimar Okulu 1 dk 17 sn)
   *   L=10 → Java 0,467  ·  bizde 0,619        (3 sa 16 dk)
   *   L=15 → Java 1,010  ·  bizde 1,541        ← DÖNÜM: artık diğerlerinden yavaş
   *   L=20 → Java 2,182  ·  bizde 3,834        (36 gün)
   * ```
   * ⭐ **`0.1` bir eğri uydurması değil, Java'nın kendi `×10`'u.** Ve şunu gösteriyor:
   * kullanıcının 2026-08-03'teki *"Mimar Okulu kendini hızlandırmasın"* kararı, farkında olmadan
   * Java'nın ŞEKLİNİ yeniden kurmuş (erken hızlı → ~sv13-15'te dönüm → sonra en yavaş); eksik
   * olan tek parça `×10`'du. Bu çarpan olmadan yeni tabanlarla Mimar Okulu 20 **362 güne** çıkıyor.
   */
  buildingTuning: { 'architect_school:timeFactor': 0.1 },
  techTuning: {},
};

export type DeepPartialCatalog = {
  [K in keyof CatalogConfig]?: Partial<CatalogConfig[K]>;
};

/**
 * Kısmi override'ı varsayılanın üstüne bindirir.
 *
 * ⚠️ Override YOKSA varsayılan nesnenin **kendisi** döner (kopyası değil). Faz 4'teki
 * `mergeCombatConfig` ile aynı sözleşme ve aynı gerekçe: "yeniden kurulmuş varsayılan" ile
 * "varsayılanın kendisi" arasında sessiz bir kayma doğmasın.
 */
export function mergeCatalogConfig(overrides?: DeepPartialCatalog): CatalogConfig {
  if (!overrides) return DEFAULT_CATALOG_CONFIG;
  return {
    economy: { ...DEFAULT_CATALOG_CONFIG.economy, ...overrides.economy },
    cave: { ...DEFAULT_CATALOG_CONFIG.cave, ...overrides.cave },
    wall: { ...DEFAULT_CATALOG_CONFIG.wall, ...overrides.wall },
    teleport: { ...DEFAULT_CATALOG_CONFIG.teleport, ...overrides.teleport },
    spy: { ...DEFAULT_CATALOG_CONFIG.spy, ...overrides.spy },
    // ⚠️ Seyreklik korunuyor: override yoksa boş nesne kalır (bkz. `TuningConfig` yorumu).
    buildingTuning: { ...DEFAULT_CATALOG_CONFIG.buildingTuning, ...overrides.buildingTuning },
    techTuning: { ...DEFAULT_CATALOG_CONFIG.techTuning, ...overrides.techTuning },
  };
}
