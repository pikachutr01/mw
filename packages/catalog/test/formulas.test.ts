/**
 * §13.8 doğrulanmış formüllerin regresyon testi.
 * Bu sayılar kullanıcının verdiği orijinal oyun tablolarından geliyor — değişirlerse denge bozulur.
 */
import { describe, expect, it } from 'vitest';
import {
  buildingCost, castleBudget, caveCapacity, defenseCapacity, dwarvesToBreakCave,
  farmOutput, heroXpForLevel, mineOutput, trainingTimeSeconds, unitCost, UNITS_BY_ID,
} from '../src/index.ts';

describe('üretim formülleri', () => {
  it('çiftlik: floor(6·L·1,16^L)', () => {
    expect(farmOutput(1)).toBe(6);
    expect(farmOutput(2)).toBe(16);
    expect(farmOutput(4)).toBe(43);
    expect(farmOutput(10)).toBe(264);
    expect(farmOutput(40)).toBe(90_893);
  });

  it('maden: floor(5·L·1,15^L)', () => {
    expect(mineOutput(1)).toBe(5);
    expect(mineOutput(4)).toBe(34);
    expect(mineOutput(10)).toBe(202);
    expect(mineOutput(40)).toBe(53_572);
  });

  it('başlangıç şehri saatte 11 kaynak üretir (§13.11.1a gerekçesi)', () => {
    expect(farmOutput(1) + mineOutput(1)).toBe(11);
  });
});

describe('kahraman tecrübesi', () => {
  it('XP(1)=500, sonrası XP(L−1)×(1+1/√(L−1))', () => {
    expect(heroXpForLevel(1)).toBe(500);
    expect(heroXpForLevel(2)).toBe(1000);
    expect(heroXpForLevel(3)).toBe(1707);
  });
});

describe('mağara', () => {
  it('yıkmak için gereken cüce sayısı', () => {
    expect(dwarvesToBreakCave(1, 0)).toBe(100);
    expect(dwarvesToBreakCave(2, 0)).toBe(150);
    expect(dwarvesToBreakCave(1, 4)).toBe(83);
  });

  it('kapasite 50 × 2^(sv−1)', () => {
    expect(caveCapacity(1)).toBe(50);
    expect(caveCapacity(5)).toBe(800);
  });
});

describe('kapasite kuralları', () => {
  it('savunma kapasitesi 25.000 × 1,30^(Sur−1)', () => {
    expect(defenseCapacity(1)).toBe(25_000);
    expect(defenseCapacity(3)).toBe(42_250);
    expect(defenseCapacity(20)).toBeGreaterThan(3_600_000);
  });

  it('referans savaşın karma savunması Sur 3 kapasitesine sığar', () => {
    const used =
      129 * UNITS_BY_ID['archer_tower']!.area
      + 300 * UNITS_BY_ID['trap']!.area
      + 111 * UNITS_BY_ID['oil_cauldron']!.area
      + 60 * UNITS_BY_ID['mangonel_tower']!.area
      + 33 * UNITS_BY_ID['guard']!.area;
    expect(used).toBe(42_006);
    expect(used).toBeLessThanOrEqual(defenseCapacity(3));
  });

  it('kale bütçesi = Kale × 10', () => {
    expect(castleBudget(1)).toBe(10);
    expect(castleBudget(5)).toBe(50);
  });
});

describe('maliyetler (§13.11.1a başlangıç kesesinin dayanağı)', () => {
  it('çiftlik seviye maliyetleri', () => {
    expect(buildingCost('farm', 1)).toEqual({ gold: 60, food: 40 });
    expect(buildingCost('farm', 2)).toEqual({ gold: 174, food: 116 });
    expect(buildingCost('farm', 3)).toEqual({ gold: 378, food: 252 });
    expect(buildingCost('farm', 4)).toEqual({ gold: 732, food: 488 });
  });

  it('kale 1→5 kümülatif ~7.500 (ittifak kurma eşiği, §13.15)', () => {
    let total = 0;
    for (let l = 2; l <= 5; l++) {
      const c = buildingCost('castle', l);
      total += c.gold + c.food;
    }
    expect(total).toBeGreaterThan(7_000);
    expect(total).toBeLessThan(8_000);
  });

  it('başlangıç kesesi ekonomi 1→4 + baraka 1→2 + 5 cüceyi tam karşılar', () => {
    let gold = 0;
    let food = 0;
    for (let l = 2; l <= 4; l++) {
      for (const b of ['farm', 'mine'] as const) {
        const c = buildingCost(b, l);
        gold += c.gold;
        food += c.food;
      }
    }
    const barracks = buildingCost('barracks', 2);
    gold += barracks.gold;
    food += barracks.food;
    const dwarves = unitCost('dwarf', 5);
    gold += dwarves.gold;
    food += dwarves.food;

    expect(gold).toBeGreaterThan(3900);   // kesenin altın kısmı neredeyse tam biter (3.999)
    expect(gold).toBeLessThanOrEqual(4000);
    expect(food).toBeLessThanOrEqual(4000);
    expect(food).toBeGreaterThan(3500);
  });
});

/**
 * ⭐ ÜRETİM SÜRESİ — Model B (kullanıcı onayı 2026-07-27, `k.java`'nın kendi formülü).
 *
 * Bu blok modelin **iki dayanağını** de kilitliyor: eski ekran görüntülerindeki savaşçı süreleri
 * (o dönemin yarım maliyetleriyle) ve 2015 tarihli Muhafız ekranı (bizim binary maliyetimizle).
 * Biri bozulursa model değişmiş demektir.
 */
describe('üretim süresi (Model B)', () => {
  it('⭐ MUHAFIZ KANITI: 10(a+y)/1,4^16 = 3:22 (images/mobil.png, 2015)', () => {
    // Ekranda 2400 altın + 2000 yemek → katalogdaki binary maliyetin AYNISI.
    const guard = UNITS_BY_ID['guard']!;
    expect([guard.gold, guard.food]).toEqual([2400, 2000]);
    expect(trainingTimeSeconds('guard', 16)).toBeCloseTo(202.02, 2);   // ekranda 3:22
  });

  it('savunma birimi Mimar Okulu\'na, savaşçı Baraka\'ya bağlı', () => {
    // Savunma: her seviye %28,6 kısaltır (1/1,4).
    expect(trainingTimeSeconds('guard', 0)).toBeCloseTo(44_000, 5);
    expect(trainingTimeSeconds('guard', 1)).toBeCloseTo(44_000 / 1.4, 5);
    // Savaşçı: üstel eğri, tam sayı bölmesiyle.
    expect(trainingTimeSeconds('dwarf', 0)).toBeCloseTo(65 ** 0.8 * 65, 5);
    expect(trainingTimeSeconds('dwarf', 1)).toBeCloseTo((65 ** 0.8 * 65) / 1.4, 5);
  });

  it('eski ekran görüntüleri (Baraka 15, o dönemin YARIM maliyetleri) ±%5 tutuyor', () => {
    // Katalogda binary (iki kat) maliyet var; ekranın kendi maliyetiyle formülü doğrudan sınıyoruz.
    const modelB = (gold: number, food: number, barracks: number): number =>
      (Math.floor((gold + food) / 10) ** 0.8 * 65) / 1.4 ** barracks;
    const gozlem: [number, number, number][] = [
      [100, 225, 7],       // Cüce
      [225, 320, 10],      // Elf
      [600, 1200, 26],     // Süvari
      [2000, 1600, 45],    // Pegasus
      [24000, 10000, 271], // Ejderha 4:31
    ];
    for (const [gold, food, gorulen] of gozlem) {
      expect(Math.abs(modelB(gold, food, 15) / gorulen - 1)).toBeLessThan(0.05);
    }
  });

  it('Model A denge düğmesi olarak duruyor (varsayılan DEĞİL)', () => {
    expect(trainingTimeSeconds('dwarf', 1, 'area')).toBeCloseTo(9, 5);
    expect(trainingTimeSeconds('dwarf', 1)).not.toBeCloseTo(9, 1);
  });
});
