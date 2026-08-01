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
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface Box {
  top: number;
  left: number;
}

/** İpucu ile tetikleyici arasındaki boşluk ve pencere kenarından bırakılan pay (px). */
const GAP = 8;
const EDGE = 6;

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
  const [open, setOpen] = useState(false);
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
   * ⭐ DOKUNMATİK DESTEĞİ (2026-08-01). Bileşen yalnız hover/focus ile açılıyordu; telefonda
   * `hover` diye bir şey olmadığı için yapı açıklamaları **hiç görünmezdi**.
   *
   * ⚠️ Çözüm `onClick` değil **`onPointerDown` + `pointerType` ayrımı**: `onClick` fare
   * kullanıcısında da tetiklenir ve hover ile birleşince ipucu tıklayınca KAPANIRDI
   * (aç → tıkla → kapat). Dokunmada `mouseenter` de sentetik olarak geliyor, o yüzden
   * dokunuşta durumu ters çevirmek yerine AÇIK bırakıp dışarı dokunuşla kapatıyoruz.
   */
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse') return;
      if (anchorRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  return (
    <>
      <span
        ref={anchorRef}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={(e) => {
          // Dokunmada tarayıcı sahte bir `mouseleave` de yolluyor; ipucu anında kapanmasın.
          if (e.nativeEvent instanceof MouseEvent && e.nativeEvent.detail === 0) return;
          setOpen(false);
        }}
        onPointerDown={(e) => { if (e.pointerType !== 'mouse') setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
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
