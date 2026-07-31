import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './index.css';

/**
 * ⚠️ Service worker kaydı BİLEREK YOK (oyunda var). Panel kurulabilir/çevrimdışı olmamalı:
 * telefon ana ekranında duran bir yönetim kısayolu gereksiz bir saldırı yüzeyi, önbelleğe
 * alınmış bir yönetim ekranı ise bayat yetki gösterebilir.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
