import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

/**
 * Geliştirmede API'ye **proxy** ile gidiyoruz (`/api` → :3002).
 * Böylece tarayıcı için her şey aynı köken: CORS ayarı gerekmez ve çerez tabanlı refresh
 * ileride sorunsuz çalışır. Üretimde nginx aynı işi yapıyor (§4.0).
 */
export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env['API_URL'] ?? 'http://localhost:3002', changeOrigin: true },
      '/healthz': { target: process.env['API_URL'] ?? 'http://localhost:3002', changeOrigin: true },
    },
  },
});
