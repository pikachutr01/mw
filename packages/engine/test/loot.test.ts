/**
 * ⭐ GANİMET testleri — HAVUZ + KAYNAK-BAZLI ORAN modeli (kullanıcı tarifi, 2026-07-30).
 *
 * Kural: havuz = kasa + enkaz (kaynak başına AYRI) · oran %40 sabit (≥100k), 100k→5k arası
 * %40→%20 doğrusal, ≤5k'da %20 sabit · alınan = havuz × oran, kapasiteyle kırpılır. Kapasite
 * yetse bile orandan fazlası alınmaz — rakip ancak arka arkaya saldırarak süpürebilir.
 *
 * ⭐ Taban %5 → %20 (kullanıcı, 2026-07-31). Tavan ve eşikler değişmediği için havuzu
 * ≥100k olan testlerin sayıları AYNEN geçerli — yalnız taban koluna giren senaryolar güncellendi.
 */
import { describe, expect, it } from 'vitest';
import { calculateLoot, DEFAULT_LOOT_CONFIG, plunderRate } from '../src/index.ts';

const NO_JITTER = { ...DEFAULT_LOOT_CONFIG, jitterMin: 1, jitterMax: 1 };
const BIG_CAP = 10_000_000;

describe('yağma oranı eğrisi (kaynak başına)', () => {
  it('100k ve üstünde tam %40', () => {
    expect(plunderRate(500_000)).toBeCloseTo(0.4, 10);
    expect(plunderRate(100_000)).toBeCloseTo(0.4, 10);
  });

  it('100k → 5k arası %40 → %20 DOĞRUSAL iner', () => {
    // 60k yemek → %20 + (55/95) × %20 ≈ %31,6
    expect(plunderRate(60_000)).toBeCloseTo(0.20 + (55_000 / 95_000) * 0.20, 10);
    // Tam orta: 52.5k → %30
    expect(plunderRate(52_500)).toBeCloseTo(0.30, 10);
    // Eşiklerde sıçrama yok.
    expect(plunderRate(99_999)).toBeLessThan(0.4);
    expect(plunderRate(5_001)).toBeGreaterThan(0.20);
  });

  it('5k ve altında %20 sabit — sömürünün dibi', () => {
    expect(plunderRate(5_000)).toBeCloseTo(0.20, 10);
    expect(plunderRate(1_000)).toBeCloseTo(0.20, 10);
    expect(plunderRate(0)).toBe(0);
  });

  /** ⭐ Taban sabitinin sessizce eski değerine dönmesini kilitler (kullanıcı kararı 2026-07-31). */
  it('taban oran sabiti %20 (kullanıcı kararı)', () => {
    expect(DEFAULT_LOOT_CONFIG.minRate).toBe(0.20);
    expect(DEFAULT_LOOT_CONFIG.plunderRate).toBe(0.4);      // tavan DEĞİŞMEDİ
    expect(DEFAULT_LOOT_CONFIG.povertyThreshold).toBe(100_000);
    expect(DEFAULT_LOOT_CONFIG.floorThreshold).toBe(5_000);
  });
});

describe('havuz modeli', () => {
  it('kullanıcının örneği: 500k altın %40, 60k yemek düşük oranla — BAĞIMSIZ hesap', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 0, food: 0 },
      cityResources: { gold: 500_000, food: 60_000 },
      carryCapacity: BIG_CAP,
      seed: 'ornek',
    }, NO_JITTER);

    expect(r.taken.gold).toBe(200_000);                       // 500k × %40
    const foodRate = plunderRate(60_000);
    expect(r.taken.food).toBe(Math.round(60_000 * foodRate)); // ~%31,6
    expect(r.effectiveRates.gold).toBeCloseTo(0.4, 10);
    expect(r.effectiveRates.food).toBeCloseTo(foodRate, 10);
  });

  it('enkaz havuza girer: kapasite yetse bile enkazın yalnız ORANI alınır', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 200_000, food: 200_000 },
      cityResources: { gold: 0, food: 0 },
      carryCapacity: BIG_CAP,
      seed: 'x',
    }, NO_JITTER);

    // Eski model enkazın %100'ünü alırdı; yeni modelde havuzun %40'ı.
    expect(r.taken.gold).toBe(80_000);
    expect(r.taken.food).toBe(80_000);
    // Alınmayan enkaz savunanın şehrine döner.
    expect(r.leftoverDebrisToDefender.gold).toBe(120_000);
    expect(r.leftoverDebrisToDefender.food).toBe(120_000);
  });

  it('alınan, kasa/enkaz bileşenlerine ORANTILI bölünür', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 100_000, food: 0 },
      cityResources: { gold: 300_000, food: 0 },
      carryCapacity: BIG_CAP,
      seed: 'y',
    }, NO_JITTER);

    // Havuz 400k → alınan 160k; enkaz payı 1/4 → 40k, kasa payı 120k.
    expect(r.taken.gold).toBe(160_000);
    expect(r.fromDebris.gold).toBe(40_000);
    expect(r.fromPlunder.gold).toBe(120_000);
    expect(r.leftoverDebrisToDefender.gold).toBe(60_000);
  });

  it('kapasite yetmezse orantılı kırpılır; alınamayan miktar bilgi olarak raporlanır', () => {
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

  it('fakir şehir freni: 5k havuzdan tek saldırıda en fazla %20 çıkar', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 0, food: 0 },
      cityResources: { gold: 5_000, food: 5_000 },
      carryCapacity: BIG_CAP,
      seed: 'fakir',
    }, NO_JITTER);
    expect(r.taken.gold).toBe(1_000);
    expect(r.taken.food).toBe(1_000);
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

describe('jitter (kullanıcı kararı: rastgelelik KALIR)', () => {
  it('aynı seed aynı sonucu verir; farklı seed 0,85–1,15 bandında oynar', () => {
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
      expect(r.taken.gold).toBeGreaterThanOrEqual(base * 0.85 - 1);
      expect(r.taken.gold).toBeLessThanOrEqual(base * 1.15 + 1);
    }
    expect(calculateLoot({ ...input, seed: 'a' }).taken)
      .not.toEqual(calculateLoot({ ...input, seed: 'b' }).taken);
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
