/**
 * Test veritabanı yardımcıları. GERÇEK Postgres kullanıyoruz — `SKIP LOCKED`, advisory lock ve
 * transaction davranışı taklit edilemez; Faz 1'in tüm garantileri tam olarak bunlara dayanıyor.
 *
 * Test DB'si ayrıdır (`mobiwar_test`), her dosya kendi dünyasını yaratır → paralel çalışabilir.
 */
import { randomUUID } from 'node:crypto';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { createDb, toDate, type DbHandle } from '../../src/db/client.ts';
import { ECHO_TABLE_DDL } from '../../src/missions/echo.handler.ts';

const ADMIN_URL = process.env['DATABASE_URL']
  ?? 'postgresql://mobiwar:mobiwar@localhost:5432/mobiwar';
const TEST_DB = 'mobiwar_test';
const TEST_URL = ADMIN_URL.replace(/\/[^/?]+(\?|$)/, `/${TEST_DB}$1`);

let migrated = false;

/** Test veritabanını (yoksa) yaratır ve migration'ları bir kez uygular. */
export async function setupTestDb(): Promise<DbHandle> {
  if (!migrated) {
    const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
    const exists = await admin`SELECT 1 FROM pg_database WHERE datname = ${TEST_DB}`;
    if (exists.length === 0) await admin.unsafe(`CREATE DATABASE ${TEST_DB}`);
    await admin.end({ timeout: 5 });

    const h = createDb(TEST_URL, { max: 1 });
    await migrate(h.db, {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    });
    await h.db.execute(ECHO_TABLE_DDL);
    await h.close();
    migrated = true;
  }
  return createDb(TEST_URL, { max: 8 });
}

/** Her testin kendi dünya kimliği → testler birbirinin satırlarını görmez. */
let nextWorldId = 100;
export function freshWorldId(): number {
  return nextWorldId++;
}

export async function createWorld(h: DbHandle, worldId: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO worlds (id, name, state, clock_offset_ms)
    VALUES (${worldId}, ${'test-' + worldId}, 'running', 0)
    ON CONFLICT (id) DO UPDATE SET state = 'running', clock_offset_ms = 0, paused_at = NULL
  `);
  await h.db.execute(sql`DELETE FROM missions WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM outbox WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM audit_log WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM echo_effects WHERE world_id = ${worldId}`);
  // Dünya kimlikleri her koşuda 100'den başlıyor → önceki koşunun oyuncuları temizlenmeli,
  // yoksa username/email tekilliği ikinci koşuda çakışır. (cities → players sırası önemli.)
  await h.db.execute(sql`DELETE FROM cities WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM players WHERE world_id = ${worldId}`);
}

/**
 * Test oyuncusu yaratır. E-posta/kullanıcı adı **rastgele** — testler aynı DB'de tekrar tekrar
 * koştuğu için sabit değerler tekillik kısıtına çarpardı.
 */
export async function createPlayer(h: DbHandle, worldId: number, label: string): Promise<number> {
  const token = randomUUID().slice(0, 8);
  const acc = await h.db.execute<{ id: number } & Record<string, unknown>>(sql`
    INSERT INTO accounts (email, password_hash)
    VALUES (${`${label}-${token}@test.local`}, 'test-hash')
    RETURNING id
  `);
  const p = await h.db.execute<{ id: number } & Record<string, unknown>>(sql`
    INSERT INTO players (world_id, account_id, username)
    VALUES (${worldId}, ${Number(acc[0]!.id)}, ${`${label}-${token}`})
    RETURNING id
  `);
  return Number(p[0]!.id);
}

/**
 * Outbox dispatcher bilerek DÜNYA-KAPSAMLI DEĞİL (dünya-üstü olaylar da var, `world_id` NULL).
 * Bu yüzden dispatcher testleri tabloyu tamamen temizler; yoksa başka testlerin bekleyen
 * satırlarını da teslim edip sayımları bozar.
 */
export async function clearOutbox(h: DbHandle): Promise<void> {
  await h.db.execute(sql`DELETE FROM outbox`);
}

export interface EnqueueOptions {
  worldId: number;
  executeAt: Date;
  type?: string;
  label?: string;
  targetCityId?: number;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

export async function enqueue(h: DbHandle, o: EnqueueOptions): Promise<number> {
  const payload = { label: o.label ?? null, ...(o.payload ?? {}) };
  const rows = await h.db.execute<{ id: number }>(sql`
    INSERT INTO missions (world_id, type, status, execute_at, target_city_id, payload, idempotency_key)
    VALUES (${o.worldId}, ${o.type ?? 'echo'}, 'scheduled', ${o.executeAt.toISOString()}::timestamptz,
            ${o.targetCityId ?? null}, ${JSON.stringify(payload)}::jsonb, ${o.idempotencyKey ?? null})
    RETURNING id
  `);
  return Number(rows[0]!.id);
}

export async function echoEffects(h: DbHandle, worldId: number): Promise<
  { missionId: number; label: string | null; sawAt: Date; seq: number }[]
> {
  const rows = await h.db.execute<{ mission_id: number; label: string | null; saw_at: string; seq: number }>(sql`
    SELECT mission_id, label, saw_at, seq FROM echo_effects
     WHERE world_id = ${worldId} ORDER BY seq
  `);
  return rows.map((r) => ({
    missionId: Number(r.mission_id), label: r.label, sawAt: toDate(r.saw_at), seq: Number(r.seq),
  }));
}

export async function missionRow(h: DbHandle, id: number): Promise<{
  status: string; attempts: number; lastError: string | null; executeAt: Date;
}> {
  const rows = await h.db.execute<{ status: string; attempts: number; last_error: string | null; execute_at: string }>(sql`
    SELECT status, attempts, last_error, execute_at FROM missions WHERE id = ${id}
  `);
  const r = rows[0]!;
  return { status: r.status, attempts: Number(r.attempts), lastError: r.last_error, executeAt: toDate(r.execute_at) };
}
