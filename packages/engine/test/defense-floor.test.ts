/**
 * ⭐ SAVUNMA TABANI testleri (SİSTEM PLANI §13.11.10).
 * Kullanıcı kuralı: her savunma birimi tipinden savaş sonrası en az 4 tanesi kalır.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_COMBAT_CONFIG, mergeCombatConfig, simulate } from '../src/index.ts';
import type { SimulateInput } from '../src/types.ts';

/** Küçük şehri ezen bir ordu. */
function overwhelmingAttack(defense: Record<string, number>, seed = 'floor-test'): SimulateInput {
  return {
    seed,
    attacker: { counts: { dwarf: 5000, cavalry: 800, dragon: 60, ogre: 40 } },
    defender: { counts: defense },
  };
}

describe('savunma tabanı', () => {
  it('ezici saldırıdan sonra her tipten 4 birim kalır', () => {
    const r = simulate(overwhelmingAttack({
      archer_tower: 100, ballista: 30, mangonel_tower: 40, guard: 50, oil_cauldron: 60,
    }));

    expect(r.winner).toBe('attacker');
    for (const id of ['archer_tower', 'ballista', 'mangonel_tower', 'guard', 'oil_cauldron']) {
      expect(r.defender.counts[id], `${id} tabanın altına düşmemeli`).toBeGreaterThanOrEqual(4);
    }
  });

  it('savaş öncesi 4ten az olan tipte taban savaş öncesi adetle sınırlıdır', () => {
    const r = simulate(overwhelmingAttack({ ballista: 3, archer_tower: 1 }));
    // min(4, savaşÖncesi) → birim YARATILMAZ, yalnız korunur
    expect(r.defender.counts['ballista']).toBe(3);
    expect(r.defender.counts['archer_tower']).toBe(1);
  });

  it('tabanla geri gelen birimler enkaz üretmez (sonsuz enkaz çiftliği yok)', () => {
    // Şehirde TAM taban kadar savunma var → hiç net kayıp olamaz → savunma enkazı 0.
    const onlyFloor = simulate(overwhelmingAttack({
      archer_tower: 4, ballista: 4, mangonel_tower: 4, guard: 4, oil_cauldron: 4,
    }, 'farm-1'));
    const again = simulate(overwhelmingAttack({
      archer_tower: 4, ballista: 4, mangonel_tower: 4, guard: 4, oil_cauldron: 4,
    }, 'farm-2'));

    // Savunma tarafından gelen enkaz katkısı sıfır olmalı; kalan enkaz yalnız saldıranın ölülerinden.
    for (const id of ['archer_tower', 'ballista', 'mangonel_tower', 'guard', 'oil_cauldron']) {
      expect(onlyFloor.defender.counts[id]).toBe(4);
      expect(again.defender.counts[id]).toBe(4);
    }
    // Farklı seed'lerde bile savunma kaybı yok → tekrarlanan saldırı savunmadan ganimet üretmez.
    expect(onlyFloor.defender.lost).toBe(0);
    expect(again.defender.lost).toBe(0);
  });

  it('tuzak tabana DAHİL DEĞİL (tek kullanımlık mühimmat)', () => {
    expect(DEFAULT_COMBAT_CONFIG.defenseFloor.protectedTypes).not.toContain('trap');
    const r = simulate(overwhelmingAttack({ trap: 300, archer_tower: 50 }));
    // Tuzak salvoda tükenir; 4'ün altına düşebilmeli.
    expect(r.defender.counts['trap']).toBeLessThan(300);
  });

  it('taban KAZANANI değiştirmez (kazanan ham kayıplarla belirlenir)', () => {
    const input = overwhelmingAttack({ ballista: 5, archer_tower: 5 }, 'winner-check');
    const withFloor = simulate(input);
    const withoutFloor = simulate(input, mergeCombatConfig({ defenseFloor: { enabled: false } }));

    expect(withFloor.winner).toBe(withoutFloor.winner);
    expect(withFloor.turns).toBe(withoutFloor.turns);
    expect(withFloor.xp).toBe(withoutFloor.xp);
  });

  it('taban raporda ayrıca gösterilir', () => {
    // Onarımı kapatıp tabanı yalıtıyoruz: 40 balistanın tamamı ölür → taban 4'ünü geri getirir.
    const noRepair = mergeCombatConfig({ repair: { min: 0, max: 0 } });
    const r = simulate(overwhelmingAttack({ ballista: 40 }), noRepair);
    expect(r.defender.counts['ballista']).toBe(4);
    expect(r.defender.floorRestored['ballista']).toBe(4);
  });

  it('onarım tek başına 4ün üstüne çıkarıyorsa taban devreye girmez', () => {
    // 40 balista → onarım kaybın %50-70'ini geri verir (20-28) → taban gereksiz.
    const r = simulate(overwhelmingAttack({ ballista: 40 }));
    expect(r.defender.counts['ballista']).toBeGreaterThan(4);
    expect(r.defender.floorRestored['ballista']).toBeUndefined();
  });
});
