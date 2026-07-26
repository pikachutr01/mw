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
  /** Mimar Okulu kendi süresi: (gold+food) / 1.2^level */
  architectSelfRate: 1.2,
  /** savaşçı süresi (Model B): ((gold+food)/10)^0.8 × 65 / 1.4^Baraka */
  trainTimeExponent: 0.8,
  trainTimeFactor: 65,
  /** Model A: süre(sn) = area × 0.95^(Baraka−1) */
  trainTimeAreaDecay: 0.95,
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

/** Yapı inşa süresi (saniye): 10 × (altın+yemek) / 1.4^MimarOkulu. Mimar Okulu kendisi: /1.2^sv. */
export function buildingTimeSeconds(buildingId: string, level: number, architectSchool: number): number {
  const c = buildingCost(buildingId, level);
  const total = c.gold + c.food;
  if (buildingId === 'architect_school') {
    return total / ECONOMY_CONSTANTS.architectSelfRate ** level;
  }
  return (10 * total) / ECONOMY_CONSTANTS.timeDivisorRate ** Math.max(0, architectSchool);
}

/** Teknik araştırma süresi (saniye): 10 × (altın+yemek) / 1.4^Akademi (o şehrin akademisi). */
export function techTimeSeconds(techId: string, level: number, academy: number): number {
  const c = techCost(techId, level);
  return (10 * (c.gold + c.food)) / ECONOMY_CONSTANTS.timeDivisorRate ** Math.max(0, academy);
}

export type TrainingTimeModel = 'area' | 'cost';

/**
 * Birim üretim süresi (saniye).
 * Model A (ONAYLANDI, §13.11.3): süre = area × 0.95^(Baraka−1). Cüce 9 sn, Kaos 11,1 saat.
 * Model B (k.java, saklı): ((altın+yemek)/10)^0.8 × 65 / 1.4^Baraka.
 * Savunma birimlerinde `sourceLevel` = Mimar Okulu, savaşçılarda Baraka.
 */
export function trainingTimeSeconds(
  unitId: string,
  sourceLevel: number,
  model: TrainingTimeModel = 'area',
): number {
  const def = UNITS_BY_ID[unitId];
  if (!def) throw new Error(`Bilinmeyen birim: ${unitId}`);
  const lvl = Math.max(1, sourceLevel);
  if (model === 'area') {
    return def.area * ECONOMY_CONSTANTS.trainTimeAreaDecay ** (lvl - 1);
  }
  const total = def.gold + def.food;
  return (
    ((total / 10) ** ECONOMY_CONSTANTS.trainTimeExponent * ECONOMY_CONSTANTS.trainTimeFactor)
    / ECONOMY_CONSTANTS.timeDivisorRate ** lvl
  );
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
