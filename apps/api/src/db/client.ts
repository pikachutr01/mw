import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

export type Db = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  sql: postgres.Sql;
  close(): Promise<void>;
}

/**
 * ⭐⭐ SUNUCU TARAFI ZAMAN AŞIMLARI (2026-08-07, canlı olaydan sonra eklendi).
 *
 * ⚠️ **06.08'de yaşananın KÖK NEDENİ bu üç ayarın yokluğuydu.** Terk edilmiş bir transaction
 * `missions` satırlarını kilitli tuttu; `claimDue`'nun `SKIP LOCKED`'ı onları sessizce atladı
 * ve **24 görev 9 saate kadar bekledi**. Postgres'te üçü de varsayılan olarak `0` (=sınırsız),
 * yani kilidi kıracak hiçbir mekanizma yoktu; bekleme ancak süreç yeniden başlayınca ya da
 * TCP keepalive (canlıda **7200 sn**) bağlantıyı düşürünce bitti.
 *
 * | Ayar | Neyi kesiyor | Neden bu değer |
 * |---|---|---|
 * | `idle_in_transaction_session_timeout` | Açılmış ama unutulmuş transaction | **Asıl çare.** Oyunun hiçbir akışı transaction'ı 30 sn boş bekletmez; bekletiyorsa hatadır |
 * | `statement_timeout` | Asılı kalan tek sorgu | 120 sn cömert — en ağır yönetim toplu işlemi bile bunun çok altında |
 * | `lock_timeout` | Kilit sırasında sonsuz bekleme | 10 sn'den uzun bekleyen sorgu semptomdur, normal değil |
 *
 * ⚠️ **Göçler etkilenmiyor:** `scripts/migrate.mjs` kendi `postgres()` bağlantısını açıyor
 * (`max: 1`) ve buradan geçmiyor. Uzun süren bir DDL zaman aşımına takılmaz.
 * ⚠️ Tek bir işlemin daha uzun sürmesi gerekiyorsa çare bu değerleri büyütmek DEĞİL, o
 * transaction'da `SET LOCAL statement_timeout = ...` yazmaktır — kapsam dar kalsın.
 * ⚠️ Değerler **milisaniye tamsayısı** (postgres.js `ConnectionParameters` böyle tipliyor;
 * `'30s'` gibi bir dize derlenmiyor).
 */
const CONNECTION_TIMEOUTS = {
  idle_in_transaction_session_timeout: 30_000,
  statement_timeout: 120_000,
  lock_timeout: 10_000,
} as const;

/**
 * Postgres bağlantısı. Küçük sunucu profilinde (§4.0) tek süreç çalıştığı için havuz küçük tutulur;
 * worker uzun transaction açmadığından 10 bağlantı fazlasıyla yeter.
 */
export function createDb(url: string, opts: { max?: number } = {}): DbHandle {
  const sql = postgres(url, {
    max: opts.max ?? 10,
    // Görev kuyruğu zaman kritiği: bekleyen sorgu sessizce takılmasın.
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
    connection: { ...CONNECTION_TIMEOUTS },
  });
  return {
    sql,
    db: drizzle(sql, { schema }),
    close: () => sql.end({ timeout: 5 }),
  };
}

export { schema };

/**
 * ⚠️ Ham SQL (`db.execute`) sonuçlarında `timestamptz` **dize** olarak gelir — postgres.js
 * yalnız drizzle'ın tipli sorgu kurucusunda Date'e çeviriyor. Kuyruk sorguları `SKIP LOCKED` için
 * ham SQL kullanmak zorunda olduğundan zaman alanları BU yardımcıyla sınırda çevrilir.
 * (Sessizce dize taşımak "getTime is not a function" hatalarına ve daha kötüsü yanlış
 * karşılaştırmalara yol açar.)
 */
export function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  throw new Error(`Tarihe çevrilemedi: ${String(value)}`);
}

export function toDateOrNull(value: unknown): Date | null {
  return value == null ? null : toDate(value);
}
