/**
 * §13.8 + §13.9 — DOĞRULANMIŞ EKONOMİ FORMÜLLERİ.
 * Tablo tutmuyoruz: üç tablonun da kapalı formu bulundu ve birebir doğrulandı
 * (Çiftlik 40/40 · Maden 40/40 · Kahraman XP 80/80 · Mağara cüce 119/120).
 */
import { BUILDINGS_BY_ID } from './buildings.ts';
import { TECHS_BY_ID } from './techs.ts';
import { UNITS_BY_ID } from './units.ts';

/** Sabitler `k.java:10-15`'ten. */
export const ECONOMY_CONSTANTS = {
  foodBase: 6,
  foodRate: 1.16,
  goldBase: 5,
  goldRate: 1.15,
  /** yapı maliyeti: base × buildingCostRate^(level−1) */
  buildingCostRate: 1.8,
  /** Çiftlik/Maden istisnası: base × level × economyCostRate^(level−1) */
  economyCostRate: 1.45,
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

/** Mağarayı yıkmak için gereken cüce sayısı — 119/120 hücrede doğrulandı. */
export function dwarvesToBreakCave(caveLevel: number, blacksmithing: number): number {
  return Math.round((100 * 1.5 ** (caveLevel - 1)) / (1 + 0.05 * Math.max(0, blacksmithing)));
}

/** Mağara kapasitesi (ALAN cinsinden) — 50 × 2^(sv−1), 20/20 doğrulandı. */
export function caveCapacity(caveLevel: number): number {
  if (caveLevel <= 0) return 0;
  return 50 * 2 ** (caveLevel - 1);
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

/** `level` seviyesine ULAŞMANIN maliyeti (kümülatif değil). */
export function buildingCost(buildingId: string, level: number): Cost {
  const def = BUILDINGS_BY_ID[buildingId];
  if (!def) throw new Error(`Bilinmeyen yapı: ${buildingId}`);
  if (level <= 0) return { gold: 0, food: 0 };
  const k = def.economyCostCurve
    ? level * ECONOMY_CONSTANTS.economyCostRate ** (level - 1)
    : ECONOMY_CONSTANTS.buildingCostRate ** (level - 1);
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

/** Kahraman diriltme maliyeti: (3000, 2000) × 1,5^seviye (§13.11.4b). */
export function heroReviveCost(level: number): Cost {
  const k = 1.5 ** Math.max(0, level);
  return { gold: Math.round(3000 * k), food: Math.round(2000 * k) };
}

/** Kahraman diriltme süresi (saniye): 2 saat × 1,5^seviye / 1,4^(Tapınak−1). */
export function heroReviveSeconds(level: number, temple: number): number {
  return (7200 * 1.5 ** Math.max(0, level)) / 1.4 ** Math.max(0, temple - 1);
}
