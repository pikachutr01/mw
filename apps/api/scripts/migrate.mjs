/**
 * ── ÜRETİM MİGRATION KOŞUCUSU ────────────────────────────────────────────────
 *
 * `pnpm db:migrate` (drizzle-kit) geliştirme ve CI içindir; **drizzle-kit bir
 * devDependency**. Üretim paketi `pnpm deploy --prod` ile üretiliyor ve içinde
 * devDependency YOK — yani sunucuda `drizzle-kit migrate` çalıştırılamaz.
 *
 * Bu betik aynı işi `drizzle-orm`un kendi koşucusuyla yapıyor (o zaten üretim
 * bağımlılığı). İkisi **aynı** `drizzle/meta/_journal.json` sırasını okur ve **aynı**
 * `__drizzle_migrations` tablosuna yazar; yani lokalde drizzle-kit ile uygulanan bir
 * göç sunucuda ikinci kez uygulanmaz.
 *
 * ⚠️ Şema burada ÜRETİLMEZ (`push` yok, §4.0): yalnız depoya işlenmiş `.sql` dosyaları
 * sırayla koşar. Sunucuda şema üretmek, kod ile veritabanının sessizce ayrışması demekti.
 */
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL tanımsız — /etc/mobilwar/.env okunuyor mu?');
  process.exit(1);
}

// ⚠️ `max: 1`: göçler tek bağlantıda, sırayla koşmalı. Havuz açmak paralel DDL demek olurdu.
const sql = postgres(url, { max: 1 });

try {
  const folder = fileURLToPath(new URL('../drizzle', import.meta.url));
  console.log(`[migrate] göç klasörü: ${folder}`);
  await migrate(drizzle(sql), { migrationsFolder: folder });
  console.log('[migrate] tamam.');
} catch (err) {
  console.error('[migrate] BAŞARISIZ:', err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
