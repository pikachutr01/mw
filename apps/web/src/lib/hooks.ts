/**
 * Paylaşılan kancalar.
 *
 * ⭐ **Geri sayımlar SUNUCU saatinden çizilir** (§7/§10). İstemcinin saati yanlış (veya kasten
 * kaydırılmış) olabilir; her yanıtta gelen `serverNow` ile offset tutulur ve tüm geri sayımlar
 * ondan beslenir. Aksi hâlde saati ileri alan oyuncu "ordum vardı" sanır, sunucu katılmaz.
 */
import { useEffect, useState } from 'react';

/** Sunucu ile istemci saati farkı (ms). Tek yerde tutulur, her yanıtta tazelenir. */
let clockSkewMs = 0;

export function noteServerTime(serverNow: string | undefined): void {
  if (!serverNow) return;
  const t = Date.parse(serverNow);
  if (Number.isFinite(t)) clockSkewMs = t - Date.now();
}

export function serverNow(): number {
  return Date.now() + clockSkewMs;
}

/**
 * Saniyede bir tetiklenen sayaç. Geri sayım gösteren her bileşen bunu kullanır → tüm ekranda
 * TEK zamanlayıcı çalışır, bileşen başına `setInterval` açılmaz.
 */
export function useTick(active = true): number {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return serverNow();
}

/** Kalan süreyi "2 sa 04 dk" / "3 dk 12 sn" biçiminde verir. Bitmişse `null`. */
export function remaining(iso: string | null | undefined, now = serverNow()): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return formatDuration(Math.round(ms / 1000));
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h} sa ${String(m).padStart(2, '0')} dk`;
  if (m) return `${m} dk ${String(sec).padStart(2, '0')} sn`;
  return `${sec} sn`;
}

export const nf = new Intl.NumberFormat('tr-TR');
export const fmt = (n: number): string => nf.format(Math.round(n));

/* ── Tema (§13.13.4) ───────────────────────────────────────────────────────── */

export type Theme = 'system' | 'light' | 'dark';

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem('mw-theme') as Theme | null) ?? 'system',
  );

  useEffect(() => {
    // `system` seçiliyken data-theme KALDIRILIR → CSS `prefers-color-scheme`'e döner ve
    // işletim sistemi gece moduna geçtiğinde sayfa canlı olarak takip eder (§13.13.4).
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mw-theme', theme);
  }, [theme]);

  return [theme, setThemeState];
}
