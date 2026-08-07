/**
 * Worker montajı — scheduler + outbox dispatcher.
 *
 * Küçük sunucu profilinde (§4.0) `ROLE=all` iken API süreciyle AYNI süreçte çalışır;
 * `ROLE=worker` ise yalnız bu döngüler koşar. Kod aynı, fark yalnız neyin başlatıldığı.
 */
import type { CombatConfig, DeepPartial, LootConfig } from '@mobilwar/engine';
import type { MeritConfig } from '@mobilwar/catalog';
import { CAVE_HANDLERS } from '../cave/cave.handlers.ts';
import { CityService } from '../cities/city.service.ts';
import type { Db } from '../db/client.ts';
import { battleHandlers } from '../missions/battle.handlers.ts';
import { missionHandlers } from '../missions/mission.handlers.ts';
import { echoHandler } from '../missions/echo.handler.ts';
import type { MailSender } from '../mail/mail.service.ts';
import { HandlerRegistry } from '../missions/handler-registry.ts';
import { SchedulerService } from '../missions/scheduler.service.ts';
import { log } from '../common/logger.ts';
import { MAIL } from '../mail/mail.limits.ts';
import { notificationForOutbox } from '../notify/notify.catalog.ts';
import { NotifyService } from '../notify/notify.service.ts';
import { retentionOf } from '../admin/ops-jobs.ts';
import { createCleanupHandler, ensureCleanupSchedule } from '../ops/cleanup.handler.ts';
import { OpsMonitor } from '../ops/ops-monitor.ts';
import type { OpsThresholds } from '../ops/ops-rules.ts';
import { OutboxDispatcher } from '../outbox/outbox.dispatcher.ts';
import { QUEUE_HANDLERS } from '../queues/queue.handlers.ts';
import { createAbuseScanHandler, ensureAbuseScanSchedule } from '../abuse/scan.handler.ts';
import {
  createRankingSnapshotHandler, createRankingWatchdog, ensureRankingSchedule,
} from '../ranking/ranking.handler.ts';
import { createVacationEndHandler } from '../vacation/vacation.handler.ts';
import { eventForOutbox, type RealtimeBus } from '../realtime/realtime.bus.ts';
import { GameClockService } from '../world/game-clock.service.ts';
import { Heartbeat } from './heartbeat.ts';

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
  /**
   * ⭐ AYAR SERVİSİ (§admin Faz 4) — savaş motorunun dünya bazlı sabitleri buradan geliyor.
   * Verilmezse motor varsayılanları kullanılır ve davranış **değişmez**; testler bu yüzden
   * onu geçmeden çalışmaya devam ediyor.
   */
  settings?: {
    combat(worldId: number): DeepPartial<CombatConfig> | undefined;
    loot(worldId: number): Partial<LootConfig> | undefined;
    /** Askerî ünvan eşikleri/süreleri (§ünvanlar). */
    merit(worldId: number): MeritConfig | undefined;
    revisionId(worldId: number): number | null;
    /**
     * ⭐ Faz 3 — operasyon eşikleri (`ops` grubu). Yapısal tipleme sayesinde `SettingsService`
     * bunu zaten karşılıyor; opsiyonel çünkü testlerdeki sahte ayar nesneleri bilmiyor.
     */
    group?(worldId: number, id: string): Readonly<Record<string, unknown>>;
  } | null;
}

export interface Worker {
  scheduler: SchedulerService;
  dispatcher: OutboxDispatcher;
  registry: HandlerRegistry;
  start(): void;
  stop(): Promise<void>;
}

const SCHED_LOG = log('scheduler');
const OUTBOX_LOG = log('outbox');
const OPS_LOG = log('ops');

export function createWorker(db: Db, opts: WorkerOptions): Worker {
  const clock = new GameClockService(db);
  const workerId = opts.workerId ?? `worker-${process.pid}`;

  /**
   * ⭐⭐ OPERASYON İZLEYİCİSİ (Faz 3) — kuyruğun GEÇMİŞİ + eşik alarmı.
   *
   * ⚠️ Eşikler her turda YENİDEN okunuyor (fonksiyon geçiliyor, nesne değil): panelden bir eşik
   * değiştirildiğinde bir sonraki değerlendirme onu görmeli, yeniden başlatma beklememeli —
   * `engineFor` ile aynı gerekçe.
   */
  const monitor = new OpsMonitor(db, {
    worldId: opts.worldId,
    workerId,
    thresholds: opts.settings?.group
      ? () => opts.settings!.group!(opts.worldId, 'ops') as Partial<OpsThresholds>
      : undefined,
    alertTo: MAIL.alertTo,
    onError: (err) => { OPS_LOG.error({ err }, 'örnekleme/değerlendirme hatası'); },
  });

  /**
   * ⭐ SAKLAMA SÜRELERİ (Faz 3) — panelden okunur, her koşuda TAZE.
   *
   * ⚠️ Ayar servisi yoksa (testler, sade profiller) varsayılanlara düşülüyor. Bu güvenli çünkü
   * varsayılanlar şema varsayılanlarının **birebir aynısı** (`retentionOf`, tek kaynak).
   */
  const retentionFor = (worldId: number) =>
    retentionOf(opts.settings?.group?.(worldId, 'ops') ?? {});

  /**
   * Görev tipleri (§1: "hepsi aynı çatı").
   *   `echo`            → omurgayı ölçen sahte tip (Faz 1)
   *   `*_finish`        → kuyruk bitişleri (Faz 2) ✓
   *   `attack`/`return` → savaş çözümü + dönüş bacağı (Faz 2) ✓
   *   `transport`/`support`/`spy`/`found_city` → savaş dışı görevler (Faz 2) ✓
   *   `cave_*`          → mağara doldurma/boşaltma + yıkılınca kaçış (Faz 2) ✓
   *   `vacation_end`    → 30 günlük tatil üst sınırı dolunca otomatik çıkış ✓
   *   `abuse_scan`     → çoklu hesap davranış taraması (§9.1.3) ✓
   *   sırada: Faz 4 (hero_revive)
   */
  const cities = new CityService(db);
  const registry = new HandlerRegistry()
    .register('echo', echoHandler)
    .register('ranking_snapshot', createRankingSnapshotHandler())
    .register('abuse_scan', createAbuseScanHandler())
    .register('vacation_end', createVacationEndHandler())
    /** ⭐ Faz 3: gecelik saklama süresi uygulaması. Zincir kendi kendini yazıyor. */
    .register('ops_cleanup', createCleanupHandler(retentionFor));
  for (const [type, handler] of Object.entries(QUEUE_HANDLERS)) registry.register(type, handler);
  for (const [type, handler] of Object.entries(CAVE_HANDLERS)) registry.register(type, handler);
  for (const [type, handler] of Object.entries(battleHandlers(cities))) registry.register(type, handler);
  for (const [type, handler] of Object.entries(missionHandlers(cities))) registry.register(type, handler);

  const scheduler = new SchedulerService(db, clock, registry, {
    worldId: opts.worldId,
    workerId,
    pollIntervalMs: opts.pollIntervalMs,
    /**
     * ⭐ CANLILIK (§admin Faz 8) — iki döngü, İKİ ayrı nabız. Tek satır tutsaydık dispatcher
     * bir sink'te bloke olurken scheduler'ın nabzı "worker sağlıklı" demeye devam ederdi.
     */
    heartbeat: new Heartbeat(db, 'scheduler', { workerId, worldId: opts.worldId }),
    /**
     * ⭐ Zincir bekçisi (2026-08-05). Açılıştaki `ensureRankingSchedule` yetmiyor: zincir
     * çalışma sırasında koparsa yeniden başlatmaya kadar ölü kalıyor — canlıda 15 saat sürdü.
     */
    watchdog: createRankingWatchdog(db),
    /** ⭐ Faz 3: dakikada bir `scheduler_samples` + eşik değerlendirmesi. Seyreltme içeride. */
    sampler: (result) => monitor.observe(result),
    onError: (err, mission) => {
      SCHED_LOG.error(
        { err, missionId: mission?.id ?? null, missionType: mission?.type ?? null },
        'görev hatası',
      );
    },
    // ⚠️ `undefined` bırakılıyorsa handler `ctx.engine` görmez ve motor varsayılanını kullanır.
    engineFor: opts.settings
      ? (worldId) => ({
        combat: opts.settings!.combat(worldId),
        loot: opts.settings!.loot(worldId),
        merit: opts.settings!.merit(worldId),
        settingsRevisionId: opts.settings!.revisionId(worldId),
      })
      : undefined,
  });

  const dispatcher = new OutboxDispatcher(db, {
    heartbeat: new Heartbeat(db, 'dispatcher', { workerId, worldId: opts.worldId }),
    onError: (err, row) => {
      OUTBOX_LOG.error(
        { err, outboxId: row?.id ?? null, topic: row?.topic ?? null },
        'satır teslim edilemedi',
      );
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
        /**
         * ⚠️⚠️ **ANAHTAR `id` TEK BAŞINA YETMEZ** (2026-08-03, canlıda yaşandı).
         *
         * `outbox-<id>` kullanılıyordu ve şu hatayı üretti: canlı veritabanı sıfırlandığında
         * `outbox.id` dizisi 1'den yeniden başladı, ama Resend o anahtarları **son 24 saatte
         * görmüştü** (sıfırlamadan önceki satırlar). Yeni kayıt maili aynı anahtarla ama
         * farklı gövdeyle gidince Resend **409 `invalid_idempotent_request`** döndürdü ve
         * doğrulama e-postası HİÇ gitmedi — üstelik ekranda "gönderdik" yazıyordu.
         *
         * `created_at` eklemek anahtarı gerçekten benzersiz yapıyor: aynı satırın yeniden
         * denenmesinde DEĞİŞMEZ (idempotency'nin asıl amacı korunur), ama sıfırlanmış bir
         * veritabanının ya da başka bir ortamın aynı `id`si artık çakışmaz.
         */
        idempotencyKey: `outbox-${row.id}-${row.createdAt.getTime()}`,
      });
    });

    /**
     * ⭐⭐ ÇOKLU HESAP RAPORU — **bu satır bugüne kadar HİÇBİR YERE GİTMİYORDU** (Faz 3'te ölçüldü).
     *
     * `scan.service.ts` §9.1.4'ün gerektirdiği haftalık raporu `admin:abuse_report` konusuyla
     * outbox'a yazıyor ve `abuse_scan_runs.emailed_at`i işaretliyordu — ama o konu için ne bir
     * sink vardı ne de `notify.catalog.ts`te bir karşılığı. Satır `'*'` sink'ine düşüyor,
     * `eventForOutbox` `null` dönüyor (`realtime.test.ts` bunu zaten kilitliyor), hiçbir şey
     * üretilmeden **teslim edilmiş** işaretleniyordu. Yani sistem raporu yazıyor, "gönderdim"
     * diyor ve kimseye ulaşmıyordu.
     *
     * ⚠️ Konuya ÖZEL sink olduğu için `'*'`i susturmuyor (`sinkFor` önce tam eşleşmeye bakar).
     * ⚠️ Hata ATILIR: bu bir operasyon raporu, "en iyi çaba" bildirimi değil — gitmezse satır
     * yeniden denensin ve gitmemişse ölü mektup kuyruğunda GÖRÜNSÜN.
     */
    if (MAIL.alertTo !== '') {
      dispatcher.on('admin:abuse_report', async (row) => {
        const p = row.payload as Record<string, unknown>;
        const pairs = Array.isArray(p['pairs']) ? p['pairs'] as Record<string, unknown>[] : [];
        const lines = pairs.map((x) =>
          `• ${String(x['a'])} ↔ ${String(x['b'])} — puan ${String(x['score'])} `
          + `(${(x['signals'] as string[] | undefined)?.join(', ') ?? ''})`);
        const notes = Object.entries((p['innocentNotes'] ?? {}) as Record<string, string>)
          .map(([k, v]) => `  ${k}: ${v}`);
        const text = [
          `Dünya ${String(p['worldId'])} · pencere ${String(p['windowFrom'])} → ${String(p['windowTo'])}`,
          `Eşik: ${String(p['threshold'])} · eşiği geçen çift: ${pairs.length}`,
          '', ...lines, '',
          'Masum açıklamalar:', ...notes, '',
          String(p['reminder'] ?? ''),
        ].join('\n');
        await opts.mail!.send({
          to: MAIL.alertTo,
          subject: `[MobilWar] Çoklu hesap raporu — dünya ${String(p['worldId'])}`,
          text,
          html: `<pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${
            text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c))
          }</pre>`,
          idempotencyKey: `outbox-${row.id}-${row.createdAt.getTime()}`,
        });
      });
    }
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
        SCHED_LOG.error({ err }, 'siralama anlik goruntu zinciri kurulamadi');
      });
      // Çoklu hesap taraması aynı desenle: ateşle-unut, tekillik anahtarı kopya üretmiyor.
      void ensureAbuseScanSchedule(db, opts.worldId).catch((err: unknown) => {
        SCHED_LOG.error({ err }, 'istismar tarama zinciri kurulamadi');
      });
      /**
       * ⭐ Gecelik temizlik zinciri (Faz 3). Aynı ateşle-unut deseni.
       * ⚠️ Ana anahtar (`ops.autoCleanup`) kapalı olsa bile zincir KURULUYOR — handler kapalıyken
       * hiçbir şey silmiyor ama bir sonrakini yazmaya devam ediyor. Böylece ayar panelden
       * açıldığında worker'ı yeniden başlatmaya gerek kalmıyor.
       */
      void ensureCleanupSchedule(db, opts.worldId, retentionFor(opts.worldId).autoCleanupHour)
        .catch((err: unknown) => {
          SCHED_LOG.error({ err }, 'gecelik temizlik zinciri kurulamadi');
        });
    },
    async stop() {
      await Promise.all([scheduler.stop(), dispatcher.stop()]);
    },
  };
}
