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
import { coords } from '../lib/format.ts';
import { ActivityDot, cityActivity } from '../lib/city-activity.tsx';
import { matchCityScreen } from '../lib/city-screens.ts';
import { fmt, gameNow, useMediaQuery, useTick } from '../lib/hooks.ts';
import { VerifyBanner } from './VerifyBanner.tsx';
import { NotifyBanner } from './NotifyBanner.tsx';
import {
  armiesBadge, useAlliance, useChatConversations, useCity, useMessages, useMovements,
} from '../lib/queries.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { useGlobalChatConnection } from '../lib/global-chat-context.tsx';
import { GlobalChat } from './GlobalChat.tsx';
import { CityStrip } from './CityStrip.tsx';
import { CityTabs } from './CityTabs.tsx';
import { useConfirm } from './Modal.tsx';
import { Tooltip, TooltipRow, TooltipTitle } from './Tooltip.tsx';
import { InstallButton } from './InstallButton.tsx';
import { MenuIcon, Panel, Res, Skeleton, UserText } from './ui.tsx';

/**
 * Sol menü sırası orijinaldeki gibi (`images/scr_web05` sol sütun). Mesajlar orijinalin **web**
 * menüsünde yoktu (J2ME'de Komuta Merkezi altındaydı, `g.java` case 10) ama okunmamış rozeti
 * sürekli görünmeli → **Komuta Merkezi'nden hemen önce** (kullanıcı kararı).
 *
 * ⭐ Simgeler kullanıcının çizdiği set (`images/ikonlar`), emoji DEĞİL: emoji işletim sistemine
 * göre değişiyor ve oyunun antik paletiyle hiç uyuşmuyordu. Dosya adı = `assets/menu/<icon>.png`.
 */
/* ⚠️ Şehir ekranlarının rota+ad listesi ayrıca `lib/city-screens.ts`te duruyor (sekme şeridi
   ve CityHub oradan okuyor). Bu dizi BİLEREK ayrı: ikon kümesi farklı (`assets/menu/*`) ve
   burada şehir dışı yedi madde var. Beş rotadan biri değişirse ikisini de güncelle. */
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
 *
 * ⚠️ **Genel Sohbet bu dizide DEĞİL** (2026-08-10) ve olamaz: bu liste `NavLink`lerden oluşuyor,
 * sohbet ise bir rota değil bir **aç/kapa**. Maddesi `MoreSheet` içinde elle çiziliyor; ayrıca
 * `globalChat.enabled` kapalıyken hiç görünmemesi gerekiyor, oysa buradaki maddeler koşulsuz.
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

/* ⚠️ `cityActivity` ve `ActivityDot` 2026-08-09'da `lib/city-activity.tsx`e taşındı —
   gerekçesi (döngüsel bağımlılık) orada yazılı. */

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
            {/* ⭐ Şehir sekmeleri şeridin HEMEN ALTINDA (kullanıcı, 2026-08-09) ve yalnız
                mobilde + beş şehir ekranında; kararını kendisi veriyor, burada koşul yok.
                Üst bölge kaydırılmadığı için (dosya başındaki yerleşim notu) şerit sayfa
                kayarken de yerinde duruyor — ayrıca `sticky` gerekmiyor. */}
            <CityTabs />
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
        {/* ⚠️ Mobil geri butonu (‹ → /city) 2026-08-09'da KALDIRILDI: şehir sekmeleri
            (`CityTabs`) beş ekrana da doğrudan geçiş verdiği için tek işi kalan "listeye dön"
            artık sekmelerin tekrarıydı. Hub'a erişim alt bardaki «Şehir» sekmesinde duruyor. */}
        <ResRate kind="gold" value={gold} perHour={d?.production.goldPerHour}
          onVacation={d?.onVacation === true} />
        <ResRate kind="food" value={food} perHour={d?.production.foodPerHour}
          onVacation={d?.onVacation === true} />
      </div>

      {/* ── ORTA: şehir · koordinat · sayfa (daima ortada) ────────────────────── */}
      <div className="flex min-w-0 items-center justify-center gap-2 sm:gap-4">
        {/*
          ⚠️ `display` sınıfı BİLEREK YOK — o sınıf **Cinzel**'i getiriyor ve Cinzel tasarımı
          gereği küçük harfsiz bir Roma yazı tipi: küçük harfleri küçük-büyük harf (small caps)
          olarak çiziyor. Sonuç, oyuncu «Mithlond» yazsa da ekranda «MİTHLOND» görünmesiydi.
          Şehir adı OYUNCUNUN YAZDIĞI metindir; onu fontun yeniden biçimlendirmesi doğru değil.
          Gövde fontu (Spectral) gerçek küçük harf taşıyor. Aynı düzeltme `CityStrip`te de var.
        */}
        <span className="hidden truncate text-sm font-semibold tracking-wide sm:block">
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
        <ConnectionDot />
        <SpeedBadge speed={d?.speed} />
      </div>
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
  /**
   * ⭐ **YALNIZ HIZLANDIRILMIŞ SATIRLAR** (kullanıcı, 2026-08-09).
   *
   * ⚠️ Eskiden dört satırın hepsi çiziliyor, normal hızda olanlar `1x` diye soluk görünüyordu.
   * Rozetin başlığı zaten «Hızlandırılmış dünya»; altında «Sefer hızı 1x» yazması oyuncuya
   * hiçbir şey söylemiyor, üstelik gerçekten değişmiş olan satırı gürültüye gömüyordu.
   * Rozetin kendisi de zaten yalnız bir şey 1'den farklıysa çiziliyor — süzgeç o kuralın
   * satır düzeyindeki karşılığı.
   */
  const rows: [string, number][] = ([
    ['Kaynak üretimi', speed.resource],
    ['Sefer hızı', speed.travel],
    ['Birim üretimi', speed.training ?? 1],
    ['İnşaat/araştırma', speed.construction ?? 1],
  ] as [string, number][]).filter(([, v]) => v !== 1);
  if (rows.length === 0) return null;

  return (
    <Tooltip
      placement="bottom"
      className="shrink-0 items-center"
      label={
        <>
          <TooltipTitle>Hızlandırılmış dünya</TooltipTitle>
          {rows.map(([label, v]) => (
            <TooltipRow key={label} label={label} value={`${v}x`} tone="accent" />
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
 * ⭐ Bilgi çubuğundaki kaynak sayacı + **saatlik üretim ipucu** (kullanıcı, 2026-08-08):
 * *"navbardaki altın ve yemek sayısına tıklayınca saatte kaç adet ürettiğini göstersin."*
 *
 * ⚠️ Sayı `production.*PerHour`'dan geliyor, istemcide YENİDEN HESAPLANMIYOR: aynı sayı zaten
 * sayacın akış hızını belirliyor (`InfoBar`daki ekstrapolasyon). İkinci bir kaynaktan
 * hesaplasaydık "ipucu +50 diyor ama sayaç başka hızda akıyor" ayrışması kaçınılmazdı.
 *
 * ⭐ Tatilde sunucu ikisini de 0 döndürüyor; ipucu bunu **sebebiyle** söylüyor, yoksa oyuncu
 * "üretimim niye sıfır" diye sorardı.
 */
function ResRate({
  kind, value, perHour, onVacation,
}: { kind: 'gold' | 'food'; value: number; perHour: number | undefined; onVacation: boolean }) {
  const title = kind === 'gold' ? 'Altın' : 'Yemek';
  const rate = perHour ?? 0;
  return (
    <Tooltip
      placement="bottom"
      label={
        <>
          <TooltipTitle>{title}</TooltipTitle>
          <TooltipRow label="Üretim" value={`+${fmt(Math.round(rate))} / saat`}
            tone={rate > 0 ? 'accent' : 'muted'} />
          {onVacation ? (
            <span className="mt-1 block text-muted">Tatil modunda üretim durur.</span>
          ) : null}
        </>
      }
    >
      {/*
        ⚠️ Tetikleyici **`<button>`**: `Tooltip`in sarmalayıcısı düz bir `span` ve odak
        alamıyor — klavye kullanıcısı ipucuna hiç ulaşamazdı. `MeritBadge` ve `AllyBadge`
        aynı gerekçeyle `<button>` kullanıyor.

        ⚠️⚠️ **`flex` — `inline-block` DEĞİL** (kullanıcı bildirimi, 2026-08-11: *"altın ve
        yemek… navbarı dikeyde tam ortalamıyor, yukarı yanaşık duruyor"*). Düğme varsayılan
        `inline-block` olduğu için içeride bir **satır kutusu** açıyordu ve o kutuya düğmenin
        kendi yazı tipinden gelen **strut** karışıyordu:

          • `Res` bir `inline-flex` ve taban çizgisi **alt kenarı** (ilk esnek öge `<img>`,
            resmin taban çizgisi alt kenarıdır) → 22px'in TAMAMI taban çizgisinin ÜSTÜNDE.
          • Strut ise devralınan 16px gövde yazısından geliyordu ve taban çizgisinin ALTINA
            ~7-10px iniyordu.
          • Sonuç: satır kutusu ≈ 30px, içerik yalnız üstteki 22px'i dolduruyor, boşluğun
            tamamı **altta** kalıyor → ikon ve sayı yukarı yanaşık görünüyor.

        `flex` satır kutusunu tamamen ortadan kaldırıyor: düğmenin yüksekliği artık içeriğin
        yüksekliği (22px) ve dış ızgaranın `items-center`'ı gerçekten ortalıyor.
        ⚠️ `leading-none` de belirtiyi bastırırdı ama sebebi değil: strut küçülür, yine kalır.
      */}
      <button type="button" aria-label={`${title} üretimi`}
        className="flex cursor-help items-center text-left outline-none">
        <Res kind={kind} value={fmt(value)} size={22} numClass="min-w-[9ch]" nativeTitle={false}
          className="text-[12px] font-semibold sm:text-[15px]" />
      </button>
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

      {/* ⭐ Sol menü başlığı = KULLANICI ADI, o yüzden aynen yazılır (kullanıcı, 2026-08-09). */}
      <Panel title={session?.username ? <UserText>{session.username}</UserText> : 'Menü'}>
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
          <GlobalChatMenuButton />
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

/**
 * ⭐⭐ GENEL SOHBET — **1024-1279 px'in tek kapısı** (kullanıcı kararı, 2026-08-10).
 *
 * ⚠️ Bu düğme bir boşluğu kapatıyor: sağ sütun `xl` (≥1280) altında hiç çizilmiyor, alt bar
 * ise `lg:hidden` (yani ≥1024'te yok). Aradaki dar dizüstü aralığında sohbete giden HİÇBİR
 * yol kalmıyordu. Düğme yalnız o aralıkta görünüyor ve mobildeki sheet'i açıyor.
 *
 * ⚠️ `!wide` koşulu **JS'te**, `xl:hidden` sınıfıyla değil: sınıfla gizleseydik ≥1280'de de
 * mount olur ve `available` için gereken sorguya bağlanırdı — üstelik iki kapı (kart + düğme)
 * aynı anda var görünürdü. Eşik `Shell`in `wide` sabitiyle AYNI sayı olmak zorunda.
 * ⚠️ Sol menünün kendisi zaten `lg:block`, yani <1024'te hiç çizilmiyor — alt sınır oradan
 * geliyor, burada tekrarlanmıyor.
 */
function GlobalChatMenuButton() {
  const wide = useMediaQuery('(min-width: 1280px)');
  const { available, connected, toggle } = useGlobalChatConnection();
  if (!available || wide) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={connected}
      className={`mb-0.5 flex w-full items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5
        text-[13px] transition-colors ${
        connected
          ? 'border-strong bg-accent font-semibold text-on-accent shadow-[var(--bevel)]'
          : 'border-transparent text-ink hover:border-border hover:bg-raised'
      }`}
    >
      <MenuIcon id="mesaj" size={26} />
      <span className="flex-1 text-left">Genel Sohbet</span>
    </button>
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
    <Panel title={<><UserText>{a.name}</UserText> İttifağı</>}>
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

/**
 * ⭐ Sağ sütun — ittifak + **Genel Sohbet** (2026-08-10; yer tutucu "Yakında" kartının yerine).
 *
 * ⚠️ Sohbet kartı `available` false ise **hiç çizilmiyor** (boş bir kart bile değil): kullanıcı
 * şartı *"devre dışı olursa ekranın sağ tarafında genel sohbet kısmı hiç gözükmeyecek"*.
 * ⚠️ Bu sütunun kendisi zaten `wide` (≥1280) koşuluyla mount ediliyor, o yüzden kart burada
 * ikinci bir genişlik kontrolü yapmıyor — sağlayıcı da aynı eşiğe bakıyor ki dar ekranda sheet,
 * geniş ekranda kart olsun ve ikisi asla aynı anda mount olmasın.
 */
function SidePanels() {
  const { available } = useGlobalChatConnection();
  return (
    <div className="sticky top-3 space-y-3">
      <AlliancePanel />
      {available ? <GlobalChat variant="card" /> : null}
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
          /**
           * ⚠️ «Şehir» sekmesi şehir ALT ekranlarında da yanar (2026-08-09). `startsWith`
           * tek başına `/barracks`ı `/city` ile eşleştiremiyordu ve o beş sayfada alt barda
           * **hiçbir sekme aktif değildi**; geri butonu kalkınca "neredeyim" ipucu iyice
           * azalıyordu. `matchCityScreen` zaten sekme şeridinin de kullandığı eşleştirici.
           */
          const active = pathname.startsWith(t.to)
            || (t.to === '/city' && matchCityScreen(pathname) != null);
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
  /* ⭐ Genel Sohbet kısayolu (kullanıcı, 2026-08-10): *"mobilde sohbet Daha menüsü altından
     erişilebilir olsun"*. Kapalıyken madde HİÇ çizilmiyor — «tamamen devre dışı» şartı. */
  const globalChat = useGlobalChatConnection();

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
            {/* ⭐ Sohbet EN ÜSTTE: listedeki tek "aç/kapa" maddesi ve tek anlık iş; rotalar
                onun altında kalıyor. Açıkken maddenin kendisi «Sohbeti Kapat» oluyor —
                mobilde pencerenin açık olması sohbete bağlı olmak demek. */}
            {globalChat.available ? (
              <button type="button"
                onClick={() => { setOpen(false); globalChat.toggle(); }}
                className="flex w-full items-center gap-2 border-b border-on-panel-header/15
                  px-3 py-2.5 text-left text-[13px] text-on-panel-header hover:bg-raised/40">
                <MenuIcon id="mesaj" size={20} />
                {globalChat.connected ? 'Sohbeti Kapat' : 'Genel Sohbet'}
              </button>
            ) : null}
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
