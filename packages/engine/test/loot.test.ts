/**
 * ⭐⭐ GANİMET testleri — **İKİ AYRI KAYNAK** modeli (kullanıcı tarifi, 2026-08-16).
 *
 * Kural: kapasite önce **enkaza** harcanır (oransız, %100), artan kapasiteyle savunanın
 * **kasasından** `plunderRate` kadar alınır. Taşınamayan enkaz savunanın şehrine kalır.
 *
 * ⚠️ Bu dosya 2026-08-16'da yeniden yazıldı. Önceki model `havuz = kasa + enkaz` kurup oranı
 * TOPLAMA uyguluyordu; testlerin çoğu o havuzun aritmetiğini kilitliyordu ve artık anlamsız.
 * Korunan iddialar: kaynak başına bağımsız oran · kapasitenin ortak ve orantılı olması ·
 * kaybeden saldıranın hiçbir şey alamaması · determinizm · puan farkı çarpanının tek yönlülüğü.
 */
import { describe, expect, it } from 'vitest';
import { calculateLoot, DEFAULT_LOOT_CONFIG, plunderRate } from '../src/index.ts';

const NO_JITTER = { ...DEFAULT_LOOT_CONFIG, jitterMin: 1, jitterMax: 1 };
const BIG_CAP = 10_000_000;

describe('yağma oranı eğrisi — girdi YALNIZ kasa', () => {
  it('50k ve üstünde tam %40', () => {
    expect(plunderRate(500_000)).toBeCloseTo(0.4, 10);
    expect(plunderRate(50_000)).toBeCloseTo(0.4, 10);
  });

  it('50k → 5k arası %40 → %30 DOĞRUSAL iner', () => {
    // Tam orta: 27.5k → %35
    expect(plunderRate(27_500)).toBeCloseTo(0.35, 10);
    // 20k → %30 + (15/45) × %10 ≈ %33,33
    expect(plunderRate(20_000)).toBeCloseTo(0.30 + (15_000 / 45_000) * 0.10, 10);
    // Eşiklerde sıçrama yok.
    expect(plunderRate(49_999)).toBeLessThan(0.4);
    expect(plunderRate(5_001)).toBeGreaterThan(0.30);
  });

  it('5k ve altında %30 sabit — sömürünün dibi', () => {
    expect(plunderRate(5_000)).toBeCloseTo(0.30, 10);
    expect(plunderRate(1_000)).toBeCloseTo(0.30, 10);
    expect(plunderRate(0)).toBe(0);
  });

  /** ⭐ Dört sabitin sessizce eski değerine dönmesini kilitler (kullanıcı kararı 2026-08-16). */
  it('sabitler: tavan %40 · taban %30 · eşikler 50k/5k', () => {
    expect(DEFAULT_LOOT_CONFIG.plunderRate).toBe(0.4);
    expect(DEFAULT_LOOT_CONFIG.minRate).toBe(0.30);
    expect(DEFAULT_LOOT_CONFIG.povertyThreshold).toBe(50_000);
    expect(DEFAULT_LOOT_CONFIG.floorThreshold).toBe(5_000);
  });

  /**
   * ⚠️⚠️ Rampa (%40→%30 = 10 puan) jitter'ın saçılmasından GENİŞ olmalı; değilse fakirlik
   * indirimi rastgeleliğin içinde kaybolur ve fakir şehir zengin şehirden ayırt edilemez.
   * 2026-08-16'da jitter tam bu yüzden 0,85–1,15'ten 0,92–1,08'e daraltıldı.
   */
  it('⭐⭐ jitter saçılması fakirlik rampasından DAR olmalı', () => {
    const c = DEFAULT_LOOT_CONFIG;
    const rampa = c.plunderRate - c.minRate;                       // 0,10
    const sacilma = c.plunderRate * (c.jitterMax - c.jitterMin);   // 0,40 × 0,16 = 0,064
    expect(sacilma).toBeLessThan(rampa);
  });
});

describe('⭐⭐ enkaz önce, kasa sonra', () => {
  it('kapasite bolsa enkazın TAMAMI alınır — oran uygulanmaz', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 200_000, food: 200_000 },
      cityResources: { gold: 0, food: 0 },
      carryCapacity: BIG_CAP,
      seed: 'x',
    }, NO_JITTER);

    expect(r.fromDebris).toEqual({ gold: 200_000, food: 200_000 });
    expect(r.taken).toEqual({ gold: 200_000, food: 200_000 });
    expect(r.leftoverDebrisToDefender).toEqual({ gold: 0, food: 0 });
  });

  it('enkaz ve kasa AYRI hesaplanır: enkaz %100, kasa oranıyla', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 100_000, food: 0 },
      cityResources: { gold: 300_000, food: 0 },
      carryCapacity: BIG_CAP,
      seed: 'y',
    }, NO_JITTER);

    expect(r.fromDebris.gold).toBe(100_000);        // enkazın tamamı
    expect(r.fromPlunder.gold).toBe(120_000);       // kasanın %40'ı (300k × 0,4)
    expect(r.taken.gold).toBe(220_000);
    expect(r.leftoverDebrisToDefender.gold).toBe(0);
  });

  /**
   * ⭐⭐⭐ **KULLANICI KARARININ KİLİDİ (2026-08-16).** Yük Arabası getirmeyen ordu, savaşı
   * kazansa bile kasadan pay ALAMAZ: kapasitesinin tamamı enkaza gider. *"Yük arabası
   * götürmezse zaten ganimet taşıyamamayı göze alıyor demektir."*
   */
  it('⭐⭐⭐ kapasite enkaza yetmiyorsa kasadan HİÇBİR ŞEY alınmaz', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 20_000, food: 20_000 },
      cityResources: { gold: 500_000, food: 500_000 },
      carryCapacity: 3_000,                          // enkazın çok altında
      seed: 'kargosuz',
    }, NO_JITTER);

    expect(r.taken.gold + r.taken.food).toBe(3_000); // kapasitenin tamamı
    expect(r.fromPlunder).toEqual({ gold: 0, food: 0 });
    expect(r.fromDebris.gold + r.fromDebris.food).toBe(3_000);
    // Taşınamayan enkaz savunanda kalır — 10 milyon bile olsa.
    expect(r.leftoverDebrisToDefender.gold + r.leftoverDebrisToDefender.food).toBe(37_000);
  });

  it('enkaz bittikten sonra ARTAN kapasite kasaya gider', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 10_000, food: 0 },
      cityResources: { gold: 100_000, food: 0 },
      carryCapacity: 25_000,
      seed: 'artan',
    }, NO_JITTER);

    expect(r.fromDebris.gold).toBe(10_000);          // önce enkaz
    expect(r.fromPlunder.gold).toBe(15_000);         // kalan 15k kapasite
    expect(r.taken.gold).toBe(25_000);
    // İstenen kasa payı 40k'ydı, 15k taşındı → 25k şehirde kaldı.
    expect(r.plunderNotCarried.gold).toBe(25_000);
  });

  it('kapasite altın ve yemek için ORTAK, yetmeyince orantılı kırpılır', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 0, food: 0 },
      cityResources: { gold: 200_000, food: 200_000 },
      carryCapacity: 40_000,
      seed: 'z',
    }, NO_JITTER);

    // İstenen 80k + 80k = 160k, kapasite 40k → dörtte biri, oran korunarak.
    expect(r.taken.gold).toBe(20_000);
    expect(r.taken.food).toBe(20_000);
    expect(r.plunderNotCarried.gold + r.plunderNotCarried.food).toBe(120_000);
  });

  it('kaynak başına oran BAĞIMSIZ: 500k altın %40, 20k yemek daha düşük', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 0, food: 0 },
      cityResources: { gold: 500_000, food: 20_000 },
      carryCapacity: BIG_CAP,
      seed: 'ornek',
    }, NO_JITTER);

    expect(r.taken.gold).toBe(200_000);
    expect(r.effectiveRates.gold).toBeCloseTo(0.4, 10);
    expect(r.effectiveRates.food).toBeCloseTo(plunderRate(20_000), 10);
    expect(r.taken.food).toBe(Math.round(20_000 * plunderRate(20_000)));
  });

  it('fakir şehir freni: 5k kasadan tek saldırıda en fazla %30 çıkar', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 0, food: 0 },
      cityResources: { gold: 5_000, food: 5_000 },
      carryCapacity: BIG_CAP,
      seed: 'fakir',
    }, NO_JITTER);
    expect(r.taken.gold).toBe(1_500);
    expect(r.taken.food).toBe(1_500);
  });

  /** ⚠️ Rapor tablosunun toplaması TUTMALI — oyuncu topladığında tutmayan tabloyu bildirir. */
  it('taken = fromDebris + fromPlunder (yuvarlama sonrası bile)', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const r = calculateLoot({
        winner: 'attacker',
        debris: { gold: 3_333, food: 1_111 },
        cityResources: { gold: 77_777, food: 33_333 },
        carryCapacity: 12_345,
        seed,
      });
      expect(r.taken.gold).toBe(r.fromDebris.gold + r.fromPlunder.gold);
      expect(r.taken.food).toBe(r.fromDebris.food + r.fromPlunder.food);
    }
  });
});

describe('kazanma şartı', () => {
  it('saldıran kaybederse hiçbir şey almaz; enkazın tamamı savunana', () => {
    const r = calculateLoot({
      winner: 'defender',
      debris: { gold: 30_000, food: 20_000 },
      cityResources: { gold: 500_000, food: 500_000 },
      carryCapacity: BIG_CAP,
      seed: 'kayip',
    }, NO_JITTER);
    expect(r.taken).toEqual({ gold: 0, food: 0 });
    expect(r.leftoverDebrisToDefender).toEqual({ gold: 30_000, food: 20_000 });
  });

  it('kapasite 0 (ör. Kaos ordusu): enkaz da kasa da alınmaz', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 50_000, food: 50_000 },
      cityResources: { gold: 500_000, food: 500_000 },
      carryCapacity: 0,
      seed: 'kaos',
    }, NO_JITTER);
    expect(r.taken).toEqual({ gold: 0, food: 0 });
    expect(r.leftoverDebrisToDefender).toEqual({ gold: 50_000, food: 50_000 });
  });

  it("condition: 'undefendedBefore' — savunulan şehirden ganimet yok, enkaz savunana", () => {
    const cfg = { ...NO_JITTER, condition: 'undefendedBefore' as const };
    const defended = calculateLoot({
      winner: 'attacker', debris: { gold: 1_000, food: 0 },
      cityResources: { gold: 100_000, food: 0 }, carryCapacity: BIG_CAP,
      defendedBefore: true, seed: 'c',
    }, cfg);
    expect(defended.taken).toEqual({ gold: 0, food: 0 });
    expect(defended.leftoverDebrisToDefender.gold).toBe(1_000);

    const open = calculateLoot({
      winner: 'attacker', debris: { gold: 0, food: 0 },
      cityResources: { gold: 100_000, food: 0 }, carryCapacity: BIG_CAP,
      defendedBefore: false, seed: 'c',
    }, cfg);
    expect(open.taken.gold).toBe(40_000);
  });
});

describe('jitter — yalnız KASA payına', () => {
  it('aynı seed aynı sonucu verir; farklı seed 0,92–1,08 bandında oynar', () => {
    const input = {
      winner: 'attacker' as const,
      debris: { gold: 0, food: 0 },
      cityResources: { gold: 1_000_000, food: 0 },
      carryCapacity: BIG_CAP,
    };
    const a1 = calculateLoot({ ...input, seed: 'sabit' });
    const a2 = calculateLoot({ ...input, seed: 'sabit' });
    expect(a1.taken).toEqual(a2.taken);                       // determinizm

    const base = 1_000_000 * 0.4;
    for (const seed of ['s1', 's2', 's3', 's4']) {
      const r = calculateLoot({ ...input, seed });
      expect(r.taken.gold).toBeGreaterThanOrEqual(base * 0.92 - 1);
      expect(r.taken.gold).toBeLessThanOrEqual(base * 1.08 + 1);
    }
    expect(calculateLoot({ ...input, seed: 'a' }).taken)
      .not.toEqual(calculateLoot({ ...input, seed: 'b' }).taken);
  });

  /** ⭐ Enkaz zaten %100 alınıyor; şans onu ne artırabilir ne azaltabilir. */
  it('⭐ ENKAZ jitter görmez — her tohumda birebir aynı', () => {
    const input = {
      winner: 'attacker' as const,
      debris: { gold: 40_000, food: 10_000 },
      cityResources: { gold: 0, food: 0 },
      carryCapacity: BIG_CAP,
    };
    const hepsi = ['s1', 's2', 's3', 's4'].map((seed) => calculateLoot({ ...input, seed }).taken);
    for (const t of hepsi) expect(t).toEqual({ gold: 40_000, food: 10_000 });
  });

  it('jitter oranı %100 üstüne taşıramaz (kırpılır)', () => {
    const r = calculateLoot({
      winner: 'attacker', debris: { gold: 0, food: 0 },
      cityResources: { gold: 200_000, food: 0 }, carryCapacity: BIG_CAP, seed: 'j',
    }, { ...DEFAULT_LOOT_CONFIG, plunderRate: 0.95, jitterMin: 1.15, jitterMax: 1.15 });
    expect(r.taken.gold).toBeLessThanOrEqual(200_000);
    expect(r.effectiveRates.gold).toBeLessThanOrEqual(1);
  });
});

/**
 * ⭐⭐ PUAN FARKI ÇARPANI — **10 KAT DUVARINA YAKLAŞMA FRENİ** (2026-08-14 · rampa 2026-08-16).
 *
 * Çarpanın ulaşılabilir bölgesi saldırı kapısıyla kesişimdir: kapı `oran ≥ 10 VE fark > band`
 * olduğunda saldırıyı engeller, dolayısıyla çarpan ancak **`fark > band` VE `oran < 10`**
 * bölgesinde 1'in altına inebilir. Yani ceza, duvara yaklaşmanın bedeli.
 *
 * ⚠️⚠️ İstek iki cümleydi ve ancak çarpan **tek yönlü** olursa çelişmiyor: düşük puanlı akıncı
 * parayı YUKARI vurarak kazanıyor. Çift yönlü bir çarpan tam da açmak istediğimiz stratejiyi
 * kapatırdı.
 */
describe('⭐⭐ puan farkı çarpanı', () => {
  const zengin = {
    winner: 'attacker' as const,
    debris: { gold: 0, food: 0 },
    cityResources: { gold: 200_000, food: 200_000 },
    carryCapacity: BIG_CAP,
    seed: 'gap',
  };

  it('puan verilmezse çarpan 1 — eski görevler ve simülatör aynen davranır', () => {
    const r = calculateLoot(zengin, NO_JITTER);
    expect(r.gapFactor).toBe(1);
    expect(r.effectiveRates.gold).toBeCloseTo(0.4, 10);
  });

  it('⭐ YUKARI vuruş tam oranı alır (akıncı stratejisinin can damarı)', () => {
    const r = calculateLoot({ ...zengin, attackerScore: 50, defenderScore: 499 }, NO_JITTER);
    expect(r.gapFactor).toBe(1);
    expect(r.effectiveRates.gold).toBeCloseTo(0.4, 10);
  });

  it('eşit puanda çarpan 1', () => {
    const r = calculateLoot({ ...zengin, attackerScore: 300, defenderScore: 300 }, NO_JITTER);
    expect(r.gapFactor).toBe(1);
  });

  it('⭐ küçük hesap bandı içinde çarpan 1 (arabalı akıncı 0 puanlı şehri tam oranla vurur)', () => {
    const r = calculateLoot({ ...zengin, attackerScore: 24, defenderScore: 1 }, NO_JITTER);
    expect(r.gapFactor).toBe(1);
  });

  /**
   * ⭐⭐⭐ **UÇURUM DÜZELTMESİ (2026-08-16).** Band `combat.attackScoreBand` ile paylaşılıyor ve
   * orada İKİLİ bir eşik (saldırı serbest/engelli); kenarında sıçrama doğal. Aynı eşiği SÜREKLİ
   * bir çarpana koyunca kenar uçuruma dönüşüyordu. Ulaşılabilir bölgede ölçülen en kötü hâli:
   *
   *     savunan 6 · saldıran 56 → 1,000   (fark 50, oran 9,33x — saldırı serbest)
   *     savunan 6 · saldıran 57 → 0,528   (fark 51, oran 9,50x — saldırı serbest)
   *
   * Tek puanlık artış ganimeti yarılıyordu, üstelik band'ın korumak için var olduğu bölgede.
   */
  it('⭐⭐⭐ band sınırında UÇURUM YOK — ceza rampayla giriyor', () => {
    const c = (a: number, d: number): number =>
      calculateLoot({ ...zengin, attackerScore: a, defenderScore: d }, NO_JITTER).gapFactor;

    expect(c(56, 6)).toBe(1);                  // fark 50 → tam koruma
    expect(c(57, 6)).toBeGreaterThan(0.98);    // fark 51 → ceza yeni başlıyor (eskiden 0,528)
    expect(c(56, 6) - c(57, 6)).toBeLessThan(0.02);

    // Rampa boyunca monoton azalıyor, sıçrama yok.
    let onceki = 1;
    for (let a = 56; a <= 110; a++) {
      const simdi = c(a, 6);
      expect(simdi).toBeLessThanOrEqual(onceki + 1e-9);
      expect(onceki - simdi).toBeLessThan(0.05);   // hiçbir adım uçurum değil
      onceki = simdi;
    }
  });

  it('rampanın ötesinde (2×band) davranış ESKİSİYLE aynı', () => {
    // fark ≥ 100 → karışım tamamlanır, saf oran formülü geçerli.
    const r = calculateLoot({ ...zengin, attackerScore: 1000, defenderScore: 500 }, NO_JITTER);
    const beklenen = 1 - Math.min(1, (1000 / 500 - 1) / 9) * 0.5;
    expect(r.gapFactor).toBeCloseTo(beklenen, 10);
  });

  it('⭐⭐ 10 kat sınırının dibinde çarpan tabanda: %40 → %20', () => {
    const r = calculateLoot({ ...zengin, attackerScore: 5000, defenderScore: 500 }, NO_JITTER);
    expect(r.gapFactor).toBeCloseTo(0.5, 10);
    expect(r.effectiveRates.gold).toBeCloseTo(0.2, 10);
    expect(r.taken.gold).toBe(40_000);                    // 200k × %20
  });

  it('kendi puanına yakın olana saldırmak DAHA ÇOK ganimet verir', () => {
    const yakin = calculateLoot({ ...zengin, attackerScore: 5000, defenderScore: 4000 }, NO_JITTER);
    const dip = calculateLoot({ ...zengin, attackerScore: 5000, defenderScore: 500 }, NO_JITTER);
    expect(yakin.gapFactor).toBeGreaterThan(dip.gapFactor);
    expect(yakin.taken.gold).toBeGreaterThan(dip.taken.gold);
    expect(yakin.effectiveRates.gold).toBeLessThanOrEqual(0.4);
  });

  it('sınırın ötesinde çarpan tabanın ALTINA inmez', () => {
    const r = calculateLoot({ ...zengin, attackerScore: 1_000_000, defenderScore: 1 }, NO_JITTER);
    expect(r.gapFactor).toBeCloseTo(DEFAULT_LOOT_CONFIG.gapMinRate, 10);
  });

  it('gapMinRate = 1 çarpanı tamamen kapatır (eski davranış)', () => {
    const r = calculateLoot(
      { ...zengin, attackerScore: 5000, defenderScore: 500 },
      { ...NO_JITTER, gapMinRate: 1 },
    );
    expect(r.gapFactor).toBe(1);
    expect(r.effectiveRates.gold).toBeCloseTo(0.4, 10);
  });

  /** ⚠️ Fakir şehirde iki fren üst üste binmemeli: eğri zaten %30 veriyor, band onu koruyor. */
  it('fakir şehir + band içi: oran %30\'da kalır, %15\'e düşmez', () => {
    const r = calculateLoot({
      winner: 'attacker', debris: { gold: 0, food: 0 },
      cityResources: { gold: 4_000, food: 4_000 }, carryCapacity: BIG_CAP, seed: 'fakir',
      attackerScore: 24, defenderScore: 1,
    }, NO_JITTER);
    expect(r.effectiveRates.gold).toBeCloseTo(0.3, 10);
    expect(r.taken.gold).toBe(1_200);
  });

  /** ⭐ Enkaz puan çarpanı da görmez — o, "başkasının malı" değil savaşın artığı. */
  it('⭐ ENKAZ puan çarpanından etkilenmez', () => {
    const r = calculateLoot({
      winner: 'attacker', debris: { gold: 10_000, food: 0 },
      cityResources: { gold: 0, food: 0 }, carryCapacity: BIG_CAP, seed: 'e',
      attackerScore: 5000, defenderScore: 500,
    }, NO_JITTER);
    expect(r.gapFactor).toBeCloseTo(0.5, 10);
    expect(r.taken.gold).toBe(10_000);        // çarpana rağmen enkazın tamamı
  });
});
