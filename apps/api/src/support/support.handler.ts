/**
 * `support_maintenance` görevi — günlük iki iş, **bir sonrakini kendisi yazar**.
 *
 *  1. **Yetim ek süpürme**: yüklenip hiçbir mesaja iliştirilmemiş dosyalar (kullanıcı formu
 *     yarıda bıraktığında oluşur).
 *  2. **Yanıt bekleyen özeti**: yöneticiye günde en fazla bir mail. ⭐ Bu, yöneticinin oyuncu
 *     yanıtları için ayrı mail almamasının (kullanıcı kararı: *"sadece ilk açıldığında"*)
 *     telafi edici kontrolü. Panel rozeti yalnız panel açıkken çalışıyor; tek kişilik bir
 *     operasyonda emniyet ağı gerekiyor.
 *
 * ⚠️ Ayrı bir cron YOK (`abuse_scan` · `ranking_snapshot` · `ops_cleanup` ile aynı gerekçe):
 * görev kuyruğu zamanlama, çökmeye dayanıklılık, tekillik ve denetim kaydını zaten veriyor.
 *
 * ⚠️⚠️ **DOSYA SİLME `ctx.tx` İÇİNDE DEĞİL, DIŞ BAĞLANTIDA.** Dosya sistemi transaction'a
 * katılamaz. İş görev transaction'ında koşsaydı ve o transaction sonradan geri alınsaydı,
 * satırlar geri gelir ama **dosyalar çoktan silinmiş** olurdu — yani DB'de var olan bir eke
 * tıklayınca 500 alınırdı. Dış bağlantıda koşturmak en kötü ihtimalle diskte kimsenin
 * referans etmediği bir dosya bırakır; onu bir sonraki koşu ya da tutarsızlık raporu görür.
 * Görev burada yalnız **zamanlayıcı** rolünde.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { MissionHandler, Tx } from '../missions/handler-registry.ts';
import { log } from '../common/logger.ts';
import { supportLimits } from './support.limits.ts';
import { sendPendingDigest, sweepOrphanAttachments } from './support.service.ts';

const SUP_LOG = log('support');

/** Bir sonraki koşu: **gerçek saatte** ertesi günün aynı saati (saklama/iletişim işi, oyun değil). */
export function nextSupportRunAt(from: Date, hour = 6): Date {
  const at = new Date(from.getTime());
  at.setUTCHours(hour, 0, 0, 0);
  if (at.getTime() <= from.getTime()) at.setUTCDate(at.getUTCDate() + 1);
  return at;
}

export async function scheduleSupportMaintenance(
  runner: { execute: Tx['execute'] }, worldId: number, from: Date,
): Promise<Date> {
  const at = nextSupportRunAt(from);
  await runner.execute(sql`
    INSERT INTO missions (world_id, type, status, execute_at, payload, idempotency_key)
    VALUES (${worldId}, 'support_maintenance', 'scheduled', ${at.toISOString()}::timestamptz,
            '{}'::jsonb, ${`support:${at.toISOString()}`})
    ON CONFLICT (world_id, idempotency_key) DO NOTHING
  `);
  return at;
}

/**
 * @param db Görev transaction'ının DIŞINDAKİ bağlantı (yukarıdaki ⚠️⚠️ gerekçesi).
 */
export function createSupportMaintenanceHandler(db: Db): MissionHandler {
  return async (ctx) => {
    const lim = supportLimits();
    let swept = 0;
    let digest = 0;
    try {
      swept = await sweepOrphanAttachments(db, lim.orphanHours);
      digest = await sendPendingDigest(db);
    } catch (err) {
      // ⚠️ Zincir HER KOŞULDA ilerlemeli: hata görevi öldürürse özet bir daha hiç gitmez.
      SUP_LOG.error({ err }, 'destek bakımı kısmen başarısız');
    }
    const next = await scheduleSupportMaintenance(ctx.tx, ctx.worldId, new Date());
    await ctx.audit({
      action: 'support.maintenance',
      after: { orphansSwept: swept, digestCount: digest, nextAt: next.toISOString() },
    });
  };
}

/** Worker açılışında zinciri garanti eder. */
export async function ensureSupportSchedule(
  runner: { execute: Tx['execute'] }, worldId: number,
): Promise<void> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT 1 FROM missions
     WHERE world_id = ${worldId} AND type = 'support_maintenance' AND status = 'scheduled'
     LIMIT 1
  `);
  if (rows.length > 0) return;
  await scheduleSupportMaintenance(runner, worldId, new Date());
}
