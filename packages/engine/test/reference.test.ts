/**
 * Referans savaş + determinizm testleri.
 *
 * Senaryo `savas_testleri.txt`'ten (orijinal binary simülatörün çıktısıyla karşılaştırıldı).
 * Binary: saldıran kazanır · 5 tur · saldıran 1595-1646 kaybeder · savunan 4050-4114 kaybeder.
 * v0.6 JS motoru: kazanan ✓ · tur ✓ · atk 1963-2028 · def 3879-3964 (bilinçli sapmalar, §v0.6).
 * Bu test motorun O DAVRANIŞTA kalmasını korur — birebir binary eşleşmesi HEDEF DEĞİL.
 */
import { describe, expect, it } from 'vitest';
import { simulate } from '../src/index.ts';
import type { SimulateInput } from '../src/types.ts';

const REFERENCE: SimulateInput = {
  seed: 'reference-battle',
  attacker: {
    counts: {
      dwarf: 2540, elf: 1258, cavalry: 368, pegasus: 400, dragon: 100,
      mangonel: 95, ogre: 55, shaman: 518, cargo_wagon: 2500,
    },
  },
  defender: {
    counts: {
      dwarf: 3641, elf: 677, cavalry: 600, pegasus: 250, dragon: 68,
      mangonel: 51, ogre: 60, shaman: 600, cargo_wagon: 3000,
      archer_tower: 129, trap: 300, oil_cauldron: 111, mangonel_tower: 60, guard: 33,
      wall: 3,
    },
  },
};

describe('referans savaş', () => {
  it('saldıran 5 turda kazanır', () => {
    const r = simulate(REFERENCE);
    expect(r.winner).toBe('attacker');
    expect(r.turns).toBe(5);
  });

  it('kayıplar beklenen mertebede', () => {
    const r = simulate(REFERENCE);
    // Geniş aralık: amaç birebir sayı değil, mertebe regresyonunu yakalamak.
    expect(r.attacker.lost).toBeGreaterThan(1200);
    expect(r.attacker.lost).toBeLessThan(2600);
    expect(r.defender.lost).toBeGreaterThan(3000);
    expect(r.defender.lost).toBeLessThan(5000);
  });

  it('sur savaş sonunda tükenir (sv3 bu ölçekte dayanmaz)', () => {
    const r = simulate(REFERENCE);
    expect(r.defender.wallIntegrity).toBeLessThan(0.05);
  });

  it('savunma tabanı bu savaşta da geçerli', () => {
    const r = simulate(REFERENCE);
    for (const id of ['archer_tower', 'oil_cauldron', 'mangonel_tower', 'guard']) {
      expect(r.defender.counts[id]).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('determinizm (seedli PRNG)', () => {
  it('aynı seed → birebir aynı sonuç', () => {
    const a = simulate(REFERENCE);
    const b = simulate(REFERENCE);
    expect(a).toEqual(b);
  });

  it('farklı seed → farklı ayrıntı, aynı kazanan', () => {
    const a = simulate({ ...REFERENCE, seed: 'seed-a' });
    const b = simulate({ ...REFERENCE, seed: 'seed-b' });
    expect(a.winner).toBe(b.winner);
    expect(a.debris).not.toEqual(b.debris);
  });

  it('sonuç motor sürümünü, katalog hash’ini ve seed’i taşır (yeniden oynatılabilirlik)', () => {
    const r = simulate(REFERENCE);
    expect(r.engineVersion).toBe('0.6.0');
    expect(r.catalogHash).toMatch(/^[0-9a-f]{8}$/);
    expect(typeof r.seed).toBe('number');
  });
});

describe('gece savaşı', () => {
  it('gece görüşü yükseldikçe ceza azalır', () => {
    const day = simulate(REFERENCE);
    const night0 = simulate({ ...REFERENCE, night: true, nightVisionAttacker: 0 });
    const night10 = simulate({ ...REFERENCE, night: true, nightVisionAttacker: 10 });
    // Gecede saldıranın vuruş gücü düşer → savunan daha az kaybeder; teknik bunu telafi eder.
    expect(night0.defender.lost).toBeLessThan(day.defender.lost);
    expect(night10.defender.lost).toBeGreaterThan(night0.defender.lost);
  });
});
