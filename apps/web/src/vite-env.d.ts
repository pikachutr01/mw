/// <reference types="vite/client" />
// Vite'ın istemci tipleri (`import.meta.env` vb.). Referans dosya olarak duruyor çünkü
// tsconfig'e `types` eklemek diğer global tipleri (Node, vitest) dışarıda bırakırdı.

/**
 * ⭐ Derleme anında `vite.config.ts` → `define` ile YERİNE KONAN sabitler (§sürüm damgası).
 * ⚠️ Bunlar çalışma zamanı değişkeni değil: `define` metni kaynağa gömüyor, yani üretim
 * paketinde `"0.1.0"` gibi düz bir dize olarak duruyorlar. Git yoksa ikisi de `'dev'`.
 */
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
