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
 * Dev'de 5174 (oyun 5173'te). Üretimde **`admin.mobilwar.com`** alt alanı, ayrı nginx `server`
 * bloğu (`ops/nginx/admin.mobilwar.com.conf`).
 */
const API = process.env['API_URL'] ?? 'http://localhost:3002';

/** Gerekçe `apps/web/vite.config.ts`te: yukarı akış düşünce 500 değil 503 dönmeli. */
const onProxyError = (proxy: { on: (e: string, fn: (...a: never[]) => void) => void }): void => {
  proxy.on('error', ((_err: Error, _req: unknown, res: {
    writableEnded?: boolean;
    writeHead?: (code: number, headers: Record<string, string>) => void;
    end?: (body: string) => void;
  }) => {
    if (!res || typeof res.writeHead !== 'function' || res.writableEnded) return;
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end?.(JSON.stringify({ statusCode: 503, code: 'api_down', message: 'API şu an kapalı.' }));
  }) as never);
};

export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: API, changeOrigin: true, configure: onProxyError },
      '/healthz': { target: API, changeOrigin: true, configure: onProxyError },
    },
  },
});
