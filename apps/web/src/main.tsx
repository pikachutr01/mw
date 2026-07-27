import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * PWA kaydı. **Yalnız üretim derlemesinde**: dev sunucusunda service worker, Vite'ın sıcak
 * yenilemesiyle (HMR) çakışıyor ve "kod değişti ama ekran değişmedi" diye saatler yakan bir
 * hata sınıfı doğuruyor. Kayıt `load` sonrasına ertelenir ki ilk boyamayla yarışmasın.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Kayıt başarısız olursa oyun normal web sayfası olarak çalışmaya devam eder; kurulabilirlik
      // bir kolaylıktır, koşul değil.
    });
  });
}
