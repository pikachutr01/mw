/**
 * ⭐ ENKAZ KURALI — savunma birimleri enkaz VERMEZ (2026-08-03).
 *
 * Kullanıcının orijinal simülatörde (v0.5.5) yaptığı ölçümler kuralı izole ediyor: saldıran
 * tarafta tek bir Kaos var ve hiç kayıp vermiyor, dolayısıyla ölen HER ŞEY savunma birimi.
 * Orijinal iki senaryoda da **0 altın / 0 yemek** enkaz veriyor; motorumuz ise ölen savunma
 * biriminin maliyetinin %30'unu basıyordu.
 *
 * ⚠️ Bu testler `simulate`ın kayıp SAYILARINA bağlanmıyor (onlar denge ayarlarıyla değişir),
 * yalnız *"savunma biriminden enkaz çıkmaz"* değişmezini kilitliyor.
 */
import { describe, expect, it } from 'vitest';
import { mergeCombatConfig, simulate } from '../src/index.ts';
import type { SimulateInput } from '../src/types.ts';

/** Kullanıcının ölçtüğü kurulum: tek Kaos, karşısında yalnız savunma birimleri. */
const kaosVs = (defense: Record<string, number>, seed = 'enkaz'): SimulateInput => ({
  seed,
  attacker: { counts: { chaos: 1 } },
  defender: { counts: defense },
});

describe('enkaz', () => {
  it('⭐ ölçüm A: 1 Kaos ↔ 46 Mangonel — savunma yıkılıyor ama enkaz SIFIR', () => {
    const r = simulate(kaosVs({ mangonel_tower: 46 }));

    // Önce senaryonun gerçekten kayıp ürettiğini doğrula, yoksa test boş yere geçerdi.
    expect(r.defender.counts['mangonel_tower']).toBeLessThan(46);
    expect(r.attacker.counts['chaos'], 'saldıran kayıp vermemeli — kural izole kalsın').toBe(1);

    expect(r.debris.gold).toBe(0);
    expect(r.debris.food).toBe(0);
  });

  it('⭐ ölçüm B: altı savunma türü birden yıkılsa da enkaz SIFIR', () => {
    const oncesi = {
      archer_tower: 143, trap: 123, oil_cauldron: 143,
      mangonel_tower: 46, guard: 65, ballista: 33,
    };
    const r = simulate(kaosVs(oncesi, 'enkaz-b'));

    const olen = Object.entries(oncesi)
      .reduce((t, [id, n]) => t + Math.max(0, n - (r.defender.counts[id] ?? 0)), 0);
    expect(olen, 'senaryo savunma kaybı üretmeli').toBeGreaterThan(0);

    expect(r.debris.gold).toBe(0);
    expect(r.debris.food).toBe(0);
  });

  it('SAVAŞÇI kaybı enkaz üretmeye devam eder — kural yalnız savunmayı susturuyor', () => {
    const r = simulate({
      seed: 'enkaz-savasci',
      attacker: { counts: { dwarf: 4000, cavalry: 500 } },
      defender: { counts: { dwarf: 3500, cavalry: 450 } },
    });
    expect(r.debris.gold).toBeGreaterThan(0);
    expect(r.debris.food).toBeGreaterThan(0);
  });

  it('`debrisFromDefenses` açılınca eski davranış geri gelir (panel ayarı çalışıyor)', () => {
    const girdi = kaosVs({ mangonel_tower: 46 });
    const acik = simulate(girdi, mergeCombatConfig({ debrisFromDefenses: true }));

    const olu = 46 - (acik.defender.counts['mangonel_tower'] ?? 0);
    expect(olu).toBeGreaterThan(0);
    // Mangonel: 1.000 altın + 8.000 yemek · oran 0,3
    expect(acik.debris.gold).toBe(Math.round(olu * 1000 * 0.3));
    expect(acik.debris.food).toBe(Math.round(olu * 8000 * 0.3));
  });
});
