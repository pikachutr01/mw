/**
 * `echo` — Faz 1'in **uçtan uca test görev tipi** (SİSTEM PLANI §12: "Sahte bir görev tipiyle
 * (`echo`) uçtan uca test").
 *
 * Gerçek oyun etkisi yok; sadece omurganın üç garantisini ölçülebilir kılar:
 *   1. Görev bir kez ve yalnız bir kez uygulandı mı? → `echo_effects` satır sayısı
 *   2. Sıra doğru mu?                               → `seq` sütunu (uygulama sırası)
 *   3. Handler "şimdi" olarak neyi gördü?           → `saw_at` = mission.executeAt (oyun saati)
 *
 * `mission_id` UNIQUE olduğu için ÇİFT ÇALIŞMA veritabanı seviyesinde imkânsızdır: handler ikinci
 * kez koşarsa insert patlar, transaction geri alınır.
 */
import { sql } from 'drizzle-orm';
import type { HandlerContext, MissionHandler } from './handler-registry.ts';

export const ECHO_TABLE_DDL = sql`
  CREATE TABLE IF NOT EXISTS echo_effects (
    mission_id bigint PRIMARY KEY,
    world_id   smallint NOT NULL,
    label      text,
    saw_at     timestamptz NOT NULL,   -- handler'in "simdi" kabul ettigi an (oyun saati)
    applied_at timestamptz NOT NULL DEFAULT now(),
    seq        bigserial
  )
`;

export const echoHandler: MissionHandler = async (ctx: HandlerContext) => {
  const label = typeof ctx.mission.payload['label'] === 'string' ? ctx.mission.payload['label'] : null;

  // Şehir kilidi: aynı hedefe düşen görevlerin serileşmesini test edebilmek için.
  if (ctx.mission.targetCityId != null) await ctx.lockCity(ctx.mission.targetCityId);

  // Sahte "yavaş iş" — crash testinin transaction ortasında öldürebilmesi için.
  const delayMs = Number(ctx.mission.payload['delayMs'] ?? 0);
  if (delayMs > 0) await ctx.tx.execute(sql`SELECT pg_sleep(${delayMs / 1000})`);

  // Handler bilerek patlatılabilsin (retry / dead-letter testi).
  if (ctx.mission.payload['fail'] === true) {
    throw new Error(`echo görevi kasten başarısız: ${label ?? ctx.mission.id}`);
  }

  await ctx.tx.execute(sql`
    INSERT INTO echo_effects (mission_id, world_id, label, saw_at)
    VALUES (${ctx.mission.id}, ${ctx.worldId}, ${label}, ${ctx.at.toISOString()}::timestamptz)
  `);

  await ctx.emit('echo:done', { missionId: ctx.mission.id, label, at: ctx.at.toISOString() });
  await ctx.audit({ action: 'echo.applied', entity: 'mission', entityId: ctx.mission.id, after: { label } });
};
