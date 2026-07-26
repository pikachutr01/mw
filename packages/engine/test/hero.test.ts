/**
 * ⭐ KAHRAMAN testleri — yetenek bütçesi (3 puan/seviye) + savaştaki davranış.
 * Referans ölçümler: proje kökündeki `KAHRAMAN_TESTLERI.md` (orijinal binary simülatör çıktıları).
 */
import { describe, expect, it } from 'vitest';
import {
  assertHeroSkills, DEFAULT_COMBAT_CONFIG, heroSkillBudget, mergeCombatConfig, simulate,
} from '../src/index.ts';
import type { SimulateInput } from '../src/types.ts';

const TECH_10 = {
  archery: 10, blacksmithing: 10, chemistry: 10, instinct: 10,
  sorcery: 10, talisman: 10, armor: 10, masonry: 10,
};
const ARMY = { dwarf: 2000, elf: 1200, cavalry: 500, shaman: 300, cargo_wagon: 300 };

function battle(hero: { level: number; fAtk?: number; fDef?: number; mAtk?: number; mDef?: number }, seed = 'hero'): SimulateInput {
  return {
    seed,
    attacker: { counts: ARMY, tech: TECH_10, heroes: [hero], temple: 20, heroCount: 1 },
    defender: { counts: ARMY, tech: TECH_10 },
  };
}

describe('yetenek bütçesi: seviye başına 3 puan', () => {
  it('seviye 8 kahraman en fazla 24 puan dağıtabilir', () => {
    const b = heroSkillBudget({ level: 8, fAtk: 12, fDef: 12 });
    expect(b.total).toBe(24);
    expect(b.spent).toBe(24);
    expect(b.remaining).toBe(0);
    expect(b.valid).toBe(true);
  });

  it('bütçe aşımı yakalanır', () => {
    const b = heroSkillBudget({ level: 8, fAtk: 20, fDef: 10 });
    expect(b.valid).toBe(false);
    expect(() => assertHeroSkills({ level: 8, fAtk: 20, fDef: 10 })).toThrow(/bütçe/);
  });

  it('dağıtılmamış puan geçerlidir (kahraman puanını saklayabilir)', () => {
    const b = heroSkillBudget({ level: 10 });
    expect(b.total).toBe(30);
    expect(b.remaining).toBe(30);
    expect(b.valid).toBe(true);
  });

  it('puan/seviye config ile değişir', () => {
    const cfg = mergeCombatConfig({ hero: { pointsPerLevel: 5 } });
    expect(heroSkillBudget({ level: 8 }, cfg).total).toBe(40);
  });
});

describe('yeteneklerin savaştaki etkisi', () => {
  it('büyü yetenekleri fiziksel savaşta ETKİSİZ (kahramanın büyü tabanı 0)', () => {
    const none = simulate(battle({ level: 10 }));
    const magicAtk = simulate(battle({ level: 10, mAtk: 10 }));
    const magicDef = simulate(battle({ level: 10, mDef: 10 }));
    // KAHRAMAN_TESTLERI D3/D4: ikisi de H2 (yetenek 0) ile birebir aynı çıkmıştı.
    expect(magicAtk.defender.lost).toBe(none.defender.lost);
    expect(magicDef.defender.lost).toBe(none.defender.lost);
  });

  it('fizSald ÜSSEL etki eder (lineer değil)', () => {
    const s0 = simulate(battle({ level: 15 }, 'x'));
    const s6 = simulate(battle({ level: 15, fAtk: 6 }, 'x'));
    const s12 = simulate(battle({ level: 15, fAtk: 12 }, 'x'));
    // Savunanın kaybı artan puanla hızlanarak büyümeli (orijinal: 2584 → 3242 → 4015).
    const ilkArtis = s6.defender.lost - s0.defender.lost;
    const ikinciArtis = s12.defender.lost - s6.defender.lost;
    expect(ilkArtis).toBeGreaterThan(300);
    expect(ikinciArtis).toBeGreaterThan(300);
    expect(s12.defender.lost).toBeGreaterThan(s6.defender.lost);
  });

  it('fizSav saldıranın kaybını düşürür', () => {
    const s0 = simulate(battle({ level: 10 }, 'y'));
    const s10 = simulate(battle({ level: 10, fDef: 10 }, 'y'));
    expect(s10.attacker.lost).toBeLessThan(s0.attacker.lost);
  });

  it('seviye tek başına küçük etkilidir (orijinal: lvl5→15 yalnız %11)', () => {
    const l5 = simulate(battle({ level: 5 }, 'z'));
    const l15 = simulate(battle({ level: 15 }, 'z'));
    const fark = (l5.attacker.lost - l15.attacker.lost) / l5.attacker.lost;
    expect(fark).toBeGreaterThan(0);
    expect(fark).toBeLessThan(0.25);
  });

  it('⚠️ tavan: tam puanlı kahraman orduyu İKAME ETMEZ', () => {
    // Seviye 20 × 3 = 60 puanın tamamı fizSald'da: üssel model tavan olmadan ×10⁴ verirdi.
    const full = simulate(battle({ level: 20, fAtk: 60 }, 'cap'));
    const none = simulate(battle({ level: 20 }, 'cap'));
    const oran = full.defender.lost / Math.max(1, none.defender.lost);
    expect(oran).toBeGreaterThan(1);       // kahraman gerçekten güçlendiriyor
    expect(oran).toBeLessThan(3);          // ama savaşı tek başına bitirmiyor
    expect(DEFAULT_COMBAT_CONFIG.hero.maxPoolShare).toBeLessThanOrEqual(1);
  });
});

describe('kahraman durumu (ölüm)', () => {
  it('ezici düşman karşısında kahraman ölür (KAHRAMAN_TESTLERI X3)', () => {
    const r = simulate({
      seed: 'x3',
      attacker: { counts: ARMY, tech: TECH_10, heroes: [{ level: 10, fAtk: 4, fDef: 3 }] },
      defender: {
        counts: { dwarf: 5000, elf: 3000, cavalry: 1200, shaman: 700, cargo_wagon: 500 },
        tech: TECH_10,
      },
    });
    expect(r.winner).toBe('defender');
    expect(r.attacker.heroes[0]?.alive).toBe(false);
    expect(r.attacker.heroes[0]?.durum).toBe(0);
  });

  it('küçük düşman karşısında kahraman tam durumda kalır (X1)', () => {
    const r = simulate({
      seed: 'x1',
      attacker: { counts: ARMY, tech: TECH_10, heroes: [{ level: 10, fAtk: 4, fDef: 3 }] },
      defender: { counts: { dwarf: 500, elf: 300, shaman: 100 }, tech: TECH_10 },
    });
    expect(r.winner).toBe('attacker');
    expect(r.attacker.heroes[0]?.durum).toBe(100);
  });
});
