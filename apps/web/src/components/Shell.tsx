/**
 * Uygulama kabuğu: üstte **kalıcı kaynak çubuğu**, altta **5 sekmeli bar** (§10).
 *
 * Kaynak çubuğu her ekranda durur çünkü oyuncunun sürekli sorduğu üç soru orada:
 * "kaç kaynağım var", "hangi şehirdeyim", "bekleyen bir şey var mı".
 */
import { NavLink, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { fmt, useTheme, useTick } from '../lib/hooks.ts';
import { useCities, useCity, useMessages, useMissions } from '../lib/queries.ts';
import { useActiveCity } from '../lib/city-context.tsx';

const TABS = [
  { to: '/city', label: 'Şehir', icon: '🏰' },
  { to: '/command', label: 'Komuta', icon: '⚔️' },
  { to: '/world', label: 'Dünya', icon: '🗺️' },
  { to: '/messages', label: 'Mesajlar', icon: '✉️' },
  { to: '/more', label: 'Daha Fazla', icon: '☰' },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-bg text-ink">
      <ResourceBar />
      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-3 pt-3 pb-24">
        {children}
      </main>
      <BottomBar />
    </div>
  );
}

function ResourceBar() {
  const { cityId, setCityId } = useActiveCity();
  const cities = useCities();
  const city = useCity(cityId);
  const [theme, setTheme] = useTheme();

  // Kaynak sunucuda tembel birikiyor; arada geçen saniyeleri istemci yerel olarak yansıtır ki
  // sayaç donmuş görünmesin. Otorite yine sunucudur (5 sn'de bir tazeleniyor).
  const now = useTick();
  const d = city.data;
  const elapsedH = d ? Math.max(0, (now - Date.parse(d.serverNow)) / 3_600_000) : 0;
  const gold = d ? d.resources.gold + d.production.goldPerHour * elapsedH : 0;
  const food = d ? d.resources.food + d.production.foodPerHour * elapsedH : 0;

  const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  const themeIcon = theme === 'system' ? '🌗' : theme === 'light' ? '☀️' : '🌙';

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 py-2">
        <select
          value={cityId ?? ''}
          onChange={(e) => setCityId(Number(e.target.value))}
          aria-label="Etkin şehir"
          className="max-w-[9rem] shrink-0 rounded-[var(--radius-sm)] border border-border bg-raised px-2 py-1 text-xs text-ink"
        >
          {(cities.data?.cities ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.coordinates.k}:{c.coordinates.d}:{c.coordinates.s})
            </option>
          ))}
        </select>

        <div className="tnum flex flex-1 items-center gap-3 text-xs">
          <span className="whitespace-nowrap text-gold" title="Altın">
            🪙 {fmt(gold)}
            <span className="ml-1 text-muted">+{fmt(d?.production.goldPerHour ?? 0)}/sa</span>
          </span>
          <span className="whitespace-nowrap text-food" title="Yemek">
            🌾 {fmt(food)}
            <span className="ml-1 text-muted">+{fmt(d?.production.foodPerHour ?? 0)}/sa</span>
          </span>
        </div>

        <button
          onClick={() => setTheme(nextTheme)}
          title={`Tema: ${theme} → ${nextTheme}`}
          aria-label="Tema değiştir"
          className="shrink-0 rounded-[var(--radius-sm)] border border-border px-2 py-1 text-sm hover:bg-raised"
        >
          {themeIcon}
        </button>
      </div>
    </header>
  );
}

function BottomBar() {
  const messages = useMessages();
  const missions = useMissions();
  const { pathname } = useLocation();

  const unread = messages.data?.unread ?? 0;
  // ⭐ Gelen ordu rozeti: oyuncunun ekranda görmesi gereken TEK acil bilgi (§13.5.3).
  const incoming = missions.data?.incoming.length ?? 0;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto flex w-full max-w-3xl">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.to);
          const badge = t.to === '/messages' ? unread : t.to === '/command' ? incoming : 0;
          return (
            <NavLink key={t.to} to={t.to}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
                active ? 'text-accent' : 'text-muted'
              }`}>
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
              {badge > 0 ? (
                <span className="absolute top-1 right-1/2 translate-x-4 rounded-full bg-danger px-1.5 text-[10px] leading-4 text-on-accent">
                  {badge}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
