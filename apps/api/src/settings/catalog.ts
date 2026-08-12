/**
 * ⭐ AYAR → KATALOG EŞLEMESİ (admin Faz 5) — `settings/combat.ts`in kardeşi.
 *
 * Burada eşleme **tamamen mekanik**: ayar anahtarları zaten `grup.alan` biçiminde ve katalog
 * config'i de aynı iki seviyeli şekle sahip (`economy.*`, `cave.*`, `wall.*`). Savaş tarafında
 * elle bir tablo gerekiyordu çünkü motor nesnesi başka bir şekle sahipti (`combat.wallBase` →
 * `wall.base`); burada gerek yok ve **bilerek** yazılmadı: gereksiz bir tablo, katalog büyüdükçe
 * güncellenmeyi unutulan bir tabloya dönüşürdü.
 *
 * ⚠️ Aynı sözleşme geçerli: **değiştirilmiş ayar yoksa `undefined`** → formüller kendi
 * `DEFAULT_CATALOG_CONFIG`ini aynen kullanır ve çıktı bit-bit eskisiyle aynı olur.
 */
import type { DeepPartialCatalog } from '@mobilwar/catalog';

type Values = Readonly<Record<string, Record<string, number | boolean> | undefined>>;

/** Katalog config'ini oluşturan ayar grupları. */
/**
 * ⚠️ Yeni iki grup eklenirken `catalogOverrides` GÖVDESİ değişmedi — mekanik eşlemenin
 * sınavı buydu. Anahtarlar `grup.alan` biçiminde kaldığı sürece (bkz. `config.ts`
 * `TuningConfig`) yeni bir katalog ailesi açmak tek satırlık iş.
 */
export const CATALOG_GROUPS = [
  'economy', 'cave', 'wall', 'teleport', 'spy', 'buildingTuning', 'techTuning',
  // ⭐ 2026-08-12 — asker başına taban fiyat + süre çarpanı. Yine tek satır: gövde değişmedi.
  'unitTuning',
] as const;

export function catalogOverrides(
  values: Values, overridden: readonly string[],
): DeepPartialCatalog | undefined {
  const out: Record<string, Record<string, number | boolean>> = {};
  let touched = false;
  for (const key of overridden) {
    const [group, leaf] = key.split('.') as [string, string];
    if (!(CATALOG_GROUPS as readonly string[]).includes(group)) continue;
    const v = values[group]?.[leaf];
    /**
     * ⚠️ Sayı VE boolean kabul ediliyor. Bir süre yalnız sayı geçiyordu ve buradaki yorum
     * *"katalog config'inde boolean alan yok; bir gün eklenirse burası sessizce atlamak
     * yerine DEĞİŞTİRİLMELİ"* diye uyarıyordu. O gün 2026-08-03'te geldi
     * (`economy.architectSelfExempt`) — uyarı işe yaradı, ayar sessizce yutulmadı.
     */
    if (typeof v !== 'number' && typeof v !== 'boolean') continue;
    (out[group] ??= {})[leaf] = v;
    touched = true;
  }
  return touched ? (out as DeepPartialCatalog) : undefined;
}
