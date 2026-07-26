/**
 * ⭐ GANİMET testleri (SİSTEM PLANI §13.10.4).
 * Kural: önce enkaz, kalan taşıma kapasitesiyle şehirden yağma; kapasite yetmezse kısmi.
 */
import { describe, expect, it } from 'vitest';
import { calculateLoot, DEFAULT_LOOT_CONFIG, plunderRate } from '../src/index.ts';

const NO_JITTER = { ...DEFAULT_LOOT_CONFIG, jitterMin: 1, jitterMax: 1 };

describe('yağma oranı (yoksulluk sönümlemesi)', () => {
  it('100k ve üstünde tam %40', () => {
    expect(plunderRate(500_000)).toBeCloseTo(0.4, 10);
    expect(plunderRate(100_000)).toBeCloseTo(0.4, 10);
  });

  it('100k altında oransal olarak düşer — eşikte sıçrama yok', () => {
    expect(plunderRate(50_000)).toBeCloseTo(0.2, 10);   // alınan 10.000 = %20
    expect(plunderRate(10_000)).toBeCloseTo(0.04, 10);  // alınan 400 = %4
    expect(plunderRate(1_000)).toBeCloseTo(0.004, 10);  // alınan 4 = %0,4
  });
});

describe('ganimet önceliği', () => {
  it('plandaki örnek: kapasite 60k · enkaz 20k · şehir 300k → 20k enkaz + 40k yağma', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 10_000, food: 10_000 },
      cityResources: { gold: 150_000, food: 150_000 },
      carryCapacity: 60_000,
      seed: 'ornek',
    }, NO_JITTER);

    expect(r.fromDebris.gold + r.fromDebris.food).toBe(20_000);
    expect(r.fromPlunder.gold + r.fromPlunder.food).toBe(40_000);
    expect(r.taken.gold + r.taken.food).toBe(60_000);
    // yağma havuzu 120k üretildi, 40k taşındı → 80k şehirde kaldı
    expect(r.plunderNotCarried.gold + r.plunderNotCarried.food).toBe(80_000);
  });

  it('kapasite yağmanın tamamına yetmezse KISMİ alınır', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 0, food: 0 },
      cityResources: { gold: 100_000, food: 0 },
      carryCapacity: 10_000,      // %40 = 40.000 ama yalnız %10 taşınabiliyor
      seed: 'kismi',
    }, NO_JITTER);

    expect(r.fromPlunder.gold).toBe(10_000);
    expect(r.plunderNotCarried.gold).toBe(30_000);
  });

  it('kısmi alımda altın/yemek ORANI korunur', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 0, food: 0 },
      cityResources: { gold: 200_000, food: 100_000 },   // 2:1
      carryCapacity: 30_000,
      seed: 'oran',
    }, NO_JITTER);

    expect(r.fromPlunder.gold).toBe(20_000);
    expect(r.fromPlunder.food).toBe(10_000);
  });

  it('taşınamayan enkaz yok olmaz → savunanın şehrine eklenir', () => {
    const r = calculateLoot({
      winner: 'attacker',
      debris: { gold: 50_000, food: 50_000 },
      cityResources: { gold: 0, food: 0 },
      carryCapacity: 40_000,
      seed: 'artan',
    }, NO_JITTER);

    expect(r.fromDebris.gold + r.fromDebris.food).toBe(40_000);
    expect(r.leftoverDebrisToDefender.gold + r.leftoverDebrisToDefender.food).toBe(60_000);
  });

  it('saldıran kaybederse hiçbir şey almaz, enkazın tamamı savunana kalır', () => {
    const r = calculateLoot({
      winner: 'defender',
      debris: { gold: 30_000, food: 20_000 },
      cityResources: { gold: 500_000, food: 500_000 },
      carryCapacity: 999_999,
      seed: 'kayip',
    }, NO_JITTER);

    expect(r.taken).toEqual({ gold: 0, food: 0 });
    expect(r.leftoverDebrisToDefender).toEqual({ gold: 30_000, food: 20_000 });
  });

  it('condition="undefendedBefore" eski davranışı geri getirir', () => {
    const cfg = { ...NO_JITTER, condition: 'undefendedBefore' as const };
    const defended = calculateLoot({
      winner: 'attacker', debris: { gold: 0, food: 0 },
      cityResources: { gold: 200_000, food: 0 }, carryCapacity: 100_000,
      defendedBefore: true, seed: 's',
    }, cfg);
    expect(defended.fromPlunder.gold).toBe(0);

    const undefended = calculateLoot({
      winner: 'attacker', debris: { gold: 0, food: 0 },
      cityResources: { gold: 200_000, food: 0 }, carryCapacity: 100_000,
      defendedBefore: false, seed: 's',
    }, cfg);
    expect(undefended.fromPlunder.gold).toBe(80_000);
  });

  it('aynı seed → aynı ganimet (jitter dahil)', () => {
    const args = {
      winner: 'attacker' as const,
      debris: { gold: 1_000, food: 1_000 },
      cityResources: { gold: 400_000, food: 100_000 },
      carryCapacity: 500_000,
      seed: 'mission-4711',
    };
    expect(calculateLoot(args)).toEqual(calculateLoot(args));
    expect(calculateLoot(args).taken).not.toEqual(calculateLoot({ ...args, seed: 'mission-4712' }).taken);
  });
});
