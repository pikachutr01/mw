import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.tsx';
import './index.css';

/**
 * ⚠️ Service worker kaydı BİLEREK YOK (oyunda var). Panel kurulabilir/çevrimdışı olmamalı:
 * telefon ana ekranında duran bir yönetim kısayolu gereksiz bir saldırı yüzeyi, önbelleğe
 * alınmış bir yönetim ekranı ise bayat yetki gösterebilir.
 */

/**
 * ⭐ REACT QUERY (panel 2. nesil). Paket Faz 0'dan beri `package.json`'da duruyordu ama hiç
 * kullanılmamıştı; sekiz ekran `useState + useEffect + fetch` üçlüsünü ve her mutasyondan
 * sonra elle `await load()` çağrısını **yirmi yerde** tekrar ediyordu.
 *
 * ⚠️ `retry: false` — bir yönetim panelinde başarısız isteği sessizce tekrarlamak yanlış:
 * 403 "yükseltme gerekli" demektir ve tekrarlanınca kullanıcı diyaloğu geç görür.
 * ⚠️ `refetchOnWindowFocus: false` — sekmeye her dönüşte on sorgu atmak canlı bir oyun
 * sunucusunda gereksiz yük.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5_000 },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/*
      ⭐ ROUTER — sekme durumu artık URL'de. Öncesinde `useState<Tab>` idi ve bunun üç somut
      bedeli vardı: derin bağlantı yok ("şu oyuncunun künyesine bak" linki paylaşılamıyor),
      tarayıcı geri tuşu çalışmıyor, yenilemede ilk sekmeye dönülüyor.
    */}
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
