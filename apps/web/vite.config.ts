import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

/**
 * Geliştirmede API'ye **proxy** ile gidiyoruz (`/api` → :3002).
 * Böylece tarayıcı için her şey aynı köken: CORS ayarı gerekmez ve çerez tabanlı refresh
 * ileride sorunsuz çalışır. Üretimde nginx aynı işi yapıyor (§4.0).
 */
const API = process.env['API_URL'] ?? 'http://localhost:3002';

const proxy = {
  '/api': { target: API, changeOrigin: true },
  '/healthz': { target: API, changeOrigin: true },
  // ⚠️ `ws: true` ŞART: WebSocket yükseltmesi (Upgrade) olmadan socket.io yalnız
  // polling'e düşer, üstelik dev'de sürekli "bağlantı koptu" gösterir.
  '/ws': { target: API, changeOrigin: true, ws: true },
};

export default defineConfig({
  plugins: [react(), tailwind()],
  server: { port: 5173, proxy },
  /**
   * ⚠️ **`preview` kendi proxy'sini ister** — `server.proxy`yi devralmaz. Bu blok olmadan
   * `vite preview` API'ye hiç ulaşamıyor, oyun boş açılıyordu.
   *
   * Bu sunucu PWA işleri için gerekli: service worker yalnız üretim derlemesinde kaydediliyor
   * (`main.tsx`), dolayısıyla `beforeinstallprompt` **`pnpm dev`de HİÇ ateşlenmez** ve
   * «Uygulamayı İndir» düğmesi orada hiç görünmez. Kurulabilirliği denemenin tek yolu:
   *   pnpm --filter @mobilwar/web build && pnpm --filter @mobilwar/web preview
   */
  preview: { port: 4173, proxy },
});
