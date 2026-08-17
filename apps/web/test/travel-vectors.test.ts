/**
 * ⭐⭐ DİLLER ARASI EŞİTLİK KAPISI — sefer matematiği, web tarafı.
 *
 * Kardeşi `apps/mobile/test/core/travel_test.dart`. İkisi de
 * `packages/contracts/fixtures/travel-vectors.json` dosyasını okuyor ve aynı girdilerin aynı
 * sayıyı ürettiğini ölçüyor (`clock-vectors.test.ts` ile aynı desen ve aynı gerekçe).
 *
 * ⚠️⚠️ Burada korunan asıl şey `D^p`: kesirli üs iki dilde son basamakta ayrışabilir ve sonuç
 * `Math.ceil` ile yukarı yuvarlandığı için ekrandaki süre sunucununkinden **bir saniye**
 * sapabilir. Sefer önizlemesiyle gerçek varış anının ayrışması bu depoda üç kez ısırdı.
 *
 * ⚠️ `armySpeed` vektörleri hem katalog id'si hem beklenen hız taşıyor ve bu test **ikisini
 * birden** ölçüyor: Dart tarafı hızları fixture'daki `speeds` haritasından alıyor (katalog
 * Dart'a üretilmiyor), o yüzden o haritanın gerçek katalogla aynı kalması ayrıca doğrulanmalı.
 * Doğrulanmasaydı katalogdaki bir hız değişikliği Dart testini yeşil bırakır, mobil önizleme
 * sessizce yanlışa düşerdi.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { UNITS_BY_ID } from '@mobilwar/catalog';
import { armySpeed, distance, travelSeconds } from '@mobilwar/engine';

interface Coords { k: number; d: number; s: number }

const VECTORS = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../packages/contracts/fixtures/travel-vectors.json', import.meta.url)),
    'utf8',
  ),
) as {
  distance: { ad: string; a: Coords; b: Coords; beklenen: number }[];
  armySpeed: {
    ad: string;
    counts: Record<string, number>;
    speeds: Record<string, number>;
    heroCount: number;
    beklenen: number | null;
  }[];
  travelSeconds: {
    ad: string;
    input: {
      distance: number; speed: number; cartography?: number;
      crossesDistrict?: boolean; crossesContinent?: boolean; speedMultiplier?: number;
    };
    beklenen: number;
  }[];
};

describe('mesafe — ortak vektörler', () => {
  for (const t of VECTORS.distance) {
    it(t.ad, () => {
      expect(distance(t.a, t.b)).toBe(t.beklenen);
    });
  }
});

describe('ordu hızı — ortak vektörler', () => {
  for (const t of VECTORS.armySpeed) {
    it(t.ad, () => {
      expect(armySpeed(t.counts, t.heroCount)).toBe(t.beklenen);
    });
  }

  /**
   * ⚠️ Fixture'daki `speeds` haritası Dart tarafının TEK hız kaynağı. Katalogla ayrışırsa
   * mobil önizleme yanlışa düşer ve Dart testi bunu göremez — kapı burada.
   * ⚠️ Katalogda olmayan id'ler (`wall`, `griffin`) bilerek atlanıyor: onlar "bilinmeyen birim"
   * senaryosunu ölçüyor ve katalogda karşılıkları YOK olmalı.
   */
  it('⭐ fixture hızları gerçek katalogla aynı', () => {
    for (const t of VECTORS.armySpeed) {
      for (const [id, hiz] of Object.entries(t.speeds)) {
        const gercek = UNITS_BY_ID[id]?.speed ?? 0;
        expect(gercek, `${id} hızı fixture ile katalogda ayrışıyor`).toBe(hiz);
      }
    }
  });
});

describe('sefer süresi — ortak vektörler', () => {
  for (const t of VECTORS.travelSeconds) {
    it(t.ad, () => {
      expect(travelSeconds(t.input)).toBe(t.beklenen);
    });
  }
});
