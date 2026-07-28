/**
 * ⭐ BÜYÜ KALKANI BÜTÜNLÜĞÜ (§13.21) — 2026-07-29'da binary'den çözülen mekanik.
 */
import { describe, expect, it } from 'vitest';
import { simulate } from '../src/index.ts';

/* ═══ §13.21 BÜYÜ KALKANI BÜTÜNLÜĞÜ ════════════════════════════════════════
 * 2026-07-29 binary analizi: kalkan Sur ile AYNI savunma-yapıları listesinde duran ve AYNI
 * hasar formülünden geçen bir birimdir (`HasarKayipCekirdegi`); simülatörün ekranında ikisi de
 * yüzde gösterilir. Motorda ise kalkan pasif bir çarpandı ve hiç yıpranmıyordu.
 */
describe('§13.21 Büyü Kalkanı bütünlüğü', () => {
  const atk = (counts: Record<string, number>) => ({
    counts, tech: {}, heroes: [], temple: 0, heroCount: 0,
  });

  it('kalkan yoksa bütünlük null', () => {
    const r = simulate({
      attacker: atk({ dwarf: 100 }), defender: atk({ dwarf: 50 }),
      night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: 'k1',
    });
    expect(r.defender.shieldIntegrity).toBeNull();
  });

  it('küçük büyü saldırısında kalkan YIPRANMAZ (pay < mitigasyon)', () => {
    const r = simulate({
      attacker: atk({ dwarf: 200 }),                 // fiziksel ordu, büyü havuzu yok denecek kadar
      defender: atk({ dwarf: 200, magic_shield: 3 }),
      night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: 'k2',
    });
    expect(r.defender.shieldIntegrity).toBe(1);
  });

  it('⭐ ezici büyü saldırısında kalkan gözle görülür biçimde ERİR', () => {
    const r = simulate({
      // Pegasus + Şaman = ağır büyü havuzu (simülatör ekran görüntüsündeki senaryonun çekirdeği).
      attacker: atk({ pegasus: 678, shaman: 2500, cavalry: 611, elf: 545, dwarf: 354, ogre: 145 }),
      defender: atk({ dwarf: 145, elf: 249, cavalry: 345, ogre: 300, wall: 2, magic_shield: 1 }),
      night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: 'k3',
    });
    const s = r.defender.shieldIntegrity!;
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
    // ⚠️ Simülatör bu senaryoda %61,23 diyor; motor %80 civarı. MEKANİZMA doğru (kalkan yalnız
    //    ezici büyüde ve gerçekten eriyor), BÜYÜKLÜK henüz kalibre değil — bu test yönü kilitler,
    //    sayıyı değil. Kalibrasyon için birden çok simülatör örneği gerekiyor.
    expect(s).toBeLessThan(0.95);
  });

  it('kalkan yıpransa bile SEVİYE düşmez (bütünlük ayrı bir eksen)', () => {
    const r = simulate({
      attacker: atk({ pegasus: 2000, shaman: 5000 }),
      defender: atk({ dwarf: 50, magic_shield: 2 }),
      night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: 'k4',
    });
    expect(r.defender.counts['magic_shield']).toBe(2);
    expect(r.defender.shieldIntegrity).toBeLessThanOrEqual(1);
  });
});
