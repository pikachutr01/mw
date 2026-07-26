/**
 * ⭐ GÖREV KUYRUĞU DEPOSU (SİSTEM PLANI §1)
 *
 * Üç garanti buradan gelir:
 *  1. **Kaçırılan görev yok** — worker saatlerce kapalı kalsa bile açılınca birikmişleri
 *     `execute_at` sırasıyla işler (catch-up).
 *  2. **Çift çalışma yok** — `FOR UPDATE SKIP LOCKED` + `status` geçişi aynı transaction'da.
 *  3. **Sıra kesin** — `ORDER BY execute_at, id`; eşitlikte önce oluşturulan kazanır.
 */
import { sql } from 'drizzle-orm';
import { toDate, toDateOrNull, type Db } from '../db/client.ts';

export interface MissionRow {
  id: number;
  worldId: number;
  type: string;
  status: string;
  ownerPlayerId: number | null;
  originCityId: number | null;
  targetCityId: number | null;
  executeAt: Date;
  attempts: number;
  payload: Record<string, unknown>;
}

/** `db.execute` generic'i `Record<string, unknown>` ister; ham satır tipi ayrı tutuluyor. */
interface MissionRowRaw extends Record<string, unknown> {
  id: number | string;
  worldId: number;
  type: string;
  status: string;
  ownerPlayerId: number | null;
  originCityId: number | null;
  targetCityId: number | null;
  executeAt: string;
  attempts: number;
  payload: Record<string, unknown>;
}

export interface ClaimOptions {
  worldId: number;
  /** Oyun saati — bu ana kadar vadesi gelmiş görevler alınır. */
  gameNow: Date;
  limit: number;
  /** Worker kimliği (bayat kilidi tanımak ve loglamak için). */
  workerId: string;
}

export class MissionRepository {
  constructor(private readonly db: Db) {}

  /**
   * Vadesi gelmiş görevleri KİLİTLEYİP `running` yapar.
   *
   * `SKIP LOCKED` sayesinde N worker aynı anda çalışabilir: biri bir satırı kilitlemişse
   * diğeri onu atlar, beklemez. Alt sorgu `FOR UPDATE` ile satırları tutar, dış `UPDATE`
   * aynı transaction'da durumu değiştirir → iki worker aynı görevi ALAMAZ.
   */
  async claimDue(opts: ClaimOptions): Promise<MissionRow[]> {
    const rows = await this.db.execute<MissionRowRaw>(sql`
      UPDATE missions m
         SET status = 'running',
             locked_by = ${opts.workerId},
             locked_at = now(),
             attempts = m.attempts + 1
       WHERE m.id IN (
             SELECT id FROM missions
              WHERE world_id = ${opts.worldId}
                AND status = 'scheduled'
                AND execute_at <= ${opts.gameNow.toISOString()}::timestamptz
              ORDER BY execute_at, id
                FOR UPDATE SKIP LOCKED
              LIMIT ${opts.limit}
       )
      RETURNING m.id, m.world_id AS "worldId", m.type, m.status,
                m.owner_player_id AS "ownerPlayerId", m.origin_city_id AS "originCityId",
                m.target_city_id AS "targetCityId", m.execute_at AS "executeAt",
                m.attempts, m.payload
    `);
    // Ham SQL zaman alanlarını dize döndürür → sınırda Date'e çevir (bkz. client.ts/toDate).
    const parsed: MissionRow[] = rows.map((r) => ({
      id: Number(r.id),
      worldId: Number(r.worldId),
      type: r.type,
      status: r.status,
      ownerPlayerId: r.ownerPlayerId == null ? null : Number(r.ownerPlayerId),
      originCityId: r.originCityId == null ? null : Number(r.originCityId),
      targetCityId: r.targetCityId == null ? null : Number(r.targetCityId),
      executeAt: toDate(r.executeAt),
      attempts: Number(r.attempts),
      payload: r.payload ?? {},
    }));
    // execute_at sırası RETURNING'de garanti değil → handler'a vermeden önce yeniden sırala.
    return parsed.sort((a, b) =>
      a.executeAt.getTime() - b.executeAt.getTime() || a.id - b.id);
  }

  /**
   * ⭐ CRASH KURTARMA: worker görevi `running` yapıp öldüyse satır sonsuza kadar öyle kalırdı.
   * `staleAfterMs`'ten eski kilitleri `scheduled`'a döndürür → sonraki tur yeniden dener.
   * Çıkış kriterinin ("worker'ı savaşın ortasında öldür") çalışmasını sağlayan parça budur.
   */
  async reapStale(worldId: number, staleAfterMs: number): Promise<number> {
    const rows = await this.db.execute<{ id: number } & Record<string, unknown>>(sql`
      UPDATE missions
         SET status = 'scheduled', locked_by = NULL, locked_at = NULL,
             last_error = COALESCE(last_error, 'bayat kilit kurtarildi (worker crash)')
       WHERE world_id = ${worldId}
         AND status = 'running'
         AND locked_at < now() - (${staleAfterMs}::bigint * interval '1 millisecond')
      RETURNING id
    `);
    return rows.length;
  }

  async markDone(missionId: number): Promise<void> {
    await this.db.execute(sql`
      UPDATE missions SET status = 'done', finished_at = now(), locked_by = NULL, locked_at = NULL
       WHERE id = ${missionId}
    `);
  }

  /**
   * Hata: deneme hakkı varsa geri kuyruğa (üstel backoff ile), yoksa `failed` (dead letter).
   * Backoff OYUN saatinde değil execute_at üzerinden verilir; böylece sıra bozulmaz.
   */
  async markFailed(missionId: number, error: string, maxAttempts: number, backoffMs: number): Promise<'retry' | 'dead'> {
    const rows = await this.db.execute<{ status: string } & Record<string, unknown>>(sql`
      UPDATE missions
         SET status = CASE WHEN attempts >= ${maxAttempts} THEN 'failed' ELSE 'scheduled' END,
             execute_at = CASE WHEN attempts >= ${maxAttempts} THEN execute_at
                               ELSE execute_at + (${backoffMs}::bigint * interval '1 millisecond') END,
             last_error = ${error.slice(0, 2000)},
             locked_by = NULL, locked_at = NULL,
             finished_at = CASE WHEN attempts >= ${maxAttempts} THEN now() ELSE NULL END
       WHERE id = ${missionId}
      RETURNING status
    `);
    return rows[0]?.status === 'failed' ? 'dead' : 'retry';
  }

  /** Bir sonraki görevin oyun-saati vadesi (scheduler'ın ne kadar uyuyacağını bilmesi için). */
  async nextDueAt(worldId: number): Promise<Date | null> {
    const rows = await this.db.execute<{ execute_at: string } & Record<string, unknown>>(sql`
      SELECT execute_at FROM missions
       WHERE world_id = ${worldId} AND status = 'scheduled'
       ORDER BY execute_at, id LIMIT 1
    `);
    return toDateOrNull(rows[0]?.execute_at);
  }

  /** SLO metriği: görev gecikmesi = gameNow − execute_at (§8, p95 < 2 sn hedefi). */
  async lagMs(worldId: number, gameNow: Date): Promise<number> {
    const rows = await this.db.execute<{ lag: number } & Record<string, unknown>>(sql`
      SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (${gameNow.toISOString()}::timestamptz - execute_at)) * 1000), 0)::bigint AS lag
        FROM missions
       WHERE world_id = ${worldId} AND status = 'scheduled' AND execute_at <= ${gameNow.toISOString()}::timestamptz
    `);
    return Number(rows[0]?.lag ?? 0);
  }

  async countByStatus(worldId: number): Promise<Record<string, number>> {
    const rows = await this.db.execute<{ status: string; n: number } & Record<string, unknown>>(sql`
      SELECT status, COUNT(*)::int AS n FROM missions WHERE world_id = ${worldId} GROUP BY status
    `);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  }
}
