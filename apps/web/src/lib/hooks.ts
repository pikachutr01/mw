/**
 * Paylaşılan kancalar.
 *
 * ⭐ **Geri sayımlar SUNUCU saatinden çizilir** (§7/§10). İstemcinin saati yanlış (veya kasten
 * kaydırılmış) olabilir; her yanıtta gelen `serverNow` ile offset tutulur ve tüm geri sayımlar
 * ondan beslenir. Aksi hâlde saati ileri alan oyuncu "ordum vardı" sanır, sunucu katılmaz.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getSession, onSessionChange, type Session } from './api.ts';

/**
 * ⭐ OTURUMU REACT'E BAĞLAR.
 *
 * ⚠️ `getSession()` **reaktif değil** — modül düzeyinde bir değişken okuyor. Giriş/çıkış artık
 * sayfayı yenilemediği için (misafir modu, §10.x) sorguların kendiliğinden açılıp kapanması
 * buna bağlı: `enabled: useSession() != null` yazan her sorgu giriş anında tazeleniyor.
 *
 * ⚠️ Kanca `api.ts`te DEĞİL burada: `api.ts` çerçeveden bağımsız düz bir modül ve öyle kalmalı
 * (Flutter istemcisi de aynı sözleşmeyi okuyacak).
 *
 * `onSessionChange` ve `getSession` modül düzeyinde sabit referanslar; `useSyncExternalStore`
 * sözleşmesi (kararlı abone + değişmeyen anlık görüntü) böylece sağlanıyor.
 */
export const useSession = (): Session | null =>
  useSyncExternalStore(onSessionChange, getSession, getSession);

/**
 * ⭐ CSS kırılımını JavaScript'e taşır — `hidden lg:block` ile gizlenen bir bileşeni
 * **hiç mount etmemek** için (2026-08-03).
 *
 * ⚠️ Gerekçe ölçülebilir: sağ sütundaki ittifak paneli `hidden xl:block` ile gizleniyordu
 * ama o yalnız görünürlük — bileşen mobilde de mount oluyor, kancaları çalışıyor ve
 * `/alliance` sorgusu **hiç kimsenin bakmadığı bir panel için** dakikada bir dönüyordu.
 * Görsel gizleme ile mount ayrı şeyler; ağ trafiği ikincisine bakar.
 *
 * `matchMedia` aboneliği `useSyncExternalStore` ile: her çağıran kendi `useEffect`ini
 * kurmuyor, React kiralama sırasında da doğru değeri okuyor.
 */
export function useMediaQuery(query: string): boolean {
  const [subscribe, getSnapshot] = useMemo(() => {
    const mql = window.matchMedia(query);
    return [
      (cb: () => void) => {
        mql.addEventListener('change', cb);
        return () => mql.removeEventListener('change', cb);
      },
      () => mql.matches,
    ] as const;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * ⭐ İKİ AYRI SAAT — karıştırmak 2026-08-02'de canlıda bir hataya yol açtı.
 *
 *   `serverNow()` — sunucunun **gerçek** saati. Yalnız gerçek zamanda tutulan değerler için
 *                   (bakım perdesinin `maintenance_eta`'sı) ve süre FARKI hesapları için.
 *   `gameNow()`   — **oyun saati** = gerçek saat − dünyanın toplam duraklama süresi.
 *                   `execute_at`, `finish_at`, `resources_at` — yani ekranda geri sayımı
 *                   çizilen HER mutlak damga bu ölçekte tutulur (`game-clock.service.ts`).
 *
 * ⚠️ Hata şuydu: geri sayımlar oyun saatindeki damgaları GERÇEK saatle karşılaştırıyordu.
 * Fark, dünyanın duraklama toplamı kadardır (canlıda 202 sn). Uzun görevlerde bu fark
 * yutuluyor ve hiç fark edilmiyordu; ama **casusluk 120 sn sürdüğü için varış anı hep
 * "geçmiş" çıkıyordu** → geri sayım yerine sürekli «varıyor» yazıyordu. Yani hata görev
 * SÜRESİ kısaldıkça görünür oluyordu — en sinsi türden.
 *
 * Her iki çıpa da her yanıtta tazeleniyor; `gameNow` alanını göndermeyen uçlar offset'i
 * bozmaz, yalnız güncellemez (şehir detayı her ekranda çalışıyor ve ikisini de gönderiyor).
 */
let clockSkewMs = 0;
let gameOffsetMs = 0;

export function noteServerTime(serverNow: string | undefined, gameNow?: string): void {
  if (serverNow) {
    const t = Date.parse(serverNow);
    if (Number.isFinite(t)) clockSkewMs = t - Date.now();
  }
  if (serverNow && gameNow) {
    const s = Date.parse(serverNow);
    const g = Date.parse(gameNow);
    if (Number.isFinite(s) && Number.isFinite(g)) gameOffsetMs = g - s;
  }
}

/** Sunucunun gerçek saati (tarayıcı saati + ölçülen sapma). */
export function serverNow(): number {
  return Date.now() + clockSkewMs;
}

/** Oyun saati — geri sayımların TAMAMI bunu kullanmalı. */
export function gameNow(): number {
  return serverNow() + gameOffsetMs;
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

/**
 * Kalan süreyi "2 sa 04 dk" / "3 dk 12 sn" biçiminde verir. Bitmişse `null`.
 *
 * ⚠️ Varsayılan çıpa **oyun saati**: geri sayımı çizilen damgaların hepsi o ölçekte tutuluyor.
 * Gerçek zamanda tutulan bir değer için (yalnız bakım ETA'sı) `now` AÇIKÇA geçilmeli.
 */
export function remaining(iso: string | null | undefined, now = gameNow()): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return formatDuration(Math.round(ms / 1000));
}

/**
 * ⭐ **Saniye hassasiyeti her zaman** (kullanıcı kararı): saatlik geri sayımlarda da saniye yazar.
 * Önceden `2 sa 04 dk` gösteriliyordu; oyuncu ekrana bakıp "donmuş mu?" diye tereddüt ediyordu ve
 * son dakikaya kadar varışın tam anını göremiyordu. Ordu hareketleri dahil TÜM geri sayımlar
 * bu fonksiyondan geçer.
 */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  if (h) return `${h} sa ${pad(m)} dk ${pad(sec)} sn`;
  if (m) return `${m} dk ${pad(sec)} sn`;
  return `${sec} sn`;
}

/**
 * ⭐ **GÜNLERCE SÜREN** geri sayımlar için kaba biçim: `29 gün 23 sa` · `19 sa 04 dk`.
 *
 * ⚠️ `formatDuration`ın YERİNE GEÇMEZ, onun yanına konuldu. Oradaki «saniye hassasiyeti her
 * zaman» kuralı kullanıcının açık kararı ve ordu hareketleri için doğru: oyuncu varışın tam
 * anını görmek istiyor. Ama tatilin 30 günlük üst sınırı o biçimde **`719 sa 56 dk 17 sn`**
 * diye çıkıyordu — okunmuyor, üstelik saniyesi boş yere titriyor.
 *
 * Kural: **bir günden uzun süreler burada, kısa olanlar `formatDuration`da.**
 */
export function formatLongDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 86_400) return formatDuration(s);
  const gun = Math.floor(s / 86_400);
  const sa = Math.floor((s % 86_400) / 3600);
  return sa ? `${gun} gün ${sa} sa` : `${gun} gün`;
}

/** `remaining` ile aynı, yalnız günlerce süren aralıklar için. Bitmişse `null`. */
export function remainingLong(iso: string | null | undefined, now = serverNow()): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return formatLongDuration(ms / 1000);
}

/**
 * Dar yerler için **saat biçimi**: `04:31` · `2:04:27`. Orijinal oyunun kendi gösterimi budur
 * (`images/scr_mobil02`, `scr_itv03`) ve saniye hassasiyetini kaybetmeden simgenin altına sığar.
 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const rest = `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return h ? `${h}:${rest}` : rest;
}

/** `remaining` ile aynı, yalnız saat biçiminde. Bitmişse `null`. */
export function remainingClock(iso: string | null | undefined, now = gameNow()): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return formatClock(ms / 1000);
}

/**
 * Değeri `ms` boyunca sakinleşene kadar geciktirir — arama kutuları için.
 *
 * ⚠️ Bu olmadan hızlı yazan oyuncu her tuşta bir HTTP isteği atıyor (ittifak aramasında uzun
 * süre tam olarak bu vardı). TanStack Query her farklı anahtarı ayrı sorgu saydığı için
 * `staleTime` bunu ÇÖZMEZ; gecikme girdi tarafında olmak zorunda.
 */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
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
