/**
 * §13.5 sefer süresi modeli — planın **örnek cetveli** (§13.5.5) doğrulama ölçütüdür.
 * Cetvel `harita.html`'den üretildi; bu testler portun onunla birebir aynı olduğunu gösterir.
 */
import { describe, expect, it } from 'vitest';
import { armySpeed, distance, mergeMapConfig, route, travelSeconds } from '../src/travel.ts';

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

  /**
   * ⭐ KAHRAMAN DA ÜYEDİR (kullanıcı, 2026-08-03).
   *
   * ⚠️ Bu, kuralın *"kahraman hesaba hiç girmez"* hâlinin neden yıllarca doğru göründüğünü de
   * açıklıyor: kahraman 200, savaşçılar 80-160 → en yavaş hiçbir zaman kahraman olmuyordu.
   * Casus Kuş'un 6000'i varsayımı kırdı; kuş destek görevine katılabilir olunca
   * "9 kuş + 1 kahraman" ordusu 52 SANİYEDE varıyor göründü.
   */
  it('⭐ kahraman orduyu HIZLANDIRMAZ ama YAVAŞLATIR', () => {
    // Savaşçılar zaten kahramandan yavaş → kahraman hiçbir şey değiştirmez.
    expect(armySpeed({ dwarf: 100 }, 1)).toBe(100);
    expect(armySpeed({ cavalry: 10 }, 3)).toBe(140);
    // Kuş kahramandan HIZLI → artık kahramanın hızı geçerli.
    expect(armySpeed({ spy_bird: 9 })).toBe(6000);
    expect(armySpeed({ spy_bird: 9 }, 1)).toBe(200);
    // Kahramansız çağrı eski davranışı aynen korur (geriye uyum).
    expect(armySpeed({ spy_bird: 9 }, 0)).toBe(6000);
  });

  it('kahraman yavaşlatması süreye yansır', () => {
    const leg = route({ k: 1, d: 7, s: 2 }, { k: 1, d: 7, s: 5 });
    const kussuz = travelSeconds({ ...leg, speed: armySpeed({ spy_bird: 9 })! });
    const kahramanli = travelSeconds({ ...leg, speed: armySpeed({ spy_bird: 9 }, 1)! });
    // 6000 → 200 = 30 kat yavaş.
    expect(kahramanli / kussuz).toBeCloseTo(30, 0);
  });
});

describe('⭐ örnek cetvel (§13.5.5, Haritacılık 0)', () => {
  const cuce = (D: number): number => travelSeconds({ distance: D, speed: 100 });
  const suvari = (D: number): number => travelSeconds({ distance: D, speed: 140 });
  const kaos = (D: number): number => travelSeconds({ distance: D, speed: 80 });
  // ⚠️ Kuşa özel bir taban YOK — farkını yalnız 6000 hızından alıyor (2026-08-03).
  const kus = (D: number): number => travelSeconds({ distance: D, speed: 6000 });

  /**
   * ⚠️ Cetvel DAKİKA hassasiyetinde yazılmış (bazı hücreler yuvarlanmış: 49 dk 40 sn → "50 dk").
   * Bu yüzden ölçüt saniye-tam eşitlik değil, **±1 dakika**; formüldeki her gerçek sapma
   * (yanlış sabit, yanlış üs, tabanın unutulması) bu toleransı fazlasıyla aşar.
   */
  const cetvel: [string, number, number, number, number, number][] = [
    // rota                       D        cüce   süvari  kaos    kuş   (dakika)
    ['aynı diyar, komşu şehir',      1,     40,     29,     50,   0.67],
    ['aynı diyar, en uzak',          9,     70,     50,     88,   1.18],
    ['komşu diyar',                 20,     90,     65,    113,   1.52],
    ['10 diyar',                   200,    205,    147,    256,   3.43],
    ['50 diyar',                  1000,    384,    274,    480,   6.4],
    ['komşu kıta / 200 diyar',    4000,    672,    480,    839,  11.2],
    ['3 kıta ötesi',             13400,   1103,    788,   1378,  18.4],
    ['zıt köşe',                 45989,   1440,   1312,   1440,  30.6],
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

  it('⭐ kullanıcı hedefi: komşu şehre Cüce TAM 40 dakikada gider', () => {
    // Kullanıcı 20 dk'yı erken oyunda "hızlı yağma" sarmalı olarak gördü; hedef 35-45 dk.
    expect(fmt(cuce(1))).toBe('40 dk 00 sn');
    expect(fmt(cuce(4000))).toBe('11 sa 11 dk');
  });

  it('⭐ HER ŞEY HIZLA ORANTILI: kuşun süresi ordununkinin tam 1/60\'ı', () => {
    // Kuşa özel taban kalktı → 6000/100 = 60 kat hız, her mesafede 60 kat kısa süre.
    for (const [, D] of cetvel) {
      if (cuce(D) >= 24 * 3600) continue;               // tavana çarpan satırda oran bozulur
      expect(cuce(D) / kus(D)).toBeGreaterThan(58);
      expect(cuce(D) / kus(D)).toBeLessThan(62);
    }
  });

  it('⭐ zıt köşede Cüce ve Kaos TAVANA (24 sa) çarpar, Süvari çarpmaz', () => {
    expect(sa(cuce(45_989))).toBeCloseTo(24, 3);
    expect(sa(kaos(45_989))).toBeCloseTo(24, 3);
    expect(sa(suvari(45_989))).toBeLessThan(24);
  });

  it('Kaos en yavaş birim → Kaos\'lu ordu daima geç varır (stratejik bedel)', () => {
    for (const [, D] of cetvel) expect(kaos(D)).toBeGreaterThanOrEqual(cuce(D));
  });

  it('casus kuş her yerde dakikalar mertebesinde ama asla anlık değil', () => {
    for (const [, D] of cetvel) {
      expect(kus(D)).toBeGreaterThan(0);
      expect(kus(D)).toBeLessThanOrEqual(31 * 60);
    }
  });
});

describe('⭐ TABAN SÜRE: baskın–savunma dengesinin ayar vidası (§13.5.3)', () => {
  it('Haritacılık TABANI etkilemez — komşu şehirde kazanç yalnız %21', () => {
    const l0 = travelSeconds({ distance: 1, speed: 100, cartography: 0 });
    const l15 = travelSeconds({ distance: 1, speed: 100, cartography: 15 });
    expect(dk(l0)).toBeCloseTo(40, 0);
    expect(dk(l15)).toBeCloseTo(31.4, 1);
    // ⭐ Süreler ikiye katlanırken bu oran KORUNDU: "dengeli" eğri seçilmesinin sebebi buydu.
    expect(1 - l15 / l0).toBeCloseTo(0.21, 2);
  });

  it('uzak mesafede aynı Haritacılık %42 kazandırır → SEFER tekniği, baskın tekniği değil', () => {
    const l0 = travelSeconds({ distance: 4000, speed: 100, cartography: 0 });
    const l15 = travelSeconds({ distance: 4000, speed: 100, cartography: 15 });
    expect(sa(l15)).toBeCloseTo(6.54, 1);
    expect(1 - l15 / l0).toBeCloseTo(0.42, 2);
  });

  it('sıfır mesafede bile taban süre geçerlidir — ama o da hıza bölünür', () => {
    expect(travelSeconds({ distance: 0, speed: 100 })).toBe(1200);
    // ⚠️ Kuş için ayrı bir taban YOK: 1200 / 60 = 20 sn.
    expect(travelSeconds({ distance: 0, speed: 6000 })).toBe(20);
  });
});

describe('⭐ diyar/kıta geçiş ek süresi', () => {
  const cfg = mergeMapConfig({ districtCrossSeconds: 600, continentCrossSeconds: 3600 });

  it('varsayılan 0 — açılmadıkça cetvel değişmez', () => {
    const komsuDiyar = { k: 1, d: 2, s: 1 };
    const leg = route({ k: 1, d: 1, s: 1 }, komsuDiyar);
    expect(travelSeconds({ ...leg, speed: 100 }))
      .toBe(travelSeconds({ distance: leg.distance, speed: 100 }));
  });

  it('diyar değişince eklenir, aynı diyarda eklenmez', () => {
    const ayni = route({ k: 1, d: 1, s: 1 }, { k: 1, d: 1, s: 2 }, cfg);
    const farkli = route({ k: 1, d: 1, s: 1 }, { k: 1, d: 2, s: 1 }, cfg);
    expect(ayni.crossesDistrict).toBe(false);
    expect(farkli.crossesDistrict).toBe(true);

    const eksiz = travelSeconds({ ...ayni, speed: 100 }, cfg);
    const ekli = travelSeconds({ distance: ayni.distance, crossesDistrict: true, speed: 100 }, cfg);
    expect(ekli - eksiz).toBe(600);
  });

  it('ek süre Haritacılık\'tan etkilenmez ama HIZA bölünür', () => {
    const taban = { distance: 1, crossesContinent: true } as const;
    const yavas = travelSeconds({ ...taban, speed: 100 }, cfg);
    const hizli = travelSeconds({ ...taban, speed: 200 }, cfg);
    expect(yavas / hizli).toBeCloseTo(2, 5);

    // Haritacılık yalnız yol terimini kısaltır → 3600'lük ek aynen kalır.
    const l0 = travelSeconds({ ...taban, speed: 100, cartography: 0 }, cfg);
    const l15 = travelSeconds({ ...taban, speed: 100, cartography: 15 }, cfg);
    expect(l0 - l15).toBeCloseTo(1200 - 1200 / 1.75, 0);
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
