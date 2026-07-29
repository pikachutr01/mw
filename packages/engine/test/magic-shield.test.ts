/**
 * ⭐ BÜYÜ KALKANI — ALTIN ÖLÇÜM SETİ (kullanıcı, binary simülatör v0.5.5, 2026-07-29)
 *
 * Sekiz savaşın tamamı aynı iskelette: saldıran `N Ejderha + 500 Şaman`, savunan
 * `60 Ejderha + 650 Şaman + Sv Büyü Kalkanı`, teknik 0, kahraman yok, sur yok, gece yok.
 * Ekrandaki "Büyü Kalkanı %" değeri kalkanın DURUM'udur (`FUN_004132b0`).
 *
 * Set iki ekseni birden tarıyor:
 *   · Sv sabit (1), saldıran büyü gücü artıyor  → kalkan %100 → %94,25 → %32,82 → %3,27
 *   · saldıran sabit (85 Ejderha), Sv artıyor   → %3,27 → %5,10 → %65,12 → %100
 * İkinci eksen kritik: kalkan seviyesi arttıkça mitigasyon `Sv × 1,8^Sv` ile, güç yalnız
 * `1,8^Sv` ile büyür → Sv 4'te net hasar sıfırlanır ve kalkan hiç yıpranmaz.
 *
 * Tolerans ±2 puan: binary ±%0,1 jitter uyguluyor (FUN_00410e60) ve tek koşuluk ölçümler.
 */
import { describe, expect, it } from 'vitest';
import { simulate } from '../src/index.ts';
import type { SimulateInput } from '../src/types.ts';

interface Golden {
  dragons: number;
  level: number;
  /** binary ekranındaki Büyü Kalkanı yüzdesi */
  shieldPct: number;
  atkLost: number;
  defLost: number;
  winner: 'attacker' | 'defender';
}

const GOLDEN: Golden[] = [
  { dragons: 50, level: 1, shieldPct: 100.0, atkLost: 63, defLost: 0, winner: 'defender' },
  { dragons: 65, level: 1, shieldPct: 94.25, atkLost: 34, defLost: 9, winner: 'defender' },
  { dragons: 75, level: 1, shieldPct: 32.82, atkLost: 14, defLost: 60, winner: 'attacker' },
  { dragons: 85, level: 1, shieldPct: 3.27, atkLost: 4, defLost: 149, winner: 'attacker' },
  { dragons: 85, level: 2, shieldPct: 5.10, atkLost: 4, defLost: 147, winner: 'attacker' },
  { dragons: 85, level: 3, shieldPct: 65.12, atkLost: 4, defLost: 142, winner: 'attacker' },
  { dragons: 85, level: 4, shieldPct: 100.0, atkLost: 5, defLost: 134, winner: 'attacker' },
  { dragons: 90, level: 4, shieldPct: 74.41, atkLost: 3, defLost: 182, winner: 'attacker' },
];

const build = (g: Golden, seed: string): SimulateInput => ({
  seed,
  attacker: { counts: { dragon: g.dragons, shaman: 500 } },
  defender: { counts: { dragon: 60, shaman: 650, magic_shield: g.level } },
});

/** Jitter üç değerli (0.999/1.000/1.001) → birkaç seed'in ortalaması ölçümle karşılaştırılır. */
function average(g: Golden) {
  const seeds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
  const runs = seeds.map((s) => simulate(build(g, s)));
  const mean = (f: (r: (typeof runs)[number]) => number) =>
    runs.reduce((acc, r) => acc + f(r), 0) / runs.length;
  return {
    shieldPct: mean((r) => (r.defender.shieldIntegrity ?? 0) * 100),
    atkLost: mean((r) => r.attacker.lost),
    defLost: mean((r) => r.defender.lost),
    winners: runs.map((r) => r.winner),
  };
}

describe('büyü kalkanı — binary altın ölçümleri', () => {
  for (const g of GOLDEN) {
    const label = `${g.dragons} ejderha vs kalkan sv${g.level}`;

    it(`${label}: kalkan %${g.shieldPct}`, () => {
      const pct = average(g).shieldPct;
      // ±2 puan: en büyük sapma sv3'te (66,5 vs 65,1) — eğrinin en dik yeri. Durum hem güce hem
      // mitigasyona geri besleme yaptığı için orada küçük fark büyüyor.
      expect(pct).toBeGreaterThanOrEqual(g.shieldPct - 2);
      expect(pct).toBeLessThanOrEqual(g.shieldPct + 2);
    });

    it(`${label}: kayıplar ve kazanan`, () => {
      const r = average(g);
      expect(r.atkLost).toBeGreaterThanOrEqual(g.atkLost - 3);
      expect(r.atkLost).toBeLessThanOrEqual(g.atkLost + 3);
      expect(r.defLost).toBeGreaterThanOrEqual(g.defLost - 4);
      expect(r.defLost).toBeLessThanOrEqual(g.defLost + 4);
      expect(new Set(r.winners)).toEqual(new Set([g.winner]));
    });
  }

  it('kalkan seviyesi arttıkça savunan daha az kaybeder (koruma P payından gelir)', () => {
    const losses = [1, 2, 3, 4].map(
      (level) => average({ ...GOLDEN[3], level } as Golden).defLost,
    );
    for (let i = 1; i < losses.length; i++) {
      expect(losses[i]).toBeLessThan(losses[i - 1]);
    }
  });

  it('kalkansız savunan, kalkanlıdan daha çok kaybeder', () => {
    const withShield = simulate(build(GOLDEN[6], 'x'));
    const without = simulate({
      seed: 'x',
      attacker: { counts: { dragon: 85, shaman: 500 } },
      defender: { counts: { dragon: 60, shaman: 650 } },
    });
    expect(without.defender.lost).toBeGreaterThan(withShield.defender.lost);
    expect(without.defender.shieldIntegrity).toBeNull();
  });
});
