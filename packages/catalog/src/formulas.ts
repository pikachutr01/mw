/**
 * §13.8 + §13.9 — DOĞRULANMIŞ EKONOMİ FORMÜLLERİ.
 * Tablo tutmuyoruz: üç tablonun da kapalı formu bulundu ve birebir doğrulandı
 * (Çiftlik 40/40 · Maden 40/40 · Kahraman XP 80/80 · Mağara cüce 119/120).
 */
import { BUILDINGS_BY_ID, STARTING_BUILDINGS } from './buildings.ts';
import { TECHS_BY_ID } from './techs.ts';
import { UNITS_BY_ID } from './units.ts';

/** Sabitler `k.java:10-15`'ten. */
export const ECONOMY_CONSTANTS = {
  foodBase: 6,
  foodRate: 1.16,
  goldBase: 5,
  goldRate: 1.15,
  /** yapı maliyeti eğrisi: `buildingCostRate^(seviye−1)` */
  buildingCostRate: 1.8,
  /**
   * Çiftlik/Maden eğrisi: `seviye × economyCostRate^(seviye−1)`.
   *
   * ⚠️ **1,45 DEĞİL 1,33** (2026-07-28, kullanıcı onayı). `k.java`'daki sabit 1,45'ti ama o oran
   * orijinalin (bilmediğimiz) tabanlarına ve muhtemelen başka bir seviye tavanına aitti. Bizim
   * tavanımız **40** ve 1,45 ile maliyet `1,45^L`, üretim `1,16^L` büyüdüğü için seviye 40
   * ekonomik olarak **ulaşılamaz** oluyordu: 190 milyon kaynak, geri ödemesi ~1 yıl.
   * 1,33 ile seviye 40 = 7,1 milyon kaynak, geri ödeme 20-36 gün — gerçek bir geç-oyun hedefi.
   */
  economyCostRate: 1.33,
  /** teknik maliyeti: base × techCostRate^(level+1) */
  techCostRate: 1.5,
  /** süre böleni tabanı: /1.4^(ilgili yapı seviyesi) */
  timeDivisorRate: 1.4,
  /* ── SÜRE MODELİ (§13.11.3, kullanıcı kurgusu 2026-07-27) ─────────────────── */
  /** Her hızlandırıcı yapı seviyesi süreyi %16,7 kısaltır (bölen `1,2^seviye`). */
  timeDecayRate: 1.2,
  /** Üs: `k.java`'nın kendi üssü. Pahalı birimi saniye başına daha verimli yapar (bkz. §13.11.3). */
  timeExponent: 0.8,
  /** Savaşçı ve savunma birimi katsayısı → Cüce, Baraka 1'de 1 dk 54 sn. */
  unitTimeFactor: 190,
  /** Yapı / teknik / Sur / Büyü Kalkanı katsayısı → aynı maliyette birimin ~2 katı süre. */
  structureTimeFactor: 400,
  /** 1 birim taşıma kapasitesi = 1 kaynak sayılır (yalnız Yük Arabası'nda anlamlı fark yaratır). */
  carryTimeWeight: 1,

  /* ── Emekli süre modelleri (yalnız denge düğmesi) ─────────────────────────── */
  /** ⛔ Model A: `area × 0.95^(Baraka−1)`. */
  trainTimeAreaDecay: 0.95,
  /** ⛔ Model B (k.java): `(⌊(a+y)/10⌋)^0.8 × 65 / 1.4^Baraka`. */
  originalTrainFactor: 65,
  originalDivisorRate: 1.4,
} as const;

/**
 * ⭐ MAĞARA SABİTLERİ (§13.20). İlk dördü **ölçülmüş veriden** gelir ve denge düğmesi DEĞİLDİR;
 * son dördü bizim kurgumuzdur ve serbestçe ayarlanabilir.
 */
export const CAVE_CONSTANTS = {
  /* ── Ölçülmüş ─────────────────────────────────────────────────────────────── */
  /** Kapasite tablosu: 50 · 100 · 200 … 26.214.400 (20/20). */
  capacityBase: 50,
  /** `cuce-magara.png`: seviye 1'de 100 cüce (Demircilik 0). */
  breakBase: 100,
  /** Her seviye mağaraya %50 dayanıklılık (doküman + tablo). */
  breakRate: 1.5,
  /** Demircilik seviyesi başına payda +0,05 (TOPLAMSAL — üssel değil). */
  blacksmithingRelief: 0.05,

  /* ── Kurgu (denge düğmesi) ────────────────────────────────────────────────── */
  /** `süre = transferFactor × √alan / 1,1^(sv−1)`. 25 → seviye 1'de dolu mağara 2 dk 57 sn. */
  transferFactor: 25,
  /** Doküman: her mağara seviyesi doldurma/boşaltmayı %10 azaltır. */
  transferDecayRate: 1.1,
  /** Tek birimlik işlem bile anlık olmasın (istismar tamponu). */
  minTransferSeconds: 5,
  /** Yıkılan mağaranın onarımı: 26 saat, her seviye %10 kısa (§13.20.4). */
  repairBaseSeconds: 26 * 3600,
  repairDecayRate: 0.9,
} as const;

export interface Cost {
  gold: number;
  food: number;
}

/** Çiftlik üretimi (yemek/saat) — 40/40 seviyede birebir doğrulandı. */
export function farmOutput(level: number): number {
  if (level <= 0) return 0;
  return Math.floor(ECONOMY_CONSTANTS.foodBase * level * ECONOMY_CONSTANTS.foodRate ** level);
}

/** Maden üretimi (altın/saat) — 40/40 seviyede birebir doğrulandı. */
export function mineOutput(level: number): number {
  if (level <= 0) return 0;
  return Math.floor(ECONOMY_CONSTANTS.goldBase * level * ECONOMY_CONSTANTS.goldRate ** level);
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
export function dwarvesToBreakCave(caveLevel: number, blacksmithing: number): number {
  if (caveLevel <= 0) return Infinity;          // yapılmamış mağara yıkılamaz
  return Math.round(
    (CAVE_CONSTANTS.breakBase * CAVE_CONSTANTS.breakRate ** (caveLevel - 1))
    / (1 + CAVE_CONSTANTS.blacksmithingRelief * Math.max(0, blacksmithing)),
  );
}

/** ⭐ ÖLÇÜLMÜŞ: mağara kapasitesi (ALAN cinsinden) — 50 × 2^(sv−1), 20/20 doğrulandı. */
export function caveCapacity(caveLevel: number): number {
  if (caveLevel <= 0) return 0;
  return CAVE_CONSTANTS.capacityBase * 2 ** (caveLevel - 1);
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
 * • Dünya hız çarpanı UYGULANMAZ: bu bir sefer değil, şehir içi iş — üretim süreleri de
 *   çarpanla ölçeklenmiyor.
 */
export function caveTransferSeconds(area: number, caveLevel: number): number {
  if (area <= 0) return 0;
  const level = Math.max(1, caveLevel);
  const raw = (CAVE_CONSTANTS.transferFactor * Math.sqrt(area))
    / CAVE_CONSTANTS.transferDecayRate ** (level - 1);
  return Math.max(CAVE_CONSTANTS.minTransferSeconds, Math.round(raw));
}

/**
 * ⭐ KURGU: yıkılan mağaranın kendini onarma süresi.
 *
 * Doküman *"24 saat sürer, bu süre kısalmaz"* diyor; **kullanıcı bunu bilerek değiştirdi**
 * (2026-07-28): taban biraz daha uzun (26 sa) ama her seviye %10 kısaltıyor. Gerekçe: mağarayı
 * yükseltmek yalnız kapasite değil **dayanıklılık** da almalı, yoksa yüksek seviye mağara
 * yıkıldığında oyuncu sabit 24 saat boyunca en değerli ordusunu saklayamaz hâle geliyordu.
 */
export function caveRepairSeconds(caveLevel: number): number {
  const level = Math.max(1, caveLevel);
  return Math.round(
    CAVE_CONSTANTS.repairBaseSeconds * CAVE_CONSTANTS.repairDecayRate ** (level - 1),
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
function costCurve(buildingId: string, level: number): number {
  return BUILDINGS_BY_ID[buildingId]?.economyCostCurve
    ? level * ECONOMY_CONSTANTS.economyCostRate ** (level - 1)
    : ECONOMY_CONSTANTS.buildingCostRate ** (level - 1);
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
export function buildingCost(buildingId: string, level: number): Cost {
  const def = BUILDINGS_BY_ID[buildingId];
  if (!def) throw new Error(`Bilinmeyen yapı: ${buildingId}`);
  if (level <= 0) return { gold: 0, food: 0 };
  const firstPaid = (STARTING_BUILDINGS[buildingId] ?? 0) + 1;
  const k = costCurve(buildingId, level) / costCurve(buildingId, firstPaid);
  return { gold: Math.round(def.baseGold * k), food: Math.round(def.baseFood * k) };
}

/** Teknik maliyeti: base × 1.5^(seviye+1). */
export function techCost(techId: string, level: number): Cost {
  const def = TECHS_BY_ID[techId];
  if (!def) throw new Error(`Bilinmeyen teknik: ${techId}`);
  const k = ECONOMY_CONSTANTS.techCostRate ** (level + 1);
  return { gold: Math.round(def.baseGold * k), food: Math.round(def.baseFood * k) };
}

/** Birim maliyeti sabittir (adet başına). */
export function unitCost(unitId: string, count = 1): Cost {
  const def = UNITS_BY_ID[unitId];
  if (!def) throw new Error(`Bilinmeyen birim: ${unitId}`);
  return { gold: def.gold * count, food: def.food * count };
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
function timeCurve(value: number, factor: number, level: number): number {
  return (
    (factor * (Math.max(0, value) / 1000) ** ECONOMY_CONSTANTS.timeExponent)
    / ECONOMY_CONSTANTS.timeDecayRate ** Math.max(0, level)
  );
}

/** Maliyeti olan her YAPISAL kalemin süresi (yapı · teknik · Sur · Büyü Kalkanı). */
export function timeFromCost(cost: Cost, divisorLevel: number): number {
  return timeCurve(cost.gold + cost.food, ECONOMY_CONSTANTS.structureTimeFactor, divisorLevel);
}

/**
 * Yapı inşa süresi (saniye). Hızlandıran: **Mimar Okulu**.
 *
 * ⚠️ Mimar Okulu'nun kendisi için ayrı kural YOK: o da kendi **mevcut** seviyesiyle hızlanır.
 * Orijinaldeki özel dal (`/1,2^sv`, 10× çarpansız) 1,4'lük bölenin kaçışını frenlemek içindi;
 * bölen 1,2'ye inince frene gerek kalmadı ve özel dal sessiz bir tutarsızlık kaynağı olurdu.
 */
export function buildingTimeSeconds(buildingId: string, level: number, architectSchool: number): number {
  return timeFromCost(buildingCost(buildingId, level), architectSchool);
}

/** Teknik araştırma süresi (saniye). Hızlandıran: **o şehrin Akademi'si**. */
export function techTimeSeconds(techId: string, level: number, academy: number): number {
  return timeFromCost(techCost(techId, level), academy);
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
export function unitTimeValue(unitId: string): number {
  const def = UNITS_BY_ID[unitId];
  if (!def) throw new Error(`Bilinmeyen birim: ${unitId}`);
  return def.gold + def.food + ECONOMY_CONSTANTS.carryTimeWeight * def.carry;
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
): number {
  const def = UNITS_BY_ID[unitId];
  if (!def) throw new Error(`Bilinmeyen birim: ${unitId}`);
  const lvl = Math.max(0, sourceLevel);

  if (model === 'area') {                      // ⛔ Model A — süre = Alan × 0,95^(Baraka−1)
    return def.area * ECONOMY_CONSTANTS.trainTimeAreaDecay ** (Math.max(1, lvl) - 1);
  }
  if (model === 'original') {                  // ⛔ Model B — k.java'nın ham sayıları
    if (def.kind === 'defense') {
      return (10 * (def.gold + def.food)) / ECONOMY_CONSTANTS.originalDivisorRate ** lvl;
    }
    // `k.java` maliyeti onda birine TAM SAYI bölmesiyle indiriyor (long/long).
    return (
      (Math.floor((def.gold + def.food) / 10) ** ECONOMY_CONSTANTS.timeExponent
        * ECONOMY_CONSTANTS.originalTrainFactor)
      / ECONOMY_CONSTANTS.originalDivisorRate ** lvl
    );
  }
  return timeCurve(unitTimeValue(unitId), ECONOMY_CONSTANTS.unitTimeFactor, lvl);
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

/** Etkin farkı bilgi kademesine çevirir. `fark` kesirli olabilir → aşağı yuvarlanır. */
export function spyLevelFor(diff: number): SpyLevel {
  const step = Math.floor(diff);
  if (step < 0) return 'resources';
  return SPY_LEVELS[Math.min(SPY_LEVELS.length - 1, step + 1)]!;
}

/** Kahraman diriltme maliyeti: (3000, 2000) × 1,5^seviye (§13.11.4b). */
export function heroReviveCost(level: number): Cost {
  const k = 1.5 ** Math.max(0, level);
  return { gold: Math.round(3000 * k), food: Math.round(2000 * k) };
}

/** Kahraman diriltme süresi (saniye): 2 saat × 1,5^seviye / 1,4^(Tapınak−1). */
export function heroReviveSeconds(level: number, temple: number): number {
  return (7200 * 1.5 ** Math.max(0, level)) / 1.4 ** Math.max(0, temple - 1);
}
