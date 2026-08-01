/**
 * ⭐ BAKIM VE PERFORMANS (§admin Faz 8) — panelin son ekranı.
 *
 * Dört soruya kanıtla cevap verir:
 *   1. **Döngüler yaşıyor mu?** — `worker_heartbeats`. Türetilmiş ölçüler (kuyruk gecikmesi)
 *      arızayı görür ama SAĞLIĞI göremez: kuyruk boşken "gecikme yok" ile "worker öldü"
 *      aynı görünür.
 *   2. **Kuyruklar tıkalı mı?** — en eski teslim edilmemiş outbox satırı, ölü mektup sayısı,
 *      vadesi geçmiş görevler, ölü görevler.
 *   3. **Veri tabanı ne kadar büyüdü, nerede?** — tablo/indeks boyutları, yavaş sorgular.
 *   4. **Ne temizlenebilir?** — adı konmuş görevler; **önce kuru koşu**, sonra onay.
 *
 * ⚠️ **KURU KOŞU VARSAYILAN.** Silme yalnız `confirm: true` + adım yükseltmesiyle olur ve
 * her koşu `audit_log`a yazılır. Bu, Faz 7'de öğrenilen dersin kuralı: yıkıcı bir işlemi
 * önce ÖLÇMEDEN çalıştırmak, geri alınamaz bir kaybı bir tık uzağa koyar.
 */
import {
  BadRequestException, Body, Controller, Get, HttpCode, Inject, Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { OUTBOX_MAX_ATTEMPTS } from '../outbox/outbox.dispatcher.ts';
import { SettingsService } from '../settings/settings.service.ts';
import { AdminGuard, AdminStepUpGuard, type AdminRequest } from './admin.guard.ts';
import { CLEANUP_JOBS, JOBS_BY_ID, type CleanupJob, type OpsRetention } from './ops-jobs.ts';

const runBody = z.object({
  /** ⚠️ Silme yalnız bununla olur. Yokluğunda uç kuru koşu döndürür, hata değil. */
  confirm: z.boolean().optional(),
});

interface HeartbeatRow extends Record<string, unknown> {
  kind: string;
  worker_id: string;
  world_id: number | null;
  pid: number | null;
  role: string | null;
  age_s: number;
  uptime_s: number;
  ticks: number;
  detail: Record<string, unknown>;
}

@Controller('api/v1/admin/ops')
@UseGuards(AuthGuard, AdminGuard)
export class AdminOpsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly settings: SettingsService,
  ) {}

  /** `ops` grubunu tipli okur. Bellek-içi anlık görüntüden → 0 sorgu. */
  private retention(worldId: number): OpsRetention {
    const g = this.settings.group(worldId, 'ops') as Record<string, number>;
    return {
      messagesReadDays: g['messagesReadDays'] ?? 60,
      messagesAnyDays: g['messagesAnyDays'] ?? 365,
      chatDays: g['chatDays'] ?? 30,
      outboxDays: g['outboxDays'] ?? 7,
      emailTokenDays: g['emailTokenDays'] ?? 7,
      pushDeadDays: g['pushDeadDays'] ?? 30,
      pushFailThreshold: g['pushFailThreshold'] ?? 5,
      rankingRunDays: g['rankingRunDays'] ?? 90,
      sessionDays: g['sessionDays'] ?? 90,
      cleanupBatch: g['cleanupBatch'] ?? 20_000,
      staleHeartbeatS: g['staleHeartbeatS'] ?? 30,
    };
  }

  /**
   * ⭐ SAĞLIK — canlılık + kuyruklar + bağlantı havuzu tek çağrıda.
   *
   * Panel bunu periyodik yenilediği için üç bölüm ayrı uçlara bölünmedi: üç istek, üç kere
   * guard + üç kere DB round-trip demekti ve hepsi aynı ekranda gösteriliyor.
   */
  @Get('health')
  async health(@Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const r = this.retention(req.player!.worldId);

    const beats = await this.db.execute<HeartbeatRow>(sql`
      SELECT kind, worker_id, world_id, pid, role, ticks, detail,
             EXTRACT(EPOCH FROM (now() - at))::int         AS age_s,
             EXTRACT(EPOCH FROM (at - started_at))::int    AS uptime_s
        FROM worker_heartbeats
       ORDER BY kind, worker_id
    `);

    const [outbox] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT
        COUNT(*) FILTER (WHERE dispatched_at IS NULL)::int                          AS pending,
        COUNT(*) FILTER (WHERE dispatched_at IS NULL AND attempts >= ${OUTBOX_MAX_ATTEMPTS})::int AS dead,
        COUNT(*) FILTER (WHERE dispatched_at IS NULL AND attempts > 0
                           AND attempts < ${OUTBOX_MAX_ATTEMPTS})::int                     AS retrying,
        COUNT(*)::int                                                               AS total,
        EXTRACT(EPOCH FROM (now() - MIN(created_at) FILTER (WHERE dispatched_at IS NULL)))::int
                                                                                    AS oldest_pending_s
      FROM outbox
    `);

    /**
     * ⚠️ Ölü mektupların KONULARI ayrıca sayılıyor: "10 satır bekliyor" tek başına eyleme
     * dönüşmez, "10 satırın hepsi `mail:send`" doğrudan Resend anahtarını işaret eder.
     */
    const deadTopics = await this.db.execute<Record<string, unknown>>(sql`
      SELECT topic, COUNT(*)::int AS n, MAX(last_error) AS last_error
        FROM outbox
       WHERE dispatched_at IS NULL AND attempts >= ${OUTBOX_MAX_ATTEMPTS}
       GROUP BY topic ORDER BY n DESC LIMIT 10
    `);

    /**
     * Görev kuyruğu. ⚠️ Gecikme OYUN saatiyle ölçülüyor (`worlds.clock_offset_ms`) — gerçek
     * saatle ölçseydik bakımdaki her dünya "saatlerce gecikmiş" görünürdü.
     */
    const missions = await this.db.execute<Record<string, unknown>>(sql`
      SELECT w.id AS world_id, w.name, w.state,
             COUNT(*) FILTER (WHERE m.status = 'scheduled')::int AS scheduled,
             COUNT(*) FILTER (WHERE m.status = 'running')::int   AS running,
             COUNT(*) FILTER (WHERE m.status = 'failed')::int    AS failed,
             EXTRACT(EPOCH FROM (
               (now() - (w.clock_offset_ms * interval '1 millisecond'))
               - MIN(m.execute_at) FILTER (WHERE m.status = 'scheduled')
             ))::int AS lag_s
        FROM worlds w LEFT JOIN missions m ON m.world_id = w.id
       GROUP BY w.id, w.name, w.state, w.clock_offset_ms
       ORDER BY w.id
    `);

    /**
     * Bağlantı havuzu. `pg_stat_activity` **sunucu** tarafını gösterir — postgres.js'in yerel
     * havuzu (max 10) buradan görünmez, ama asıl sınır sunucudaki `max_connections`tır ve
     * tükendiğinde oyun tamamen durur.
     */
    const [pool] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int                                                        AS total,
             COUNT(*) FILTER (WHERE state = 'active')::int                        AS active,
             COUNT(*) FILTER (WHERE state = 'idle')::int                          AS idle,
             COUNT(*) FILTER (WHERE state = 'idle in transaction')::int           AS idle_in_tx,
             current_setting('max_connections')::int                              AS max_connections,
             COALESCE(EXTRACT(EPOCH FROM (now() - MIN(xact_start)))::int, 0)      AS oldest_tx_s
        FROM pg_stat_activity WHERE datname = current_database()
    `);

    return {
      now: new Date().toISOString(),
      staleAfterS: r.staleHeartbeatS,
      loops: beats.map((b) => ({
        kind: b.kind, workerId: b.worker_id, worldId: b.world_id, pid: b.pid, role: b.role,
        ageS: Number(b.age_s), uptimeS: Number(b.uptime_s), ticks: Number(b.ticks),
        detail: b.detail ?? {},
        alive: Number(b.age_s) <= r.staleHeartbeatS,
      })),
      /**
       * ⚠️ Nabız satırı HİÇ yoksa "sağlıklı" değil **bilinmiyor**dur: worker hiç çalışmamış
       * ya da migration koşmamış olabilir. Panel bu ayrımı gösterebilsin diye ayrı bayrak.
       */
      loopsKnown: beats.length > 0,
      outbox: {
        pending: Number(outbox?.['pending'] ?? 0),
        dead: Number(outbox?.['dead'] ?? 0),
        retrying: Number(outbox?.['retrying'] ?? 0),
        total: Number(outbox?.['total'] ?? 0),
        oldestPendingS: outbox?.['oldest_pending_s'] == null
          ? null : Number(outbox['oldest_pending_s']),
        deadTopics: deadTopics.map((t) => ({
          topic: String(t['topic']), count: Number(t['n']),
          lastError: t['last_error'] == null ? null : String(t['last_error']).slice(0, 300),
        })),
      },
      worlds: missions.map((m) => ({
        worldId: Number(m['world_id']), name: String(m['name']), state: String(m['state']),
        scheduled: Number(m['scheduled']), running: Number(m['running']),
        failed: Number(m['failed']),
        lagS: m['lag_s'] == null ? null : Math.max(0, Number(m['lag_s'])),
      })),
      pool: {
        total: Number(pool?.['total'] ?? 0), active: Number(pool?.['active'] ?? 0),
        idle: Number(pool?.['idle'] ?? 0), idleInTx: Number(pool?.['idle_in_tx'] ?? 0),
        maxConnections: Number(pool?.['max_connections'] ?? 0),
        oldestTxS: Number(pool?.['oldest_tx_s'] ?? 0),
      },
    };
  }

  /**
   * ⭐ TABLO VE İNDEKS BOYUTLARI.
   *
   * ⚠️ Satır sayısı `pg_class.reltuples` **TAHMİNİ**dir, `COUNT(*)` değil. Bilerek: 35 tabloya
   * tam sayım atmak bu ekranı açan her yöneticiye tam tablo taraması yaptırırdı. Tahmin
   * `ANALYZE` ile tazelenir; hiç analiz edilmemiş tabloda −1 gelir ve `null` olarak dönüyor
   * (0 gösterseydik "tablo boş" diye okunurdu — yanlış olurdu).
   */
  @Get('sizes')
  async sizes(): Promise<Record<string, unknown>> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT c.relname                                   AS table,
             pg_total_relation_size(c.oid)               AS total_bytes,
             pg_table_size(c.oid)                        AS table_bytes,
             pg_indexes_size(c.oid)                      AS index_bytes,
             c.reltuples                                 AS est_rows,
             (SELECT COUNT(*)::int FROM pg_index i WHERE i.indrelid = c.oid) AS index_count,
             s.last_analyze, s.last_autoanalyze, s.n_dead_tup
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY pg_total_relation_size(c.oid) DESC
    `);
    const [db] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT pg_database_size(current_database()) AS bytes
    `);

    return {
      databaseBytes: Number(db?.['bytes'] ?? 0),
      tables: rows.map((t) => {
        const est = Number(t['est_rows']);
        return {
          table: String(t['table']),
          totalBytes: Number(t['total_bytes']),
          tableBytes: Number(t['table_bytes']),
          indexBytes: Number(t['index_bytes']),
          indexCount: Number(t['index_count']),
          /** ⚠️ TAHMİN. −1 = hiç analiz edilmemiş → «bilinmiyor». */
          estRows: est < 0 ? null : Math.round(est),
          deadRows: t['n_dead_tup'] == null ? null : Number(t['n_dead_tup']),
          lastAnalyze: t['last_analyze'] ?? t['last_autoanalyze'] ?? null,
        };
      }),
    };
  }

  /**
   * ⭐ YAVAŞ SORGULAR — `pg_stat_statements`.
   *
   * ⚠️ Eklenti kurulu olmayabilir ve bu bir HATA DEĞİL: yönetilen Postgres'lerde ayrıca
   * etkinleştirilmesi gerekir. O durumda uç 500 atmıyor, `available: false` + kurulum
   * komutunu döndürüyor — panelin geri kalanı çalışmaya devam etsin.
   */
  @Get('slow')
  async slow(): Promise<Record<string, unknown>> {
    const [ext] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM pg_extension WHERE extname = 'pg_stat_statements'
    `);
    if (Number(ext?.['n'] ?? 0) === 0) {
      return {
        available: false,
        reason: 'pg_stat_statements eklentisi kurulu değil.',
        howTo: 'CREATE EXTENSION pg_stat_statements;  (ayrıca postgresql.conf → '
          + "shared_preload_libraries = 'pg_stat_statements' ve yeniden başlatma gerekir)",
        queries: [],
      };
    }
    try {
      const rows = await this.db.execute<Record<string, unknown>>(sql`
        SELECT query, calls, total_exec_time, mean_exec_time, rows
          FROM pg_stat_statements
         WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
         ORDER BY total_exec_time DESC LIMIT 20
      `);
      return {
        available: true,
        queries: rows.map((q) => ({
          query: String(q['query']).replace(/\s+/g, ' ').slice(0, 400),
          calls: Number(q['calls']),
          totalMs: Math.round(Number(q['total_exec_time'])),
          meanMs: Number(Number(q['mean_exec_time']).toFixed(2)),
          rows: Number(q['rows']),
        })),
      };
    } catch (err) {
      // Sürüm farkı: PG 12 öncesi `total_time`/`mean_time` kullanıyor. Panel çökmesin.
      return { available: false, reason: String(err).slice(0, 300), queries: [] };
    }
  }

  /**
   * ⭐ TEMİZLİK — KURU KOŞU. Hiçbir şey silmez; her görev için "kaç satır, en eskisi ne kadar".
   *
   * Bu uç `AdminStepUpGuard` istemiyor: bakmak yıkıcı değil ve yöneticinin ne kadar veri
   * biriktiğini görmek için parola yazması gereksiz bir sürtünme olurdu.
   */
  @Get('cleanup')
  async cleanupPreview(@Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const r = this.retention(req.player!.worldId);
    const jobs = [];
    for (const job of CLEANUP_JOBS) jobs.push(await this.preview(job, r));
    return { retention: r, jobs };
  }

  /**
   * ⭐ TEMİZLİK — ÇALIŞTIR.
   *
   * Üç kapı: adım yükseltmesi · `confirm: true` · satır tavanı. `confirm` yoksa **hata değil
   * kuru koşu** döner — panelin "önce göster" akışı ile aynı uç kullanılır, yanlış tıklama
   * silmeye dönüşmez.
   */
  @Post('cleanup/:id')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async cleanupRun(
    @Param('id') id: string, @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const job = JOBS_BY_ID[id];
    if (!job) throw new BadRequestException(`Bilinmeyen temizlik görevi: ${id}`);
    const parsed = runBody.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const r = this.retention(req.player!.worldId);
    const before = await this.preview(job, r);
    if (!parsed.data.confirm) return { ...before, ran: false, deleted: 0 };
    if (before.matched === 0) return { ...before, ran: true, deleted: 0, remaining: 0 };

    /**
     * ⚠️ `ctid` ile parça parça silme. Sebep iki tane:
     *   • Tabloların bir kısmında (composite key'li olanlar) tek kolonluk bir anahtar yok.
     *   • `LIMIT`siz bir DELETE milyon satırda tabloyu kilitler ve oyunu durdurur.
     * Tavan aşılırsa kalan bir sonraki koşuya bırakılır — `remaining` panelde yazar.
     */
    const deleted = await this.db.execute<Record<string, unknown>>(sql`
      DELETE FROM ${sql.raw(`"${job.table}"`)}
       WHERE ctid IN (
         SELECT ctid FROM ${sql.raw(`"${job.table}"`)}
          WHERE ${job.where(r)}
          ORDER BY ${sql.raw(`"${job.timeColumn}"`)}
          LIMIT ${r.cleanupBatch}
       )
       RETURNING 1
    `);
    const after = await this.preview(job, r);

    await this.db.execute(sql`
      INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, before, after)
      VALUES (${req.player!.worldId}, ${req.player!.playerId}, 'admin.ops.cleanup',
              ${job.table}, NULL,
              ${JSON.stringify({ job: job.id, matched: before.matched, retention: r })}::jsonb,
              ${JSON.stringify({ deleted: deleted.length, remaining: after.matched })}::jsonb)
    `);

    return {
      ...after, ran: true, deleted: deleted.length, remaining: after.matched,
      capped: deleted.length >= r.cleanupBatch,
    };
  }

  /** Tek görevin kuru koşusu: kaç satır eşleşiyor, en eskisi ne kadar, tablo kaç satır. */
  private async preview(
    job: CleanupJob, r: OpsRetention,
  ): Promise<Record<string, unknown> & { matched: number }> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS matched,
             MIN(${sql.raw(`"${job.timeColumn}"`)}) AS oldest,
             (SELECT COUNT(*)::int FROM ${sql.raw(`"${job.table}"`)}) AS table_rows
        FROM ${sql.raw(`"${job.table}"`)}
       WHERE ${job.where(r)}
    `);
    return {
      id: job.id, label: job.label, table: job.table,
      description: job.description, keeps: job.keeps, settings: job.settings,
      matched: Number(row?.['matched'] ?? 0),
      tableRows: Number(row?.['table_rows'] ?? 0),
      oldest: row?.['oldest'] ?? null,
    };
  }

  /**
   * ⭐ ANALYZE — boyut ekranındaki satır tahminlerini tazeler.
   *
   * Yıkıcı değil ama ucuz da değil (tam olmasa da tabloları okur) → adım yükseltmesi arkasında.
   * ⛔ `VACUUM FULL` bilerek YOK: tabloyu tamamen kilitler ve tablo boyutu kadar geçici disk
   * ister; küçük sunucu profilinde (§4.0) bir bakım aracının sunabileceği en tehlikeli düğme
   * olurdu. Şişme sorunu varsa çözüm autovacuum ayarı, panelden tek tık değil.
   */
  @Post('analyze')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async analyze(@Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const started = Date.now();
    await this.db.execute(sql`ANALYZE`);
    return { ok: true, ms: Date.now() - started };
  }
}
