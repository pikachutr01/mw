/**
 * Küçük, yeniden kullanılabilir parçalar. Hepsi YALNIZ semantik token'ları kullanır (§13.13.3) —
 * ham renk (`#fff`, `slate-700`) yazılmaz, yoksa gece modu ve kontrast kapısı sessizce bozulur.
 */
import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[var(--radius-md)] border border-border bg-surface ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 pt-3 pb-2">
      <h2 className="display text-sm font-semibold tracking-wide text-ink uppercase">{children}</h2>
      {right ? <div className="text-xs text-muted">{right}</div> : null}
    </div>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit';
  title?: string;
  className?: string;
};

export function Button({
  children, onClick, disabled, variant = 'primary', size = 'md', type = 'button', title,
  className = '',
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] font-medium '
    + 'transition-colors disabled:opacity-45 disabled:cursor-not-allowed';
  const sizes = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm';
  const variants = {
    primary: 'bg-accent text-on-accent hover:bg-accent-hover',
    ghost: 'border border-strong text-ink hover:bg-raised',
    danger: 'border border-danger text-danger hover:bg-danger hover:text-on-accent',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className={`${base} ${sizes} ${variants} ${className}`}>
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        'w-full rounded-[var(--radius-sm)] border border-border bg-raised px-3 py-2 text-sm '
        + `text-ink placeholder:text-muted ${props.className ?? ''}`
      }
    />
  );
}

/** Hata kutusu — sunucunun alan hatası mesajını AYNEN gösterir (kodlar i18n'e hazır). */
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert"
      className="rounded-[var(--radius-sm)] border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-3 py-6 text-center text-sm text-muted">{children}</div>;
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'danger' | 'success' | 'warning' }) {
  const tones = {
    muted: 'border-border text-muted',
    danger: 'border-danger text-danger',
    success: 'border-success text-success',
    warning: 'border-warning text-warning',
  }[tone];
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] leading-tight ${tones}`}>
      {children}
    </span>
  );
}

/** Bir kuralın neden karşılanmadığını gösteren küçük liste (ön-şartlar). */
export function Requirements({
  requirements, buildings, techs,
}: {
  requirements: { buildings?: Record<string, number>; techs?: Record<string, number> };
  buildings: Record<string, number>;
  techs: Record<string, number>;
}) {
  const rows: { label: string; need: number; have: number }[] = [];
  for (const [id, need] of Object.entries(requirements.buildings ?? {})) {
    rows.push({ label: id, need, have: buildings[id] ?? 0 });
  }
  for (const [id, need] of Object.entries(requirements.techs ?? {})) {
    rows.push({ label: id, need, have: techs[id] ?? 0 });
  }
  const unmet = rows.filter((r) => r.have < r.need);
  if (unmet.length === 0) return null;
  return (
    <div className="mt-1 text-[11px] text-danger">
      Gerekli: {unmet.map((r) => `${r.label} ${r.need} (${r.have})`).join(' · ')}
    </div>
  );
}
