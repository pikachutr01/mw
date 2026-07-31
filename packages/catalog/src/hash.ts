import { BUILDINGS } from './buildings.ts';
import { DEFAULT_CATALOG_CONFIG, type CatalogConfig } from './config.ts';
import { TECHS } from './techs.ts';
import { UNITS } from './units.ts';

export const CATALOG_VERSION = '0.1.0';

/**
 * Katalog içeriğinin deterministik özeti. Her savaş kaydına yazılır (`battles.catalog_hash`) →
 * denge değişince eski savaşların hangi veriyle çözüldüğü belli olur.
 *
 * ⭐ **ETKİN AYARLARI da özetler** (§admin Faz 5). Sabitler çalışma zamanında
 * değiştirilebildiğinden yalnız derlenmiş veriyi özetlemek yetmiyordu: aynı katalogla ama
 * farklı `economyCostRate` ile çözülmüş iki savaş künyesinde birbirinin aynısı görünürdü.
 *
 * ⚠️ `cfg` verilmediğinde özet **eskisiyle birebir aynı** kalır — varsayılan config
 * `JSON.stringify`da aynı diziyi üretiyor ve testle sabitlendi. Eski savaş kayıtlarının
 * hash'i geçerliliğini korusun diye bu şart.
 *
 * FNV-1a 32-bit: kriptografik değil, sadece içerik parmak izi. Bağımlılık istemiyoruz (motor saf kalsın).
 */
export function catalogHash(cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): string {
  const base = { v: CATALOG_VERSION, u: UNITS, t: TECHS, b: BUILDINGS };
  /**
   * ⚠️ Varsayılan config'te yük AYNEN eski hâlinde bırakılıyor — `c` alanı eklenseydi
   * varsayılan hash de değişir ve tüm eski `battles.catalog_hash` değerleri "başka bir
   * katalog" gibi görünürdü.
   */
  const payload = cfg === DEFAULT_CATALOG_CONFIG
    ? JSON.stringify(base)
    : JSON.stringify({ ...base, c: cfg });
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    // 32-bit FNV asalı ile çarpım (taşmayı Math.imul ile 32-bit'te tutuyoruz)
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
