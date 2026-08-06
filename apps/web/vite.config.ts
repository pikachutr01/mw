import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

/**
 * ⭐ SÜRÜM DAMGASI (kullanıcı kararı, 2026-08-06): **kökte tek dosya + kısa git SHA**.
 *
 * Sürüm kök `package.json`da elle bumplanıyor (tek kaynak); SHA derleme anında okunuyor.
 * İkisi birlikte "hangi kod canlıda" sorusunu tek bakışta cevaplıyor — sürüm insan için
 * (büyüklük), SHA makine için (tam olarak hangi commit).
 *
 * ⚠️ **İkisi de PATLAMAMALI.** Derleme git deposu olmayan bir yerde (Docker `COPY`, indirilmiş
 * tarball, CI'ın shallow checkout'u) koşabilir; `git` çağrısı orada hata verir. Kırılmış bir
 * derleme, eksik bir sürüm etiketinden çok daha pahalı → `try/catch` ve `'dev'` yedeği.
 */
function readVersion(): string {
  try {
    return String(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version ?? 'dev');
  } catch {
    return 'dev';
  }
}

function readCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

/**
 * Geliştirmede API'ye **proxy** ile gidiyoruz (`/api` → :3002).
 * Böylece tarayıcı için her şey aynı köken: CORS ayarı gerekmez ve çerez tabanlı refresh
 * ileride sorunsuz çalışır. Üretimde nginx aynı işi yapıyor (§4.0).
 */
const API = process.env['API_URL'] ?? 'http://localhost:3002';

/**
 * ⭐ YUKARI AKIŞ DÜŞÜNCE **503**, 500 DEĞİL (2026-08-03).
 *
 * Vite'ın varsayılan proxy hata işleyicisi API'ye bağlanamayınca ham **500** döndürüyordu.
 * API dev'de her yeniden derlemede birkaç saniye kapalı kalıyor; o aralıkta uçuşta olan bütün
 * yoklama istekleri (`/messages`, `/missions`, `/cities/:id`, `/chat/conversations`) aynı anda
 * `:5173/api/... 500` diye konsola düşüyordu. Sunucuda hiçbir hata yoktu — hata Vite'ındı.
 *
 * 500 «sunucu bozuldu» demek ve istemcinin yapabileceği bir şey yok; 503 «şu an yok, birazdan
 * dene» demek ve `apps/web/src/lib/api.ts` bunu **tek sefer sessizce tekrarlıyor**. Böylece
 * yeniden başlatma penceresi kullanıcıya hiç görünmüyor.
 */
const onProxyError = (proxy: { on: (e: string, fn: (...a: never[]) => void) => void }): void => {
  proxy.on('error', ((_err: Error, _req: unknown, res: {
    writableEnded?: boolean;
    writeHead?: (code: number, headers: Record<string, string>) => void;
    end?: (body: string) => void;
  }) => {
    // WebSocket yükseltmesinde `res` bir soket olur; `writeHead` yoktur, dokunulmaz.
    if (!res || typeof res.writeHead !== 'function' || res.writableEnded) return;
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end?.(JSON.stringify({ statusCode: 503, code: 'api_down', message: 'API şu an kapalı.' }));
  }) as never);
};

const proxy = {
  '/api': { target: API, changeOrigin: true, configure: onProxyError },
  '/healthz': { target: API, changeOrigin: true, configure: onProxyError },
  // ⚠️ `ws: true` ŞART: WebSocket yükseltmesi (Upgrade) olmadan socket.io yalnız
  // polling'e düşer, üstelik dev'de sürekli "bağlantı koptu" gösterir.
  // ⚠️ Buraya `configure` KONMAZ: yükseltme hatasında elde HTTP yanıtı değil çıplak soket olur,
  //    503 yazılacak yer yoktur. Kopmayı zaten socket.io'nun kendi yeniden bağlanması çözüyor.
  '/ws': { target: API, changeOrigin: true, ws: true },
};

export default defineConfig({
  plugins: [react(), tailwind()],
  /**
   * ⚠️ `JSON.stringify` ŞART: `define` ham metin YERİNE KOYUYOR, değer geçirmiyor.
   * Tırnaksız yazılsaydı `0.1.0` kaynağa çıplak girer ve sözdizimi hatası olurdu.
   */
  define: {
    __APP_VERSION__: JSON.stringify(readVersion()),
    __APP_COMMIT__: JSON.stringify(readCommit()),
  },
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
