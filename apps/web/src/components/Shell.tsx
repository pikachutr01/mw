/**
 * ⭐ UYGULAMA KABUĞU — İKİ DÜZEN, TEK KOD (kullanıcı kararı, referans `images/scr_web01..06`).
 *
 *   **Masaüstü (≥1024px):** ekranın TAM genişliği · sol menü · ortada oyun ekranı · sağda ittifak.
 *   **Mobil (<1024px):** tek sütun + **alt navigasyon barı** (bar YALNIZ mobilde görünür).
 *
 * Üstte her iki düzende de **kalıcı kaynak çubuğu** durur: oyuncunun sürekli sorduğu üç soru
 * ("kaç kaynağım var", "hangi şehirdeyim", "bekleyen bir şey var mı") orada.
 */
import { NavLink, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { fmt, useTheme, useTick } from '../lib/hooks.ts';
import { useCities, useCity, useMessages, useMissions } from '../lib/queries.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { Panel, Res } from './ui.tsx';

/**
 * Menü sırası orijinaldeki gibi: **Ordular en üstte** (giriş ekranı da orası).
 * `short` mobil alt barın dar sekmeleri için.
 */
const NAV = [
  { to: '/armies', label: 'Ordular', short: 'Ordular', icon: '⚔️' },
  { to: '/city', label: 'Şehir', short: 'Şehir', icon: '🏰' },
  { to: '/world', label: 'Dünya', short: 'Dünya', icon: '🗺️' },
  { to: '/messages', label: 'Mesajlar', short: 'Mesaj', icon: '✉️' },
  { to: '/more', label: 'Daha Fazla', short: 'Daha', icon: '☰' },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-bg text-ink">
      <ResourceBar />

      {/* Masaüstünde tam genişlik üç sütun; mobilde tek sütun. */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1800px] gap-3 px-3 py-3">
          <aside className="hidden w-52 shrink-0 lg:block">
            <SideMenu />
          </aside>

          <main className="min-w-0 flex-1 pb-24 lg:pb-3">{children}</main>

          <aside className="hidden w-64 shrink-0 xl:block">
            <AlliancePanel />
          </aside>
        </div>
      </div>

      <BottomBar />
    </div>
  );
}

/* ── Üst kaynak çubuğu ─────────────────────────────────────────────────────── */

function ResourceBar() {
  const { cityId, setCityId } = useActiveCity();
  const cities = useCities();
  const city = useCity(cityId);
  const [theme, setTheme] = useTheme();

  // Kaynak sunucuda tembel birikiyor; aradaki saniyeleri istemci yerel olarak yansıtır ki sayaç
  // donmuş görünmesin. Otorite yine sunucudur (5 sn'de bir tazeleniyor).
  const now = useTick();
  const d = city.data;
  const elapsedH = d ? Math.max(0, (now - Date.parse(d.serverNow)) / 3_600_000) : 0;
  const gold = d ? d.resources.gold + d.production.goldPerHour * elapsedH : 0;
  const food = d ? d.resources.food + d.production.foodPerHour * elapsedH : 0;

  const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  const themeIcon = theme === 'system' ? '🌗' : theme === 'light' ? '☀️' : '🌙';

  return (
    <header className="sticky top-0 z-20 border-b-2 border-strong bg-panel-header">
      <div className="mx-auto flex w-full max-w-[1800px] items-center gap-2 px-3 py-1.5">
        <span className="display hidden shrink-0 text-base font-bold tracking-widest text-on-panel-header lg:block">
          MOBIWAR
        </span>

        <select
          value={cityId ?? ''}
          onChange={(e) => setCityId(Number(e.target.value))}
          aria-label="Etkin şehir"
          className="max-w-[10rem] shrink-0 rounded-[var(--radius-sm)] border border-strong bg-surface px-2 py-1 text-xs text-ink"
        >
          {(cities.data?.cities ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.coordinates.k}:{c.coordinates.d}:{c.coordinates.s})
            </option>
          ))}
        </select>

        <div className="flex flex-1 items-center justify-center gap-4 text-sm text-on-panel-header">
          <Res kind="gold" value={fmt(gold)} size={18} />
          <span className="hidden text-[11px] text-on-panel-header/70 sm:inline">
            +{fmt(d?.production.goldPerHour ?? 0)}/sa
          </span>
          <Res kind="food" value={fmt(food)} size={18} />
          <span className="hidden text-[11px] text-on-panel-header/70 sm:inline">
            +{fmt(d?.production.foodPerHour ?? 0)}/sa
          </span>
        </div>

        <button
          onClick={() => setTheme(nextTheme)}
          title={`Tema: ${theme} → ${nextTheme}`}
          aria-label="Tema değiştir"
          className="shrink-0 rounded-[var(--radius-sm)] border border-strong bg-surface px-2 py-1 text-sm hover:bg-raised"
        >
          {themeIcon}
        </button>
      </div>
    </header>
  );
}

/* ── Sol menü (yalnız masaüstü) ────────────────────────────────────────────── */

function SideMenu() {
  const messages = useMessages();
  const missions = useMissions();
  const unread = messages.data?.unread ?? 0;
  const incoming = missions.data?.incoming.length ?? 0;

  return (
    <Panel title="Menü" className="sticky top-3">
      <nav className="p-1.5">
        {NAV.map((t) => {
          const badge = t.to === '/messages' ? unread : t.to === '/armies' ? incoming : 0;
          return (
            <NavLink key={t.to} to={t.to}
              className={({ isActive }) =>
                `mb-1 flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-sm
                 transition-colors ${
                  isActive
                    ? 'border-strong bg-accent font-medium text-on-accent'
                    : 'border-transparent text-ink hover:border-border hover:bg-raised'
                }`}>
              <span aria-hidden className="text-base leading-none">{t.icon}</span>
              <span className="flex-1">{t.label}</span>
              {badge > 0 ? (
                <span className="rounded-full bg-danger px-1.5 text-[10px] leading-4 text-on-accent">
                  {badge}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </nav>
    </Panel>
  );
}

/* ── Sağ ittifak paneli (yalnız geniş masaüstü) ────────────────────────────── */

/**
 * İttifak Faz 4'te geliyor; panel yerini ŞİMDİDEN tutuyor çünkü üç sütunlu düzenin dengesi
 * ona göre kuruldu — sonradan eklenince ortadaki sütun daralıp alışkanlık bozulmasın.
 */
function AlliancePanel() {
  return (
    <div className="sticky top-3 space-y-3">
      <Panel title="İttifak">
        <div className="p-3 text-xs text-muted">
          Henüz bir ittifakta değilsin.
          <div className="mt-1 text-[11px]">Kurmak için <b>Kale 5</b> gerekiyor.</div>
        </div>
      </Panel>
      <Panel title="Sohbet">
        <div className="p-3 text-xs text-muted">Genel Sohbet yakında.</div>
      </Panel>
    </div>
  );
}

/* ── Alt bar (YALNIZ mobil) ────────────────────────────────────────────────── */

function BottomBar() {
  const messages = useMessages();
  const missions = useMissions();
  const { pathname } = useLocation();

  const unread = messages.data?.unread ?? 0;
  // ⭐ Gelen ordu rozeti: oyuncunun ekranda görmesi gereken TEK acil bilgi (§13.5.3).
  const incoming = missions.data?.incoming.length ?? 0;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-strong bg-panel-header lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto flex w-full max-w-3xl">
        {NAV.map((t) => {
          const active = pathname.startsWith(t.to);
          const badge = t.to === '/messages' ? unread : t.to === '/armies' ? incoming : 0;
          return (
            <NavLink key={t.to} to={t.to}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] ${
                active ? 'font-semibold text-on-panel-header' : 'text-on-panel-header/70'
              }`}>
              <span className="text-lg leading-none">{t.icon}</span>
              {t.short}
              {badge > 0 ? (
                <span className="absolute top-0.5 right-1/2 translate-x-4 rounded-full bg-danger px-1.5 text-[10px] leading-4 text-on-accent">
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
