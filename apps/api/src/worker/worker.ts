/**
 * Worker montajı — scheduler + outbox dispatcher.
 *
 * Küçük sunucu profilinde (§4.0) `ROLE=all` iken API süreciyle AYNI süreçte çalışır;
 * `ROLE=worker` ise yalnız bu döngüler koşar. Kod aynı, fark yalnız neyin başlatıldığı.
 */
import { CityService } from '../cities/city.service.ts';
import type { Db } from '../db/client.ts';
import { battleHandlers } from '../missions/battle.handlers.ts';
import { echoHandler } from '../missions/echo.handler.ts';
import { HandlerRegistry } from '../missions/handler-registry.ts';
import { SchedulerService } from '../missions/scheduler.service.ts';
import { OutboxDispatcher } from '../outbox/outbox.dispatcher.ts';
import { QUEUE_HANDLERS } from '../queues/queue.handlers.ts';
import { eventForOutbox, type RealtimeBus } from '../realtime/realtime.bus.ts';
import { GameClockService } from '../world/game-clock.service.ts';

export interface WorkerOptions {
  worldId: number;
  workerId?: string;
  pollIntervalMs?: number;
  /** Gerçek zamanlı yol. Verilmezse olaylar yalnız outbox'ta kalır (testlerde böyle). */
  bus?: RealtimeBus;
}

export interface Worker {
  scheduler: SchedulerService;
  dispatcher: OutboxDispatcher;
  registry: HandlerRegistry;
  start(): void;
  stop(): Promise<void>;
}

export function createWorker(db: Db, opts: WorkerOptions): Worker {
  const clock = new GameClockService(db);

  /**
   * Görev tipleri (§1: "hepsi aynı çatı").
   *   `echo`            → omurgayı ölçen sahte tip (Faz 1)
   *   `*_finish`        → kuyruk bitişleri (Faz 2) ✓
   *   `attack`/`return` → savaş çözümü + dönüş bacağı (Faz 2) ✓
   *   sırada: Faz 3 (nakliye/casusluk/şehir kurma), Faz 4 (hero_revive, vacation_end, abuse_scan)
   */
  const cities = new CityService(db);
  const registry = new HandlerRegistry().register('echo', echoHandler);
  for (const [type, handler] of Object.entries(QUEUE_HANDLERS)) registry.register(type, handler);
  for (const [type, handler] of Object.entries(battleHandlers(cities))) registry.register(type, handler);

  const scheduler = new SchedulerService(db, clock, registry, {
    worldId: opts.worldId,
    workerId: opts.workerId,
    pollIntervalMs: opts.pollIntervalMs,
    onError: (err, mission) => {
      // eslint-disable-next-line no-console
      console.error(`[scheduler] görev ${mission?.id ?? '-'} (${mission?.type ?? '-'}) hata:`, err);
    },
  });

  const dispatcher = new OutboxDispatcher(db, {
    onError: (err, row) => {
      // eslint-disable-next-line no-console
      console.error(`[outbox] satır ${row?.id ?? '-'} (${row?.topic ?? '-'}) teslim edilemedi:`, err);
    },
  });

  /**
   * ⭐ OUTBOX → GERÇEK ZAMANLI YOL.
   *
   * Teslim garantisi outbox'ta (§1); bu kanal onun **hızlı** ucu. Yayın başarısız olsa bile
   * satır teslim edilmiş sayılır: WS "kaçırılabilir" katmandır, kalıcı kayıt zaten DB'dedir.
   * Aksi hâlde bir soket hatası bildirimi sonsuza kadar yeniden denetirdi.
   */
  dispatcher.on('*', async (row) => {
    const event = eventForOutbox(row.topic, row.payload, row.worldId);
    if (event) await opts.bus?.publish(event);
  });

  return {
    scheduler,
    dispatcher,
    registry,
    start() {
      scheduler.start();
      dispatcher.start();
    },
    async stop() {
      await Promise.all([scheduler.stop(), dispatcher.stop()]);
    },
  };
}
