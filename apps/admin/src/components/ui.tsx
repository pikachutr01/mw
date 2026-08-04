/**
 * Panelin en küçük arayüz parçaları.
 *
 * ⚠️ `apps/web/src/components/ui.tsx` KOPYALANMADI. Oradaki parçalar oyunun doku/kabartma
 * dilini taşıyor (`tex`, `bevel`, pergament zemin); panel yoğun veri ekranı ve o dil burada
 * okunabilirliği düşürüyor. Ortak olan **jetonlar**, bileşenler değil.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const HEAD = `flex items-center justify-between gap-3 border-b border-border
  bg-panel-header px-3 py-2`;
const TITLE = 'display text-xs font-semibold tracking-wider text-on-panel-header uppercase';

/**
 * ⭐ `collapsible` (panel 2. nesil) — kullanıcının şikâyetinin doğrudan cevabı:
 * *"bu kalabalığın içinde bu paneli etkili şekilde kullanabilir miyim emin değilim."*
 *
 * ⚠️ Kendi açılır-kapanır bileşenimizi yazmak yerine **native `<details>`** kullanılıyor.
 * Bedavaya gelen üç şey: klavye erişimi, ekran okuyucu semantiği ve — en önemlisi —
 * tarayıcının `Ctrl+F` araması **kapalı bölümlerin içini de** bulup açabiliyor. Kendi
 * yazdığımız bir collapse'ta üçü de kaybolurdu ve "detay kısılmasın" kuralı delinirdi.
 */
export function Panel({
  title, right, children, collapsible, defaultOpen = true,
}: {
  title: string; right?: ReactNode; children: ReactNode;
  collapsible?: boolean; defaultOpen?: boolean;
}) {
  const box = 'overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface';
  if (!collapsible) {
    return (
      <section className={box}>
        <header className={HEAD}>
          <h2 className={TITLE}>{title}</h2>
          {right ? <span className="text-xs text-on-panel-header/80">{right}</span> : null}
        </header>
        {children}
      </section>
    );
  }
  return (
    <details className={`group ${box}`} open={defaultOpen}>
      <summary className={`${HEAD} cursor-pointer list-none`}>
        <h2 className={TITLE}>
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
          {title}
        </h2>
        {right ? <span className="text-xs text-on-panel-header/80">{right}</span> : null}
      </summary>
      {children}
    </details>
  );
}

/**
 * ⭐ ⓘ AÇIKLAMA BALONU — *"detaylı bilgiyi kısmadan"* kuralının aracı.
 *
 * Panelin uzun uyarı metinleri (ham SQL tuzakları, «ölçüldü» gerekçeleri, «ne silinmiyor»
 * satırları) bu panelin en değerli parçası. **Silinmiyorlar, katmanlanıyorlar**: satırın
 * altında sürekli duran dört satır metin yerine, istendiğinde açılan bir balon.
 *
 * ⚠️ Yine `<details>`: `Ctrl+F` içeriği bulabilsin diye. Dışarı tıklayınca kapanma
 * eklenmedi — bir balonu kapatmak için aynı ⓘ'ya basmak yeterli ve dışarı-tıklama
 * dinleyicisi, açık bir formda istemeden kapanmalara yol açardı.
 *
 * ⭐ **BALON `document.body`'YE ÇİZİLİYOR** (kullanıcı, 2026-08-03: *"tooltipler collapse
 * kartların altında kalıyor, tooltip içi tam gözükmüyor"*).
 *
 * ⚠️ Sebep `z-index` DEĞİLDİ, `overflow` idi: balon `absolute` duruyordu ve en yakın kesici
 * ata `Panel`in **`overflow-hidden`**'ıydı (yukarıdaki `box`). `z-10`u yükseltmek hiçbir işe
 * yaramazdı — `overflow: hidden` bir kutuyu z ekseninde değil, geometrik olarak kırpar.
 * Portal bu zinciri tamamen atlıyor; aynı sorunu oyun tarafındaki `Tooltip.tsx` de böyle
 * çözmüştü.
 *
 * ⚠️ `position: fixed` + ölçülmüş koordinat: `absolute` kalsaydı portal içinde sayfanın sol
 * üstüne yapışırdı. Ölçüm yapılana kadar `visibility: hidden` — yanlış yerde bir kare
 * parlamasın.
 *
 * ⛔ **ÇAĞIRANLAR: BUNU BİR `<p>` İÇİNE KOYMAYIN.** Tetikleyici bir `<details>` ve `<details>`
 * paragraf içinde **geçersiz HTML**. Tarayıcı sessizce düzeltmiyor — `<p>`yi ⓘ'nın önünde
 * kapatıp kalan metni ayrı bir paragrafa atıyor, yani satır ikiye bölünüyor. Sarmalayıcı
 * `<div>` ya da `<span>` olmalı.
 * ⚠️ Bu tuzağa **üç kez** düşüldü (2026-08-04: `ConfigLine`, `AsnCard`, `ScanCard`); üçünde de
 * konsol uyarmıştı. Uyarı metni "hydration error" dediği için ilgisiz görünüyor, oysa sorun
 * gerçek ve görünür.
 */
export function Info({ children, label = 'açıklama' }: { children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  /**
   * ⚠️ Portal YALNIZ AÇIKKEN basılıyor (`pos != null`). İlk yazımda koşulsuzdu ve ayarlar
   * sayfasında **148 ⓘ** olduğu için `document.body` altına 148 gizli kutu iniyordu — hepsi
   * görünmez, hepsi bedava değil.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = (): void => {
      if (!el.open) { setPos(null); return; }
      const a = el.getBoundingClientRect();
      const W = 288;   // w-72
      // Sağ kenardan taşmayı kelepçele: `overflow` kırpması gitti ama pencere sınırı duruyor.
      setPos({ top: a.bottom + 4, left: Math.min(window.innerWidth - W - 8, Math.max(8, a.left)) });
    };
    el.addEventListener('toggle', place);
    // Sayfa kayarsa balon ⓘ'dan kopmasın (ayarlar sayfası çok uzun).
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      el.removeEventListener('toggle', place);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, []);

  return (
    <details ref={ref} className="inline-block align-middle">
      <summary
        aria-label={label}
        className="inline-flex size-4 cursor-pointer list-none items-center justify-center
          rounded-full border border-border text-[10px] leading-none text-muted
          hover:border-accent hover:text-accent"
      >
        i
      </summary>
      {pos ? createPortal(
        <div
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[100] w-72 rounded-[var(--radius-sm)] border border-strong
            bg-raised p-2 text-[11px] leading-snug text-ink shadow-md"
        >
          {children}
        </div>,
        document.body,
      ) : null}
    </details>
  );
}

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONE: Record<Tone, string> = {
  info: 'border-info bg-info/10 text-info',
  success: 'border-success bg-success/10 text-success',
  warning: 'border-warning bg-warning/10 text-warning',
  danger: 'border-danger bg-danger/10 text-danger',
};

/** Kutulu bildirim. Öncesinde dokuz ekranda dokuz ayrı `<p className="text-success">` vardı. */
export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  if (!children) return null;
  return (
    <p className={`rounded-[var(--radius-sm)] border px-2.5 py-2 text-xs ${TONE[tone]}`}>
      {children}
    </p>
  );
}

/** Boş durum — beş ekranda beş ayrı `<li>Satır yok</li>` yerine. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-4 text-center text-sm text-muted">{children}</p>;
}

export function Loading({ children = 'Yükleniyor…' }: { children?: ReactNode }) {
  return <p className="px-3 py-4 text-sm text-muted">{children}</p>;
}

/**
 * Gecikmeli arama kutusu. ⚠️ Debounce **burada**: Oturumlar ekranında vardı, Veri tabanı
 * filtrelerinde yoktu ve her tuş vuruşu bir sorgu atıyordu.
 */
export function SearchInput({ value, onChange, placeholder, delay = 300 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; delay?: number;
}) {
  const [local, setLocal] = useState(value);
  const first = useRef(true);

  useEffect(() => { setLocal(value); }, [value]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => onChange(local), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, delay]);

  return (
    <span className="relative inline-block w-full">
      <Input value={local} placeholder={placeholder} onChange={(e) => setLocal(e.target.value)} />
      {local ? (
        <button
          type="button" aria-label="temizle"
          onClick={() => { setLocal(''); onChange(''); }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

/**
 * Sayfalama. ⚠️ Sayfa numarası **girilebiliyor**: 50 sayfalık bir tabloda 40. sayfaya
 * «sonraki» ile gitmek 39 tık demekti.
 */
export function Pagination({ page, pageSize, total, onPage }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border
      px-3 py-2 text-xs">
      <span className="tnum text-muted">
        {(page * pageSize + 1).toLocaleString('tr-TR')}–
        {Math.min((page + 1) * pageSize, total).toLocaleString('tr-TR')}
        {' / '}{total.toLocaleString('tr-TR')}
      </span>
      <span className="flex items-center gap-2">
        <Button variant="ghost" disabled={page === 0} onClick={() => onPage(0)}>«</Button>
        <Button variant="ghost" disabled={page === 0} onClick={() => onPage(page - 1)}>‹</Button>
        <input
          type="number" min={1} max={pages} value={page + 1}
          onChange={(e) => {
            const p = Math.min(pages, Math.max(1, Number(e.target.value) || 1)) - 1;
            onPage(p);
          }}
          className="tnum w-14 rounded-[var(--radius-sm)] border border-border bg-bg px-1 py-1
            text-center text-ink outline-none focus:border-accent"
        />
        <span className="tnum text-muted">/ {pages}</span>
        <Button variant="ghost" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>›</Button>
        <Button variant="ghost" disabled={page + 1 >= pages} onClick={() => onPage(pages - 1)}>»</Button>
      </span>
    </div>
  );
}

export interface Column<T> {
  key: string;
  label: ReactNode;
  align?: 'right';
  render?: (row: T) => ReactNode;
  /** Sayısal sütun → `tnum` ve sağa hizalı. */
  numeric?: boolean;
}

/**
 * ⭐ TABLO — beş ekranda beş ayrı el yazımı `<table>` vardı, beş farklı `thead` stiliyle.
 *
 * ⚠️ Zebra çizgisi `row-alt` jetonuyla: jeton tasarım sisteminde **hazırdı ve hiç
 * kullanılmıyordu**. Yoğun sayı tablosunda satır takibi bununla ayakta duruyor.
 */
export function DataTable<T>({ columns, rows, keyOf, empty }: {
  columns: Column<T>[]; rows: T[]; keyOf: (row: T, i: number) => string | number;
  empty?: ReactNode;
}) {
  if (rows.length === 0) return <Empty>{empty ?? 'Satır yok.'}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted">
          <tr className="text-left">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-2 py-1.5 font-normal ${c.numeric || c.align === 'right' ? 'text-right' : ''}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-ink">
          {rows.map((r, i) => (
            <tr key={keyOf(r, i)} className={i % 2 === 1 ? 'bg-row-alt' : ''}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-2 py-1 ${c.numeric ? 'tnum text-right' : c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Etiket + değer kutusu. Worlds ve Moderation'da iki ayrı kopyası vardı. */
export function Stat({ label, value, tone }: {
  label: string; value: ReactNode; tone?: 'warning' | 'danger';
}) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-ink';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`tnum text-sm ${color}`}>{value}</div>
    </div>
  );
}

/** İki adımlı yıkıcı düğme: ilk tık niyeti, ikinci tık kararı. */
export function DangerConfirm({ label, confirmLabel, onConfirm, disabled, busy }: {
  label: string; confirmLabel: string; onConfirm: () => void;
  disabled?: boolean; busy?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button variant="danger" disabled={disabled} onClick={() => setArmed(true)}>{label}</Button>
    );
  }
  return (
    <span className="flex gap-2">
      <Button variant="danger" disabled={busy} onClick={() => { onConfirm(); setArmed(false); }}>
        {busy ? 'çalışıyor…' : confirmLabel}
      </Button>
      <Button variant="ghost" onClick={() => setArmed(false)}>vazgeç</Button>
    </span>
  );
}

/**
 * ⭐ YÜKSELTME GERİ SAYIMI — veri baştan beri vardı (`elevatedUntil`), gösterimi yoktu:
 * 15 dakika sessizce doluyor ve yönetici bunu ancak bir 403 alınca fark ediyordu.
 */
export function Countdown({ until }: { until: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!until) return null;
  const left = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  if (left === 0) return null;
  return (
    <span className="tnum text-[11px] text-on-panel-header/70">
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
    </span>
  );
}

/** Açılır liste — Database ve Bulk'ta satır içi `<select>` olarak üç kez tekrarlanıyordu. */
export function Select({ className = '', ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={`w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1
        text-sm text-ink outline-none focus:border-accent ${className}`}
    />
  );
}

/** Onay kutusu — dört ekranda dört ayrı satır içi stille yazılmıştı (ikisi 16px, ikisi 14px). */
export function Checkbox({ label, checked, onChange }: {
  label: ReactNode; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-ink">
      <input
        type="checkbox" checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--mw-color-accent)]"
      />
      {label}
    </label>
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
  /** ⭐ `info` (mavi) §tatil modu ile geldi — oyun tarafında da tatil mavi gösteriliyor. */
  tone?: 'muted' | 'info' | 'success' | 'warning' | 'danger'; children: ReactNode;
}) {
  const cls = {
    muted: 'border-border text-muted',
    info: 'border-info text-info',
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
