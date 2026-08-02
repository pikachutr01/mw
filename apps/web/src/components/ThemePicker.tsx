/**
 * ⭐ TEMA SEÇİCİ — Hesap panelinin başlık bandında, ikon + açılır liste.
 *
 * Eskiden Seçenekler'de kendi kartı vardı (üç düğme + bir açıklama satırı). Kullanıcı
 * 2026-08-02'de kaldırılmasını istedi: tema tek seferlik bir tercih, tam bir kart kadar
 * yer hak etmiyor. Artık başlığın sağında tek ikon; hangi temanın seçili olduğu ikonun
 * kendisinden okunuyor.
 *
 * ⚠️ Tema **yalnız burada** değiştirilir (§13.13.4). İkinci bir yere düğme koymak iki
 * denetimi senkron tutma sorunu yaratır; `useTheme` tek kaynak ama arayüz de tek kalmalı.
 */
import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../lib/hooks.ts';

type Theme = 'system' | 'light' | 'dark';

const OPTIONS: ReadonlyArray<readonly [Theme, string]> = [
  ['system', 'Sistem'],
  ['light', 'Gündüz'],
  ['dark', 'Gece'],
];

/** 16×16 çizgi ikonlar — tema renklerini `currentColor` üzerinden alırlar. */
function ThemeIcon({ id, className = '' }: { id: Theme; className?: string }): React.ReactElement {
  const common = {
    className: `h-4 w-4 shrink-0 ${className}`,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (id === 'light') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </svg>
    );
  }
  if (id === 'dark') {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  }
  // Sistem: ekran — «işletim sistemi ne diyorsa o».
  return (
    <svg {...common}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function ThemePicker(): React.ReactElement {
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  /**
   * ⚠️ Etki `[]` ile bir kez kuruluyor ve dinleyici `open`u DEĞİL kutunun kendisini okuyor.
   * Bağımlılığa `open` koymak her açılışta dinleyiciyi söküp takardı; `Modal`'da aynı desen
   * odak kaybına yol açmıştı.
   */
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const current = OPTIONS.find(([id]) => id === theme) ?? OPTIONS[0]!;

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu" aria-expanded={open}
        title={`Tema: ${current[1]}`} aria-label={`Tema: ${current[1]}`}
        className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-transparent
          px-1.5 py-1 text-on-panel-header transition-colors hover:border-border hover:bg-raised/40">
        <ThemeIcon id={theme} />
      </button>

      {open ? (
        // `z-30`: panel başlığının üstünde ama modalın (40) altında.
        <div role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[8.5rem] overflow-hidden
            rounded-[var(--radius-sm)] border-2 border-strong bg-surface shadow-[var(--bevel)]">
          {OPTIONS.map(([id, label]) => (
            <button key={id} role="menuitemradio" aria-checked={theme === id}
              onClick={() => { setTheme(id); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                theme === id ? 'bg-accent text-on-accent' : 'text-ink hover:bg-raised'
              }`}>
              <ThemeIcon id={id} />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
