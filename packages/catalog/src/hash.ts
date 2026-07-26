import { BUILDINGS } from './buildings.ts';
import { TECHS } from './techs.ts';
import { UNITS } from './units.ts';

export const CATALOG_VERSION = '0.1.0';

/**
 * Katalog içeriğinin deterministik özeti. Her savaş kaydına yazılır (`battles.catalog_hash`) →
 * denge değişince eski savaşların hangi veriyle çözüldüğü belli olur.
 *
 * FNV-1a 32-bit: kriptografik değil, sadece içerik parmak izi. Bağımlılık istemiyoruz (motor saf kalsın).
 */
export function catalogHash(): string {
  const payload = JSON.stringify({ v: CATALOG_VERSION, u: UNITS, t: TECHS, b: BUILDINGS });
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    // 32-bit FNV asalı ile çarpım (taşmayı Math.imul ile 32-bit'te tutuyoruz)
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
