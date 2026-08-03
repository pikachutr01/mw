/**
 * ── BİLDİRİM ROZETİ ÜRETİCİSİ ────────────────────────────────────────────────
 *
 * `public/badge-96.png` üretir: **96×96, beyaz siluet, şeffaf zemin**.
 *
 * ⭐ NEDEN BİR SCRIPT — Android bildirim rozeti (`sw.js` · `badge`) görselin **yalnız alfa
 * kanalını** kullanır; renk ve zemin tamamen atılır. Elle çizilmiş renkli bir PNG orada içi
 * dolu bir leke olarak çıkar (2026-08-03'te tam bu yaşandı). Burada üretilen dosya tanım
 * gereği doğru: renk sabit beyaz, şekil yalnız alfada.
 *
 * Kullanım (`apps/web` içinden):
 *   node scripts/badge-png.mjs
 *
 * ⚠️ Bağımlılık YOK — PNG kodlayıcı elle yazılı (zlib Node'da zaten var). Bir görsel
 * kütüphanesi (sharp/canvas) tek bir 96 px'lik dosya için derleme zinciri ve platform
 * bağımlılığı getirirdi.
 *
 * ⚠️ Şekil burada **geometrik olarak** tanımlı, SVG'den okunmuyor: rastgele bir SVG'yi
 * çizmek gerçek bir renderer ister. Kendi ikonunu koymak istersen `public/badge.svg`
 * dosyasını bırak ve bu script yerine onu 96×96 beyaz siluet PNG'ye dönüştür.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SIZE = 96;
/** Süper örnekleme: kenarlar 96 px'te tırtıklı görünmesin (rozet küçük çizilir, kenar önemli). */
const SS = 4;

/**
 * ⭐ ŞEKİL: kule/kale silueti — oyunun kendi dili (şehir simgesi de kale).
 *
 * ⚠️ **İnce çizgi YOK, dolu siluet.** Android rozeti ~24 px'e küçültüyor; 1-2 px'lik konturlar
 * o ölçekte kayboluyor ve geriye tanınmaz bir leke kalıyor. Bütün detaylar kütlesel.
 *
 * ⚠️ Kenarlarda ~%10 iç boşluk bırakılıyor: tarayıcı rozeti kendi dairesel/kare maskesine
 * oturtuyor ve tam kenara dayanan bir şekil kırpılıyor.
 *
 * Koordinatlar 0..1 aralığında, sol üst köşe (0,0).
 */
function inside(x, y) {
  // Gövde: ortada geniş bir kule.
  if (x >= 0.28 && x <= 0.72 && y >= 0.34 && y <= 0.90) return true;
  // Yan kuleler.
  if ((x >= 0.10 && x <= 0.30) && y >= 0.44 && y <= 0.90) return true;
  if ((x >= 0.70 && x <= 0.90) && y >= 0.44 && y <= 0.90) return true;
  // Mazgallar (üst diş sırası) — üç kütle, aralarında boşluk.
  const mazgal = (x0, x1, yTop) => x >= x0 && x <= x1 && y >= yTop && y < 0.44;
  if (mazgal(0.10, 0.22, 0.30)) return true;
  if (mazgal(0.30, 0.42, 0.22)) return true;
  if (mazgal(0.44, 0.56, 0.14)) return true;   // orta diş en yüksek
  if (mazgal(0.58, 0.70, 0.22)) return true;
  if (mazgal(0.78, 0.90, 0.30)) return true;
  return false;
}

/** RGBA8 tampon: renk sabit beyaz, bilgi yalnız alfada. */
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let p = 0;
for (let py = 0; py < SIZE; py++) {
  raw[p++] = 0;                                   // filtre baytı: None
  for (let px = 0; px < SIZE; px++) {
    let hit = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / SIZE;
        const y = (py + (sy + 0.5) / SS) / SIZE;
        if (inside(x, y)) hit++;
      }
    }
    const a = Math.round((hit / (SS * SS)) * 255);
    raw[p++] = 255; raw[p++] = 255; raw[p++] = 255; raw[p++] = a;
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return c ^ -1;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;    // bit derinliği
ihdr[9] = 6;    // renk tipi: RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = fileURLToPath(new URL('../public/badge-96.png', import.meta.url));
writeFileSync(out, png);
// eslint-disable-next-line no-console
console.log(`✅ ${out} · ${SIZE}×${SIZE} · ${png.length} bayt`);
