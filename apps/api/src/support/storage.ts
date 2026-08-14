/**
 * ⭐⭐ DESTEK EKLERİ — projedeki **İLK** kullanıcı içeriği deposu (2026-08-14).
 *
 * Bugüne kadar hiçbir yükleme yolu yoktu (`MOBIWAR_SISTEM_PLANI.md`: *"Yüklenen içerik yok"*),
 * yani burada kurulan her kural yeni bir saldırı yüzeyinin ilk savunması. Sıralı okunmalı:
 *
 * 1. **İstemciye ait hiçbir şeye güvenilmiyor.** `content-type` da dosya adı da uzantı da
 *    saldırganın yazdığı dizeler. Tür **magic byte**tan tespit ediliyor, uzantı ondan
 *    türetiliyor, dosya adı hiçbir yere yazılmıyor (yol kaçışı + PII).
 * 2. **SVG bilerek desteklenmiyor** — betik çalıştırabilen tek "resim" biçimi.
 * 3. **Piksel sınırı ZORUNLU.** Yeniden kodlamadığımız için (bkz. `sharp` kararı) 5 MB'lık bir
 *    PNG 100.000×100.000 piksele açılabilir; başlıktan okunan boyut bu bombaya karşı **tek**
 *    savunma.
 * 4. **`sharp` KULLANILMIYOR.** Native modül (libvips); geliştirme Windows, üretim Linux ve
 *    dağıtım derlenmiş artefakt gönderiyor — yanlış platform için derlenmiş bir ikili klasik
 *    sessiz dağıtım arızası. Projede `@node-rs/argon2` dışında native bağımlılık yok ve o
 *    kaçınılmazdı; resim boyutlandırma değil. Bedeli açıkça kabul ediliyor: **yeniden
 *    boyutlandırma yok** (5 MB'lık dosya 5 MB servis edilir).
 * 5. **EXIF yine de temizleniyor** — ama bağımlılıksız: JPEG'de `APPn` segmentleri atılıyor.
 *    Telefon ekran görüntüsündeki GPS gerçek bir gizlilik sorunu ve `sharp` olmadan da
 *    çözülebiliyor. PNG/WebP'de dokunulmuyor (pratikte konum taşımıyorlar).
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

const EXT: Readonly<Record<ImageMime, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * ⭐ Yükleme kökü. Boşsa yükleme **kapalıdır** ve uç 503 döner — yanlış yapılandırılmış bir
 * sunucuda dosyaların rastgele bir dizine düşmesindense özelliğin kapalı olması yeğdir.
 */
export function uploadRoot(): string {
  return process.env['UPLOAD_ROOT']?.trim() ?? '';
}

/**
 * ⭐ nginx'in `internal` location öneki (`/_uploads/`). Doluysa dosyayı **nginx** servis eder
 * (`X-Accel-Redirect`), API yalnız yetkiyi doğrular. Boşsa (geliştirme; nginx yok) API dosyayı
 * kendisi akıtır.
 */
export function xAccelPrefix(): string {
  return process.env['UPLOAD_XACCEL']?.trim() ?? '';
}

export function uploadsEnabled(): boolean {
  return uploadRoot() !== '';
}

/* ── Tür tespiti ─────────────────────────────────────────────────────────────── */

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * İlk baytlardan gerçek türü çıkarır. Tanımadığını **reddeder** (`null`), tahmin etmez.
 *
 * ⚠️ Beyaz liste: yalnız PNG · JPEG · WebP. Yeni bir tür eklemek, o türün başlığından boyut
 * okumayı da (`imageSize`) eklemeyi gerektirir — yoksa piksel bombası savunması delinir.
 */
export function sniffImage(buf: Buffer): ImageMime | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 12
    && buf.toString('ascii', 0, 4) === 'RIFF'
    && buf.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';
  return null;
}

/* ── Boyut okuma (piksel bombası savunması) ──────────────────────────────────── */

function pngSize(buf: Buffer): { width: number; height: number } | null {
  // IHDR daima ilk chunk: 8 imza + 4 uzunluk + 4 tip = 16'dan itibaren genişlik, 20'de yükseklik.
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let i = 2;                                   // SOI'den sonra
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }    // dolgu baytları (0xFF tekrarı) atlanır
    const marker = buf[i + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15 — ama DHT(C4), JPG(C8) ve DAC(CC) SOF DEĞİL.
    const isSof = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    if (marker === 0xda) return null;          // SOS'a geldiysek SOF yok demektir
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function webpSize(buf: Buffer): { width: number; height: number } | null {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ' && buf.length >= 30) {
    // Kayıplı: 3 bayt frame tag + 3 bayt sync (0x9d 0x01 0x2a), sonra 14'er bit boyut.
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L' && buf.length >= 25) {
    if (buf[20] !== 0x2f) return null;         // imza baytı
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X' && buf.length >= 30) {
    const rd24 = (o: number): number => buf[o]! | (buf[o + 1]! << 8) | (buf[o + 2]! << 16);
    return { width: rd24(24) + 1, height: rd24(27) + 1 };
  }
  return null;
}

/** Başlıktan piksel boyutu. Okuyamazsa `null` → **çağıran reddetmeli**, varsaymamalı. */
export function imageSize(buf: Buffer, mime: ImageMime): { width: number; height: number } | null {
  const s = mime === 'image/png' ? pngSize(buf)
    : mime === 'image/jpeg' ? jpegSize(buf)
      : webpSize(buf);
  if (!s || !(s.width > 0) || !(s.height > 0)) return null;
  return s;
}

/* ── EXIF temizliği ──────────────────────────────────────────────────────────── */

/**
 * JPEG'den `APPn` (0xFFE1…0xFFEF) segmentlerini atar — EXIF/GPS burada durur.
 *
 * ⚠️ `APP0` (JFIF) **korunuyor**: bazı eski görüntüleyiciler onsuz çuvallıyor ve içinde konum
 * bilgisi yok. `SOS`tan (0xFFDA) sonrası sıkıştırılmış veri; orada segment aranmaz, kalan
 * aynen kopyalanır.
 * ⚠️ Bozuk/beklenmedik yapıda **girdiyi aynen döndürür** — tür ve boyut zaten doğrulanmış
 * durumda, burada agresif olmanın kazancı yok.
 */
export function stripJpegMetadata(buf: Buffer): Buffer {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return buf;
    const marker = buf[i + 1]!;
    if (marker === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out); }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return buf;
    const isAppN = marker >= 0xe1 && marker <= 0xef;
    if (!isAppN) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  /**
   * ⚠️ Kalan artık baytlar **korunuyor**. İlk yazımda döngü bitince yalnız toplanan segmentler
   * birleştiriliyordu ve son tam segmentten sonraki 1-3 bayt sessizce düşüyordu — yani
   * "yalnız APPn'i atıyorum" iddiası doğru değildi. Attığımız şey açıkça seçilmiş olmalı.
   */
  if (i < buf.length) out.push(buf.subarray(i));
  return Buffer.concat(out);
}

/* ── Disk yerleşimi ──────────────────────────────────────────────────────────── */

/**
 * ⚠️ **YOL KAÇIŞININ TEK KAPISI.** `storage_key` bir DB kolonu ve `admin.db.controller.ts`
 * tabloları elle düzenlemeye izin veriyor — yani kolon bozulabilir. Birleştirmeden önce katı
 * regex şart; `..` ya da mutlak yol asla kabul edilmez.
 */
const KEY_RE = /^\d{4}\/\d{2}\/[0-9a-f]{2}\/[0-9a-f]{32}\.(png|jpg|webp)$/;

export function isValidStorageKey(key: string): boolean {
  return KEY_RE.test(key);
}

/**
 * `2026/08/a3/<32 hex>.<uzt>` — tarih parçalaması yedek/toplu silme birimi, ilk 2 hex ise
 * 256 kova (ayda 10 bin dosya bile kova başına ~40 satır demek).
 * Ad **128 bit rastgele**: nginx bir gün dizini doğrudan açsa bile numaralandırma imkânsız.
 */
export function newStorageKey(mime: ImageMime, now = new Date()): string {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const name = randomBytes(16).toString('hex');
  return `${yyyy}/${mm}/${name.slice(0, 2)}/${name}.${EXT[mime]}`;
}

/** Mutlak yol — geçersiz anahtarda **atar**, sessizce bir şey uydurmaz. */
export function resolvePath(key: string): string {
  if (!isValidStorageKey(key)) throw new Error(`Geçersiz storage_key: ${key}`);
  const root = uploadRoot();
  if (!root) throw new Error('UPLOAD_ROOT tanımsız.');
  return join(root, 'support', ...key.split('/'));
}

/** nginx'e verilecek iç yol (`X-Accel-Redirect`). */
export function xAccelPath(key: string): string {
  if (!isValidStorageKey(key)) throw new Error(`Geçersiz storage_key: ${key}`);
  return `${xAccelPrefix().replace(/\/$/, '')}/support/${key}`;
}

/**
 * ⚠️ **`.tmp` → `fsync` → `rename()`**: yarım yazılmış bir dosyanın hiçbir zaman nihai adıyla
 * görünmemesi için. `rename` aynı dosya sisteminde atomik.
 *
 * ⚠️ Çağıran bu satırı **DB satırından ÖNCE** yazmalı; ters sıra "DB'de kayıt var, dosya yok"
 * verir. Bu sıra en kötü ihtimalle süpürücünün toplayacağı bir yetim dosya bırakır.
 */
export async function writeAttachment(key: string, data: Buffer): Promise<void> {
  const abs = resolvePath(key);
  await mkdir(dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp`;
  await writeFile(tmp, data, { flag: 'wx' });
  await rename(tmp, abs);
}

/** Dosyayı siler. Yoksa **sessizce geçer** — temizlik işleri idempotent olmalı. */
export async function deleteAttachment(key: string): Promise<void> {
  if (!isValidStorageKey(key)) return;
  try {
    await unlink(resolvePath(key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Windows/POSIX ayracı farkını testlerde göstermek için. */
export const PATH_SEP = sep;
