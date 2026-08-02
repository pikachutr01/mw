/**
 * @mobilwar/settings — panelden düzenlenebilen sabitlerin **şeması ve uygulanışı**.
 *
 * Saf paket: DB, HTTP, React bilmez. Sunucu doğrulaması da panelin form üretimi de aynı
 * listeden beslenir; iki yerde tanımlansaydı panel var olmayan bir ayarı gösterir ya da
 * sunucu paneldeki bir alanı reddederdi.
 */
export { SETTINGS, SETTINGS_BY_KEY, SETTING_GROUPS } from './schema.ts';
export { applySettings, coerce, validatePatch, type ApplyResult, type ValidationIssue } from './apply.ts';
export type {
  EffectiveSettings, SettingDef, SettingGroup, SettingTag, SettingValue,
} from './types.ts';
