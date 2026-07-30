/**
 * Katalog `id` → oyuncuya görünen TÜRKÇE ad (§13.14).
 *
 * Kod, DB, URL ve katalog `id`'leri İngilizcedir; **ekranda İngilizce görünmez.** Adlar
 * `@mobiwar/catalog`'tan okunur — arayüzün kendi çeviri tablosu YOKTUR, olsaydı katalogtan
 * kaçınılmaz olarak sürüklenirdi.
 *
 * (Ön-şart adları sunucudan `requirementNames` ile hazır geliyor; burası birim/yapı/teknik
 * adının doğrudan lazım olduğu yerler için — ordu listesi, kuyruk satırı, savaş raporu.)
 */
import { BUILDINGS_BY_ID, TECHS_BY_ID, UNITS_BY_ID } from '@mobiwar/catalog';

export function nameOf(id: string): string {
  return UNITS_BY_ID[id]?.name.tr
    ?? BUILDINGS_BY_ID[id]?.name.tr
    ?? TECHS_BY_ID[id]?.name.tr
    ?? id;
}

/** `{ dwarf: 100, elf: 5 }` → "Cüce 100 · Elf 5" */
export function describeUnits(
  counts: Record<string, number> | undefined,
  fmt: (n: number) => string,
): string {
  const parts = Object.entries(counts ?? {})
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${nameOf(id)} ${fmt(n)}`);
  return parts.join(' · ');
}

/** `[{name:'Baturalp', level:7}]` → "⚔ Baturalp sv 7" — ordu satırında kahraman özeti. */
export function describeHeroes(heroes: { name: string; level: number }[] | undefined): string {
  if (!heroes || heroes.length === 0) return '';
  return heroes.map((h) => `⚔ ${h.name} sv ${h.level}`).join(' · ');
}
