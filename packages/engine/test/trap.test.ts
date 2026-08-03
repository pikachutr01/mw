/**
 * ⭐ TUZAK SALVOSU — patlayan tuzak sayısını ordunun ADEDİ değil AĞIRLIĞI belirler.
 *
 * Kullanıcı orijinal simülatörde (v0.5.5) ölçtü: **1 Kaos ↔ 123 Tuzak → 121 patlıyor, 2 kalıyor.**
 * Bizim motor 123 → 123 veriyordu; doygunluk yer birimlerinin adediyle çarpıldığı için tek
 * birimlik ordu hiçbir tuzağı tetikleyemiyordu. Kural ve binary kanıtı `combat.ts` · `trapVolley`.
 *
 * ⚠️ Testler kesin sayıya değil ARALIĞA bakıyor: tetiklenme oranı %75-99 arası rastgele
 * (binary'nin kendi kuralı). Seed sabit ama denge ayarları değişirse tek bir sayıya çivilenmiş
 * test yanlış yerden kırılırdı.
 */
import { describe, expect, it } from 'vitest';
import { mergeCombatConfig, simulate } from '../src/index.ts';
import type { SimulateInput } from '../src/types.ts';

const vs = (attacker: Record<string, number>, defender: Record<string, number>, seed = 'tuzak'): SimulateInput =>
  ({ seed, attacker: { counts: attacker }, defender: { counts: defender } });

/** Aynı senaryoyu farklı seed'lerle koşturup kalan tuzak aralığını çıkarır. */
function kalanAralik(
  attacker: Record<string, number>, defender: Record<string, number>, n = 40,
): { min: number; max: number } {
  let min = Infinity; let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const r = simulate(vs(attacker, defender, `tuzak-${i}`));
    const kalan = r.defender.counts['trap'] ?? 0;
    if (kalan < min) min = kalan;
    if (kalan > max) max = kalan;
  }
  return { min, max };
}

describe('tuzak salvosu', () => {
  it('⭐ ölçüm: 1 Kaos ↔ 123 Tuzak — tuzakların çoğu patlar', () => {
    const { min, max } = kalanAralik({ chaos: 1 }, { trap: 123 });

    // BASKI = (40.000 + 1.200.000) / 340 = 3647 ≫ 123 → tavan (%75-99) belirleyici.
    // → patlayan 92…121, kalan 2…31. Ölçülen: 2 kaldı.
    expect(min).toBeGreaterThanOrEqual(1);
    expect(max).toBeLessThanOrEqual(32);
    // Eski hata tam olarak buydu: hiç tuzak patlamıyordu.
    expect(max, '123 → 123 hatası geri geldi').toBeLessThan(123);
  });

  it('⭐ arşiv ölçümü: 1000 Tuzak, 1200 Elf ordusunu TEK TURDA siler', () => {
    // docs/arsiv/DOGRULAMA_DURUMU.md:244 — "orij 1 TURDA 1200 elf öldürür, kendi 30-250 kalır".
    const r = simulate(vs({ elf: 1200 }, { trap: 1000 }, 'elf'));
    expect(r.turns).toBe(1);
    expect(r.attacker.counts['elf'] ?? 0).toBeLessThan(150);
    const kalan = r.defender.counts['trap'] ?? 0;
    expect(kalan).toBeGreaterThanOrEqual(1);
    expect(kalan).toBeLessThanOrEqual(260);
  });

  it('⚠️ AĞIRLIK kuralı: tek Cüce tarlayı çizmez, tek Kaos süpürür', () => {
    // Cüce  BASKI = (9 + 182) / 340      = 0,56  → yarım tuzak
    // Kaos  BASKI = (40.000 + 1.200.000) / 340 = 3647 → tavan (%75-99) belirleyici
    const cuce = 123 - (simulate(vs({ dwarf: 1 }, { trap: 123 }, 'cuce')).defender.counts['trap'] ?? 0);
    const kaos = 123 - (simulate(vs({ chaos: 1 }, { trap: 123 }, 'kaos')).defender.counts['trap'] ?? 0);

    expect(cuce, 'tek Cüce en fazla bir tuzak tetikler').toBeLessThanOrEqual(1);
    expect(kaos, 'tek Kaos tarlanın çoğunu tetikler').toBeGreaterThanOrEqual(90);
  });

  it('⭐ tuzak hasarına MİTİGASYON uygulanır — zırhlı hedefe işlemez', () => {
    // Kaos'un yakın savunması 40.000; salvo payı ~34.000 → net negatif → hiç kayıp yok.
    const r = simulate(vs({ chaos: 1 }, { trap: 123 }, 'mit'));
    expect(r.attacker.counts['chaos']).toBe(1);
    // Ama tuzaklar yine de tükenir: patlamak için hedefi öldürmesi gerekmiyor.
    expect(r.defender.counts['trap'] ?? 0).toBeLessThan(123);
  });

  it('UÇAN ordu tuzağa basmaz', () => {
    const r = simulate(vs({ dragon: 200 }, { trap: 123 }));
    expect(r.defender.counts['trap']).toBe(123);
  });

  it('Gnom sabotajı hâlâ tuzak eksiltir (saldıran yer birimi olmasa bile)', () => {
    // Gnom `NO_ROUND_LOSS` → tuzağa BASMAZ ama sabote eder; yanında Ejderha uçtuğu için
    // basınç sıfır → düşen tek şey sabotaj.
    const r = simulate(vs({ gnome: 40, dragon: 100 }, { trap: 123 }));
    expect(r.defender.counts['trap']).toBeLessThan(123);
  });

  it('`pressureScale` panelden kısılınca daha az tuzak patlar', () => {
    const girdi = vs({ cavalry: 300 }, { trap: 400 }, 'olcek');
    const tam = simulate(girdi);
    const kisik = simulate(girdi, mergeCombatConfig({ trap: { pressureScale: 0.01 } }));

    const patlayanTam = 400 - (tam.defender.counts['trap'] ?? 0);
    const patlayanKisik = 400 - (kisik.defender.counts['trap'] ?? 0);
    expect(patlayanTam).toBeGreaterThan(0);
    expect(patlayanKisik).toBeLessThan(patlayanTam);
  });

  it('patlayan tuzak ONARILMAZ — savunma tabanı da tuzağı korumaz', () => {
    const r = simulate(vs({ ogre: 500 }, { trap: 300 }));
    // `protectedTypes` içinde trap yok → 4'lük taban uygulanmaz, sıfıra kadar inebilir.
    expect(r.defender.counts['trap']).toBeLessThan(300);
  });
});
