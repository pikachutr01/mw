/**
 * `abuse_scan` görevi — davranış sinyallerini tarar ve **bir sonrakini kendisi yazar** (§9.1.3).
 *
 * ⚠️ Ayrı bir cron/zamanlayıcı YOK, bilerek. Görev kuyruğu zaten şunları veriyor: zamanlama,
 * çökmeye dayanıklılık, bakım modunda durma, denetim kaydı ve tekillik. İkinci bir zamanlama
 * altyapısı kurmak bunların hepsini yeniden yazmak olurdu (`ranking_snapshot` ile aynı gerekçe).
 *
 * ⚠️ Pencere **gerçek saatle** yürüyor, oyun saatiyle değil. Tarama bir denetim/depolama işi;
 * bakımda oyun saati donduğunda tarama penceresinin de donması, bakım süresince olan hiçbir
 * şeyin taranmaması demekti. (Aynı ayrım `ops-jobs.ts` başlığında da yazılı.)
 */
import { sql } from 'drizzle-orm';
import type { MissionHandler, Tx } from '../missions/handler-registry.ts';
import { AbuseScanService, nextScanAt } from './scan.service.ts';

/**
 * Bir sonraki `abuse_scan` görevini yazar (varsa dokunmaz).
 * Tekillik anahtarı tarama anıdır → worker kaç kez yeniden başlarsa başlasın kopya oluşmaz.
 */
export async function scheduleAbuseScan(
  runner: Tx | { execute: Tx['execute'] }, worldId: number, from: Date,
): Promise<Date> {
  const at = nextScanAt(from);
  await runner.execute(sql`
    INSERT INTO missions (world_id, type, status, execute_at, payload, idempotency_key)
    VALUES (${worldId}, 'abuse_scan', 'scheduled', ${at.toISOString()}::timestamptz,
            '{}'::jsonb, ${`abuse:${at.toISOString()}`})
    ON CONFLICT (world_id, idempotency_key) DO NOTHING
  `);
  return at;
}

export function createAbuseScanHandler(): MissionHandler {
  return async (ctx) => {
    const svc = new AbuseScanService(ctx.tx);
    /**
     * ⚠️ `ctx.at` DEĞİL gerçek saat: `ctx.at` oyun saatinde görevin vadesi ve bakımda geride
     * kalır. Pencerenin sonu olarak onu kullansaydık bakım sonrası taramalar birbirini
     * kovalar, aradaki veri hiç incelenmeden geçerdi.
     */
    const result = await svc.run(ctx.worldId, new Date());
    const emailed = await svc.report(ctx.worldId, result);
    const next = await scheduleAbuseScan(ctx.tx, ctx.worldId, new Date());

    await ctx.audit({
      action: 'abuse.scan',
      after: {
        windowFrom: result.from.toISOString(), windowTo: result.to.toISOString(),
        signals: result.signals, pairs: result.pairs, reported: result.reported,
        emailed, nextAt: next.toISOString(),
      },
    });
  };
}

/**
 * Worker açılışında zinciri garanti eder — hiç `abuse_scan` görevi yoksa bir tane yazar.
 *
 * ⚠️ İlk görev **hemen değil**, bir aralık sonrasına yazılıyor: sunucu her yeniden
 * başlatıldığında ağır bir tarama koşturmak, dağıtım sırasında tam da yük istemediğimiz anda
 * yük üretmek olurdu. Elle tetiklemek panelden mümkün.
 */
export async function ensureAbuseScanSchedule(
  runner: { execute: Tx['execute'] }, worldId: number,
): Promise<void> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT 1 FROM missions
     WHERE world_id = ${worldId} AND type = 'abuse_scan' AND status = 'scheduled' LIMIT 1
  `);
  if (rows.length > 0) return;
  await scheduleAbuseScan(runner, worldId, new Date());
}
