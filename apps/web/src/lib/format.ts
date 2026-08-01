/**
 * ⭐ BİÇİMLENDİRME YARDIMCILARI — istemcide tekrarlanan küçük dönüşümler.
 *
 * ⚠️ `coords` 2026-08-01'de eklendi çünkü `k:d:s` dizesi **altı ayrı yerde elle** yazılıydı
 * (`Shell` · `CityStrip` ×2 · `CityAdminPanel` · `CityHub` · `Command`) ve biri ayrıcı olarak
 * `·` kullanıyordu. Biçim bir gün değişirse (ör. `1-1-1`) altı yeri bulmak gerekirdi.
 */

export interface Coords {
  k: number;
  d: number;
  s: number;
}

/** `1:45:10` — dünya tablosunda, şehir şeridinde ve raporlarda kullanılan tek biçim. */
export const coords = (c: Coords): string => `${c.k}:${c.d}:${c.s}`;
