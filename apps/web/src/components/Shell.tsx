/**
 * ⭐ UYGULAMA KABUĞU — referans `images/scr_web05`.
 *
 * **Masaüstü:** boydan boya navbar YOK. Üç sütun:
 *   sol   → logo + gezinti menüsü
 *   orta  → küçük bilgi çubuğu (altın · yemek · aktif şehir · sayfa adı) + **şehir şeridi** + içerik
 *   sağ   → ittifak + genel sohbet
 * Bilgi çubuğu ve şehir şeridi **yalnız orta sütunun genişliğinde**; ekranı boydan boya kesen bir
 * bant oyunun "pencere" hissini bozuyordu.
 *
 * **Mobil:** aynı dizilim tek sütuna iner (bilgi çubuğu → şehir şeridi → içerik) + alt gezinti barı.
 * Mobil web ile mobil uygulama görünümü birbirine yakın kalmalı (kullanıcı kararı), bu yüzden
 * mobilde de sıralama aynıdır — yalnız menü alta taşınır.
 */
import { NavLink, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { getSession, logout } from '../lib/api.ts';
import { getConnectionState, onConnectionChange } from '../lib/realtime.ts';
import { fmt, useTick } from '../lib/hooks.ts';
import { useCities, useCity, useMessages, useMovements } from '../lib/queries.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { CityStrip } from './CityStrip.tsx';
import { Panel, Res } from './ui.tsx';

/**
 * Sol menü sırası orijinaldeki gibi. Mesajlar orijinal menüde yoktu ama okunmamış rozeti
 * sürekli görünmeli → **Komuta Merkezi'nden hemen önce** (kullanıcı kararı).
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

/** Mobil alt bar 11 madde taşıyamaz → beş sekme; "Şehir" şehir ekranlarının hub'ıdır. */
const TABS = [
  { to: '/armies', label: 'Ordular', icon: '⚔️' },
  { to: '/city', label: 'Şehir', icon: '🏰' },
  { to: '/world', label: 'Dünya', icon: '🗺️' },
  { to: '/messages', label: 'Mesaj', icon: '✉️' },
  { to: '/more', label: 'Daha', icon: '☰' },
] as const;

/** Rota → ekranda gösterilen sayfa adı (bilgi çubuğunun sağ ucu). */
const PAGE_TITLE: Record<string, string> = {
  '/armies': 'Ordular', '/barracks': 'Baraka', '/buildings': 'Yapılar', '/defense': 'Savunma',
  '/academy': 'Akademi', '/temple': 'Tapınak', '/world': 'Dünya', '/messages': 'Mesajlar',
  '/command': 'Komuta Merkezi', '/options': 'Seçenekler', '/help': 'Yardım', '/city': 'Şehir',
  '/more': 'Seçenekler',
};

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1">
        <div className="mx-auto flex w-full max-w-[1700px] justify-center gap-3 px-3 py-3 lg:gap-8 2xl:gap-14">
          <aside className="hidden w-52 shrink-0 lg:block">
            <SideMenu />
          </aside>

          <main className="w-full min-w-0 max-w-3xl pb-24 lg:pb-3">
            <InfoBar />
            <CityStrip />
            {children}
          </main>

          <aside className="hidden w-60 shrink-0 xl:block">
            <SidePanels />
          </aside>
        </div>
      </div>

      <BottomBar />
    </div>
  );
}

/* ── Orta sütunun üstündeki küçük bilgi çubuğu ─────────────────────────────── */

function InfoBar() {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const { pathname } = useLocation();

  // Kaynak sunucuda tembel birikiyor; aradaki saniyeleri istemci yansıtır ki sayaç donmuş
  // görünmesin. Otorite yine sunucudur (5 sn'de bir tazeleniyor).
  const now = useTick();
  const d = city.data;
  const elapsedH = d ? Math.max(0, (now - Date.parse(d.serverNow)) / 3_600_000) : 0;
  const gold = d ? d.resources.gold + d.production.goldPerHour * elapsedH : 0;
  const food = d ? d.resources.food + d.production.foodPerHour * elapsedH : 0;

  const page = Object.entries(PAGE_TITLE).find(([p]) => pathname.startsWith(p))?.[1] ?? '';

  return (
    <div className="tex tex-header bevel mb-3 flex items-center justify-center gap-3 rounded-[var(--radius-md)]
      border-2 border-strong bg-panel-header px-3 py-1.5 text-on-panel-header sm:gap-5">
      <Res kind="gold" value={fmt(gold)} size={22} className="text-[15px] font-semibold" />
      <Res kind="food" value={fmt(food)} size={22} className="text-[15px] font-semibold" />

      <span className="hidden h-5 w-px bg-on-panel-header/25 sm:block" />

      <span className="display hidden truncate text-sm font-semibold tracking-wide sm:block">
        {d?.name ?? '—'}
      </span>
      <span className="tnum hidden text-xs opacity-80 sm:block">
        {d ? `${d.coordinates.k}:${d.coordinates.d}:${d.coordinates.s}` : ''}
      </span>

      <span className="hidden h-5 w-px bg-on-panel-header/25 sm:block" />

      <span className="display truncate text-sm font-semibold tracking-wider uppercase">{page}</span>

      <ConnectionDot />
    </div>
  );
}

/**
 * Gerçek zamanlı bağlantı göstergesi. Kopukluk SESSİZ kalmamalı: oyuncu "gelen ordu yok"
 * görüntüsüne bakarken aslında bağlantısı kopmuş olabilir.
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
    <span title={label} aria-label={label} role="status" className="flex shrink-0 items-center">
      <span className={`h-2 w-2 rounded-full ring-1 ring-black/30 ${color} ${
        state === 'online' ? '' : 'animate-pulse'
      }`} />
    </span>
  );
}

/* ── Sol sütun: logo + menü (yalnız masaüstü) ──────────────────────────────── */

function SideMenu() {
  const messages = useMessages();
  const movements = useMovements();
  const session = getSession();
  const unread = messages.data?.unread ?? 0;
  // Rozet YALNIZ gelen (yabancı) hareketleri sayar; kendi seferlerim acil bilgi değil.
  const incoming = (movements.data?.movements ?? []).filter((m) => m.direction === 'in').length;

  return (
    <div className="sticky top-3 space-y-3">
      <div className="flex justify-center px-2">
        <img src="/assets/ui/logo.png" alt="Mobiwar" width={200} height={80}
          className="icon-shadow h-auto w-full max-w-[190px] object-contain" />
      </div>

      <Panel title={session?.username ?? 'Menü'}>
        <nav className="p-1.5">
          {MENU.map((t) => {
            const badge = t.to === '/messages' ? unread : t.to === '/armies' ? incoming : 0;
            return (
              <NavLink key={t.to} to={t.to}
                className={({ isActive }) =>
                  `mb-0.5 flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5
                   text-[13px] transition-colors ${
                    isActive
                      ? 'border-strong bg-accent font-semibold text-on-accent shadow-[var(--bevel)]'
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
              px-2.5 py-1.5 text-[13px] text-danger transition-colors hover:border-danger hover:bg-raised"
          >
            <span aria-hidden className="text-base leading-none">⏻</span>
            <span className="flex-1 text-left">Oyunu Kapat</span>
          </button>
        </nav>
      </Panel>
    </div>
  );
}

/* ── Sağ sütun: ittifak + sohbet (yalnız geniş masaüstü) ───────────────────── */

/**
 * İttifak ve Genel Sohbet sonraki fazlarda geliyor; paneller yerini ŞİMDİDEN tutuyor çünkü
 * üç sütunlu düzenin dengesi onlara göre kuruldu — sonradan eklenince orta sütun daralıp
 * alışkanlık bozulmasın.
 */
function SidePanels() {
  return (
    <div className="sticky top-3 space-y-3">
      <Panel title="İttifak">
        <div className="p-3 text-xs text-muted">
          Henüz bir ittifakta değilsin.
          <div className="mt-1 text-[11px]">Kurmak için <b>Kale 5</b> gerekiyor.</div>
        </div>
      </Panel>
      <Panel title="Genel Sohbet">
        <div className="p-3 text-xs text-muted">Yakında.</div>
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
  const incoming = (movements.data?.movements ?? []).filter((m) => m.direction === 'in').length;

  return (
    <nav className="tex tex-header fixed inset-x-0 bottom-0 z-20 border-t-2 border-strong bg-panel-header lg:hidden"
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
              <span className="text-xl leading-none">{t.icon}</span>
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
