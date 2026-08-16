import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { initInstanceId } from './lib/api.ts';
import './index.css';

/**
 * ⭐⭐ ÖRNEK KİMLİĞİ **İLK İSTEKTEN ÖNCE** ÇÖZÜLÜR (2026-08-16).
 *
 * Kimlik artık "başka canlı kopya var mı" sorusunu Web Locks'a soruyor ve o soru asenkron
 * (gerekçesi `lib/instance-id.ts`). Render'ı beklemeseydik `App` ilk sorgularını çözülmemiş
 * kimlikle atardı: sunucu onları ayrı bir kopya sanar ve tam da düzeltmeye çalıştığımız
 * çakışma modalını açardı.
 *
 * ⚠️ Bekleme ölçülemeyecek kadar kısa: `ifAvailable: true` kilidi beklemeden yanıtlıyor.
 * ⚠️ `catch` ŞART — kimlik çözülemezse (depo yok, kilit API'si yok) uygulama yine açılmalı;
 * `instanceId()` senkron yedeğine düşer. Kimlik yüzünden beyaz ekran, çözdüğümüz hatadan
 * çok daha kötü olurdu.
 */
void initInstanceId()
  .catch(() => { /* yedek yol devrede — `api.ts` → `fallbackInstanceId` */ })
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });

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
