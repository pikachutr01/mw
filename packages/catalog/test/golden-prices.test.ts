/**
 * ⭐ ALTIN FİYAT TABLOSU — katalog çalışmasının **tek taşıyıcı kanıtı**.
 *
 * Sıradaki iş (yapı/teknik başına maliyet ve büyüme oranı) katalog formüllerinin içine giriyor
 * ve iddiası şu: *"varsayılan ayarlarla hiçbir sayı değişmiyor."* Bu dosya o iddiayı tek
 * çağrıda ispatlıyor — her yapı, her teknik ve Sur/Kalkan için beklenen `{altın, yemek,
 * saniye}` üçlüleri **elle yazılmış**.
 *
 * ⚠️ **Snapshot KULLANILMADI.** `vitest -u` bir snapshot'ı sessizce yeniden yazar ve regresyon
 * kanıtı, kanıtladığı şeyle birlikte kayar. Literal sayı böyle bir kaza kabul etmiyor.
 *
 * ⚠️ Bu sayılar 2026-08-01'de, katalog tesisatı değiştirilmeden ÖNCE ölçüldü.
 */
import { describe, expect, it } from 'vitest';
import {
  BUILDINGS, TECHS, UNITS_BY_ID,
  buildingCost, buildingTimeSeconds, techCost, techTimeSeconds,
} from '../src/index.ts';

/** `[seviye, altın, yemek, saniye]` — Mimar Okulu / Akademi seviyesi 0 kabul edilerek. */
type Row = readonly [number, number, number, number];

const BUILDING_GOLDEN: Record<string, readonly Row[]> = {
  castle: [[1, 111, 83, 108], [2, 200, 150, 173], [5, 1166, 875, 708],
    [10, 22040, 16530, 7431], [20, 7869282, 5901961, 818914]],
  barracks: [[1, 67, 44, 69], [2, 120, 80, 110], [5, 700, 467, 453],
    [10, 13224, 8816, 4749], [20, 4721569, 3147713, 523369]],
  farm: [[1, 1, 2, 4], [2, 3, 4, 8], [5, 18, 24, 32],
    [10, 147, 196, 170], [20, 5087, 6782, 2895]],
  mine: [[1, 2, 1, 4], [2, 4, 3, 8], [5, 24, 18, 32],
    [10, 196, 147, 170], [20, 6782, 5087, 2895]],
  academy: [[1, 250, 180, 204], [2, 450, 324, 326], [5, 2624, 1890, 1336],
    [10, 49590, 35705, 14022], [20, 17705884, 12748236, 1545172]],
  architect_school: [[1, 180, 120, 153], [2, 324, 216, 244], [5, 1890, 1260, 1002],
    [10, 35705, 23803, 10513], [20, 12748236, 8498824, 1158508]],
  cave: [[1, 150, 100, 132], [2, 270, 180, 211], [5, 1575, 1050, 866],
    [10, 29754, 19836, 9086], [20, 10623530, 7082353, 1001277]],
  temple: [[1, 400, 300, 301], [2, 720, 540, 481], [5, 4199, 3149, 1972],
    [10, 79344, 59508, 20706], [20, 28329414, 21247060, 2281815]],
  teleport: [[1, 500000, 500000, 100475], [2, 900000, 900000, 160797],
    [5, 5248800, 5248800, 659071], [10, 99179645, 99179645, 6918661],
    [20, 35411767268, 35411767268, 762433673]],
};

const TECH_GOLDEN: Record<string, readonly Row[]> = {
  archery: [[1, 225, 225, 211], [5, 1139, 1139, 773], [10, 8650, 8650, 3913],
    [20, 498789, 498789, 100281]],
  blacksmithing: [[1, 225, 225, 211], [5, 1139, 1139, 773], [10, 8650, 8650, 3913],
    [20, 498789, 498789, 100281]],
  chemistry: [[1, 450, 360, 338], [5, 2278, 1823, 1237], [10, 17300, 13840, 6262],
    [20, 997577, 798062, 160485]],
  instinct: [[1, 675, 563, 475], [5, 3417, 2848, 1736], [10, 25949, 21624, 8789],
    [20, 1496366, 1246971, 225260]],
  sorcery: [[1, 450, 360, 338], [5, 2278, 1823, 1237], [10, 17300, 13840, 6262],
    [20, 997577, 798062, 160485]],
  armor: [[1, 225, 225, 211], [5, 1139, 1139, 773], [10, 8650, 8650, 3913],
    [20, 498789, 498789, 100281]],
  masonry: [[1, 563, 450, 404], [5, 2848, 2278, 1479], [10, 21624, 17300, 7486],
    [20, 1246971, 997577, 191851]],
  talisman: [[1, 563, 450, 404], [5, 2848, 2278, 1479], [10, 21624, 17300, 7486],
    [20, 1246971, 997577, 191851]],
  espionage: [[1, 270, 180, 211], [5, 1367, 911, 773], [10, 10380, 6920, 3913],
    [20, 598546, 399031, 100281]],
  cartography: [[1, 270, 180, 211], [5, 1367, 911, 773], [10, 10380, 6920, 3913],
    [20, 598546, 399031, 100281]],
  colonization: [[1, 900, 675, 575], [5, 4556, 3417, 2106], [10, 34599, 25949, 10660],
    [20, 1995154, 1496366, 273194]],
  night_vision: [[1, 675, 563, 475], [5, 3417, 2848, 1736], [10, 25949, 21624, 8789],
    [20, 1496366, 1246971, 225260]],
};

/**
 * ⚠️ Sur ve Büyü Kalkanı `buildings.ts`te DEĞİL, `units.ts`te duruyor ve maliyetleri bugün
 * **katalogda değil API'de** hesaplanıyor — üç ayrı dosyada çıplak `1.8` literaliyle
 * (`queue.service`, `city.controller`, `score.service`). Bu tablo o formülün BUGÜNKÜ çıktısı;
 * hesap katalogda tek bir yere taşındığında değişmemesi gereken sayılar bunlar.
 */
const STRUCTURE_GOLDEN: Record<string, readonly (readonly [number, number, number])[]> = {
  wall: [[1, 960, 980], [2, 1728, 1764], [5, 10078, 10288],
    [10, 190425, 194392], [20, 67990593, 69407064]],
  magic_shield: [[1, 8000, 2000], [2, 14400, 3600], [5, 83981, 20995],
    [10, 1586874, 396719], [20, 566588276, 141647069]],
};

describe('altın tablo — yapılar', () => {
  it('her yapının her seviyesinde fiyat ve süre SABİT', () => {
    for (const b of BUILDINGS) {
      const rows = BUILDING_GOLDEN[b.id];
      expect(rows, `${b.id} için altın satır yok — yeni yapı mı eklendi?`).toBeTruthy();
      for (const [level, gold, food, seconds] of rows!) {
        const c = buildingCost(b.id, level);
        expect(c.gold, `${b.id} sv${level} altın`).toBe(gold);
        expect(c.food, `${b.id} sv${level} yemek`).toBe(food);
        expect(Math.round(buildingTimeSeconds(b.id, level, 0)), `${b.id} sv${level} süre`)
          .toBe(seconds);
      }
    }
  });

  it('katalogdaki her yapı tabloda var (yeni yapı sessizce kapsam dışı kalmasın)', () => {
    expect(BUILDINGS.map((b) => b.id).sort()).toEqual(Object.keys(BUILDING_GOLDEN).sort());
  });
});

describe('altın tablo — teknikler', () => {
  it('her tekniğin her seviyesinde fiyat ve süre SABİT', () => {
    for (const t of TECHS) {
      const rows = TECH_GOLDEN[t.id];
      expect(rows, `${t.id} için altın satır yok`).toBeTruthy();
      for (const [level, gold, food, seconds] of rows!) {
        const c = techCost(t.id, level);
        expect(c.gold, `${t.id} sv${level} altın`).toBe(gold);
        expect(c.food, `${t.id} sv${level} yemek`).toBe(food);
        expect(Math.round(techTimeSeconds(t.id, level, 0)), `${t.id} sv${level} süre`)
          .toBe(seconds);
      }
    }
  });

  it('katalogdaki her teknik tabloda var', () => {
    expect(TECHS.map((t) => t.id).sort()).toEqual(Object.keys(TECH_GOLDEN).sort());
  });
});

describe('altın tablo — Sur ve Büyü Kalkanı', () => {
  /**
   * ⚠️ Bugün bu hesap katalogda YOK; API'de üç kopya hâlinde duruyor. Test o kopyaların
   * ürettiği sayıyı burada sabitliyor ki hesap katalogda tek yere taşındığında **hiçbir
   * seviyede** sapma olmadığı ispatlanabilsin.
   */
  it('taban × 1,8^(sv−1) — mevcut davranış', () => {
    for (const [id, rows] of Object.entries(STRUCTURE_GOLDEN)) {
      const def = UNITS_BY_ID[id]!;
      for (const [level, gold, food] of rows) {
        expect(Math.round(def.gold * 1.8 ** (level - 1)), `${id} sv${level} altın`).toBe(gold);
        expect(Math.round(def.food * 1.8 ** (level - 1)), `${id} sv${level} yemek`).toBe(food);
      }
    }
  });
});
