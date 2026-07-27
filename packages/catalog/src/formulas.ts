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
  /** savaşçı süresi: ((gold+food)/10)^0.8 × 65 / 1.4^Baraka */
  trainTimeExponent: 0.8,
  trainTimeFactor: 65,
  /** ⛔ EMEKLİ — Model A: süre(sn) = area × 0.95^(Baraka−1). Yalnız denge düğmesi olarak duruyor. */
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

/**
 * ⭐ ORTAK SÜRE KURALI: `10 × (altın+yemek) / 1,4^(ilgili yapı seviyesi)`.
 *
 * `k.java`'nın tek süre fonksiyonunda (`k.a(String, h)`) yapı · teknik · savunma birimi ve
 * Sur/Büyü Kalkanı dallarının HEPSİ bunu kullanıyor; yalnız bölen yapı değişiyor
 * (Mimar Okulu / Akademi). Bu yüzden formül tek yerde: dört yerde ayrı yazılsaydı biri
 * güncellenip diğerleri unutulurdu.
 *
 * 🎯 **Doğrulama (2026-07-27):** `images/mobil.png` (2015) Muhafız = 2400 altın + 2000 yemek,
 * süre **3:22**. `10×4400 / 1,4^16 = 202,02 sn = 3:22` — Mimar Okulu 16'da birebir. Aynı ekran
 * yarım maliyetle çözülseydi Mimar Okulu 13,94 çıkardı (tam sayı değil) → binary maliyet tablosu
 * ile bu süre formülü AYNI oyun sürümünde yaşamış.
 */
export function timeFromCost(cost: Cost, divisorLevel: number): number {
  return (10 * (cost.gold + cost.food)) / ECONOMY_CONSTANTS.timeDivisorRate ** Math.max(0, divisorLevel);
}

/** Yapı inşa süresi (saniye): 10 × (altın+yemek) / 1.4^MimarOkulu. Mimar Okulu kendisi: /1.2^sv. */
export function buildingTimeSeconds(buildingId: string, level: number, architectSchool: number): number {
  const c = buildingCost(buildingId, level);
  if (buildingId === 'architect_school') {
    // Kendi kendini hızlandıramaz; kendi eğrisi daha yumuşak (1,2) ve 10× çarpanı yok.
    return (c.gold + c.food) / ECONOMY_CONSTANTS.architectSelfRate ** level;
  }
  return timeFromCost(c, architectSchool);
}

/** Teknik araştırma süresi (saniye): 10 × (altın+yemek) / 1.4^Akademi (o şehrin akademisi). */
export function techTimeSeconds(techId: string, level: number, academy: number): number {
  return timeFromCost(techCost(techId, level), academy);
}

export type TrainingTimeModel = 'area' | 'cost';

/**
 * ⭐ BİRİM ÜRETİM SÜRESİ (saniye) — **Model B, kullanıcı onayı 2026-07-27**.
 *
 * İki ayrı dal, ikisi de `k.java`'nın kendi kodundan:
 *  - **Savaşçı** (kategori `B`, bölen **Baraka**): `((altın+yemek)/10)^0,8 × 65 / 1,4^Baraka`
 *  - **Savunma birimi** (kategori `S`, bölen **Mimar Okulu**): `10 × (altın+yemek) / 1,4^MimarOkulu`
 *
 * 🎯 Neden Model A (süre = Alan × 0,95^(Baraka−1)) **elendi**:
 *  1. *Yapısal olarak yanlış:* süre alanla orantılı olsaydı `süre/alan` sabit çıkardı; oysa aynı
 *     hesabın beş biriminde 0,36 ile 0,83 arasında **2,3 kat** değişiyor.
 *  2. *0,95 oranı hiçbir kaynakta yok* — tahmindi. Model B'nin 1,4'ü ise yapı ve teknik
 *     sürelerinde zaten kullandığımız, decompile edilmiş sabitin ta kendisi.
 *  3. *Muhafız kanıtı:* bkz. `timeFromCost` — savunma dalı 2015 ekran görüntüsünde sıfır sapmayla
 *     tutuyor ve o ekrandaki maliyetler bizim binary tablomuzla aynı.
 *
 * ⚠️ `Math.floor((altın+yemek)/10)`: `k.java` bunu **tam sayı bölmesi** ile yapıyor (long/long).
 * Kesirli bırakırsak ucuz birimlerde saniyeler kayar; orijinalin sayısını üretmek için aynen taklit.
 *
 * `model: 'area'` yalnız eski Model A'yı geri getirmek isteyen denge düğmesi olarak duruyor.
 */
export function trainingTimeSeconds(
  unitId: string,
  sourceLevel: number,
  model: TrainingTimeModel = 'cost',
): number {
  const def = UNITS_BY_ID[unitId];
  if (!def) throw new Error(`Bilinmeyen birim: ${unitId}`);
  const lvl = Math.max(0, sourceLevel);
  if (model === 'area') {
    return def.area * ECONOMY_CONSTANTS.trainTimeAreaDecay ** (Math.max(1, lvl) - 1);
  }
  if (def.kind === 'defense') {
    // Savunma birimi maliyeti SABİT (Sur/Büyü Kalkanı hariç — onların seviyeli maliyeti
    // çağıran tarafta hesaplanıp `timeFromCost`'a verilir).
    return timeFromCost({ gold: def.gold, food: def.food }, lvl);
  }
  const tenths = Math.floor((def.gold + def.food) / 10);
  return (
    (tenths ** ECONOMY_CONSTANTS.trainTimeExponent * ECONOMY_CONSTANTS.trainTimeFactor)
    / ECONOMY_CONSTANTS.timeDivisorRate ** lvl
  );
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
