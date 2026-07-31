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
import {
  armiesBadge, useAlliance, useChatConversations, useCity, useMessages, useMovements,
  type CityDetail,
} from '../lib/queries.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { CityStrip } from './CityStrip.tsx';
import { Tooltip, TooltipRow, TooltipTitle } from './Tooltip.tsx';
import { Panel, Res, Skeleton } from './ui.tsx';

/**
 * Sol menü sırası orijinaldeki gibi (`images/scr_web05` sol sütun). Mesajlar orijinalin **web**
 * menüsünde yoktu (J2ME'de Komuta Merkezi altındaydı, `g.java` case 10) ama okunmamış rozeti
 * sürekli görünmeli → **Komuta Merkezi'nden hemen önce** (kullanıcı kararı).
 *
 * ⭐ Simgeler kullanıcının çizdiği set (`images/ikonlar`), emoji DEĞİL: emoji işletim sistemine
 * göre değişiyor ve oyunun antik paletiyle hiç uyuşmuyordu. Dosya adı = `assets/menu/<icon>.png`.
 */
const MENU = [
  { to: '/armies', label: 'Ordular', icon: 'ordular' },
  { to: '/barracks', label: 'Baraka', icon: 'baraka' },
  { to: '/buildings', label: 'Yapılar', icon: 'yapilar' },
  { to: '/defense', label: 'Savunma', icon: 'savunma' },
  { to: '/academy', label: 'Akademi', icon: 'akademi' },
  { to: '/temple', label: 'Tapınak', icon: 'tapinak' },
  { to: '/world', label: 'Dünya', icon: 'dunya' },
  { to: '/messages', label: 'Mesajlar', icon: 'mesaj' },
  { to: '/command', label: 'Komuta Merkezi', icon: 'komutamerkezi' },
  { to: '/options', label: 'Seçenekler', icon: 'secenekler' },
  { to: '/help', label: 'Yardım', icon: 'yardim' },
] as const;

/** Mobil alt bar 11 madde taşıyamaz → beş sekme; "Şehir" şehir ekranlarının hub'ıdır. */
const TABS = [
  { to: '/armies', label: 'Ordular', icon: 'ordular' },
  { to: '/city', label: 'Şehir', icon: 'sehir' },
  { to: '/world', label: 'Dünya', icon: 'dunya' },
  { to: '/messages', label: 'Mesaj', icon: 'mesaj' },
  { to: '/more', label: 'Daha', icon: 'secenekler' },
] as const;

/**
 * Rota → ekranda gösterilen sayfa adı (bilgi çubuğunun sağ ucu).
 *
 * ⚠️ Eşleşme `startsWith` ile yapıldığı için **uzun yol önce** denenmeli; `/command` kısa yolu
 * `/command/rankings`'i yutar ve alt sayfada yanlış başlık yazardı.
 */
const PAGE_TITLE: [string, string][] = [
  ['/command/rankings', 'Sıralamalar'],
  ['/command/alliance', 'İttifak'],
  ['/command', 'Genel Durum'],
  ['/armies', 'Ordular'], ['/barracks', 'Baraka'], ['/buildings', 'Yapılar'],
  ['/defense', 'Savunma'], ['/academy', 'Akademi'], ['/temple', 'Tapınak'],
  ['/world', 'Dünya'], ['/messages', 'Mesajlar'], ['/options', 'Seçenekler'],
  ['/help', 'Yardım'], ['/city', 'Şehir'], ['/more', 'Seçenekler'],
];

/**
 * ⭐ AKTİVİTE NOKTALARI (kullanıcı, 2026-07-30): aktif şehirde süren iş varsa ilgili menü
 * satırının sağında küçük nokta yanar — ŞEHİR BAZLI: başka şehre geçince o şehrin işleri okunur.
 * Akademi noktası araştırmayı BAŞLATAN şehirde görünür (akademiler ortak ama iptal oradan).
 */
export function cityActivity(d: CityDetail | undefined, cityId: number | null): Record<string, boolean> {
  if (!d) return {};
  const q = d.queues ?? [];
  return {
    '/barracks': q.some((x) => x.category === 'unit'),
    '/defense': q.some((x) => x.category === 'defense') || d.wallRepair != null,
    '/buildings': q.some((x) => x.category === 'building') || d.cave.repairing || d.cave.job != null,
    '/academy': (d.techQueues ?? []).some((x) => x.cityId === cityId),
    '/temple': d.heroReviving === true,
  };
}

/** Menü satırındaki aktivite noktası — rozetle çakışmasın diye rozet yokken çizilir. */
export function ActivityDot() {
  return (
    <span aria-label="bu şehirde süren iş var"
      className="inline-block h-2 w-2 shrink-0 rounded-full bg-success shadow-[0_0_4px_var(--mw-color-success)]" />
  );
}

/** Sol menü ve mobil alt barın ortak simgesi. */
function MenuIcon({ id, size }: { id: string; size: number }) {
  return (
    <img src={`/assets/menu/${id}.png`} alt="" aria-hidden width={size} height={size}
      className="icon-shadow shrink-0 object-contain"
      style={{ width: size, height: size }} />
  );
}

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

/** Mobilde Şehir sayfasına geri götüren rotalar (şehir alt ekranları). */
const CITY_SCREENS = ['/barracks', '/buildings', '/defense', '/academy', '/temple'];

function InfoBar() {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const { pathname } = useLocation();

  // ⭐ Sayaç YOKLAMAYLA değil, üretim hızıyla **ekstrapolasyonla** akıyor: sunucu kaynağı tembel
  // biriktiriyor, istemci aradaki saniyeleri saniyede bir çiziyor. Otorite yine sunucudur —
  // çıpa WS olaylarında ve emniyet ağı yoklamasında (dakikada bir) tazeleniyor.
  const now = useTick();
  const d = city.data;
  const elapsedH = d ? Math.max(0, (now - Date.parse(d.serverNow)) / 3_600_000) : 0;
  const gold = d ? d.resources.gold + d.production.goldPerHour * elapsedH : 0;
  const food = d ? d.resources.food + d.production.foodPerHour * elapsedH : 0;

  const page = PAGE_TITLE.find(([p]) => pathname.startsWith(p))?.[1] ?? '';

  /* ⭐ Pencere başlığı aktif sayfayı izler (kullanıcı, 2026-07-30); Ordular'da yalnız oyun adı. */
  useEffect(() => {
    document.title = page && !pathname.startsWith('/armies') ? `${page} · Mobiwar` : 'Mobiwar';
  }, [page, pathname]);

  const onCityScreen = CITY_SCREENS.some((r) => pathname.startsWith(r));

  return (
    <div className="tex tex-header bevel mb-3 flex items-center gap-2 rounded-[var(--radius-md)]
      border-2 border-strong bg-panel-header px-2.5 py-1.5 text-on-panel-header
      sm:justify-center sm:gap-5 sm:px-3">
      {/* ⭐ Mobil geri butonu (kullanıcı, 2026-07-30): şehir alt ekranlarından Şehir'e dönüş. */}
      {onCityScreen ? (
        <NavLink to="/city" aria-label="Şehir sayfasına dön"
          className="-ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)]
            border border-transparent text-lg leading-none hover:border-border hover:bg-raised lg:hidden">
          ‹
        </NavLink>
      ) : null}

      <Res kind="gold" value={fmt(gold)} size={22} className="text-[12px] font-semibold sm:text-[15px]" />
      <Res kind="food" value={fmt(food)} size={22} className="text-[12px] font-semibold sm:text-[15px]" />

      {/* ⭐ Divider mobilde de görünür (kullanıcı 2026-07-30): yemek ile koordinat ayrışsın. */}
      <span className="h-5 w-px shrink-0 bg-on-panel-header/25" />

      <span className="display hidden truncate text-sm font-semibold tracking-wide sm:block">
        {d?.name ?? '—'}
      </span>
      {/* Koordinat mobilde sayfa başlığının yerini alır ve VURGULU (kullanıcı, 2026-07-30). */}
      <span className="tnum text-[12px] font-semibold sm:text-xs sm:font-normal sm:opacity-80">
        {d ? `${d.coordinates.k}:${d.coordinates.d}:${d.coordinates.s}` : ''}
      </span>

      <span className="hidden h-5 w-px bg-on-panel-header/25 sm:block" />

      {/* Sayfa başlığı yalnız masaüstünde; mobilde yer koordinata bırakıldı. */}
      <span className="display hidden truncate text-sm font-semibold tracking-wider uppercase sm:block">
        {page}
      </span>

      {/* ⭐ Mobilde göstergeler EN SAĞA yaslı (ml-auto); masaüstünde ortalı düzen sürer. */}
      <span className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0 sm:gap-3">
        <ConnectionDot />
        <SpeedBadge speed={d?.speed} />
      </span>
    </div>
  );
}

/**
 * ⭐ HIZLANDIRILMIŞ DÜNYA ROZETİ — **yalnız bir değer normalden farklıysa** görünür.
 * Her şey 1x iken hiçbir şey çizilmez; rozet varsa oyuncu "bu dünya klasik değil" bilgisini
 * ilk bakışta alır. Değerler `worlds.speed_multiplier` / `worlds.resource_multiplier`.
 */
function SpeedBadge({ speed }: {
  speed?: { resource: number; travel: number; training?: number; construction?: number };
}) {
  if (!speed) return null;
  const rows: [string, number][] = [
    ['Kaynak üretimi', speed.resource],
    ['Sefer hızı', speed.travel],
    ['Birim üretimi', speed.training ?? 1],
    ['İnşaat/araştırma', speed.construction ?? 1],
  ];
  if (rows.every(([, v]) => v === 1)) return null;

  return (
    <Tooltip
      placement="bottom"
      className="shrink-0 items-center"
      label={
        <>
          <TooltipTitle>Hızlandırılmış dünya</TooltipTitle>
          {rows.map(([label, v]) => (
            <TooltipRow key={label} label={label} value={`${v}x`} tone={v === 1 ? 'muted' : 'accent'} />
          ))}
        </>
      }
    >
      <span tabIndex={0} className="cursor-help leading-none outline-none">
        <span aria-hidden className="text-[15px] leading-none">⚡</span>
        <span className="sr-only">Hızlandırılmış dünya</span>
      </span>
    </Tooltip>
  );
}

/**
 * Gerçek zamanlı bağlantı göstergesi. Kopukluk SESSİZ kalmamalı: oyuncu "gelen ordu yok"
 * görüntüsüne bakarken aslında bağlantısı kopmuş olabilir.
 *
 * ⭐ Nokta tek başına ne olduğunu anlatmıyordu (tarayıcının `title`'ı bir saniye sonra ve
 * biçimsiz çıkıyor). Artık gerçek bir ipucu: **durum + ne anlama geldiği**. Yoklama emniyet ağına
 * indirildiği için bu göstergenin okunabilir olması daha da önemli — WS kopuksa ekran artık
 * 5 saniyede değil 60 saniyede bir tazeleniyor ve oyuncunun bunu bilmesi gerekiyor.
 */
function ConnectionDot() {
  const [state, setState] = useState(getConnectionState);
  useEffect(() => onConnectionChange(setState), []);

  const { label, note, color } = state === 'online'
    ? {
      label: 'Canlı bağlantı açık',
      note: 'Savaş, gelen ordu ve üretim bitişleri anında düşüyor.',
      color: 'bg-success',
    }
    : state === 'connecting'
      ? {
        label: 'Bağlanıyor…',
        note: 'Canlı hat kuruluyor; bu sırada ekran dakikada bir tazeleniyor.',
        color: 'bg-warning',
      }
      : {
        label: 'Bağlantı koptu',
        note: 'Yeniden deneniyor. Hiçbir olay kaybolmaz; bağlanınca hepsi gelir.',
        color: 'bg-danger',
      };

  return (
    <Tooltip
      placement="bottom"
      className="shrink-0 items-center"
      label={<><TooltipTitle>{label}</TooltipTitle><span className="text-muted">{note}</span></>}
    >
      <span tabIndex={0} role="status" aria-label={label}
        className="flex cursor-help items-center outline-none">
        <span className={`h-2 w-2 rounded-full ring-1 ring-black/30 ${color} ${
          state === 'online' ? '' : 'animate-pulse'
        }`} />
      </span>
    </Tooltip>
  );
}

/* ── Sol sütun: logo + menü (yalnız masaüstü) ──────────────────────────────── */

/** Rozet renkleri tek yerde: sol menü ve mobil alt bar aynı kuralı kullansın. */
const BADGE_TONE: Record<string, string> = {
  danger: 'bg-danger text-on-accent',
  success: 'bg-success text-on-accent',
  warning: 'bg-warning text-on-accent',
};

function SideMenu() {
  const messages = useMessages();
  const chats = useChatConversations();
  const movements = useMovements();
  const session = getSession();
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const activity = cityActivity(city.data, cityId);
  /* ⭐ Rozet İKİ kaynağın toplamı (2026-07-31): posta kutusu + okunmamış özel mesajlar. */
  const unread = (messages.data?.unread ?? 0) + (chats.data?.unread ?? 0);
  const armies = armiesBadge(movements.data?.movements ?? []);

  return (
    <div className="sticky top-3 space-y-3">
      <div className="flex justify-center px-2">
        <img src="/assets/ui/logo.png" alt="Mobiwar" width={200} height={80}
          className="icon-shadow h-auto w-full max-w-[190px] object-contain" />
      </div>

      <Panel title={session?.username ?? 'Menü'}>
        <nav className="p-1.5">
          {MENU.map((t) => {
            const badge = t.to === '/messages' ? unread : t.to === '/armies' ? armies?.count ?? 0 : 0;
            const tone = t.to === '/armies' ? BADGE_TONE[armies?.tone ?? 'danger']! : BADGE_TONE['danger']!;
            return (
              <NavLink key={t.to} to={t.to}
                className={({ isActive }) =>
                  `mb-0.5 flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5
                   text-[13px] transition-colors ${
                    isActive
                      ? 'border-strong bg-accent font-semibold text-on-accent shadow-[var(--bevel)]'
                      : 'border-transparent text-ink hover:border-border hover:bg-raised'
                  }`}>
                <MenuIcon id={t.icon} size={26} />
                <span className="flex-1 truncate">{t.label}</span>
                {badge > 0 ? (
                  <span className={`rounded-full px-1.5 text-[10px] leading-4 ${tone}`}>{badge}</span>
                ) : activity[t.to] ? <ActivityDot /> : null}
              </NavLink>
            );
          })}
          <button
            onClick={() => { void logout().then(() => window.location.reload()); }}
            className="mt-1 flex w-full items-center gap-2 rounded-[var(--radius-sm)] border border-transparent
              px-2.5 py-1.5 text-[13px] text-danger transition-colors hover:border-danger hover:bg-raised"
          >
            <MenuIcon id="cikis" size={26} />
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
/**
 * ⭐ SAĞ SÜTUN İTTİFAK PANELİ (2026-07-30) — ekran görüntüsündeki "run.dll İttifağı" listesi:
 * üye adları + Online/Offline renkli durum. Çevrimiçilik yalnız ittifak üyeleri arasında
 * görünür; presence olayı geldikçe liste kendiliğinden tazelenir (`realtime.ts`).
 */
function AlliancePanel() {
  const view = useAlliance(0);
  const a = view.data?.alliance;

  /* ⭐ Yüklenirken "Henüz bir ittifakta değilsin" PARLAMASIN (kullanıcı 2026-07-30):
   * veri gelene kadar iskelet satırları — üye olan oyuncu bir an bile "ittifaksız" görmez. */
  if (view.isLoading) {
    return (
      <Panel title="İttifak">
        <div className="space-y-2 p-3">
          <Skeleton w="70%" />
          <Skeleton w="55%" />
          <Skeleton w="62%" />
        </div>
      </Panel>
    );
  }

  if (!a) {
    return (
      <Panel title="İttifak">
        <div className="p-3 text-xs text-muted">
          Henüz bir ittifakta değilsin.
          <NavLink to="/command/alliance"
            className="mt-1 block text-[11px] text-accent hover:underline">
            İttifak kur ya da bir ittifağa başvur →
          </NavLink>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={`${a.name} İttifağı`}>
      <ul className="divide-y divide-border">
        {a.members.slice(0, 15).map((m) => (
          <li key={m.playerId} className="flex items-center justify-between px-3 py-1 text-xs">
            <span className="truncate">{m.username}</span>
            <span className={`shrink-0 text-[10px] font-semibold ${
              m.online ? 'text-success' : 'text-danger'}`}>
              {m.online ? 'Online' : 'Offline'}
            </span>
          </li>
        ))}
      </ul>
      {a.memberCount > 15 ? (
        <NavLink to="/command/alliance"
          className="block px-3 py-1.5 text-[11px] text-accent hover:underline">
          tüm {a.memberCount} üye →
        </NavLink>
      ) : null}
    </Panel>
  );
}

function SidePanels() {
  return (
    <div className="sticky top-3 space-y-3">
      <AlliancePanel />
      <Panel title="Genel Sohbet">
        <div className="p-3 text-xs text-muted">Yakında.</div>
      </Panel>
    </div>
  );
}

/* ── Alt bar (YALNIZ mobil) ────────────────────────────────────────────────── */

function BottomBar() {
  const messages = useMessages();
  const chats = useChatConversations();
  const movements = useMovements();
  const { pathname } = useLocation();

  /* ⭐ Rozet İKİ kaynağın toplamı (2026-07-31): posta kutusu + okunmamış özel mesajlar. */
  const unread = (messages.data?.unread ?? 0) + (chats.data?.unread ?? 0);
  const armies = armiesBadge(movements.data?.movements ?? []);

  return (
    <nav className="tex tex-header fixed inset-x-0 bottom-0 z-20 border-t-2 border-strong bg-panel-header lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto flex w-full max-w-3xl">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.to);
          const badge = t.to === '/messages' ? unread : t.to === '/armies' ? armies?.count ?? 0 : 0;
          const tone = t.to === '/armies' ? BADGE_TONE[armies?.tone ?? 'danger']! : BADGE_TONE['danger']!;
          return (
            <NavLink key={t.to} to={t.to}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] ${
                active ? 'font-semibold text-on-panel-header' : 'text-on-panel-header/70'
              }`}>
              <MenuIcon id={t.icon} size={26} />
              {t.label}
              {badge > 0 ? (
                <span className={`absolute top-0.5 right-1/2 translate-x-4 rounded-full px-1.5 text-[10px] leading-4 ${tone}`}>
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
