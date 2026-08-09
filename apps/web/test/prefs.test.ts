/**
 * ⭐ TERCİHLER (`lib/prefs.ts`) — katalog sözleşmesi + `mobileOnly` filtresi.
 *
 * ⚠️ Projede tarayıcı testi altyapısı yok (`jsdom`/`testing-library` bağımlılığı yok), bu
 * yüzden ekranda karar veren şey saf bir fonksiyona çıkarıldı — `deepLinkAction` ·
 * `matchCityScreen` · `tipReduce` · `placePopover` ile aynı gerekçe.
 */
import { describe, expect, it } from 'vitest';
import { PREFS, visiblePrefs } from '../src/lib/prefs.ts';

describe('PREFS kataloğu', () => {
  it('her kaydın anahtarı benzersiz ve metinleri dolu', () => {
    const keys = PREFS.map((p) => p.key);
    expect(new Set(keys).size, keys.join(',')).toBe(keys.length);
    for (const p of PREFS) {
      expect(p.key.length, p.key).toBeGreaterThan(0);
      expect(p.label.length, p.key).toBeGreaterThan(0);
      expect(p.hint.length, p.key).toBeGreaterThan(0);
    }
  });

  /**
   * ⚠️⚠️ **`index.html` İLE ORTAK SÖZLEŞME.** Açılış betiği ilk boyamadan önce
   * `JSON.parse(localStorage['mw-prefs']).bgImage === true` diye bakıyor, yani "anahtar yoksa
   * arka plan yok" diyor. Buradaki varsayılan `true` yapılırsa iki taraf ayrışır ve arka plan
   * **her açılışta bir kare gecikmeyle belirir** (React mount olana kadar yok). Varsayılanı
   * değiştirmek gerekiyorsa `index.html`teki betik de aynı turda değişmeli.
   */
  it('⭐ arka plan görseli varsayılan KAPALI (index.html açılış betiğiyle ortak kural)', () => {
    const bg = PREFS.find((p) => p.key === 'bgImage');
    expect(bg, 'bgImage tercihi kayboldu — index.html hâlâ onu okuyor').toBeDefined();
    expect(bg?.default).toBe(false);
  });

  /** Kullanıcı şartı: *"Sadece mobilde aktif olsun şimdilik."* */
  it('⭐ arka plan görseli yalnız mobil (mobileOnly)', () => {
    expect(PREFS.find((p) => p.key === 'bgImage')?.mobileOnly).toBe(true);
  });
});

describe('visiblePrefs', () => {
  it('dar ekranda TÜM tercihler çizilir', () => {
    expect(visiblePrefs(true)).toHaveLength(PREFS.length);
  });

  /**
   * ⚠️ Asıl korunan şey bu: geniş ekranda `bgImage` anahtarı çizilirse oyuncuya **hiçbir şey
   * yapmayan bir düğme** verilmiş olur — `index.css`teki kural `< 1024px` ile sınırlı.
   */
  it('⭐ geniş ekranda mobileOnly tercihler ELENİR', () => {
    const wide = visiblePrefs(false);
    expect(wide.some((p) => p.key === 'bgImage')).toBe(false);
    expect(wide.every((p) => p.mobileOnly !== true)).toBe(true);
  });

  it('mobileOnly olmayan tercihler her iki genişlikte de kalır', () => {
    for (const p of PREFS.filter((x) => x.mobileOnly !== true)) {
      expect(visiblePrefs(false).map((x) => x.key), p.key).toContain(p.key);
      expect(visiblePrefs(true).map((x) => x.key), p.key).toContain(p.key);
    }
  });
});
