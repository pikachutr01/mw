import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getSession, onSessionChange } from './lib/api.ts';
import { ActiveCityProvider } from './lib/city-context.tsx';
import { Shell } from './components/Shell.tsx';
import { Auth } from './screens/Auth.tsx';
import { City } from './screens/City.tsx';
import { Command } from './screens/Command.tsx';
import { World } from './screens/World.tsx';
import { Messages } from './screens/Messages.tsx';
import { More } from './screens/More.tsx';

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

  if (!session) {
    return <Auth onDone={() => setSessionState(getSession())} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ActiveCityProvider>
        <BrowserRouter>
          <Shell>
            <Routes>
              <Route path="/city" element={<City />} />
              <Route path="/command" element={<Command />} />
              <Route path="/world" element={<World />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/more" element={<More onLoggedOut={() => setSessionState(null)} />} />
              <Route path="*" element={<Navigate to="/city" replace />} />
            </Routes>
          </Shell>
        </BrowserRouter>
      </ActiveCityProvider>
    </QueryClientProvider>
  );
}
