/**
 * Sözleşme üreteci — zod → `apps/mobile/lib/gen/contracts.g.dart`.
 *
 *   pnpm contracts:build   → dosyayı yazar
 *   pnpm contracts:check   → yazmadan karşılaştırır, fark varsa ÇIKIŞ KODU 1 (CI kırılır)
 *
 * ⭐ `design-tokens/src/build.ts` ile BİREBİR aynı kalıp — bilinçli. O kapı iki yıldır
 * sürüklenmeyi yakalıyor, ikinci bir mekanizma icat etmek yalnız iki farklı arıza biçimi
 * üretirdi. Gözden geçiren için de tanıdık.
 *
 * ⚠️ Bu betik **Node tarafında** koşuyor, yani Flutter SDK'sı olmayan runner'da da çalışır.
 * `contracts:check` bu yüzden `ci.yml`e girebiliyor (MOBIL_MIMARI.md §4.1).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDart } from './emit.ts';
import { REGISTRY } from './registry.ts';

const here = dirname(fileURLToPath(import.meta.url));
const hedef = join(here, '..', '..', '..', '..', 'apps', 'mobile', 'lib', 'gen', 'contracts.g.dart');

const check = process.argv.includes('--check');
const next = buildDart(REGISTRY);

if (check) {
  let current: string | null = null;
  try {
    current = readFileSync(hedef, 'utf8');
  } catch {
    current = null;
  }
  if (current !== next) {
    console.error("✗ contracts.g.dart güncel değil — 'pnpm contracts:build' çalıştırıp sonucu commit'leyin.");
    process.exit(1);
  }
  console.log('✓ Sözleşmeler kaynakla senkron.');
} else {
  mkdirSync(dirname(hedef), { recursive: true });
  writeFileSync(hedef, next, 'utf8');
  console.log(`✓ lib/gen/contracts.g.dart (${Object.keys(REGISTRY).length} sınıf)`);
}
