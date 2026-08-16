/**
 * ⭐ MİSAFİR KABUĞU (kullanıcı, 2026-08-02) — hesabı olmayan ziyaretçinin gördüğü çerçeve.
 *
 * ⚠️ **Neden `Shell`i "oturum bilir" yapmak yerine AYRI bir bileşen:**
 *  1. **Kancalar koşullu olamaz.** `SideMenu` (`Shell.tsx:360`) ve `BottomBar` (`:495`) daha ilk
 *     satırlarında `useMessages`/`useChatConversations`/`useMovements`/`useActiveCity`/`useCity`
 *     çağırıyor. "Oturum varsa çağır" diye bir şey yok; yine iki ayrı bileşen gerekirdi.
 *  2. **Misafir düzeni alt küme değil, FARKLI bir düzen:** üst bar var; sol menü, sağ panel ve
 *     mobil alt bar yok. Ortak kod ~26 satırlık, kancasız bir ızgaradan ibaret.
 *  3. Asıl risk oturumlu deneyimin bozulması. Bu yaklaşımda `Shell.tsx`e hiç dokunulmadı —
 *     ortak `MenuIcon` `ui.tsx`te duruyor (oraya 2026-08-02'de taşındı).
 *
 * ⚠️ Burada **hiçbir oyun sorgusu yok**. Misafirde 401 yağmuru olmamasının ikinci güvencesi
 * `queries.ts`teki `useAuthed()` kapısı (§9.3.3); bu bileşen o kapıya güvenmiyor, zaten
 * hiçbirini çağırmıyor.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AuthModal, type AuthMode } from './AuthModal.tsx';
import { Button, MenuIcon } from './ui.tsx';

/**
 * Misafirin gezebildiği ekranlar. Geri kalan her şey oturum istiyor.
 *
 * ⭐ **Destek misafire de açık** (kullanıcı şartı, 2026-08-14): *"hem giriş yapmış hem de
 * yapmamış kullanıcılar için kullanılabilir olmalı."* Zaten en çok ihtiyaç duyan kişi giriş
 * YAPAMAYAN kişidir — kapıyı oturumun arkasına koymak, tam da yardım gerektiren durumu
 * kapsam dışı bırakırdı.
 */
const GUEST_MENU = [
  { to: '/simulate', label: 'Simülatör', icon: 'simulator' },
  { to: '/help', label: 'Yardım', icon: 'yardim' },
  { to: '/destek', label: 'Destek', icon: 'destek' },
  /**
   * ⭐ Değişiklik günlüğü **misafire de açık** (2026-08-16) — Destek'le aynı gerekçe:
   * uç zaten kimlik istemiyor ve oyuna dışarıdan bakan biri için *"denge son zamanlarda ne
   * yönde değişti"* tam da karar verdiren bilgi. Rota misafir dalında mount edilmişti;
   * menüye konmasaydı **adresi bilmeyen hiç kimse ulaşamazdı**.
   */
  { to: '/degisiklikler', label: 'Değişiklikler', icon: 'yardim' },
] as const;

const GUEST_TITLE: [string, string][] = [
  ['/simulate', 'Simülatör'],
  ['/help', 'Yardım'],
  ['/destek', 'Destek'],
  ['/degisiklikler', 'Değişiklikler'],
];

/**
 * Giriş modalını **her misafir ekranından** açabilmek için. Ana sayfadaki üç ayrı «Kayıt ol»
 * düğmesi ile üst bardaki düğme aynı tek örneği açıyor — `ConfirmProvider` deseninin aynısı.
 */
const AuthModalCtx = createContext<(mode?: AuthMode) => void>(() => {});
export const useAuthModal = (): ((mode?: AuthMode) => void) => useContext(AuthModalCtx);

export function GuestShell({ children }: { children: ReactNode }) {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const { pathname } = useLocation();

  /**
   * ⚠️ Pencere başlığını misafirde BURASI yönetiyor: oturumlu tarafta bu işi `InfoBar`
   * (`Shell.tsx:190`) yapıyor ama o mount olmuyor. İki sahip hiçbir zaman aynı anda yaşamıyor.
   */
  useEffect(() => {
    const page = GUEST_TITLE.find(([p]) => pathname.startsWith(p))?.[1];
    document.title = page ? `${page} · MobilWar` : 'MobilWar';
  }, [pathname]);

  return (
    <AuthModalCtx.Provider value={(mode = 'login') => setAuthMode(mode)}>
      <div className="flex min-h-full flex-col bg-bg">
        {/* ── ÜST BAR ─────────────────────────────────────────────────────────────
            `z-20`: merdivenin en altı (alt bar 20 < sohbet 30 < modal 40 < toast 50 <
            ipucu 60 — `Toaster.tsx:124`). Giriş modalı bunun üstünde açılmalı. */}
        <header className="tex tex-header sticky top-0 z-20 border-b-2 border-strong bg-panel-header">
          {/**
            * ⚠️⚠️ **TELEFONDA AÇILIR MENÜ, MASAÜSTÜNDE SATIR İÇİ** (kullanıcı, 2026-08-16).
            *
            * Bar tek sıraydı ve dar ekranda taşıyordu: logo (~110px) + menü + iki düğme
            * 375px'e sığmıyor, «Kayıt ol» ekrandan taşıyordu. Menüye dördüncü madde
            * (Değişiklikler) eklenince görünür hâle geldi ama sorun ondan ÖNCE de vardı.
            *
            * Önce sarmalama denendi (menü kendi satırına iniyordu); taşma bitti ama bar iki
            * kat yükseldi ve üst bölge hantallaştı — kullanıcı beğenmedi. Şimdiki çözüm
            * **oturumlu kabuğun `MoreSheet` deseninin aynısı**: telefonda maddeler tek bir
            * «Menü» düğmesinin altında toplanıyor, `sm:`den itibaren satır içi menü geri
            * geliyor ve masaüstünde hiçbir şey değişmiyor.
            */}
          <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-3 py-2 sm:gap-4">
            {/*
              ⚠️ Mobil ölçüler 2026-08-02'de büyütüldü (kullanıcı: «çok küçük kalıyor»).
              Telefonda etiketler gizli olduğu için (`hidden sm:inline`) logo ve ikonlar
              barın TEK görsel içeriği; masaüstündeki ölçüler orada fazla ufak kalıyordu.
            */}
            <NavLink to="/" className="shrink-0">
              <img src="/assets/ui/logo.png" alt="MobilWar" width={140} height={56}
                className="icon-shadow h-11 w-auto object-contain sm:h-12" />
            </NavLink>

            {/* Masaüstü: satır içi menü. Telefonda gizli — yerini «Menü» düğmesi alıyor. */}
            <nav className="hidden items-center gap-4 sm:flex">
              {GUEST_MENU.map((m) => (
                <NavLink key={m.to} to={m.to}
                  className={({ isActive }) => `flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)]
                    border px-2 py-1 text-[13px] transition-colors ${
                    isActive
                      ? 'border-strong bg-accent font-semibold text-on-accent shadow-[var(--bevel)]'
                      : 'border-transparent text-on-panel-header hover:border-border hover:bg-raised/40'
                  }`}>
                  <MenuIcon id={m.icon} size={20} className="h-5 w-5" />
                  <span>{m.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <GuestMenuSheet />
              <Button size="sm" variant="ghost" onClick={() => setAuthMode('login')}>Giriş yap</Button>
              <Button size="sm" onClick={() => setAuthMode('register')}>Kayıt ol</Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-4 sm:px-4">{children}</main>

        <footer className="mx-auto w-full max-w-5xl px-3 py-4 text-[11px] text-muted sm:px-4">
          <NavLink to="/help" className="underline hover:text-ink">Yardım</NavLink>
          <span className="mx-2">·</span>
          {/* Google Play'in şart koştuğu herkese açık hesap silme sayfası (§9.2c). */}
          <NavLink to="/hesap-sil" className="underline hover:text-ink">Hesap silme</NavLink>
        </footer>
      </div>

      {authMode ? <AuthModal mode={authMode} onClose={() => setAuthMode(null)} /> : null}
    </AuthModalCtx.Provider>
  );
}

/** Rota ağacında kullanılan sarmalayıcı (pathless layout route). */
export function GuestLayout(): React.ReactElement {
  return <GuestShell><Outlet /></GuestShell>;
}

/**
 * ⭐ MİSAFİR «MENÜ» — telefonda aşağı açılan liste (kullanıcı, 2026-08-16).
 *
 * ⚠️ Deseni `Shell.tsx`teki `MoreSheet`ten alıyor ve üç kuralını aynen taşıyor:
 *   1. **Dışarı dokunuşla kapanır** — açıkken ekranın kalanı tıklama kalkanı olur.
 *   2. **Rota değişince kapanır** — aksi hâlde yeni sayfanın üstünde asılı kalır.
 *   3. `z` merdiveni bozulmaz: kalkan üst barın (`z-20`) içinde, liste onun üstünde (`z-30`),
 *      giriş modalı (`z-40`) ikisinin de üstünde kalır (merdiven `Toaster.tsx:124`).
 *
 * ⚠️ `sm:hidden` — masaüstünde satır içi menü zaten görünüyor; ikisi aynı anda çizilirse
 * aynı bağlantılar iki kez sunulur.
 */
function GuestMenuSheet(): ReactNode {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div className="relative sm:hidden">
      {open ? (
        <button type="button" aria-label="Kapat" onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 cursor-default bg-black/30" />
      ) : null}

      {open ? (
        <div className="absolute top-full right-0 z-30 mt-1 w-44 overflow-hidden
          rounded-[var(--radius-md)] border-2 border-strong bg-panel-header shadow-[var(--mw-shadow-md)]">
          {GUEST_MENU.map((m) => (
            <NavLink key={m.to} to={m.to}
              className={({ isActive }) => `flex items-center gap-2 border-b
                border-on-panel-header/15 px-3 py-2.5 text-[13px] last:border-b-0 ${
                isActive
                  ? 'bg-accent font-semibold text-on-accent'
                  : 'text-on-panel-header hover:bg-raised/40'
              }`}>
              <MenuIcon id={m.icon} size={20} />
              {m.label}
            </NavLink>
          ))}
        </div>
      ) : null}

      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        aria-label="Menü"
        className={`relative z-30 flex items-center gap-1.5 rounded-[var(--radius-sm)] border
          px-2.5 py-1.5 text-[13px] transition-colors ${
          open
            ? 'border-strong bg-accent font-semibold text-on-accent shadow-[var(--bevel)]'
            : 'border-transparent text-on-panel-header hover:border-border hover:bg-raised/40'
        }`}>
        <MenuIcon id="secenekler" size={26} className="h-[26px] w-[26px]" />
      </button>
    </div>
  );
}
