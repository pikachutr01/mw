/**
 * ⭐⭐ ŞEHİR SAYAÇLARI — üretim bandı ve kaynak ekstrapolasyonu.
 *
 * **Neden şimdi yazıldı:** iki hesabın da bugüne kadar HİÇ testi yoktu, çünkü ikisi de bir JSX
 * bileşeninin içine gömülüydü (`City.tsx`, `Shell.tsx`). Mobil port ikisini de
 * `lib/city-progress.ts`e çıkardı ve ilk kez sınanabilir hâle getirdi — oysa `unitProgress`
 * **canlıda kullanıcının bildirdiği bir hatanın** düzeltmesiydi (2026-07-28) ve o düzeltmeyi
 * koruyan hiçbir şey yoktu.
 *
 * ⭐⭐ Vektörler `packages/contracts/fixtures/city-progress-vectors.json`ta ve Dart testi
 * **aynı dosyayı** okuyor: iki istemcinin bu sayaçlarda ayrışması, aynı şehri iki cihazdan
 * açan oyuncuya iki farklı asker sayısı göstermek olurdu.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extrapolateResources, unitProgress } from '../src/lib/city-progress.ts';

const VECTORS = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../packages/contracts/fixtures/city-progress-vectors.json', import.meta.url)),
    'utf8',
  ),
) as {
  unitProgress: {
    ad: string; startedAt: string; now: string; count: number | null;
    perUnitSeconds: number | null;
    beklenen: null | {
      produced: number; remaining: number; finished: boolean;
      unitStart: string; unitEnd: string;
    };
  }[];
  resources: {
    ad: string; gold: number; food: number; goldPerHour: number; foodPerHour: number;
    serverNow: string; now: string; beklenen: { gold: number; food: number };
  }[];
};

describe('⭐⭐ ortak vektörler — üretim bandı', () => {
  it.each(VECTORS.unitProgress)('$ad', (v) => {
    const got = unitProgress(
      { startedAt: v.startedAt, count: v.count, perUnitSeconds: v.perUnitSeconds },
      Date.parse(v.now),
    );

    if (v.beklenen === null) {
      expect(got).toBeNull();
      return;
    }
    expect(got).not.toBeNull();
    expect(got!.produced).toBe(v.beklenen.produced);
    expect(got!.remaining).toBe(v.beklenen.remaining);
    expect(got!.finished).toBe(v.beklenen.finished);
    expect(got!.unitStart).toBe(Date.parse(v.beklenen.unitStart));
    expect(got!.unitEnd).toBe(Date.parse(v.beklenen.unitEnd));
  });
});

describe('⭐⭐ ortak vektörler — kaynak sayacı', () => {
  it.each(VECTORS.resources)('$ad', (v) => {
    const got = extrapolateResources(
      {
        gold: v.gold, food: v.food,
        goldPerHour: v.goldPerHour, foodPerHour: v.foodPerHour,
        serverNow: v.serverNow,
      },
      Date.parse(v.now),
    );
    // ⚠️ `toBe` — `toBeCloseTo` DEĞİL. İki dil de IEEE754 double kullanıyor ve işlem sırası
    // aynı; yaklaşık karşılaştırma tam olarak yakalamak istediğimiz farkı gizlerdi.
    expect(got.gold).toBe(v.beklenen.gold);
    expect(got.food).toBe(v.beklenen.food);
  });
});

describe('sözleşme bütünlüğü', () => {
  it('⚠️ vektör dosyası gerçekten okundu (sessiz boş küme değil)', () => {
    expect(VECTORS.unitProgress.length).toBeGreaterThan(8);
    expect(VECTORS.resources.length).toBeGreaterThan(5);
  });

  /**
   * ⚠️ Sunucunun `done`/`remaining` alanları bilerek KULLANILMIYOR (bayat). Bu test o kararı
   * kilitliyor: girdi tipinde o alanlar hiç yok, yani biri onları okumaya kalksa derlenmez.
   * Burada ölçülen şey ise hesabın gerçekten yalnız `startedAt`e dayandığı.
   */
  it('⭐ çıpa YALNIZ `startedAt` — aynı girdiye aynı cevap, geçmişten bağımsız', () => {
    const q = { startedAt: '2026-08-15T12:00:00.000Z', count: 10, perUnitSeconds: 60 };
    const now = Date.parse('2026-08-15T12:05:00.000Z');
    expect(unitProgress(q, now)).toEqual(unitProgress(q, now));
    expect(unitProgress(q, now)!.produced).toBe(5);
  });
});
