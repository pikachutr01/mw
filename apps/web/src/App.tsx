import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getSession, onSessionChange } from './lib/api.ts';
import { connectRealtime } from './lib/realtime.ts';
import { ActiveCityProvider } from './lib/city-context.tsx';
import { ChatProvider } from './lib/chat-context.tsx';
import { ConfirmProvider } from './components/Modal.tsx';
import { MaintenanceCurtain } from './components/MaintenanceCurtain.tsx';
import { OfflineBanner } from './components/OfflineBanner.tsx';
import { NotifyProvider } from './components/Toaster.tsx';
import { Shell } from './components/Shell.tsx';
import { Armies } from './screens/Armies.tsx';
import { Auth } from './screens/Auth.tsx';
import { AcademyScreen, BarracksScreen, BuildingsScreen, DefenseScreen } from './screens/City.tsx';
import { CityHub } from './screens/CityHub.tsx';
import { ResetPasswordScreen, VerifyEmailScreen } from './screens/EmailActions.tsx';
import { Messages } from './screens/Messages.tsx';
import { CommandScreen } from './screens/Command.tsx';
import { HelpScreen, OptionsScreen } from './screens/Placeholders.tsx';
import { TempleScreen } from './screens/Temple.tsx';
import { World } from './screens/World.tsx';

/** Oturum kapısının ÖNÜNDEN geçen rotalar (e-posta bağlantıları, §9.2). */
const EMAIL_PATHS = new Set(['/verify-email', '/reset-password']);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Oyun verisi hızlı bayatlar; yeniden odaklanınca tazelemek doğru davranış.
      staleTime: 2000,
      retry: 1,
    },
  },
});

export function App() {
  const [session, setSessionState] = useState(getSession);

  // Oturum api.ts'te merkezî: refresh başarısız olunca oradan düşürülür ve burası haberdar olur
  // → token süresi dolan oyuncu boş ekranda kalmaz, giriş formuna döner.
  useEffect(() => onSessionChange(setSessionState), []);

  // Gerçek zamanlı bağlantı oturum varken açık durur; token yenilenince kendini yeniler.
  useEffect(() => {
    if (!session) return;
    return connectRealtime(queryClient);
  }, [session]);

  /**
   * ⭐ E-POSTA BAĞLANTILARI OTURUMSUZ AÇILIR (§9.2). Bağlantı çoğu zaman telefonun posta
   * uygulamasından, oturumu olmayan bir tarayıcıda açılıyor. Aşağıdaki oturum kapısından
   * ÖNCE ele alınmaları şart: sonra ele alınsalardı doğrulama "önce giriş yap" duvarına
   * çarpardı — oysa şifre sıfırlamanın amacı zaten giriş yapamayan kullanıcıya yardım etmek.
   */
  if (EMAIL_PATHS.has(window.location.pathname)) {
    return (
      <QueryClientProvider client={queryClient}>
        <OfflineBanner />
        <BrowserRouter>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailScreen />} />
            <Route path="/reset-password" element={<ResetPasswordScreen />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    );
  }

  if (!session) {
    return (
      <>
        {/* Çevrimdışı uyarısı GİRİŞ ekranında da gerekli: ağ yokken "giriş başarısız" mesajı
            oyuncuya parolasını yanlış girdiğini düşündürüyordu. */}
        <OfflineBanner />
        <Auth onDone={() => setSessionState(getSession())} />
      </>
    );
  }

  const logout = (): void => setSessionState(null);

  return (
    <QueryClientProvider client={queryClient}>
      <OfflineBanner />
      {/* ⭐ BAKIM PERDESİ (admin Faz 2) — rotaların ve `Shell`in DIŞINDA: sayfa değiştirmek onu
          kapatamamalı. `OfflineBanner` ile aynı katman mantığı; ikisi aynı anda görünebilir
          (bakım sırasında internet de gidebilir) ve şerit perdenin ÜSTÜNDE kalır (z-50 vs z-60
          değil — şerit sayfanın tepesinde dar bir bant, perde ortada bir kutu). */}
      <MaintenanceCurtain />
      {/* Onay diyaloğu GLOBAL: her çağıran kendi diyaloğunu kursa metinler ve davranış ayrışırdı. */}
      <ConfirmProvider>
        <ActiveCityProvider>
          <BrowserRouter>
            {/* ⭐ Bildirim şeridi de rotaların DIŞINDA (§7.2): gelen saldırı toast'ı, oyuncu
                hangi ekranda olursa olsun görünmeli — sayfa değişimi onu düşürmemeli.
                `BrowserRouter` İÇİNDE olmak zorunda: tıklanınca `useNavigate` ile gidiyor. */}
            <NotifyProvider>
            {/* ⭐ Sohbet penceresi ROTALARIN DIŞINDA: sayfa değişince kapanmaz, oyuncu
                mesajlaşırken oyununu oynamaya devam eder (§13.12.5). */}
            <ChatProvider>
            <Shell>
              <Routes>
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
                <Route path="/options" element={<OptionsScreen onLoggedOut={logout} />} />
                <Route path="/help" element={<HelpScreen />} />
                {/* Mobil "Şehir" ve "Daha" sekmeleri */}
                <Route path="/city" element={<CityHub />} />
                <Route path="/more" element={<OptionsScreen onLoggedOut={logout} />} />
                <Route path="*" element={<Navigate to="/armies" replace />} />
              </Routes>
            </Shell>
            </ChatProvider>
            </NotifyProvider>
          </BrowserRouter>
        </ActiveCityProvider>
      </ConfirmProvider>
    </QueryClientProvider>
  );
}
