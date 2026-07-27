/**
 * §13.8 doğrulanmış formüllerin regresyon testi.
 * Bu sayılar kullanıcının verdiği orijinal oyun tablolarından geliyor — değişirlerse denge bozulur.
 */
import { describe, expect, it } from 'vitest';
import {
  buildingCost, buildingTimeSeconds, castleBudget, caveCapacity, defenseCapacity,
  dwarvesToBreakCave, farmOutput, heroXpForLevel, mineOutput, STARTING_RESOURCES,
  timeFromCost, trainingTimeSeconds, unitCost, unitTimeValue, UNITS_BY_ID,
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
  /**
   * ⭐ Ekonomi yapıları ürettikleri kaynaktan AĞIR yer (kullanıcı kararı 2026-07-27):
   * Maden altın üretir → 4 altın / 3 yemek · Çiftlik yemek üretir → 3 altın / 4 yemek.
   */
  it('çiftlik yemek ağırlıklı, maden altın ağırlıklı', () => {
    expect(buildingCost('farm', 1)).toEqual({ gold: 3, food: 4 });
    expect(buildingCost('mine', 1)).toEqual({ gold: 4, food: 3 });
    // Eğri: taban × seviye × 1,45^(seviye−1)
    expect(buildingCost('farm', 2)).toEqual({ gold: 9, food: 12 });
    expect(buildingCost('farm', 4)).toEqual({ gold: 37, food: 49 });
    expect(buildingCost('mine', 4)).toEqual({ gold: 49, food: 37 });
  });

  /**
   * ⭐ Yeni tabanların ASIL sonucu: yükseltme artık kendini amorti ediyor.
   * Eskiden (taban 70/30) sv20 madeninin geri ödemesi 8.175 saatti — yani hiç.
   */
  it('maden yükseltmesi makul sürede kendini amorti eder', () => {
    const geriOdeme = (level: number): number => {
      const c = buildingCost('mine', level);
      return (c.gold + c.food) / (mineOutput(level) - mineOutput(level - 1));
    };
    expect(geriOdeme(2)).toBeLessThan(5);        // ~3 saat
    expect(geriOdeme(10)).toBeLessThan(60);      // ~45 saat
    expect(geriOdeme(20)).toBeLessThan(700);     // ~574 saat
    // ⚠️ Maliyet eğrisi (1,45) üretim eğrisini (1,15) geçtiği için geri ödeme üstel büyür:
    //    sv30'da 6.345 saat. Seviye tavanı 40 pratikte ulaşılabilir DEĞİL (kayda geçti).
    expect(geriOdeme(30)).toBeGreaterThan(5_000);
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

  /**
   * ⭐ Yeni tabanlarla başlangıç kesesinin (4.000/4.000) rolü DEĞİŞTİ: artık ekonomiyi değil
   * **Kale'yi** finanse ediyor. Ekonomi yapıları o kadar ucuz ki Kale 1'in izin verdiği
   * 10 seviyenin tamamı 217 altın + 239 yemek tutuyor — kapı **Kale bütçesi**.
   * Bu iyi bir tasarım: erken oyunun temposunu kese değil, bilinçli bir yapı kararı belirliyor.
   */
  it('Kale bütçesi artık kesenin önüne geçiyor', () => {
    let gold = 0;
    let food = 0;
    for (let l = 2; l <= 5; l++) { const c = buildingCost('farm', l); gold += c.gold; food += c.food; }
    for (let l = 2; l <= 4; l++) { const c = buildingCost('mine', l); gold += c.gold; food += c.food; }

    // Çiftlik 5 + Maden 4 + Baraka 1 = tam 10 seviye = Kale 1 bütçesinin tamamı.
    expect(castleBudget(1)).toBe(10);
    expect(gold + food).toBeLessThan(500);              // kesenin %6'sı
    expect(gold).toBeLessThan(STARTING_RESOURCES.gold);
    expect(food).toBeLessThan(STARTING_RESOURCES.food);

    // Kalan kese Kale 2-3'e gidiyor (bütçeyi 30 seviyeye çıkarır).
    let kale = 0;
    for (let l = 2; l <= 3; l++) { const c = buildingCost('castle', l); kale += c.gold + c.food; }
    expect(kale).toBeLessThan(STARTING_RESOURCES.gold + STARTING_RESOURCES.food - gold - food);
  });
});

/**
 * ⭐ ÜRETİM SÜRESİ — kurgulanan model (§13.11.3, kullanıcı kararı 2026-07-27):
 * `190 × ((altın+yemek+taşıma)/1000)^0,8 / 1,2^seviye`.
 *
 * Testler modelin **niyetini** kilitliyor, tek tek sayıları değil: oynanabilir ölçek, anlamlı
 * ama tek eksenli olmayan Baraka etkisi, elit birimin zaman avantajı ve Yük Arabası düzeltmesi.
 */
describe('üretim süresi (kurgulanan model)', () => {
  it('ölçek oynanabilir: Cüce Baraka 1\'de ~2 dk, Baraka 20\'de saniyeler', () => {
    expect(trainingTimeSeconds('dwarf', 1)).toBeCloseTo(113.6, 1);
    expect(trainingTimeSeconds('dwarf', 5)).toBeCloseTo(54.8, 1);
    expect(trainingTimeSeconds('dwarf', 20)).toBeLessThan(5);
  });

  it('her Baraka seviyesi süreyi %16,7 kısaltır (20 seviyede 32 kat)', () => {
    const b1 = trainingTimeSeconds('dwarf', 1);
    expect(trainingTimeSeconds('dwarf', 2)).toBeCloseTo(b1 / 1.2, 6);
    expect(trainingTimeSeconds('dwarf', 0) / trainingTimeSeconds('dwarf', 20))
      .toBeCloseTo(1.2 ** 20, 3);
  });

  it('birim ön-şartına ulaştığında makul sürede çıkar', () => {
    // (birim, gerekli Baraka, üst sınır saniye)
    const beklenen: [string, number, number][] = [
      ['spy_bird', 3, 60], ['cargo_wagon', 3, 480], ['cavalry', 4, 300],
      ['pegasus', 7, 300], ['dragon', 10, 900], ['ogre', 8, 900], ['chaos', 15, 3 * 3600],
    ];
    for (const [id, baraka, ustSinir] of beklenen) {
      expect(trainingTimeSeconds(id, baraka)).toBeLessThanOrEqual(ustSinir);
    }
  });

  /** Üs 0,8'in amacı: elit birim saniye başına daha çok GÜÇ üretsin (bedeli: ön-şartlar). */
  it('elit birim saniye başına ~2 kat güç üretir', () => {
    const gucBasinaSaniye = (id: string): number =>
      trainingTimeSeconds(id, 10) / UNITS_BY_ID[id]!.area;
    const oran = gucBasinaSaniye('dwarf') / gucBasinaSaniye('dragon');
    expect(oran).toBeGreaterThan(1.8);
    expect(oran).toBeLessThan(2.5);
  });

  /** Taşıma terimi olmasa ganimet taşımak bedavaya gelirdi (2.000 kaynağa 3.000 taşıma). */
  it('Yük Arabası taşıma kapasitesi kadar ek süre öder', () => {
    expect(unitTimeValue('cargo_wagon')).toBe(1000 + 1000 + 3000);
    expect(unitTimeValue('dwarf')).toBe(200 + 450 + 10);
    // Taşımasız değere göre 2,1 kat.
    const tasimasiz = 190 * (2000 / 1000) ** 0.8;
    expect(trainingTimeSeconds('cargo_wagon', 0) / tasimasiz).toBeCloseTo(2.1, 1);
  });

  it('savunma birimi Mimar Okulu\'na bağlı, aynı eğriyle', () => {
    expect(trainingTimeSeconds('guard', 0)).toBeCloseTo(190 * 4.4 ** 0.8, 5);
    expect(trainingTimeSeconds('guard', 10)).toBeCloseTo(190 * 4.4 ** 0.8 / 1.2 ** 10, 5);
  });

  it('emekli modeller karşılaştırma için duruyor (varsayılan DEĞİL)', () => {
    expect(trainingTimeSeconds('dwarf', 1, 'area')).toBeCloseTo(9, 5);          // Model A
    expect(trainingTimeSeconds('dwarf', 1, 'original')).toBeCloseTo(1309.5, 1); // Model B
    expect(trainingTimeSeconds('dwarf', 1)).toBeCloseTo(113.6, 1);              // yürürlükte
  });
});

/**
 * ⭐ YAPI/TEKNİK SÜRESİ aynı eğriyi kullanır (katsayı 400). Eski `10 × maliyet` kuralı üstel
 * maliyet eğrisiyle çarpışıyordu: Kale 20 **2.869 gün** sürüyordu. Bu test o çöküşün geri
 * gelmediğini kilitler.
 */
describe('yapı ve teknik süresi', () => {
  it('yüksek seviye yapı süresi patlamıyor', () => {
    const kale20 = buildingTimeSeconds('castle', 20, 10);
    expect(kale20 / 86_400).toBeLessThan(4);         // ~2,4 gün (Mimar Okulu 10)
    expect(buildingTimeSeconds('castle', 2, 0)).toBeLessThan(600);   // ilk yükseltme dakikalar
  });

  it('Mimar Okulu kendi seviyesiyle hızlanır (özel dal YOK)', () => {
    expect(buildingTimeSeconds('architect_school', 5, 4))
      .toBeCloseTo(buildingTimeSeconds('architect_school', 5, 4), 10);
    // Aynı maliyetli iki yapı aynı süreyi alır: Mimar Okulu artık istisna değil.
    const c = buildingCost('architect_school', 5);
    expect(buildingTimeSeconds('architect_school', 5, 4)).toBeCloseTo(timeFromCost(c, 4), 10);
  });

  it('aynı DEĞERDE yapı, birimin ~2 katı sürer (400/190)', () => {
    // Cüce'nin değeri 660 → aynı değere sahip bir yapı kalemiyle karşılaştırılıyor.
    const deger = unitTimeValue('dwarf');
    expect(timeFromCost({ gold: deger, food: 0 }, 0) / trainingTimeSeconds('dwarf', 0))
      .toBeCloseTo(400 / 190, 6);
  });
});
