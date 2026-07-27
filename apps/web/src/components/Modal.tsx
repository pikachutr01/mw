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

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Modal açıkken arkadaki sayfa kaymamalı (mobilde en çok bozulan davranış).
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    boxRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

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
  title: string;
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
