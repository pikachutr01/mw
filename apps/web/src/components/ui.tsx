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

/**
 * ⭐ ANA GÖRSEL BİRİM — orijinal arayüzün ahşap paneli (`images/scr_web01..06`):
 * koyu gövde · parşömen başlık bandı · köşe perçinleri · çift çerçeve.
 *
 * Perçinler CSS ile çiziliyor (görsel dosya YOK) → temayla birlikte renk değiştiriyorlar ve
 * ölçeklendiklerinde bulanmıyorlar.
 */
export function Panel({
  title, right, children, className = '', bare = false,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Başlık bandı olmadan yalnız çerçeve. */
  bare?: boolean;
}) {
  return (
    <section
      className={`tex bevel relative rounded-[var(--radius-md)] border-2 border-strong bg-surface ${className}`}
    >
      <Bolts />
      {!bare && title ? (
        <header
          className="tex-header flex items-center justify-between gap-2 rounded-t-[calc(var(--radius-md)-2px)]
            border-b-2 border-strong bg-panel-header px-3 py-2"
        >
          <h2 className="display truncate text-[13px] font-semibold tracking-wider text-on-panel-header uppercase">
            {title}
          </h2>
          {right ? (
            <div className="shrink-0 text-[11px] text-on-panel-header/85">{right}</div>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Dört köşedeki perçin — panelin "dövme demir" hissini veren tek detay. */
function Bolts() {
  const dot = 'absolute h-1.5 w-1.5 rounded-full bg-bolt/70 ring-1 ring-strong';
  return (
    <>
      <span aria-hidden className={`${dot} top-1 left-1`} />
      <span aria-hidden className={`${dot} top-1 right-1`} />
      <span aria-hidden className={`${dot} bottom-1 left-1`} />
      <span aria-hidden className={`${dot} bottom-1 right-1`} />
    </>
  );
}

/* ── İkonlar ───────────────────────────────────────────────────────────────── */

/**
 * ⭐ ALTIN / YEMEK — kaynak gösterilen HER yerde aynı ikon (kullanıcı isteği).
 *
 * ⚠️ Görseller **şeffaf**; koyu madalyon YOK. (Bir ara madalyon vardı çünkü ilk sürümler siyah
 * zeminliydi — şeffaf sürümler gelince madalyon ikonu boğuyordu, kaldırıldı.)
 */
export function ResIcon({ kind, size = 18 }: { kind: 'gold' | 'food'; size?: number }) {
  return (
    <img src={`/assets/ui/${kind}.png`} alt="" aria-hidden
      width={size} height={size}
      className="icon-shadow inline-block shrink-0 object-contain"
      style={{ width: size, height: size }} />
  );
}

/** Sayı + ikon; `tnum` ile sütunlar kaymaz. */
export function Res({
  kind, value, size = 18, className = '',
}: {
  kind: 'gold' | 'food'; value: string | number; size?: number; className?: string;
}) {
  return (
    <span className={`tnum inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}
      title={kind === 'gold' ? 'Altın' : 'Yemek'}>
      <ResIcon kind={kind} size={size} />
      {value}
    </span>
  );
}

/**
 * Görev simgeleri (§13.11.9: dosya adı = katalog `id`).
 *
 * ⚠️ Kullanıcı ikonların **bir kısmını** verdi; saldırı/dönüş/teleport henüz YOK → onlarda
 * emoji yedeğine düşülüyor. Dosya eklendiği anda `HAS_ICON`'a adını yazmak yeterli, kod değişmez.
 */
const HAS_ICON = new Set([
  'attack', 'attack_in', 'found_city', 'support_out', 'support_in',
  'transport_out', 'transport_back', 'spy_out', 'spy_back',
]);

const EMOJI_FALLBACK: Record<string, string> = {
  teleport: '🌀',
};

export function MissionIcon({ id, size = 36, title }: { id: string; size?: number; title?: string }) {
  if (HAS_ICON.has(id)) {
    return (
      <img src={`/assets/missions/${id}.png`} alt={title ?? id} title={title}
        width={size} height={size}
        className="icon-shadow inline-block shrink-0 object-contain"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <span title={title}
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, fontSize: size * 0.7 }}>
      <span aria-hidden>{EMOJI_FALLBACK[id] ?? '•'}</span>
    </span>
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
  // Kabartma + doku: düz renk yerine basılabilir bir yüzey hissi.
  const variants = {
    primary: 'tex-header border-2 border-strong bg-accent text-on-accent shadow-[var(--bevel)] hover:bg-accent-hover active:translate-y-px',
    ghost: 'border-2 border-strong bg-surface text-ink hover:bg-raised active:translate-y-px',
    danger: 'border-2 border-danger bg-surface text-danger hover:bg-danger hover:text-on-accent active:translate-y-px',
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

/**
 * Karşılanmayan ön-şartlar.
 *
 * ⭐ Adlar **TÜRKÇE** gösterilir (§13.14: kod/DB İngilizce, oyuncuya görünen metin Türkçe).
 * Çeviri sunucudan `requirementNames` ile gelir — istemci ikinci bir eşleme tablosu tutmaz,
 * tutsaydı katalogdan kaçınılmaz olarak sürüklenirdi.
 */
export interface NamedRequirement {
  id: string;
  name: string;
  level: number;
  kind: 'building' | 'tech';
}

export function Requirements({
  requirementNames, buildings, techs,
}: {
  requirementNames: NamedRequirement[] | undefined;
  buildings: Record<string, number>;
  techs: Record<string, number>;
}) {
  const unmet = (requirementNames ?? []).filter((r) => {
    const have = r.kind === 'building' ? (buildings[r.id] ?? 0) : (techs[r.id] ?? 0);
    return have < r.level;
  });
  if (unmet.length === 0) return null;
  return (
    <div className="mt-1 text-[11px] text-danger">
      Gerekli: {unmet.map((r) => {
        const have = r.kind === 'building' ? (buildings[r.id] ?? 0) : (techs[r.id] ?? 0);
        return `${r.name} ${r.level} (${have})`;
      }).join(' · ')}
    </div>
  );
}
