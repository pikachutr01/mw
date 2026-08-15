/**
 * ⭐ DENGE TEZGÂHININ HESABI — ekranın kendisi test edilemiyor (jsdom/testing-library yok), o
 * yüzden bütün karar `lib/balance-model.ts`te saf fonksiyonlarda ve testi burada.
 *
 * ⚠️ Bu dosyanın asıl işi **formülleri doğrulamak değil** — onların testi `packages/catalog`ta.
 * Buradaki sorular tezgâha özgü: kapılar doğru kapanıyor mu, kilitli kalem toplamdan düşüyor mu,
 * puan tek seferde mi türetiliyor, dünya override'ı satırlara ulaşıyor mu.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATALOG_CONFIG, buildingTimeSeconds, cumulativeBuildingValue, mergeCatalogConfig,
  scaledSeconds,
} from '@mobilwar/catalog';
import {
  EMPTY_STATE, acceleratorInfo, buildingRows, castleUsage, combine, defenseRows, effectiveHeld,
  heroInfo, report, techRows, unitRows, unmetText, type BalanceBundle, type BalanceState,
} from '../src/lib/balance-model.ts';

const bundle = (over: Partial<BalanceBundle> = {}): BalanceBundle => ({
  catalog: DEFAULT_CATALOG_CONFIG,
  combat: { hero: { pointsPerLevel: 3 }, capture: { maxHeroes: 5 } },
  speed: { resource: 1, travel: 1, training: 1, construction: 1 },
  resourcePerPoint: 1000,
  minSeconds: 1,
  catalogHash: 'test',
  revisionId: null,
  ...over,
});

const state = (over: Partial<BalanceState> = {}): BalanceState => ({ ...EMPTY_STATE, ...over });

/**
 * ⭐ Ön-şart zinciri TAM açık bir tezgâh. Testlerin çoğu tek bir kapıyı ölçüyor; zinciri
 * kurmadan ölçmeye çalışmak yanlış sebeple kırmızı verir (ilk yazımda tam bunu yaptım: Baraka
 * kapısını ölçen test, Demircilik'in Akademi'ye bağlı olması yüzünden düşüyordu).
 */
const OPEN: Partial<BalanceState> = {
  buildings: {
    castle: 20, architect_school: 20, academy: 20, barracks: 20,
    cave: 20, temple: 20, teleport: 20, farm: 20, mine: 20,
  },
  techs: {
    archery: 20, blacksmithing: 20, chemistry: 20, instinct: 20, sorcery: 20, armor: 20,
    masonry: 20, talisman: 20, espionage: 20, cartography: 20, colonization: 20, night_vision: 20,
  },
  defenses: { wall: 20, magic_shield: 20 },
};

/** Açık tezgâhtan türetir; `buildings`/`techs` üstüne biner, silmez. */
const open = (over: Partial<BalanceState> = {}): BalanceState => state({
  ...OPEN,
  ...over,
  buildings: { ...OPEN.buildings, ...over.buildings },
  techs: { ...OPEN.techs, ...over.techs },
  defenses: { ...OPEN.defenses, ...over.defenses },
});

const row = (rows: ReturnType<typeof buildingRows>, id: string) => rows.find((r) => r.id === id)!;

/* ═══ Kapılar ═══════════════════════════════════════════════════════════════ */

describe('ön-şart kapıları', () => {
  /** ⭐ Kullanıcının verdiği örnek vaka: 60 Ejderha, sonra Baraka düşürülünce silinmeli. */
  it('Ejderha Baraka 9\'da KİLİTLİ, 10\'da açık', () => {
    const cfg = bundle();
    const kapali = unitRows(open({ buildings: { barracks: 9 }, units: { dragon: 60 } }), cfg);
    expect(row(kapali, 'dragon').locked).toBe(true);
    expect(row(kapali, 'dragon').cum.gold).toBe(0);

    const acik = unitRows(open({ buildings: { barracks: 10 }, units: { dragon: 60 } }), cfg);
    expect(row(acik, 'dragon').locked).toBe(false);
    expect(row(acik, 'dragon').cum.gold).toBeGreaterThan(0);
  });

  /**
   * ⭐⭐ Kilitli satır TOPLAMDAN düşer ama girilen adet DURUMDA kalır — Baraka geri çıkınca
   * hesap aynen döner. Silmek, kaydırıcıyı geri almanın bedelini gereksizce ağırlaştırırdı.
   */
  it('kilitlenince puan toplamdan silinir, adet durumda KALIR', () => {
    const cfg = bundle();
    const dolu = open({ buildings: { barracks: 10 }, units: { dragon: 60 } });
    const acik = report(dolu, cfg);
    expect(acik.groups.units.points).toBeGreaterThan(0);

    const dusuk = { ...dolu, buildings: { ...dolu.buildings, barracks: 9 } };
    const kapali = report(dusuk, cfg);
    expect(kapali.groups.units.points).toBe(0);
    // Durum bozulmadı: adet hâlâ 60.
    expect(dusuk.units['dragon']).toBe(60);
    // Baraka geri çıkınca aynı sayıya dönülüyor.
    expect(report(dolu, cfg).groups.units.points).toBe(acik.groups.units.points);
  });

  /**
   * ⭐ Kilitli kalem ZİNCİRLEME sıfır sayılır: Akademi düşünce Büyücülük geçersizleşir ve
   * Ejderha da kapanır. Yoksa sayfa oyunda mümkün OLMAYAN bir kurulumu geçerli gösterirdi.
   */
  it('Akademi düşünce Büyücülük ve ona bağlı Ejderha da kapanır', () => {
    const cfg = bundle();
    const s = open({ buildings: { barracks: 10 }, units: { dragon: 1 } });
    expect(row(unitRows(s, cfg), 'dragon').locked).toBe(false);

    const kayip = { ...s, buildings: { ...s.buildings, academy: 0 } };
    expect(effectiveHeld(kayip).techs['sorcery']).toBe(0);
    expect(row(techRows(kayip, cfg), 'sorcery').locked).toBe(true);
    expect(row(unitRows(kayip, cfg), 'dragon').locked).toBe(true);
  });

  it('Sur seviyesi savunma biriminin ön-şartını AÇAR', () => {
    const cfg = bundle();
    const s = open({ defenses: { wall: 0, oil_cauldron: 5 } });
    expect(row(defenseRows(s, cfg), 'oil_cauldron').locked).toBe(true);

    const surlu = { ...s, defenses: { ...s.defenses, wall: 3 } };
    expect(row(defenseRows(surlu, cfg), 'oil_cauldron').locked).toBe(false);
  });

  it('eksik ön-şart okunur yazıya çevriliyor', () => {
    const cfg = bundle();
    const r = row(unitRows(open({ buildings: { barracks: 7 } }), cfg), 'dragon');
    expect(unmetText(r.unmet)).toContain('Baraka 10 (7)');
  });
});

/* ═══ Kale bütçesi ══════════════════════════════════════════════════════════ */

describe('Kale seviye bütçesi', () => {
  it('bütçe Kale × 10, Kale kendisi SAYILMAZ', () => {
    const u = castleUsage(state({ buildings: { castle: 2, farm: 5, mine: 4 } }));
    expect(u.budget).toBe(20);
    expect(u.used).toBe(9);
    expect(u.free).toBe(11);
  });

  it('bütçe dolunca yükseltme kapanır ama Kale\'nin kendisi kapanmaz', () => {
    const cfg = bundle();
    // Kale 1 → bütçe 10; Çiftlik 6 + Maden 4 = 10 → dolu.
    const rows = buildingRows(state({ buildings: { castle: 1, farm: 6, mine: 4 } }), cfg);
    expect(row(rows, 'farm').budgetBlocked).toBe(true);
    expect(row(rows, 'castle').budgetBlocked).toBe(false);
  });
});

/* ═══ Kümülatif hesap ═══════════════════════════════════════════════════════ */

describe('kümülatif maliyet', () => {
  /**
   * ⭐ BEKÇİ: tezgâhın altın+yemek toplamı, puanlamanın kendi fonksiyonuyla **birebir** aynı
   * olmalı. İkisi ayrışırsa ekranda görünen puan oyunun verdiği puandan farklı olur.
   */
  it('altın + yemek toplamı `cumulativeBuildingValue` ile AYNI', () => {
    const cfg = bundle();
    for (const [id, level] of [['castle', 7], ['academy', 5], ['farm', 12], ['temple', 3]] as const) {
      const r = row(buildingRows(open({ buildings: { [id]: level } }), cfg), id);
      expect(r.cum.gold + r.cum.food, id).toBe(cumulativeBuildingValue(id, level, cfg.catalog));
    }
  });

  it('Kale\'nin 1. seviyesi BEDAVA — toplam seviye 2\'den başlıyor', () => {
    const cfg = bundle();
    expect(row(buildingRows(open({ buildings: { castle: 1 } }), cfg), 'castle').cum.gold).toBe(0);
    expect(row(buildingRows(open({ buildings: { castle: 2 } }), cfg), 'castle').cum.gold)
      .toBeGreaterThan(0);
  });

  /**
   * ⭐ Puan satır satır DEĞİL, toplam tabandan bir kez türetilir — oyunun `score_base → score`
   * davranışının aynısı. Satır satır yuvarlansaydı her kalemin binlik artığı çöpe giderdi.
   */
  it('puan toplam tabandan TEK SEFERDE türetiliyor', () => {
    const parts = [
      { gold: 600, food: 0, seconds: 0, base: 600, points: 0 },
      { gold: 600, food: 0, seconds: 0, base: 600, points: 0 },
    ];
    // Satır satır olsaydı 0 + 0 = 0 çıkardı; doğrusu 1200 / 1000 = 1.
    expect(combine(parts, 1000).points).toBe(1);
  });
});

/* ═══ Hızlandırıcılar ve çarpanlar ══════════════════════════════════════════ */

describe('hızlandırıcılar', () => {
  it('Mimar Okulu artınca yapı süreleri KISALIYOR', () => {
    const cfg = bundle();
    const yavas = row(buildingRows(open({ buildings: { castle: 5, architect_school: 0 } }), cfg), 'castle');
    const hizli = row(
      buildingRows(open({ buildings: { castle: 5, architect_school: 10 } }), cfg), 'castle',
    );
    expect(hizli.cum.seconds).toBeLessThan(yavas.cum.seconds);
  });

  /**
   * ⭐ Mimar Okulu KENDİNİ hızlandırmaz (`architectSelfExempt`).
   *
   * ⚠️ Bunu "iki farklı Mimar Okulu seviyesini karşılaştır" diye ölçmek İMKÂNSIZ: hızlandırıcı
   * ile inşa edilen yapı aynı satır, seviyeyi değiştirince ölçülen iş de değişiyor. Doğru ölçüm,
   * satırın süresini **bölen 0 geçilmiş** formülle karşılaştırmak — testin ilk hâli bu tuzağa
   * düşüp kendi kendini doğrulayan bir totolojiye dönüşmüştü.
   */
  it('Mimar Okulu kendi süresini kısaltmıyor', () => {
    const cfg = bundle();
    const level = 5;
    const r = row(buildingRows(open({ buildings: { architect_school: level } }), cfg), 'architect_school');
    let beklenen = 0;
    for (let l = 1; l <= level; l++) {
      beklenen += Math.round(scaledSeconds(buildingTimeSeconds('architect_school', l, 0, cfg.catalog), 1));
    }
    expect(r.cum.seconds).toBe(beklenen);
  });

  it('Baraka artınca savaşçı üretimi hızlanıyor', () => {
    const cfg = bundle();
    const s = (barracks: number): BalanceState => open({
      buildings: { barracks }, units: { dwarf: 100 },
    });
    expect(row(unitRows(s(10), cfg), 'dwarf').cum.seconds)
      .toBeLessThan(row(unitRows(s(1), cfg), 'dwarf').cum.seconds);
  });

  /** Dünya hız çarpanı kuyruğun kullandığı formülle birebir uygulanıyor. */
  it('dünya çarpanı `scaledSeconds` ile uygulanıyor', () => {
    const bir = row(buildingRows(open({ buildings: { castle: 3 } }), bundle()), 'castle');
    const on = row(
      buildingRows(open({ buildings: { castle: 3 } }), bundle({
        speed: { resource: 1, travel: 1, training: 1, construction: 10 },
      })), 'castle',
    );
    expect(on.cum.seconds).toBeLessThan(bir.cum.seconds);
    expect(on.cum.seconds).toBeGreaterThanOrEqual(1);
  });
});

/* ═══ Dünya ayarı satırlara ulaşıyor mu ═════════════════════════════════════ */

describe('dünya override\'ı', () => {
  /** ⭐ Tezgâhın bütün varlık sebebi: panelden değişen sabit ekranda görünmeli. */
  it('`techCostMultiplier` değişince teknik fiyatı değişiyor', () => {
    const s = open({ techs: { blacksmithing: 5 } });
    const normal = row(techRows(s, bundle()), 'blacksmithing');
    const ucuz = row(techRows(s, bundle({
      catalog: mergeCatalogConfig({ economy: { techCostMultiplier: 0.5 } }),
    })), 'blacksmithing');
    expect(ucuz.cum.gold).toBeLessThan(normal.cum.gold);
  });

  it('`resourcePerPoint` değişince puan değişiyor', () => {
    const s = open({ buildings: { castle: 6 } });
    const bin = report(s, bundle()).total.points;
    const besyuz = report(s, bundle({ resourcePerPoint: 500 })).total.points;
    expect(besyuz).toBeGreaterThan(bin);
  });

  /** Kahraman puanı UÇTAN geliyor — koda gömülü 3 değil. */
  it('kahraman puanı dünya ayarından', () => {
    const s = state({ heroLevel: 4 });
    expect(heroInfo(s, bundle()).points).toBe(12);
    expect(heroInfo(s, bundle({
      combat: { hero: { pointsPerLevel: 5 }, capture: { maxHeroes: 8 } },
    })).points).toBe(20);
  });

  /** Tapınak diriltmeyi KISALTIR, bedeli ise değiştirmez (bilinçli, katalogda kilitli). */
  it('Tapınak süreyi kısaltır, bedeli değiştirmez', () => {
    const cfg = bundle();
    const az = heroInfo(state({ heroLevel: 5, buildings: { temple: 1 } }), cfg);
    const cok = heroInfo(state({ heroLevel: 5, buildings: { temple: 15 } }), cfg);
    expect(cok.seconds).toBeLessThan(az.seconds);
    expect(cok.cost.gold).toBe(az.cost.gold);
  });
});

/* ═══ Toplam ════════════════════════════════════════════════════════════════ */

describe('toplam', () => {
  it('boş tezgâhta her şey sıfır', () => {
    const t = report(EMPTY_STATE, bundle()).total;
    expect(t).toMatchObject({ gold: 0, food: 0, seconds: 0, base: 0, points: 0 });
  });

  it('grup toplamları genel toplama eşit', () => {
    const cfg = bundle();
    const s = open({
      buildings: { castle: 5, farm: 8, mine: 8, barracks: 4, academy: 3 },
      units: { dwarf: 500 }, defenses: { wall: 3 },
    });
    const r = report(s, cfg);
    const g = r.groups;
    expect(r.total.gold).toBe(g.buildings.gold + g.techs.gold + g.units.gold + g.defenses.gold);
    expect(r.total.base).toBe(g.buildings.base + g.techs.base + g.units.base + g.defenses.base);
  });

  /** `scaledSeconds` katalogdan geliyor — tezgâh kendi kopyasını tutmuyor. */
  it('süre tabanı 1 saniyenin altına inmiyor', () => {
    expect(scaledSeconds(0.2, 100)).toBe(1);
  });

  /**
   * ⭐⭐ HIZLANDIRMA YÜZDESİNİN TABANI (kullanıcı, 2026-08-15).
   *
   * Kullanıcı denge tezgâhında Baraka 1'de *"%17 kısaldı"* yazdığını gördü ve haklı olarak
   * sordu: baraka zaten 1 başlıyorsa, bedava gelen seviye nasıl kazanç sayılıyor?
   * Formül doğruydu, KIYAS NOKTASI yanlıştı. Bu test tabanı kilitliyor.
   */
  it('⭐ Baraka hızlandırması BAŞLANGIÇ seviyesine göre ölçülür (bedava seviye kazanç değil)', () => {
    const cfg = bundle();
    // Oyunun başladığı hâl: Baraka 1 → hiçbir kazanç YOK.
    expect(acceleratorInfo(open({ buildings: { barracks: 1 } }), cfg).barracks.cut).toBe(0);
    // İlk ÖDENEN seviye 2 → tek adımlık kazanç (1,2 bölen ⇒ %16,7).
    const sv2 = acceleratorInfo(open({ buildings: { barracks: 2 } }), cfg).barracks;
    expect(sv2.divisor).toBeCloseTo(1.2, 6);
    expect(sv2.cut).toBeCloseTo(1 - 1 / 1.2, 6);
  });

  /**
   * ⚠️ Akademi ve Mimar Okulu `STARTING_BUILDINGS`te YOK: tabanları 0 ve davranışları
   * değişmemeli. Kaydırma yanlışlıkla genele uygulanırsa burası kırılır.
   */
  it('Akademi/Mimar Okulu tabanı 0 kalır — kaydırma yalnız başlangıç yapılarına', () => {
    const cfg = bundle();
    const a = acceleratorInfo(open({ buildings: { academy: 1, architect_school: 1 } }), cfg);
    expect(a.academy.cut).toBeGreaterThan(0);
    expect(a.architect.cut).toBeGreaterThan(0);
  });
});
