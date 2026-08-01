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
/**
 * ⭐ VARSAYILANDAN FARK — özetin şema büyümesine bağışık olmasını sağlayan parça.
 *
 * ⚠️ **NEDEN TÜM CONFIG DEĞİL (2. nesil Tur 4).** Önceki hâl `c` alanına config'in tamamını
 * yazıyordu. `CatalogConfig`e yeni bir alan eklendiği anda — `buildingTuning: {}` gibi, değeri
 * varsayılan bile olsa — **override'ı olan her dünyanın özeti kayıyordu** ve o dünyanın geçmiş
 * savaşları sahte bir "denge değişti" sinyali veriyordu. Testte tam olarak bu yakalandı.
 *
 * Fark yazılınca yük yalnız **gerçekten sapan yapraklara** bağlı: `{economy:{foodRate:1.2}}`.
 * Şemaya on alan daha eklense bu string değişmez.
 *
 * ⚠️ Anahtar sırası deterministik: `DEFAULT_CATALOG_CONFIG`in kendi bildirim sırasında
 * dolaşılıyor, `cfg`nin sırasında değil.
 */
function diffFromDefault(cfg: CatalogConfig): Record<string, Record<string, unknown>> | undefined {
  const out: Record<string, Record<string, unknown>> = {};
  let touched = false;
  for (const group of Object.keys(DEFAULT_CATALOG_CONFIG) as (keyof CatalogConfig)[]) {
    const base = DEFAULT_CATALOG_CONFIG[group] as Record<string, unknown>;
    const now = (cfg[group] ?? {}) as Record<string, unknown>;
    // Hem varsayılanda hem override'da olan anahtarlar (yeni eklenen seyrek anahtarlar dahil).
    for (const key of [...new Set([...Object.keys(base), ...Object.keys(now)])].sort()) {
      if (now[key] === base[key]) continue;
      (out[group] ??= {})[key] = now[key];
      touched = true;
    }
  }
  return touched ? out : undefined;
}

export function catalogHash(cfg: CatalogConfig = DEFAULT_CATALOG_CONFIG): string {
  const base = { v: CATALOG_VERSION, u: UNITS, t: TECHS, b: BUILDINGS };
  /**
   * ⚠️ Varsayılan config'te yük AYNEN eski hâlinde bırakılıyor — `c` alanı eklenseydi
   * varsayılan hash de değişir ve tüm eski `battles.catalog_hash` değerleri "başka bir
   * katalog" gibi görünürdü. `hash.test.ts` bunu literal değerle kilitliyor.
   */
  const diff = diffFromDefault(cfg);
  const payload = diff === undefined
    ? JSON.stringify(base)
    : JSON.stringify({ ...base, c: diff });
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    // 32-bit FNV asalı ile çarpım (taşmayı Math.imul ile 32-bit'te tutuyoruz)
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
