/**
 * ⭐ MODAL ve GLOBAL ONAY DİYALOĞU.
 *
 * Oyunda bolca modal kullanılacak (kullanıcı kararı) → tek bileşen, tek davranış:
 * ESC kapatır · arka plana tıklamak kapatır · açıkken sayfa kaymaz · odak modala girer.
 *
 * ⚠️ **Geri alınamaz işlemler onay ister** (görev iptali gibi) ve onay diyaloğu **global**dir:
 * her çağıran kendi diyaloğunu kurarsa metinler ve davranış kaçınılmaz olarak birbirinden ayrışır.
 * `useConfirm()` bir Promise döndürür; çağıran `if (!await confirm(...)) return;` yazar.
 */
import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';
import { Button } from './ui.tsx';

/* ── Modal ─────────────────────────────────────────────────────────────────── */

/**
 * ⚠️ **KAYDIRMA KİLİDİ SAYILARAK TUTULUR, HER MODAL KENDİ YEDEĞİNİ ALMAZ.**
 *
 * Eskiden her `Modal` açılışta `body.style.overflow`u kendi içine yedekliyor, kapanışta geri
 * yazıyordu. İki modal aynı anda açıkken bu bozuluyor: ikincisi yedek olarak birincinin
 * bıraktığı `'hidden'`i alıyor, önce BİRİNCİ kapanırsa ikinci kapandığında `'hidden'` geri
 * yazılıyor ve **sayfa kalıcı olarak kaydırılamaz kalıyordu** (yenilemeden düzelmiyor).
 *
 * Üst üste modal istisna değil: `ConfirmProvider` de bir `Modal` çiziyor, yani "modalın
 * içinden onay iste" (ordu iptali gibi) her seferinde iki modal demek.
 *
 * Doğrusu: özgün değeri **ilk** modal saklar, **son** modal geri verir.
 * `StrictMode`'un çift etkisi güvenli — sayaç 1→0→1 gidip aynı değeri geri koyar.
 */
let openModalCount = 0;
let overflowBeforeFirstModal = '';

export function Modal({
  title, onClose, children, footer, width = 'md',
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  /**
   * ⚠️ **ODAK ÇALMA HATASI** (2026-07-28'de bulundu). Bu etkinin bağımlılığı bir zamanlar
   * `[onClose]`'du ve gövdesinde `boxRef.current?.focus()` vardı. Çağıranlar `onClose`'u
   * `onClose={() => setTarget(null)}` diye **satır içi** veriyor → her render'da yeni bir işlev
   * → etki yeniden koşuyor → **odak kutuya geri alınıyordu.**
   *
   * Sonuç: saldırı modalında asker sayısı yazarken imleç birkaç saniyede bir kayboluyordu.
   * Suçlu yoklama gibi görünüyordu ama yoklama yalnız TETİKLEYİCİYDİ; her yeniden çizim
   * (WS olayı, sayaç tik'i) aynı şeyi yapardı.
   *
   * Doğrusu: odak **yalnız açılışta** alınır (`[]`), `onClose` bir ref üzerinden okunur.
   */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    // Modal açıkken arkadaki sayfa kaymamalı (mobilde en çok bozulan davranış).
    if (openModalCount === 0) overflowBeforeFirstModal = document.body.style.overflow;
    openModalCount += 1;
    document.body.style.overflow = 'hidden';
    boxRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      openModalCount -= 1;
      if (openModalCount === 0) document.body.style.overflow = overflowBeforeFirstModal;
    };
  }, []);

  const maxW = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[width];

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[var(--mw-color-overlay)] p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: 'var(--mw-shadow-md)' }}
        className={`flex max-h-[90vh] w-full ${maxW} flex-col overflow-hidden rounded-t-[var(--radius-lg)]
          border-2 border-strong bg-surface outline-none sm:rounded-[var(--radius-md)]`}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b-2 border-strong bg-panel-header px-3 py-2">
          <h2 className="display truncate text-sm font-semibold tracking-wider text-on-panel-header uppercase">
            {title}
          </h2>
          <button onClick={onClose} aria-label="Kapat"
            className="shrink-0 rounded-[var(--radius-sm)] px-2 text-lg leading-none text-on-panel-header hover:bg-black/10">
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer ? (
          <footer className="flex shrink-0 justify-end gap-2 border-t-2 border-strong bg-raised px-3 py-2">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/* ── Global onay diyaloğu ──────────────────────────────────────────────────── */

export interface ConfirmOptions {
  /**
   * ⚠️ `string` DEĞİL `ReactNode` (2026-08-09): onay başlıklarının bir kısmı kullanıcı adı
   * taşıyor ("Ayline" · "Ayline → Kartallar") ve başlık bandı `uppercase` + Cinzel. Adın
   * `<UserText>` ile sarmalanabilmesi için başlığın düğüm olması gerekiyor.
   */
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Yıkıcı işlemlerde onay düğmesi kırmızı olur. */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
    { options: ConfirmOptions; resolve: (ok: boolean) => void } | null
  >(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setState({ options, resolve })),
    [],
  );

  const finish = (ok: boolean): void => {
    state?.resolve(ok);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state ? (
        <Modal
          title={state.options.title}
          width="sm"
          onClose={() => finish(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => finish(false)}>
                {state.options.cancelLabel ?? 'Vazgeç'}
              </Button>
              <Button variant={state.options.danger ? 'danger' : 'primary'} onClick={() => finish(true)}>
                {state.options.confirmLabel ?? 'Onayla'}
              </Button>
            </>
          }
        >
          <div className="px-3 py-3 text-sm text-ink">{state.options.body}</div>
        </Modal>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = (): ConfirmFn => useContext(ConfirmContext);
