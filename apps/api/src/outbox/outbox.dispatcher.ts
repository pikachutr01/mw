/**
 * ⭐ OUTBOX DISPATCHER (SİSTEM PLANI §1)
 *
 * Outbox satırı, onu doğuran oyun mutasyonuyla aynı transaction'da yazıldı; dispatcher onu
 * **en az bir kez** teslim eder. Teslim edilemezse satır durur ve yeniden denenir — bildirim
 * kaybolmaz. Rapor her hâlükârda DB'de olduğu için bildirim gitmese bile oyuncu girince görür.
 *
 * Teslim hedefleri (sırayla eklenecek): WS yayını → oyuncu offline ise Web Push / FCM.
 * Faz 1'de yalnız iskelet + kanal kaydı var; gerçek WS gateway Faz 2'de bağlanır.
 */
import { sql } from 'drizzle-orm';
import { toDate } from '../db/client.ts';
import type { Db } from '../db/client.ts';
import type { Heartbeat } from '../worker/heartbeat.ts';

export type OutboxSink = (row: OutboxRow) => Promise<void>;

/**
 * Deneme hakkı. Bu sayıya ulaşan satır **ölü mektup**tur: dispatcher bir daha almaz, satır
 * görünür kalır (§8 alarm konusu).
 *
 * ⚠️ Bakım paneli de bu sabiti okuyor (`admin.ops.controller`). Orada 10 yazsaydık ve burada
 * değişseydi panel "3 ölü mektup" derken dispatcher hâlâ deniyor olurdu — tek kaynak burası.
 */
export const OUTBOX_MAX_ATTEMPTS = 10;

export interface OutboxRow {
  id: number;
  worldId: number | null;
  topic: string;
  payload: Record<string, unknown>;
  attempts: number;
  /**
   * ⭐ Satırın yazılma anı — **idempotency anahtarını benzersizleştirmek için** taşınıyor
   * (2026-08-03). Tek başına `id` yetmiyor: `id` bir dizi sayacı ve veritabanı sıfırlanınca
   * 1'den yeniden başlıyor. Gerekçesi `worker.ts`'teki `mail:send` sink'inde.
   */
  createdAt: Date;
}

interface OutboxRowRaw extends Record<string, unknown> {
  id: number | string;
  worldId: number | null;
  topic: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export interface DispatcherOptions {
  batchSize?: number;
  maxAttempts?: number;
  pollIntervalMs?: number;
  onError?: (err: unknown, row: OutboxRow | null) => void;
  /**
   * ⭐ CANLILIK NABZI (§admin Faz 8). Scheduler'ınkinden AYRI satır yazar: bu döngü bir
   * e-posta sink'inde bloke olurken scheduler koşmaya devam edebilir ve tek bir "worker
   * yaşıyor" satırı bu ayrımı gizlerdi.
   */
  heartbeat?: Heartbeat | null;
}

export class OutboxDispatcher {
  private readonly sinks = new Map<string, OutboxSink>();
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private stopped = false;
  private readonly opts: Required<Omit<DispatcherOptions, 'onError' | 'heartbeat'>>
    & Pick<DispatcherOptions, 'onError' | 'heartbeat'>;

  constructor(private readonly db: Db, options: DispatcherOptions = {}) {
    this.opts = {
      batchSize: options.batchSize ?? 100,
      maxAttempts: options.maxAttempts ?? OUTBOX_MAX_ATTEMPTS,
      pollIntervalMs: options.pollIntervalMs ?? 500,
      onError: options.onError,
      heartbeat: options.heartbeat,
    };
  }

  /** Bakım paneli bu eşiğe göre "ölü mektup" sayar; tek doğruluk kaynağı dispatcher'ın kendisi. */
  get maxAttempts(): number {
    return this.opts.maxAttempts;
  }

  /** Konu başına teslim kanalı. `*` tüm konuları yakalar (log/metrik için kullanışlı). */
  on(topic: string, sink: OutboxSink): this {
    this.sinks.set(topic, sink);
    return this;
  }

  private sinkFor(topic: string): OutboxSink | undefined {
    return this.sinks.get(topic) ?? this.sinks.get('*');
  }

  /** Tek tur: bekleyen satırları alıp teslim eder. Testler bunu elle çağırır. */
  async tick(): Promise<{ dispatched: number; failed: number; skipped: number }> {
    // SKIP LOCKED: birden çok dispatcher aynı satırı iki kez göndermez.
    const raw = await this.db.execute<OutboxRowRaw>(sql`
      SELECT id, world_id AS "worldId", topic, payload, attempts, created_at AS "createdAt"
        FROM outbox
       WHERE dispatched_at IS NULL AND attempts < ${this.opts.maxAttempts}
       ORDER BY id
         FOR UPDATE SKIP LOCKED
       LIMIT ${this.opts.batchSize}
    `);
    const rows: OutboxRow[] = raw.map((r) => ({
      id: Number(r.id),
      worldId: r.worldId == null ? null : Number(r.worldId),
      topic: r.topic,
      payload: r.payload ?? {},
      attempts: Number(r.attempts),
      // ⚠️ postgres.js `timestamptz`i DİZE döndürebiliyor — sınırda `toDate()` (projenin tuzağı).
      createdAt: toDate(r['createdAt']),
    }));

    let dispatched = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of rows) {
      const sink = this.sinkFor(row.topic);
      if (!sink) {
        skipped++;
        continue;   // kanal kayıtlı değil → satır bekler (Faz 2'de WS bağlanınca gider)
      }
      try {
        await sink(row);
        await this.db.execute(sql`UPDATE outbox SET dispatched_at = now() WHERE id = ${row.id}`);
        dispatched++;
      } catch (err) {
        failed++;
        this.opts.onError?.(err, row);
        await this.db.execute(sql`
          UPDATE outbox SET attempts = attempts + 1, last_error = ${String(err).slice(0, 2000)}
           WHERE id = ${row.id}
        `);
      }
    }
    await this.opts.heartbeat?.beat({
      dispatched, failed, skipped, batch: rows.length,
      pollIntervalMs: this.opts.pollIntervalMs,
      /** Kayıtlı konular: "sink yok → satır bekliyor" tanısı panelde bununla kurulur. */
      topics: [...this.sinks.keys()],
    });
    return { dispatched, failed, skipped };
  }

  /** Ölü mektup kutusu: deneme hakkı tükenmiş satırlar (alarm konusu, §8). */
  async deadLetterCount(): Promise<number> {
    const rows = await this.db.execute<{ n: number } & Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM outbox
       WHERE dispatched_at IS NULL AND attempts >= ${this.opts.maxAttempts}
    `);
    return Number(rows[0]?.n ?? 0);
  }

  async pendingCount(): Promise<number> {
    const rows = await this.db.execute<{ n: number } & Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM outbox WHERE dispatched_at IS NULL
    `);
    return Number(rows[0]?.n ?? 0);
  }

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    const loop = async (): Promise<void> => {
      if (this.stopped || this.busy) return;
      this.busy = true;
      try {
        await this.tick();
      } catch (err) {
        this.opts.onError?.(err, null);
      } finally {
        this.busy = false;
      }
    };
    this.timer = setInterval(() => void loop(), this.opts.pollIntervalMs);
    void loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    while (this.busy) await new Promise((r) => setTimeout(r, 10));
  }
}
