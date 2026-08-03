/**
 * @mobilwar/catalog — oyunun DENGE VERİSİ (birim/yapı/teknik) ve doğrulanmış formülleri.
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
export * from './merit.ts';
export { catalogHash, CATALOG_VERSION } from './hash.ts';
export { HERO_NAMES, pickHeroName } from './hero-names.ts';
export {
  NAME_MAX, NAME_MIN, NAME_PATTERN, NAME_RULE_MESSAGE, clampName, normalizeName,
  USERNAME_MAX, USERNAME_MIN, USERNAME_PATTERN, USERNAME_RULE_MESSAGE,
  DELETED_NAME_PREFIX, DELETED_NAME_RE, deletedName,
} from './name-rules.ts';
