/**
 * @mobiwar/catalog — oyunun DENGE VERİSİ (birim/yapı/teknik) ve doğrulanmış formülleri.
 *
 * Bu paket saf veridir: DB, zaman, IO bilmez. Her savaşa `catalogHash` yazılır → hangi dengeyle
 * oynandığı kayıtlı olur (SİSTEM PLANI §5).
 */
export * from './types.ts';
export * from './units.ts';
export * from './techs.ts';
export * from './buildings.ts';
export * from './config.ts';
export * from './formulas.ts';
export * from './prerequisites.ts';
export * from './display-order.ts';
export { catalogHash, CATALOG_VERSION } from './hash.ts';
export { HERO_NAMES, pickHeroName } from './hero-names.ts';
export {
  NAME_MAX, NAME_MIN, NAME_PATTERN, NAME_RULE_MESSAGE, clampName, normalizeName,
} from './name-rules.ts';
