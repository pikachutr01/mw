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
 * ⚠️ **2026-08-09'da BİLEREK değişti: `2ec624e6` → `bb11b88a`.**
 *
 * Aynı gün üç ölçüm-tabanlı düzeltme birden girdi (`techs.ts`, hepsinin gerekçesi orada):
 *  1. Demircilik'in listesinden **Ogre çıkarıldı** — Ghidra `FUN_0041279c` her savaşçıyı tek
 *     bir `atk` grubuna eşliyor ve Ogre İçgüdü grubunda.
 *  2. Zırh ve Tılsım listelerine **Kaos eklendi** — doküman metnindeki "Kaos hariç" ifadesi
 *     ölçümle çürütüldü.
 *  3. Tılsım'ın oranı **%5 → %6** — iki farklı birimde (Kaos, Ejderha) aynı anda tutturuyor.
 *
 * Sonuç: canlı savaş 4108'de motor-binary sapması saldıran kaybında %8,8 → **%0,7**,
 * deneyimde %30,7 → **%0,7** düştü.
 *
 * ⚠️ Eski savaşlar `battles.catalog_hash = '2ec624e6'` ile duruyor ve **öyle kalmalı**: onlar
 * gerçekten başka bir dengeyle çözüldü. Tasarım burada doğru çalıştı.
 *
 * ⚠️⚠️ **2026-08-10'da yine BİLEREK değişti: `bb11b88a` → `0934c2b4`.** Sebep ekonomi yeniden
 * dengelemesi — yapı/teknik/Sur/Kalkan taban fiyatları, `economy.economyCostRate` 1,33 → 1,45,
 * yeni `structureTimeExponent` alanı ve `buildingTuning`e giren tek kayıt. Savaş STATLARINA
 * dokunulmadı; özet yine de kaymalı çünkü ekonomi de kataloğun bir parçası ve bir savaşın hangi
 * denge sürümünde oynandığı sorusuna fiyatlar da giriyor.
 *
 * ⭐ **2026-08-11'de DEĞİŞMEDİ ve bu öğretici.** O gün kataloğa yeni bir alan girdi
 * (`economy.heroReviveCostRate`, kahraman diriltme üssü 1,50 → 1,25) ama özet aynı kaldı.
 * Sebep `hash.ts:59`: taban yük yalnız `UNITS`/`TECHS`/`BUILDINGS` + sürüm; config'ten
 * **yalnız varsayılandan SAPMA** (`diffFromDefault`) karışıyor. Yani yeni bir *varsayılan*
 * alan hiçbir zaman özeti kaydırmaz — eski savaşların `catalog_hash`i "başka bir katalog"
 * gibi görünmez. Kural: **özet, tabloları ve dünya bazlı sapmaları izler; varsayılan
 * genişlemesini değil.**
 *
 * ⚠️⚠️ **AYNI GÜN, İKİNCİ değişiklik ve bu sefer özet KAYDI: `0934c2b4` → `9fce9abf`.** Sebep Tılsım'ın
 * **Büyü Kalkanı'na özel oranı**: savaşçılarda %6, kalkanda **%5** (`TechDef.rateByUnit`).
 * Kullanıcının binary ölçümü yakaladı (`docs/SAMAN_KALKAN_TESTLERI.md` D2: motor %100,0,
 * gerçek %87,6-88,6 → düzeltmeden sonra motor **%87,70**). Bu bir *varsayılan genişlemesi*
 * değil **tablo değişikliği** olduğu için özetin kayması doğru davranıştır.
 *
 * ⚠️⚠️ **2026-08-12'de yine BİLEREK değişti: `9fce9abf` → `76e00eb7`.** Sebep **Şaman'ın
 * Demircilik listesine eklenmesi** (`techs.ts`, gerekçe orada). Binary'nin `FUN_0041279c`
 * anahtarı Şaman'ı (id 7) Cüce/Süvari/Gnom ile aynı `atk` grubuna koyuyor; bu 2026-08-09'da
 * görülmüş ama *"Şaman hp üzerinden hasar vermiyor"* gerekçesiyle eklenmemişti. Gerekçe
 * yanlıştı: Şaman'ın `hp`si hasar vermek için değil **emmek** için okunuyor
 * (`shamanShield` → `pool -= poolHp × adet`). Kullanıcının rastgele kurduğu gerçek savaşta
 * saldıran kaybı **5.316 → 4.541** (binary 4.512), XP **10.695 → 8.574** (binary 8.404).
 * Yine bir tablo değişikliği → özetin kayması doğru.
 *
 * ⚠️⚠️ **AYNI GÜN, İKİNCİ değişiklik: `76e00eb7` → `3a8b2be4`.** Sebep **Mancınık'ın Tılsım
 * listesine eklenmesi**. Ghidra: teknik uygulayıcılarının iki ailesi var — `atk` aileleri
 * `FUN_0041279c` ile **grup süzgeci** uyguluyor, Zırh/Büyücülük/**Tılsım** ise
 * (`FUN_00412528` · `FUN_004124cc` · `FUN_004125c8`) yalnız `seviye != 0`'a bakıp **herkese**
 * uyguluyor. Dokümanın birim başına listeleri süzgeç değil betimleme.
 * Aynı savaşta Mancınık kalanı 159 → **172** (binary 173) ve savaşın ortalama sapması
 * %2,18 → **%0,24**.
 *
 * ⚠️⚠️ **2026-08-12, ÜÇÜNCÜ değişiklik: `3a8b2be4` → `14c061fc`.** Sebep **Taş Ustalığı'nın
 * Sur'a özel oranı: %6 → %5** (`TechDef.rateByUnit`, gerekçe `techs.ts`te). Kullanıcının
 * ölçümü tek bir sayıya indirgedi: Sur bütünlüğü Taş Ustalığı ile DOĞRUSAL ve eğimi
 * `8,3333 × oran`; dört bağımsız tahmin 0,4167-0,4170 (yayılım 0,00025) → **oran 0,05003**.
 * Motorun %6'sı 0,5 eğim veriyordu. ⭐ Aynı ölçümün A grubu (seviye taraması) 8/8 birebir
 * tuttuğu için `Alan/mDef` ve `pAtk/mDef` doğrulanmış oldu — geriye tek serbest sayı kalmıştı.
 * ⚠️ Kule/Balista ölçülmedi, bilerek %6'da bırakıldı (bkz. `docs/SUR_TESTLERI.md`).
 *
 * ⚠️⚠️ **2026-08-12, DÖRDÜNCÜ değişiklik: `14c061fc` → `000c68dc`.** Sebep **seviye tavanı**:
 * altı yapı 20 → **40** (Kale · Baraka · Akademi · Mimar Okulu · Mağara · Tapınak). Oyunu
 * oynamış bir oyuncu barakasının 20'den yüksek olduğunu hatırlıyor. ⚠️ **Teleport 20'de kaldı**
 * (kullanıcı): tabanı diğerlerinin ~250 katı olduğu için sv40 maliyeti `MAX_SAFE_INTEGER`'ı
 * aşıyordu — bekçisi `formulas.test.ts`te.
 *
 * ⭐ Bu, hash'in **denge dışı** bir alandan kaydığı ilk örnek: `maxLevel` savaş matematiğine
 * hiç girmiyor ama `BUILDINGS` tablosunun parçası olduğu için özete dâhil — ve dâhil olması
 * doğru, çünkü aynı savaşın iki farklı tavanla üretilmiş orduları kıyaslanamaz.
 *
 * ⚠️⚠️ **2026-08-14, BEŞİNCİ değişiklik: `000c68dc` → `d963193a`.** Sebep **Akademi tabanı
 * 1400/1000 → 900/700** (Kale ile eşitlendi; *"kapı ucuz, lüks pahalı"* ilkesi, gerekçe
 * `buildings.ts`te). Dördüncü değişiklik gibi bu da savaş matematiğine girmiyor ama fiyat
 * tablosunun parçası — ve özetin işi tam olarak *"bu savaş hangi katalogla çözüldü"* sorusunu
 * cevaplamak; fiyat değişince cevap da değişmeli.
 * ⚠️ Başlangıç kesesi (1000 → 5000) özete **girmiyor**: `STARTING_RESOURCES` katalog
 * yapılandırmasının değil, dünya kurulumunun parçası.
 */
const DEFAULT_HASH = 'd963193a';

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
    expect(catalogHash(cfg)).toBe('9c6255c6');
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
