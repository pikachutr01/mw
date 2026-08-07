/**
 * ⭐ BİLDİRİM ŞERİDİ (toast) — uygulama AÇIKKEN gelen bildirimlerin gösterildiği yer (§7.2).
 *
 * Kullanıcı tarifi: *"sağdan animasyonlu çıkıp birkaç saniye sonra yine sağa doğru kayarak
 * kaybolan bir notify penceresi"*, mobilde de aynı yön ama ekranın altında.
 *
 * ⭐ **Metin sunucudan gelir, burada ÜRETİLMEZ.** `notify.catalog.ts` aynı dizeyi hem bu toast'a
 * hem işletim sistemi push bildirimine veriyor; istemci kendi metnini kursaydı iki kanal
 * kaçınılmaz olarak ayrışırdı ("Saldırı geliyor!" vs "Yeni saldırı").
 *
 * ⚠️ Bu bileşen yalnız oyuncu ÇEVRİMİÇİYKEN iş görür — sunucu WS bağlıyken push atmıyor
 * (`NotifyService.deliver`). Yani toast ile sistem bildirimi asla aynı anda görünmez.
 */
import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { onSocketEvent } from '../lib/realtime.ts';

/** Ekranda kalma süresi. Kısa metinler için 6 sn okumaya yeter, akışı da tıkamaz. */
const DWELL_MS = 6000;
const EXIT_MS = 220;          // index.css'teki `mw-toast-out` süresiyle aynı olmalı
/** En fazla bu kadar yığılır; fazlası en eskisini düşürür (ekranı kaplamasın). */
const MAX_STACK = 3;

export interface ToastInput {
  title: string;
  body?: string;
  /** Tıklanınca gidilecek rota. Yoksa toast tıklanmaz. */
  url?: string;
  category?: string;
}

interface Toast extends ToastInput {
  id: number;
  leaving: boolean;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

/** Kategoriye göre simge — metin sunucudan geldiği için burada yalnız görsel ayrım var. */
const ICON: Record<string, string> = {
  attack: '⚔',
  dm: '✉',
  report: '📜',
  production: '⚒',
  mention: '@',
};

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const navigate = useNavigate();

  const remove = useCallback((id: number): void => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    // Çıkış animasyonu bitmeden DOM'dan silinirse kutu birden yok olur (kayma görünmez).
    const timer = setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, EXIT_MS);
    timers.current.set(id, timer);
  }, []);

  const show = useCallback((input: ToastInput): void => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((list) => [...list, { ...input, id, leaving: false }]);
    timers.current.set(id, setTimeout(() => remove(id), DWELL_MS));
  }, [remove]);

  /**
   * ⭐ YIĞIN SINIRI — fazlası **normal çıkış yolundan** düşer, kesilip atılmaz.
   *
   * ⚠️ Bir ara sınır `show` içinde `list.slice(-(MAX_STACK - 1))` ile uygulanıyordu ve iki
   * kusuru vardı: (1) çıkış animasyonunu oynatan (`leaving`) kutular da sayıya giriyordu,
   * (2) sınırı aşan kutu DOM'dan **anında** koparıldığı için sağa kayarak kaybolmuyor,
   * yerinde patlıyordu — üstelik zamanlayıcısı `timers`'ta öksüz kalıyordu. Kullanıcı
   * 2026-07-31'de "birbirine yakın tetiklenen notify'lar üst üste birikebilsin" dedi; birikme
   * zaten vardı, düzgün olmayan çıkıştı. Artık fazlalık `remove()`'a veriliyor: aynı
   * animasyon, aynı zamanlayıcı temizliği.
   */
  useEffect(() => {
    const staying = toasts.filter((t) => !t.leaving);
    for (const t of staying.slice(0, Math.max(0, staying.length - MAX_STACK))) remove(t.id);
  }, [toasts, remove]);

  /* Sunucudan gelen bildirim → toast. Olay `{topic, ref}` sarmalını `realtime.ts` açıyor. */
  useEffect(() => onSocketEvent('notify:show', (payload) => {
    const title = String(payload['title'] ?? '').trim();
    if (title === '') return;
    show({
      title,
      body: String(payload['body'] ?? ''),
      url: payload['url'] == null ? undefined : String(payload['url']),
      category: payload['category'] == null ? undefined : String(payload['category']),
    });
  }), [show]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, []);

  const open = (t: Toast): void => {
    if (t.url) navigate(t.url);
    remove(t.id);
  };

  /** Fareyle üzerine gelince sayaç durur — okurken kaybolması en can sıkıcı davranış olurdu. */
  const hold = (id: number): void => {
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  };
  const resume = (id: number): void => {
    if (timers.current.has(id)) return;
    timers.current.set(id, setTimeout(() => remove(id), DWELL_MS));
  };

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/*
        z-50: alt bar (20) < sohbet (30) < modal (40) < TOAST (50) < tooltip (60).
        Modal açıkken de görünmeli — gelen saldırı, oyuncunun o an ne yaptığından önemli.
        Mobilde alt gezinti barının (4rem) üstünde durur; masaüstünde sohbet penceresi de
        sağ altta olduğu için toast onun ÜSTÜNDEN başlar (sm:bottom-[8.5rem]).
      */}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed right-2 bottom-[4.75rem] z-50 flex w-[min(20rem,calc(100vw-1rem))]
          flex-col-reverse gap-2 sm:right-3 sm:bottom-3 xl:right-[16.5rem]"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.url ? 'button' : undefined}
            tabIndex={t.url ? 0 : undefined}
            onClick={() => open(t)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(t); }}
            onMouseEnter={() => hold(t.id)}
            onMouseLeave={() => resume(t.id)}
            className={`tex bevel pointer-events-auto flex items-start gap-2 rounded-[var(--radius-md)]
              border-2 border-strong bg-surface px-3 py-2 text-left
              ${t.leaving ? 'mw-toast-out' : 'mw-toast-in'}`}
          >
            <span aria-hidden className="mt-0.5 shrink-0 text-base leading-none">
              {ICON[t.category ?? ''] ?? '•'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="display block truncate text-sm font-semibold text-ink">{t.title}</span>
              {t.body ? (
                <span className="mt-0.5 block text-xs leading-snug text-muted line-clamp-2">{t.body}</span>
              ) : null}
            </span>
            <button
              type="button"
              aria-label="Kapat"
              onClick={(e) => { e.stopPropagation(); remove(t.id); }}
              className="-mr-1 -mt-1 shrink-0 px-1 text-base leading-none text-muted hover:text-ink"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Yerel bildirim göstermek isteyen ekranlar için (sunucudan gelmeyen durumlar). */
export const useToast = (): ((t: ToastInput) => void) => useContext(ToastContext);
