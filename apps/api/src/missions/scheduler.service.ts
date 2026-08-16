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
import { PLACEMENT_LOCK } from '../world/placement-lock.ts';
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
  /**
   * Vadesi bu kadar geçtiği hâlde hâlâ `scheduled` duran görev "takılmış" sayılır (yalnız
   * ÖLÇÜM, kurtarma değil — `TickResult.stuck`). Varsayılan 5 dk: normal gecikme saniyeler
   * mertebesinde, 5 dakika ancak gerçek bir arızada görülür.
   */
  stuckAfterMs?: number;
  /**
   * Bir tur bu süreyi aşarsa gürültülü loglanır; **iki katını** aşarsa tur "asılmış" kabul
   * edilir ve döngü kilidi zorla açılır (`start()`). Varsayılan 30 sn.
   */
  tickTimeoutMs?: number;
  maxAttempts?: number;
  retryBackoffMs?: number;
  /**
   * ⭐⭐ **SAAT SIÇRAMASI KAPISI — 1. KAT (2026-08-16 olayı).**
   *
   * İki tur arasında DB saati (`gameNow`), sürecin **monotonik** saatinden bu kadar fazla
   * ayrışırsa tur ATLANIR: saat sıçramıştır, hiçbir vade kıyaslaması güvenilir değildir.
   *
   * ⚠️ Neden monotonik: `CLOCK_MONOTONIC` geri gitmez ve NTP/host senkronu onu adımlayamaz —
   * duvar saatinin doğruluğunu ölçebilecek TEK yerel referans odur. `Date.now()` ile
   * kıyaslamak anlamsız olurdu (ikisi de aynı sıçramada birlikte kayar).
   *
   * Varsayılan 30 sn: normal tur farkı `pollIntervalMs` (1 sn) + sorgu gecikmesi, yani
   * milisaniyeler mertebesinde. 30 sn'yi ancak gerçek bir sıçrama ya da uzun bir duraklama aşar.
   */
  clockJumpToleranceMs?: number;
  /**
   * ⭐⭐ **SAAT SIÇRAMASI KAPISI — 2. KAT (2026-08-16 olayı).**
   *
   * Alınmış bir görevin vadesi, alımdan HEMEN SONRA yeniden okunan oyun saatinden bu kadar
   * ileriyse görev çalıştırılmaz, kuyruğa geri bırakılır (`releaseFuture`).
   *
   * ⚠️ 1. kat yetmediği için var: `clock.read()` ile `claimDue` **iki ayrı sorgu**. Sıçrama
   * tam aralarına düşerse kapı temiz bir saat görür, `claimDue` sıçramış saatle alır.
   * 2026-08-16'da sıçrama saniyenin altında sürdü — handler'lar zaten DÜZELMİŞ saatle koştu,
   * yani bu ikinci okuma o gün sıçramayı KESİNLİKLE yakalardı.
   *
   * ⚠️ Tolerans geriye değil İLERİYE bakıyor — `ranking.handler.ts`'teki kapıyla aynı gerekçe:
   * geç kalmak normaldir ve zararsızdır, erken çalışmak HER ZAMAN hatadır.
   *
   * ⚠️ Varsayılan 60 sn, `ranking.handler.ts`'in 1 saatinden çok daha dar — bilerek. O kapı
   * 8 saatlik yuvaları koruyor; buradan geçen görevler saniyeler içinde alınır. 2026-08-16'da
   * 12 görevin 6'sı 1 saatten az erkendi: 1 saatlik tolerans onları KAÇIRIRDI.
   */
  maxFutureDueMs?: number;
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
  /**
   * ⭐ OPERASYON İZLEYİCİSİ (Faz 3) — her turun sonunda çağrılır, **kendi kendini seyreltir**
   * (`ops/ops-monitor.ts`, dakikada bir). Verilmezse hiç örnek yazılmaz: testler ve tabloları
   * olmayan profiller etkilenmez — `heartbeat` ile birebir aynı sözleşme.
   *
   * ⚠️ Bakımda da çağrılıyor (`skippedPaused: true` ile): bakım penceresinin grafikte görünmesi,
   * "kuyruk neden durdu" sorusunun cevabının kendisi.
   */
  sampler?: (result: TickResult) => Promise<void>;
}

export interface TickResult {
  claimed: number;
  done: number;
  retried: number;
  dead: number;
  reaped: number;
  skippedPaused: boolean;
  /**
   * ⭐ Saat sıçraması yüzünden kuyruğa geri bırakılan görev sayısı (2. kat). Sıfırdan büyükse
   * bir sıçrama `claimDue`'ya sızmış ve **oradan da yakalanmış** demektir.
   */
  released: number;
  /**
   * ⭐ 1. katın ölçtüğü sapma (ms) — tur atlandıysa dolu, normalde 0. Sıçramanın YÖNÜNÜ de
   * taşır (ileri sıçrama pozitif), çünkü tanı için "ne kadar" kadar "ne tarafa" da gerekiyor.
   */
  clockJumpMs: number;
  lagMs: number;
  /** Vadesi gelmiş ve alınabilir durumdaki görev sayısı (kilitliler dâhil). */
  due: number;
  /**
   * ⭐ **Vadesi geldiği hâlde ALINAMAYAN görev sayısı** = `min(due, batchSize) − claimed`.
   *
   * ⚠️ Sıfırdan büyükse `SKIP LOCKED` birilerinin tuttuğu satırları atlıyor demektir —
   * 2026-08-06'da 24 görevi saatlerce görünmez kılan durumun **tek doğrudan göstergesi**.
   * O gün elimizde yalnız `claimed` vardı ve `claimed = 0`, "iş yoktu" ile "iş vardı ama
   * alamadım"ı ayırt edemiyordu.
   */
  skippedLocked: number;
  /**
   * `stuckAfterMs`ten uzun süredir bekleyen görev sayısı. `reapStale`in kör noktası:
   * o yalnız `running` satırları kurtarıyor, 2026-08-06'da satırlar `scheduled` takıldı.
   * Burada yalnız **ölçülüyor** — kilitli bir satırı zorla almak `SKIP LOCKED`'ın var oluş
   * sebebini (çift işleme) delerdi. Faz 3'te alarma bağlanacak.
   */
  stuck: number;
}

export class SchedulerService {
  private readonly repo: MissionRepository;
  private readonly opts:
    Required<Omit<SchedulerOptions, 'onError' | 'engineFor' | 'heartbeat' | 'watchdog' | 'sampler'>>
    & Pick<SchedulerOptions, 'onError' | 'engineFor' | 'heartbeat' | 'watchdog' | 'sampler'>;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;
  /** Süren turun başlangıcı — asılı tur tespiti için (`noteStalledTick`). */
  private runStartedAt = 0;
  /** Her tura artan sayaç: zorla açılmış bir turun geç `finally`'si yenisini kesmesin. */
  private runGeneration = 0;
  /** Bir sonraki "tur asıldı" uyarısının eşiği (katlanarak büyür, log fırtınası olmasın). */
  private nextStallWarnMs = 0;
  /**
   * ⭐ Saat sıçraması kapısının çıpası: bir önceki turun oyun saati ve O ANIN monotonik okuması.
   * `null` = çıpa yok (ilk tur, ya da bakımdan yeni çıkıldı) → o tur YARGILANMAZ, yalnız çıpa kurar.
   */
  private clockAnchor: { gameNowMs: number; monoMs: number } | null = null;

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
      stuckAfterMs: options.stuckAfterMs ?? 300_000,
      tickTimeoutMs: options.tickTimeoutMs ?? 30_000,
      maxAttempts: options.maxAttempts ?? 5,
      retryBackoffMs: options.retryBackoffMs ?? 5_000,
      clockJumpToleranceMs: options.clockJumpToleranceMs ?? 30_000,
      maxFutureDueMs: options.maxFutureDueMs ?? 60_000,
      onError: options.onError,
      engineFor: options.engineFor,
      heartbeat: options.heartbeat,
      watchdog: options.watchdog,
      sampler: options.sampler,
    };
  }

  /** Tek tur. Testler bunu elle çağırır (zamanla yarışmadan davranışı ölçmek için). */
  async tick(): Promise<TickResult> {
    const result: TickResult = {
      claimed: 0, done: 0, retried: 0, dead: 0, reaped: 0, skippedPaused: false,
      released: 0, clockJumpMs: 0, lagMs: 0,
      due: 0, skippedLocked: 0, stuck: 0,
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
       * ⚠️ Çıpa DÜŞÜRÜLÜYOR: bakımda `gameNow` donuk (`pausedAt`), monotonik saat ise akmaya
       * devam ediyor. Çıpa korunsaydı bakım süresi kadar sahte bir "sıçrama" birikir ve
       * devam edildiği anda ilk tur boşuna atlanırdı.
       */
      this.clockAnchor = null;
      /**
       * ⚠️ Nabız bakımda da atıyor — bilerek. Bakımdaki bir dünya ile ÖLMÜŞ bir worker
       * bakım panelinde aynı görünseydi (kuyruk ilerlemiyor) yanlış alarm ya da daha
       * kötüsü kaçırılmış alarm üretirdi.
       */
      await this.sample(result);
      await this.beat(result);
      return result;
    }

    /**
     * ⭐⭐ **1. KAT — SAAT SIÇRADIYSA HİÇBİR ŞEY ALMA.**
     *
     * ⚠️ 2026-08-03'te alınan önlem (`GAME_NOW_SQL`: kıyaslamanın iki ucu da DB saatinden)
     * **süreç ile DB arasındaki** kaymayı kapatıyor. Ama DB'nin KENDİ saati sıçrarsa iki uç da
     * aynı yanlış saati okur ve önlem hiçbir şey yapmaz. 2026-08-16'da canlıda tam bu oldu:
     * konak (ESXi) saati konuk saatine sızdı, `now()` bir anlığına **9 sa 25 dk ileri** döndü,
     * `claimDue` o ana kadar vadesi olan **12 görevi** birden aldı — 6 savaş 2,5 saate kadar
     * erken çözüldü. Saat saniyenin altında geri düştüğü için hiçbir log satırına yansımadı.
     *
     * Monotonik saat bu yanılsamayı kıran tek referans: o sıçramaz.
     */
    const jump = this.noteClockJump(world.gameNow);
    if (jump !== null) {
      result.clockJumpMs = jump;
      this.opts.onError?.(
        new Error(
          `[scheduler] saat sıçraması: oyun saati monotonik saatten ${Math.round(jump / 1000)} sn ` +
          'ayrıştı — tur ATLANDI, hiçbir görev alınmadı',
        ),
        null,
      );
      await this.sample(result);
      await this.beat(result);
      return result;
    }

    result.reaped = await this.repo.reapStale(this.opts.worldId, this.opts.staleLockMs);

    const dueStats = await this.repo.dueStats(this.opts.worldId, this.opts.stuckAfterMs);
    result.lagMs = dueStats.lagMs;
    result.due = dueStats.due;
    result.stuck = dueStats.stuck;

    const claimed = await this.repo.claimDue({
      worldId: this.opts.worldId,
      limit: this.opts.batchSize,
      workerId: this.opts.workerId,
    });
    result.claimed = claimed.length;

    /**
     * ⭐ ATLANAN SATIR SAYISI — bir çıkarma işlemi, ek sorgu yok.
     *
     * `due` sayımı ile `claimDue` arasında bir yarış var (arada yeni görev vadesi gelebilir,
     * başka bir worker satır alabilir) → sonuç **kısa süreli sahte pozitif** verebilir. Bu
     * yüzden burada alarm ÜRETİLMİYOR, yalnız sayı kaydediliyor; kalıcı bir sorun ancak
     * ardışık turlarda sıfırdan büyük kalırsa anlaşılır (Faz 3'te eşik oradan bakacak).
     *
     * ⚠️ `min(due, batchSize)`: `due` limitten büyükse fazlası **atlanmadı, sıraya kaldı** —
     * onu atlanmış saymak her kalabalık turda sahte alarm üretirdi.
     */
    result.skippedLocked = Math.max(0, Math.min(result.due, this.opts.batchSize) - result.claimed);

    /**
     * ⭐⭐ **2. KAT — ALINDIKTAN SONRA VADEYİ BİR KEZ DAHA DOĞRULA.**
     *
     * 1. kat `clock.read()` ile, alım ise `claimDue` ile yapılıyor — **iki ayrı sorgu**. Sıçrama
     * tam aralarına düşerse kapı temiz saat görür, alım sıçramış saatle yapılır. Bu kat o dar
     * yarışı kapatıyor: alımın hemen ardından oyun saati TAZE okunuyor ve vadesi hâlâ gelecekte
     * olan görev çalıştırılmadan kuyruğa geri bırakılıyor.
     *
     * ⚠️ Bu okumanın işe yarayacağı kanıtlı: 2026-08-16'da sıçrama saniyenin altında sürdü,
     * handler'lar zaten DÜZELMİŞ saatle koştu (`finished_at` doğruydu, `claimed_at` bozuktu).
     * Yani o gün bu ikinci okuma 12 görevin 12'sini de yakalardı.
     *
     * ⚠️ Ek sorgu YALNIZ görev alındığında yapılıyor — boş turlar (kuyruğun normal hâli) hiçbir
     * maliyet görmüyor.
     */
    let runnable = claimed;
    if (claimed.length > 0) {
      const verify = await this.clock.read(this.opts.worldId);
      const future = claimed.filter(
        (m) => m.executeAt.getTime() - verify.gameNow.getTime() > this.opts.maxFutureDueMs,
      );
      if (future.length > 0) {
        runnable = claimed.filter((m) => !future.includes(m));
        for (const m of future) {
          await this.repo.releaseFuture(m.id);
          result.released++;
          this.opts.onError?.(
            new Error(
              `[scheduler] görev ${m.id} (${m.type}) vadesi ${m.executeAt.toISOString()}, ` +
              `oyun saati ${verify.gameNow.toISOString()} — GELECEKTE, kuyruğa geri bırakıldı`,
            ),
            m,
          );
        }
        /**
         * ⚠️ Çıpa da düşürülüyor: buraya gelindiyse saat oynamış demektir, bir sonraki tur
         * eski çıpayla kıyaslanıp boşuna atlanmasın.
         */
        this.clockAnchor = null;
      }
    }

    for (const mission of runnable) {
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
          // ⭐ Hata GEÇMİŞİ (0044): `last_error` üzerine yazıyor, ilk hata kayboluyordu.
          {
            worldId: mission.worldId, type: mission.type,
            attempts: mission.attempts, workerId: this.opts.workerId,
          },
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
    await this.sample(result);
    await this.beat(result);
    return result;
  }

  /**
   * ⭐⭐ **SAAT SIÇRAMASI ÖLÇÜMÜ — çıpayı günceller, sapmayı döndürür.**
   *
   * Dönen değer `null` ise saat sağlıklı (ya da çıpa henüz yok). Sayı ise sapma miktarı;
   * pozitif = oyun saati İLERİ sıçradı, negatif = geri.
   *
   * Ölçü şu: iki tur arasında oyun saati ne kadar ilerlediyse, monotonik saat de o kadar
   * ilerlemeli. Fark toleransı aşıyorsa duvar saati adımlanmıştır.
   *
   * ⚠️ **Sapma görülünce çıpa YENİLENİYOR ve tur atlanıyor** — ikisi birlikte. Yenilenmeseydi
   * meşru bir saat düzeltmesinden (NTP'nin büyük ama DOĞRU bir adımı) sonra her tur atlanır ve
   * kuyruk kalıcı olarak dururdu. Böylece bedel her sıçramada **tek tur** (1 sn) oluyor.
   *
   * ⚠️ `performance.now()` kullanılıyor — `Date.now()` DEĞİL. İkincisi duvar saatidir ve
   * sıçramada oyun saatiyle birlikte kayar; kıyaslama kendini doğrular, hiçbir şey yakalanmaz.
   *
   * ⚠️ VM askıya alınıp devam ettirilirse (`CLOCK_MONOTONIC` askıda durur, duvar saati akar)
   * bu ölçüm sahte pozitif verir. Bilerek katlanılıyor: bedeli tek atlanmış tur, kazancı
   * gerçek sıçramaların yakalanması.
   */
  private noteClockJump(gameNow: Date): number | null {
    const monoMs = performance.now();
    const gameNowMs = gameNow.getTime();
    const anchor = this.clockAnchor;
    this.clockAnchor = { gameNowMs, monoMs };

    if (anchor === null) return null;               // ilk tur: yalnız çıpa kuruldu
    const drift = (gameNowMs - anchor.gameNowMs) - (monoMs - anchor.monoMs);
    return Math.abs(drift) > this.opts.clockJumpToleranceMs ? drift : null;
  }

  /**
   * ⭐ Operasyon örneği (Faz 3). Kısıtlama ve hata yutma `OpsMonitor`ün içinde — ama burada da
   * ikinci bir kalkan var: izleyicinin BİR sözleşme ihlali bile (senkron atan bir hata) görev
   * döngüsünü düşürmemeli. `watchdog` ile aynı gerekçe.
   */
  private async sample(result: TickResult): Promise<void> {
    try {
      await this.opts.sampler?.(result);
    } catch (err) {
      this.opts.onError?.(err, null);
    }
  }

  /** Nabız (§admin Faz 8). Kısıtlama ve hata yutma `Heartbeat`in içinde. */
  private async beat(result: TickResult): Promise<void> {
    await this.opts.heartbeat?.beat({
      claimed: result.claimed, done: result.done, retried: result.retried,
      dead: result.dead, reaped: result.reaped,
      lagMs: result.lagMs, paused: result.skippedPaused,
      // ⭐ 2026-08-06 olayının göstergeleri — panelde bunlara bakılacak.
      due: result.due, skippedLocked: result.skippedLocked, stuck: result.stuck,
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
        lockPlacement: async () => {
          /**
           * Dünyanın boş koordinatlarını seri hâle getirir — **kayıt yerleşimiyle aynı
           * kilit** (`auth.service.ts`). Gerekçesi `world/placement-lock.ts` başlığında.
           * ⚠️ `(int,int)` biçimi `lockCity`'nin `bigint` uzayından ayrıdır, çakışmaz.
           */
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${PLACEMENT_LOCK}, ${mission.worldId})`);
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

      /**
       * Durum geçişi AYNI transaction'da: süreç burada ölürse görev 'running' kalır ve
       * reapStale onu geri kuyruğa alır — yarım iş kalmaz.
       *
       * ⭐ `duration_ms` HANDLER süresini ölçüyor (0044), kuyrukta beklemeyi değil (`lag_ms`).
       * İkisi ayrı çünkü ayrı arızaları gösteriyor: biri altyapı tıkanması, diğeri yavaş iş.
       * ⚠️ `completed_by` `locked_by` NULL'lanmadan ÖNCE kopyalanıyor — aynı ifadedeki eski
       * değer okunur (SQL'de SET sağ tarafları satırın güncelleme öncesi hâlini görür).
       */
      await tx.execute(sql`
        UPDATE missions
           SET status = 'done', finished_at = now(),
               duration_ms = GREATEST(0, (EXTRACT(EPOCH FROM (now() - COALESCE(claimed_at, locked_at, now()))) * 1000)::int),
               completed_by = COALESCE(locked_by, completed_by),
               locked_by = NULL, locked_at = NULL
         WHERE id = ${mission.id}
      `);
    });
  }

  /**
   * Sürekli döngü. `ROLE=all` profilinde API süreciyle aynı yerde çalışır.
   *
   * ⚠️⚠️ **`if (this.running) return` TEK BAŞINA ÖLÜMCÜLDÜ (2026-08-07'de kapatıldı).**
   *
   * Yeniden girişi engelliyor — bu doğru — ama bir tur **asla çözülmezse** (kopmuş ama TCP
   * keepalive'ı henüz dolmamış bir DB bağlantısında asılı kalan sorgu; canlıda `tcp_keepalives_idle`
   * **7200 sn**) bayrak sonsuza kadar `true` kalır ve her zamanlayıcı ateşlemesi **sessizce**
   * geri döner. Ne log, ne hata, ne nabız değişimi — kuyruk durur ve hiçbir yerden anlaşılmaz.
   *
   * Çare iki katmanlı:
   *  1. **Görünürlük:** tur `tickTimeoutMs`ı aşarsa her ateşlemede değil, **büyüyen aralıklarla**
   *     loglanır (log fırtınası kuyruğu kurtarmıyor, yalnız diski dolduruyor).
   *  2. **Kurtarma:** iki katı aşılırsa bayrak zorla açılır. ⚠️ Asılı tur **iptal edilmiyor** —
   *     JS'te bir promise'i dışarıdan iptal etmenin yolu yok. Ama yeni tura izin vermek zararsız:
   *     `claimDue` `FOR UPDATE SKIP LOCKED` kullanıyor, yani asılı tur bir satır tutuyorsa yeni
   *     tur onu zaten atlar ve **çift işleme olmaz**. Asılı tur sonunda çözülürse `finally`
   *     bayrağı bir kez daha kapatır; `runGeneration` sayacı onun geç gelen `finally`'sinin
   *     yeni turu iptal etmesini engelliyor.
   */
  start(): void {
    if (this.timer) return;
    this.stopped = false;
    const loop = async (): Promise<void> => {
      if (this.stopped) return;
      if (this.running) {
        this.noteStalledTick();
        return;
      }
      this.running = true;
      this.runStartedAt = Date.now();
      const generation = ++this.runGeneration;
      try {
        await this.tick();
      } catch (err) {
        this.opts.onError?.(err, null);
      } finally {
        // Zorla açılmış bir turun geç gelen `finally`'si, ondan sonra başlayan turu kesmesin.
        if (this.runGeneration === generation) this.running = false;
      }
    };
    this.timer = setInterval(() => void loop(), this.opts.pollIntervalMs);
    void loop();
  }

  /** Süren tur uzadı: önce uyar, sonra kilidi zorla aç. Uyarı aralığı katlanarak büyür. */
  private noteStalledTick(): void {
    const elapsed = Date.now() - this.runStartedAt;
    if (elapsed < this.opts.tickTimeoutMs) return;

    if (elapsed >= this.nextStallWarnMs) {
      this.nextStallWarnMs = Math.max(elapsed * 2, this.opts.tickTimeoutMs * 2);
      this.opts.onError?.(
        new Error(`[scheduler] tur ${Math.round(elapsed / 1000)} sn'dir bitmedi — kuyruk DURMUŞ olabilir`),
        null,
      );
    }

    if (elapsed >= this.opts.tickTimeoutMs * 2) {
      this.runGeneration++;          // asılı turun `finally`'sini etkisizleştir
      this.running = false;          // yeni tura izin ver (SKIP LOCKED çift işlemeyi önlüyor)
      this.nextStallWarnMs = this.opts.tickTimeoutMs;
    }
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
