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

  /**
   * ⚠️ Y turu (2026-07-26) bir ara vardığım "üssel, puan başına ×1,18" çıkarımını ÇÜRÜTTÜ:
   * o rakam yalnız 0-12 puanlık pencereden geliyordu. 24/45/60 puan ölçülünce puan başına kazanç
   * yavaşlıyor (×1,244 → ×1,082 → ×1,043 → ×1,036 → ×1,018) ve şekil TOPLAMSAL/lineer çıkıyor.
   * Bu test o hatayı bir daha yapmamızı engelliyor: getiri AZALAN olmalı.
   */
  it('fizSald getirisi puan başına AZALIR (üssel değil)', () => {
    const own = (fAtk: number): number => {
      // Kendi kaybındaki düşüş, kahraman ofansının doğrudan ölçüsü (savunan kaybı doyuyor).
      const r = simulate(battle({ level: 15, fAtk }, 'x'));
      return r.attacker.lost;
    };
    const s0 = own(0);
    const s12 = own(12);
    const s24 = own(24);
    const s45 = own(45);

    // Daha çok puan her zaman daha iyi…
    expect(s12).toBeLessThan(s0);
    expect(s24).toBeLessThan(s12);
    expect(s45).toBeLessThan(s24);

    // …ama puan başına kazanç azalıyor: ilk 12 puan, son 21 puandan daha çok iş yapıyor.
    const ilk12PuanBasina = (s0 - s12) / 12;
    const son21PuanBasina = (s24 - s45) / 21;
    expect(ilk12PuanBasina).toBeGreaterThan(son21PuanBasina);
  });

  it('savunan kaybı DOYAR (öldürülecek ordu kalmıyor)', () => {
    // Ölçüm: 12/24/45/60 puanda savunan kaybı 4015 → 4254 → 4269 → 4276; ordu 4300 birim.
    const s24 = simulate(battle({ level: 15, fAtk: 24 }, 'doy'));
    const s45 = simulate(battle({ level: 15, fAtk: 45 }, 'doy'));
    const ordu = 2000 + 1200 + 500 + 300 + 300;
    expect(s24.defender.lost).toBeGreaterThan(ordu * 0.95);
    expect(s45.defender.lost).toBeGreaterThan(ordu * 0.95);
    expect(s45.defender.lost).toBeLessThanOrEqual(ordu);
  });

  it('yüksek fizSald savaşı KISALTIR (ölçüm: 45 ve 60 puanda 4 tur)', () => {
    expect(simulate(battle({ level: 15 }, 'tur')).turns).toBe(5);
    expect(simulate(battle({ level: 15, fAtk: 45 }, 'tur')).turns).toBeLessThanOrEqual(4);
    expect(simulate(battle({ level: 20, fAtk: 60 }, 'tur')).turns).toBeLessThanOrEqual(4);
  });

  it('fizSald, kendi kaybını düşürmede fizSav’dan DAHA etkili', () => {
    // Ölçüm: Y1 (24 fizSald) atk 688 · Y3 (45 fizSav) atk 908 → saldırı, savunmadan iyi korur.
    const saldiri24 = simulate(battle({ level: 15, fAtk: 24 }, 'k'));
    const savunma45 = simulate(battle({ level: 15, fDef: 45 }, 'k'));
    expect(saldiri24.attacker.lost).toBeLessThan(savunma45.attacker.lost);
  });

  it('büyüye harcanan puan ZİYAN olur (Y4 kanıtı)', () => {
    // Y4: 15 fizSald + 15 fizSav + 15 büyü → atk 758; Y1: 24 fizSald tek başına → atk 688.
    const dengeli = simulate(battle({ level: 15, fAtk: 15, fDef: 15, mAtk: 8, mDef: 7 }, 'z'));
    const sadeceSaldiri = simulate(battle({ level: 15, fAtk: 24 }, 'z'));
    expect(sadeceSaldiri.attacker.lost).toBeLessThan(dengeli.attacker.lost);
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

  /**
   * ⚠️ Y turu tavanı ÇÜRÜTTÜ. Önce "tek kahraman orduyu ikame etmemeli" diye %50 tavan koymuştum;
   * ölçüm tam puanlı kahramanın GERÇEKTEN ordu ölçeğinde olduğunu gösterdi (lvl20/60 puan:
   * saldıran 4.300 birimin yalnız 318'ini kaybederek savunanı 4 turda siliyor).
   * Varsayılan tavan artık ölçülen aralığın dışında; alan yalnız denge düğmesi olarak duruyor.
   */
  it('tam puanlı kahraman ordu ölçeğindedir (ölçülen davranış)', () => {
    const full = simulate(battle({ level: 20, fAtk: 60 }, 'cap'));
    const none = simulate(battle({ level: 20 }, 'cap'));
    // Kendi kaybı en az yarıya inmeli — kahraman gerçekten belirleyici.
    expect(full.attacker.lost).toBeLessThan(none.attacker.lost * 0.5);
    // Varsayılan tavan ölçülen aralığı KISMIYOR.
    expect(DEFAULT_COMBAT_CONFIG.hero.maxPoolShare).toBeGreaterThanOrEqual(1);
  });

  it('tavan düğmesi hâlâ çalışıyor (denge gerekirse kısılabilir)', () => {
    const kisik = mergeCombatConfig({ hero: { maxPoolShare: 0.1 } });
    const serbest = simulate(battle({ level: 20, fAtk: 60 }, 'knob'));
    const kisilmis = simulate(battle({ level: 20, fAtk: 60 }, 'knob'), kisik);
    expect(kisilmis.attacker.lost).toBeGreaterThan(serbest.attacker.lost);
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
