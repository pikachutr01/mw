/**
 * ⭐⭐ ZAMAN KAYDIRMA — bakımdan çıkışın kalbi (tek zaman çizgisi, 2026-08-07).
 *
 * Eski modelde bakım süresi `worlds.clock_offset_ms`te birikiyor ve oyun saati gerçek saatten
 * kalıcı olarak geride kalıyordu. Yeni modelde **oyun saati diye ayrı bir ölçek yok**:
 * duraklama bitince bekleyen her vade duraklama süresi kadar ileri kaydırılıyor, saat de
 * gerçek zamandan devam ediyor.
 *
 * ⚠️ Kaydırma **tek transaction**. Gerekçe kilit maliyeti değil, TESPİT EDİLEBİLİRLİK:
 * "yarısı kaymış dünya" ile normal dünya birbirinden ayırt edilemez (kaymış satırla kaymamış
 * satır aynı görünür). Atomiklik bu durumu var olamaz kılıyor. Etkilenen satır sayısı da küçük
 * — yüklemler yalnız BEKLEYEN işi seçiyor (`time-registry.ts`).
 */
import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { TIME_SHIFT_REGISTRY } from './time-registry.ts';

/** Kaydırma yapılmadan önce sağlanması gereken koşullar sağlanmadığında atılır. */
export class DrainNotReadyError extends Error {
  constructor(readonly running: number, readonly heartbeatSeen: boolean) {
    super(
      running > 0
        ? `Drenaj bekleniyor: ${running} görev hâlâ sürüyor.`
        : 'Worker duraklamayı henüz onaylamadı (nabız bekleniyor).',
    );
    this.name = 'DrainNotReadyError';
  }
}

export interface ShiftOutcome {
  /** Kaydırma miktarı (ms). `resume` çağrısı bir noop'a düştüyse 0. */
  shiftMs: number;
  rowsByTable: Record<string, number>;
  drainRunning: number;
  drainProof: 'heartbeat' | 'forced';
  timeShiftId: number | null;
  /** `noop` = dünya zaten çalışıyordu; hiçbir şey yapılmadı. */
  outcome: 'applied' | 'noop';
}

export interface ShiftOptions {
  worldId: number;
  actorId?: number | null;
  /**
   * ⚠️ Bariyeri **yalnız worker kanıtlanabilir biçimde ölüyse** atlar. Ölü worker uçuşta iş
   * yapamayacağı için kaydırma güvenlidir; canlı ama yavaş bir worker'da zorlamak, kaydırma
   * ile aynı anda commit eden bir handler'ın **kaymamış vade** yazmasına yol açar.
   */
  force?: boolean;
  /** Nabız bu süreden eskiyse worker ölü sayılır (`ops.staleHeartbeatS` ile aynı ruh). */
  staleHeartbeatMs?: number;
}

/** Kayıt defterinin parmak izi — hangi sürümün kaydırdığını geriye dönük bilmek için. */
export function registryHash(): string {
  const body = TIME_SHIFT_REGISTRY.map((e) => `${e.table}.${e.column}`).sort().join('|');
  let h = 0;
  for (let i = 0; i < body.length; i += 1) h = (Math.imul(31, h) + body.charCodeAt(i)) | 0;
  return `${TIME_SHIFT_REGISTRY.length}:${(h >>> 0).toString(16)}`;
}

/**
 * ⭐ DRENAJ BARİYERİ — kaydırmadan önce uçuşta iş kalmadığını KANITLAR.
 *
 * İki koşul birden aranıyor ve ikincisi şart:
 *
 *  1. `running = 0` — alınmış ama bitmemiş görev yok.
 *  2. **Nabız kanıtı** — scheduler duraklamayı GÖRDÜĞÜNÜ yazmış olmalı
 *     (`worker_heartbeats.detail->>'paused' = true`, duraklamadan SONRAKİ bir turda).
 *
 * ⚠️ Neden (1) tek başına yetmiyor: `claimDue` ile `runOne` **ayrı transaction'lar**, ve tur
 * sonundaki bekçi (`createRankingWatchdog`) görev döngüsünden sonra hâlâ `missions` satırı
 * yazabiliyor. `running = 0` o anı yakalayamaz. Döngü tek iş parçacıklı olduğu için
 * "duraklamayı görmüş bir tur" ⇒ ondan önceki her tur (bekçisi dâhil) bitmiştir.
 *
 * ⚠️ Nabız kısıtlaması 5 sn olduğu için bariyer tipik olarak 5-10 saniyede çözülür.
 */
async function checkDrain(
  db: Db, worldId: number, pausedAt: Date, staleHeartbeatMs: number,
): Promise<{ running: number; heartbeatSeen: boolean; heartbeatStale: boolean }> {
  const [row] = await db.execute<Record<string, unknown>>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM missions
        WHERE world_id = ${worldId} AND status = 'running') AS running,
      EXISTS (
        SELECT 1 FROM worker_heartbeats
         WHERE kind = 'scheduler' AND world_id = ${worldId}
           AND at >= ${pausedAt.toISOString()}::timestamptz
           AND (detail->>'paused')::boolean IS TRUE
      ) AS hb_seen,
      NOT EXISTS (
        SELECT 1 FROM worker_heartbeats
         WHERE kind = 'scheduler' AND world_id = ${worldId}
           AND at > now() - (${staleHeartbeatMs}::bigint * interval '1 millisecond')
      ) AS hb_stale
  `);
  return {
    running: Number(row?.['running'] ?? 0),
    heartbeatSeen: row?.['hb_seen'] === true,
    heartbeatStale: row?.['hb_stale'] === true,
  };
}

/**
 * Bakımdan çıkar **ve** bekleyen tüm vadeleri duraklama süresi kadar ileri kaydırır.
 *
 * ⭐⭐ `paused_at = NULL` güncellemesi kaydırmayla AYNI transaction'da ve **en sonda**.
 * `claimDue`'daki `w.paused_at IS NULL` yüklemiyle birlikte scheduler yarışını yapısal olarak
 * kapatıyor: kuyruk ya commit öncesini görür (alt sorgu sıfır satır, hiçbir satıra kilit bile
 * denemez) ya da sonrasını (kaydırılmış vadeler). **Ara durum yok.**
 */
export async function resumeAndShift(db: Db, opts: ShiftOptions): Promise<ShiftOutcome> {
  const staleHeartbeatMs = opts.staleHeartbeatMs ?? 60_000;

  return db.transaction(async (tx) => {
    /**
     * ⚠️ Kaydırma uzun sürmemeli: bakım penceresini uzatmak yerine patlayıp geri alınsın,
     * admin tekrar denesin. `SET LOCAL` yalnız bu transaction için geçerli.
     */
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '60s'`);

    // Dünya satırını kilitle: eşzamanlı ikinci bir resume burada bekler.
    const [world] = await tx.execute<Record<string, unknown>>(sql`
      SELECT paused_at FROM worlds WHERE id = ${opts.worldId} FOR UPDATE
    `);
    if (!world) throw new Error(`Dünya bulunamadı: ${opts.worldId}`);

    const pausedAtRaw = world['paused_at'];
    if (pausedAtRaw == null) {
      // Zaten çalışıyor → idempotent noop. Hata DEĞİL: iki kez «devam ettir» basmak zararsız olmalı.
      return {
        shiftMs: 0, rowsByTable: {}, drainRunning: 0,
        drainProof: 'heartbeat', timeShiftId: null, outcome: 'noop',
      } satisfies ShiftOutcome;
    }
    const pausedAt = new Date(String(pausedAtRaw));

    const drain = await checkDrain(db, opts.worldId, pausedAt, staleHeartbeatMs);
    /**
     * ⭐ BARİYER: `running = 0` **ve** (nabız duraklamayı onayladı **ya da** canlı worker yok).
     *
     * ⚠️ İkinci şıkkı eklemek şart: `ROLE=api` profilinde, worker çökmüşken ya da testlerde
     * hiç scheduler koşmuyor. Nabız onayını koşulsuz aramak bu durumlarda `resume`u **kalıcı
     * olarak kilitlerdi** — bakımdan çıkamayan bir dünya, korumaya çalıştığımız yarıştan çok
     * daha kötü bir arıza.
     *
     * ⚠️ Ölü worker'da kaydırma neden güvenli: uçuştaki iş `claimDue` tarafından AYRI bir
     * transaction'da `status='running'` olarak commit ediliyor, yani her zaman sayılabilir.
     * `running = 0` + ölü worker ⇒ yolda handler yok.
     */
    const drainOk = drain.running === 0 && (drain.heartbeatSeen || drain.heartbeatStale);
    const forced = !drainOk && opts.force === true;
    if (!drainOk && !forced) {
      throw new DrainNotReadyError(drain.running, drain.heartbeatSeen);
    }

    /**
     * ⭐ `D` transaction damgasından (`now()`), `clock_timestamp()`ten DEĞİL. `now()` transaction
     * boyunca sabittir → her tablo AYNI miktar kayar. `clock_timestamp()` kullansaydık tablolar
     * arasında milisaniyelik ayrışma olurdu; `queues.finish_at` ile onun ikizi
     * `missions.execute_at` **eşit** yazılıyor (`queue.service.ts`) ve eşit kalmak zorunda.
     */
    const shiftMs = sql`(EXTRACT(EPOCH FROM (now() - ${pausedAt.toISOString()}::timestamptz)) * 1000)::bigint`;
    const delta: SQL = sql`(${shiftMs} * interval '1 millisecond')`;
    const ref: SQL = sql`${pausedAt.toISOString()}::timestamptz`;

    /**
     * Defter satırı ÖNCE yazılıyor: `time_shifts_world_pause` tekilliği, eşzamanlı ikinci bir
     * kaydırmayı burada düşürür — hiçbir satır kaymadan.
     */
    const [shiftRow] = await tx.execute<Record<string, unknown>>(sql`
      INSERT INTO time_shifts
        (world_id, kind, paused_at, shift_ms, drain_running, drain_proof, forced, actor_id, registry_hash)
      VALUES
        (${opts.worldId}, 'maintenance', ${pausedAt.toISOString()}::timestamptz, ${shiftMs},
         ${drain.running}, ${forced ? 'forced' : 'heartbeat'}, ${forced},
         ${opts.actorId ?? null}, ${registryHash()})
      RETURNING id, shift_ms
    `);
    const timeShiftId = Number(shiftRow!['id']);

    const rowsByTable: Record<string, number> = {};
    for (const entry of TIME_SHIFT_REGISTRY) {
      const table = sql.raw(entry.table);
      const col = sql.raw(entry.column);
      // ⚠️ Dünya kapsamı BURADA ekleniyor, kayıt defterinde değil — unutulması mümkün olmasın.
      const rows = await tx.execute<Record<string, unknown>>(sql`
        UPDATE ${table} SET ${col} = ${col} + ${delta}
         WHERE world_id = ${opts.worldId} AND ${entry.where(ref)}
        RETURNING 1
      `);
      rowsByTable[`${entry.table}.${entry.column}`] = rows.length;
    }

    await tx.execute(sql`
      UPDATE time_shifts SET rows_by_table = ${JSON.stringify(rowsByTable)}::jsonb
       WHERE id = ${timeShiftId}
    `);

    // ⭐ EN SON ve AYNI transaction'da — yarış kanıtının dayandığı nokta.
    await tx.execute(sql`
      UPDATE worlds SET state = 'running', paused_at = NULL WHERE id = ${opts.worldId}
    `);

    const [applied] = await tx.execute<Record<string, unknown>>(sql`
      SELECT shift_ms FROM time_shifts WHERE id = ${timeShiftId}
    `);

    return {
      shiftMs: Number(applied?.['shift_ms'] ?? 0),
      rowsByTable,
      drainRunning: drain.running,
      drainProof: forced ? 'forced' : 'heartbeat',
      timeShiftId,
      outcome: 'applied',
    } satisfies ShiftOutcome;
  });
}

/** Bakım panelinin «devam ettir» düğmesini ne zaman açacağını bilmesi için. */
export async function drainStatus(
  db: Db, worldId: number, staleHeartbeatMs = 60_000,
): Promise<{ ready: boolean; running: number; heartbeatSeen: boolean; heartbeatStale: boolean }> {
  const [world] = await db.execute<Record<string, unknown>>(sql`
    SELECT paused_at FROM worlds WHERE id = ${worldId}
  `);
  const pausedAtRaw = world?.['paused_at'];
  if (pausedAtRaw == null) {
    return { ready: true, running: 0, heartbeatSeen: true, heartbeatStale: false };
  }
  const d = await checkDrain(db, worldId, new Date(String(pausedAtRaw)), staleHeartbeatMs);
  return { ready: d.running === 0 && d.heartbeatSeen, ...d };
}
