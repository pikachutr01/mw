/**
 * ⭐ GÖRSEL VARLIK EŞİTLEYİCİ — web → mobil.
 *
 *   node ops/assets-sync.mjs           → kopyalar
 *   node ops/assets-sync.mjs --check   → kopyalamadan karşılaştırır, fark varsa ÇIKIŞ KODU 1
 *
 * Neden kopya: Flutter, `pubspec.yaml`ta paket dizini DIŞINDAKİ varlıkları göremiyor. Web'in
 * `public/assets/` klasörünü doğrudan göstermek mümkün değil, dosyaların `apps/mobile/assets/`
 * altında bulunması gerekiyor.
 *
 * ⚠️ Kopya, tanımı gereği sürüklenme riskidir: web'de ikon değişir, mobil eskisini gösterir ve
 * kimse fark etmez. Kullanıcının «tam eşitlik» kararı bunu kabul edilemez kılıyor. Bu yüzden
 * kopyanın yanında bir KAPI var ve `tokens:check` ile birebir aynı kalıpta — o kapı iki yıldır
 * token sürüklenmesini yakalıyor, ikinci bir mekanizma icat etmenin sebebi yok.
 *
 * ⚠️ Node tarafında yazıldı (Flutter SDK'sı İSTEMİYOR) ki `ci.yml`de `tokens:check` ve
 * `contracts:check` ile yan yana durabilsin — MOBIL_MIMARI.md §4.1'deki asimetrinin aynısı.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const kaynak = join(here, '..', 'apps', 'web', 'public', 'assets');
const hedef = join(here, '..', 'apps', 'mobile', 'assets');

/** Klasörü özyinelemeli tarar; göreli yol → içerik özeti. */
function tara(kok) {
  const out = new Map();
  const gez = (dizin) => {
    for (const ad of readdirSync(dizin)) {
      const tam = join(dizin, ad);
      if (statSync(tam).isDirectory()) gez(tam);
      else out.set(relative(kok, tam).replaceAll('\\', '/'), createHash('sha256').update(readFileSync(tam)).digest('hex'));
    }
  };
  gez(kok);
  return out;
}

const check = process.argv.includes('--check');
const kaynakDosyalar = tara(kaynak);

let hedefDosyalar;
try {
  hedefDosyalar = tara(hedef);
} catch {
  hedefDosyalar = new Map();
}

const eksik = [...kaynakDosyalar.keys()].filter((y) => !hedefDosyalar.has(y));
const farkli = [...kaynakDosyalar].filter(([y, h]) => hedefDosyalar.get(y) !== undefined && hedefDosyalar.get(y) !== h).map(([y]) => y);
/** ⚠️ Fazlalık da hata: web'den SİLİNEN bir ikon mobilde kalırsa iki istemci ayrışmış olur. */
const fazla = [...hedefDosyalar.keys()].filter((y) => !kaynakDosyalar.has(y));

if (check) {
  const sorun = [...eksik, ...farkli, ...fazla];
  if (sorun.length > 0) {
    console.error(`✗ Görsel varlıklar senkron değil — 'pnpm assets:build' çalıştırıp sonucu commit'leyin.`);
    for (const y of eksik) console.error(`  eksik:  ${y}`);
    for (const y of farkli) console.error(`  farklı: ${y}`);
    for (const y of fazla) console.error(`  fazla:  ${y}`);
    process.exit(1);
  }
  console.log(`✓ Görsel varlıklar senkron (${kaynakDosyalar.size} dosya).`);
} else {
  for (const y of fazla) rmSync(join(hedef, y));
  for (const y of [...eksik, ...farkli]) {
    const cikti = join(hedef, y);
    mkdirSync(dirname(cikti), { recursive: true });
    copyFileSync(join(kaynak, y), cikti);
  }
  const degisen = eksik.length + farkli.length + fazla.length;
  console.log(`✓ apps/mobile/assets (${kaynakDosyalar.size} dosya, ${degisen} güncellendi)`);
}
