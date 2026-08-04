/**
 * ⭐ TERCİHLER — oyuncunun kendi arayüz anahtarları (kullanıcı, 2026-08-04).
 *
 * *"Seçenekler kısmına tercihler bölümü açalım … switch kapandığı an otomatik kayıt edilir ve
 * ayarlar localstorage'de saklanır. Başka bu şekilde switch ile açılıp kapatılan ayarlar
 * ekleyeceğiz sonradan."*
 *
 * ─ NEDEN SUNUCUDA DEĞİL ───────────────────────────────────────────────────────────────────
 * ⚠️ Bunlar **oyun ayarı değil, görünüm tercihi**: hiçbirinin sonucu oyun durumunu
 * değiştirmiyor ve kimse başkasının tercihini merak etmiyor. Sunucuya taşımak her açılışa bir
 * istek, her değişikliğe bir yazma ve bir de "çevrimdışıyken ne olacak" sorusu eklerdi.
 * ⚠️ Bedeli açık ve kabul edilmiş: tercih **cihaz başına**. Telefonda kapatılan tablo
 * masaüstünde açık kalır. Gerçek bir hesap tercihi gerektiğinde (ör. bildirim sessizliği)
 * o ayrı bir iş — bu modül onun yerini tutmuyor.
 *
 * ─ YENİ TERCİH EKLEMEK ────────────────────────────────────────────────────────────────────
 * `PREFS` listesine **tek satır**. Ekran kendini o listeden çiziyor; ne form, ne durum, ne
 * kayıt kodu yazılıyor. Kullanıcı "sonradan başka switch'ler ekleyeceğiz" dediği için
 * genişleme maliyeti sıfıra yakın tutuldu.
 */
import { useCallback, useEffect, useState } from 'react';

export interface PrefDef {
  key: string;
  label: string;
  /** Anahtarın ne yaptığı — ekranda etiketin altında duruyor. */
  hint: string;
  /** ⚠️ Varsayılan daima "bugünkü davranış": tercih eklemek kimsenin ekranını değiştirmemeli. */
  default: boolean;
}

export const PREFS: readonly PrefDef[] = [
  {
    key: 'armiesTable',
    label: 'Ordular sayfasında hareket listesi',
    hint: 'Aynı hareketler şehir simgelerinin altında zaten sıralı duruyor. Kapatırsan '
      + 'Ordular sayfasındaki metinli liste gizlenir, şeritteki simgeler kalır.',
    default: true,
  },
] as const;

const STORAGE_KEY = 'mw-prefs';

type PrefMap = Record<string, boolean>;

function read(): PrefMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? parsed as PrefMap : {};
  } catch {
    /* ⚠️ Bozuk/erişilemez depo tercihleri sıfırlar, ekranı ÇÖKERTMEZ: gizli sekmede ya da
       depo kotası dolu bir tarayıcıda `localStorage` fırlatabiliyor. */
    return {};
  }
}

/**
 * ⚠️ Abonelik listesi modül düzeyinde: `storage` olayı YALNIZ diğer sekmelerde tetikleniyor,
 * yani aynı sekmedeki değişikliği kendimiz duyurmazsak açık olan diğer bileşenler bayat kalır.
 */
const listeners = new Set<() => void>();

export function getPref(key: string): boolean {
  const stored = read()[key];
  if (typeof stored === 'boolean') return stored;
  return PREFS.find((p) => p.key === key)?.default ?? true;
}

export function setPref(key: string, value: boolean): void {
  const next = { ...read(), [key]: value };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* depo yazılamıyorsa tercih oturumluk kalır; ekran yine doğru davranır */ }
  for (const fn of listeners) fn();
}

/** Bileşenler için: değeri okur ve değişince yeniden çizilir (bu sekme ve diğerleri). */
export function usePref(key: string): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => getPref(key));

  useEffect(() => {
    const sync = (): void => setValue(getPref(key));
    listeners.add(sync);
    // ⚠️ Diğer sekmeler için `storage`; aynı sekme için yukarıdaki dinleyici listesi.
    window.addEventListener('storage', sync);
    return () => {
      listeners.delete(sync);
      window.removeEventListener('storage', sync);
    };
  }, [key]);

  const set = useCallback((v: boolean) => setPref(key, v), [key]);
  return [value, set];
}
