/**
 * ⭐ VARLIK BAŞINA İNCE AYAR (2. nesil Tur 4) — tesisatın davranış sözleşmesi.
 *
 * Bu turun iddiası: *"tesisat kuruldu, hiçbir sayı oynamadı."* Onu `golden-prices.test.ts`
 * ispatlıyor. Buradaki testler ise tesisatın **nasıl davranması gerektiğini** kilitliyor —
 * özellikle **seyreklik sözleşmesini**, çünkü onu kırmak global düğmeleri sessizce öldürür.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATALOG_CONFIG, buildingCost, buildingTimeSeconds, defenseStructureCost,
  mergeCatalogConfig, techCost, techTimeSeconds, UNITS_BY_ID,
} from '../src/index.ts';

describe('seyreklik sözleşmesi', () => {
  it('⭐ varsayılan tuning grupları NEREDEYSE boş — tek kayıt, o da bir KURAL farkı', () => {
    /**
     * Buraya "yardımcı olsun" diye 9 yapının varsayılanını doldurmak,
     * `economy.buildingCostRate`'i sessizce işlevsizleştirirdi: her yapının kendi kaydı
     * olurdu ve global düğme hiçbirine ulaşmazdı.
     *
     * ⚠️ **Tek istisna 2026-08-10'da girdi**: `architect_school:timeFactor = 0,1`. Bu bir denge
     * ince ayarı değil, `k.java:1396-1403`teki KURAL farkının karşılığı — orijinalde Mimar Okulu,
     * diğer yapıların aldığı `×10` süre çarpanını hiç almıyor. Sözleşme korunuyor çünkü kayıt
     * yalnız `timeFactor` ekseninde; `:gold/:food/:rate` boş kaldığı için global düğmeler yaşıyor.
     */
    expect(DEFAULT_CATALOG_CONFIG.buildingTuning).toEqual({ 'architect_school:timeFactor': 0.1 });
    expect(DEFAULT_CATALOG_CONFIG.techTuning).toEqual({});
    // Fiyat eksenleri DOKUNULMAMIŞ olmalı — yoksa global oran sessizce ölür.
    for (const axis of ['gold', 'food', 'rate'] as const) {
      for (const id of Object.keys(DEFAULT_CATALOG_CONFIG.buildingTuning)) {
        expect(id.endsWith(`:${axis}`), `beklenmeyen fiyat kaydı: ${id}`).toBe(false);
      }
    }
  });

  it('⭐ GLOBAL oran, varlığa dokunulmamışken hâlâ çalışıyor', () => {
    const base = buildingCost('castle', 5);
    const cfg = mergeCatalogConfig({ economy: { buildingCostRate: 2.2 } });
    expect(buildingCost('castle', 5, cfg).gold).toBeGreaterThan(base.gold);
    // Çiftlik ayrı eğride (economyCostCurve) — yapı oranından etkilenmemeli.
    expect(buildingCost('farm', 5, cfg)).toEqual(buildingCost('farm', 5));
  });

  it('⭐ VARLIK oranı, global varken KAZANIR', () => {
    const cfg = mergeCatalogConfig({
      economy: { buildingCostRate: 2.2 },
      buildingTuning: { 'castle:rate': 1.5 },
    });
    // Kale kendi oranını kullanır…
    expect(buildingCost('castle', 5, cfg))
      .toEqual(buildingCost('castle', 5, mergeCatalogConfig({ economy: { buildingCostRate: 1.5 } })));
    // …Baraka global 2,2'yi.
    expect(buildingCost('barracks', 5, cfg))
      .toEqual(buildingCost('barracks', 5, mergeCatalogConfig({ economy: { buildingCostRate: 2.2 } })));
  });

  it('bir varlığın ayarı diğerine SIZMIYOR', () => {
    const cfg = mergeCatalogConfig({ buildingTuning: { 'farm:gold': 99 } });
    expect(buildingCost('farm', 2, cfg)).not.toEqual(buildingCost('farm', 2));
    expect(buildingCost('mine', 2, cfg)).toEqual(buildingCost('mine', 2));
  });
});

describe('taban fiyat ve oran', () => {
  it('yapı taban fiyatı yazılabiliyor', () => {
    const cfg = mergeCatalogConfig({ buildingTuning: { 'academy:gold': 500, 'academy:food': 400 } });
    // sv 1 = taban (Akademi oyuna sıfırdan başlar, ilk ödenen seviye 1).
    expect(buildingCost('academy', 1, cfg)).toEqual({ gold: 500, food: 400 });
    expect(buildingCost('academy', 1)).toEqual({ gold: 900, food: 700 });
  });

  it('teknik taban fiyatı ve oranı yazılabiliyor', () => {
    const cfg = mergeCatalogConfig({
      techTuning: { 'archery:gold': 200, 'archery:rate': 2 },
    });
    // base × rate^(sv+1) × techCostMultiplier → 200 × 2² × 0,75 = 600
    // ⚠️ Çarpan 2026-08-14'te 1 → 0,75 oldu; varlık başına taban/oran hâlâ globali eziyor,
    // çarpan ise EN SONDA ve herkese uygulanıyor — bu satır o sıranın bekçisi.
    expect(techCost('archery', 1, cfg).gold).toBe(600);
    expect(techCost('blacksmithing', 1, cfg)).toEqual(techCost('blacksmithing', 1));
  });

  it('fiyat değişince SÜRE de değişiyor (süre maliyetten türüyor)', () => {
    const cfg = mergeCatalogConfig({ buildingTuning: { 'temple:gold': 4000 } });
    expect(buildingTimeSeconds('temple', 1, 0, cfg))
      .toBeGreaterThan(buildingTimeSeconds('temple', 1, 0));
  });
});

describe('süre çarpanı', () => {
  it('⭐ 1,0 varsayılan — çarpansız çağrı hiç etkilenmiyor', () => {
    const cfg = mergeCatalogConfig({ buildingTuning: { 'castle:timeFactor': 1 } });
    expect(buildingTimeSeconds('castle', 5, 3, cfg)).toBe(buildingTimeSeconds('castle', 5, 3));
  });

  it('çarpan süreyi ölçekliyor ama FİYATA dokunmuyor', () => {
    const cfg = mergeCatalogConfig({ buildingTuning: { 'castle:timeFactor': 0.5 } });
    expect(buildingTimeSeconds('castle', 5, 0, cfg))
      .toBeCloseTo(buildingTimeSeconds('castle', 5, 0) * 0.5, 6);
    // ⚠️ Süre çarpanı bir SÜRE düğmesi; maliyeti değiştirmesi sürpriz olurdu.
    expect(buildingCost('castle', 5, cfg)).toEqual(buildingCost('castle', 5));
  });

  it('teknikte de çalışıyor', () => {
    const cfg = mergeCatalogConfig({ techTuning: { 'sorcery:timeFactor': 3 } });
    expect(techTimeSeconds('sorcery', 4, 2, cfg))
      .toBeCloseTo(techTimeSeconds('sorcery', 4, 2) * 3, 6);
  });
});

describe('Sur / Büyü Kalkanı — katalogda tek yer', () => {
  it('⭐ varsayılanla ESKİ formülle birebir aynı', () => {
    for (const id of ['wall', 'magic_shield']) {
      const def = UNITS_BY_ID[id]!;
      for (const l of [1, 2, 5, 10, 20]) {
        expect(defenseStructureCost(id, l)).toEqual({
          gold: Math.round(def.gold * 1.8 ** (l - 1)),
          food: Math.round(def.food * 1.8 ** (l - 1)),
        });
      }
    }
  });

  it('⭐ ARTIK global yapı oranını okuyor — düzeltilen hata', () => {
    /**
     * Bu hesap üç ayrı dosyada çıplak `1.8` ile kopyalanmıştı: yönetici
     * `economy.buildingCostRate`'i değiştirse Sur ve Kalkan hariç her şey değişiyordu.
     */
    const cfg = mergeCatalogConfig({ economy: { buildingCostRate: 2.2 } });
    expect(defenseStructureCost('wall', 5, cfg).gold)
      .toBe(Math.round(UNITS_BY_ID['wall']!.gold * 2.2 ** 4));
  });

  it('⭐ fiyat ÇARPANINI da okuyor — ikinci yarısı', () => {
    const cfg = mergeCatalogConfig({ economy: { buildingCostMultiplier: 2 } });
    expect(defenseStructureCost('wall', 1, cfg).gold).toBe(UNITS_BY_ID['wall']!.gold * 2);
  });

  it('seviye 0 bedava, bilinmeyen yapı hata', () => {
    expect(defenseStructureCost('wall', 0)).toEqual({ gold: 0, food: 0 });
    expect(() => defenseStructureCost('kale_kapisi', 1)).toThrow();
  });
});
