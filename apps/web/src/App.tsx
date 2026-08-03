import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getSession, onSessionChange } from './lib/api.ts';
import { connectRealtime } from './lib/realtime.ts';
import { ActiveCityProvider } from './lib/city-context.tsx';
import { ChatProvider } from './lib/chat-context.tsx';
import { ConfirmProvider } from './components/Modal.tsx';
import { MaintenanceCurtain } from './components/MaintenanceCurtain.tsx';
import { OfflineBanner } from './components/OfflineBanner.tsx';
import { SessionConflictGate } from './components/SessionConflictGate.tsx';
import { NotifyProvider } from './components/Toaster.tsx';
import { Shell } from './components/Shell.tsx';
import { GuestLayout } from './components/GuestShell.tsx';
import { Armies } from './screens/Armies.tsx';
import { AcademyScreen, BarracksScreen, BuildingsScreen, DefenseScreen } from './screens/City.tsx';
import { CityHub } from './screens/CityHub.tsx';
import { DeleteAccountScreen } from './screens/DeleteAccount.tsx';
import { ResetPasswordScreen, VerifyEmailScreen } from './screens/EmailActions.tsx';
import { Messages } from './screens/Messages.tsx';
import { CommandScreen } from './screens/Command.tsx';
import { Landing } from './screens/Landing.tsx';
import { OptionsScreen } from './screens/Placeholders.tsx';
import { HelpScreen } from './screens/Help.tsx';
import { SimulateScreen } from './screens/Simulate.tsx';
import { TempleScreen } from './screens/Temple.tsx';
import { World } from './screens/World.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Oyun verisi hızlı bayatlar; yeniden odaklanınca tazelemek doğru davranış.
      staleTime: 2000,
      retry: 1,
    },
  },
});

/**
 * ⭐ E-POSTA BAĞLANTILARI — kabuğun DIŞINDA, oturumlu da oturumsuz da açılır (§9.2).
 * Bağlantı çoğu zaman telefonun posta uygulamasından, oturumu olmayan bir tarayıcıda açılıyor;
 * "önce giriş yap" duvarına çarpmamalı — şifre sıfırlamanın amacı zaten giriş yapamayana
 * yardım etmek. `/hesap-sil` jetonsuz da açılabilir (§9.2c, Google Play şartı).
 *
 * ⚠️ Bunlar **gerçek rota** oldu (2026-08-02). Eskiden `window.location.pathname` okunup erken
 * dönülüyordu ve o dalın kendi `<Routes>`'unda **catch-all yoktu**: `EmailActions`'taki
 * «Oyuna dön» (`navigate('/armies')`) ve jetonsuz şifre sıfırlamanın `navigate('/')` çağrısı
 * hiçbir rotayla eşleşmiyor, ekran **bomboş** kalıyordu. Yönlendiriciyi oturum dalının üstüne
 * çıkarmak bu iki hatayı da kapattı.
 */
const emailRoutes = [
  <Route key="verify" path="/verify-email" element={<VerifyEmailScreen />} />,
  <Route key="reset" path="/reset-password" element={<ResetPasswordScreen />} />,
  <Route key="delete" path="/hesap-sil" element={<DeleteAccountScreen />} />,
];

export function App() {
  const [session, setSessionState] = useState(getSession);

  // Oturum api.ts'te merkezî: refresh başarısız olunca oradan düşürülür ve burası haberdar olur
  // → token süresi dolan oyuncu boş ekranda kalmaz, giriş formuna döner.
  useEffect(() => onSessionChange(setSessionState), []);

  /**
   * ⚠️ OTURUM DÜŞÜNCE ÖNBELLEK TEMİZLENİR. Yönlendirici artık oturum dalının ÜSTÜNDE olduğu
   * için giriş/çıkış tam sayfa yenilemesi yapmıyor; temizlenmezse aynı sekmede başka bir
   * hesapla girildiğinde öncekinin şehirleri bir an görünürdü. Aktif şehir de bu yüzden
   * siliniyor: `mw-active-city` çıkıştan sonra kalıyor ve bir sonraki oyuncuya ait olmayan
   * bir şehri seçili gösteriyordu.
   *
   * ⚠️ Abonelik `api.ts` üzerinden: başarısız refresh de (`setSession(null)`) buradan geçiyor,
   * yani menüden çıkış kadar "token öldü" hâli de kapsanıyor.
   */
  useEffect(() => onSessionChange((s) => {
    if (s) return;
    queryClient.clear();
    localStorage.removeItem('mw-active-city');
  }), []);

  // Gerçek zamanlı bağlantı oturum varken açık durur; token yenilenince kendini yeniler.
  useEffect(() => {
    if (!session) return;
    return connectRealtime(queryClient);
  }, [session]);

  /**
   * ⭐ SAĞLAYICI SIRASI (2026-08-02): `QueryClientProvider` · `OfflineBanner` ·
   * `ConfirmProvider` · `BrowserRouter` **oturum dalının üstünde**. Sebep misafir modu: giriş
   * yapmamış ziyaretçinin de yönlendiriciye ve sorgu istemcisine ihtiyacı var.
   *
   * ⚠️ Oyuna özgü sağlayıcılar (`ActiveCityProvider`, `ChatProvider`, `MaintenanceCurtain`)
   * bilerek AŞAĞIDA, `AuthedLayout` içinde: üçü de mount olur olmaz oturum isteyen istek
   * atıyor. Misafir ağacında mount olsalardı 401 yağmuru üretirlerdi.
   */
  return (
    <QueryClientProvider client={queryClient}>
      <OfflineBanner />
      {/* ⭐ Tek cihaz kapısı EN ÜSTTE ve oturum dalının DIŞINDA: çakışma anında oturum hâlâ
          geçerli (yalnız sahiplik kaybedildi), yani `session` dolu ve oyun ağacı çiziliyor.
          Kapıyı içeriye koysaydık her ekranın ayrıca onu çizmesi gerekirdi. */}
      <SessionConflictGate />
      {/* Onay diyaloğu GLOBAL: her çağıran kendi diyaloğunu kursa metinler ve davranış ayrışırdı. */}
      <ConfirmProvider>
        <BrowserRouter>
          {session
            ? <AuthedApp />
            : <GuestApp />}
        </BrowserRouter>
      </ConfirmProvider>
    </QueryClientProvider>
  );
}

/** Oturumlu ağaç — rota tablosu tur öncesiyle BİREBİR aynı. */
function AuthedApp() {
  return (
    <Routes>
      {emailRoutes}
      <Route element={<AuthedLayout />}>
        {/* ⭐ Giriş sonrası HER KOŞULDA Ordular (kullanıcı kararı): oyun zamanlanmış
            olaylar üzerine kurulu, oyuncunun ilk sorusu daima "şu an ne oluyor?". */}
        <Route path="/armies" element={<Armies />} />
        <Route path="/barracks" element={<BarracksScreen />} />
        <Route path="/buildings" element={<BuildingsScreen />} />
        <Route path="/defense" element={<DefenseScreen />} />
        <Route path="/academy" element={<AcademyScreen />} />
        <Route path="/temple" element={<TempleScreen />} />
        <Route path="/world" element={<World />} />
        {/* ⭐ Derin bağlantı (§13.16): paylaşılabilir adres + geri tuşu. "Dünyada Bul"
            (orijinal `grDny.do?o=`) buraya gidiyor. */}
        <Route path="/world/:k/:d" element={<World />} />
        <Route path="/messages" element={<Messages />} />
        {/* Sekme = rota: geri tuşu çalışsın, sıralamaya derin bağlantı verilebilsin. */}
        <Route path="/command" element={<CommandScreen />} />
        <Route path="/command/rankings" element={<CommandScreen />} />
        <Route path="/command/alliance" element={<CommandScreen />} />
        <Route path="/command/search" element={<CommandScreen />} />
        <Route path="/options" element={<OptionsScreen />} />
        {/* Sekme = rota (aynı desen `/command`ta): geri tuşu ve derin bağlantı çalışsın. */}
        <Route path="/help" element={<HelpScreen />} />
        <Route path="/help/sefer" element={<HelpScreen />} />
        <Route path="/simulate" element={<SimulateScreen />} />
        {/* Mobil "Şehir" ve "Daha" sekmeleri */}
        <Route path="/city" element={<CityHub />} />
        <Route path="/more" element={<OptionsScreen />} />
        <Route path="*" element={<Navigate to="/armies" replace />} />
      </Route>
    </Routes>
  );
}

/**
 * Oyun kabuğu + yalnız oturumluyken anlamlı sağlayıcılar.
 *
 * ⚠️ `MaintenanceCurtain` rotaların ve `Shell`in DIŞINDA: sayfa değiştirmek onu kapatamamalı.
 * ⚠️ `NotifyProvider` `BrowserRouter` İÇİNDE olmak zorunda (`useNavigate`); gelen saldırı
 *    toast'ı oyuncu hangi ekranda olursa olsun görünmeli (§7.2).
 * ⚠️ `ChatProvider` rotaların dışında: sayfa değişince sohbet penceresi kapanmaz (§13.12.5).
 */
function AuthedLayout() {
  return (
    <>
      <MaintenanceCurtain />
      <ActiveCityProvider>
        <NotifyProvider>
          <ChatProvider>
            <Shell><Outlet /></Shell>
          </ChatProvider>
        </NotifyProvider>
      </ActiveCityProvider>
    </>
  );
}

/**
 * Misafir ağacı — ana sayfa · simülatör · yardım. Giriş/kayıt **modal** (`AuthModal`), ayrı
 * sayfa değil; `GuestShell` onu tek örnek olarak tutuyor.
 *
 * ⚠️ Oyun rotaları burada YOK. Bir misafir `/armies`e derin bağlantıyla gelirse catch-all onu
 * ana sayfaya alır — oturum açtıktan sonra o adrese gitmesi gerektiğini hatırlamıyoruz;
 * gerekirse ayrı bir "geri dönülecek adres" işi.
 *
 * ⚠️ E-posta rotaları burada da var ve **kabuğun dışında**: bağlantıya tıklayanın oturumu
 * çoğu zaman yok ve o sayfalarda üst bar/menü işe yaramaz.
 */
function GuestApp() {
  return (
    <Routes>
      {emailRoutes}
      <Route element={<GuestLayout />}>
        <Route path="/" element={<Landing />} />
        {/* ⭐ Simülatör oturumsuz çalışıyor: uç `OptionalAuthGuard` ile korunuyor ve kimlik
            yoksa dünya-0 denge katmanına düşüyor (`simulate.controller.ts:38`). */}
        <Route path="/simulate" element={<SimulateScreen />} />
        <Route path="/help" element={<HelpScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
