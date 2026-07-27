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
import { useEffect, useState, type ReactNode } from 'react';
import { getSession, logout } from '../lib/api.ts';
import { getConnectionState, onConnectionChange } from '../lib/realtime.ts';
import { fmt, useTheme, useTick } from '../lib/hooks.ts';
import { useCities, useCity, useMessages, useMovements } from '../lib/queries.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { Panel, Res } from './ui.tsx';

/**
 * ⭐ SOL MENÜ SIRASI — orijinaldeki gibi (`images/scr_web01`, kullanıcı listesi):
 * Ordular · Baraka · Yapılar · Savunma · Akademi · Tapınak · Dünya · Mesajlar ·
 * Komuta Merkezi · Seçenekler · Yardım · Oyunu Kapat.
 *
 * Mesajlar orijinal menüde yoktu (muhtemelen Komuta Merkezi altındaydı) ama okunmamış rozeti
 * sürekli görünmeli → **Komuta Merkezi'nden hemen önce** bırakıldı (kullanıcı kararı).
 */
const MENU = [
  { to: '/armies', label: 'Ordular', icon: '⚔️' },
  { to: '/barracks', label: 'Baraka', icon: '🛡️' },
  { to: '/buildings', label: 'Yapılar', icon: '🏗️' },
  { to: '/defense', label: 'Savunma', icon: '🏯' },
  { to: '/academy', label: 'Akademi', icon: '📜' },
  { to: '/temple', label: 'Tapınak', icon: '⛩️' },
  { to: '/world', label: 'Dünya', icon: '🗺️' },
  { to: '/messages', label: 'Mesajlar', icon: '✉️' },
  { to: '/command', label: 'Komuta Merkezi', icon: '🎖️' },
  { to: '/options', label: 'Seçenekler', icon: '⚙️' },
  { to: '/help', label: 'Yardım', icon: '❓' },
] as const;

/**
 * Mobil alt bar 11 madde taşıyamaz → beş sekmeye indiriliyor. "Şehir" sekmesi, menünün şehirle
 * ilgili maddelerini (Baraka/Yapılar/Savunma/Akademi/Tapınak) listeleyen bir hub'dır.
 */
const TABS = [
  { to: '/armies', label: 'Ordular', icon: '⚔️' },
  { to: '/city', label: 'Şehir', icon: '🏰' },
  { to: '/world', label: 'Dünya', icon: '🗺️' },
  { to: '/messages', label: 'Mesaj', icon: '✉️' },
  { to: '/more', label: 'Daha', icon: '☰' },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-bg text-ink">
      <ResourceBar />

      {/*
        Masaüstünde üç sütun; mobilde tek sütun.
        ⭐ Orta sütun **dar tutulur** (üzerinde iş yapmaya yetecek kadar) ve yan panellerle arası
        ekran genişledikçe **açılır** (`lg:gap-8` → `2xl:gap-20`). Referans `images/scr_web03`:
        orada da orta panel dar, aradaki boşluk belirgin. Ekran daraldıkça boşluk kapanır.
      */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1700px] justify-center gap-3 px-3 py-3 lg:gap-8 2xl:gap-20">
          <aside className="hidden w-48 shrink-0 lg:block">
            <SideMenu />
          </aside>

          <main className="w-full min-w-0 max-w-3xl pb-24 lg:pb-3">{children}</main>

          <aside className="hidden w-56 shrink-0 xl:block">
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

        <ConnectionDot />

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

/**
 * Gerçek zamanlı bağlantı göstergesi.
 *
 * Kopukluk SESSİZ kalmamalı: oyuncu "gelen ordu yok" görüntüsüne bakarken aslında bağlantısı
 * kopmuş olabilir. Nokta kopukken kırmızıya döner ve başlıkta ne olduğu yazar.
 */
function ConnectionDot() {
  const [state, setState] = useState(getConnectionState);
  useEffect(() => onConnectionChange(setState), []);

  const label = state === 'online' ? 'Canlı bağlantı açık'
    : state === 'connecting' ? 'Bağlanıyor…'
      : 'Bağlantı koptu — yeniden deneniyor';
  const color = state === 'online' ? 'bg-success'
    : state === 'connecting' ? 'bg-warning'
      : 'bg-danger';

  return (
    <span title={label} aria-label={label}
      className="flex shrink-0 items-center" role="status">
      <span className={`h-2 w-2 rounded-full ring-1 ring-strong ${color} ${
        state === 'online' ? '' : 'animate-pulse'
      }`} />
    </span>
  );
}

/* ── Sol menü (yalnız masaüstü) ────────────────────────────────────────────── */

function SideMenu() {
  const messages = useMessages();
  const movements = useMovements();
  const session = getSession();
  const unread = messages.data?.unread ?? 0;
  // Rozet YALNIZ gelen (yabancı) hareketleri sayar; kendi seferlerim acil bilgi değil.
  const incoming = (movements.data?.movements ?? []).filter((m) => m.direction === 'in').length;

  return (
    <Panel title={session?.username ?? 'Menü'} className="sticky top-3">
      <nav className="p-1.5">
        {MENU.map((t) => {
          const badge = t.to === '/messages' ? unread : t.to === '/armies' ? incoming : 0;
          return (
            <NavLink key={t.to} to={t.to}
              className={({ isActive }) =>
                `mb-0.5 flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1 text-sm
                 transition-colors ${
                  isActive
                    ? 'border-strong bg-accent font-medium text-on-accent'
                    : 'border-transparent text-ink hover:border-border hover:bg-raised'
                }`}>
              <span aria-hidden className="text-base leading-none">{t.icon}</span>
              <span className="flex-1 truncate">{t.label}</span>
              {badge > 0 ? (
                <span className="rounded-full bg-danger px-1.5 text-[10px] leading-4 text-on-accent">
                  {badge}
                </span>
              ) : null}
            </NavLink>
          );
        })}
        <button
          onClick={() => { void logout().then(() => window.location.reload()); }}
          className="mt-1 flex w-full items-center gap-2 rounded-[var(--radius-sm)] border border-transparent
            px-2.5 py-1 text-sm text-danger transition-colors hover:border-danger hover:bg-raised"
        >
          <span aria-hidden className="text-base leading-none">⏻</span>
          <span className="flex-1 text-left">Oyunu Kapat</span>
        </button>
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
  const movements = useMovements();
  const { pathname } = useLocation();

  const unread = messages.data?.unread ?? 0;
  // ⭐ Gelen ordu rozeti: oyuncunun ekranda görmesi gereken TEK acil bilgi (§13.5.3).
  const incoming = (movements.data?.movements ?? []).filter((m) => m.direction === 'in').length;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-strong bg-panel-header lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto flex w-full max-w-3xl">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.to);
          const badge = t.to === '/messages' ? unread : t.to === '/armies' ? incoming : 0;
          return (
            <NavLink key={t.to} to={t.to}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] ${
                active ? 'font-semibold text-on-panel-header' : 'text-on-panel-header/70'
              }`}>
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
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
