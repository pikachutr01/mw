import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

/**
 * ⭐ YÖNETİM PANELİ — `apps/web`ten TAMAMEN AYRI bir derleme hedefi.
 *
 * Tek sebebi var: oyuncunun indirdiği pakete admin kodundan **tek bayt** girmesin. Aynı SPA
 * içinde tembel yüklenen bir parça olsaydı kod yine dağıtılan pakette dururdu (chunk adı
 * manifest'ten okunabilir); ayrı derleme bunu yapısal olarak imkânsız kılıyor.
 *
 * ⚠️ `apps/web`ten HİÇBİR ŞEY import edilmez. Ortak olan tek şey paketler
 * (`contracts`, `catalog`, `design-tokens`) — ters bağımlılık yok.
 *
 * Dev'de 5174 (oyun 5173'te). Üretimde `yonetim.<alan>` alt alanı, ayrı nginx `server` bloğu.
 */
const API = process.env['API_URL'] ?? 'http://localhost:3002';

export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/healthz': { target: API, changeOrigin: true },
    },
  },
});
