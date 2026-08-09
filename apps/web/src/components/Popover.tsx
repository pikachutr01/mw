/**
 * ⭐ POPOVER — tıklayınca açılıp tıklayınca kapanan bilgi kutusu (kullanıcı, 2026-08-08).
 *
 * ─ `Tooltip`ten farkı ve neden ayrı bir bileşen ────────────────────────────────────────────
 * `Tooltip` **anlık bir ipucu**dur: fareyle üstüne gelince açılır, çekilince kapanır, içine
 * dokunulamaz (`pointer-events: none`). Bu bileşen ise **kalıcı bir açıklama**dır: yalnız
 * tıklamayla açılır/kapanır, uzun metin taşır, içindeki metin seçilebilir ve okunurken fare
 * nereye giderse gitsin kaybolmaz. İkisini tek bileşende toplamak, "hover mı tıklama mı"
 * sorusunu her çağırana taşırdı; ayrı tutmak niyeti çağrı yerinde okunur kılıyor.
 *
 * ─ Kararlar ────────────────────────────────────────────────────────────────────────────────
 *  • **Portal + `position: fixed`.** Kutu `document.body`ye çizilir → `overflow: hidden` kesen
 *    hiçbir kapsayıcı (liste satırları, paneller) onu kırpamaz.
 *  • ⭐ **Ekrandan taşmaz, iki eksende de** (kullanıcının açık şartı). Yatayda pencere kenarına
 *    kelepçelenir; dikeyde önce tetikleyicinin ALTINA konur, orada yer yoksa ÜSTÜNE geçer.
 *    ⚠️ Yalnız kelepçelemek yetmiyor: dar bir telefonda alta sığmayan kutu kelepçelenince
 *    tetikleyicinin ÜSTÜNE biner ve neyi anlattığı görünmez olur. Bu yüzden "sığmıyorsa taraf
 *    değiştir", sonra kelepçe.
 *  • **Genişlik ekrana göre**: `min(20rem, ekran − 2×kenar payı)`. Sabit `rem` genişlik 320px
 *    ekranda taşardı ve kelepçe onu yalnız kaydırırdı, daraltmazdı.
 *  • **Kapanma yolları:** aynı düğmeye tekrar tıklamak · dışarı tıklamak · `Esc`. Üçü de
 *    beklenen davranış; biri eksik olsa kutu "kapanmıyor" hissi verir.
 *  • **Sayfa kayarsa** kutu tetikleyicisini izler (`scroll`/`resize` dinleniyor).
 *  • **Erişilebilirlik:** tetikleyici gerçek bir `<button>`, `aria-expanded` + `aria-controls`
 *    taşır; kutu `role="dialog"` DEĞİL (odak tuzağı yok, bir açıklama kutusu bu) — `role="note"`.
 */
import {
  useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/** Tetikleyiciyle kutu arası boşluk ve pencere kenarından bırakılan pay (px). */
const GAP = 8;
const EDGE = 8;
/** Kutunun en fazla genişliği (px) — ekran darsa bu da daraltılır. */
const MAX_W = 320;

interface Box { top: number; left: number; width: number }

export interface Rect { top: number; bottom: number; left: number; width: number }
export interface Viewport { width: number; height: number }

/**
 * ⭐ Konum hesabı — saf fonksiyon, bu yüzden test edilebilir.
 *
 * Kullanıcının açık şartı *"ekrandan taşmayacak şekilde kendini konumlandıracak"* tam olarak
 * burada yaşıyor; bileşenin içinde kalsaydı ancak gerçek bir tarayıcıyı elle daraltarak
 * denenebilirdi.
 *
 * ⚠️ **Sadece kelepçelemek YETMİYOR.** Dar bir telefonda alta sığmayan kutuyu kelepçelemek onu
 * tetikleyicinin ÜSTÜNE bindirir ve neyi anlattığı görünmez olur. Sıra şu olmalı:
 * **önce daralt → sonra taraf seç (alt sığmıyorsa üst) → en son kelepçele.**
 */
export function placePopover(
  a: Rect, boxHeight: number, vp: Viewport, maxWidth: number = MAX_W,
): Box {
  // 1) Genişlik ekrana göre: sabit `rem` genişlik 320px ekranda taşardı ve kelepçe onu
  //    yalnız kaydırırdı, daraltmazdı.
  const width = Math.min(maxWidth, vp.width - EDGE * 2);

  // 2) Dikey taraf ÖLÇÜLEN yükseklikle seçilir; sabit tercih (hep alt) kısa ekranlarda taşıyordu.
  const below = a.bottom + GAP;
  const top = below + boxHeight + EDGE <= vp.height
    ? below
    : Math.max(EDGE, a.top - boxHeight - GAP);

  // 3) Yatayda tetikleyiciyle ortala, sonra iki kenara da kelepçele.
  const centered = a.left + a.width / 2 - width / 2;
  const left = Math.min(vp.width - width - EDGE, Math.max(EDGE, centered));

  return { top, left, width };
}

export function Popover({
  label, children, className = '', trigger, width,
}: {
  /**
   * Kutunun içeriği.
   *
   * ⭐ **Fonksiyon da olabilir** ve o zaman `close` alır (2026-08-09). Menüler için şart:
   * bir madde seçildiğinde kutu kapanmalı, ama dışarı-tıklama kapatıcısı kutunun İÇİNİ
   * bilerek dışlıyor (bilgi kutusundaki metin seçilebilsin diye). Kullanıcı bunu bildirdi:
   * *"Konseyden Çıkar dedikten sonra hem onay penceresi hem popover ekranda kalıyor."*
   *
   * ⚠️ "İçeriye tıklanınca hep kapan" demedik: o, bilgi kutusunda metin seçmeyi bozardı ve
   * ayırıcıya/boşluğa değince de kapatırdı. Kapatma kararı **maddenin kendisinde** olmalı.
   */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Ekran okuyucu için düğmenin adı ("Çiftlik hakkında bilgi" gibi). */
  label: string;
  className?: string;
  /**
   * ⭐ Tetikleyicinin görüntüsü (2026-08-09). Verilmezse varsayılan küçük «i» dairesi çizilir.
   *
   * ⚠️ Bu genişletme, **açılır menüler için ikinci bir konumlandırma kodu yazmamak** için var:
   * "ekrandan taşmadan aç/kapa" davranışı zaten burada çözülmüş ve testli. İttifak sayfasındaki
   * üye işlemleri ve başlık düğmeleri de aynı kutuyu kullanıyor.
   */
  trigger?: ReactNode;
  /** Kutunun en fazla genişliği (px). Menüler bilgi kutusundan dar olabilir. */
  width?: number;
}) {
  const id = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Box | null>(null);

  const place = useCallback(() => {
    const a = btnRef.current?.getBoundingClientRect();
    const b = boxRef.current?.getBoundingClientRect();
    if (!a || !b) return;
    setPos(placePopover(a, b.height, { width: window.innerWidth, height: window.innerHeight }, width ?? MAX_W));
  }, [width]);

  /**
   * ⚠️ `useLayoutEffect` — `useEffect` DEĞİL. Konum, kutu çizildikten SONRA ölçülüyor; boyama
   * öncesinde yerleştirmezsek kutu bir kare yanlış yerde görünür ve gözle fark edilen bir
   * "zıplama" olur. Layout etkisi boyamadan önce koşar, zıplama olmaz.
   */
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onMove = (): void => place();
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    /**
     * ⚠️ Tetikleyicinin İÇİ dışlanmalı: dışlanmazsa `pointerdown` kutuyu kapatır, hemen ardından
     * gelen `click` yeniden açar ve düğme hiç kapanmaz. Kutunun içi de dışlanıyor — içindeki
     * metin seçilebilmeli.
     */
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || boxRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        /**
         * ⚠️ **Görsel küçük, DOKUNMA ALANI değil.** Kullanıcı *"ufak ikon"* istedi ve 16px'lik
         * bir daire parmakla ıskalanır. `after:-inset-2` görünmez bir 32px'lik hedef ekliyor;
         * `absolute` olduğu için satır düzenini hiç etkilemiyor (kutuyu büyütmek satırdaki
         * her şeyi kaydırırdı).
         * ⚠️ Özel tetikleyici verilmişse bu süslemelerin HİÇBİRİ uygulanmaz: çağıran kendi
         * düğmesini getiriyorsa boyutunu da o biliyor.
         */
        className={trigger != null ? className : `relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full
          border border-border text-[10px] leading-none font-semibold text-muted
          transition-colors hover:border-accent hover:text-accent
          after:absolute after:-inset-2 after:content-['']
          ${open ? 'border-accent text-accent' : ''} ${className}`}
      >
        {/* ⚠️ Metin `i` DEĞİL, `ℹ` de değil: ikisi de yazı tipine göre farklı yükseklikte
            oturuyor ve dairenin içinde kayıyordu. Düz `i` + `leading-none` + sabit kutu
            en tutarlı sonucu veriyor. */}
        {trigger ?? <span aria-hidden>i</span>}
      </button>

      {open ? createPortal(
        <div
          ref={boxRef}
          id={id}
          role="note"
          style={{
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            width: pos?.width ?? (width ?? MAX_W),
            // Ölçülmeden önce görünmez: yanlış yerde bir kare parlamasın.
            visibility: pos ? 'visible' : 'hidden',
            boxShadow: 'var(--mw-shadow-md)',
          }}
          className="tex bevel fixed z-[60] rounded-[var(--radius-sm)] border-2 border-strong
            bg-surface px-2.5 py-2 text-left text-[12px] leading-relaxed text-ink"
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>,
        document.body,
      ) : null}
    </>
  );
}

/** Popover içinde "etiket … değer" satırı — üretim rakamları için. */
export function PopoverRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="tnum font-semibold text-accent">{value}</span>
    </span>
  );
}
