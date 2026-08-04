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
import { NIGHT_FROM_HOUR, NIGHT_TO_HOUR, zonedHour } from '@mobilwar/contracts';
import { coords } from '../lib/format.ts';
import { fmt, gameNow, useMediaQuery, useTick } from '../lib/hooks.ts';
import { VerifyBanner } from './VerifyBanner.tsx';
import { NotifyBanner } from './NotifyBanner.tsx';
import {
  armiesBadge, useAlliance, useChatConversations, useCity, useMessages, useMovements,
  type CityDetail,
} from '../lib/queries.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { CityStrip } from './CityStrip.tsx';
import { useConfirm } from './Modal.tsx';
import { Tooltip, TooltipRow, TooltipTitle } from './Tooltip.tsx';
import { InstallButton } from './InstallButton.tsx';
import { MenuIcon, Panel, Res, Skeleton } from './ui.tsx';

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
  /* ⭐ Simülatör (kullanıcı, 2026-08-01): uç aylardır çalışıyordu, ekranı yoktu. */
  { to: '/simulate', label: 'Simülatör', icon: 'simulator' },
  { to: '/options', label: 'Seçenekler', icon: 'secenekler' },
  { to: '/help', label: 'Yardım', icon: 'yardim' },
] as const;

/**
 * Mobil alt bar 11 madde taşıyamaz → beş sekme; "Şehir" şehir ekranlarının hub'ıdır.
 *
 * ⭐ **Komuta Merkezi eklendi** (kullanıcı, 2026-08-01): mobilde ona doğrudan bir bağlantı
 * YOKTU, oysa sıralamalar/ittifak/arama hep orada. Yeri Mesajlar'ın hemen ardı — masaüstü
 * menüsündeki sırayla aynı.
 *
 * ⚠️ «Daha» artık bir **rota değil, açılır menü** (aşağıdaki `MoreSheet`). Eskiden doğrudan
 * Seçenekler'i açıyordu ve **Yardım mobilde hiç erişilemiyordu**.
 */
const TABS = [
  { to: '/armies', label: 'Ordular', icon: 'ordular' },
  { to: '/city', label: 'Şehir', icon: 'sehir' },
  { to: '/world', label: 'Dünya', icon: 'dunya' },
  { to: '/messages', label: 'Mesaj', icon: 'mesaj' },
  { to: '/command', label: 'Komuta', icon: 'komutamerkezi' },
] as const;

/**
 * «Daha» düğmesinin yukarı doğru açtığı liste (kullanıcı tarifi).
 *
 * ⚠️ Simülatör burada da olmak ZORUNDA: masaüstünde sol menüde duruyor ama alt barın altı
 * sekmesine sığmıyor — listeye konmasaydı mobilde ekrana giden hiçbir yol kalmazdı.
 */
const MORE_ITEMS = [
  { to: '/simulate', label: 'Simülatör', icon: 'simulator' },
  { to: '/options', label: 'Seçenekler', icon: 'secenekler' },
  { to: '/help', label: 'Yardım', icon: 'yardim' },
] as const;

/**
 * Rota → ekranda gösterilen sayfa adı (bilgi çubuğunun sağ ucu).
 *
 * ⚠️ Eşleşme `startsWith` ile yapıldığı için **uzun yol önce** denenmeli; `/command` kısa yolu
 * `/command/rankings`'i yutar ve alt sayfada yanlış başlık yazardı.
 */
const PAGE_TITLE: [string, string][] = [
  /* ⚠️ Sıra ÖNEMLİ: `find` ilk eşleşeni alır, `startsWith` kullanıldığı için alt yollar
     `/command`ten ÖNCE gelmeli — yoksa hepsi "Genel Durum" görünür. */
  ['/command/rankings', 'Sıralamalar'],
  ['/command/alliance', 'İttifak'],
  ['/command/search', 'Arama'],
  ['/command', 'Genel Durum'],
  ['/armies', 'Ordular'], ['/barracks', 'Baraka'], ['/buildings', 'Yapılar'],
  ['/defense', 'Savunma'], ['/academy', 'Akademi'], ['/temple', 'Tapınak'],
  ['/world', 'Dünya'], ['/messages', 'Mesajlar'], ['/options', 'Seçenekler'],
  ['/help', 'Yardım'], ['/city', 'Şehir'], ['/more', 'Seçenekler'], ['/simulate', 'Simülatör'],
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

/**
 * ⭐ ÜST BÖLGE SABİT — ama `position: sticky` DEĞİL (kullanıcı, 2026-08-02).
 *
 * Önce sticky denendi ve kötü göründü, çünkü sticky öge kayan içeriği ancak **opak bir arka
 * planı varsa** örter. Gövdenin arka planı ise düz renk değil: `--tex-grain` + `--tex-page`
 * dokuları `background-attachment: fixed` ile duruyor (`index.css`). Şeride düz `bg-bg`
 * vermek o dokuyu tam da orada kesiyordu; üstelik içerik yine de altından geçtiği için
 * kenarlarda sızıyordu.
 *
 * Doğru çözüm arka plan değil **yerleşim**: sayfa gövdesi hiç kaydırılmıyor, yalnız
 * içerik sütunu kendi içinde kayıyor. Böylece
 *   - üst bölge arka plansız kalabiliyor (doku bozulmuyor),
 *   - içerik oraya **hiç girmiyor** — şehir şeridinin bittiği yerin biraz altında kesiliyor,
 *   - mobil ve masaüstü aynı davranıyor.
 *
 * ⚠️ `min-h-0`: flex çocuğunun varsayılan `min-height:auto` değeri içeriğe göre büyür ve
 * `overflow-y-auto`yu ETKİSİZ kılar (kaydırma yine gövdeye taşardı). Bu satır olmadan
 * düzenin tamamı sessizce eski davranışa döner.
 *
 * ⚠️ `#root` yüksekliği `index.css`te `height: 100%` — buradaki `h-full` ona dayanıyor.
 */
export function Shell({ children }: { children: ReactNode }) {
  const wide = useMediaQuery('(min-width: 1280px)');
  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex h-full w-full max-w-[1700px] justify-center gap-3 px-3 py-3 lg:gap-8 2xl:gap-14">
        {/* Yan sütunlar da kendi içlerinde kayar; uzun ittifak/sohbet listesi sayfayı itmez. */}
        <aside className="hidden w-52 shrink-0 overflow-y-auto lg:block">
          <SideMenu />
        </aside>

        <main className="flex h-full w-full min-w-0 max-w-3xl flex-col">
          <div className="shrink-0">
            <InfoBar />
            {/* Doğrulama uyarısı şehir şeridinin ÜSTÜNDE: bilgi çubuğundan sonraki ilk şey. */}
            <VerifyBanner />
            {/* ⚠️ Bildirim daveti doğrulamadan SONRA: ikisi aynı anda görünebilir ve
                doğrulama daha acildir (kısıtları o kaldırıyor). */}
            <NotifyBanner />
            <CityStrip />
          </div>

          {/* `pb-24`: mobilde alt bar `fixed`, son satır onun altında kalmasın. */}
          <div className="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-3">
            {children}
          </div>
        </main>

        {/*
          ⚠️ `hidden xl:block` TEK BAŞINA YETMİYOR: o yalnız görünürlüğü kapatıyor, bileşen
          mobilde de mount oluyordu ve içindeki `/alliance` sorgusu hiç kimsenin bakmadığı
          bir panel için dakikada bir dönüyordu (2026-08-03). Kırılımı JS'e taşıyıp
          bileşeni hiç kurmuyoruz; `xl` = 1280 px, Tailwind sınıfıyla aynı eşik.
        */}
        {wide ? (
          <aside className="w-60 shrink-0 overflow-y-auto">
            <SidePanels />
          </aside>
        ) : null}
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
    document.title = page && !pathname.startsWith('/armies') ? `${page} · MobilWar` : 'MobilWar';
  }, [page, pathname]);

  const onCityScreen = CITY_SCREENS.some((r) => pathname.startsWith(r));

  /**
   * ⭐ ÜÇ BÖLGELİ GRID (kullanıcı, 2026-08-01) — `flex + justify-center` YERİNE.
   *
   * ⚠️ **Sorun:** eski düzende her şey tek bir ortalanmış satırdaydı. 6.000.000 altını olan
   * şehirden 500 altını olan şehre geçince sayının genişliği değişiyor, ortalama yeniden
   * hesaplanıyor ve **tüm içerik sağa sola zıplıyordu**.
   *
   * ⚠️ **Kolonlar `auto 1fr auto` — HER genişlikte.** Bir ara `minmax(0,1fr) auto minmax(0,1fr)`
   * denendi (kenarları eşitleyip ortayı sayfanın tam ortasına oturtmak için) ve **iki kez
   * çakışmaya yol açtı**: `minmax(0,…)` kenar sütunun içeriğinin ALTINA inmesine izin veriyor,
   * dolayısıyla dar ekranda sol bölge 9 haneli iki sayı için gereken yeri alamıyor ve rakamlar
   * şehir adının üstüne biniyordu (ölçüldü: 375px'te 138/192 px, 779px'te 213/234 px).
   *
   * ⚠️ Dead-center **istenen bir şey değildi**; istenen "kaynak alanı sabit olsun, şehir
   * değişince içerik zıplamasın" idi. Onu sağlayan şey aşağıdaki `min-w-[9ch]`: sol bölgenin
   * genişliği sayının uzunluğundan bağımsız olarak SABİT, dolayısıyla orta bölge de zıplamıyor.
   * Kenarları eşitlemek bu şart için gereksiz, üstelik kırılgan.
   *
   * ⚠️ `min-w-[9ch]` `Res`in `numClass`ıyla **sayının kendi kutusuna** gider, dış kutuya değil
   * (dıştaki sınır ikonu da sayıp sayıyı taşırıyordu). `tnum` sınıfı `tabular-nums` verdiği için
   * `ch` burada GERÇEKTEN sabit genişlik: 9 karakter `6.000.000`ı alıyor, daha uzun sayı yalnız
   * kendi kutusunu büyütür.
   */
  return (
    <div className="tex tex-header bevel mb-3 grid grid-cols-[auto_1fr_auto]
      items-center gap-2 rounded-[var(--radius-md)] border-2 border-strong bg-panel-header
      px-2.5 py-1.5 text-on-panel-header sm:gap-4 sm:px-3">

      {/* ── SOL: kaynak (sola yaslı, kullanıcı isteği) ────────────────────────── */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        {/* ⭐ Mobil geri butonu (kullanıcı, 2026-07-30): şehir alt ekranlarından Şehir'e dönüş. */}
        {onCityScreen ? (
          <NavLink to="/city" aria-label="Şehir sayfasına dön"
            className="-ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)]
              border border-transparent text-lg leading-none hover:border-border hover:bg-raised lg:hidden">
            ‹
          </NavLink>
        ) : null}
        <Res kind="gold" value={fmt(gold)} size={22} numClass="min-w-[9ch]"
          className="text-[12px] font-semibold sm:text-[15px]" />
        <Res kind="food" value={fmt(food)} size={22} numClass="min-w-[9ch]"
          className="text-[12px] font-semibold sm:text-[15px]" />
      </div>

      {/* ── ORTA: şehir · koordinat · sayfa (daima ortada) ────────────────────── */}
      <div className="flex min-w-0 items-center justify-center gap-2 sm:gap-4">
        <span className="display hidden truncate text-sm font-semibold tracking-wide sm:block">
          {d?.name ?? '—'}
        </span>
        {/* Koordinat mobilde sayfa başlığının yerini alır ve VURGULU (kullanıcı, 2026-07-30). */}
        <span className="tnum shrink-0 text-[12px] font-semibold sm:text-xs sm:font-normal sm:opacity-80">
          {d ? coords(d.coordinates) : ''}
        </span>
        <span className="hidden h-5 w-px bg-on-panel-header/25 sm:block" />
        {/* Sayfa başlığı yalnız masaüstünde; mobilde yer koordinata bırakıldı. */}
        <span className="display hidden truncate text-sm font-semibold tracking-wider uppercase sm:block">
          {page}
        </span>
      </div>

      {/* ── SAĞ: göstergeler (sağa yaslı, kullanıcı isteği) ───────────────────── */}
      <div className="flex items-center justify-end gap-2 sm:gap-3">
        {/* ⭐ §tatil modu — kaynak sayacı donduğu için oyuncunun "neden artmıyor" diye
            sorması an meselesi. Rozet o soruyu sormadan yanıtlıyor ve tıklanınca panele
            götürüyor. Sayaç zaten kendiliğinden duruyor: sunucu `goldPerHour` 0 döndürüyor,
            ekstrapolasyon da 0 ile çarpıyor. */}
        {d?.onVacation ? (
          <NavLink to="/options" title="Tatil modundasın — üretim ve kaynak birikimi durdu"
            className="shrink-0 rounded-full border border-info px-2 py-0.5 text-[10px]
              font-semibold text-info hover:bg-info/10">
            Tatilde
          </NavLink>
        ) : null}
        <NightBadge />
        <ConnectionDot />
        <SpeedBadge speed={d?.speed} />
      </div>
    </div>
  );
}

/**
 * ⭐ GECE ROZETİ (kullanıcı, 2026-08-04: *"arayüzde gece olduğuna dair bir görsel düzenleme şık
 * durabilir … tıklayınca tooltip de gece saatleri içinde olduğunu söyler"*).
 *
 * ⚠️ Gece penceresi aynı gün UTC'den **Türkiye saatine** taşındı (§13.22). Bu rozet o
 * değişikliğin görünür yüzü: eskiden "gece" sabah 10'da bitiyordu ve oyuncunun bunu anlamasının
 * hiçbir yolu yoktu.
 *
 * ⚠️ Pencere `isNightBattle` ile AYNI kaynaktan (`zonedHour`) okunuyor — rozet ile kuralın
 * ayrışması, oyuncuya yanlış söyleyen bir gösterge demekti.
 * ⚠️ Ölçüt **oyun saati** (`gameNow`), tarayıcının saati değil: bakımda oyun saati donuyor ve
 * gece penceresi de onunla birlikte donmalı.
 */
function NightBadge() {
  // Dakikada bir yeter; rozet saniye göstermiyor ve saniyelik tik boşuna render demek.
  useTick(true);
  const hour = zonedHour(new Date(gameNow()));
  if (hour < NIGHT_FROM_HOUR || hour >= NIGHT_TO_HOUR) return null;
  return (
    <Tooltip
      label={`Gece saatleri (${String(NIGHT_FROM_HOUR).padStart(2, '0')}:00–`
        + `${String(NIGHT_TO_HOUR).padStart(2, '0')}:00). Gece görüşü olmayan ordular `
        + 'daha zayıf savaşır.'}
    >
      <span
        aria-label="Şu an gece saatleri"
        className="shrink-0 cursor-help rounded-full border border-info/70 bg-info/10 px-2
          py-0.5 text-[10px] font-semibold text-info"
      >
        🌙 Gece
      </span>
    </Tooltip>
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
      label: 'Sunucuya bağlandı',
      note: 'Anlık olay bildirimleri alınıyor.',
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
  /**
   * ⚠️ `pageSize: 1` — burada YALNIZ `unread` sayacı okunuyor, satırlar değil (2026-08-03).
   * Varsayılan 20'ydi ve bu sorgu her ekranda, her emniyet ağı turunda dönüyordu: hiç
   * çizilmeyen 20 satır boşuna taşınıyordu. Sayaçlar `COUNT(*)` ile ayrıca hesaplandığı
   * için sayfa boyu onları etkilemiyor.
   */
  const messages = useMessages({ pageSize: 1 });
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
        <img src="/assets/ui/logo.png" alt="MobilWar" width={200} height={80}
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
          {/* ⭐ Kurulum daveti çıkıştan ÖNCE: «Oyunu Kapat» menünün kapanış hareketi,
              altına bir şey koymak onu listenin ortasında bırakıyor. */}
          <InstallButton variant="side" />
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
 * görünür.
 *
 * ⚠️ Bu yorum 2026-08-03'e kadar *"presence olayı geldikçe liste kendiliğinden tazelenir"*
 * diyordu ve **yanlıştı**: sunucu `presence:update` yayıyordu ama istemcide dinleyicisi yoktu,
 * rozet yalnız 60 saniyelik yoklamayla değişiyordu. Dinleyici artık `realtime.ts`'te (2 sn
 * debounce'lı) — yani yorum ancak şimdi doğru.
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
            {/* ⭐ §tatil modu — «Tatilde» çevrimiçilik BİLGİSİNİN YERİNE geçer (kullanıcı
                şartı), yanına eklenmez: tatildeki oyuncunun bağlı olup olmaması bir işe
                yaramıyor, ona zaten hiçbir şey gönderilemez. */}
            <span className={`shrink-0 text-[10px] font-semibold ${
              m.onVacation ? 'text-info' : m.online ? 'text-success' : 'text-danger'}`}>
              {m.onVacation ? 'Tatilde' : m.online ? 'Online' : 'Offline'}
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
  /**
   * ⚠️ `pageSize: 1` — burada YALNIZ `unread` sayacı okunuyor, satırlar değil (2026-08-03).
   * Varsayılan 20'ydi ve bu sorgu her ekranda, her emniyet ağı turunda dönüyordu: hiç
   * çizilmeyen 20 satır boşuna taşınıyordu. Sayaçlar `COUNT(*)` ile ayrıca hesaplandığı
   * için sayfa boyu onları etkilemiyor.
   */
  const messages = useMessages({ pageSize: 1 });
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
        <MoreSheet />
      </div>
    </nav>
  );
}

/**
 * ⭐ «DAHA» — yukarı açılan liste (kullanıcı, 2026-08-01).
 *
 * ⚠️ Eskiden bu bir `NavLink`ti ve doğrudan Seçenekler'i açıyordu; sonuç olarak **Yardım
 * mobilde hiç erişilemiyordu** ve "Oyunu Kapat" ancak Seçenekler'in en altında bulunuyordu.
 *
 * ⚠️ `z-30` gövdede: alt barın kendisi `z-20`; liste onun ÜSTÜNDE çizilmeli ama sohbet
 * penceresinin (`z-30`) ve modalın (`z-40`) altında kalmalı — merdiven `Toaster.tsx:124`te
 * yazılı ve bozulmamalı.
 */
function MoreSheet() {
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();
  const { pathname } = useLocation();

  // Rota değişince liste kapanmalı; aksi hâlde yeni sayfanın üstünde asılı kalıyor.
  useEffect(() => { setOpen(false); }, [pathname]);

  const active = MORE_ITEMS.some((m) => pathname.startsWith(m.to)) || pathname.startsWith('/more');

  const quit = async (): Promise<void> => {
    setOpen(false);
    const ok = await confirm({
      title: 'Oyundan çıkılsın mı?',
      body: <p className="text-sm">Oturumun kapanacak ve yeniden giriş yapman gerekecek.</p>,
      confirmLabel: 'Çıkış yap',
      danger: true,
    });
    if (!ok) return;
    await logout();
    window.location.href = '/';
  };

  return (
    <>
      {/* Dışarı dokunuşla kapansın — liste açıkken ekranın kalanı tıklama kalkanı olur. */}
      {open ? (
        <button type="button" aria-label="Kapat" onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 cursor-default bg-black/30" />
      ) : null}

      <div className="relative flex flex-1 flex-col">
        {open ? (
          <div className="absolute bottom-full right-0 z-30 mb-1 w-40 overflow-hidden
            rounded-[var(--radius-md)] border-2 border-strong bg-panel-header shadow-[var(--mw-shadow-md)]">
            {MORE_ITEMS.map((m) => (
              <NavLink key={m.to} to={m.to}
                className="flex items-center gap-2 border-b border-on-panel-header/15 px-3 py-2.5
                  text-[13px] text-on-panel-header hover:bg-raised/40">
                <MenuIcon id={m.icon} size={20} />
                {m.label}
              </NavLink>
            ))}
            {/* Masaüstü menüsüyle aynı sıra: kurulum daveti, sonra çıkış. */}
            <InstallButton variant="sheet" onDone={() => setOpen(false)} />
            <button type="button" onClick={() => void quit()}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px]
                text-danger hover:bg-raised/40">
              {/* Masaüstündeki «Oyunu Kapat» ile aynı simge — ikisi aynı işi yapıyor. */}
              <MenuIcon id="cikis" size={20} />
              Çıkış Yap
            </button>
          </div>
        ) : null}

        <button type="button" onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] ${
            active || open ? 'font-semibold text-on-panel-header' : 'text-on-panel-header/70'
          }`}>
          <MenuIcon id="secenekler" size={26} />
          Daha
        </button>
      </div>
    </>
  );
}
