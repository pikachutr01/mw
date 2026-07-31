/**
 * Worker montajı — scheduler + outbox dispatcher.
 *
 * Küçük sunucu profilinde (§4.0) `ROLE=all` iken API süreciyle AYNI süreçte çalışır;
 * `ROLE=worker` ise yalnız bu döngüler koşar. Kod aynı, fark yalnız neyin başlatıldığı.
 */
import { CAVE_HANDLERS } from '../cave/cave.handlers.ts';
import { CityService } from '../cities/city.service.ts';
import type { Db } from '../db/client.ts';
import { battleHandlers } from '../missions/battle.handlers.ts';
import { missionHandlers } from '../missions/mission.handlers.ts';
import { echoHandler } from '../missions/echo.handler.ts';
import type { MailSender } from '../mail/mail.service.ts';
import { HandlerRegistry } from '../missions/handler-registry.ts';
import { SchedulerService } from '../missions/scheduler.service.ts';
import { notificationForOutbox } from '../notify/notify.catalog.ts';
import { NotifyService } from '../notify/notify.service.ts';
import { OutboxDispatcher } from '../outbox/outbox.dispatcher.ts';
import { QUEUE_HANDLERS } from '../queues/queue.handlers.ts';
import { createRankingSnapshotHandler, ensureRankingSchedule } from '../ranking/ranking.handler.ts';
import { eventForOutbox, type RealtimeBus } from '../realtime/realtime.bus.ts';
import { GameClockService } from '../world/game-clock.service.ts';

export interface WorkerOptions {
  worldId: number;
  workerId?: string;
  pollIntervalMs?: number;
  /** Gerçek zamanlı yol. Verilmezse olaylar yalnız outbox'ta kalır (testlerde böyle). */
  bus?: RealtimeBus;
  /** Bildirim katmanı (toast + push). Verilmezse bildirim üretilmez — testlerde böyle. */
  notifier?: NotifyService | null;
  /** E-posta göndericisi. Verilmezse `mail:send` satırları bekler (teslim edilmez). */
  mail?: MailSender | null;
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
   *   `transport`/`support`/`spy`/`found_city` → savaş dışı görevler (Faz 2) ✓
   *   `cave_*`          → mağara doldurma/boşaltma + yıkılınca kaçış (Faz 2) ✓
   *   sırada: Faz 4 (hero_revive, vacation_end, abuse_scan)
   */
  const cities = new CityService(db);
  const registry = new HandlerRegistry()
    .register('echo', echoHandler)
    .register('ranking_snapshot', createRankingSnapshotHandler());
  for (const [type, handler] of Object.entries(QUEUE_HANDLERS)) registry.register(type, handler);
  for (const [type, handler] of Object.entries(CAVE_HANDLERS)) registry.register(type, handler);
  for (const [type, handler] of Object.entries(battleHandlers(cities))) registry.register(type, handler);
  for (const [type, handler] of Object.entries(missionHandlers(cities))) registry.register(type, handler);

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
   * ⭐ OUTBOX → GERÇEK ZAMANLI YOL + BİLDİRİM.
   *
   * Teslim garantisi outbox'ta (§1); bu kanal onun **hızlı** ucu. Yayın başarısız olsa bile
   * satır teslim edilmiş sayılır: WS "kaçırılabilir" katmandır, kalıcı kayıt zaten DB'dedir.
   * Aksi hâlde bir soket hatası bildirimi sonsuza kadar yeniden denetirdi.
   *
   * ⚠️ Buraya İKİNCİ bir `dispatcher.on('*', …)` EKLENMEMELİ — `sinkFor` tek sink döndürür
   * (`outbox.dispatcher.ts`), ikinci `'*'` birincisini susturur. Bu yüzden bildirim dalı
   * ayrı bir sink değil, aynı sink'in içinde. (Konuya ÖZEL sink eklemek güvenli: tam eşleşme
   * `'*'`den önce bakılır.)
   *
   * Aynı satırın iki okuyucusu var ve ikisi bilerek ayrı:
   *   • `eventForOutbox`      → "istemci hangi sorguyu tazelesin" (kimlik taşır)
   *   • `notificationForOutbox` → "insana ne yazacağız" (metin üretir)
   * Bir olayın ekranı tazelemesi gerekir ama bildirim üretmesi gerekmeyebilir; tersi de doğru.
   */
  dispatcher.on('*', async (row) => {
    const event = eventForOutbox(row.topic, row.payload, row.worldId);
    if (event) await opts.bus?.publish(event);

    if (opts.notifier) {
      const notes = notificationForOutbox(row.topic, row.payload, row.worldId);
      if (notes.length > 0) await opts.notifier.deliver(notes);
    }
  });

  /**
   * ⭐ E-POSTA (§9.2) — konuya ÖZEL sink. Bu GÜVENLİ: `sinkFor` önce tam eşleşmeye bakar,
   * `'*'` yalnız fallback'tir. Yani `mail:send` satırları yukarıdaki sink'e HİÇ uğramaz
   * (uğramamalı da: bir mailin WS olayı ya da toast'ı olmaz).
   *
   * ⭐ Hata ATILIR — bilerek. Bildirim yolu "en iyi çaba"dır, e-posta değil: şifre sıfırlama
   * maili gitmezse oyuncu hesabına giremez. Hata atılınca dispatcher satırı `attempts++` ile
   * yeniden dener ve 10 denemede dead-letter'a düşer (görünür kalır).
   *
   * ⭐ `Idempotency-Key` = outbox satır id'si → ağ zaman aşımından sonraki yeniden deneme
   * kullanıcının kutusunda İKİNCİ bir mail oluşturmaz. Outbox'ın "en az bir kez" garantisi
   * ile Resend'in tekilleştirmesi tam olarak burada birleşiyor.
   */
  if (opts.mail) {
    dispatcher.on('mail:send', async (row) => {
      const p = row.payload as Record<string, unknown>;
      await opts.mail!.send({
        to: String(p['to'] ?? ''),
        subject: String(p['subject'] ?? ''),
        html: String(p['html'] ?? ''),
        text: String(p['text'] ?? ''),
        idempotencyKey: `outbox-${row.id}`,
      });
    });
  }

  return {
    scheduler,
    dispatcher,
    registry,
    start() {
      scheduler.start();
      dispatcher.start();
      /**
       * ⭐ Sıralama zinciri açılışta garanti edilir. Bilerek **ateşle-unut**: veritabanı bir an
       * için erişilemezse worker yine de kalksın, görev döngüsü zaten çalışmaya devam etsin.
       * Sonraki açılış aynı işi tekrar dener ve tekillik anahtarı kopya üretmez.
       */
      void ensureRankingSchedule(db, opts.worldId).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[ranking] anlik goruntu zinciri kurulamadi:', err);
      });
    },
    async stop() {
      await Promise.all([scheduler.stop(), dispatcher.stop()]);
    },
  };
}
