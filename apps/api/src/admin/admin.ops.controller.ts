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
  BadRequestException, Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { RULES_BY_KIND } from '../ops/ops-rules.ts';
import { OUTBOX_MAX_ATTEMPTS } from '../outbox/outbox.dispatcher.ts';
import { SettingsService } from '../settings/settings.service.ts';
import { AdminGuard, AdminStepUpGuard, type AdminRequest } from './admin.guard.ts';
import { CLEANUP_JOBS, JOBS_BY_ID, type CleanupJob, type OpsRetention } from './ops-jobs.ts';
import { currentTraceId } from '../common/request-context.ts';

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
      deviceSignalDays: g['deviceSignalDays'] ?? 90,
      cleanupBatch: g['cleanupBatch'] ?? 20_000,
      staleHeartbeatS: g['staleHeartbeatS'] ?? 30,
      schedulerSampleDays: g['schedulerSampleDays'] ?? 30,
      missionDoneDays: g['missionDoneDays'] ?? 60,
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
     * Görev kuyruğu.
     *
     * ⚠️⚠️ **BURADA BOZUK BİR KOPYA VARDI (2026-08-07'de düzeltildi).** İfade
     * `now() - clock_offset_ms` yazıyordu — `COALESCE(paused_at, …)` **eksikti**. Hemen
     * üstündeki yorum *"bakımdaki her dünya saatlerce gecikmiş görünmesin"* diyordu ama kod
     * tam olarak onu yapıyordu: bakım sırasında gecikme gerçek zamanla büyümeye devam ediyor
     * ve operatör panele en çok baktığı anda sahte bir kuyruk birikimi görüyordu. Aynı metrik
     * `mission.repository.ts`te doğru hesaplanıyordu → iki yerde iki farklı sonuç.
     *
     * Ders: bu ifadenin beş kopyası vardı ve dördü doğruydu. Tek zaman çizgisiyle formül
     * `COALESCE(paused_at, now())`e indi; bakımda DONMASI hâlâ şart.
     */
    const missions = await this.db.execute<Record<string, unknown>>(sql`
      SELECT w.id AS world_id, w.name, w.state,
             COUNT(*) FILTER (WHERE m.status = 'scheduled')::int AS scheduled,
             COUNT(*) FILTER (WHERE m.status = 'running')::int   AS running,
             COUNT(*) FILTER (WHERE m.status = 'failed')::int    AS failed,
             EXTRACT(EPOCH FROM (
               COALESCE(w.paused_at, now())
               - MIN(m.execute_at) FILTER (WHERE m.status = 'scheduled')
             ))::int AS lag_s
        FROM worlds w LEFT JOIN missions m ON m.world_id = w.id
       GROUP BY w.id, w.name, w.state, w.paused_at
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
   * ⭐⭐ OLAY GEÇMİŞİ (Faz 3) — panelin *"dün gece ne oldu"* sorusuna cevabı.
   *
   * ⚠️ `health` ucu ANLIK durumu gösteriyor ve tam da bu yüzden 06.08.2026'da işe yaramadı:
   * arıza fark edildiğinde çoktan bitmişti, panelde her şey yeşildi. Bu uç açık olayları da
   * kapanmışları da veriyor; kapanmış bir olay bir arızanın **kanıtı** ve süresidir.
   */
  @Get('events')
  async events(@Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, world_id, kind, severity, opened_at, resolved_at, value, peak, threshold,
             samples, detail, notified_at, outbox_id,
             EXTRACT(EPOCH FROM (COALESCE(resolved_at, now()) - opened_at))::int AS duration_s
        FROM ops_events
       WHERE world_id IS NULL OR world_id = ${req.player!.worldId}
       ORDER BY resolved_at IS NULL DESC, opened_at DESC
       LIMIT 100
    `);
    return {
      events: rows.map((e) => ({
        id: Number(e['id']),
        worldId: e['world_id'] == null ? null : Number(e['world_id']),
        kind: String(e['kind']),
        label: RULES_BY_KIND[String(e['kind'])]?.label ?? String(e['kind']),
        hint: RULES_BY_KIND[String(e['kind'])]?.hint ?? null,
        severity: String(e['severity']),
        openedAt: e['opened_at'], resolvedAt: e['resolved_at'] ?? null,
        open: e['resolved_at'] == null,
        durationS: Number(e['duration_s'] ?? 0),
        value: e['value'] == null ? null : Number(e['value']),
        peak: e['peak'] == null ? null : Number(e['peak']),
        threshold: e['threshold'] == null ? null : Number(e['threshold']),
        samples: Number(e['samples'] ?? 1),
        notifiedAt: e['notified_at'] ?? null,
      })),
    };
  }

  /**
   * ⭐ KUYRUK ÖLÇÜM SERİSİ (Faz 3) — `scheduler_samples`ın son N saati.
   *
   * ⚠️ Ham satırlar dönüyor, sunucuda toplulaştırılmıyor: 24 saat = 1.440 satır ve bu bir
   * grafiğin çizeceği nokta sayısından fazla değil. Toplulaştırma **tepe noktalarını siler** ve
   * arıza tam olarak tepe noktasıdır.
   */
  @Get('samples')
  async samples(
    @Req() req: AdminRequest, @Query('hours') hours?: string,
  ): Promise<Record<string, unknown>> {
    const h = Math.min(Math.max(Number(hours ?? 24) || 24, 1), 168);
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT at, lag_ms, due_count, claimed, skipped_locked, stuck, scheduled, running, failed,
             reaped, dead, oldest_locked_age_ms, pool_idle_in_tx, oldest_tx_s,
             outbox_pending, outbox_dead, paused
        FROM scheduler_samples
       WHERE world_id = ${req.player!.worldId} AND at > now() - (${h} * interval '1 hour')
       ORDER BY at
    `);
    return {
      hours: h,
      samples: rows.map((s) => ({
        at: s['at'],
        lagMs: Number(s['lag_ms'] ?? 0), due: Number(s['due_count'] ?? 0),
        claimed: Number(s['claimed'] ?? 0), skippedLocked: Number(s['skipped_locked'] ?? 0),
        stuck: Number(s['stuck'] ?? 0), scheduled: Number(s['scheduled'] ?? 0),
        running: Number(s['running'] ?? 0), failed: Number(s['failed'] ?? 0),
        reaped: Number(s['reaped'] ?? 0), dead: Number(s['dead'] ?? 0),
        oldestLockedAgeMs: s['oldest_locked_age_ms'] == null
          ? null : Number(s['oldest_locked_age_ms']),
        poolIdleInTx: s['pool_idle_in_tx'] == null ? null : Number(s['pool_idle_in_tx']),
        oldestTxS: s['oldest_tx_s'] == null ? null : Number(s['oldest_tx_s']),
        outboxPending: s['outbox_pending'] == null ? null : Number(s['outbox_pending']),
        outboxDead: s['outbox_dead'] == null ? null : Number(s['outbox_dead']),
        paused: Boolean(s['paused']),
      })),
    };
  }

  /**
   * ⭐ GÖREV HATA GEÇMİŞİ (Faz 3) — `missions.last_error` üzerine yazıyordu, ilk hata kayıptı.
   * ⚠️ Sıralama `at DESC` ama görev başına gruplama yapılmıyor: bir görevin BEŞ denemesini de
   * görmek isteniyor — tanı için gereken genelde ilkidir.
   */
  @Get('mission-errors')
  async missionErrors(@Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT e.id, e.mission_id, e.at, e.attempt, e.mission_type, e.error, e.outcome,
             e.worker_id, m.status AS mission_status, m.execute_at
        FROM mission_errors e
        LEFT JOIN missions m ON m.id = e.mission_id
       WHERE e.world_id = ${req.player!.worldId}
       ORDER BY e.at DESC, e.id DESC
       LIMIT 200
    `);
    return {
      errors: rows.map((e) => ({
        id: Number(e['id']), missionId: Number(e['mission_id']), at: e['at'],
        attempt: Number(e['attempt'] ?? 0), type: e['mission_type'] ?? null,
        error: String(e['error']).slice(0, 2000), outcome: String(e['outcome']),
        workerId: e['worker_id'] ?? null,
        missionStatus: e['mission_status'] ?? null, executeAt: e['execute_at'] ?? null,
      })),
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
      INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, before, after, trace_id)
      VALUES (${req.player!.worldId}, ${req.player!.playerId}, 'admin.ops.cleanup',
              ${job.table}, NULL,
              ${JSON.stringify({ job: job.id, matched: before.matched, retention: r })}::jsonb,
              ${JSON.stringify({ deleted: deleted.length, remaining: after.matched })}::jsonb, ${currentTraceId()})
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
