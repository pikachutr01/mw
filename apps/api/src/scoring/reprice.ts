/**
 * ⭐ "BU AYAR FİYATI DEĞİŞTİRİR Mİ?" — yeniden fiyatlama kancasının tetikleyicisi.
 *
 * `admin.world.controller.ts` bir ayar kaydedildiğinde bunu soruyor; cevap `true` ise dünyanın
 * tamamı yeniden fiyatlanıyor (`repriceWorld`, gerekçesi `score.service.ts`te).
 *
 * ⚠️ **Neden `CATALOG_GROUPS` yetmiyor.** O liste katalog config'ini oluşturan TÜM grupları
 * sayıyor (`wall`, `spy`, `teleport`, `cave` dâhil) — onlar savaş ve mekanik tarafı, hiçbir
 * fiyat formülüne girmiyorlar. Grup düzeyinde tetiklemek, ilgisiz bir sur ayarında bütün
 * dünyayı taramak demekti.
 *
 * ⚠️ **Neden `heroReviveCostRate` listede YOK** — bakınca eksik sanılır, bilerek dışarıda:
 * diriltme `queues` üzerinden `creditSpend` ediliyor, kahraman `holdingsValue`da hiç yok ve
 * hiçbir kod yolu kahramanı `debitLosses` etmiyor. Yani orada **asimetri de yok**; yeniden
 * fiyatlasaydık var olmayan bir sorunu düzeltmek için puanları oynatırdık.
 *
 * ⚠️ **Neden tüm `*Time*` anahtarları dışarıda** — süre fiyattan türüyor ama tersi doğru değil:
 * `timeFactor` yalnız süreyi çarpıyor, `unitCost`/`buildingCost` onu hiç okumuyor.
 */
import { SETTINGS } from '@mobilwar/settings';

/**
 * Varlık künyesi taşımayan (global) fiyat anahtarları.
 *
 * ⚠️ **Bu liste ELLE tutuluyor** — deponun `combat.ts:34`te uyardığı "bir gün bayatlayan tablo"
 * sınıfından. O yüzden `score-reprice.test.ts` içindeki **diferansiyel test** onu kilitliyor:
 * şemadaki HER anahtar için o anahtarı oynatılmış bir config üretip dört fiyat fonksiyonunu
 * çalıştırıyor ve `fiyatDeğişti === affectsPrices([key])` olmasını istiyor. Yeni bir maliyet
 * anahtarı buraya eklenmeden CI kırılır.
 */
export const PRICE_KEYS: ReadonlySet<string> = new Set([
  'economy.buildingCostRate',
  'economy.economyCostRate',
  'economy.techCostRate',
  'economy.buildingCostMultiplier',
  'economy.unitCostMultiplier',
  'economy.techCostMultiplier',
]);

/**
 * Varlık başına ayarlarda (`buildingTuning.castle:gold` gibi) karar **künyeden** veriliyor,
 * anahtarı ayrıştırarak değil — `SettingDef.entity` tam bu yüzden var (`types.ts:53`).
 * `timeFactor` ekseni fiyata dokunmaz; `gold`/`food`/`rate` dokunur.
 */
const PRICE_AXES: ReadonlySet<string> = new Set(['gold', 'food', 'rate']);

const BY_KEY = new Map(SETTINGS.map((d) => [d.key, d]));

/** Değişen anahtarlardan herhangi biri katalog FİYATINI etkiliyor mu? */
export function affectsPrices(changed: readonly string[]): boolean {
  return changed.some((key) => {
    if (PRICE_KEYS.has(key)) return true;
    const axis = BY_KEY.get(key)?.entity?.axis;
    return axis !== undefined && PRICE_AXES.has(axis);
  });
}
