/**
 * ⭐⭐ GANİMET — **İKİ AYRI KAYNAK** modeli (kullanıcı tarifi, 2026-08-16).
 *
 * Saldıran KAZANDIYSA, taşıma kapasitesi sırayla iki şeye harcanır:
 *
 *   1. **ENKAZ — önce ve %100.** Savaşta ölen birimlerin bıraktığı değer (`combat.ts` · `debris`)
 *      oran uygulanmadan, kapasite yettiği kadar alınır. Taşınamayan kısım savunanın şehrine
 *      eklenir — yani yok olmaz, savaş alanında kalır ve şehrin sahibine yazılır.
 *   2. **KASA — artan kapasiteyle.** Enkazdan geriye kapasite kaldıysa savunanın kasasından
 *      `plunderRate` oranı kadar alınır. Oran kaynak başına AYRI hesaplanır ve üstüne puan
 *      farkı çarpanı ile şans çarpanı biner.
 *
 * ⚠️⚠️ **ORTAK HAVUZ KALDIRILDI (2026-08-16).** Önceki model `havuz = kasa + enkaz` kurup oranı
 * TOPLAMA uyguluyordu. İki sorunu vardı: (a) enkaz, kasanın oranını yukarı çekiyordu — ölü
 * asker sayısı zengin şehir etkisi yaratıyordu; (b) savaşın ÜRETTİĞİ değer ile şehrin BİRİKMİŞ
 * değeri aynı kaba giriyordu, oysa ikisi kavramsal olarak ayrı: enkaz galibin hakkı, kasa
 * ise soygun. Ayrıştırınca ikisi de kendi kuralıyla yönetilebiliyor.
 *
 * ⚠️ **KAPASİTE SIRASI BİLİNÇLİ: önce enkaz.** Sonucu şu: Yük Arabası getirmeyen ordu, savaşı
 * ezici biçimde kazansa bile kasadan pay ALAMAZ — kapasitesinin tamamı enkaza gider. Kullanıcı
 * kararı (2026-08-16): *"yük arabası götürmezse zaten ganimet taşıyamamayı göze alıyor
 * demektir; isterse 10 milyon ganimet oluşsun, savunanın şehrine kalır."* Yani bu bir yan etki
 * değil, tasarımın kendisi: yağma bir lojistik kararı.
 *
 * ⚠️ Enkaza **oran, jitter ve puan çarpanı UYGULANMAZ**. Üçü de "başkasının birikmiş malından
 * ne kadarını çalabilirsin" sorusunun frenleri; enkaz çalınan bir şey değil, savaşın kendi
 * ürettiği artık. Frenleri oraya da bağlamak iki farklı şeyi tek kurala tabi tutmak olurdu.
 *
 * ⚠️ **«Tek seferde süpürme» freni KASADA duruyor** (eski modelin ana gerekçesiydi): kasadan
 * tek saldırıda en çok `plunderRate` kadar çıkar, rakip arka arkaya saldırmak zorunda kalır.
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
  /** Hayatta kalan saldıran birimlerin toplam taşıma kapasitesi. */
  carryCapacity: number;
  /** Savaş öncesi şehirde hiç savaşçı ve savunma birimi var mıydı? (`undefendedBefore` şartı için) */
  defendedBefore?: boolean;
  /**
   * ⭐ Fark çarpanı için iki taraf**ın DONMUŞ puanı** (`rankings.score`). Motor `rankings`
   * tablosunu bilmez; sunucu sefer GÖNDERİLİRKEN okuyup görev yüküne damgalar ve buraya verir.
   * ⚠️ İkisinden biri verilmezse çarpan **1** olur — eski görevler ve simülatör için güvenli
   * varsayılan.
   */
  attackerScore?: number;
  defenderScore?: number;
  /** Determinizm: aynı seed → aynı yağma jitter'ı. Genelde `mission_id`. */
  seed: string | number;
}

export interface LootResult {
  /** Saldıranın dönüş görevine yüklenen toplam (enkaz payı + kasa payı). */
  taken: Resources;
  /** Enkazdan alınan kısım — kimsenin kasasından düşmez. */
  fromDebris: Resources;
  /** Şehir kasasından alınan kısım (savunandan savaş anında düşülür). */
  fromPlunder: Resources;
  /** Kapasiteye sığmayıp SAVUNANIN şehrine eklenen enkaz. */
  leftoverDebrisToDefender: Resources;
  /** Oranca alınabilecekken kapasiteye sığmayan KASA payı (şehirde kalır, bilgi amaçlı). */
  plunderNotCarried: Resources;
  /** Kasaya uygulanan efektif oranlar (rapor için) — kaynak başına AYRI. */
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
 * ⭐ YAĞMA ORANI — **savunanın KASASINA** uygulanır, kaynak başına ayrı:
 *
 *   kasa ≥ 50.000           → %40 sabit
 *   5.000 < kasa < 50.000   → %40'tan %30'a DOĞRUSAL iner
 *   kasa ≤ 5.000            → %30 sabit
 *
 * ⚠️ **GİRDİ 2026-08-16'da DEĞİŞTİ: artık havuz değil, YALNIZ KASA.** Eskiden `kasa + enkaz`
 * giriyordu ve büyük bir savaşın enkazı fakir bir şehri "zengin" gösterip oranı yukarı
 * çekiyordu. Enkaz ayrı yönetildiği için (bkz. dosya başlığı) bu girdi artık saf.
 *
 * ⚠️ Eşikler ve taban aynı turda güncellendi: tavan eşiği 100k → **50k**, taban %20 → **%30**.
 * Girdi küçüldüğü için (havuz yerine kasa) eşiği de düşürmek gerekiyordu; yoksa aynı şehir
 * eskisinden düşük oran görürdü. Net etki ölçüldü: her kasa büyüklüğünde oran biraz YUKARI.
 *
 * ⚠️⚠️ **RAMPA ARTIK JİTTER'DAN GENİŞ OLMAK ZORUNDA.** %40→%30 rampası 10 puan; jitter eski
 * hâliyle (0,85–1,15) %40'ta ±6 puan, yani toplam 12 puan saçıyordu — rastgelelik fakirlik
 * korumasının TAMAMINDAN genişti ve rampa ölçülemez hâle geliyordu. Bu yüzden jitter aynı
 * turda 0,92–1,08'e daraltıldı (±3 puan). İkisinden biri değişirse ötekini de gözden geçir.
 */
export function plunderRate(cityAmount: number, cfg: LootConfig = DEFAULT_LOOT_CONFIG): number {
  if (cityAmount <= 0) return 0;
  if (cityAmount >= cfg.povertyThreshold) return cfg.plunderRate;
  if (cityAmount <= cfg.floorThreshold) return cfg.minRate;
  const t = (cityAmount - cfg.floorThreshold) / (cfg.povertyThreshold - cfg.floorThreshold);
  return cfg.minRate + t * (cfg.plunderRate - cfg.minRate);
}

/**
 * ⭐⭐ PUAN FARKI ÇARPANI (kullanıcı, 2026-08-14 · rampa 2026-08-16) — **yalnız AŞAĞI vururken**.
 *
 * ⭐ **NE İŞE YARADIĞI 2026-08-16'da netleşti: bu, 10 KAT DUVARINA YAKLAŞMA FRENİ.**
 * Çarpanın ulaşılabilir bölgesi saldırı kapısıyla (`mission.service.scoreGap`) kesişimdir:
 * kapı `oran ≥ 10 VE fark > band` olduğunda saldırıyı ENGELLER. Dolayısıyla çarpanın 1'den
 * küçük olabildiği tek bölge **`fark > band` VE `oran < 10`**. Yani:
 *
 *   oran 1'e yakın  → çarpan ≈ 1      (ceza yok)
 *   oran 10'a yakın → çarpan → 0,5    (yarı ganimet)
 *   oran ≥ 10       → savaş zaten YOK
 *
 * Ölçüldü: yüksek puanlarda ceza pratikte sıfır (1000 vs 949 → 0,997; 20.000 vs 19.949 → 1,000),
 * çünkü orada 50 puanlık bir fark oranı 1'den ayırmaya yetmiyor. *"Yüksek puanlı oyuncu az
 * ganimet alır"* endişesi bu yüzden karşılıksızdı — freni kuran band değil, oranın kendisi.
 *
 * ⭐⭐ **BAND ARTIK DUVAR DEĞİL RAMPA (2026-08-16).**
 *
 * ⚠️ Band `combat.attackScoreBand` ile PAYLAŞILIYOR ve orada **ikili** bir eşik: saldırı ya
 * serbest ya engelli, kenarında sıçrama olması doğal. Aynı eşiği SÜREKLİ bir çarpana koyunca
 * kenar bir uçuruma dönüşüyordu. Ulaşılabilir bölgede ölçülen en kötü hâli:
 *
 *     savunan 6 · saldıran 56 → çarpan 1,000   (fark 50, oran 9,33x — serbest)
 *     savunan 6 · saldıran 57 → çarpan 0,528   (fark 51, oran 9,50x — serbest)
 *
 * Tek puanlık artış ganimeti yarılıyordu, üstelik tam da band'ın korumak için var olduğu
 * yeni-oyuncu bölgesinde. Rampa cezayı `band` ile `2×band` arasında devreye sokuyor:
 * fark 50'de hâlâ tam koruma, fark 51'de 0,994, fark 100'den sonra eski formülün aynısı.
 *
 * ⚠️ Rampa yalnız GİRİŞİ yumuşatıyor — `2×band`ın ötesinde davranış **bit-bit eskisiyle aynı**.
 *
 * ⚠️ Puanlar `max(1, …)` ile kelepçeli — saldırı kapısındaki kelepçenin AYNISI. İki yer aynı
 * sayıyı farklı işlerse oyuncu ekranda gördüğü orana güvenemez.
 */
export function gapFactor(
  attackerScore: number | undefined, defenderScore: number | undefined,
  cfg: LootConfig = DEFAULT_LOOT_CONFIG,
): number {
  if (attackerScore == null || defenderScore == null) return 1;
  const a = Math.max(1, attackerScore);
  const d = Math.max(1, defenderScore);
  if (d >= a) return 1;                                  // yukarı vuruş (ya da eşit)

  const diff = a - d;
  if (diff <= cfg.gapBand) return 1;                     // küçük hesap bandı — tam koruma

  const limit = cfg.gapRatioLimit;
  const full = limit <= 1
    ? cfg.gapMinRate                                     // sınır anlamsızsa doğrudan taban
    : 1 - Math.min(1, (a / d - 1) / (limit - 1)) * (1 - cfg.gapMinRate);

  /* ⭐ Rampa: band'ın hemen dışında ceza SIFIRDAN başlar, 2×band'da tam devreye girer.
   * `gapBand = 0` yazılırsa (kural kapatılmak istenirse) bölme yapılmaz, ceza tam uygulanır. */
  if (cfg.gapBand <= 0) return full;
  const blend = Math.min(1, (diff - cfg.gapBand) / cfg.gapBand);
  return 1 - blend * (1 - full);
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

  const capacity = Math.max(0, input.carryCapacity);

  /* ── 1) ENKAZ — önce ve %100, kapasite yettiği kadar ────────────────────────
   * Kapasite altın/yemek için ORTAK; yetmediğinde ikisi orantılı kırpılır (oyuncu
   * "yalnız altını getir" diyemez — sefer emrinde böyle bir tercih yok). */
  const debrisTotal = total(input.debris);
  const debrisK = debrisTotal > 0 ? Math.min(1, capacity / debrisTotal) : 0;
  const fromDebris = scale(input.debris, debrisK);
  const leftoverDebris = sub(input.debris, fromDebris);

  /* ── 2) KASA — enkazdan ARTAN kapasiteyle ─────────────────────────────────── */
  const restCapacity = Math.max(0, capacity - total(fromDebris));

  const rng = createRng(`${input.seed}:plunder`);
  const jitterK = rng.range(cfg.jitterMin, cfg.jitterMax);
  /* ⚠️ Çarpan jitter'dan ÖNCE ve kaynaktan bağımsız: altın ile yemek aynı puan farkını görüyor,
   * farklı kasa büyüklüklerini. Kaynak başına ayrı çarpan, aynı savaşta iki farklı "güç farkı"
   * demekti. Jitter de ortak: tek bir "şans" rulosu, iki kaynağa aynı biçimde biniyor. */
  const gapK = gapFactor(input.attackerScore, input.defenderScore, cfg);
  const rateGold = Math.min(1, plunderRate(input.cityResources.gold, cfg) * gapK * jitterK);
  const rateFood = Math.min(1, plunderRate(input.cityResources.food, cfg) * gapK * jitterK);

  const desired: Resources = {
    gold: input.cityResources.gold * rateGold,
    food: input.cityResources.food * rateFood,
  };
  const plunderK = total(desired) > 0 ? Math.min(1, restCapacity / total(desired)) : 0;
  const fromPlunder = scale(desired, plunderK);
  const notCarried = sub(desired, fromPlunder);

  /* ⚠️ `taken` YUVARLANMIŞ parçaların toplamı — `rounded(fromDebris + fromPlunder)` DEĞİL.
   * İkincisi ±1 fark üretebiliyordu ve rapor "enkaz + kasa ≠ taşınan" gösteriyordu. Oyuncunun
   * topladığında tutmayan bir tabloyu görmesi, 1 birimlik hatadan çok daha pahalı. */
  const dRounded = rounded(fromDebris);
  const pRounded = rounded(fromPlunder);

  return {
    taken: add(dRounded, pRounded),
    fromDebris: dRounded,
    fromPlunder: pRounded,
    leftoverDebrisToDefender: rounded(leftoverDebris),
    plunderNotCarried: rounded(notCarried),
    effectiveRates: { gold: rateGold, food: rateFood },
    gapFactor: gapK,
  };
}
