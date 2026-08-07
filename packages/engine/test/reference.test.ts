/**
 * Referans savaş + determinizm testleri.
 *
 * Senaryo `savas_testleri.txt`'ten (orijinal binary simülatörün çıktısıyla karşılaştırıldı).
 * Binary: saldıran kazanır · 5 tur · saldıran 1595-1646 kaybeder · savunan 4050-4114 kaybeder.
 * v0.6 JS motoru: kazanan ✓ · tur ✓ · atk 1963-2028 · def 3879-3964 (bilinçli sapmalar, §v0.6).
 * Bu test motorun O DAVRANIŞTA kalmasını korur — birebir binary eşleşmesi HEDEF DEĞİL.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION, simulate } from '../src/index.ts';
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

  it('Sur ve Büyü Kalkanı "hayatta kalan birim" toplamına girmez (adet değil SEVİYE)', () => {
    const r = simulate(REFERENCE);
    // Seviye bilgisi raporda durur, durumu ayrıca YÜZDE olarak gelir…
    expect(r.defender.counts['wall']).toBe(3);
    expect(r.defender.wallIntegrity).not.toBeNull();
    // …ama "3 birim asker" gibi toplama eklenmez.
    const sumOfUnits = Object.entries(r.defender.counts)
      .filter(([id]) => !['wall', 'magic_shield', 'temple'].includes(id))
      .reduce((n, [, c]) => n + c, 0);
    expect(r.defender.alive).toBe(sumOfUnits);
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
    expect(r.engineVersion).toBe(ENGINE_VERSION);
    expect(r.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(r.catalogHash).toMatch(/^[0-9a-f]{8}$/);
    expect(typeof r.seed).toBe('number');
  });

  /** ⭐ Sürümün ÜÇ kopyası vardı (package.json · index · config) — artık tek kaynak + bu kilit. */
  it('package.json sürümü ENGINE_VERSION ile senkron', () => {
    const pkg = createRequire(import.meta.url)('../package.json') as { version: string };
    expect(pkg.version).toBe(ENGINE_VERSION);
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

/**
 * ⭐ SAVUNANDA SAVAŞACAK KİMSE YOK — `docs/SAVAS_BINARY_KONTROL.md` satır 7·8·10 + canlı rapor.
 *
 * ⚠️ `LEVEL_BASED` yapılar (Sur · Büyü Kalkanı · Tapınak) girdide ADET değil **SEVİYE**
 * taşıyor. `combatAlive` bunları canlı birim gibi sayınca, ordusu olmayan ama Sur 8'i olan
 * şehir "8 birim ayakta" görünüyor, savaş 5 tur boşa dönüyor ve karar *"eşitlikte savunan"*
 * kuralına düşüyordu. Canlı örnek: 132 Yük Arabası + 2 Ejderha, savunanda hiç ordu yok,
 * saldıran 0 kayıpla KAYBETTİ ve sur %31'e indi.
 *
 * Binary ölçümü: üçünde de **saldıran kazanır · 1 tur · iki taraf da 0 kayıp · yapı %100**.
 */
describe('savunanda yalnız seviye-taşıyan yapı var (binary satır 7·8·10)', () => {
  const lone = (defender: Record<string, number>) => simulate({
    seed: 'level-based-only',
    attacker: { counts: { dwarf: 120 } },
    defender: { counts: defender },
  });

  for (const [ad, def] of [
    ['Sur 3', { wall: 3 }],
    ['Büyü Kalkanı 3', { magic_shield: 3 }],
    ['Tapınak 3', { temple: 3 }],
  ] as const) {
    it(`${ad}: saldıran 1 turda kazanır, kimse kayıp vermez`, () => {
      const r = lone(def);
      expect(r.winner).toBe('attacker');
      expect(r.turns).toBe(1);
      expect(r.attacker.lost).toBe(0);
      expect(r.defender.lost).toBe(0);
      // ⚠️ Yapı hiç yıpranmaz: tur döngüsü hiç dönmediği için hasar fazına girilmiyor.
      if (r.defender.wallIntegrity != null) expect(r.defender.wallIntegrity).toBe(1);
      if (r.defender.shieldIntegrity != null) expect(r.defender.shieldIntegrity).toBe(1);
    });
  }

  it('⭐ CANLI RAPOR: 132 Yük Arabası + 2 Ejderha, savunanda yalnız Sur 8', () => {
    const r = simulate({
      seed: 'live-wall8',
      attacker: { counts: { cargo_wagon: 132, dragon: 2 } },
      defender: { counts: { wall: 8 } },
    });
    expect(r.winner).toBe('attacker');
    expect(r.turns).toBe(1);
    expect(r.attacker.lost).toBe(0);
    expect(r.defender.wallIntegrity).toBe(1);
  });

  /**
   * ⚠️ KARŞI KONTROL — düzeltmenin Sur'u devre dışı BIRAKMADIĞI: savunanın ordusu varsa
   * savaş normal işliyor, sur güç havuzuna giriyor ve yıpranıyor. Düzeltme yalnız "ortada
   * savaşacak kimse var mı" sorusunu değiştirdi.
   */
  it('savunanın ordusu varsa Sur hâlâ savaşa katılır ve yıpranır', () => {
    const r = simulate({
      seed: 'wall-still-works',
      attacker: { counts: { dwarf: 3000 } },
      defender: { counts: { dwarf: 200, wall: 8 } },
    });
    expect(r.turns).toBeGreaterThan(1);
    expect(r.defender.lost).toBeGreaterThan(0);
    expect(r.defender.wallIntegrity).toBeLessThan(1);
  });

  /**
   * ⚠️ Sur'un KORUYUCU gücü de yerinde: 500 cüce, Sur 8'in arkasındaki 200 cüceyi kıramıyor —
   * savunan 0 kayıpla kazanıyor ve sur hiç yıpranmıyor (mitigasyon geleni tamamen emiyor).
   * Düzeltme yalnız savunanda HİÇ savaşçı olmadığı hâli değiştirdi.
   */
  it('Sur arkasındaki ordu korunmaya devam eder', () => {
    const r = simulate({
      seed: 'wall-still-protects',
      attacker: { counts: { dwarf: 500 } },
      defender: { counts: { dwarf: 200, wall: 8 } },
    });
    expect(r.winner).toBe('defender');
    expect(r.attacker.lost).toBeGreaterThan(0);
    expect(r.defender.lost).toBe(0);
  });

  /**
   * ⚠️ Şaman GERÇEK bir birim (`NO_POOL` ama savaşçı) — binary satır 11 de savunanı kazandırıyor.
   * Bu test düzeltmenin şamanı yanlışlıkla kapsamadığını kilitliyor.
   */
  it('Şaman 200 tek başına hâlâ savunanı kazandırır (binary satır 11)', () => {
    const r = simulate({
      seed: 'shaman-only',
      attacker: { counts: { dwarf: 120 } },
      defender: { counts: { shaman: 200 } },
    });
    expect(r.winner).toBe('defender');
    expect(r.turns).toBe(5);
  });
});
