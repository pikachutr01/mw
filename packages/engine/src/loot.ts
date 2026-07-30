/**
 * ⭐ GANİMET — HAVUZ + KAYNAK-BAZLI ORAN modeli (kullanıcı tarifi, 2026-07-30).
 *
 * Saldıran KAZANDIYSA:
 *   1. **Havuz** kurulur (altın ve yemek AYRI AYRI): `havuz = şehir kasası + enkaz`.
 *      Enkaz motorun çıktısıdır: ölen askerler + savunma birimlerinin KALICI kayıpları
 *      (onarım %50-70 ve min-4 tabanından sonra) × maliyet × %30.
 *   2. **Oran** kaynak başına bağımsız hesaplanır (aşağıdaki `plunderRate`) ve üstüne
 *      şans çarpanı (jitter 0,85–1,15) biner — rastgelelik savaşın dokusunun parçası
 *      (kullanıcı kararı: sabit yüzdeler savaşın sonucunu etkileyen değerlere DOKUNMAZ).
 *   3. **Alınan** = `havuz × oran`, taşıma kapasitesiyle orantılı kırpılır. Kapasite yetse
 *      bile havuzun oranından fazlası ASLA alınmaz — eski "enkazın %100'ü alınır" davranışı
 *      bilinçli olarak kaldırıldı: rakip arka arkaya saldırarak kalan ganimeti aynı oranla
 *      almaya devam edebilir, tek seferde süpüremez.
 *
 * Alınan miktar kasa/enkaz bileşenlerine ORANTILI bölünür: kasa payı savaş anında savunandan
 * düşülür, enkaz payı dönüş yüküne biner. Alınmayan enkaz yok olmaz → savunanın şehrine eklenir.
 */
import { DEFAULT_LOOT_CONFIG, type LootConfig } from './config.ts';
import { createRng } from './rng.ts';

export interface Resources {
  gold: number;
  food: number;
}

export interface LootInput {
  /** Savaşın kazananı. */
  winner: 'attacker' | 'defender' | 'draw';
  /** Motorun ürettiği enkaz (iki tarafın NET ölülerinden). */
  debris: Resources;
  /** Savunan şehrin savaş anındaki kasası. */
  cityResources: Resources;
  /** Hayatta kalan saldıran birimlerin toplam taşıma kapasitesi (gece çarpanı uygulanmış). */
  carryCapacity: number;
  /** Savaş öncesi şehirde hiç savaşçı ve savunma birimi var mıydı? (`undefendedBefore` şartı için) */
  defendedBefore?: boolean;
  /** Determinizm: aynı seed → aynı yağma jitter'ı. Genelde `mission_id`. */
  seed: string | number;
}

export interface LootResult {
  /** Saldıranın dönüş görevine yüklenen toplam. */
  taken: Resources;
  /** Enkazdan alınan kısım. */
  fromDebris: Resources;
  /** Şehir kasasından alınan kısım (savunandan savaş anında düşülür). */
  fromPlunder: Resources;
  /** Taşınamayıp SAVUNANIN şehrine eklenen enkaz. */
  leftoverDebrisToDefender: Resources;
  /** Oranca alınabilecekken kapasiteye sığmayan kısım (şehirde kalır, bilgi amaçlı). */
  plunderNotCarried: Resources;
  /** Kullanılan efektif oranlar (rapor için) — kaynak başına AYRI. */
  effectiveRates: { gold: number; food: number };
}

const ZERO: Resources = { gold: 0, food: 0 };
const total = (r: Resources): number => r.gold + r.food;

const sub = (a: Resources, b: Resources): Resources => ({ gold: a.gold - b.gold, food: a.food - b.food });
const add = (a: Resources, b: Resources): Resources => ({ gold: a.gold + b.gold, food: a.food + b.food });
const rounded = (r: Resources): Resources => ({ gold: Math.round(r.gold), food: Math.round(r.food) });
const scale = (r: Resources, k: number): Resources => ({ gold: r.gold * k, food: r.food * k });

/**
 * ⭐ YAĞMA ORANI — kaynak başına AYRI hesaplanır (kullanıcı tarifi, 2026-07-30):
 *
 *   havuz ≥ 100.000            → %40 sabit
 *   5.000 < havuz < 100.000    → %40'tan %20'ye DOĞRUSAL iner
 *   havuz ≤ 5.000              → %20 sabit
 *
 * Girdi HAVUZDUR (kasa + enkaz, kullanıcı kararı): neyin yüzdesi alınıyorsa freni de o
 * belirler. Örnek: 500k altın → %40 · 60k yemek → %31,6 · 5k → %20.
 *
 * ⭐ TABAN %5 → %20 (kullanıcı, 2026-07-31): fakirleşen şehir hâlâ daha küçük oranla
 * soyulur ama sömürünün dibi çok daha yukarıda kapanıyor — fakir şehri vurmak "kârsız"
 * değil "daha az kârlı". Tavan (%40) ve eşikler (100k/5k) DEĞİŞMEDİ, yani orta ve geç
 * oyun dengesi aynı kaldı; değişim yalnız erken oyunu ve yağmalanmış şehirleri etkiler.
 */
export function plunderRate(poolAmount: number, cfg: LootConfig = DEFAULT_LOOT_CONFIG): number {
  if (poolAmount <= 0) return 0;
  if (poolAmount >= cfg.povertyThreshold) return cfg.plunderRate;
  if (poolAmount <= cfg.floorThreshold) return cfg.minRate;
  const t = (poolAmount - cfg.floorThreshold) / (cfg.povertyThreshold - cfg.floorThreshold);
  return cfg.minRate + t * (cfg.plunderRate - cfg.minRate);
}

export function calculateLoot(input: LootInput, cfg: LootConfig = DEFAULT_LOOT_CONFIG): LootResult {
  const empty: LootResult = {
    taken: { ...ZERO }, fromDebris: { ...ZERO }, fromPlunder: { ...ZERO },
    leftoverDebrisToDefender: { ...ZERO }, plunderNotCarried: { ...ZERO },
    effectiveRates: { gold: 0, food: 0 },
  };

  // Saldıran kaybederse hiçbir şey almaz; enkazın TAMAMI savunanın şehrine eklenir.
  if (input.winner !== 'attacker') {
    return { ...empty, leftoverDebrisToDefender: rounded(input.debris) };
  }

  const lootAllowed =
    cfg.condition === 'attackerWon'
    || (cfg.condition === 'undefendedBefore' && input.defendedBefore === false);
  if (!lootAllowed) {
    return { ...empty, leftoverDebrisToDefender: rounded(input.debris) };
  }

  // 1) HAVUZ — kaynak başına: kasa + enkaz.
  const pool: Resources = add(input.cityResources, input.debris);

  // 2) ORAN — kaynak başına bağımsız eğri × ortak jitter (0,85–1,15, seed'e bağlı).
  const rng = createRng(`${input.seed}:plunder`);
  const jitterK = rng.range(cfg.jitterMin, cfg.jitterMax);
  const rateGold = Math.min(1, plunderRate(pool.gold, cfg) * jitterK);
  const rateFood = Math.min(1, plunderRate(pool.food, cfg) * jitterK);

  // 3) ALINAN = havuz × oran, kapasiteyle orantılı kırpılır.
  const desired: Resources = { gold: pool.gold * rateGold, food: pool.food * rateFood };
  const capacity = Math.max(0, input.carryCapacity);
  const carryK = total(desired) > 0 ? Math.min(1, capacity / total(desired)) : 0;
  const taken = scale(desired, carryK);
  const notCarried = sub(desired, taken);

  /* Alınan, kasa/enkaz bileşenlerine ORANTILI bölünür (kaynak başına): kasa payı savaş
   * anında `trySpend` ile düşülecek, enkaz payı dönüş yüküne binecek. */
  const debrisShareG = pool.gold > 0 ? input.debris.gold / pool.gold : 0;
  const debrisShareF = pool.food > 0 ? input.debris.food / pool.food : 0;
  const fromDebris: Resources = { gold: taken.gold * debrisShareG, food: taken.food * debrisShareF };
  const fromPlunder = sub(taken, fromDebris);

  // Alınmayan enkaz savunanın şehrine eklenir (yok olmaz).
  const leftoverDebris = sub(input.debris, fromDebris);

  return {
    taken: rounded(taken),
    fromDebris: rounded(fromDebris),
    fromPlunder: rounded(fromPlunder),
    leftoverDebrisToDefender: rounded(leftoverDebris),
    plunderNotCarried: rounded(notCarried),
    effectiveRates: { gold: rateGold, food: rateFood },
  };
}
