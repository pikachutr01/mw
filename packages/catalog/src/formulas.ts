/**
 * §13.8 + §13.9 — DOĞRULANMIŞ EKONOMİ FORMÜLLERİ.
 * Tablo tutmuyoruz: üç tablonun da kapalı formu bulundu ve birebir doğrulandı
 * (Çiftlik 40/40 · Maden 40/40 · Kahraman XP 80/80 · Mağara cüce 119/120).
 */
import { BUILDINGS_BY_ID, STARTING_BUILDINGS } from './buildings.ts';
import { DEFAULT_CATALOG_CONFIG, type CatalogConfig } from './config.ts';
import { TECHS_BY_ID } from './techs.ts';
import { UNITS_BY_ID } from './units.ts';

/** Sabitler `k.java:10-15`'ten. */
/**
 * ⭐ VARSAYILAN SABİTLER — artık `config.ts`ten TÜRETİLİYOR (§admin Faz 5).
 *
 * ⚠️ Sayılar oraya taşındı ama **hiçbiri değişmedi**; buradaki üç dışa aktarım geriye dönük
 * uyum için duruyor (testler ve istemci bunları okuyor). Çalışma zamanında geçersiz kılınmış
 * değeri isteyen, formüle `cfg` geçirmeli — bu üçü daima VARSAYILANI gösterir.
 *
 * Sayıların gerekçeleri (neden 1,33, neden 20 saat…) kullanıldıkları formülün başında;
 * veri ile o verinin anlamı ayrı yerlerde durmasın diye oraya bırakıldı.
 */
export const ECONOMY_CONSTANTS = DEFAULT_CATALOG_CONFIG.economy;
export const CAVE_CONSTANTS = DEFAULT_CATALOG_CONFIG.cave;
export const WALL_CONSTANTS = DEFAULT_CATALOG_CONFIG.wall;

export interface Cost {
  gold: number;
  food: number;
}

/** Çiftlik üretimi (yemek/saat) — 40/40 seviyede birebir doğrulandı. */
export function farmOutput(level: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): number {
  if (level <= 0) return 0;
  return Math.floor(cfg.economy.foodBase * level * cfg.economy.foodRate ** level);
}

/** Maden üretimi (altın/saat) — 40/40 seviyede birebir doğrulandı. */
export function mineOutput(level: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): number {
  if (level <= 0) return 0;
  return Math.floor(cfg.economy.goldBase * level * cfg.economy.goldRate ** level);
}

/** Kahraman seviye atlama tecrübesi — XP(1)=500, XP(L)=round(XP(L−1) × (1 + 1/√(L−1))). 80/80 doğru. */
export function heroXpForLevel(level: number): number {
  if (level <= 1) return 500;
  let xp = 500;
  for (let l = 2; l <= level; l++) xp = Math.round(xp * (1 + 1 / Math.sqrt(l - 1)));
  return xp;
}

/* ═══ MAĞARA (§13.20) ═══════════════════════════════════════════════════════
 * İki sayı **ölçülmüş veridir** (kapasite tablosu + `images/cuce-magara.png`), iki sayı
 * **bizim kurgumuzdur** (doldurma/boşaltma ve tamir süresi). Ayrımı korumak önemli: ölçülene
 * dokunulmaz, kurgulanan denge düğmesidir.
 */

/**
 * ⭐ ÖLÇÜLMÜŞ: mağarayı yıkmak için gereken cüce sayısı.
 * `cuce-magara.png` tablosunun **119/120 hücresi** bu formülle birebir tutuyor.
 *
 * Demircilik etkisi **toplamsal paydadır** (`1 + 0,05·d`), üssel DEĞİL — ayrım büyük:
 * Demircilik 30'da üssel model 0,95³⁰ = 0,21 verirken gerçek tablo 1/2,5 = 0,40 diyor.
 *
 * ⚠️ Tek uyuşmayan hücre (Demircilik 4 · Mağara 22 → tabloda 415.667, formül 415.657) tablonun
 * KENDİ içinde de tutarsız: komşularıyla ×1,5 zinciri kurulmuyor. Basım hatası kabul edildi.
 */
export function dwarvesToBreakCave(caveLevel: number, blacksmithing: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): number {
  if (caveLevel <= 0) return Infinity;          // yapılmamış mağara yıkılamaz
  return Math.round(
    (cfg.cave.breakBase * cfg.cave.breakRate ** (caveLevel - 1))
    / (1 + cfg.cave.blacksmithingRelief * Math.max(0, blacksmithing)),
  );
}

/** ⭐ ÖLÇÜLMÜŞ: mağara kapasitesi (ALAN cinsinden) — 50 × 2^(sv−1), 20/20 doğrulandı. */
export function caveCapacity(caveLevel: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): number {
  if (caveLevel <= 0) return 0;
  return cfg.cave.capacityBase * 2 ** (caveLevel - 1);
}

/** Birim adetlerinin toplam ALANI — mağara kapasitesi bu birimde ölçülür. */
export function unitsArea(counts: Record<string, number>): number {
  let total = 0;
  for (const [id, n] of Object.entries(counts)) {
    if (!(n > 0)) continue;
    total += (UNITS_BY_ID[id]?.area ?? 0) * Math.trunc(n);
  }
  return total;
}

/**
 * ⭐ ÖLÇÜLMÜŞ: bir kahramanın kapladığı ALAN = **5**.
 *
 * Kaynak `docs/referans/teknik_ve_yapi_dokumantasyonu.md:209` — kahramanın özellik künyesi
 * *"Hız: 200 · Kapasite: 0 · Alan: 5"*. Yani kahraman diğer savaşçılar gibi bir alan değerine
 * sahip; katalogdaki `UNITS` tablosunda yok çünkü kahraman ADET değil VARLIK (`heroes` tablosu),
 * ama alanı ölçülmüş bir sabittir ve **uydurulmamalıdır**.
 *
 * ⚠️ Ne kadar küçük olduğuna dikkat: Cüce 9, Elf 12 — kahraman ikisinden de az yer kaplar.
 * Sonucu, mağaraya kahraman saklamanın kapasite maliyetinin **simgesel** olması (1. seviye
 * mağaranın 50 alanının onda biri) ve tek başına bir kahramanı sokmanın 1. seviyede
 * `25×√5 ≈ 56 sn`, 10. seviyede 24 sn sürmesi. Yani kahraman saklamak **refleksle**
 * yapılabilir: savunan gelen saldırıyı varış saatiyle görüyor (§13.5.7).
 * ⭐ Bu bilinçli kabul edildi (kullanıcı, 2026-08-11): ölçülmüş sayı kurgunun önünde gelir.
 * Denge sorun çıkarırsa kaldıraç `cave.transferFactor`tır, bu sabit değil.
 */
export const HERO_AREA = 5;

/**
 * Mağaranın DOLU alanı: savaşçılar + saklanan kahramanlar.
 *
 * ⚠️ Kahramanı unutmak sessiz bir hataydı: `unitsArea` yalnız `cave_units`'i görüyor, oysa
 * kahraman `heroes.status='in_cave'` ile saklanıyor (ayrı tablo YOK). Kapasite denetimi,
 * süre hesabı ve mağara yıkılınca kaçış — üçü de bu fonksiyondan geçmeli.
 */
export function caveArea(counts: Record<string, number>, heroCount = 0): number {
  return unitsArea(counts) + HERO_AREA * Math.max(0, Math.trunc(heroCount));
}

/**
 * ⭐ KURGU: mağarayı doldurma / boşaltma süresi.
 *
 * Doküman iki şey söylüyor: *"gereken süre, savaşçıların toplam kapladığı alana göre değişir"*
 * ve *"mağara seviyesini her arttırdığında doldurma boşaltma %10 azalır"*. Şeklin kalanı bize
 * kaldı; kullanıcının koyduğu şart: **tek seferde büyük alanı sokmak, aynı alanı parça parça
 * sokmaktan avantajlı olsun.**
 *
 * `süre = K × √alan / 1,1^(sv−1)`
 *
 * • **Karekök** o şartın ta kendisi: alan başına süre `K / √alan` ile azalıyor. Seviye 1'de
 *   tek Cüce (9 alan) 25 sn ≈ 2,8 sn/alan; mağarayı dolduran 50 alan 177 sn ≈ 3,5 sn/alan…
 *   ölçek büyüdükçe fark açılıyor: 25.600 alan 1.696 sn ≈ 0,066 sn/alan.
 * • Üs neden 0,8 değil (üretim süresiyle aynı olsun diye)? Kapasite seviye başına **2 katına**
 *   çıkıyor, süre yalnız %10 azalıyor. 0,8 üssüyle dolu mağarayı doldurmak seviye 20'de
 *   **233 saat** sürüyordu; √ ile 5 sa 49 dk. Karekök bu iki üssel arasındaki tek makul denge.
 * • Dünya hız çarpanı: doldur/boşalt şehir içi iş → çarpansız. TEK istisna mağara yıkılınca
 *   şehre KAÇIŞ dönüşü — o bir sefer sayılır, `speed_multiplier` ÇAĞIRAN tarafta uygulanır
 *   (kullanıcı kararı 2026-07-30; formül saf kalır).
 */
export function caveTransferSeconds(area: number, caveLevel: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): number {
  if (area <= 0) return 0;
  const level = Math.max(1, caveLevel);
  const raw = (cfg.cave.transferFactor * Math.sqrt(area))
    / cfg.cave.transferDecayRate ** (level - 1);
  return Math.max(cfg.cave.minTransferSeconds, Math.round(raw));
}

/**
 * ⭐ KURGU: yıkılan mağaranın kendini onarma süresi.
 *
 * Doküman *"24 saat sürer, bu süre kısalmaz"* diyor; **kullanıcı bunu bilerek değiştirdi**
 * (2026-07-28): taban biraz daha uzun (26 sa) ama her seviye %10 kısaltıyor. Gerekçe: mağarayı
 * yükseltmek yalnız kapasite değil **dayanıklılık** da almalı, yoksa yüksek seviye mağara
 * yıkıldığında oyuncu sabit 24 saat boyunca en değerli ordusunu saklayamaz hâle geliyordu.
 */
/**
 * ⭐ SUR ONARIMI (§13.21.2) — savaştan sonra kendini onarır.
 *
 * Doküman: *"Savaşlarda yıkılan sur savaş sonrasında belirli bir süre içinde yeniden onarılır."*
 * Süreyi söylemiyor; kullanıcı kurguladı (2026-07-29): **hem alınan hasara hem seviyeye** bağlı.
 *
 * `süre = 12 saat × hasarOranı × 0,92^(sv−1)`
 *
 * • **Hasarla orantılı**, çünkü %20'ye düşmüş bir sur %70'te kalandan çok daha uzun sürmeli
 *   (kullanıcının verdiği örnek).
 * • **Seviye kısaltır** — dokümanda böyle bir bilgi yok, bilerek eklendi: Sur'u yükseltmek yalnız
 *   dayanıklılık değil **toparlanma hızı** da kazandırmalı, yoksa yüksek seviye sur her savaştan
 *   sonra daha uzun süre işlevsiz kalırdı (aynı gerekçeyle mağara onarımı da seviyeyle kısalıyor).
 *
 * @param integrity savaş sonrası kalan bütünlük, 0-1 arası
 */
export function wallRepairSeconds(wallLevel: number, integrity: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): number {
  const damage = Math.min(1, Math.max(0, 1 - integrity));
  if (damage <= 0 || wallLevel <= 0) return 0;
  return Math.max(
    60,
    Math.round(
      cfg.wall.repairBaseSeconds * damage
      * cfg.wall.repairDecayRate ** (Math.max(1, wallLevel) - 1),
    ),
  );
}

export function caveRepairSeconds(caveLevel: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): number {
  const level = Math.max(1, caveLevel);
  return Math.round(
    cfg.cave.repairBaseSeconds * cfg.cave.repairDecayRate ** (level - 1),
  );
}

/** Savunma kapasitesi = 25.000 × 1,30^(Sur−1) — her savunma birimi `area` kadar tüketir (§13.11.1b). */
export function defenseCapacity(wallLevel: number): number {
  if (wallLevel <= 0) return 0;
  return Math.round(25_000 * 1.3 ** (wallLevel - 1));
}

/** Kale bütçesi: Σ(bina seviyeleri) ≤ Kale × 10 (§13.11.1). */
export function castleBudget(castleLevel: number): number {
  return Math.max(0, castleLevel) * 10;
}

/** Maliyet eğrisinin ham değeri (ölçeksiz). */
/**
 * ⭐ VARLIK BAŞINA ORAN (2. nesil Tur 4) — yoksa global orana düşer.
 *
 * ⚠️ **Global düğme ÖLMÜYOR.** Yönetici `economy.buildingCostRate`'i 1,8'den 2,2'ye çıkarır
 * ve hiçbir yapıya tek tek dokunmazsa, hepsi 2,2 kullanır. Varsayılanları buraya doldursaydık
 * her yapının kendi kaydı olurdu ve global düğme sessizce işlevsizleşirdi (bkz. `config.ts`
 * seyreklik sözleşmesi).
 *
 * ⚠️ `economyCostCurve` bayrağı eğrinin **ŞEKLİNİ** belirler (`seviye ×` çarpanı var mı),
 * buradaki oran ise üssün **TABANINI**. İkisi dik eksenler, çakışmıyorlar.
 */
function buildingRate(buildingId: string, cfg: CatalogConfig): number {
  const per = cfg.buildingTuning[`${buildingId}:rate`];
  if (per != null) return per;
  return BUILDINGS_BY_ID[buildingId]?.economyCostCurve
    ? cfg.economy.economyCostRate
    : cfg.economy.buildingCostRate;
}

function costCurve(buildingId: string, level: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): number {
  const r = buildingRate(buildingId, cfg);
  return BUILDINGS_BY_ID[buildingId]?.economyCostCurve
    ? level * r ** (level - 1)
    : r ** (level - 1);
}

/**
 * `level` seviyesine ULAŞMANIN maliyeti (kümülatif değil).
 *
 * ⭐ **`baseGold`/`baseFood` = oyuncunun ÖDEDİĞİ İLK yükseltmenin fiyatı** (kullanıcı, 2026-07-28).
 * Kale · **Baraka** · Çiftlik · Maden oyuna **seviye 1** başlıyor (`STARTING_BUILDINGS`), yani
 * onlarda ilk ödenen seviye **2**'dir ve taban oraya oturur. Diğer yapılarda ilk ödenen seviye 1,
 * hiçbir şey değişmez.
 *
 * ⚠️ **Baraka iki kez yer değiştirdi.** 2026-08-09'da listeden çıktı (baraka 0 başlasın),
 * 2026-08-12'de geri kondu. Fiyat etkisi otomatik: baraka listedeyken sv2 = **700/500**,
 * listede değilken sv1 = 700/500 ve sv2 = 1.260/900 oluyordu. Tek bir sayı bile elle
 * düzeltilmedi — `firstPaid` bunu zaten türetiyor.
 *
 * Bu yorum olmadan taban görünmeyen bir seviyenin fiyatıydı: kullanıcı "Çiftlik 3 altın 4 yemek"
 * dediğinde ekranda **9/12** çıkıyordu (çünkü 3/4 seviye 1'in fiyatıydı, oyuncu ise 1→2'yi görür).
 */
export function buildingCost(buildingId: string, level: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): Cost {
  const def = BUILDINGS_BY_ID[buildingId];
  if (!def) throw new Error(`Bilinmeyen yapı: ${buildingId}`);
  if (level <= 0) return { gold: 0, food: 0 };
  const firstPaid = (STARTING_BUILDINGS[buildingId] ?? 0) + 1;
  const k = costCurve(buildingId, level, cfg) / costCurve(buildingId, firstPaid, cfg);
  // ⭐ Fiyat çarpanı EN SONDA ve yuvarlamadan ÖNCE: eğri bozulmasın, yalnız ölçek kaysın.
  const m = cfg.economy.buildingCostMultiplier;
  // ⭐ Varlık başına taban fiyat; yoksa katalogdaki taban.
  const gold = cfg.buildingTuning[`${buildingId}:gold`] ?? def.baseGold;
  const food = cfg.buildingTuning[`${buildingId}:food`] ?? def.baseFood;
  return { gold: Math.round(gold * k * m), food: Math.round(food * k * m) };
}

/**
 * Teknik maliyeti: `taban × 1,5^(seviye+1) × techCostMultiplier`.
 *
 * ⭐⭐ **ÜSTEKİ `+1` JAVA'DAN GELİYOR — bizim eklediğimiz bir kaydırma DEĞİL** (2026-08-14'te
 * `k.java` üzerinden doğrulandı, soru ikinci kez sorulmasın diye buraya yazılıyor):
 *
 * ```java
 * // k.java:1416-1418, teknik dalı (a[161] = "T")
 * long var19 = a.e(this.d, a.b(var2.a[1] + 1L));   // d ^ (seviye + 1)
 * this.j *= var19;                                  // altın
 * this.k *= var19;                                  // yemek
 * ```
 * `this.d = a.a("1.5")` (`k.java:13`). Yani hem **oran** (1,5 — seviye başına %50 artış) hem
 * **kaydırma** (`+1`) orijinalin kendisi.
 *
 * ⚠️ Pratik sonucu: `techs.ts`teki taban, oyuncunun ÖDEDİĞİ bir fiyat değil — seviye 1 zaten
 * tabanın `1,5² = 2,25` katı. Yapılarda bu böyle değil: orada `firstPaid` normalizasyonu var
 * ve taban, oyuncunun ödediği ilk yükseltmenin fiyatı (`buildingCost`). **İki tarafın farklı
 * davranması bilinçli**: bina normalizasyonu bizim rebuild kararımız (kullanıcı 2026-07-28,
 * *"Çiftlik 3 altın dediğimde ekranda 9 çıkıyor"*), teknik tarafında ise Java'nın kendi
 * eğrisine dokunulmadı. Ölçek gerektiğinde `economy.techCostMultiplier` ile kaydırılıyor —
 * eğrinin şekli sabit kalsın diye (2026-08-14: 1 → 0,75).
 */
export function techCost(techId: string, level: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): Cost {
  const def = TECHS_BY_ID[techId];
  if (!def) throw new Error(`Bilinmeyen teknik: ${techId}`);
  const rate = cfg.techTuning[`${techId}:rate`] ?? cfg.economy.techCostRate;
  const k = rate ** (level + 1) * cfg.economy.techCostMultiplier;
  const gold = cfg.techTuning[`${techId}:gold`] ?? def.baseGold;
  const food = cfg.techTuning[`${techId}:food`] ?? def.baseFood;
  return { gold: Math.round(gold * k), food: Math.round(food * k) };
}

/**
 * ⭐ SUR ve BÜYÜ KALKANI — seviye taşıyan savunma yapıları.
 *
 * ⚠️ **NEDEN AYRI BİR FONKSİYON (2. nesil Tur 4).** Bu hesap kataloğun dışında, **üç ayrı
 * dosyada kopya** hâlinde duruyordu ve üçü de çıplak `1.8` literali kullanıyordu:
 *   • `queue.service.ts`   — oyuncunun ödediği fiyat
 *   • `city.controller.ts` — arayüzde gösterilen fiyat
 *   • `score.service.ts`   — puan hesabı
 * Sonuç: yönetici `economy.buildingCostRate`'i 1,8'den 2,2'ye çıkarsa **Sur ve Kalkan hariç**
 * her şey değişiyordu; `buildingCostMultiplier`'ı iki katına çıkarsa Sur fiyatı hiç
 * kıpırdamıyordu. Yani panelde bir düğme vardı ve oyunun bir köşesine hiç ulaşmıyordu.
 *
 * ⚠️ Bu ikisi `buildings.ts`te DEĞİL, `units.ts`te duruyor (savunma birimi olarak) — bu yüzden
 * `buildingCost` onları tanımıyor ve ayrı bir giriş noktası gerekiyor.
 *
 * ⚠️ Varsayılan ayarlarla çıktı **bit-bit aynı**: `Math.round(g × 1,8^(l−1) × 1)` ≡ eski
 * `Math.round(g × 1,8^(l−1))`. `golden-prices.test.ts` bunu her seviyede kilitliyor.
 */
export const DEFENSE_STRUCTURES: readonly string[] = ['wall', 'magic_shield'];

export function defenseStructureCost(
  id: string, level: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG,
): Cost {
  const def = UNITS_BY_ID[id];
  if (!def) throw new Error(`Bilinmeyen savunma yapısı: ${id}`);
  if (level <= 0) return { gold: 0, food: 0 };
  const k = cfg.economy.buildingCostRate ** (level - 1) * cfg.economy.buildingCostMultiplier;
  /**
   * ⭐⭐ TABAN ARTIK PANELDEN EZİLEBİLİR (kullanıcı, 2026-08-15 — GERÇEK BOŞLUKTU).
   *
   * ⚠️ Bu iki yapı, oyunda fiyatı olan **tek** varlıklardı ki 355 ayarın hiçbiri onlara
   * ulaşmıyordu. Üstelik sessizce değil: `unitTuning`in panel açıklaması operatörü
   * *"Sur ve Büyü Kalkanı burada değil, «Yapı fiyatları»na bak"* diye yönlendiriyordu ve
   * orada da yoklardı. Yani panel, var olmayan bir kontrole işaret ediyordu.
   *
   * ⚠️ Kaynağı `buildingTuning` (birim değil): `unitTuning`den dışlanmaları DOĞRUYDU —
   * fiyatları `unitCost`tan değil buradan geliyor, oraya konsalar etkisiz kutu olurlardı
   * (`derived.ts`in kendi gerekçesi). Eksik olan, `defenseStructureCost`a ULAŞAN bir gruba
   * konmamış olmalarıydı.
   *
   * ⚠️ `rate` ekseni BİLEREK verilmedi. `1,8` Java'nın kendi sabiti (`k.java:10-15`,
   * *«SUR ve BÜYÜ KALKANI istisna: taban × 1.8^seviye»*) ve Sur'un savaş gücü de `1,8^sv`
   * ile büyüyor — yani kaynak/güç oranı seviyeden bağımsız SABİT. Oranı tek başına oynatmak
   * o dengeyi seviyeye bağımlı hâle getirir; tek güvenli kaldıraç taban fiyattır (bu ayrımın
   * ölçümü `units.ts`teki fiyat notunda).
   */
  const gold = cfg.buildingTuning[`${id}:gold`] ?? def.gold;
  const food = cfg.buildingTuning[`${id}:food`] ?? def.food;
  return { gold: Math.round(gold * k), food: Math.round(food * k) };
}

/** Sur/Kalkan yükseltme süresi. Hızlandıran yapıların hepsinde olduğu gibi **Mimar Okulu**. */
export function defenseStructureTimeSeconds(
  id: string, level: number, architectSchool: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG,
): number {
  return timeFromCost(defenseStructureCost(id, level, cfg), architectSchool, cfg);
}

/**
 * Birim taban fiyatı — **panelden birim başına ezilebilir** (`unitTuning.<id>:gold|food`).
 *
 * ⚠️ Tek yerde: `unitCost` ve `unitTimeValue` ikisi de buradan okuyor. Ayrı ayrı okusalardı
 * biri güncellenip diğeri unutulur ve *"fiyatı değiştirdim ama süre değişmedi"* hatası doğardı.
 */
function unitBase(unitId: string, cfg: CatalogConfig): { gold: number; food: number; carry: number } {
  const def = UNITS_BY_ID[unitId];
  if (!def) throw new Error(`Bilinmeyen birim: ${unitId}`);
  return {
    gold: cfg.unitTuning[`${unitId}:gold`] ?? def.gold,
    food: cfg.unitTuning[`${unitId}:food`] ?? def.food,
    carry: def.carry,
  };
}

/** Birim maliyeti sabittir (adet başına). */
export function unitCost(unitId: string, count = 1, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): Cost {
  const base = unitBase(unitId, cfg);
  /**
   * ⚠️ Yuvarlama ADET ile çarpımdan SONRA: birim başına yuvarlasaydık 100 birimlik sipariş
   * ile 100 kez 1 birimlik sipariş farklı tutar öderdi ve oyuncu ucuz olanı bulurdu.
   */
  const m = cfg.economy.unitCostMultiplier;
  return { gold: Math.round(base.gold * count * m), food: Math.round(base.food * count * m) };
}

/**
 * ⭐ ORTAK SÜRE ÇEKİRDEĞİ (§13.11.3): `K × (değer/1000)^0,8 / 1,2^(hızlandıran yapı seviyesi)`.
 *
 * Dört kategori de (savaşçı · savunma · yapı · teknik) **aynı eğriyi** kullanır; yalnız `K` ve
 * hızlandıran yapı değişir. Tek çekirdek olmasının sebebi acı deneyim: dört yerde ayrı yazılsaydı
 * biri güncellenip diğerleri unutulurdu.
 *
 * **Birim üssü neden 0,8?** `k.java`'nın kendi üssü — ve doğru şekli veriyor: süre maliyetin
 * altında kalan bir hızla büyür, böylece elit birim saniye başına daha çok güç üretir (Ejderha,
 * Cüce'nin 100 katı maliyete karşı 39 katı süre = güç/saniye'de 2,1 kat avantaj). Bu avantajın
 * bedeli yüksek ön-şartlar. Üs 1,0 olsaydı birim seçimi yalnız maliyet verimliliğine inerdi.
 *
 * ⚠️⚠️ **ÜS TEK DEĞİL, İKİ TANE** (2026-08-10): birimler `timeExponent` (0,8 — Java'nın kendi
 * savaşçı üssü), yapısal kalemler `structureTimeExponent` (0,95) kullanıyor. Ayrım şart oldu
 * çünkü kullanıcı yapı/teknik sürelerinin üst seviyelerde günlere-haftalara çıkmasını istedi ve
 * tek üssü büyütmek Kaos/Ejderha üretimini de patlatırdı. Gerekçenin tamamı `config.ts`te
 * `structureTimeExponent` alanının yanında. **Yeni bir çağıran eklerken hangi üssü geçirdiğine
 * DİKKAT ET** — yanlış olan sessizce çalışır ve dengeyi bozar.
 *
 * **Bölen neden 1,2 (orijinaldeki 1,4 değil)?** 1,4 yirmi seviyede **836 kat** demek; Baraka tek
 * başına oyunun kaderini belirler ve seviye 1'deki oyuncu hiçbir şey üretemez. 1,2 ile yirmi
 * seviye **32 kat** kazandırır — hissedilir ama tek eksenli değil.
 *
 * ⚠️⚠️ **BÖLEN DE TEK DEĞİL, İKİ TANE** (2026-08-12) — üsse yapılanın aynısı bölene de yapıldı:
 * birimler `timeDecayRate`, yapısal kalemler `structureTimeDecayRate`. Ortakken oranı büyütmek
 * askerleri hızlandırırken **bütün inşaatı da** hızlandırıyordu (1,2→1,4: Mimar Okulu 20'nin
 * kazancı 38 kattan 837 kata). ⭐ Bu yüzden `decay` artık `cfg`den okunmuyor, **çağıran açıkça
 * geçiriyor**: yeni bir çağıran eklendiğinde derleyici sormaya zorluyor — yukarıdaki üs
 * uyarısının ("yanlış olan sessizce çalışır") tekrarlanmaması için.
 */
function timeCurve(
  value: number, factor: number, level: number, exponent: number, decay: number,
): number {
  return (
    (factor * (Math.max(0, value) / 1000) ** exponent)
    / Math.max(1, decay) ** Math.max(0, level)
  );
}

/** Maliyeti olan her YAPISAL kalemin süresi (yapı · teknik · Sur · Büyü Kalkanı). */
export function timeFromCost(cost: Cost, divisorLevel: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): number {
  return timeCurve(
    cost.gold + cost.food, cfg.economy.structureTimeFactor, divisorLevel,
    cfg.economy.structureTimeExponent, cfg.economy.structureTimeDecayRate,
  );
}

/**
 * ⭐ DÜNYA HIZ ÇARPANININ SÜREYE UYGULANMASI — kuyruk, ekran ve denge tezgâhı için **tek kaynak**.
 *
 * `max(1, sn / max(1, çarpan))`. İki kelepçe de yükü taşıyor: alttaki 1 sn, çarpan ne olursa olsun
 * anlık bitişi engeller; bölendeki `max(1, …)` ise 0/negatif çarpanın süreyi sonsuza ya da eksiye
 * götürmesini engeller.
 *
 * ⚠️ **Yuvarlama YOK ve bu şart**: kuyruk birim-başına süreleri kesirli saklıyor (tembel
 * materyalizasyon `done = elapsed / per_unit_seconds` hesabı yuvarlamayla kayardı). Yuvarlamaya
 * ihtiyacı olan yalnız EKRAN — o, sonucu kendisi yuvarlar.
 *
 * ⚠️ Bu formül 2026-08-14'e kadar `queue.service.ts` ve `city.controller.ts`te **iki ayrı kopya**
 * olarak duruyordu; ikisinin eşitliğini bir test kilitliyordu ama kopya olmaları, üçüncü bir
 * tüketici (denge tezgâhı) geldiğinde üçüncü kopyayı davet ediyordu.
 */
export function scaledSeconds(seconds: number, multiplier: number): number {
  return Math.max(1, seconds / Math.max(1, Number(multiplier ?? 1)));
}

/**
 * Yapı inşa süresi (saniye). Hızlandıran: **Mimar Okulu**.
 *
 * ⭐ **MİMAR OKULU KENDİNİ HIZLANDIRMAZ** (kullanıcı, 2026-08-03): kendi yükseltmesinde bölen
 * seviyesi 0 geçilir, yani hızlanma uygulanmaz. Diğer bütün yapılar Mimar Okulu'nun mevcut
 * seviyesiyle hızlanmaya devam eder.
 *
 * ⚠️ Bu yorum bir süre **tam tersini** savunuyordu: *"Mimar Okulu'nun kendisi için ayrı kural
 * YOK… özel dal sessiz bir tutarsızlık kaynağı olurdu."* O gerekçe orijinaldeki `/1,4^sv`
 * bölenine göre yazılmıştı ve bölen 1,2'ye indiği için gereksiz görülmüştü. Kullanıcı kararı
 * bunun önünde: kendi kendini hızlandıran bir yapı, seviye atladıkça **giderek daha ucuza**
 * seviye atlıyor — istenen bu değil.
 *
 * ⚠️ İstisna `architectSelfExempt` ayarına bağlı (varsayılan açık) → panelden geri alınabilir.
 */
export function buildingTimeSeconds(
  buildingId: string, level: number, architectSchool: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG,
): number {
  const divisor = buildingId === 'architect_school' && cfg.economy.architectSelfExempt
    ? 0
    : architectSchool;
  /**
   * ⭐ SÜRE ÇARPANI (2. nesil Tur 4) — 1,0 varsayılan.
   *
   * ⚠️ Kullanıcı "her yapının **taban süresi**" istemişti; oyunda öyle bir alan YOK: süre
   * maliyetten türüyor (`timeFromCost`). Taban süre eklemek "süre maliyetten türer"
   * değişmezini kırar ve İKİNCİ bir süre kaynağı açardı — "fiyatı üçe katladım ama süre
   * değişmedi" hatasının doğduğu yer tam olarak orası olurdu. Çarpan aynı ihtiyacı, modeli
   * bozmadan karşılıyor.
   *
   * ⚠️ Çarpan `timeFromCost`ta DEĞİL burada: o fonksiyon yalnız `Cost` görüyor, varlık
   * kimliğini bilmiyor; imzasına id eklemek en çok paylaşılan fonksiyonu kirletirdi.
   */
  const raw = timeFromCost(buildingCost(buildingId, level, cfg), divisor, cfg);
  return raw * (cfg.buildingTuning[`${buildingId}:timeFactor`] ?? 1);
}

/** Teknik araştırma süresi (saniye). Hızlandıran: **o şehrin Akademi'si**. */
export function techTimeSeconds(
  techId: string, level: number, academy: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG,
): number {
  const raw = timeFromCost(techCost(techId, level, cfg), academy, cfg);
  return raw * (cfg.techTuning[`${techId}:timeFactor`] ?? 1);
}

/**
 * Birimin "değeri" = süreye giren büyüklük: **altın + yemek + taşıma kapasitesi**.
 *
 * **Neden maliyet?** Katalogdaki `area` motorda birimin SAVAŞ GÜCÜdür ve savaşçılarda
 * `maliyet/güç` oranı 63 ile 100 arasında (ortalama 81) — yani orijinal tasarımcılar birimleri
 * **zaten güçleriyle orantılı fiyatlamış**. Maliyeti kullanmak gücü de kullanmak demektir;
 * ayrıca bir güç terimi eklemek aynı bilgiyi iki kez saymak olurdu.
 *
 * **Neden ayrıca taşıma?** `maliyet/güç` oranı destek birimlerinde patlıyor (Yük Arabası 250,
 * Casus Kuş 300) çünkü onların değeri savaş gücünde değil. Yük Arabası 2.000 kaynağa **3.000
 * taşıma** veriyor — kaynak başına Cüce'nin 100 katı. Taşımayı 1:1 kaynak saymazsak ganimet
 * taşımak bedava gelirdi: bu terimle değeri 2.000 → 5.000 olur, süresi 2,1 katına çıkar.
 * Diğer birimlerde etki ihmal edilebilir (Ejderha +%0,5) — kasıtlı olarak **hedefli** bir düzeltme.
 */
export function unitTimeValue(unitId: string, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): number {
  // ⚠️ Taban `unitBase`ten: panelden fiyatı değiştirilen birimin SÜRESİ de değişmeli.
  const base = unitBase(unitId, cfg);
  return base.gold + base.food + cfg.economy.carryTimeWeight * base.carry;
}

/** `balanced` = yürürlükteki model. Diğer ikisi ⛔ emekli, yalnız karşılaştırma için (§13.11.3). */
export type TrainingTimeModel = 'balanced' | 'area' | 'original';

/**
 * ⭐ BİRİM ÜRETİM SÜRESİ (saniye) — §13.11.3, **kurgulanan model (kullanıcı, 2026-07-27)**.
 *
 * ```
 * süre = 190 × ((altın + yemek + taşıma) / 1000)^0,8 / 1,2^seviye
 * ```
 * Hızlandıran: savaşçıda **Baraka**, savunma biriminde **Mimar Okulu**.
 *
 * Ölçek: Cüce Baraka 1'de **1 dk 54 sn** → Baraka 5'te 55 sn → Baraka 20'de 4 sn ·
 * Ejderha, ön-şartı olan Baraka 10'da **14 dk 29 sn** · Kaos, Baraka 15'te 2 sa 36 dk ·
 * Casus Kuş Baraka 3'te 42 sn.
 *
 * ⚠️ **Orijinalin ham sayıları alınmadı, ŞEKLİ alındı.** `k.java` Baraka 1'de Cüce'yi
 * 21 dk 50 sn yapıyor (bölen 1,4). Elimizdeki tek gerçek ölçüm (Muhafız 3:22, `images/mobil.png`)
 * birim görselinden anlaşıldığı üzere oyunun **eski bir sürümüne** ait — formülün varlığını
 * kanıtlıyor ama son sürümün ölçeğini kanıtlamıyor. Bu yüzden üs (0,8) ve maliyet güdümlü yapı
 * korundu, katsayı ve bölen oynanabilirliğe göre kurgulandı.
 */
export function trainingTimeSeconds(
  unitId: string,
  sourceLevel: number,
  model: TrainingTimeModel = 'balanced',
  cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG,
): number {
  const def = UNITS_BY_ID[unitId];
  if (!def) throw new Error(`Bilinmeyen birim: ${unitId}`);
  const lvl = Math.max(0, sourceLevel);

  if (model === 'area') {                      // ⛔ Model A — süre = Alan × 0,95^(Baraka−1)
    return def.area * cfg.economy.trainTimeAreaDecay ** (Math.max(1, lvl) - 1);
  }
  if (model === 'original') {                  // ⛔ Model B — k.java'nın ham sayıları
    if (def.kind === 'defense') {
      return (10 * (def.gold + def.food)) / cfg.economy.originalDivisorRate ** lvl;
    }
    // `k.java` maliyeti onda birine TAM SAYI bölmesiyle indiriyor (long/long).
    return (
      (Math.floor((def.gold + def.food) / 10) ** cfg.economy.timeExponent
        * cfg.economy.originalTrainFactor)
      / cfg.economy.originalDivisorRate ** lvl
    );
  }
  // ⚠️ Birim üssü `timeExponent` (0,8 — Java'nın kendi sayısı) ve birim böleni
  //    `timeDecayRate`; ikisi de yapısal kalemlerinkinden AYRI (bkz. `timeCurve`).
  const raw = timeCurve(
    unitTimeValue(unitId, cfg), cfg.economy.unitTimeFactor, lvl,
    cfg.economy.timeExponent, cfg.economy.timeDecayRate,
  );
  /**
   * ⭐ BİRİM BAŞINA SÜRE ÇARPANI (`unitTuning.<id>:timeFactor`, 2026-08-12).
   * Yapı/teknikteki `timeFactor` ile birebir aynı sözleşme: **fiyata dokunmadan** yalnız
   * süreyi çarpar. Oyunda ayrı bir "taban süre" alanı yok — süre fiyattan türüyor — o yüzden
   * tek bir birimi hızlandırmanın/yavaşlatmanın yolu budur.
   */
  return raw * (cfg.unitTuning[`${unitId}:timeFactor`] ?? 1);
}

/**
 * ⭐ İPTAL İADESİ — oyunun KENDİ dokümanından (`teknik_ve_yapi_dokumantasyonu.md`, BARAKA + YAPILAR).
 * İki farklı kural var; yüzdesel tek bir oran DEĞİL:
 *
 * **1) Süreye göre (yapı · teknik · Sur/Büyü Kalkanı)** — doküman örneği birebir:
 *    *"100 altın ve 100 yemeğe inşa edilen bir yapı %20 oranında tamamlanmışken iptal edildiğinde
 *    80 altın ve 80 yemek iade edilir."*  →  `iade = harcanan × (1 − ilerleme)`
 *
 * **2) Birim başına (savaşçı · adetli savunma birimi)** — doküman:
 *    *"mevcut üretimdeki savaşçının kaynağını geri alamazsınız… her iptal işlemi için 1 ünitenin
 *    ücreti eksik iade edilir."*  →  `iade = harcanan × (adet − 1) / adet`
 *    Bu yüzden Ejderha/Kaos gibi pahalı birimlerin iptali ağır: 2 Ejderha siparişinin iptali
 *    bir Ejderhanın maliyetini yakar.
 */
export type RefundRule = 'timeProgress' | 'minusOneUnit';

export interface RefundInput {
  rule: RefundRule;
  spent: Cost;
  /** Süreye göre kuralda: geçen süre / toplam süre (0-1 arası kırpılır). */
  progress?: number;
  /** Birim başına kuralda: sipariş adedi. */
  count?: number;
}

export function cancelRefund(input: RefundInput): Cost {
  const { gold, food } = input.spent;
  if (input.rule === 'timeProgress') {
    const remaining = 1 - Math.min(1, Math.max(0, input.progress ?? 0));
    return { gold: Math.floor(gold * remaining), food: Math.floor(food * remaining) };
  }
  const count = Math.max(1, Math.trunc(input.count ?? 1));
  const keep = (count - 1) / count;   // tek birimlik sipariş → hiç iade yok
  return { gold: Math.floor(gold * keep), food: Math.floor(food * keep) };
}

/* ── GÖREV KURALLARI (oyunun kendi dokümanı: DÜNYA / ŞEHİR KURMA / TELEPORT) ── */

/**
 * ⭐ Bir oyuncunun sahip olabileceği ŞEHİR SAYISI.
 * Doküman: *"Sömürgecilik tekniğinin her üç kademesinde yeni bir şehir kurulabilir.
 * Bir oyuncu en fazla 5 şehre sahip olabilir."*
 * → başkent + ⌊Sömürgecilik/3⌋, tavan 5.
 */
export const MAX_CITIES = 5;
export function maxCities(colonization: number): number {
  return Math.min(MAX_CITIES, 1 + Math.floor(Math.max(0, colonization) / 3));
}

/**
 * ⭐ Teleport'un yeniden hazır olma süresi (saniye).
 * Doküman: *"Teleport binası seviyesini ilerlettiğinizde teleportun kendini hazır hale getirme
 * süresi %2 kısalır."* → `taban × (1 − adım)^(seviye−1)`.
 *
 * ⭐ Taban **24 saat** (kullanıcı, 2026-08-03; önceden 20). Doküman süreyi vermiyor, ikisi de
 * kurgu — bu yüzden hem taban hem adım panelde (`teleport.baseHours` / `teleport.levelStep`).
 * Sv1 = 24 sa · sv20 ≈ 16 sa 24 dk.
 */
export function teleportCooldownSeconds(
  teleportLevel: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG,
): number {
  const lvl = Math.max(1, teleportLevel);
  const step = Math.min(0.99, Math.max(0, cfg.teleport.levelStep));
  return cfg.teleport.baseHours * 3600 * (1 - step) ** (lvl - 1);
}

/**
 * ⭐ CASUSLUK bilgi kademesi (doküman, birebir).
 *
 * `fark = benimCasusluk + log2(gönderilen kuş) − rakipCasusluk`
 * — doküman: *"8 casus kuş yollarsanız 2^3=8 olduğundan casusluk tekniğiniz 3 seviye fazla gibi
 * davranır"*. Kademeler **kümülatif**: her seviye bir öncekinin üstüne ekler.
 */
export const SPY_LEVELS = [
  'resources',      // fark < 0
  'economy',        // fark = 0  → + Maden ve Çiftlik seviyesi
  'armyTotals',     // fark = 1  → + toplam savaşçı ve savunma ünitesi sayısı
  'armyTypes',      // fark = 2  → + birim TİPLERİ
  'armyCounts',     // fark = 3  → + savaşçıların tek tek sayıları
  'full',           // fark ≥ 4  → + teknikler, Kale/Sur/Büyü Kalkanı seviyeleri
] as const;
export type SpyLevel = (typeof SPY_LEVELS)[number];

export function spyEffectiveDiff(
  myEspionage: number, birds: number, theirEspionage: number,
  cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG,
): number {
  /**
   * ⭐ KUŞ BONUSU TAVANLI (kullanıcı, 2026-08-09) — varsayılan +8, yani **256 kuş**.
   *
   * ⚠️ Bu tavan dokümanda YOK; bilerek eklendi ve kullanıcının şikâyetinin doğrudan cevabı:
   * *"Oyuncular bilgi sızdırabilmek için on binlerce kuş göndermek zorunda olmasın."*
   * Tavansız hâlde 10 seviye geride olan biri TAM bilgi için 16.384 kuş göndermek zorundaydı.
   *
   * ⚠️ Tavanın ASIL işlevi bir sınır koymak değil, **seviyeyi tek gerçek kaldıraç yapmak**:
   * 256'nın üstündeki kuş bilgiye hiçbir şey katmaz (yalnız ölür), dolayısıyla farkı kapatmanın
   * tek yolu casusluk tekniğini yükseltmek olur. Kullanıcı: *"Casusluk seviyesini bir şekilde
   * uğraşıp yükselten kişinin buna değmesi gerekir."*
   */
  const bonus = birds > 0 ? Math.min(Math.log2(birds), cfg.spy.birdBonusCap) : 0;
  return Math.max(0, myEspionage) + bonus - Math.max(0, theirEspionage);
}

/* ═══ CASUSLUK KAYIPLARI (kullanıcı tasarımı, 2026-08-09 — SADELEŞTİRME) ═══════
 *
 * ⚠️⚠️ **DUVAR KALDIRILDI.** 2026-07-30 ile 08-09 arasında burada bir «kesişim» modeli vardı:
 * rakip kuş sayısı `2^fark` ile çarpılıp bir ENGELLEME kapasitesi üretiyor, gönderilen kuş
 * bunu DOĞRUSAL aşmak zorunda kalıyordu. Bilgi kademesi ise `log2(kuş)` ile LOGARİTMİK
 * ilerliyordu. İki eksen birbirini yiyordu ve oyuncu farkı göremiyordu: `docs/CASUSLUK_
 * SISTEMI.md`deki vakada bir oyuncu 8 denemede 7.339 kuşu duvarın %5,7'si olduğunu hiç
 * öğrenemeden harcadı. Kullanıcı: *"Duvarı aşma algoritması olmasın… daha çok tek aşamada
 * işi bitirelim."*
 *
 * Yeni model TEK aşamalı. Kademe yalnız `spyEffectiveDiff`ten çıkar; buradaki hesap **yalnız
 * kaç kuşun öleceğini** söyler ve bilgiyi ENGELLEMEZ:
 *
 *   S      = kule×wTower + rakipKuş×wBird + elf×wElf        ← savunmanın anti-hava ağırlığı
 *   P      = lossMax × S/(S + K)                            ← kayıp oranının TAVANI (doygun)
 *   oran   = P / (1 + 2^(E − balancePoint))                 ← E = etkin fark
 *   ölen   = round(kuş × oran)   ·   dönen = kuş − ölen
 *
 * Üç özellik ve neden onlar:
 *
 * ⭐ `1/(1+2^E)` — `log2(kuş)` ile **AYNI EKSEN** (taban 2). "+1 casusluk seviyesi" ile
 *   "kuşu ikiye katlamak" tek cetvelde okunur. Eski modelin tek gerçekten iyi fikri buydu,
 *   korundu. E büyüdükçe kayıp hızla sıfıra iner: kullanıcının *"seviye farkı büyükse 1 kuşla
 *   bile, rakipte 100 kuş 100 elf olsa bile bilgi alınır ve kuş ölmeden döner"* şartı budur.
 *
 * ⭐ `S/(S+K)` doygunluğu — savunma ne kadar büyürse büyüsün oran tavana yaklaşır, ona
 *   çarpmaz. Kullanıcı: *"Rakipteki casus kuşların, elflerin ve okçu kulelerinin sayısı
 *   gönderdiğimiz kuşları pat diye vurmamalı."* `S = 0` ise `P = 0`: kule/elf/kuş yoksa
 *   **hiç kuş ölmez** (dokümanla uyumlu).
 *
 * ⭐ `lossMax < 1` — bu bir denge düğmesi değil, bir **garantinin dayanağı**: oran hiçbir
 *   zaman 1 olamayacağı için yeterince kuş gönderen daima en az bir kuşu geri getirir, yani
 *   **daima bir şey öğrenir**. Kullanıcı: *"Oyuna yeni başlamış birisi uzun süredir oynayan
 *   birisinin kaynak bilgisini alabilsin ama rakibi güçlü olduğu için kuş da kaybetsin."*
 *   Ayrı bir "en az bir kuş sağ kalsın" kuralı YAZILMADI; bu özellik formülden çıkıyor.
 *
 * ⚠️ Ağırlıklar maliyet-temelli: kuş 300 · kule 750 · elf 1.100 kaynak. Kule adanmış anti-hava
 * yapısı (wTower=1), kuş silahsız ama tek işi bu (0,5), elf ise savaşçı — anti-hava YAN görevi
 * olduğu için bilerek en düşük (0,25).
 */
export interface SpyLossInput {
  /** Gönderilen casus kuş sayısı. */
  birds: number;
  /** ⚠️ `spyEffectiveDiff` çıktısı — kademeyle **aynı** sayı, ikinci kez hesaplanmıyor. */
  effectiveDiff: number;
  /** Savunan şehirdeki Okçu Kulesi adedi. */
  towers: number;
  /** Savunan şehirdeki Elf adedi. */
  elves: number;
  /** Savunan şehirdeki Casus Kuş adedi. */
  defenderBirds: number;
}

export interface SpyLossResult {
  /** Vurulan (ölen) kuşlar. */
  killed: number;
  /** Eve dönen kuşlar. ⭐ `≥ 1` ise bilgi gelir — tek geçit şartı budur. */
  survivors: number;
  /** Uygulanan kayıp oranı (0..1) — rapor ve denge çalışmaları için. */
  lossRate: number;
}

export function spyLosses(
  o: SpyLossInput, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG,
): SpyLossResult {
  const birds = Math.max(0, Math.trunc(o.birds));
  const { lossMax, defenseSaturation, balancePoint, wTower, wBird, wElf } = cfg.spy;

  const strength = Math.max(0, o.towers) * wTower
    + Math.max(0, o.defenderBirds) * wBird
    + Math.max(0, o.elves) * wElf;

  // Anti-hava yoksa hiç kuş ölmez; `S/(S+K)` zaten 0 veriyor ama bölme 0/0'a düşmesin.
  const ceiling = strength > 0 ? lossMax * (strength / (strength + defenseSaturation)) : 0;
  const rate = ceiling / (1 + 2 ** (o.effectiveDiff - balancePoint));

  const killed = Math.min(birds, Math.round(birds * rate));
  return { killed, survivors: birds - killed, lossRate: rate };
}

/** Etkin farkı bilgi kademesine çevirir. `fark` kesirli olabilir → aşağı yuvarlanır. */
export function spyLevelFor(diff: number): SpyLevel {
  const step = Math.floor(diff);
  if (step < 0) return 'resources';
  return SPY_LEVELS[Math.min(SPY_LEVELS.length - 1, step + 1)]!;
}

/**
 * ⭐⭐ KUŞ KAYBININ KADEMEYE ETKİSİ — **casusluk hiçbir hâlde boşa gitmez** (kullanıcı, 2026-08-11).
 *
 * Sağ dönen kuş yoksa kademe en alta, `resources`e iner: rakibin **altın ve yemek miktarı**
 * yine görülür. Kullanıcının iki örneği: seviyesi çok düşük biri tek kuşla kasayı görebilmeli;
 * seviyesi yüksek ama savunmaya takılıp bütün kuşlarını kaybeden biri de aynı asgarîyi almalı.
 *
 * ⚠️ **KURAL DEĞİŞTİ.** 2026-08-11 öncesinde `survivors === 0` casusluğu tamamen boşa
 * çıkarıyordu — ne kademe ne tek bir sayı. Savunmanın ödülü artık bilgiyi **kesmek** değil,
 * en alt kademeye **indirmek** (+ kuş öldürmek).
 *
 * ⚠️ **Kural SEVİYEDEN BAĞIMSIZ** ve fonksiyonun ayrı durmasının sebebi bu. Ölçüm: bugünkü
 * `spy` sabitleriyle (`lossMax 0,95` · `balancePoint 0`) fark ≥ 0 olan bir casusun kuşlarının
 * TAMAMI, savunma sonsuz olsa bile asla ölmüyor — yani kullanıcının ikinci örneği bugün
 * ulaşılamaz durumda. Kuralı yine de kademeye bakmadan yazıyoruz: `lossMax` ya da
 * `balancePoint` bir gün oynarsa davranışın sessizce değişmemesi gerek.
 */
export function spyLevelAfterLosses(level: SpyLevel, survivors: number): SpyLevel {
  return survivors >= 1 ? level : 'resources';
}

/**
 * Kahraman diriltme maliyeti: **(3000, 2000) × oran^seviye** (§13.11.4b).
 * Oran `cfg.economy.heroReviveCostRate` — **varsayılan 1,25**.
 *
 * ⭐ **Taban ÖLÇÜLDÜ, üs ÖLÇÜLMEDİ.** Oyunun kendi tapınak ekranında seviye 0 bir ölü kahraman
 * için `3000 altın · 2000 yiyecek` yazıyor (`images/scr_itv03`). Üs ise tamamen bizim: orijinal
 * istemci bedeli hiç hesaplamıyor, onay diyaloğu sunucudan gelen hazır sayıları basıyor
 * (`l.java:175` → `<ad> <l> Altın <m> Yemek karşılığında diriltilecek`). Kanıt zinciri:
 * `docs/JAVA_ROENTGEN.md`.
 *
 * ⚠️ **1,50 → 1,25 (kullanıcı, 2026-08-11)** — eski üs ıraksıyordu. Seviye 20'de:
 *   • kahramanın savaş değeri  `(L+1)×1,07^L` →   **81×** sv0
 *   • biriken XP (emek)                      →    435× sv0
 *   • diriltme bedeli `1,5^L`                → **3.325×** sv0
 * Yani bedel değerden **41 kat** hızlı büyüyor, üstelik tavansız. Pratik sonucu: sv15+ bir
 * kahraman kalıcı ölüydü — Maden 20 ekonomisinde diriltmek **23 günlük** gelir tutuyordu,
 * oyuncu yenisinin çıkmasını beklemeyi seçiyordu. 1,25 tam olarak güç eğrisinin hızı; aynı
 * diriltme 1,5 güne indi.
 *
 * ⭐ Ceza kalkmadı, **eksen değiştirdi**: kahramanı kaybetmenin bedeli artık altın değil
 * ZAMAN (48 saate kadar diriltme beklemesi, bkz. `heroReviveSeconds`). Sur onarımındaki
 * 2026-08-11 kararıyla aynı çizgi.
 *
 * ⚠️ Maliyet Tapınak seviyesinden **etkilenmez** (kullanıcı kararı) — Tapınak yalnız süreyi
 * kısaltır. Doküman da Tapınak'a iki iş veriyor: çıkma ihtimali + diriltme süresi.
 */
export function heroReviveCost(level: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): Cost {
  const k = cfg.economy.heroReviveCostRate ** Math.max(0, level);
  return { gold: Math.round(3000 * k), food: Math.round(2000 * k) };
}

/**
 * Kahraman diriltme süresi (saniye): **9 saat × 1,10^Seviye × 0,93^Tapınak**.
 * Alt sınır 15 dakika, üst sınır 48 saat.
 *
 * Yön (kullanıcı, 2026-07-29 ikinci düzeltme — *"mantıklı olan da bu"*):
 *  • **Kahraman seviyesi UZATIR** — yüksek seviye kahramanı kaybetmek ağır olmalı. Maliyet de
 *    aynı yönde artar.
 *  • **Tapınak seviyesi KISALTIR** — Tapınak'ı yükseltmenin somut faydası bu. Maliyete etkisi yok.
 *  • Buradaki Tapınak, kahramanın **o an bulunduğu şehrin** tapınağıdır. (Kahraman ÇIKMA
 *    ihtimalindeki tapınak bambaşka: oyuncunun TÜM şehirlerinin toplamı.)
 *
 * Taban: tapınaksız bir şehirde ölen seviye 0 kahraman **9 saat** bekler — kahraman kıymetli bir
 * ünite, ölümü oyunun en başında da hissedilmeli.
 *
 * Kalibrasyon: oyunun ekranında seviye 0 bir kahraman için `2:04:27` (7467 sn) görülüyor; tapınak
 * seviyesi yazmıyor ama kahraman çıkabilmesi için yüksek olmalı. Model Tapınak 20 / seviye 0 için
 * `2:06:29` veriyor — 2 dakika farkla oturuyor.
 */
export function heroReviveSeconds(level: number, temple: number): number {
  const raw = 32_400 * 1.1 ** Math.max(0, level) * 0.93 ** Math.max(0, temple);
  return Math.min(48 * 3600, Math.max(900, Math.round(raw)));
}

/**
 * ⭐ Biriken tecrübenin karşılığı olan seviye.
 *
 * Eşikler BİRİKİMLİ — seviye atlarken XP harcanmaz, yalnız bir sonraki eşiğe bakılır. Bu yüzden
 * tek savaştan **birkaç seviye birden** çıkabilir ve seviye **kendiliğinden** yükselir: oyuncu
 * hiçbir düğmeye basmaz (kullanıcı kararı 2026-07-29). Oyuncunun elle yaptığı tek iş, seviye
 * başına gelen 3 puanı dağıtmak.
 */
export function heroLevelForXp(xp: number): number {
  let level = 0;
  while (level < 100 && xp >= heroXpForLevel(level + 1)) level += 1;
  return level;
}

/**
 * ⭐ SUR'UN O ANKİ BÜTÜNLÜĞÜ — onarım ilerledikçe doğrusal olarak 1'e yaklaşır.
 *
 * Savaşta hasar gören sur `from` anında `start` bütünlüğüyle onarıma girer, `until` anında tam
 * sağlam olur. **Onarım sürerken gelen saldırıyı, sur o ana kadar onarılmış yüzdeyle karşılar**
 * (kullanıcı kararı 2026-07-29): eskiden savaşa hep savaş-sonrası değerle giriyordu, yani
 * onarımda geçen saatlerin hiçbir karşılığı yoktu.
 *
 * @param start onarım BAŞLARKENki bütünlük (savaş sonrası kalan oran, 0-1)
 */
export function wallCurrentIntegrity(
  start: number, from: Date | null, until: Date | null, now: Date,
): number {
  if (until == null || until <= now) return 1;
  const s = Math.min(1, Math.max(0, start));
  if (from == null || from >= until) return s;
  const oran = (now.getTime() - from.getTime()) / (until.getTime() - from.getTime());
  return Math.min(1, s + (1 - s) * Math.min(1, Math.max(0, oran)));
}
