/**
 * ⭐ GANİMET (SİSTEM PLANI §13.10.4 — kullanıcı tanımı, 2026-07-26)
 *
 * Saldıran KAZANDIYSA iki kaynak da işler ve SIRA önemlidir:
 *   1) ENKAZ   — ölen birliklerin maliyeti × %30 (motorun `debris` çıktısı)
 *   2) YAĞMA   — şehir kasasından, KALAN taşıma kapasitesi kadar
 *                oran = %40 × min(1, kaynak/100.000)   ← yoksulluk sönümlemesi
 *
 * Kapasite yağmanın tamamına yetmiyorsa KISMİ alınır. Taşınamayan enkaz yok olmaz → savunanın
 * şehrine eklenir; taşınamayan yağma zaten şehirde kalır.
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
  /** Yağma için üretilen ama taşınamayan kısım (şehirde kalır, bilgi amaçlı). */
  plunderNotCarried: Resources;
  /** Kullanılan efektif yağma oranı (rapor için). */
  effectivePlunderRate: number;
}

const ZERO: Resources = { gold: 0, food: 0 };
const total = (r: Resources): number => r.gold + r.food;

/**
 * Bir kaynak paketinden `amount` kadarını, altın/yemek ORANINI KORUYARAK alır.
 * (Taşıma kapasitesi tek bir toplam sayıdır; kısmi alımda bölüşüm orantılıdır.)
 */
function takeProportional(pool: Resources, amount: number): Resources {
  const t = total(pool);
  if (t <= 0 || amount <= 0) return { ...ZERO };
  if (amount >= t) return { ...pool };
  const k = amount / t;
  return { gold: pool.gold * k, food: pool.food * k };
}

const sub = (a: Resources, b: Resources): Resources => ({ gold: a.gold - b.gold, food: a.food - b.food });
const add = (a: Resources, b: Resources): Resources => ({ gold: a.gold + b.gold, food: a.food + b.food });
const rounded = (r: Resources): Resources => ({ gold: Math.round(r.gold), food: Math.round(r.food) });

/** Yağma oranı: %40 × min(1, kaynak/100.000) — eşikte sıçrama yok, düzgün iniyor. */
export function plunderRate(cityTotal: number, cfg: LootConfig = DEFAULT_LOOT_CONFIG): number {
  if (cityTotal <= 0) return 0;
  return cfg.plunderRate * Math.min(1, cityTotal / cfg.povertyThreshold);
}

export function calculateLoot(input: LootInput, cfg: LootConfig = DEFAULT_LOOT_CONFIG): LootResult {
  const empty: LootResult = {
    taken: { ...ZERO }, fromDebris: { ...ZERO }, fromPlunder: { ...ZERO },
    leftoverDebrisToDefender: { ...ZERO }, plunderNotCarried: { ...ZERO },
    effectivePlunderRate: 0,
  };

  // Saldıran kaybederse hiçbir şey almaz; enkazın TAMAMI savunanın şehrine eklenir.
  if (input.winner !== 'attacker') {
    return { ...empty, leftoverDebrisToDefender: rounded(input.debris) };
  }

  const capacity = Math.max(0, input.carryCapacity);

  // 1) ÖNCE ENKAZ
  const fromDebris = takeProportional(input.debris, Math.min(capacity, total(input.debris)));
  const remainingCapacity = capacity - total(fromDebris);
  const leftoverDebris = sub(input.debris, fromDebris);

  // 2) SONRA YAĞMA — şartı sağlıyorsa
  let fromPlunder: Resources = { ...ZERO };
  let plunderNotCarried: Resources = { ...ZERO };
  let effectiveRate = 0;

  const plunderAllowed =
    cfg.condition === 'attackerWon'
    || (cfg.condition === 'undefendedBefore' && input.defendedBefore === false);

  if (plunderAllowed && remainingCapacity > 0) {
    const cityTotal = total(input.cityResources);
    const rng = createRng(`${input.seed}:plunder`);
    const jitterK = rng.range(cfg.jitterMin, cfg.jitterMax);
    effectiveRate = plunderRate(cityTotal, cfg) * jitterK;
    const plunderPool = takeProportional(input.cityResources, cityTotal * effectiveRate);
    fromPlunder = takeProportional(plunderPool, Math.min(remainingCapacity, total(plunderPool)));
    plunderNotCarried = sub(plunderPool, fromPlunder);
  }

  return {
    taken: rounded(add(fromDebris, fromPlunder)),
    fromDebris: rounded(fromDebris),
    fromPlunder: rounded(fromPlunder),
    leftoverDebrisToDefender: rounded(leftoverDebris),
    plunderNotCarried: rounded(plunderNotCarried),
    effectivePlunderRate: effectiveRate,
  };
}
