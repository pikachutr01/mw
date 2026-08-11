/**
 * ⭐ MAĞARA MODALI — kahraman seçim havuzu (§13.20.6).
 *
 * ⚠️ Bu dosyanın doğuş sebebi **gerçek bir çökme**: 2026-08-11'de «Mağara Boşalt» sekmesine
 * basınca ekran gitti — `Cannot read properties of undefined (reading 'length')`. Liste
 * doğrudan `cave.heroes`e bağlıydı ve o alan yanıtta yoktu (API eski sürümü koşuyordu).
 * Buradaki testler aynı hatanın **sessizce geri gelmesini** engelliyor.
 */
import { describe, expect, it } from 'vitest';
import { caveHeroPool, keepPickedHeroes, type HeroWithState } from '../src/lib/cave-picker.ts';

const hero = (id: number, state: string): HeroWithState =>
  ({ id, name: `K${id}`, level: id, state });

describe('caveHeroPool', () => {
  it('⭐⭐ eksik dizide ÇÖKMEZ, boş liste döner (yuvarlanan dağıtım / bayat önbellek)', () => {
    expect(caveHeroPool('withdraw', undefined, undefined)).toEqual([]);
    expect(caveHeroPool('store', undefined, undefined)).toEqual([]);
    // Sunucu alanı hiç göndermezse `undefined`, eski bir kayıt `null` da olabilir.
    expect(caveHeroPool('withdraw', null, null)).toEqual([]);
  });

  it('doldurmada YALNIZ «Şehirde» olanlar seçilebilir (Java: u == 2)', () => {
    const list = [
      hero(1, 'in_city'), hero(2, 'on_mission'), hero(3, 'dead'),
      hero(4, 'reviving'), hero(5, 'returning'), hero(6, 'in_city'),
    ];
    expect(caveHeroPool('store', list, []).map((h) => h.id)).toEqual([1, 6]);
  });

  it('⭐ mağaradaki ve mağaraya GİRMEK ÜZERE olan kahraman doldurmada seçilemez', () => {
    /**
     * `entering_cave` düşmesi rezervasyon kuralının (§13.20.2c) ekran ayağı: mağara emrinde
     * zaten söz verilmiş kahraman ikinci kez seçilememeli. Ayrı bir süzgeç yazmadık — durum
     * adının kendisi kuralı taşıyor, bu test de onu kilitliyor.
     */
    const list = [hero(1, 'in_cave'), hero(2, 'entering_cave'), hero(3, 'leaving_cave')];
    expect(caveHeroPool('store', list, [])).toEqual([]);
  });

  it('boşaltmada kaynak MAĞARA listesidir, şehirdekiler değil', () => {
    const inCity = [hero(1, 'in_city')];
    const inCave = [{ id: 9, name: 'Bora', level: 4 }];
    expect(caveHeroPool('withdraw', inCity, inCave)).toEqual(inCave);
  });

  it('döndürülen dizi KOPYADIR — çağıranın state\'i kazara değişmesin', () => {
    const inCave = [{ id: 9, name: 'Bora', level: 4 }];
    const pool = caveHeroPool('withdraw', [], inCave);
    pool.push({ id: 10, name: 'X', level: 0 });
    expect(inCave).toHaveLength(1);
  });
});

describe('keepPickedHeroes', () => {
  it('havuzdan düşen seçim de düşer (arka planda tazelenen sorgu)', () => {
    const pool = [{ id: 1, name: 'A', level: 1 }, { id: 3, name: 'C', level: 3 }];
    expect(keepPickedHeroes([1, 2, 3], pool)).toEqual([1, 3]);
  });

  it('boş havuzda seçim tamamen temizlenir', () => {
    expect(keepPickedHeroes([1, 2], [])).toEqual([]);
  });
});
