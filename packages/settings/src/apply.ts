/**
 * Varsayılan + geçersiz kılma → **donmuş etkin nesne** ve içerik özeti.
 *
 * ⭐ Sonucun DONMUŞ olması kasıtlı: etkin ayarlar tüm süreç boyunca paylaşılan tek nesne;
 * bir çağıran yanlışlıkla üzerine yazarsa hata **başka bir istekte** ortaya çıkardı ve
 * izlenmesi çok zor olurdu. `Object.freeze` bunu ilk yazma denemesinde patlatır.
 */
import { SETTINGS, SETTINGS_BY_KEY } from './schema.ts';
import type { EffectiveSettings, SettingDef, SettingValue } from './types.ts';

export interface ValidationIssue { key: string; message: string }

/** Tek bir değeri tanımına göre doğrular ve normalleştirir (tam sayı isteyen alanı yuvarlar). */
export function coerce(def: SettingDef, raw: unknown): SettingValue | ValidationIssue {
  if (def.type === 'boolean') {
    if (typeof raw !== 'boolean') return { key: def.key, message: 'true/false olmalı.' };
    return raw;
  }
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return { key: def.key, message: 'Sayı olmalı.' };
  // ⚠️ `int` alanda kesirli değer REDDEDİLİR, sessizce yuvarlanmaz: "5,5 yazdım 5 oldu"
  // sürprizi denge ayarında en can sıkıcı hata sınıfı.
  if (def.type === 'int' && !Number.isInteger(n)) {
    return { key: def.key, message: 'Tam sayı olmalı.' };
  }
  if (def.min != null && n < def.min) return { key: def.key, message: `En az ${def.min}.` };
  if (def.max != null && n > def.max) return { key: def.key, message: `En fazla ${def.max}.` };
  return n;
}

export interface ApplyResult {
  effective: EffectiveSettings;
  /** Şemadaki varsayılandan FARKLI olan anahtarlar — panel "değiştirilmiş" rozetini bundan çizer. */
  overridden: readonly string[];
  /** İçerik parmak izi; savaş kaydına yazılır (§reproducibility). */
  hash: string;
}

/**
 * Katmanlar SIRAYLA uygulanır ve **sonraki öncekini ezer**:
 *   1. şema varsayılanı
 *   2. `env` (varsa — geçiş dönemi geriye uyumu)
 *   3. dünya 0 satırları ("tüm dünyalar için varsayılan")
 *   4. o dünyanın kendi satırları
 *
 * ⚠️ `env`in DB'nin ALTINDA olması bilinçli: panelden bir değer kaydedildiği anda `.env`
 * dosyası artık o ayarı yönetmiyor demektir. Tersi olsaydı panelden yapılan değişiklik
 * sunucu yeniden başlayınca sessizce geri alınırdı — hata ayıklaması en zor sınıf.
 */
export function applySettings(
  layers: readonly Readonly<Record<string, SettingValue>>[],
  env: Readonly<Record<string, string | undefined>> = {},
): ApplyResult {
  const flat = new Map<string, SettingValue>();
  const overridden: string[] = [];

  for (const def of SETTINGS) {
    let value = def.default;

    if (def.env) {
      const raw = env[def.env];
      if (raw != null && raw !== '') {
        const out = coerce(def, def.type === 'boolean' ? raw === 'true' : raw);
        if (typeof out !== 'object') value = out;
      }
    }
    for (const layer of layers) {
      if (!(def.key in layer)) continue;
      const out = coerce(def, layer[def.key]);
      // ⚠️ Bozuk satır SESSİZCE ATLANIR, açılışı düşürmez. Bir ayar satırının bozulması
      // (elle SQL, eski şema) sunucuyu ayağa kaldırmamayı hak eden bir olay değil.
      if (typeof out !== 'object') value = out;
    }

    flat.set(def.key, value);
    if (value !== def.default) overridden.push(def.key);
  }

  // Noktalı anahtarlardan iki kademeli nesne kur: `chat.burst` → `{ chat: { burst } }`.
  const nested: Record<string, Record<string, SettingValue>> = {};
  for (const [key, value] of flat) {
    const dot = key.indexOf('.');
    const group = key.slice(0, dot);
    const leaf = key.slice(dot + 1);
    (nested[group] ??= {})[leaf] = value;
  }
  for (const group of Object.keys(nested)) Object.freeze(nested[group]);

  return {
    effective: Object.freeze(nested) as EffectiveSettings,
    overridden,
    hash: hashOf(flat),
  };
}

/**
 * FNV-1a 32-bit — `catalogHash()` ile aynı aile. Kriptografik değil, **içerik parmak izi**:
 * "bu savaş hangi ayarlarla çözüldü" sorusunun cevabı.
 *
 * ⚠️ Anahtarlar SIRALANIR: `Map` ekleme sırasını korur ve şemadaki satır sırası değişirse
 * özet de değişirdi — oysa içerik aynı. Sıralama bunu bağışıklar.
 */
function hashOf(flat: ReadonlyMap<string, SettingValue>): string {
  const payload = JSON.stringify([...flat.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Panelden gelen yamayı doğrular. Bilinmeyen anahtar HATA — sessizce yutulmaz. */
export function validatePatch(patch: Record<string, unknown>): {
  values: Record<string, SettingValue>; issues: ValidationIssue[];
} {
  const values: Record<string, SettingValue> = {};
  const issues: ValidationIssue[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    const def = SETTINGS_BY_KEY[key];
    if (!def) { issues.push({ key, message: 'Böyle bir ayar yok.' }); continue; }
    if (def.tag === 'locked') { issues.push({ key, message: 'Bu ayar kilitli.' }); continue; }
    const out = coerce(def, raw);
    if (typeof out === 'object') issues.push(out);
    else values[key] = out;
  }
  return { values, issues };
}
