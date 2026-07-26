/**
 * §13.5 sefer süresi modeli — planın **örnek cetveli** (§13.5.5) doğrulama ölçütüdür.
 * Cetvel `harita.html`'den üretildi; bu testler portun onunla birebir aynı olduğunu gösterir.
 */
import { describe, expect, it } from 'vitest';
import { armySpeed, distance, travelSeconds } from '../src/travel.ts';

const dk = (s: number): number => s / 60;
const sa = (s: number): number => s / 3600;

/**
 * Cetveldeki gösterim biçimi (`harita.html`'in `fmt`'si): saat/dakika AŞAĞI yuvarlanır.
 * Cetvelle karşılaştırırken ham saniye değil, oyuncunun gördüğü dize karşılaştırılır.
 */
function fmt(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h} sa ${String(m).padStart(2, '0')} dk`;
  if (m) return `${m} dk ${String(s % 60).padStart(2, '0')} sn`;
  return `${s} sn`;
}

describe('mesafe (§13.5.1)', () => {
  it('kademeli/toplamalı: her basamak süreye yansır', () => {
    expect(distance({ k: 1, d: 1, s: 1 }, { k: 1, d: 1, s: 2 })).toBe(1);
    expect(distance({ k: 1, d: 1, s: 1 }, { k: 1, d: 1, s: 10 })).toBe(9);
    expect(distance({ k: 1, d: 1, s: 1 }, { k: 1, d: 2, s: 1 })).toBe(20);
    expect(distance({ k: 1, d: 1, s: 1 }, { k: 2, d: 1, s: 1 })).toBe(4000);
  });

  it('⭐ "1 kıta + 200 diyar" ile "1 kıta" AYNI DEĞİL (Öklid olsaydı olurdu)', () => {
    const yalnizKita = distance({ k: 1, d: 1, s: 1 }, { k: 2, d: 1, s: 1 });
    const kitaVeDiyar = distance({ k: 1, d: 1, s: 1 }, { k: 2, d: 201, s: 1 });
    expect(kitaVeDiyar).toBe(yalnizKita + 4000);
  });

  it('yön simetriktir', () => {
    const a = { k: 3, d: 120, s: 4 };
    const b = { k: 7, d: 8, s: 9 };
    expect(distance(a, b)).toBe(distance(b, a));
  });
});

describe('ordu hızı = EN YAVAŞ birim (§13.5.5)', () => {
  it('karışık orduda en yavaş belirler', () => {
    expect(armySpeed({ dwarf: 100 })).toBe(100);
    expect(armySpeed({ cavalry: 10, dwarf: 5 })).toBe(100);       // Cüce 100 < Süvari 140
    expect(armySpeed({ cavalry: 10, chaos: 1 })).toBe(80);        // Kaos en yavaş
    expect(armySpeed({ pegasus: 3, dragon: 1 })).toBe(160);
  });

  it('adedi 0 olan birim hızı etkilemez', () => {
    expect(armySpeed({ cavalry: 10, chaos: 0 })).toBe(140);
  });

  it('savunma birimi veya bilinmeyen id sefere çıkamaz → null', () => {
    expect(armySpeed({ ballista: 5 })).toBeNull();
    expect(armySpeed({ wall: 3 })).toBeNull();
    expect(armySpeed({ hayalet_birlik: 1 })).toBeNull();
    expect(armySpeed({})).toBeNull();
  });
});

describe('⭐ örnek cetvel (§13.5.5, Haritacılık 0)', () => {
  const cuce = (D: number): number => travelSeconds({ distance: D, speed: 100 });
  const suvari = (D: number): number => travelSeconds({ distance: D, speed: 140 });
  const kaos = (D: number): number => travelSeconds({ distance: D, speed: 80 });
  const kus = (D: number): number => travelSeconds({ distance: D, speed: 6000, spy: true });

  /**
   * ⚠️ Cetvel DAKİKA hassasiyetinde yazılmış (bazı hücreler yuvarlanmış: 49 dk 40 sn → "50 dk").
   * Bu yüzden ölçüt saniye-tam eşitlik değil, **±1 dakika**; formüldeki her gerçek sapma
   * (yanlış sabit, yanlış üs, tabanın unutulması) bu toleransı fazlasıyla aşar.
   */
  const cetvel: [string, number, number, number, number, number][] = [
    // rota                       D        cüce   süvari  kaos   kuş   (dakika)
    ['aynı diyar, komşu şehir',      1,     20,     17,     22,   2.17],
    ['aynı diyar, en uzak',          9,     37,     30,     44,   2.45],
    ['komşu diyar',                 20,     50,     38,     60,   2.67],
    ['10 diyar',                   200,    124,     91,    153,   3.9],
    ['50 diyar',                  1000,    249,    181,    309,   6],
    ['komşu kıta / 200 diyar',    4000,    463,    334,    577,   9.57],
    ['3 kıta ötesi',             13400,    801,    575,    999,  15],
    ['zıt köşe',                 45989,   1080,   1007,   1080,  25.27],
  ];

  /** ±1 dakika: cetvelin kendi hassasiyeti. */
  const dakikaTut = (actualSeconds: number, tableMinutes: number): void => {
    expect(Math.abs(dk(actualSeconds) - tableMinutes)).toBeLessThanOrEqual(1);
  };

  it.each(cetvel)('%s (D=%i)', (_rota, D, mCuce, mSuvari, mKaos, mKus) => {
    dakikaTut(cuce(D), mCuce);
    dakikaTut(suvari(D), mSuvari);
    dakikaTut(kaos(D), mKaos);
    dakikaTut(kus(D), mKus);
  });

  it('gösterim biçimi cetveldeki gibi okunur', () => {
    expect(fmt(cuce(1))).toBe('20 dk 00 sn');
    expect(fmt(cuce(4000))).toBe('7 sa 43 dk');
    expect(fmt(kus(1))).toBe('2 dk 10 sn');
  });

  it('⭐ zıt köşede Cüce ve Kaos TAVANA (18 sa) çarpar, Süvari çarpmaz', () => {
    expect(sa(cuce(45_989))).toBeCloseTo(18, 3);
    expect(sa(kaos(45_989))).toBeCloseTo(18, 3);
    expect(sa(suvari(45_989))).toBeLessThan(18);
  });

  it('Kaos en yavaş birim → Kaos\'lu ordu daima geç varır (stratejik bedel)', () => {
    for (const [, D] of cetvel) expect(kaos(D)).toBeGreaterThanOrEqual(cuce(D));
  });

  it('casus kuş her yerde dakikalar mertebesinde ama asla anlık değil', () => {
    for (const [, D] of cetvel) {
      expect(kus(D)).toBeGreaterThanOrEqual(120);
      expect(kus(D)).toBeLessThan(30 * 60);
    }
  });
});

describe('⭐ TABAN SÜRE: baskın–savunma dengesinin ayar vidası (§13.5.3)', () => {
  it('Haritacılık TABANI etkilemez — komşu şehirde kazanç yalnız %21', () => {
    const l0 = travelSeconds({ distance: 1, speed: 100, cartography: 0 });
    const l15 = travelSeconds({ distance: 1, speed: 100, cartography: 15 });
    expect(dk(l0)).toBeCloseTo(20, 0);
    expect(dk(l15)).toBeCloseTo(15.7, 1);
    expect(1 - l15 / l0).toBeCloseTo(0.21, 2);
  });

  it('uzak mesafede aynı Haritacılık %42 kazandırır → SEFER tekniği, baskın tekniği değil', () => {
    const l0 = travelSeconds({ distance: 4000, speed: 100, cartography: 0 });
    const l15 = travelSeconds({ distance: 4000, speed: 100, cartography: 15 });
    expect(sa(l15)).toBeCloseTo(4.49, 1);
    expect(1 - l15 / l0).toBeCloseTo(0.42, 2);
  });

  it('sıfır mesafede bile taban süre geçerlidir (ordu toplanır)', () => {
    expect(travelSeconds({ distance: 0, speed: 100 })).toBe(600);
    expect(travelSeconds({ distance: 0, speed: 6000, spy: true })).toBe(120);
  });
});

describe('dünya hız çarpanı (§13.5.6)', () => {
  it('süreyi böler — tavan dahil', () => {
    const x1 = travelSeconds({ distance: 4000, speed: 100 });
    const x5 = travelSeconds({ distance: 4000, speed: 100, speedMultiplier: 5 });
    expect(x5).toBeCloseTo(Math.ceil(x1 / 5), 0);
  });

  it('süre asla 0 olmaz', () => {
    expect(travelSeconds({ distance: 0, speed: 6000, speedMultiplier: 1000 })).toBeGreaterThan(0);
  });
});
