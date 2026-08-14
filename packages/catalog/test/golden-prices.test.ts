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
 *
 * ⚠️⚠️ **2026-08-10'da TAMAMI YENİDEN ÜRETİLDİ** — ekonomi yeniden dengelemesi (taban fiyatlar
 * ~5-6 kat, Çiftlik/Maden oranı 1,33 → 1,45, yapı süre üssü 0,80 → 0,95, Mimar Okulu'na Java'nın
 * `×10`'unun karşılığı olan `timeFactor 0,1`). Yeni sayılar **koddan üretilip yapıştırılmadı**:
 * formüller ayrı bir dilde bağımsız olarak yeniden yazılıp öyle hesaplandı, sonra bu tablo
 * TypeScript'in çıktısıyla karşılaştırıldı. Kopyalasaydık test kendi kendini doğrulardı.
 */
import { describe, expect, it } from 'vitest';
import {
  BUILDINGS, TECHS, UNITS_BY_ID,
  buildingCost, buildingTimeSeconds, techCost, techTimeSeconds,
} from '../src/index.ts';

/** `[seviye, altın, yemek, saniye]` — Mimar Okulu / Akademi seviyesi 0 kabul edilerek. */
type Row = readonly [number, number, number, number];

const BUILDING_GOLDEN: Record<string, readonly Row[]> = {
  castle: [[1, 500, 389, 358], [2, 900, 700, 625], [5, 5249, 4082, 3338],
    [10, 99180, 77140, 54456], [20, 35411767, 27542486, 14492183]],
  /**
   * ⚠️⚠️ **Baraka satırı İKİ KEZ kaydı ve her ikisinde de tesisat değişmedi** — kayan tek şey
   * `STARTING_BUILDINGS`teki başlangıç seviyesi:
   *   • 2026-08-09: baraka 0'dan başlasın → taban sv2'den **sv1'e** indi, eğri 1,8 katına çıktı.
   *   • 2026-08-12: karar geri alındı, baraka yine 1 → taban **sv2'ye** döndü, eğri 1/1,8'e indi.
   * ⭐ İkisinde de tek bir sayı elle düzeltilmedi: `buildingCost` `firstPaid`i
   * `STARTING_BUILDINGS`ten türetiyor. Bu satır o türetmenin bekçisi — bozulursa oyuncunun
   * ekranda gördüğü ilk fiyat, tasarımda kararlaştırılan sayı olmaktan çıkar.
   * ⚠️ sv1 artık oyuncunun HİÇ ödemediği seviye (Kale/Çiftlik/Maden gibi); yine de kilitli ki
   * ölçekleme sessizce kaymasın.
   */
  barracks: [[1, 389, 278, 272], [2, 700, 500, 476], [5, 4082, 2916, 2540],
    [10, 77140, 55100, 41434], [20, 27542486, 19673204, 11026610]],
  /**
   * ⚠️ Çiftlik/Maden sv1 satırı oyunda GÖRÜNMEZ (ikisi de seviye 1 başlıyor); taban `sv1→2`nin
   * fiyatı, yani gerçek ilk satır sv2. sv1 yine de kilitleniyor ki `firstPaid` ölçeklemesi
   * sessizce kaymasın.
   */
  farm: [[1, 3, 4, 4], [2, 9, 12, 10], [5, 69, 91, 70],
    [10, 879, 1172, 791], [20, 72255, 96340, 52187]],
  mine: [[1, 4, 3, 4], [2, 12, 9, 10], [5, 91, 69, 70],
    [10, 1172, 879, 791], [20, 96340, 72255, 52187]],
  /**
   * ⚠️ **2026-08-14: taban 1400/1000 → 900/700** (Kale ile eşitlendi, gerekçe `buildings.ts`).
   * Süreler de düştü çünkü süre maliyetten türüyor — iki sütun birlikte kaydı.
   */
  academy: [[1, 900, 700, 625], [2, 1620, 1260, 1093], [5, 9448, 7348, 5835],
    [10, 178523, 138852, 95182], [20, 63741181, 49576474, 25330438]],
  /**
   * ⚠️ Süreler diğerlerinin **onda biri** — Mimar Okulu `buildingTuning.architect_school:timeFactor
   * = 0,1` taşıyor ve o sayı `k.java:1396-1403`teki `×10`'un karşılığı: orijinalde Mimar Okulu,
   * diğer yapıların aldığı `10 ×` çarpanını almıyor. Bu satır 0,1'i kaybedersek kırılır.
   */
  architect_school: [[1, 1000, 1000, 77], [2, 1800, 1800, 135], [5, 10498, 10498, 721],
    [10, 198359, 198359, 11766], [20, 70823535, 70823535, 3131174]],
  cave: [[1, 900, 600, 588], [2, 1620, 1080, 1028], [5, 9448, 6299, 5488],
    [10, 178523, 119016, 89521], [20, 63741181, 42494121, 23824040]],
  temple: [[1, 2000, 1500, 1315], [2, 3600, 2700, 2298], [5, 20995, 15746, 12273],
    [10, 396719, 297539, 200219], [20, 141647069, 106235302, 53283574]],
  teleport: [[1, 500000, 500000, 283178], [2, 900000, 900000, 494959],
    [5, 5248800, 5248800, 2642990], [10, 99179645, 99179645, 43116144],
    [20, 35411767268, 35411767268, 11474366262]],
};

const TECH_GOLDEN: Record<string, readonly Row[]> = {
  archery: [[1, 1013, 900, 741], [5, 5126, 4556, 3457], [10, 38924, 34599, 23723],
    [20, 2244548, 1995154, 1116937]],
  blacksmithing: [[1, 900, 788, 658], [5, 4556, 3987, 3070], [10, 34599, 30274, 21063],
    [20, 1995154, 1745760, 991719]],
  chemistry: [[1, 788, 675, 574], [5, 3987, 3417, 2679], [10, 30274, 25949, 18386],
    [20, 1745760, 1496366, 865662]],
  instinct: [[1, 1463, 1238, 1028], [5, 7404, 6265, 4797], [10, 56223, 47574, 32918],
    [20, 3242125, 2743337, 1549897]],
  sorcery: [[1, 1350, 1125, 946], [5, 6834, 5695, 4417], [10, 51899, 43249, 30307],
    [20, 2992731, 2493943, 1426933]],
  armor: [[1, 1575, 1575, 1190], [5, 7973, 7973, 5554], [10, 60548, 60548, 38110],
    [20, 3491520, 3491520, 1794330]],
  masonry: [[1, 1238, 1013, 865], [5, 6265, 5126, 4035], [10, 47574, 38924, 27683],
    [20, 2743337, 2244548, 1303409]],
  talisman: [[1, 1575, 1350, 1109], [5, 7973, 6834, 5176], [10, 60548, 51899, 35519],
    [20, 3491520, 2992731, 1672349]],
  espionage: [[1, 675, 563, 490], [5, 3417, 2848, 2286], [10, 25949, 21624, 15687],
    [20, 1496366, 1246971, 738627]],
  cartography: [[1, 563, 450, 405], [5, 2848, 2278, 1890], [10, 21624, 17300, 12965],
    [20, 1246971, 997577, 610425]],
  colonization: [[1, 2700, 2250, 1828], [5, 13669, 11391, 8533], [10, 103797, 86498, 58549],
    [20, 5985462, 4987885, 2756653]],
  night_vision: [[1, 1125, 1013, 823], [5, 5695, 5126, 3843], [10, 43249, 38924, 26367],
    [20, 2493943, 2244548, 1241418]],
};

/**
 * ⚠️ Sur ve Büyü Kalkanı `buildings.ts`te DEĞİL, `units.ts`te duruyor ve maliyetleri bugün
 * **katalogda değil API'de** hesaplanıyor — üç ayrı dosyada çıplak `1.8` literaliyle
 * (`queue.service`, `city.controller`, `score.service`). Bu tablo o formülün BUGÜNKÜ çıktısı;
 * hesap katalogda tek bir yere taşındığında değişmemesi gereken sayılar bunlar.
 */
const STRUCTURE_GOLDEN: Record<string, readonly (readonly [number, number, number])[]> = {
  wall: [[1, 2500, 2500], [2, 4500, 4500], [5, 26244, 26244],
    [10, 495898, 495898], [20, 177058836, 177058836]],
  magic_shield: [[1, 12000, 3000], [2, 21600, 5400], [5, 125971, 31493],
    [10, 2380311, 595078], [20, 849882414, 212470604]],
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
