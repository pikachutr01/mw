/**
 * ⭐ GECE SAVAŞI (§7) — binary'den satır satır okunmuş davranış (2026-07-31, Ghidra).
 *
 * Zincir: `FUN_0040dcb4` (savaş) → `FUN_0040d608` (gece bayrağı `savas+0x74`) →
 * `FUN_004111d4` (saldıran, 2 döngü) / `FUN_00411a80` (savunan, 3 döngü — üçüncüsü savunma
 * YAPILARI, `FUN_00413120` ile ve o modifier savaşçınınkiyle **bayt bayt aynı**).
 *
 * Modifier `FUN_00412624` disassembly'si YALNIZ iki oku-çarp-yaz çifti içeriyor:
 *   `FUN_00412b5c` → stat+0x00 (Can)   ·   `FUN_00412b9c` → stat+0x08 (Büyü Canı)
 * Stat bloğu 6 double × 8 bayt: Can · BüyüCan · FizSald · FizSav · BüyüSald · BüyüSav
 * (sonuncusu `FUN_00412b3c` = [p+0x28], dağıtıcı indeksi 6 ile bağımsızca doğrulandı).
 *
 * Bu dosyanın işi o yapıyı **kilitlemek**: hangi statın etkilendiği bir daha ampirik tahminle
 * değişmesin. Sayısal büyüklük ölçümleri ayrı (`docs/veri/gece-savasi-olcumleri.md`).
 */
import { describe, expect, it } from 'vitest';
import { nightMultiplier, simulate } from '../src/index.ts';
import type { SimulateInput } from '../src/index.ts';

const side = (counts: Record<string, number>, tech: Record<string, number> = {}) => ({
  counts, tech, heroes: [], temple: 0, heroCount: 0,
});

const run = (o: Partial<SimulateInput> & Pick<SimulateInput, 'attacker' | 'defender'>) =>
  simulate({ night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: 'gece', ...o });

describe('§7 gece görüşü çarpanı', () => {
  /**
   * PE'den doğrulanmış sabitler (saldıran 0x00411280.. / savunan 0x00411b74..):
   * 3.0 · 1.0 · 0.3 · 0.7 → `(1 − 3/(L+3)) × 0.3 + 0.7`
   */
  it('binary tablosuyla birebir', () => {
    /* ⚠️ Beklenenler TAM değerler, raporun yuvarlanmış tablosu değil: nv5 gerçekte 0,8875'tir,
     * belgede 0,888 diye yazıyor. Yuvarlanmış sayıyı test etmek, formülü değil belgeyi test
     * etmek olurdu. */
    const table: [number, number][] = [
      [0, 0.7], [1, 0.775], [2, 0.82], [3, 0.85], [5, 0.8875],
      [10, 0.9307692307692308], [15, 0.95], [20, 0.9608695652173913],
    ];
    for (const [level, expected] of table) {
      expect(nightMultiplier(level), `nv${level}`).toBeCloseTo(expected, 10);
    }
  });

  it('seviye arttıkça 1e yaklaşır ama ASLA aşmaz', () => {
    expect(nightMultiplier(1000)).toBeLessThan(1);
    expect(nightMultiplier(1000)).toBeGreaterThan(0.999);
  });

  it('negatif/kesirli seviye 0 sayılır (binary int okuması)', () => {
    expect(nightMultiplier(-5)).toBe(nightMultiplier(0));
    expect(nightMultiplier(2.9)).toBe(nightMultiplier(2));
  });
});

describe('§7 gece hangi statları etkiler', () => {
  /**
   * ⭐⭐ TAŞIMA KAPASİTESİ ETKİLENMEZ.
   *
   * Motor 2026-07-31'e kadar `carry`yi de ×çarpan yapıyordu; kaynağı eski çözümleme raporunun
   * *"HP ve Taşıma Kapasitesi"* ifadesiydi ve o ifade YANLIŞTI — modifier'ın ikinci alanı
   * Taşıma değil **Büyü Canı**. Taşıma o stat bloğunda bile yok.
   *
   * Ölçüm: savunması olmayan bir hedefe saldıran ordu hiç kayıp vermez → hayatta kalan yük
   * arabası sayısı gece ve gündüz AYNI. Kapasite de aynı kalmalı; eskiden gece %70'ine
   * düşüyordu ve ganimet o oranda eksik taşınıyordu.
   */
  it('⭐ ganimet kapasitesi gece AZALMAZ (carry çarpılmıyor)', () => {
    const attacker = side({ dwarf: 500, cargo_wagon: 100 });
    const defender = side({ dwarf: 1 });

    const day = run({ attacker, defender, night: false });
    const nightBattle = run({ attacker, defender, night: true });

    expect(nightBattle.attacker.counts['cargo_wagon'])
      .toBe(day.attacker.counts['cargo_wagon']);
    expect(nightBattle.attackerCarryCapacity).toBe(day.attackerCarryCapacity);
    expect(day.attackerCarryCapacity).toBeGreaterThan(0);
  });

  /**
   * Can azalınca savaş havuzu da azalır (havuz = Σ Can×adet, `FUN_0040e0c4`), yani gece iki
   * taraf da daha az öldürür. Gece görüşü YOKKEN çarpan 0,7 → etki en büyük.
   */
  it('gece iki taraf da daha az kayıp verdirir (Can havuzu küçülüyor)', () => {
    const attacker = side({ dwarf: 2500 });
    const defender = side({ dwarf: 3500 });

    const day = run({ attacker, defender, night: false });
    const nightBattle = run({ attacker, defender, night: true });

    expect(nightBattle.defender.lost).toBeLessThan(day.defender.lost);
    expect(nightBattle.attacker.lost).toBeLessThanOrEqual(day.attacker.lost);
  });

  /** Gece görüşü yükseldikçe o tarafın kaybı azalır — çarpan 1'e yaklaşıyor. */
  it('gece görüşü SALDIRANI korur', () => {
    const attacker = side({ dwarf: 2500 });
    const defender = side({ dwarf: 3500 });
    const nv0 = run({ attacker, defender, night: true, nightVisionAttacker: 0 });
    const nv10 = run({ attacker, defender, night: true, nightVisionAttacker: 10 });
    expect(nv10.attacker.alive).toBeGreaterThan(nv0.attacker.alive);
  });

  it('gece görüşü SAVUNANI korur', () => {
    const attacker = side({ dwarf: 3500 });
    const defender = side({ dwarf: 2500 });
    const nv0 = run({ attacker, defender, night: true, nightVisionDefender: 0 });
    const nv10 = run({ attacker, defender, night: true, nightVisionDefender: 10 });
    expect(nv10.defender.alive).toBeGreaterThan(nv0.defender.alive);
  });

  /**
   * ⭐ BÜYÜ CANI DA AZALIR. 2026-07-22'de ampirik olarak eklenmişti (kaos gibi yüksek-BüyüCan
   * birimler gece tam güçte kalıp savunanı ~%17 fazla öldürüyordu); 2026-07-31'de yapısal
   * kanıtı çıktı (modifier'ın ikinci çifti = stat+0x08).
   */
  it('⭐ yüksek Büyü Canlı birim (kaos) geceden ETKİLENİR', () => {
    /* ⚠️ Savunan SİLİNMEMELİ, yoksa iki koşum da "hepsi öldü" der ve fark görünmez. İlk iki
     * denemede tam bu oldu: 6 kaos 4.000 cüceyi de 40.000 cüceyi de süpürüyor (gündüz kayıp
     * 40.000/40.000). 200.000'de gündüz 7.785, gece 2.783 kayıp — fark net görünüyor. */
    const attacker = side({ chaos: 6 });
    const defender = side({ dwarf: 200_000 });
    const day = run({ attacker, defender, night: false });
    const nightBattle = run({ attacker, defender, night: true });
    expect(day.defender.lost).toBeGreaterThan(0);
    expect(day.defender.alive).toBeGreaterThan(0);
    expect(nightBattle.defender.lost).toBeLessThan(day.defender.lost);
  });

  /**
   * ⚠️ SUR ve BÜYÜ KALKANI geceden etkilenmez: binary'de ayrı alanlar (`ordu+0x10`/`ordu+0x98`),
   * üçüncü döngünün taradığı yapı listesinde DEĞİLLER. Bizde de `army.units` dışındalar.
   * Ölçüm: surun savaş sonrası bütünlüğü gece ve gündüz aynı kalmalı.
   */
  it('⚠️ Sur bütünlüğü geceden etkilenmez', () => {
    const attacker = side({ elf: 2000 }, { archery: 10, blacksmithing: 10 });
    const defender = side({ dwarf: 500, wall: 5 }, { masonry: 10 });
    const day = run({ attacker, defender, night: false });
    const nightBattle = run({ attacker, defender, night: true });
    expect(day.defender.wallIntegrity).not.toBeNull();
    expect(nightBattle.defender.wallIntegrity).toBe(day.defender.wallIntegrity);
  });

  /**
   * ⭐ ONARIM ORANI — ölçüm dokümanı çürüttü (2026-07-31, kullanıcının binary koşumu).
   *
   * Oyunun metni *"%50-70 arası"* diyor; 12 gözlem (2 yapı türü × gündüz/gece × 3 koşu)
   * **0,75-0,81** ima ediyor. Kesin dışlama: eski aralık en yüksek değerinde (0,70) 200
   * kuleden yalnız 140 kalan üretebiliyor, orijinalin EN DÜŞÜK ölçümü 152.
   *
   * Bu test aralığı kilitler: bir daha "dokümana dönelim" diye geri alınırsa kırılır.
   */
  it('⭐ yapı onarımı orijinalin ölçülen aralığını üretebilmeli', () => {
    const attacker = side({ elf: 2000 }, {
      archery: 10, blacksmithing: 10, chemistry: 10, instinct: 10,
      sorcery: 10, armor: 10, masonry: 10, talisman: 10,
    });
    const defender = side({ dwarf: 500, archer_tower: 200, mangonel_tower: 100 }, {
      archery: 10, blacksmithing: 10, chemistry: 10, instinct: 10,
      sorcery: 10, armor: 10, masonry: 10, talisman: 10,
    });

    /* Aynı savaşı farklı seed'lerle koş → onarım rulosu bütün aralığı tarasın. */
    const towers: number[] = [];
    for (let i = 0; i < 40; i++) {
      const r = simulate({
        attacker, defender, night: false,
        nightVisionAttacker: 0, nightVisionDefender: 0, seed: `onarim-${i}`,
      });
      towers.push(r.defender.counts['archer_tower'] ?? 0);
    }

    // Orijinalin gündüz okçu kulesi ölçümü: 152-161.
    expect(Math.min(...towers), 'en düşük').toBeGreaterThanOrEqual(150);
    expect(Math.max(...towers), 'en yüksek').toBeLessThanOrEqual(165);
    // Rulo gerçekten rastgele: hep aynı sayı çıkmamalı.
    expect(new Set(towers).size).toBeGreaterThan(1);
  });

  it('gece kapalıyken gece görüşü hiçbir şey değiştirmez', () => {
    const attacker = side({ dwarf: 2500 });
    const defender = side({ dwarf: 3500 });
    const a = run({ attacker, defender, night: false, nightVisionAttacker: 0 });
    const b = run({ attacker, defender, night: false, nightVisionAttacker: 20 });
    expect(b.attacker.alive).toBe(a.attacker.alive);
    expect(b.defender.alive).toBe(a.defender.alive);
  });
});
