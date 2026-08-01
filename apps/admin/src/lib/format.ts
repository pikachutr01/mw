/**
 * Biçimlendiriciler — **tek yer**.
 *
 * ⚠️ Bunlar daha önce üç ekranda üç ayrı kopya olarak duruyordu (`when()` Sessions ve
 * Moderation'da birebir aynı, Worlds'te `time()` adıyla üçüncü kez). Kopyalar ayrışmaya
 * başlamıştı: biri "az önce" derken diğeri "0 dk önce" diyordu.
 */

/** Göreli zaman: «3 dk önce». `null` → «—». */
export function when(v: string | null | undefined): string {
  if (!v) return '—';
  const ms = Date.now() - new Date(v).getTime();
  if (ms < 0) return `${rel(-ms)} sonra`;
  return `${rel(ms)} önce`;
}

function rel(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} sn`;
  if (s < 3600) return `${Math.floor(s / 60)} dk`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa`;
  return `${Math.floor(s / 86400)} gün`;
}

/** Saniyeyi insan ölçeğine çevirir — «412» değil «6 dk 52 sn». */
export function dur(s: number | null | undefined): string {
  if (s == null) return '—';
  if (s < 60) return `${s} sn`;
  if (s < 3600) return `${Math.floor(s / 60)} dk ${s % 60} sn`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa ${Math.floor((s % 3600) / 60)} dk`;
  return `${Math.floor(s / 86400)} gün ${Math.floor((s % 86400) / 3600)} sa`;
}

/** Binlik ayraçlı sayı. `null` → «—». */
export const num = (n: number | null | undefined): string =>
  (n == null ? '—' : n.toLocaleString('tr-TR'));

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/** Mutlak tarih — göreli zamanın `title` niteliğinde tam değeri için. */
export const stamp = (v: string | null | undefined): string =>
  (v ? new Date(v).toLocaleString('tr-TR') : '—');

/** Tablo hücresi: uzun değeri keser, nesneyi özetler. */
export function cell(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
  const s = String(v);
  return s.length > 48 ? `${s.slice(0, 45)}…` : s;
}
