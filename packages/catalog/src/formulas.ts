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
function costCurve(buildingId: string, level: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): number {
  return BUILDINGS_BY_ID[buildingId]?.economyCostCurve
    ? level * cfg.economy.economyCostRate ** (level - 1)
    : cfg.economy.buildingCostRate ** (level - 1);
}

/**
 * `level` seviyesine ULAŞMANIN maliyeti (kümülatif değil).
 *
 * ⭐ **`baseGold`/`baseFood` = oyuncunun ÖDEDİĞİ İLK yükseltmenin fiyatı** (kullanıcı, 2026-07-28).
 * Kale · Baraka · Çiftlik · Maden oyuna **seviye 1** başlıyor (`STARTING_BUILDINGS`), yani onlarda
 * ilk ödenen seviye **2**'dir ve taban oraya oturur. Diğer yapılarda ilk ödenen seviye 1, hiçbir
 * şey değişmez.
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
  return { gold: Math.round(def.baseGold * k * m), food: Math.round(def.baseFood * k * m) };
}

/** Teknik maliyeti: base × 1.5^(seviye+1). */
export function techCost(techId: string, level: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): Cost {
  const def = TECHS_BY_ID[techId];
  if (!def) throw new Error(`Bilinmeyen teknik: ${techId}`);
  const k = cfg.economy.techCostRate ** (level + 1) * cfg.economy.techCostMultiplier;
  return { gold: Math.round(def.baseGold * k), food: Math.round(def.baseFood * k) };
}

/** Birim maliyeti sabittir (adet başına). */
export function unitCost(unitId: string, count = 1, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): Cost {
  const def = UNITS_BY_ID[unitId];
  if (!def) throw new Error(`Bilinmeyen birim: ${unitId}`);
  /**
   * ⚠️ Yuvarlama ADET ile çarpımdan SONRA: birim başına yuvarlasaydık 100 birimlik sipariş
   * ile 100 kez 1 birimlik sipariş farklı tutar öderdi ve oyuncu ucuz olanı bulurdu.
   */
  const m = cfg.economy.unitCostMultiplier;
  return { gold: Math.round(def.gold * count * m), food: Math.round(def.food * count * m) };
}

/**
 * ⭐ ORTAK SÜRE ÇEKİRDEĞİ (§13.11.3): `K × (değer/1000)^0,8 / 1,2^(hızlandıran yapı seviyesi)`.
 *
 * Dört kategori de (savaşçı · savunma · yapı · teknik) **aynı eğriyi** kullanır; yalnız `K` ve
 * hızlandıran yapı değişir. Tek çekirdek olmasının sebebi acı deneyim: dört yerde ayrı yazılsaydı
 * biri güncellenip diğerleri unutulurdu.
 *
 * **Üs neden 0,8?** `k.java`'nın kendi üssü — ve doğru şekli veriyor: süre maliyetin altında
 * kalan bir hızla büyür, böylece elit birim saniye başına daha çok güç üretir (Ejderha, Cüce'nin
 * 100 katı maliyete karşı 39 katı süre = güç/saniye'de 2,1 kat avantaj). Bu avantajın bedeli
 * yüksek ön-şartlar. Üs 1,0 olsaydı birim seçimi yalnız maliyet verimliliğine inerdi.
 *
 * **Bölen neden 1,2 (orijinaldeki 1,4 değil)?** 1,4 yirmi seviyede **836 kat** demek; Baraka tek
 * başına oyunun kaderini belirler ve seviye 1'deki oyuncu hiçbir şey üretemez. 1,2 ile yirmi
 * seviye **32 kat** kazandırır — hissedilir ama tek eksenli değil.
 */
function timeCurve(
  value: number, factor: number, level: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG,
): number {
  return (
    (factor * (Math.max(0, value) / 1000) ** cfg.economy.timeExponent)
    / cfg.economy.timeDecayRate ** Math.max(0, level)
  );
}

/** Maliyeti olan her YAPISAL kalemin süresi (yapı · teknik · Sur · Büyü Kalkanı). */
export function timeFromCost(cost: Cost, divisorLevel: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): number {
  return timeCurve(cost.gold + cost.food, cfg.economy.structureTimeFactor, divisorLevel, cfg);
}

/**
 * Yapı inşa süresi (saniye). Hızlandıran: **Mimar Okulu**.
 *
 * ⚠️ Mimar Okulu'nun kendisi için ayrı kural YOK: o da kendi **mevcut** seviyesiyle hızlanır.
 * Orijinaldeki özel dal (`/1,2^sv`, 10× çarpansız) 1,4'lük bölenin kaçışını frenlemek içindi;
 * bölen 1,2'ye inince frene gerek kalmadı ve özel dal sessiz bir tutarsızlık kaynağı olurdu.
 */
export function buildingTimeSeconds(
  buildingId: string, level: number, architectSchool: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG,
): number {
  return timeFromCost(buildingCost(buildingId, level, cfg), architectSchool, cfg);
}

/** Teknik araştırma süresi (saniye). Hızlandıran: **o şehrin Akademi'si**. */
export function techTimeSeconds(
  techId: string, level: number, academy: number, cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG,
): number {
  return timeFromCost(techCost(techId, level, cfg), academy, cfg);
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
  const def = UNITS_BY_ID[unitId];
  if (!def) throw new Error(`Bilinmeyen birim: ${unitId}`);
  return def.gold + def.food + cfg.economy.carryTimeWeight * def.carry;
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
  return timeCurve(unitTimeValue(unitId, cfg), cfg.economy.unitTimeFactor, lvl, cfg);
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
 * süresi %2 kısalır."* → `taban × 0,98^(seviye−1)`. Taban §13.11.4'ten: **20 saat**.
 */
export const TELEPORT_BASE_COOLDOWN_SECONDS = 20 * 3600;
export function teleportCooldownSeconds(teleportLevel: number): number {
  const lvl = Math.max(1, teleportLevel);
  return TELEPORT_BASE_COOLDOWN_SECONDS * 0.98 ** (lvl - 1);
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

export function spyEffectiveDiff(myEspionage: number, birds: number, theirEspionage: number): number {
  const bonus = birds > 0 ? Math.log2(birds) : 0;
  return Math.max(0, myEspionage) + bonus - Math.max(0, theirEspionage);
}

/* ═══ CASUSLUK KESİŞİMİ (kullanıcı tasarımı + sweep kalibrasyonu, 2026-07-30) ═══
 *
 * İki ayrı kapasite; ikisi de casusluk seviye FARKIYLA üstel ölçeklenir — en büyük çarpan
 * bilinçli olarak seviye farkı (kullanıcı: "buradaki en büyük çarpan casusluk seviyesi farkı").
 *
 *   espK   = 2^clamp(rakipEsp − benimEsp, −6, +6)
 *   K_vur  = (kule×wKule + elf×wElf) × espK      ← doküman: yalnız Kule + Elf VURUR
 *   K_engel= rakipKuş × wKuş × espK              ← rakip kuşlar VURMAZ, ENGELLER (jam)
 *   ölen   = min(gönderilen, round(K_vur))        (vurma yalnız kule/elf VARSA)
 *   bilgi  = max(0, gönderilen − ölen − round(K_engel))
 *
 * `2^fark` tabanı bilerek: bilgi kademesi tarafındaki `log2(kuş)` ile AYNI eksen — +1 casusluk
 * seviyesi tam olarak "kuşları ikiye katlamak" demektir, iki denklem tek cetvelde okunur.
 * Deterministiktir (jitter yok): kullanıcının örneği de deterministik — savunma öyle bir
 * değerdedir ki 256 kuşun tamamını vururken 300 kuştan 280'ini vurur, kalan 20 bilgiyi getirir.
 *
 * Ağırlıklar maliyet-temelli, sweep ile doğrulandı (`scripts/spy-balance.mjs`):
 *   kuş 100+200=300 · kule 300+450=750 · elf 450+650=1100 kaynak. Engelleme başına maliyet:
 *   kuş 300 (bire bir, en verimli — tek işi bu) < kule 750 (çift görevli savunma yapısı)
 *   < elf 5.500 (savaşçı; anti-hava YAN görevi, wElf=0,2). Böylece "hatrı sayılır elf/kule/kuş"
 *   gerçek bir engel ama adanmış sayaç her zaman kuş.
 */
export const SPY_CONSTANTS = {
  /** Rakip casus kuşu başına ENGELLEME (jam) kapasitesi — bire bir, tam blok kuralının temeli. */
  wBird: 1.0,
  /** Okçu Kulesi başına VURMA kapasitesi. */
  wTower: 1.0,
  /** Elf başına VURMA kapasitesi — savaşçının yan görevi, kasıtlı düşük. */
  wElf: 0.2,
  /** Seviye farkı üssü tabanı (2 = her seviye ikiye katlar) ve kırpma sınırı (±6 → en çok 64×). */
  espBase: 2,
  espClamp: 6,
} as const;

export interface SpyInterceptionInput {
  /** Gönderilen casus kuş sayısı. */
  birds: number;
  /** Saldıranın casusluk tekniği seviyesi. */
  myEspionage: number;
  /** Savunanın casusluk tekniği seviyesi. */
  theirEspionage: number;
  /** Savunan şehirdeki Okçu Kulesi adedi. */
  towers: number;
  /** Savunan şehirdeki Elf adedi. */
  elves: number;
  /** Savunan şehirdeki Casus Kuş adedi (vurmaz, ENGELLER). */
  defenderBirds: number;
}

export interface SpyInterceptionResult {
  /** Kule/Elf tarafından vurulan (ölen) kuşlar. */
  killed: number;
  /** Rakip kuşlarca engellenen kuşlar — ölmez, eve döner ama bilgi getiremez. */
  blocked: number;
  /** Bilgiyi getiren kuşlar: ≥1 ise casusluk raporu yazılır. */
  infoBirds: number;
  /** Eve dönen kuşlar (engellenenler dahil, ölenler hariç). */
  survivors: number;
}

export function spyInterception(o: SpyInterceptionInput): SpyInterceptionResult {
  const birds = Math.max(0, Math.trunc(o.birds));
  const { wBird, wTower, wElf, espBase, espClamp } = SPY_CONSTANTS;
  const diff = Math.max(0, o.theirEspionage) - Math.max(0, o.myEspionage);
  const espK = espBase ** Math.max(-espClamp, Math.min(espClamp, diff));

  // Doküman: kuşları yalnız Kule ve Elf vurabilir — yoksa kayıp da yok.
  const towers = Math.max(0, o.towers);
  const elves = Math.max(0, o.elves);
  const killCapacity = towers + elves > 0
    ? Math.round((towers * wTower + elves * wElf) * espK) : 0;
  const killed = Math.min(birds, killCapacity);

  // Rakip kuşlar VURMAZ, ENGELLER: eşit seviyede kuş kuşa — rakipte gönderdiğin kadar kuş
  // varsa hiçbir bilgi sızmaz ama kimse ölmez (kullanıcının "kimse kimseden alamaz" açmazı).
  const jamCapacity = Math.round(Math.max(0, o.defenderBirds) * wBird * espK);
  const blocked = Math.min(birds - killed, jamCapacity);

  return {
    killed,
    blocked,
    infoBirds: Math.max(0, birds - killed - blocked),
    survivors: birds - killed,
  };
}

/** Etkin farkı bilgi kademesine çevirir. `fark` kesirli olabilir → aşağı yuvarlanır. */
export function spyLevelFor(diff: number): SpyLevel {
  const step = Math.floor(diff);
  if (step < 0) return 'resources';
  return SPY_LEVELS[Math.min(SPY_LEVELS.length - 1, step + 1)]!;
}

/**
 * Kahraman diriltme maliyeti: **(3000, 2000) × 1,5^seviye** (§13.11.4b).
 *
 * ⭐ Taban ÖLÇÜLDÜ: oyunun kendi tapınak ekranında seviye 0 bir ölü kahraman için
 * `3000 altın · 2000 yiyecek` yazıyor (`images/scr_itv03`). Yalnız seviye çarpanı bizim.
 * Çarpan bilerek dik — seviye 10'da 173 bin, seviye 15'te 1,3 milyon altın. Süre de aynı yönde
 * uzuyor (bkz. `heroReviveSeconds`): yüksek seviye kahramanı kaybetmek her iki eksende de ağır.
 * ⚠️ Maliyet Tapınak seviyesinden **etkilenmez** (kullanıcı kararı) — Tapınak yalnız süreyi kısaltır.
 */
export function heroReviveCost(level: number): Cost {
  const k = 1.5 ** Math.max(0, level);
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
