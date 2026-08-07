/**
 * ⭐⭐ EŞİK KAYIT DEFTERİ (Faz 3) — "ne zaman alarm veririz" sorusunun TEK yeri.
 *
 * Deseni `admin/ops-jobs.ts` (`CLEANUP_JOBS`) ve `world/time-registry.ts`ten alıyor: elle yazılmış
 * bir liste + onu şemayla/ayarlarla karşılaştıran bir test. Kuralı koda serpiştirmek yerine veri
 * yapmanın somut kazancı şu: **alarmın gerekçesi, eşiği ve ilk bakılacak yer aynı satırda durur**
 * ve e-posta gövdesi bundan üretilir — operatör gece 03:00'te "queue_lag > 120" yazan bir bildirim
 * değil, ne yapacağını yazan bir bildirim alır.
 *
 * ⚠️⚠️ **BU DOSYANIN ÖLÇEMEDİĞİ TEK ŞEY: SCHEDULER'IN KENDİ ÖLÜMÜ.**
 * Değerlendirme scheduler döngüsünün İÇİNDE koşuyor; döngü durursa değerlendirme de durur ve
 * hiçbir alarm çıkmaz. Bu bilinçli bir sınır, gizlenen bir açık değil — kendi ölümünü haber veren
 * bir süreç yazılamaz. O boşluğu **dışarıdan** bakan iki mekanizma kapatıyor:
 *   1. `/healthz?deep=1` — nabız yaşına bakıp 503 döner (PM2/uptime izleyicisi bunu yoklar).
 *   2. `dispatcher_stale` kuralı — scheduler, KOMŞU döngünün nabzını izler (tersi de doğru olurdu
 *      ama dispatcher'ın örnekleme yolu yok; asimetri bilerek).
 */

/** Bir turda ölçülen ham sayılar. `null` = ölçülemedi (kural o turda DEĞERLENDİRİLMEZ). */
export interface OpsMetrics {
  worldId: number;
  paused: boolean;
  lagMs: number;
  dueCount: number;
  claimed: number;
  skippedLocked: number;
  stuck: number;
  scheduled: number;
  running: number;
  failed: number;
  reaped: number;
  dead: number;
  oldestLockedAgeMs: number | null;
  poolIdleInTx: number | null;
  oldestTxS: number | null;
  outboxPending: number | null;
  outboxDead: number | null;
  /** Son 1 saatte ölen görev sayısı — toplam `failed` yerine PENCERELİ, yoksa olay hiç kapanmaz. */
  recentDead: number;
  /** Komşu döngünün (dispatcher) nabız yaşı. `null` = hiç nabız satırı yok. */
  dispatcherAgeS: number | null;
}

/** Panelden ayarlanabilen eşikler (`ops` ayar grubu). */
export interface OpsThresholds {
  /** Kuyruk gecikmesi (sn). §8 hedefi p95 < 2 sn; alarm çok daha yukarıda. */
  alertLagS: number;
  /** Vadesi geçtiği hâlde alınamayan görev sayısı. */
  alertStuck: number;
  /** Son 1 saatte ölen görev sayısı. */
  alertDeadMissions: number;
  /** Ölü mektup sayısı. */
  alertOutboxDead: number;
  /** En eski açık transaction (sn) — 06.08 olayının imzası. */
  alertOldestTxS: number;
  /** Nabız bayatlama eşiği (mevcut ayar, yeniden kullanılıyor). */
  staleHeartbeatS: number;
}

export type OpsSeverity = 'warn' | 'crit';

export interface OpsRule {
  /** `ops_events.kind` — (dünya, tür) başına en fazla bir AÇIK olay. */
  kind: string;
  label: string;
  severity: OpsSeverity;
  /**
   * ⭐ E-posta için kaç ARDIŞIK örnek gerekiyor (örnekleme dakikada bir).
   *
   * ⚠️ Olay HER ZAMAN ilk aşımda açılır — kayıt gecikmez, panelde anında görünür. Geciken yalnız
   * **e-posta**. Sebebi: bazı göstergeler tek turda doğal olarak sıçrıyor (`skipped_locked` için
   * `due` sayımı ile `claimDue` arasındaki yarış) ve tek örnekten posta atmak yanlış alarm üretirdi.
   * `samples` sayacı "kaç dakikadır sürüyor"u taşıdığı için eşik orada okunuyor.
   */
  sustainSamples: number;
  /** Bakımdaki dünyada değerlendirilir mi? Kuyruk kasten durduğu için çoğu kural için hayır. */
  skipWhilePaused: boolean;
  /** Dünyadan bağımsız mı (outbox küresel bir kuyruk) → `ops_events.world_id = NULL`. */
  global?: boolean;
  threshold(t: OpsThresholds): number;
  /** Ölçüm. `null` dönerse kural bu turda atlanır — kapatma da yapılmaz (veri yokluğu ≠ sağlık). */
  value(m: OpsMetrics): number | null;
  /** Tek cümle: ne oldu. */
  describe(value: number, threshold: number): string;
  /** ⭐ İlk bakılacak yer. E-postanın gövdesi bu — alarmın işe yaraması buna bağlı. */
  hint: string;
}

const s = (ms: number): number => Math.round(ms / 100) / 10;

export const OPS_RULES: readonly OpsRule[] = [
  /**
   * ⭐ KUYRUK GECİKMESİ — 06.08.2026 olayının doğrudan göstergesi.
   * O gün en eski bekleyen görev 9,5 saat geride kaldı ve hiçbir yerden anlaşılmadı.
   */
  {
    kind: 'queue_lag',
    label: 'Görev kuyruğu gecikmesi',
    severity: 'crit',
    sustainSamples: 2,
    skipWhilePaused: true,
    threshold: (t) => t.alertLagS,
    value: (m) => m.lagMs / 1000,
    describe: (v, t) => `En eski bekleyen görev ${Math.round(v)} sn geride (eşik ${t} sn).`,
    hint: 'Önce açık transaction var mı bak (Bakım → Havuz → «en eski işlem»). 06.08.2026 olayında '
      + 'terk edilmiş bir transaction, SKIP LOCKED yüzünden görünmeden satırları tutuyordu. '
      + 'İkinci bakılacak yer: worker nabzı yaşıyor mu, tur asılmış mı (loglarda «tur … sn\'dir '
      + 'bitmedi»).',
  },

  /**
   * ⭐⭐ ATLANAN SATIRLAR — bu sayı 06.08'de elimizde olsaydı arıza ilk dakikada teşhis edilirdi.
   * O gün yalnız `claimed` vardı ve `claimed = 0`, "iş yoktu" ile "iş vardı ama alamadım"ı ayırt
   * edemiyordu.
   */
  {
    kind: 'queue_stuck',
    label: 'Vadesi geçmiş ama alınamayan görev',
    severity: 'crit',
    sustainSamples: 2,
    skipWhilePaused: true,
    threshold: (t) => t.alertStuck,
    value: (m) => m.stuck,
    describe: (v, t) => `${v} görev vadesi geçtiği hâlde hâlâ «scheduled» (eşik ${t}).`,
    hint: 'reapStale bu satırları GÖRMEZ — o yalnız «running» tarar; 06.08\'de satırlar '
      + '«scheduled» takılmıştı. Sebep neredeyse her zaman satırları tutan bir transaction: '
      + 'pg_stat_activity\'de state = «idle in transaction» olan bağlantıyı bul.',
  },

  /** Handler tekrar tekrar patlıyor → oyun durumu ilerlemiyor ve oyuncu bunu görüyor. */
  {
    kind: 'mission_dead',
    label: 'Ölen görevler',
    severity: 'crit',
    sustainSamples: 1,
    skipWhilePaused: false,
    threshold: (t) => t.alertDeadMissions,
    value: (m) => m.recentDead,
    describe: (v, t) => `Son 1 saatte ${v} görev deneme hakkını tüketip öldü (eşik ${t}).`,
    hint: 'mission_errors tablosunda o görevin İLK hatasına bak (sonrakiler genelde birincinin '
      + 'yan etkisi). Ölü bir görev kendiliğinden düzelmez: sebep giderildikten sonra satırı '
      + 'elle «scheduled»a çevirmek gerekir.',
  },

  /**
   * ⚠️ Ölü mektup KENDİLİĞİNDEN KAPANMAZ ve bu doğru: satır kalıcı bir teslim başarısızlığıdır,
   * insan müdahalesi gerektirir. Olay ancak satır temizlenince/yeniden denenince kapanır.
   */
  {
    kind: 'outbox_dead',
    label: 'Ölü mektup kuyruğu',
    severity: 'crit',
    sustainSamples: 1,
    skipWhilePaused: false,
    global: true,
    threshold: (t) => t.alertOutboxDead,
    value: (m) => m.outboxDead,
    describe: (v, t) => `${v} outbox satırı deneme hakkını tüketti (eşik ${t}).`,
    hint: 'Bakım ekranında «ölü mektup konuları»na bak. Hepsi mail:send ise sebep neredeyse '
      + 'kesin Resend anahtarı ya da kota. ⚠️ Ölü mektuplar bilerek SİLİNMİYOR — her biri '
      + 'teslim edilememiş bir bildirim, yani bir oyuncunun göremediği bir olay.',
  },

  /**
   * ⭐ 06.08 OLAYININ KÖK NEDENİ. Faz 1 buna karşı `idle_in_transaction_session_timeout = 30s`
   * koydu; bu kural o emniyetin **çalıştığını doğrulayan** ikinci katman (önlemin önlemi).
   * ⚠️ Göç oturumları muaf değil — uzun bir göç bu alarmı ateşleyebilir; bakımda koştuğu için
   * `skipWhilePaused` onu bastırıyor.
   */
  {
    kind: 'idle_in_tx',
    label: 'Uzun süren açık transaction',
    severity: 'crit',
    sustainSamples: 1,
    skipWhilePaused: true,
    global: true,
    threshold: (t) => t.alertOldestTxS,
    value: (m) => m.oldestTxS,
    describe: (v, t) => `En eski açık transaction ${v} sn (eşik ${t} sn).`,
    hint: 'SELECT pid, state, xact_start, query FROM pg_stat_activity WHERE state LIKE «idle in%» '
      + '— bulduğun pid\'i pg_terminate_backend ile kes. Bu tam olarak 06.08.2026\'da 24 görevi '
      + '9,5 saat görünmez kılan durumdur.',
  },

  /**
   * ⭐ KOMŞU DÖNGÜNÜN NABZI. Scheduler kendi ölümünü haber veremez ama dispatcher'ınkini görebilir:
   * dispatcher bir e-posta sink'inde bloke olurken scheduler koşmaya devam eder ve bugüne kadar
   * bunu yalnız panele elle bakan biri fark edebilirdi.
   */
  {
    kind: 'dispatcher_stale',
    label: 'Outbox döngüsü nabız atmıyor',
    severity: 'crit',
    sustainSamples: 2,
    skipWhilePaused: false,
    global: true,
    // ⚠️ Nabız 5 sn'de bir yazılıyor; eşiğin 3 katı, yeniden başlatma penceresini yanlış alarma
    // çevirmeyecek kadar geniş.
    threshold: (t) => t.staleHeartbeatS * 3,
    value: (m) => m.dispatcherAgeS,
    describe: (v, t) => `Outbox döngüsünün son nabzı ${v} sn önce (eşik ${t} sn).`,
    hint: 'Dispatcher bir sink\'te bloke olmuş olabilir (en olası aday: Resend zaman aşımı). '
      + 'pm2 logs ile son hataya bak; outbox.pending büyüyorsa teslim gerçekten durmuş demektir.',
  },
] as const;

export const RULES_BY_KIND: Readonly<Record<string, OpsRule>> = Object.freeze(
  Object.fromEntries(OPS_RULES.map((r) => [r.kind, r])),
);

/** Alarm e-postasının gövdesi — kuralın kendi `describe`/`hint`i, sabit metin değil. */
export function alertText(
  rule: OpsRule, value: number, threshold: number, worldId: number | null, peak: number,
  samples: number,
): { subject: string; text: string } {
  const scope = worldId == null ? 'sunucu geneli' : `dünya ${worldId}`;
  return {
    subject: `[MobilWar] ${rule.label} — ${scope}`,
    text: [
      rule.describe(value, threshold),
      `Kapsam: ${scope} · süre: ${samples} örnek (≈${samples} dk) · en kötü değer: ${peak}`,
      '',
      rule.hint,
      '',
      'Bu ileti eşik aşıldığında BİR KEZ gönderilir; olay normale dönene kadar tekrarlanmaz.',
      'Geçmişi: Yönetim → Bakım → Olaylar.',
    ].join('\n'),
  };
}

/** `lag_ms` gibi ham değerleri okunur saniyeye çevirir (log ve panel metinleri için). */
export const asSeconds = s;
