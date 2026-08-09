/**
 * ⭐ AKTİVİTE NOKTALARI (kullanıcı, 2026-07-30): aktif şehirde süren iş varsa ilgili menü
 * satırının sağında küçük nokta yanar — ŞEHİR BAZLI: başka şehre geçince o şehrin işleri okunur.
 *
 * ⚠️ **`Shell.tsx`ten 2026-08-09'da buraya taşındı.** Sebep yerleşim değil, **döngüsel bağımlılık**:
 * `Shell` mobil sekme şeridini (`CityTabs`) çiziyor, şerit de noktaları çizmek için bu ikisine
 * ihtiyaç duyuyordu → `Shell → CityTabs → Shell`. ESM bunu hoisting sayesinde bugün çalıştırır
 * ama biri `function` yerine `const` oka çevrildiği anda **sessizce** `undefined` olurdu.
 * Üç tüketici (`Shell` sol menüsü · `CityHub` listesi · `CityTabs` şeridi) artık ortak bir
 * yaprak modülü okuyor; döngü yapısal olarak imkânsız.
 */
import type { CityDetail } from './queries.ts';

/**
 * Rota → o şehirde o ekrana ait süren iş var mı?
 *
 * ⚠️ Akademi noktası araştırmayı **BAŞLATAN** şehirde görünür (akademiler ortak ama iptal
 * oradan yapılıyor).
 */
export function cityActivity(
  d: CityDetail | undefined, cityId: number | null,
): Record<string, boolean> {
  if (!d) return {};
  const q = d.queues ?? [];
  return {
    '/barracks': q.some((x) => x.category === 'unit'),
    '/defense': q.some((x) => x.category === 'defense') || d.wallRepair != null,
    '/buildings': q.some((x) => x.category === 'building') || d.cave.repairing || d.cave.job != null,
    '/academy': (d.techQueues ?? []).some((x) => x.cityId === cityId),
    '/temple': d.heroReviving === true,
  };
}

/** Menü satırındaki aktivite noktası — rozetle çakışmasın diye rozet yokken çizilir. */
export function ActivityDot() {
  return (
    <span aria-label="bu şehirde süren iş var"
      className="inline-block h-2 w-2 shrink-0 rounded-full bg-success shadow-[0_0_4px_var(--mw-color-success)]" />
  );
}
