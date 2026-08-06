/**
 * ⭐ SCHEDULER DÖNGÜSÜ (SİSTEM PLANI §1)
 *
 * Her turda: bayat kilitleri kurtar → vadesi gelenleri kilitle → sırayla, her biri kendi
 * transaction'ında çalıştır. Dünya bakımdaysa **yeni görev alınmaz** (çalışan biter — graceful drain).
 *
 * Gecikme sonucu DEĞİŞTİRMEZ: poll aralığı ne olursa olsun görevler `(execute_at, id)` sırasıyla
 * işlenir ve handler `mission.executeAt`'i "şimdi" kabul eder.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { auditLog, outbox } from '../db/schema.ts';
import type { Heartbeat } from '../worker/heartbeat.ts';
import type { GameClockService } from '../world/game-clock.service.ts';
import type { HandlerContext, HandlerRegistry, Tx } from './handler-registry.ts';
import { MissionRepository, type MissionRow } from './mission.repository.ts';

/**
 * Ordular sayfasında satır üreten görev tipleri (`mission.controller.ts` sorgusuyla aynı) —
 * yalnız bunların bitişi `mission:completed` yayınlar; mağara iç işleri, echo vb. yaymaz.
 */
const ARMY_VISIBLE_TYPES: ReadonlySet<string> = new Set([
  'attack', 'return', 'transport', 'support', 'spy', 'found_city', 'cave_return',
]);

export interface SchedulerOptions {
  worldId: number;
  workerId?: string;
  /** Poll aralığı (ms). Görevler dakika/saat mertebesinde → 1 sn fazlasıyla yeter. */
  pollIntervalMs?: number;
  /** Bir turda alınacak en fazla görev. */
  batchSize?: number;
  /** Bu süredir `running` kalan kilit crash sayılır ve kurtarılır. */
  staleLockMs?: number;
  maxAttempts?: number;
  retryBackoffMs?: number;
  onError?: (err: unknown, mission: MissionRow | null) => void;
  /**
   * ⭐ DÜNYA BAZLI MOTOR AYARLARI (§admin Faz 4). Verilmezse handler `ctx.engine` göremez ve
   * motor kendi varsayılanlarını kullanır — testlerde ve ayar servisi olmayan profillerde
   * davranış **değişmez**. Fonksiyon olarak geçiliyor ki ayar panelden değiştiğinde bir
   * sonraki görev güncel değeri görsün (nesne geçseydik süreç ömrü boyunca donardı).
   */
  engineFor?: (worldId: number) => HandlerContext['engine'];
  /**
   * ⭐ CANLILIK NABZI (§admin Faz 8). Verilmezse hiç yazılmaz — testler ve nabız tablosu
   * olmayan profiller etkilenmez.
   */
  heartbeat?: Heartbeat | null;
  /**
   * ⭐ BEKÇİ (2026-08-05) — her turun SONUNDA çağrılır, kendi kendini seyreltmesi beklenir.
   *
   * ⚠️ Var olma sebebi canlıda öğrenildi: `ranking_snapshot` zinciri çalışma sırasında koptu
   * ve sistem bunu **hiçbir yerden** fark etmedi; kurtulmanın tek yolu worker'ı yeniden
   * başlatmaktı ve sıralama 15 saat dondu. Kendi kendini onaran bir kontrol, açılışa bağlı
   * bir kurulumdan çok daha dayanıklı.
   *
   * ⚠️ Hatası YUTULUR ve tura yansımaz: bekçi, koruduğu döngüyü asla düşürmemeli.
   */
  watchdog?: (worldId: number) => Promise<void>;
}

export interface TickResult {
  claimed: number;
  done: number;
  retried: number;
  dead: number;
  reaped: number;
  skippedPaused: boolean;
  lagMs: number;
}

export class SchedulerService {
  private readonly repo: MissionRepository;
  private readonly opts:
    Required<Omit<SchedulerOptions, 'onError' | 'engineFor' | 'heartbeat' | 'watchdog'>>
    & Pick<SchedulerOptions, 'onError' | 'engineFor' | 'heartbeat' | 'watchdog'>;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly db: Db,
    private readonly clock: GameClockService,
    private readonly registry: HandlerRegistry,
    options: SchedulerOptions,
  ) {
    this.repo = new MissionRepository(db);
    this.opts = {
      worldId: options.worldId,
      workerId: options.workerId ?? `worker-${process.pid}`,
      pollIntervalMs: options.pollIntervalMs ?? 1000,
      batchSize: options.batchSize ?? 50,
      staleLockMs: options.staleLockMs ?? 60_000,
      maxAttempts: options.maxAttempts ?? 5,
      retryBackoffMs: options.retryBackoffMs ?? 5_000,
      onError: options.onError,
      engineFor: options.engineFor,
      heartbeat: options.heartbeat,
      watchdog: options.watchdog,
    };
  }

  /** Tek tur. Testler bunu elle çağırır (zamanla yarışmadan davranışı ölçmek için). */
  async tick(): Promise<TickResult> {
    const result: TickResult = {
      claimed: 0, done: 0, retried: 0, dead: 0, reaped: 0, skippedPaused: false, lagMs: 0,
    };

    /**
     * ⚠️ Bu okuma yalnız **bakım kontrolü** için. Görev vadesi ARTIK BURADAN GEÇMİYOR:
     * `claimDue`/`lagMs` oyun saatini kendi SQL'i içinde hesaplıyor (gerekçe:
     * `mission.repository.ts` · `GAME_NOW_SQL`). Buraya `world.gameNow`'u geri koyup
     * depoya parametre olarak vermek 2026-08-03'te canlıda yaşanan hatayı geri getirir.
     */
    const world = await this.clock.read(this.opts.worldId);
    if (world.paused) {
      // Bakım: yeni görev ALINMAZ. Oyun saati de donduğu için vade zaten ilerlemiyor.
      result.skippedPaused = true;
      /**
       * ⚠️ Nabız bakımda da atıyor — bilerek. Bakımdaki bir dünya ile ÖLMÜŞ bir worker
       * bakım panelinde aynı görünseydi (kuyruk ilerlemiyor) yanlış alarm ya da daha
       * kötüsü kaçırılmış alarm üretirdi.
       */
      await this.beat(result);
      return result;
    }

    result.reaped = await this.repo.reapStale(this.opts.worldId, this.opts.staleLockMs);
    result.lagMs = await this.repo.lagMs(this.opts.worldId);

    const claimed = await this.repo.claimDue({
      worldId: this.opts.worldId,
      limit: this.opts.batchSize,
      workerId: this.opts.workerId,
    });
    result.claimed = claimed.length;

    for (const mission of claimed) {
      try {
        await this.runOne(mission);
        result.done++;
      } catch (err) {
        this.opts.onError?.(err, mission);
        const outcome = await this.repo.markFailed(
          mission.id,
          err instanceof Error ? err.message : String(err),
          this.opts.maxAttempts,
          this.opts.retryBackoffMs,
        );
        if (outcome === 'dead') result.dead++;
        else result.retried++;
      }
    }
    /**
     * ⚠️ Bekçi görevlerden SONRA ve `try` içinde: kuyruğu geciktirmemeli ve hatası turu
     * düşürmemeli. Seyreltme bekçinin kendi içinde (scheduler saniyede bir koşuyor).
     */
    try {
      await this.opts.watchdog?.(this.opts.worldId);
    } catch (err) {
      this.opts.onError?.(err, null);
    }
    await this.beat(result);
    return result;
  }

  /** Nabız (§admin Faz 8). Kısıtlama ve hata yutma `Heartbeat`in içinde. */
  private async beat(result: TickResult): Promise<void> {
    await this.opts.heartbeat?.beat({
      claimed: result.claimed, done: result.done, retried: result.retried,
      dead: result.dead, reaped: result.reaped,
      lagMs: result.lagMs, paused: result.skippedPaused,
      pollIntervalMs: this.opts.pollIntervalMs,
    });
  }

  /**
   * Tek görevi tek transaction'da çalıştırır.
   * Handler patlarsa transaction geri alınır → yarım uygulanmış oyun durumu OLUŞMAZ.
   */
  private async runOne(mission: MissionRow): Promise<void> {
    const handler = this.registry.get(mission.type);
    if (!handler) throw new Error(`Kayıtlı handler yok: ${mission.type}`);

    await this.db.transaction(async (tx) => {
      const ctx: HandlerContext = {
        tx: tx as unknown as Tx,
        mission,
        at: mission.executeAt,
        worldId: mission.worldId,
        emit: async (topic, payload) => {
          await tx.insert(outbox).values({ worldId: mission.worldId, topic, payload });
        },
        audit: async (entry) => {
          await tx.insert(auditLog).values({
            worldId: mission.worldId,
            playerId: entry.playerId ?? mission.ownerPlayerId,
            action: entry.action,
            entity: entry.entity ?? null,
            entityId: entry.entityId ?? null,
            before: (entry.before ?? null) as never,
            after: (entry.after ?? null) as never,
            traceId: `mission:${mission.id}`,
          });
        },
        // ⚠️ Her görevde YENİDEN okunuyor: panelden kaydedilen bir sabit, kuyruktaki bir
        // sonraki savaşta etkili olmalı; süreç yeniden başlatmayı beklememeli.
        engine: this.opts.engineFor?.(mission.worldId),
        lockCity: async (cityId) => {
          // Aynı şehre aynı anda düşen görevler seri hâle gelir (§1 sıra kuralı).
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${cityId}::bigint)`);
        },
      };

      await handler(ctx);

      /**
       * ⭐ BİRLEŞİK GÖREV BİTİŞİ (2026-07-30) — Ordular'da görünen her görev tipi için,
       * handler'dan bağımsız TEK yerden `mission:completed` outbox olayı. Üç işi görür:
       * Ordular satırının anlık düşmesi · sol menü rozetinin her sayfada güncellenmesi ·
       * gelecekteki push sink'ine (offline oyuncu) yetecek payload. Handler'ların kendi
       * olayları (battle:resolved, city:changed, …) veri tazelemeyi ayrıca sürdürür.
       * Hedef şehrin SAHİBİ görev satırında yok → tek küçük SELECT (savunan da listesinde
       * "gelen" satırı taşıyordu, onun ekranı da düşmeli).
       */
      if (ARMY_VISIBLE_TYPES.has(mission.type)) {
        let targetPlayerId: number | null = null;
        if (mission.targetCityId != null) {
          const owner = await tx.execute<Record<string, unknown>>(sql`
            SELECT player_id FROM cities WHERE id = ${mission.targetCityId}
          `);
          targetPlayerId = owner[0] ? Number(owner[0]['player_id']) : null;
        } else if (mission.type === 'found_city') {
          /* ⭐ Şehir kurma yarışı: görevin target_city_id'si yok; koordinatta ARADA kurulmuş
           * bir şehir varsa sahibi "gelen saldırı" satırını taşıyordu — onun listesi de düşmeli.
           * (Başarılı kuruluşta şehir az önce görev sahibine kurulmuştur → sahip = owner,
           * bus'taki players() dedup'u çift olayı engeller.) */
          const owner = await tx.execute<Record<string, unknown>>(sql`
            SELECT c.player_id FROM cities c JOIN missions mm ON mm.id = ${mission.id}
             WHERE c.world_id = mm.world_id
               AND c.k = mm.target_k AND c.d = mm.target_d AND c.s = mm.target_s
          `);
          targetPlayerId = owner[0] ? Number(owner[0]['player_id']) : null;
        }
        await tx.insert(outbox).values({
          worldId: mission.worldId,
          topic: 'mission:completed',
          payload: {
            missionId: mission.id,
            type: mission.type,
            ownerPlayerId: mission.ownerPlayerId,
            originCityId: mission.originCityId,
            targetCityId: mission.targetCityId,
            targetPlayerId,
            at: mission.executeAt.toISOString(),
          },
        });
      }

      // Durum geçişi AYNI transaction'da: süreç burada ölürse görev 'running' kalır ve
      // reapStale onu geri kuyruğa alır — yarım iş kalmaz.
      await tx.execute(sql`
        UPDATE missions SET status = 'done', finished_at = now(), locked_by = NULL, locked_at = NULL
         WHERE id = ${mission.id}
      `);
    });
  }

  /** Sürekli döngü. `ROLE=all` profilinde API süreciyle aynı yerde çalışır. */
  start(): void {
    if (this.timer) return;
    this.stopped = false;
    const loop = async (): Promise<void> => {
      if (this.stopped || this.running) return;
      this.running = true;
      try {
        await this.tick();
      } catch (err) {
        this.opts.onError?.(err, null);
      } finally {
        this.running = false;
      }
    };
    this.timer = setInterval(() => void loop(), this.opts.pollIntervalMs);
    void loop();
  }

  /** Graceful stop: çalışan tur bitene kadar bekler. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    while (this.running) await new Promise((r) => setTimeout(r, 10));
  }
}
