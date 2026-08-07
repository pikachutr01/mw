/**
 * ⭐⭐ GECELİK OTOMATİK TEMİZLİK (Faz 3) — saklama sürelerini gerçekten UYGULAYAN parça.
 *
 * ⚠️⚠️ **Bu dosya yazılana kadar saklama süreleri dekoratifti.** `CLEANUP_JOBS` aylardır
 * duruyordu ama yalnız yönetici panelde düğmeye bastığında koşuyordu — yani pratikte hiç.
 * İki somut sonucu vardı:
 *   • §9.1.2'nin *"çoklu hesap izleri **90 gün** saklanır, gizlilik metninde açıkça yazılır"*
 *     taahhüdü **yazılıydı ama uygulanmıyordu**. Bir taahhüdün kodu yoksa taahhüt yoktur.
 *   • Faz 3'ün kendi tabloları (`scheduler_samples`, dakikada bir satır) dizginlenmemiş
 *     olurdu — izleme altyapısı, izlediği sistemi doldurmaya başlardı.
 *
 * ⚠️ **Ayrı bir cron YOK, bilerek.** Görev kuyruğu zaten zamanlama, çökmeye dayanıklılık,
 * bakımda durma, denetim kaydı ve tekillik veriyor (`abuse_scan` / `ranking_snapshot` ile aynı
 * gerekçe). İkinci bir zamanlayıcı kurmak bunların hepsini yeniden yazmak olurdu.
 *
 * ⚠️ **Silme kuralları DEĞİŞMEDİ.** Bu handler `CLEANUP_JOBS`taki aynı yüklemleri, aynı
 * `cleanupBatch` tavanıyla koşuyor — yöneticinin elle yaptığı işin aynısı. Değişen tek şey
 * TETİKLEYİCİ. Yeni bir silme yetkisi doğmuyor.
 */
import { sql } from 'drizzle-orm';
import { CLEANUP_JOBS, type CleanupJob, type OpsRetention } from '../admin/ops-jobs.ts';
import { log } from '../common/logger.ts';
import type { MissionHandler, Tx } from '../missions/handler-registry.ts';

const CLEAN_LOG = log('cleanup');

/** Gözetimsiz koşabilen işler. Ölçüt `ops-jobs.ts` → `CleanupJob.auto` başlığında. */
export const AUTO_JOBS: readonly CleanupJob[] = CLEANUP_JOBS.filter((j) => j.auto);

/**
 * Bir sonraki koşunun anı: **ertesi günün** `hour` saati (UTC).
 *
 * ⚠️ Gerçek zamanda, oyun saatinde değil — saklama bir DEPOLAMA kuralıdır ve bakımda donmamalı
 * (`ops-jobs.ts` başlığındaki ayrımın aynısı).
 * ⚠️ `from`un kendi günü ATLANIYOR: `ctx.at` vadeye eşit olduğu için aynı günü hesaplasaydık
 * geçmişte bir an döner ve görev **anında yeniden ateşlenirdi** (sonsuz döngü).
 */
export function nextCleanupAt(from: Date, hour: number): Date {
  const at = new Date(from.getTime());
  at.setUTCHours(hour, 0, 0, 0);
  if (at.getTime() <= from.getTime()) at.setUTCDate(at.getUTCDate() + 1);
  return at;
}

/**
 * Bir sonraki `ops_cleanup` görevini yazar (varsa dokunmaz).
 * Tekillik anahtarı koşu anıdır → worker kaç kez yeniden başlarsa başlasın kopya oluşmaz.
 */
export async function scheduleCleanup(
  runner: { execute: Tx['execute'] }, worldId: number, from: Date, hour: number,
): Promise<Date> {
  const at = nextCleanupAt(from, hour);
  await runner.execute(sql`
    INSERT INTO missions (world_id, type, status, execute_at, payload, idempotency_key)
    VALUES (${worldId}, 'ops_cleanup', 'scheduled', ${at.toISOString()}::timestamptz,
            '{}'::jsonb, ${`cleanup:${at.toISOString()}`})
    ON CONFLICT (world_id, idempotency_key) DO NOTHING
  `);
  return at;
}

export interface CleanupResult {
  job: string;
  table: string;
  deleted: number;
  /** Tavana dayandı → geri kalan bir sonraki koşuya kaldı (arıza değil, bilgi). */
  capped: boolean;
}

/**
 * Tek işi koşturur. `admin.ops.controller.ts`teki elle koşunun `ctid` desenini **aynen**
 * kullanıyor:
 *   • Tabloların bir kısmında tek kolonluk anahtar yok (composite key).
 *   • `LIMIT`siz bir `DELETE` milyon satırda tabloyu kilitler ve oyunu durdurur.
 */
async function runJob(
  tx: Tx, job: CleanupJob, r: OpsRetention,
): Promise<CleanupResult> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    DELETE FROM ${sql.raw(`"${job.table}"`)}
     WHERE ctid IN (
       SELECT ctid FROM ${sql.raw(`"${job.table}"`)}
        WHERE ${job.where(r)}
        ORDER BY ${sql.raw(`"${job.timeColumn}"`)}
        LIMIT ${r.cleanupBatch}
     )
     RETURNING 1
  `);
  return {
    job: job.id, table: job.table, deleted: rows.length,
    capped: rows.length >= r.cleanupBatch,
  };
}

/**
 * ⭐ `ops_cleanup` handler'ı.
 *
 * ⚠️ Zincir **her koşulda** ilerliyor: ana anahtar kapalıysa bile bir sonraki görev yazılıyor.
 * Aksi hâlde `autoCleanup`u kapatmak zinciri **kalıcı olarak** öldürürdü ve yeniden açmak worker
 * yeniden başlatmayı gerektirirdi — `ranking_snapshot` zincirinin 2026-08-05'te canlıda 15 saat
 * ölü kalmasının sebebi tam olarak bu sınıf bir kopmaydı.
 *
 * ⚠️ Bir işin patlaması diğerlerini düşürmemeli: her iş kendi `try`ında. Handler'ın tamamı tek
 * transaction'da koşuyor (scheduler'ın sözleşmesi), yani patlayan işin silmesi geri alınır ama
 * hata `results`a yazılıp denetim kaydında görünür.
 */
export function createCleanupHandler(
  retentionFor: (worldId: number) => OpsRetention,
): MissionHandler {
  return async (ctx) => {
    const r = retentionFor(ctx.worldId);
    const results: CleanupResult[] = [];
    const errors: Record<string, string> = {};

    if (r.autoCleanup) {
      for (const job of AUTO_JOBS) {
        try {
          results.push(await runJob(ctx.tx, job, r));
        } catch (err) {
          errors[job.id] = String(err).slice(0, 500);
        }
      }
    }

    const next = await scheduleCleanup(ctx.tx, ctx.worldId, new Date(), r.autoCleanupHour);
    const total = results.reduce((n, x) => n + x.deleted, 0);
    const capped = results.filter((x) => x.capped).map((x) => x.job);

    /**
     * ⚠️ Denetim kaydı **her koşuda**, sıfır satır silinse bile. "Bu gece temizlik koştu mu"
     * sorusunun cevabı, ancak koşmadığı gecelerde satır olmamasıyla ayırt edilebilir; yalnız
     * silme olduğunda yazsaydık sessiz bir kopma ile sessiz bir sakinlik aynı görünürdü.
     */
    await ctx.audit({
      action: 'ops.cleanup.auto',
      after: {
        enabled: r.autoCleanup,
        deleted: total,
        jobs: results,
        capped,
        errors: Object.keys(errors).length > 0 ? errors : undefined,
        nextAt: next.toISOString(),
      },
    });

    if (total > 0 || capped.length > 0 || Object.keys(errors).length > 0) {
      CLEAN_LOG.info({
        worldId: ctx.worldId, deleted: total, capped, errors, nextAt: next.toISOString(),
      }, 'gecelik temizlik');
    }
  };
}

/**
 * Worker açılışında zinciri garanti eder — hiç `ops_cleanup` görevi yoksa bir tane yazar.
 *
 * ⚠️ İlk koşu **hemen değil**, bir sonraki gece penceresine yazılıyor: sunucu her yeniden
 * başlatıldığında toplu silme koşturmak, dağıtım sırasında tam da yük istemediğimiz anda
 * yük üretmek olurdu (`ensureAbuseScanSchedule` ile aynı gerekçe).
 */
export async function ensureCleanupSchedule(
  runner: { execute: Tx['execute'] }, worldId: number, hour: number,
): Promise<void> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT 1 FROM missions
     WHERE world_id = ${worldId} AND type = 'ops_cleanup' AND status = 'scheduled' LIMIT 1
  `);
  if (rows.length > 0) return;
  await scheduleCleanup(runner, worldId, new Date(), hour);
}
