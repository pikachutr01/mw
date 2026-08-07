/**
 * ⭐⭐ OPERASYON İZLEYİCİSİ (Faz 3) — kuyruğun GEÇMİŞİ + eşik alarmı.
 *
 * ⚠️ **Var olma sebebi tek bir cümle: 06.08.2026'da elimizde hiçbir geçmiş yoktu.** Kuyruk 9,5
 * saat tıkandı; `lagMs` o süre boyunca her turda hesaplandı ve her hesaplama bir öncekinin
 * üzerine yazıldı (`worker_heartbeats` UPSERT'lenen tek satır). Olay bittiğinde geriye kanıt
 * kalmadı, tanı ancak `missions` satırlarından elle çıkarıldı. Ve tek "alarm kanalı" yöneticinin
 * paneli elle açmasıydı — kimse bakmadığı için arıza 9,5 saat sürdü.
 *
 * İki iş yapıyor, ikisi de scheduler turunun SONUNDA ve **hatası yutularak**:
 *   1. **Örnekleme** — dakikada bir `scheduler_samples` satırı (zaman serisi).
 *   2. **Değerlendirme** — `ops-rules.ts` eşikleri → `ops_events` aç/kapa → e-posta.
 *
 * ⚠️ Üç kural `Heartbeat`ten aynen devralındı çünkü aynı tuzak geçerli:
 *   1. **Kısıtlanmış** — izleme, izlediği sistemden fazla yazma üretmemeli (saniyede bir tur,
 *      dakikada bir satır).
 *   2. **Yutan** — izleyicinin hatası görev döngüsünü ASLA düşürmez. Düşürseydi, çözmeye
 *      çalıştığı sorunun aynısını kendisi yaratırdı.
 *   3. **Transaction DIŞINDA** — görevle aynı transaction'da olsaydı görev geri alındığında iz de
 *      geri alınırdı; tam da arıza anında kanıt kaybolurdu.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { TickResult } from '../missions/scheduler.service.ts';
import { OUTBOX_MAX_ATTEMPTS } from '../outbox/outbox.dispatcher.ts';
import { alertText, OPS_RULES, type OpsMetrics, type OpsThresholds } from './ops-rules.ts';

export const DEFAULT_OPS_THRESHOLDS: OpsThresholds = {
  alertLagS: 120,
  alertStuck: 0,
  alertDeadMissions: 0,
  alertOutboxDead: 0,
  alertOldestTxS: 300,
  staleHeartbeatS: 30,
};

export interface OpsMonitorOptions {
  worldId: number;
  workerId?: string;
  /** Örnekleme aralığı. Varsayılan 60 sn — günde ~1.440 satır/dünya. */
  sampleIntervalMs?: number;
  /** Panelden ayarlanan eşikler. Verilmezse varsayılanlar. */
  thresholds?: () => Partial<OpsThresholds>;
  /**
   * Alarm e-postasının gideceği adres. Boşsa olay yine **kaydedilir**, yalnız posta gitmez —
   * geçmiş her hâlükârda tutulmalı (kullanıcının şartı).
   */
  alertTo?: string;
  onError?: (err: unknown) => void;
  /** Testler için enjekte edilebilir saat. */
  now?: () => number;
}

interface MetricsRow extends Record<string, unknown> {
  scheduled: number; running: number; failed: number; recent_dead: number;
  oldest_locked_ms: string | number | null;
  pending: number; dead: number;
  idle_in_tx: number; oldest_tx_s: number;
  dispatcher_age_s: number | null;
}

export class OpsMonitor {
  private lastSample = 0;
  private readonly now: () => number;

  constructor(private readonly db: Db, private readonly opts: OpsMonitorOptions) {
    this.now = opts.now ?? Date.now;
  }

  /** Panelin ve `/healthz?deep=1`in de kullandığı birleşik eşik okuması. */
  thresholds(): OpsThresholds {
    return { ...DEFAULT_OPS_THRESHOLDS, ...(this.opts.thresholds?.() ?? {}) };
  }

  /**
   * Tur sonu kancası. `force` kısıtlamayı atlar (testler ve kapanış için).
   *
   * ⚠️ Kısıtlama ÖNCE: seyreltilen turlarda tek bir sorgu bile atılmıyor. Saniyede bir koşan
   * bir döngüde beş ek sorgu, izlediği kuyruktan fazla yük demekti.
   */
  async observe(result: TickResult, force = false): Promise<void> {
    const t = this.now();
    if (!force && t - this.lastSample < (this.opts.sampleIntervalMs ?? 60_000)) return;
    this.lastSample = t;
    try {
      const metrics = await this.collect(result);
      await this.writeSample(metrics, result);
      await this.evaluate(metrics);
    } catch (err) {
      // Kural 2 — yutulur ama sessiz değil: döngü sahibinin log kanalına düşer.
      this.opts.onError?.(err);
    }
  }

  /**
   * ⭐ TEK SORGU, DÖRT KAYNAK. Ayrı ayrı atsaydık dakikada dört gidiş-dönüş olurdu ve daha kötüsü
   * sayılar **farklı anlara** ait olurdu — bir alarm için "aynı anın fotoğrafı" olması şart.
   *
   * ⚠️ `missions` üzerindeki sayım tam tablo taramasıdır. Bugün ölçek küçük (canlıda 23 oyuncu);
   * büyüdüğünde çözüm indeks değil **saklama süresi**: `ops-jobs.ts`e eklenen `missions` temizlik
   * görevi tabloyu sınırlı tutuyor.
   */
  private async collect(result: TickResult): Promise<OpsMetrics> {
    const [row] = await this.db.execute<MetricsRow>(sql`
      WITH m AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
          COUNT(*) FILTER (WHERE status = 'running')::int   AS running,
          COUNT(*) FILTER (WHERE status = 'failed')::int    AS failed,
          COUNT(*) FILTER (WHERE status = 'failed'
                             AND finished_at > now() - interval '1 hour')::int AS recent_dead,
          (EXTRACT(EPOCH FROM (now() - MIN(locked_at) FILTER (WHERE status = 'running')))
            * 1000)::bigint AS oldest_locked_ms
          FROM missions WHERE world_id = ${this.opts.worldId}
      ), o AS (
        SELECT COUNT(*) FILTER (WHERE dispatched_at IS NULL)::int AS pending,
               COUNT(*) FILTER (WHERE dispatched_at IS NULL
                                  AND attempts >= ${OUTBOX_MAX_ATTEMPTS})::int AS dead
          FROM outbox
      ), p AS (
        SELECT COUNT(*) FILTER (WHERE state = 'idle in transaction')::int AS idle_in_tx,
               COALESCE(EXTRACT(EPOCH FROM (now() - MIN(xact_start)))::int, 0) AS oldest_tx_s
          FROM pg_stat_activity
         WHERE datname = current_database()
           AND backend_type = 'client backend'
           AND pid <> pg_backend_pid()
      ), h AS (
        SELECT EXTRACT(EPOCH FROM (now() - MAX(at)))::int AS dispatcher_age_s
          FROM worker_heartbeats WHERE kind = 'dispatcher'
      )
      SELECT * FROM m, o, p, h
    `);

    const num = (v: unknown): number | null => (v == null ? null : Number(v));
    return {
      worldId: this.opts.worldId,
      paused: result.skippedPaused,
      lagMs: result.lagMs,
      dueCount: result.due,
      claimed: result.claimed,
      skippedLocked: result.skippedLocked,
      stuck: result.stuck,
      scheduled: Number(row?.scheduled ?? 0),
      running: Number(row?.running ?? 0),
      failed: Number(row?.failed ?? 0),
      reaped: result.reaped,
      dead: result.dead,
      recentDead: Number(row?.recent_dead ?? 0),
      oldestLockedAgeMs: num(row?.oldest_locked_ms),
      poolIdleInTx: num(row?.idle_in_tx),
      oldestTxS: num(row?.oldest_tx_s),
      outboxPending: num(row?.pending),
      outboxDead: num(row?.dead),
      dispatcherAgeS: num(row?.dispatcher_age_s),
    };
  }

  private async writeSample(m: OpsMetrics, result: TickResult): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO scheduler_samples (
        world_id, worker_id, lag_ms, due_count, claimed, skipped_locked, stuck,
        scheduled, running, failed, reaped, dead, oldest_locked_age_ms,
        pool_idle_in_tx, oldest_tx_s, outbox_pending, outbox_dead, paused
      ) VALUES (
        ${m.worldId}, ${this.opts.workerId ?? null}, ${m.lagMs}, ${m.dueCount}, ${m.claimed},
        ${m.skippedLocked}, ${m.stuck}, ${m.scheduled}, ${m.running}, ${m.failed},
        ${m.reaped}, ${result.dead}, ${m.oldestLockedAgeMs}, ${m.poolIdleInTx},
        ${m.oldestTxS}, ${m.outboxPending}, ${m.outboxDead}, ${m.paused}
      )
    `);
  }

  /**
   * ⭐⭐ EŞİK DEĞERLENDİRMESİ — olay AÇILIR ve KAPANIR, tekrarlamaz.
   *
   * ⚠️ Bakımdaki dünyada kuyruk kuralları ATLANIYOR ve bu, kapatma da yapılmadığı anlamına gelir:
   * bakım öncesinde açılmış bir olay bakım boyunca AÇIK kalır. Bilerek — bakım arızayı çözmez,
   * yalnız ölçümü anlamsız kılar. Kapatmayı bakımda yapsaydık her bakım, çözülmemiş her alarmı
   * sessizce temizleyen bir düğmeye dönüşürdü.
   */
  private async evaluate(m: OpsMetrics): Promise<void> {
    const t = this.thresholds();
    for (const rule of OPS_RULES) {
      if (rule.skipWhilePaused && m.paused) continue;
      const value = rule.value(m);
      // Ölçülemedi → değerlendirme YOK. Veri yokluğu sağlık kanıtı değildir.
      if (value == null || !Number.isFinite(value)) continue;

      const threshold = rule.threshold(t);
      const worldId = rule.global ? null : m.worldId;

      if (value > threshold) {
        /**
         * ⚠️ Aç-ya-da-güncelle TEK ifadede. İki adıma bölseydik (SELECT sonra INSERT) iki worker
         * arasında bir yarış penceresi kalırdı; `ops_events_open` kısmî unique indeksi zaten
         * ikinci INSERT'ü reddederdi ama o zaman ikinci worker güncelleme de yapamazdı.
         */
        const [ev] = await this.db.execute<Record<string, unknown>>(sql`
          INSERT INTO ops_events (world_id, kind, severity, value, peak, threshold, detail)
          VALUES (${worldId}, ${rule.kind}, ${rule.severity}, ${value}, ${value}, ${threshold},
                  ${JSON.stringify({ label: rule.label, workerId: this.opts.workerId ?? null })}::jsonb)
          ON CONFLICT ((COALESCE(world_id, -1)), kind) WHERE resolved_at IS NULL
          DO UPDATE SET value   = EXCLUDED.value,
                        peak    = GREATEST(ops_events.peak, EXCLUDED.value),
                        samples = ops_events.samples + 1
          RETURNING id, samples, peak, notified_at
        `);
        if (!ev) continue;

        const samples = Number(ev['samples'] ?? 1);
        if (
          rule.severity === 'crit'
          && samples >= rule.sustainSamples
          && ev['notified_at'] == null
          && (this.opts.alertTo ?? '') !== ''
        ) {
          await this.notify(
            Number(ev['id']), rule.kind, value, threshold, worldId,
            Number(ev['peak'] ?? value), samples,
          );
        }
      } else {
        await this.db.execute(sql`
          UPDATE ops_events SET resolved_at = now()
           WHERE kind = ${rule.kind}
             AND COALESCE(world_id, -1) = ${worldId ?? -1}
             AND resolved_at IS NULL
        `);
      }
    }
  }

  /**
   * ⭐ ALARM — mevcut `mail:send` outbox yolu, YENİ ALTYAPI YOK.
   *
   * Kazanç: en-az-bir-kez teslim, `attempts`/`last_error` görünürlüğü, `Idempotency-Key` ile
   * Resend tarafında tekilleştirme — hepsi `worker.ts`teki sink'te zaten çözülmüş. Ayrı bir
   * gönderici yazsaydık aynı üç sorunu ikinci kez, bu kez test edilmemiş biçimde çözmemiz gerekirdi.
   *
   * ⚠️ TEK TRANSACTION ve **önce bildirim hakkı alınıyor**: `notified_at`i `IS NULL` koşuluyla
   * güncelleyip sıfır satır dönerse başka biri (ya da önceki bir tur) postayı çoktan yazmıştır.
   * Sıralamayı ters kursaydık — önce posta, sonra işaret — arada bir çökme çift posta üretirdi.
   */
  private async notify(
    eventId: number, kind: string, value: number, threshold: number,
    worldId: number | null, peak: number, samples: number,
  ): Promise<void> {
    const rule = OPS_RULES.find((r) => r.kind === kind);
    if (!rule) return;
    const { subject, text } = alertText(rule, value, threshold, worldId, peak, samples);

    await this.db.transaction(async (tx) => {
      const claimed = await tx.execute<Record<string, unknown>>(sql`
        UPDATE ops_events SET notified_at = now()
         WHERE id = ${eventId} AND notified_at IS NULL
        RETURNING id
      `);
      if (claimed.length === 0) return;

      const [row] = await tx.execute<Record<string, unknown>>(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (${worldId}, 'mail:send', ${JSON.stringify({
    to: this.opts.alertTo,
    subject,
    text,
    html: `<pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${
      text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c))
    }</pre>`,
  })}::jsonb)
        RETURNING id
      `);
      await tx.execute(sql`
        UPDATE ops_events SET outbox_id = ${Number(row?.['id'] ?? 0)} WHERE id = ${eventId}
      `);
    });
  }
}
