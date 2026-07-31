/**
 * Panelin en küçük arayüz parçaları.
 *
 * ⚠️ `apps/web/src/components/ui.tsx` KOPYALANMADI. Oradaki parçalar oyunun doku/kabartma
 * dilini taşıyor (`tex`, `bevel`, pergament zemin); panel yoğun veri ekranı ve o dil burada
 * okunabilirliği düşürüyor. Ortak olan **jetonlar**, bileşenler değil.
 */
import type { ReactNode } from 'react';

export function Panel({
  title, right, children,
}: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border
        bg-panel-header px-3 py-2">
        <h2 className="display text-xs font-semibold tracking-wider text-on-panel-header uppercase">
          {title}
        </h2>
        {right ? <span className="text-xs text-on-panel-header/80">{right}</span> : null}
      </header>
      {children}
    </section>
  );
}

type ButtonVariant = 'primary' | 'ghost' | 'danger';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'border-strong bg-accent text-on-accent hover:bg-accent-hover',
  ghost: 'border-border bg-surface text-ink hover:bg-raised',
  danger: 'border-danger bg-transparent text-danger hover:bg-danger/10',
};

export function Button({
  variant = 'primary', className = '', ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...rest}
      className={`rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm transition-colors
        disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${className}`}
    />
  );
}

export function Field({ label, hint, children }: {
  label: string; hint?: string; children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs text-muted">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-[var(--radius-sm)] border border-border bg-bg px-2 py-1.5
        text-sm text-ink outline-none focus:border-accent ${props.className ?? ''}`}
    />
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <p className="rounded-[var(--radius-sm)] border border-danger bg-danger/10 px-2.5 py-2
      text-xs text-danger">
      {message}
    </p>
  );
}

/** Yükseltme durumu rozeti — panelin her yerinde aynı yerde durur (üst şerit). */
export function Badge({ tone = 'muted', children }: {
  tone?: 'muted' | 'success' | 'warning' | 'danger'; children: ReactNode;
}) {
  const cls = {
    muted: 'border-border text-muted',
    success: 'border-success text-success',
    warning: 'border-warning text-warning',
    danger: 'border-danger text-danger',
  }[tone];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] leading-4 ${cls}`}>
      {children}
    </span>
  );
}
