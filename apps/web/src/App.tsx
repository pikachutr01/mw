import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getSession, onSessionChange } from './lib/api.ts';
import { connectRealtime } from './lib/realtime.ts';
import { ActiveCityProvider } from './lib/city-context.tsx';
import { ChatProvider } from './lib/chat-context.tsx';
import { ConfirmProvider } from './components/Modal.tsx';
import { OfflineBanner } from './components/OfflineBanner.tsx';
import { Shell } from './components/Shell.tsx';
import { Armies } from './screens/Armies.tsx';
import { Auth } from './screens/Auth.tsx';
import { AcademyScreen, BarracksScreen, BuildingsScreen, DefenseScreen } from './screens/City.tsx';
import { CityHub } from './screens/CityHub.tsx';
import { Messages } from './screens/Messages.tsx';
import { CommandScreen } from './screens/Command.tsx';
import { HelpScreen, OptionsScreen } from './screens/Placeholders.tsx';
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
      {/* Onay diyaloğu GLOBAL: her çağıran kendi diyaloğunu kursa metinler ve davranış ayrışırdı. */}
      <ConfirmProvider>
        <ActiveCityProvider>
          <BrowserRouter>
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
                <Route path="/messages" element={<Messages />} />
                {/* Sekme = rota: geri tuşu çalışsın, sıralamaya derin bağlantı verilebilsin. */}
                <Route path="/command" element={<CommandScreen />} />
                <Route path="/command/rankings" element={<CommandScreen />} />
                <Route path="/command/alliance" element={<CommandScreen />} />
                <Route path="/options" element={<OptionsScreen onLoggedOut={logout} />} />
                <Route path="/help" element={<HelpScreen />} />
                {/* Mobil "Şehir" ve "Daha" sekmeleri */}
                <Route path="/city" element={<CityHub />} />
                <Route path="/more" element={<OptionsScreen onLoggedOut={logout} />} />
                <Route path="*" element={<Navigate to="/armies" replace />} />
              </Routes>
            </Shell>
            </ChatProvider>
          </BrowserRouter>
        </ActiveCityProvider>
      </ConfirmProvider>
    </QueryClientProvider>
  );
}
