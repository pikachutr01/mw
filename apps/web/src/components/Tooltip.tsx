/**
 * ⭐ TOOLTIP — tek bileşen, tek davranış.
 *
 * Projede bolca ipucu kullanılacak (kullanıcı kararı 2026-07-28). Her çağıranın kendi
 * `group-hover` numarasını yazması iki sorun doğuruyordu: (1) metinler ve gecikmeler birbirinden
 * ayrışıyordu, (2) `overflow` kesen bir kapsayıcının içinde ipucu **kırpılıyordu** — sol menü ve
 * tablo hücreleri tam olarak öyle kapsayıcılar.
 *
 * Kararlar:
 *  • **Portal + sabit konum.** İpucu `document.body`'ye çizilir → hiçbir `overflow: hidden`
 *    onu kesemez. Konum, tetikleyicinin ekrandaki gerçek kutusundan (`getBoundingClientRect`)
 *    hesaplanır ve pencere kenarına **kelepçelenir**; ekranın sağındaki bir ipucu dışarı taşmaz.
 *  • **Klavye de açar.** Yalnız `hover`'a bağlamak ipucunu klavye ve dokunmatik kullanıcıdan
 *    tamamen gizlerdi; `focus`/`blur` de dinleniyor.
 *  • **Yalnız kayıtlıyken çizilir.** Kapalı ipucu DOM'da hiç durmuyor — 11 menü maddesinin her
 *    birinde gizli bir kutu tutmak bedava değil.
 *  • **Erişilebilirlik:** tetikleyici `aria-describedby` ile ipucunu gösterir; ipucunun kendisi
 *    fare olaylarını yutmaz (`pointer-events: none`).
 *  • ⭐ **Dokunmatikte TIKLAMA AÇIP KAPATIR** (kullanıcı, 2026-08-08) — ayrıntısı aşağıda.
 */
import { useCallback, useEffect, useId, useReducer, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface Box {
  top: number;
  left: number;
}

/** İpucu ile tetikleyici arasındaki boşluk ve pencere kenarından bırakılan pay (px). */
const GAP = 8;
const EDGE = 6;

/* ── Açılma/kapanma mantığı — saf, bu yüzden test edilebilir ─────────────────── */

export type TipEvent =
  | { type: 'pointerdown'; pointer: string }
  | { type: 'enter'; pointer: string }
  | { type: 'leave'; pointer: string }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'click' }
  | { type: 'outside' };

export interface TipState {
  open: boolean;
  /** Son etkileşim dokunmatik miydi? Fare/dokunmatik davranışını ayıran tek bayrak. */
  byTouch: boolean;
}

export const TIP_INITIAL: TipState = { open: false, byTouch: false };

/**
 * ⭐⭐ İPUCUNUN TÜM DAVRANIŞI TEK YERDE — ve React'ten bağımsız (kullanıcı, 2026-08-08).
 *
 * ⚠️ Bu mantık **iki kez geriledi** (2026-08-04 dokunmatiği kör etti, 2026-08-06 geri alındı,
 * 2026-08-08 dokunmatikte hiç açılmadığı ortaya çıktı). Sebebi hep aynı: hata tek bir olayda
 * değil, olayların **SIRASINDA** yaşıyor. Bir dokunuşta tarayıcı şunu üretiyor —
 *   `pointerdown → pointerup → enter(taklit) → focus → click`
 * Eski kodda `enter` ve `focus` açıyor, hemen ardından `click` kapatıyordu: net sonuç
 * **hiç görünmemek**. Kullanıcının *"uygulamayı arka plana alıp öne çekince görülüyor"*
 * gözlemi teşhisin kendisiydi: orada yalnız taklit `enter` ateşleniyor, `click` gelmiyor.
 *
 * Mantık saf bir fonksiyona çıkarıldı ki bu sıra **gerçekten sınanabilsin**; bileşenin içinde
 * kaldığı sürece ancak gerçek bir tarayıcıda elle denenebiliyordu ve iki kez kaçtı.
 *
 * ⚠️ Fare/dokunmatik ayrımı `matchMedia('(hover: hover)')` ile DEĞİL, olayın kendi
 * `pointerType`'ıyla: dokunmatik ekranlı dizüstüler iki girdiyi de taşır ve ortam sorgusu
 * onlarda ikisinden birini yanlış tarafa atardı. Olayın türü ise her zaman doğru.
 */
export function tipReduce(s: TipState, e: TipEvent): TipState {
  switch (e.type) {
    case 'pointerdown':
      return { ...s, byTouch: e.pointer !== 'mouse' };
    // Fare üstüne gelince açılır/çekilince kapanır; dokunmatiğin taklit ettiği aynı olay yok sayılır.
    case 'enter':
      return e.pointer === 'mouse' ? { ...s, open: true } : s;
    case 'leave':
      return e.pointer === 'mouse' ? { ...s, open: false } : s;
    /**
     * Klavye erişimi korunuyor — ama DOKUNUŞLA gelen `focus` açmamalı: açarsa hemen ardından
     * gelen `click` onu kapatır ve baştaki hataya geri döneriz.
     */
    case 'focus':
      return s.byTouch ? s : { ...s, open: true };
    case 'blur':
      return { ...s, open: false };
    /**
     * ⭐ Fare: tıklamak KAPATIR (kullanıcı zaten eyleme geçti, ipucunun işi bitti).
     * ⭐ Dokunmatik: tıklamak AÇAR/KAPATIR — kullanıcının istediği davranış.
     * ⚠️ Karar `pointerdown`da değil `click`te veriliyor: araya giren `focus` sonucu bozardı.
     */
    case 'click':
      return { ...s, open: s.byTouch ? !s.open : false };
    case 'outside':
      return { ...s, open: false };
    default:
      return s;
  }
}

export function Tooltip({
  label, children, placement = 'bottom', className = '',
}: {
  /** İpucunun içeriği. Metin ya da küçük bir liste olabilir. */
  label: ReactNode;
  /** Tetikleyici. Tek bir öge olmalı; sarmalayıcı `inline-flex` bir `span`'dir. */
  children: ReactNode;
  placement?: TooltipPlacement;
  className?: string;
}) {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [{ open, byTouch }, dispatch] = useReducer(tipReduce, TIP_INITIAL);
  const [pos, setPos] = useState<Box | null>(null);

  /**
   * Konum, ipucu ÇİZİLDİKTEN sonra ölçülüyor (`useEffect` + `bubbleRef`): kutunun genişliğini
   * bilmeden ortalamak ya da kenara kelepçelemek mümkün değil. İlk kare `pos = null` ile
   * görünmez çiziliyor, ikinci karede yerine oturuyor — göz bunu fark etmiyor.
   */
  const place = useCallback(() => {
    const a = anchorRef.current?.getBoundingClientRect();
    const b = bubbleRef.current?.getBoundingClientRect();
    if (!a || !b) return;

    let top: number;
    let left: number;
    if (placement === 'top' || placement === 'bottom') {
      top = placement === 'top' ? a.top - b.height - GAP : a.bottom + GAP;
      left = a.left + a.width / 2 - b.width / 2;
    } else {
      top = a.top + a.height / 2 - b.height / 2;
      left = placement === 'left' ? a.left - b.width - GAP : a.right + GAP;
    }

    // Pencere dışına taşma: her iki eksende de kelepçele.
    left = Math.min(window.innerWidth - b.width - EDGE, Math.max(EDGE, left));
    top = Math.min(window.innerHeight - b.height - EDGE, Math.max(EDGE, top));
    setPos({ top, left });
  }, [placement]);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    place();
    // Sayfa kayarsa ipucu tetikleyicisinden kopmasın.
    const onMove = (): void => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, place]);

  /**
   * ⭐ Dokunmatikte açık ipucu, **başka bir yere dokununca** kapanır.
   *
   * ⚠️ Tetikleyicinin İÇİNDEKİ dokunuş dışlanmalı: dışlanmazsa `pointerdown` ipucunu kapatır,
   * hemen ardından gelen `click` yeniden açar ve ipucu asla kapanmaz (yazarken bir kez oldu).
   * ⚠️ Balon `pointer-events: none` olduğu için balonun üstüne dokunmak da "dışarı" sayılır —
   * ipucunda tıklanacak bir şey yok, bu doğru davranış. Tıklanabilir içerik gerekiyorsa
   * `Popover` kullanılmalı.
   */
  useEffect(() => {
    if (!open || !byTouch) return;
    const onDown = (e: PointerEvent): void => {
      if (anchorRef.current?.contains(e.target as Node)) return;
      dispatch({ type: 'outside' });
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, byTouch]);

  return (
    <>
      <span
        ref={anchorRef}
        aria-describedby={open ? id : undefined}
        /* ⭐ Kararın TAMAMI `tipReduce`ta ve orada gerekçeleriyle yazılı; burada yalnız
           tarayıcı olaylarını ona bağlıyoruz. */
        onPointerDown={(e) => dispatch({ type: 'pointerdown', pointer: e.pointerType })}
        onPointerEnter={(e) => dispatch({ type: 'enter', pointer: e.pointerType })}
        onPointerLeave={(e) => dispatch({ type: 'leave', pointer: e.pointerType })}
        onFocus={() => dispatch({ type: 'focus' })}
        onBlur={() => dispatch({ type: 'blur' })}
        onClick={() => dispatch({ type: 'click' })}
        className={`inline-flex ${className}`}
      >
        {children}
      </span>

      {open ? createPortal(
        <div
          ref={bubbleRef}
          id={id}
          role="tooltip"
          style={{
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            // Ölçülmeden önce görünmez: yanlış yerde bir kare parlamasın.
            visibility: pos ? 'visible' : 'hidden',
            boxShadow: 'var(--mw-shadow-md)',
          }}
          className="tex bevel pointer-events-none fixed z-[60] max-w-[15rem] rounded-[var(--radius-sm)]
            border-2 border-strong bg-surface px-2 py-1.5 text-left text-[11px] leading-snug text-ink"
        >
          {label}
        </div>,
        document.body,
      ) : null}
    </>
  );
}

/** İpucu içinde sık kullanılan "etiket … değer" satırı. */
export function TooltipRow({
  label, value, tone = 'ink',
}: { label: ReactNode; value: ReactNode; tone?: 'ink' | 'accent' | 'muted' }) {
  const toneClass = { ink: 'text-ink', accent: 'text-accent', muted: 'text-muted' }[tone];
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={`tnum font-semibold ${toneClass}`}>{value}</span>
    </span>
  );
}

/** İpucunun ilk satırı — küçük başlık. */
export function TooltipTitle({ children }: { children: ReactNode }) {
  return (
    <span className="display mb-1 block text-[11px] font-semibold tracking-wide text-ink uppercase">
      {children}
    </span>
  );
}
