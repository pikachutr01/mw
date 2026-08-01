/**
 * ⭐ KATALOG YAPILANDIRMASI (§admin Faz 5) — ekonomi eğrileri, süre modeli, mağara ve sur
 * sabitleri **çalışma zamanında** değiştirilebilir hâle geliyor.
 *
 * ⚠️ **Formüllerin imzası KIRILMIYOR.** Her formül son parametre olarak isteğe bağlı bir
 * `cfg` alıyor ve verilmezse `DEFAULT_CATALOG_CONFIG` kullanıyor. Yani:
 *   • parametresiz çağıran (testler, motor içi, istemci) **hiç değişmedi** ve sonucu aynı;
 *   • API çağrıları `settings.catalog(worldId)` geçiriyor.
 *
 * ⚠️ Paket **saf** kalıyor: burada DB, zaman, IO yok. Ayarları okuyup buraya nesne olarak
 * getirmek API'nin işi.
 */

/** Ekonomi eğrileri ve süre modeli. */
export interface EconomyConfig {
  foodBase: number;
  foodRate: number;
  goldBase: number;
  goldRate: number;
  /** Yapı maliyeti eğrisi: `rate^(seviye−1)`. */
  buildingCostRate: number;
  /** Çiftlik/Maden eğrisi: `seviye × rate^(seviye−1)`. */
  economyCostRate: number;
  /** Teknik maliyeti: `base × rate^(seviye+1)`. */
  techCostRate: number;
  timeDivisorRate: number;
  /** Her hızlandırıcı yapı seviyesi süreyi böler: `rate^seviye`. */
  timeDecayRate: number;
  /** Pahalı birimi saniye başına daha verimli yapan üs. */
  timeExponent: number;
  /** Savaşçı ve savunma birimi süre katsayısı. */
  unitTimeFactor: number;
  /** Yapı / teknik / Sur / Kalkan süre katsayısı. */
  structureTimeFactor: number;
  /** 1 birim taşıma kapasitesi kaç kaynak sayılır. */
  carryTimeWeight: number;

  /**
   * ⭐ FİYAT ÇARPANLARI (Faz 5) — kataloğun taban fiyatlarını topluca ölçekler.
   *
   * ⚠️ Neden yapı/birim/teknik BAŞINA değil? Katalogda 11 yapı + 12 teknik + 21 birim var ve
   * her birinin altın/yemek tabanı ayrı: ~90 ayar. Panelde 90 satırlık düz bir liste hem
   * kullanılamaz olurdu hem de asıl istenen soruyu (*"fiyatlar genel olarak yüksek/düşük"*)
   * 90 kez düzenlemeye zorlardı. Tek tek düzenleme veri tarayıcısının işi (Faz 7); buradaki
   * üç çarpan dengeyi kaydırmak için gereken düğme.
   */
  buildingCostMultiplier: number;
  unitCostMultiplier: number;
  techCostMultiplier: number;

  /* ── Emekli süre modelleri (yalnız denge düğmesi) ─────────────────────────── */
  trainTimeAreaDecay: number;
  originalTrainFactor: number;
  originalDivisorRate: number;
}

/**
 * ⭐ VARLIK BAŞINA İNCE AYAR (2. nesil Tur 4) — yapı ve teknik **başına** taban fiyat,
 * büyüme oranı ve süre çarpanı.
 *
 * ⚠️ **Anahtar `<id>:<eksen>` biçiminde ve TEK PARÇA.** Ayar anahtarları (`buildingTuning.
 * castle:gold`) böylece `grup.alan` şeklinde iki parçalı kalıyor. Üç parçalı yapmak
 * (`bases.buildings.castle.gold`) iki yerdeki `key.split('.')` varsayımını kırardı —
 * `settings/catalog.ts` ve `admin.world.controller.ts:439` — ve ikincisi **sessizce**
 * varsayılan gösterirdi.
 *
 * ⚠️ Ayırıcı `:` bilinçli: id'ler snake_case (`architect_school`, `magic_shield`), `_gold`
 * soneki ayrıştırmayı belirsizleştirirdi.
 *
 * ⚠️⚠️ **SEYREKLİK SÖZLEŞMESİ — varsayılan BOŞ.** Dokunulmamış bir varlık için burada kayıt
 * OLMAZ ve formül global orana düşer. Buraya "yardımcı olsun" diye 9 yapının varsayılanını
 * doldurmak, `economy.buildingCostRate`'i **sessizce işlevsizleştirirdi**: global düğme
 * artık hiçbir yapıyı etkilemezdi.
 */
export type TuningAxis = 'gold' | 'food' | 'rate' | 'timeFactor';
export type TuningConfig = Partial<Record<string, number>>;

export interface CaveConfig {
  capacityBase: number;
  breakBase: number;
  breakRate: number;
  blacksmithingRelief: number;
  transferFactor: number;
  transferDecayRate: number;
  minTransferSeconds: number;
  repairBaseSeconds: number;
  repairDecayRate: number;
}

export interface WallConfig {
  repairBaseSeconds: number;
  repairDecayRate: number;
}

export interface CatalogConfig {
  economy: EconomyConfig;
  cave: CaveConfig;
  wall: WallConfig;
  /** `castle:gold` · `castle:rate` · `castle:timeFactor` … — bkz. `TuningConfig`. */
  buildingTuning: TuningConfig;
  /** `blacksmithing:gold` · `blacksmithing:rate` … */
  techTuning: TuningConfig;
}

/**
 * ⭐ VARSAYILANLAR — bu nesne kataloğun bugüne kadarki `ECONOMY_CONSTANTS` /
 * `CAVE_CONSTANTS` / `WALL_CONSTANTS` üçlüsüdür; sayılar taşınırken **hiçbiri değişmedi**.
 * Gerekçeleri `formulas.ts`teki yorumlarında duruyor ve orada kalmalı: burası veri, orası
 * o verinin nerede ve neden kullanıldığı.
 */
export const DEFAULT_CATALOG_CONFIG: CatalogConfig = {
  economy: {
    foodBase: 6,
    foodRate: 1.16,
    goldBase: 5,
    goldRate: 1.15,
    buildingCostRate: 1.8,
    // ⚠️ 1,45 DEĞİL 1,33 — gerekçe `formulas.ts`te (seviye 40 ulaşılabilir kalmalı).
    economyCostRate: 1.33,
    techCostRate: 1.5,
    timeDivisorRate: 1.4,
    timeDecayRate: 1.2,
    timeExponent: 0.8,
    unitTimeFactor: 190,
    structureTimeFactor: 400,
    carryTimeWeight: 1,
    buildingCostMultiplier: 1,
    unitCostMultiplier: 1,
    techCostMultiplier: 1,
    trainTimeAreaDecay: 0.95,
    originalTrainFactor: 65,
    originalDivisorRate: 1.4,
  },
  cave: {
    capacityBase: 50,
    breakBase: 100,
    breakRate: 1.5,
    blacksmithingRelief: 0.05,
    transferFactor: 25,
    transferDecayRate: 1.1,
    minTransferSeconds: 5,
    repairBaseSeconds: 20 * 3600,
    repairDecayRate: 0.9,
  },
  wall: {
    repairBaseSeconds: 12 * 3600,
    repairDecayRate: 0.92,
  },
  /**
   * ⚠️⚠️ **BOŞ KALMALI.** Dolu bir varsayılan, global fiyat/oran düğmelerini sessizce
   * işlevsizleştirir (bkz. `TuningConfig` yorumundaki seyreklik sözleşmesi).
   */
  buildingTuning: {},
  techTuning: {},
};

export type DeepPartialCatalog = {
  [K in keyof CatalogConfig]?: Partial<CatalogConfig[K]>;
};

/**
 * Kısmi override'ı varsayılanın üstüne bindirir.
 *
 * ⚠️ Override YOKSA varsayılan nesnenin **kendisi** döner (kopyası değil). Faz 4'teki
 * `mergeCombatConfig` ile aynı sözleşme ve aynı gerekçe: "yeniden kurulmuş varsayılan" ile
 * "varsayılanın kendisi" arasında sessiz bir kayma doğmasın.
 */
export function mergeCatalogConfig(overrides?: DeepPartialCatalog): CatalogConfig {
  if (!overrides) return DEFAULT_CATALOG_CONFIG;
  return {
    economy: { ...DEFAULT_CATALOG_CONFIG.economy, ...overrides.economy },
    cave: { ...DEFAULT_CATALOG_CONFIG.cave, ...overrides.cave },
    wall: { ...DEFAULT_CATALOG_CONFIG.wall, ...overrides.wall },
    // ⚠️ Seyreklik korunuyor: override yoksa boş nesne kalır (bkz. `TuningConfig` yorumu).
    buildingTuning: { ...DEFAULT_CATALOG_CONFIG.buildingTuning, ...overrides.buildingTuning },
    techTuning: { ...DEFAULT_CATALOG_CONFIG.techTuning, ...overrides.techTuning },
  };
}
