/**
 * ⭐ KATALOG ÖZETİ — geriye uyumun tek gerçek koruması.
 *
 * `battles.catalog_hash` her savaş kaydında saklanıyor ve "o savaş hangi dengeyle çözüldü"
 * sorusunun cevabı bu. Varsayılan özet değişirse **tüm geçmiş savaşlar başka bir katalogla
 * oynanmış gibi** görünür.
 *
 * ⚠️ **MEVCUT TESTİN AÇIĞI (2. nesil Tur 4'te bulundu).** `catalog-settings.test.ts:74`'te
 * şu satır vardı:
 *
 *     expect(catalogHash(DEFAULT_CATALOG_CONFIG)).toBe(catalogHash());
 *
 * İki taraf da `cfg === DEFAULT_CATALOG_CONFIG` kısayolunu alıyor → aynı kod yolu, aynı sonuç,
 * **her zaman**. `UNITS`/`TECHS`/`BUILDINGS`'e bir alan eklense o test yine geçerdi. Yani
 * kod tabanında varsayılan özeti sabitleyen **hiçbir** test yoktu; katalog tesisatına
 * girmeden önce açılması gereken ilk delik buydu.
 *
 * ⚠️ Snapshot yerine **literal**: `vitest -u` bir snapshot'ı sessizce yeniden yazar.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG_CONFIG, catalogHash, mergeCatalogConfig } from '../src/index.ts';

/**
 * ⚠️ **2026-08-09'da BİLEREK değişti: `2ec624e6` → `a61b1491`.**
 *
 * Sebep: Demircilik'in birim listesinden **Ogre çıkarıldı** (`techs.ts`). Kullanıcının binary
 * ölçümü ve Ghidra (`FUN_0041279c`) birlikte gösterdi ki Ogre'nin `atk`ini yalnız İçgüdü
 * ölçekliyor. Bu test tam olarak bu anı yakalamak için var — özet sessizce kaymasın diye.
 *
 * ⚠️ Eski savaşlar `battles.catalog_hash = '2ec624e6'` ile duruyor ve **öyle kalmalı**: onlar
 * gerçekten başka bir dengeyle çözüldü. Tasarım burada doğru çalıştı.
 */
const DEFAULT_HASH = 'a61b1491';

describe('catalogHash', () => {
  it('⭐ varsayılan özet SABİT', () => {
    expect(catalogHash()).toBe(DEFAULT_HASH);
  });

  it('kimlik kısayolu: aynı nesne aynı özeti verir', () => {
    expect(catalogHash(DEFAULT_CATALOG_CONFIG)).toBe(DEFAULT_HASH);
    // ⚠️ `mergeCatalogConfig(undefined)` varsayılan nesnenin KENDİSİNİ döndürür (kopyasını değil).
    expect(mergeCatalogConfig()).toBe(DEFAULT_CATALOG_CONFIG);
    expect(catalogHash(mergeCatalogConfig())).toBe(DEFAULT_HASH);
  });

  it('⭐ override özeti DEĞİŞTİRİR — ve o da sabit', () => {
    const cfg = mergeCatalogConfig({ economy: { foodRate: 1.2 } });
    expect(cfg).not.toBe(DEFAULT_CATALOG_CONFIG);
    expect(catalogHash(cfg)).not.toBe(DEFAULT_HASH);
    expect(catalogHash(cfg)).toBe('8d7d6353');
  });

  /**
   * ⭐ ŞEMA BÜYÜMESİNE BAĞIŞIKLIK — bu testin varlık sebebi ölçülmüş bir kırılma.
   *
   * `CatalogConfig`e `buildingTuning: {}` eklendiği anda, önceki yük (`c` = config'in
   * TAMAMI) yüzünden **override'ı olan her dünyanın özeti kaydı** — değeri varsayılan olsa
   * bile. Yük artık varsayılandan **fark**: `{economy:{foodRate:1.2}}`. Şemaya on alan daha
   * eklense bu string değişmez.
   *
   * ⚠️ Fark yazımına geçiş, override'lı dünyalar için **bir kereye mahsus** bir kayma
   * yarattı (`e92dfa15` → `3f7fdea2`). Kabul edildi: `battles.catalog_hash` hiçbir sorguda
   * `WHERE`e girmiyor, yalnız savaş künyesinde gösteriliyor. Canlı dünyada override yok
   * (panel «0 ayar varsayılandan farklı» diyor) → oradaki hiçbir kayıt etkilenmedi.
   */
  it('⭐ boş bir tuning grubu özeti KAYDIRMAZ', () => {
    const withFood = mergeCatalogConfig({ economy: { foodRate: 1.2 } });
    // Aynı override + dokunulmamış (boş) tuning grupları → aynı özet olmalı.
    const withEmptyTuning = mergeCatalogConfig({
      economy: { foodRate: 1.2 }, buildingTuning: {}, techTuning: {},
    });
    expect(catalogHash(withEmptyTuning)).toBe(catalogHash(withFood));
  });

  it('varlık başına ayar özete GİRER', () => {
    const a = mergeCatalogConfig({ buildingTuning: { 'castle:gold': 300 } });
    expect(catalogHash(a)).not.toBe(DEFAULT_HASH);
    expect(catalogHash(a)).not.toBe(catalogHash(
      mergeCatalogConfig({ buildingTuning: { 'castle:gold': 301 } }),
    ));
  });

  it('aynı override iki kez aynı özeti verir (deterministik)', () => {
    const a = catalogHash(mergeCatalogConfig({ cave: { breakRate: 1.7 } }));
    const b = catalogHash(mergeCatalogConfig({ cave: { breakRate: 1.7 } }));
    expect(a).toBe(b);
  });

  it('farklı override farklı özet üretir', () => {
    const a = catalogHash(mergeCatalogConfig({ economy: { goldRate: 1.2 } }));
    const b = catalogHash(mergeCatalogConfig({ economy: { goldRate: 1.3 } }));
    expect(a).not.toBe(b);
  });
});
