/**
 * ⭐ MAĞARA (SİSTEM PLANI §13.20)
 *
 * Doküman: *"Mağara şehrin içinde yer alan ve gizli bir geçitle ulaşılabilen oldukça güvenli bir
 * yapıdır. Surlarınız yıkılıp kaleniz düşse bile mağaradaki askerlerinize hiçbir şey olmaz…
 * mağaradaki askerler savaşa katılmazlar. Ayrıca düşmanlarınızın casus kuşları mağaradaki
 * askerleri göremezler."*
 *
 * ### Pazarlıksız üç kural
 *  1. **Askerler emir anında barakadan DÜŞER.** Yola çıkan ordu artık şehirde değildir — saldırı
 *     o sırada gelirse savaşa katılmaz. Bu, mağaranın oyundaki anlamıdır.
 *  2. **İŞLEM İPTAL EDİLEMEZ** (kullanıcı kararı 2026-07-28). İptal edilebilseydi mağara bir
 *     istismar aracına dönerdi: saldırıdan hemen önce "doldur" de, saldırı bitince iptal et,
 *     ordu hiç kaybolmadan korunmuş olsun. Şimdi oyuncu kararının bedelini **süreyle** ödüyor.
 *  3. **Kapasite ALAN cinsindendir**, adet değil. Tür önemsizdir; tek şart toplam alanın o anki
 *     seviyenin kapasitesini aşmaması.
 */
import { sql } from 'drizzle-orm';
import { UNITS_BY_ID, caveCapacity, caveTransferSeconds, unitsArea } from '@mobiwar/catalog';
import { toDate, type Db } from '../db/client.ts';
import type { Tx } from '../missions/handler-registry.ts';

type Runner = Db | Tx;

export type CaveErrorCode =
  | 'city_not_found'
  | 'not_owner'
  | 'no_cave'
  | 'cave_repairing'
  | 'cave_busy'
  | 'invalid_units'
  | 'not_enough_units'
  | 'capacity_exceeded';

export class CaveError extends Error {
  constructor(readonly code: CaveErrorCode, message: string, readonly details?: unknown) {
    super(message);
  }
}

/** Mağaranın oyuncuya gösterilen tam durumu. */
export interface CaveState {
  level: number;
  capacity: number;
  usedArea: number;
  freeArea: number;
  units: Record<string, number>;
  /** Onarım bitişi (oyun saati) — NULL ise mağara sağlam. */
  repairUntil: Date | null;
  repairing: boolean;
  /** Süren doldurma/boşaltma işi. */
  job: {
    missionId: number;
    direction: 'store' | 'withdraw';
    units: Record<string, number>;
    area: number;
    startedAt: Date;
    finishAt: Date;
  } | null;
}

/** Mağarayla ilgili görev tipleri — tek yerde ki sorgular ve testler aynı listeyi kullansın. */
export const CAVE_JOB_TYPES = ['cave_store', 'cave_withdraw'] as const;

export class CaveService {
  constructor(private readonly db: Db) {}

  /* ── Okuma ────────────────────────────────────────────────────────────────── */

  async state(cityId: number, gameNow: Date, runner: Runner = this.db): Promise<CaveState> {
    const cityRows = await runner.execute<Record<string, unknown>>(sql`
      SELECT c.cave_repair_until,
             COALESCE((SELECT level FROM buildings b WHERE b.city_id = c.id AND b.type = 'cave'), 0) AS level
        FROM cities c WHERE c.id = ${cityId}
    `);
    const row = cityRows[0];
    if (!row) throw new CaveError('city_not_found', 'Şehir bulunamadı.');

    const level = Number(row['level'] ?? 0);
    const repairUntilRaw = row['cave_repair_until'];
    const repairUntil = repairUntilRaw == null ? null : toDate(repairUntilRaw);
    // Süresi dolmuş onarım "sağlam" sayılır; satırı temizlemek için ayrı bir görev gerekmiyor.
    const repairing = repairUntil != null && repairUntil > gameNow;

    const unitRows = await runner.execute<Record<string, unknown>>(sql`
      SELECT type, count FROM cave_units WHERE city_id = ${cityId} AND count > 0
    `);
    const units: Record<string, number> = {};
    for (const r of unitRows) units[String(r['type'])] = Number(r['count']);

    const capacity = caveCapacity(level);
    const usedArea = unitsArea(units);

    const jobRows = await runner.execute<Record<string, unknown>>(sql`
      SELECT m.id, m.type, m.created_at, m.execute_at,
             COALESCE(json_object_agg(mu.unit_type, mu.count)
                      FILTER (WHERE mu.unit_type IS NOT NULL), '{}'::json) AS units
        FROM missions m
        LEFT JOIN mission_units mu ON mu.mission_id = m.id
       WHERE m.target_city_id = ${cityId}
         AND m.type IN ('cave_store', 'cave_withdraw')
         AND m.status IN ('scheduled', 'running')
       GROUP BY m.id
       ORDER BY m.execute_at LIMIT 1
    `);
    const j = jobRows[0];
    const jobUnits = (j?.['units'] ?? {}) as Record<string, number>;

    return {
      level,
      capacity,
      usedArea,
      freeArea: Math.max(0, capacity - usedArea),
      units,
      repairUntil: repairing ? repairUntil : null,
      repairing,
      job: j
        ? {
          missionId: Number(j['id']),
          direction: String(j['type']) === 'cave_store' ? 'store' : 'withdraw',
          units: jobUnits,
          area: unitsArea(jobUnits),
          startedAt: toDate(j['created_at']),
          finishAt: toDate(j['execute_at']),
        }
        : null,
    };
  }

  /* ── Doldurma ─────────────────────────────────────────────────────────────── */

  /**
   * Seçilen savaşçıları mağaraya yollar.
   *
   * ⭐ Birlikler **bu transaction'da** barakadan düşer; mağaraya varış `cave_store` görevinin
   * işidir. Aradaki sürede birlikler "yolda"dır: ne şehirde ne mağarada.
   */
  async store(opts: {
    cityId: number; playerId: number; units: Record<string, number>; at: Date;
  }): Promise<{ missionId: number; seconds: number; area: number }> {
    return this.db.transaction(async (tx) => {
      const st = await this.assertUsable(tx as never, opts.cityId, opts.playerId, opts.at);
      const wanted = sanitize(opts.units);
      if (Object.keys(wanted).length === 0) {
        throw new CaveError('invalid_units', 'Mağaraya gönderilecek savaşçı seçilmedi.');
      }

      const area = unitsArea(wanted);
      if (st.usedArea + area > st.capacity) {
        throw new CaveError(
          'capacity_exceeded',
          `Mağara kapasitesi yetmiyor: ${st.usedArea + area}/${st.capacity} alan.`,
          { need: area, used: st.usedArea, capacity: st.capacity },
        );
      }

      // ⭐ Barakadan düşüş KOŞULLU tek UPDATE: iki eşzamanlı emir aynı askeri gönderemez.
      for (const [type, n] of Object.entries(wanted)) {
        const res = await tx.execute<Record<string, unknown>>(sql`
          UPDATE units SET count = count - ${n}
           WHERE city_id = ${opts.cityId} AND type = ${type} AND count >= ${n}
          RETURNING count
        `);
        if (res.length === 0) {
          throw new CaveError(
            'not_enough_units',
            `${nameOf(type)} için yeterli asker yok (${n} istendi).`,
            { type, count: n },
          );
        }
      }

      const seconds = caveTransferSeconds(area, st.level);
      const missionId = await this.schedule(tx as never, {
        cityId: opts.cityId, playerId: opts.playerId, type: 'cave_store',
        units: wanted, at: opts.at, seconds, area,
      });
      return { missionId, seconds, area };
    });
  }

  /* ── Boşaltma ─────────────────────────────────────────────────────────────── */

  /** Mağaradaki savaşçıları şehre çağırır. Birlikler mağaradan ANINDA çıkar, şehre varışları sürer. */
  async withdraw(opts: {
    cityId: number; playerId: number; units: Record<string, number>; at: Date;
  }): Promise<{ missionId: number; seconds: number; area: number }> {
    return this.db.transaction(async (tx) => {
      const st = await this.assertUsable(tx as never, opts.cityId, opts.playerId, opts.at);
      const wanted = sanitize(opts.units);
      if (Object.keys(wanted).length === 0) {
        throw new CaveError('invalid_units', 'Mağaradan çıkarılacak savaşçı seçilmedi.');
      }

      for (const [type, n] of Object.entries(wanted)) {
        const res = await tx.execute<Record<string, unknown>>(sql`
          UPDATE cave_units SET count = count - ${n}
           WHERE city_id = ${opts.cityId} AND type = ${type} AND count >= ${n}
          RETURNING count
        `);
        if (res.length === 0) {
          throw new CaveError(
            'not_enough_units',
            `Mağarada yeterli ${nameOf(type)} yok (${n} istendi).`,
            { type, count: n },
          );
        }
      }

      const area = unitsArea(wanted);
      const seconds = caveTransferSeconds(area, st.level);
      const missionId = await this.schedule(tx as never, {
        cityId: opts.cityId, playerId: opts.playerId, type: 'cave_withdraw',
        units: wanted, at: opts.at, seconds, area,
      });
      return { missionId, seconds, area };
    });
  }

  /* ── Ortak ────────────────────────────────────────────────────────────────── */

  /**
   * Sahiplik + mağaranın kullanılabilirliği. Üç kapı, üçü de kullanıcı kuralı:
   * mağara yoksa (sv 0) · onarımdaysa · zaten bir iş sürüyorsa yeni emir alınmaz.
   */
  private async assertUsable(
    tx: Db, cityId: number, playerId: number, at: Date,
  ): Promise<CaveState> {
    const owner = await tx.execute<Record<string, unknown>>(sql`
      SELECT player_id FROM cities WHERE id = ${cityId} FOR UPDATE
    `);
    if (owner.length === 0) throw new CaveError('city_not_found', 'Şehir bulunamadı.');
    if (Number(owner[0]!['player_id']) !== playerId) {
      throw new CaveError('not_owner', 'Bu şehir sizin değil.');
    }

    const st = await this.state(cityId, at, tx as never);
    if (st.level <= 0) throw new CaveError('no_cave', 'Bu şehirde mağara yok.');
    if (st.repairing) {
      throw new CaveError('cave_repairing', 'Mağara onarılıyor; şu anda kullanılamaz.', {
        repairUntil: st.repairUntil?.toISOString(),
      });
    }
    if (st.job) {
      throw new CaveError('cave_busy', 'Mağarada zaten bir işlem sürüyor.', {
        finishAt: st.job.finishAt.toISOString(),
      });
    }
    return st;
  }

  /**
   * Görevi + taşınan birlikleri yazar.
   *
   * ⚠️ `origin_city_id` = `target_city_id` = **aynı şehir**. Mağara şehrin İÇİNDEDİR; sefer
   * değil şehir içi bir iştir. Ordular ekranı bu eşitliği "kendi şehrime gelen destek"
   * (sarı kalkan) olarak çiziyor.
   */
  private async schedule(tx: Db, o: {
    cityId: number; playerId: number; type: 'cave_store' | 'cave_withdraw';
    units: Record<string, number>; at: Date; seconds: number; area: number;
  }): Promise<number> {
    const executeAt = new Date(o.at.getTime() + Math.max(1, o.seconds) * 1000);
    const rows = await tx.execute<Record<string, unknown>>(sql`
      INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                            execute_at, payload, idempotency_key)
      SELECT c.world_id, ${o.type}, 'scheduled', ${o.playerId}, c.id, c.id,
             ${executeAt.toISOString()}::timestamptz,
             ${JSON.stringify({ area: o.area, seconds: o.seconds })}::jsonb,
             ${`${o.type}:${o.cityId}:${o.at.toISOString()}`}
        FROM cities c WHERE c.id = ${o.cityId}
      RETURNING id
    `);
    const missionId = Number(rows[0]!['id']);
    for (const [type, count] of Object.entries(o.units)) {
      await tx.execute(sql`
        INSERT INTO mission_units (mission_id, unit_type, count) VALUES (${missionId}, ${type}, ${count})
      `);
    }
    return missionId;
  }
}

/* ── Yardımcılar ───────────────────────────────────────────────────────────── */

/** Yalnız GERÇEK savaşçılar; savunma birimi ve bilinmeyen id sessizce elenir. */
function sanitize(units: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, raw] of Object.entries(units ?? {})) {
    const n = Math.trunc(Number(raw) || 0);
    if (n <= 0) continue;
    if (UNITS_BY_ID[id]?.kind !== 'warrior') continue;
    out[id] = n;
  }
  return out;
}

function nameOf(id: string): string {
  return UNITS_BY_ID[id]?.name.tr ?? id;
}

/** Mağaraya birim ekler (varış anında). */
export async function addCaveUnits(
  runner: Runner, cityId: number, units: Record<string, number>,
): Promise<void> {
  for (const [type, count] of Object.entries(units)) {
    if (!(count > 0)) continue;
    await runner.execute(sql`
      INSERT INTO cave_units (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
      ON CONFLICT (city_id, type) DO UPDATE SET count = cave_units.count + ${count}
    `);
  }
}

/** Şehrin barakasına birim ekler (mağaradan dönüş, destek varışı). */
export async function addCityUnits(
  runner: Runner, cityId: number, units: Record<string, number>,
): Promise<void> {
  for (const [type, count] of Object.entries(units)) {
    if (!(count > 0)) continue;
    await runner.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
      ON CONFLICT (city_id, type) DO UPDATE SET count = units.count + ${count}
    `);
  }
}

/** Mağarayı boşaltır ve içindekileri döndürür (yıkılma anında kullanılır). */
export async function drainCave(
  runner: Runner, cityId: number,
): Promise<Record<string, number>> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    DELETE FROM cave_units WHERE city_id = ${cityId} AND count > 0
    RETURNING type, count
  `);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r['type'])] = Number(r['count']);
  return out;
}
