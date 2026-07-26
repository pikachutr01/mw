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
