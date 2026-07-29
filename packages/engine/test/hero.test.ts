/**
 * ⭐ KAHRAMAN — yetenek bütçesi + binary savaş modeli.
 *
 * Savaş satırlarının tamamı kullanıcının binary simülatörde koştuğu **Tur 2 / Tur 3** ölçümleri
 * (`KAHRAMAN_TESTLERI_TUR2.md` ve `..._TUR3.md`). Eski `KAHRAMAN_TESTLERI.md` seti burada
 * KULLANILMIYOR: o setin tamamı simetrik (iki tarafta aynı ordu) kurulmuştu ve bıçak-sırtı
 * senaryoda motorun genel hatası kahramanın kendi etkisinden ayırt edilemiyordu.
 *
 * Model: kahraman = stat tablosu satır 12 (hp/magicHp 1200 · pAtk/pDef 240 · mAtk 300 · mDef 4000).
 *   stat = round((sv+1) × taban × 1,07^sv + taban × (1 + 4,8 × yetenek))
 *   havuz: faz 1 yok · faz 2 hp · faz 3 magicHp   ·   P: Alan = round(mDef × 0,005)
 *   durum -= 100 × net/mDef, **yalnız 0'da ölür**
 */
import { describe, expect, it } from 'vitest';
import {
  assertHeroSkills, DEFAULT_COMBAT_CONFIG, captureChance, heroSkillBudget, mergeCombatConfig, simulate,
} from '../src/index.ts';
import type { SimulateInput, UnitCounts } from '../src/types.ts';

type Hero = { level: number; fAtk?: number; fDef?: number; mAtk?: number; mDef?: number };

const AF: UnitCounts = { dwarf: 2000, elf: 1200, cavalry: 500, shaman: 200 };
const DF: UnitCounts = { dwarf: 2600, elf: 1400, cavalry: 600, shaman: 200 };
const AS: UnitCounts = { dwarf: 3000, elf: 1600, cavalry: 700, shaman: 200 };
const DS: UnitCounts = { dwarf: 2000, elf: 1200, cavalry: 500, shaman: 200 };
const AM: UnitCounts = { dragon: 35, dwarf: 600 };
const DM: UnitCounts = { dragon: 40, dwarf: 800, shaman: 60 };

const SEEDS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

/** Birkaç seed'in ortalaması (jitter üç değerli: 0,999 / 1,000 / 1,001). */
function measure(a: UnitCounts, d: UnitCounts, hero: Hero | null, side: 'a' | 'd') {
  const runs = SEEDS.map((seed) => {
    const input: SimulateInput = {
      seed,
      attacker: {
        counts: a, heroes: side === 'a' && hero ? [hero] : [],
        temple: 20, heroCount: side === 'a' ? 1 : 0,
      },
      defender: {
        counts: d, heroes: side === 'd' && hero ? [hero] : [],
        temple: 20, heroCount: side === 'd' ? 1 : 0,
      },
    };
    return simulate(input);
  });
  const mean = (f: (r: (typeof runs)[number]) => number): number =>
    runs.reduce((s, r) => s + f(r), 0) / runs.length;
  const heroes = runs
    .map((r) => r[side === 'a' ? 'attacker' : 'defender'].heroes[0])
    .filter((h): h is NonNullable<typeof h> => h != null);
  return {
    atkLost: mean((r) => r.attacker.lost),
    defLost: mean((r) => r.defender.lost),
    durum: heroes.length ? heroes.reduce((s, h) => s + h.durum, 0) / heroes.length : null,
    turns: mean((r) => r.turns),
  };
}

const near = (got: number, want: number, tolPct = 5, floor = 4): void => {
  expect(Math.abs(got - want), `${got.toFixed(0)} ≉ ${want}`)
    .toBeLessThanOrEqual(Math.max(floor, want * (tolPct / 100)));
};

describe('yetenek bütçesi: seviye başına 3 puan', () => {
  it('seviye 8 kahraman en fazla 24 puan dağıtabilir', () => {
    const b = heroSkillBudget({ level: 8, fAtk: 12, fDef: 12 });
    expect(b.total).toBe(24);
    expect(b.remaining).toBe(0);
    expect(b.valid).toBe(true);
  });

  it('bütçe aşımı yakalanır', () => {
    expect(heroSkillBudget({ level: 8, fAtk: 20, fDef: 10 }).valid).toBe(false);
    expect(() => assertHeroSkills({ level: 8, fAtk: 20, fDef: 10 })).toThrow(/bütçe/);
  });

  it('dağıtılmamış puan geçerlidir', () => {
    expect(heroSkillBudget({ level: 10, fAtk: 5 }).remaining).toBe(25);
  });

  it('seviye 0 kahramanın puanı yoktur', () => {
    expect(heroSkillBudget({ level: 0 }).total).toBe(0);
  });
});

describe('kahraman savaş modeli — Tur 2/3 altın ölçümleri', () => {
  it.each([
    ['kahramansız', null, 2543, 1223],
    ['sv 5', { level: 5 }, 2494, 1346],
    ['sv 10', { level: 10 }, 2426, 1517],
    ['sv 15', { level: 15 }, 2314, 1822],
    ['sv 20', { level: 20 }, 1950, 2875],
  ] as [string, Hero | null, number, number][])('K · %s', (_ad, hero, atk, def) => {
    const r = measure(AF, DF, hero, 'a');
    near(r.atkLost, atk);
    near(r.defLost, def);
  });

  it('⭐ seviye 0 kahraman da savaşır (kahramansızdan farklı)', () => {
    const yok = measure(AF, DF, null, 'a');
    const sifir = measure(AF, DF, { level: 0 }, 'a');
    expect(sifir.defLost).toBeGreaterThan(yok.defLost);
    near(sifir.defLost, 1249);          // ölçüm: 1247-1251
  });

  it.each([
    ['sv 0 · fizSald 0', { level: 0 }, 1249],
    ['sv 0 · fizSald 3', { level: 0, fAtk: 3 }, 1420],
    ['sv 0 · fizSald 9', { level: 0, fAtk: 9 }, 1785],
    ['sv 15 · fizSald 6', { level: 15, fAtk: 6 }, 2195],
    ['sv 15 · fizSald 12', { level: 15, fAtk: 12 }, 2606],
    ['sv 5 · fizSald 12', { level: 5, fAtk: 12 }, 2079],
    ['sv 10 · fizSald 12', { level: 10, fAtk: 12 }, 2257],
    ['sv 20 · fizSald 12', { level: 20, fAtk: 12 }, 3759],
  ] as [string, Hero, number][])('fizSald · %s → savunan kaybı', (_ad, hero, def) => {
    near(measure(AF, DF, hero, 'a').defLost, def);
  });

  it('⭐ yetenek katkısı SEVİYEDEN BAĞIMSIZ (12 puanın mutlak getirisi sabit)', () => {
    const gain = (level: number): number =>
      measure(AF, DF, { level, fAtk: 12 }, 'a').defLost - measure(AF, DF, { level }, 'a').defLost;
    const oran = gain(20) / gain(5);
    // Seviye-ölçekli olsaydı sv20 getirisi sv5'inkinin ~10 katı çıkardı; ölçüm neredeyse eşit.
    expect(oran).toBeGreaterThan(0.75);
    expect(oran).toBeLessThan(1.45);
  });

  it('⭐ büyüSald savunanın kaybını ARTIRIR (büyü ağırlıklı ordu)', () => {
    const yok = measure(AM, DM, null, 'a');
    const b0 = measure(AM, DM, { level: 15 }, 'a');
    const b10 = measure(AM, DM, { level: 15, mAtk: 10 }, 'a');
    near(yok.defLost, 228);
    near(b0.defLost, 721);
    expect(b10.defLost).toBeGreaterThan(b0.defLost);   // ölçüm: 721 → 806
  });

  it('⭐ savunanda ÇOK Şaman varken büyü etkisiz kalır (eski D3/D4 körlüğü)', () => {
    const kor: UnitCounts = { dragon: 40, dwarf: 800, shaman: 900 };
    const b0 = measure(AM, kor, { level: 15 }, 'a');
    const b40 = measure(AM, kor, { level: 15, mAtk: 40 }, 'a');
    expect(b0.defLost).toBeLessThan(20);
    expect(Math.abs(b40.defLost - b0.defLost)).toBeLessThan(30);
  });

  it('savunandaki kahraman kendi ordusunun kaybını düşürür', () => {
    near(measure(AS, DS, null, 'd').defLost, 3396);
    near(measure(AS, DS, { level: 15 }, 'd').defLost, 3125);
  });

  it.each([
    [3000, 301, 1640],
    [8000, 301, 380],
  ])('X · savunan %i Cüce → kahraman ölür', (n, atk, def) => {
    const r = measure({ dwarf: 300 }, { dwarf: n }, { level: 15 }, 'a');
    near(r.atkLost, atk);
    near(r.defLost, def);
    expect(r.durum).toBe(0);
  });

  it('⭐ yaşayan kahraman orduyu ayakta tutar (savaş erken bitmez)', () => {
    // 300 Cüce + kahraman vs 3000 Cüce: savaşçılar 3. turda biter, kahraman savaşı 5 tura taşır.
    expect(measure({ dwarf: 300 }, { dwarf: 3000 }, { level: 15 }, 'a').turns).toBe(5);
  });

  it('⭐ ölen kahraman "ünite kaybı" sayılır (300 Cüce + kahraman → 301)', () => {
    const r = measure({ dwarf: 300 }, { dwarf: 12000 }, { level: 15 }, 'a');
    expect(r.durum).toBe(0);
    near(r.atkLost, 301, 1, 1);
  });

  it("kahraman hasar alır ama 0'a inmedikçe ÖLMEZ", () => {
    const r = measure(
      { dragon: 30, dwarf: 1500 }, { dwarf: 1200, elf: 600, shaman: 60 }, { level: 15 }, 'd',
    );
    expect(r.durum!).toBeGreaterThan(60);
    expect(r.durum!).toBeLessThan(90);       // ölçüm: %73,4-73,8
  });
});

describe('kahraman çıkma ihtimali (28/28 ölçüm)', () => {
  it.each([
    [20, 0, 566, 2.83], [20, 0, 879, 4.395], [20, 0, 1017, 5.085],
    [20, 1, 1011, 1.137], [20, 1, 1289, 1.450], [20, 1, 736, 0.828],
  ])('Tapınak %i · %i kahraman · XP %i', (t, k, xp, beklenen) => {
    expect(captureChance(t, k, xp)).toBeCloseTo(beklenen, 2);
  });

  it('XP 499 ve altında kahraman ÇIKMAZ', () => {
    expect(captureChance(20, 0, 499)).toBe(0);
    expect(captureChance(20, 0, 500)).toBeGreaterThan(0);
  });

  it('ceza ÇIKARMALIDIR (çarpımsal değil): 1 kahraman ihtimali ~4 kat düşürür', () => {
    const oran = captureChance(20, 0, 1000) / captureChance(20, 1, 1000);
    expect(oran).toBeGreaterThan(3.5);   // çarpımsal olsaydı yalnız 1,25 kat olurdu
  });

  it('5 kahramanı olan oyuncu yeni kahraman çıkaramaz', () => {
    expect(captureChance(60, 5, 40000)).toBe(0);
  });

  it('ceza config ile ayarlanabilir (denge düğmesi)', () => {
    const yumusak = mergeCombatConfig({
      capture: { ...DEFAULT_COMBAT_CONFIG.capture, perHeroPenalty: 40 },
    });
    expect(captureChance(20, 2, 2000, yumusak)).toBeGreaterThan(0);
    expect(captureChance(20, 2, 2000)).toBe(0);   // varsayılan binary cezasıyla imkânsız
  });
});
