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
  /**
   * ⭐ Fark çarpanı için iki taraf**ın DONMUŞ puanı** (`rankings.score`). Motor `rankings`
   * tablosunu bilmez; sunucu sefer GÖNDERİLİRKEN okuyup görev yüküne damgalar ve buraya verir.
   * ⚠️ İkisinden biri verilmezse çarpan **1** olur — eski görevler ve simülatör için güvenli
   * varsayılan (davranış 1.2.0 ile birebir aynı kalır).
   */
  attackerScore?: number;
  defenderScore?: number;
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
  /** Uygulanan puan farkı çarpanı (rapor ve test için). Çarpan yoksa 1. */
  gapFactor: number;
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

/**
 * ⭐⭐ PUAN FARKI ÇARPANI (kullanıcı, 2026-08-14) — **yalnız AŞAĞI vururken**.
 *
 * ```
 * çarpan = 1                                          , savunan ≥ saldıran   (yukarı vuruş)
 * çarpan = 1                                          , |a − d| ≤ gapBand    (küçük hesap bandı)
 * çarpan = 1 − (oran−1)/(sınır−1) × (1 − gapMinRate)   , aksi hâlde
 * ```
 *
 * ⭐⭐ **TEK YÖNLÜ olması tasarımın özü, ihmal değil.** Kullanıcının iki hedefi ancak böyle
 * çelişmiyor: (1) *"görece puanı yüksek biri, 10 kat sınırının altındakine saldırınca daha az
 * ganimet almalı"* ve (2) *"puanını yükseltmeden yağmayla geçinen bir oyuncu mümkün olmalı"*.
 * O oyuncu parayı **yukarı vurarak** kazanıyor — 50 puanlık akıncı, 10 kat kuralı sayesinde
 * 500 puanlık zengini vurabiliyor. Çift yönlü bir çarpan tam da açmak istediğimiz stratejiyi
 * öldürürdü: akıncı hem küçük kalacak hem de vurduğu her zenginden yarım ganimet alacaktı.
 *
 * ⚠️ **Band içinde çarpan 1.** İki fakiri birbirine karşı ayrıca cezalandırmanın anlamı yok;
 * üstelik havuz eğrisi onları zaten %20'ye indiriyor. İki fren üst üste binseydi terk edilmiş
 * şehri yağmalamak %10'a düşerdi ve band'ın açtığı kapı işe yaramaz hâle gelirdi.
 *
 * ⚠️ Puanlar `max(1, …)` ile kelepçeli — saldırı kapısındaki (`mission.service.scoreGap`)
 * kelepçenin AYNISI. İki yer aynı sayıyı farklı işlerse oyuncu ekranda gördüğü orana güvenemez.
 */
export function gapFactor(
  attackerScore: number | undefined, defenderScore: number | undefined,
  cfg: LootConfig = DEFAULT_LOOT_CONFIG,
): number {
  if (attackerScore == null || defenderScore == null) return 1;
  const a = Math.max(1, attackerScore);
  const d = Math.max(1, defenderScore);
  if (d >= a) return 1;                                  // yukarı vuruş (ya da eşit)
  if (a - d <= cfg.gapBand) return 1;                    // küçük hesap bandı
  const limit = cfg.gapRatioLimit;
  if (limit <= 1) return cfg.gapMinRate;                 // sınır anlamsızsa doğrudan taban
  const t = Math.min(1, (a / d - 1) / (limit - 1));
  return 1 - t * (1 - cfg.gapMinRate);
}

export function calculateLoot(input: LootInput, cfg: LootConfig = DEFAULT_LOOT_CONFIG): LootResult {
  const empty: LootResult = {
    taken: { ...ZERO }, fromDebris: { ...ZERO }, fromPlunder: { ...ZERO },
    leftoverDebrisToDefender: { ...ZERO }, plunderNotCarried: { ...ZERO },
    effectiveRates: { gold: 0, food: 0 }, gapFactor: 1,
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

  // 2) ORAN — kaynak başına bağımsız eğri × puan farkı çarpanı × ortak jitter (0,85–1,15).
  const rng = createRng(`${input.seed}:plunder`);
  const jitterK = rng.range(cfg.jitterMin, cfg.jitterMax);
  /* ⚠️ Çarpan jitter'dan ÖNCE ve kaynaktan bağımsız: altın ile yemek aynı puan farkını görüyor,
   * farklı havuzları. Kaynak başına ayrı çarpan, aynı savaşta iki farklı "güç farkı" demekti. */
  const gapK = gapFactor(input.attackerScore, input.defenderScore, cfg);
  const rateGold = Math.min(1, plunderRate(pool.gold, cfg) * gapK * jitterK);
  const rateFood = Math.min(1, plunderRate(pool.food, cfg) * gapK * jitterK);

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
    gapFactor: gapK,
  };
}
