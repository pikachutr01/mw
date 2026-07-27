/**
 * Kuyruk bitiş handler'ları — Faz 1 omurgasının ilk GERÇEK görev tipleri.
 *
 * Sözleşme (§1): `ctx.at` "şimdi"dir (`now()` değil), her şey tek transaction'da, outbox satırı
 * aynı transaction'da yazılır. Kuyruk satırı `completed_at` ile kapanır; `missions.idempotency_key`
 * = `queue:<id>` olduğu için aynı kuyruk iki kez uygulanamaz.
 */
import { sql } from 'drizzle-orm';
import type { HandlerContext, MissionHandler } from '../missions/handler-registry.ts';

interface QueuePayload {
  queueId: number;
  itemType: string;
  targetLevel: number | null;
  count: number | null;
}

function payloadOf(ctx: HandlerContext): QueuePayload {
  const p = ctx.mission.payload;
  return {
    queueId: Number(p['queueId']),
    itemType: String(p['itemType']),
    targetLevel: p['targetLevel'] == null ? null : Number(p['targetLevel']),
    count: p['count'] == null ? null : Number(p['count']),
  };
}

/**
 * Kuyruk satırını kapatır. `completed_at IS NULL` koşulu ikinci kez uygulamayı engeller;
 * satır zaten kapalıysa `false` döner ve handler etkiyi UYGULAMAZ.
 */
async function closeQueue(ctx: HandlerContext, queueId: number): Promise<boolean> {
  const rows = await ctx.tx.execute<Record<string, unknown>>(sql`
    UPDATE queues SET completed_at = ${ctx.at.toISOString()}::timestamptz
     WHERE id = ${queueId} AND completed_at IS NULL AND canceled_at IS NULL
    RETURNING id
  `);
  return rows.length > 0;
}

/** `building_finish` — yapı seviyesini bir artırır. */
export const buildingFinishHandler: MissionHandler = async (ctx) => {
  const p = payloadOf(ctx);
  const cityId = ctx.mission.targetCityId;
  if (cityId == null) throw new Error('building_finish: şehir yok');
  await ctx.lockCity(cityId);
  if (!await closeQueue(ctx, p.queueId)) return;   // iptal edilmiş veya zaten uygulanmış

  await ctx.tx.execute(sql`
    INSERT INTO buildings (city_id, type, level) VALUES (${cityId}, ${p.itemType}, ${p.targetLevel})
    ON CONFLICT (city_id, type) DO UPDATE SET level = ${p.targetLevel}
  `);

  await ctx.emit('city:building_finished', {
    // ⭐ `playerId` gerçek zamanlı yol için ŞART: olay kime gidecek, oradan bulunuyor.
    cityId, playerId: ctx.mission.ownerPlayerId,
    type: p.itemType, level: p.targetLevel, at: ctx.at.toISOString(),
  });
  await ctx.audit({
    action: 'building.finished', entity: 'city', entityId: cityId,
    after: { type: p.itemType, level: p.targetLevel },
  });
};

/** `unit_finish` — üretilen savaşçıları barakaya ekler. */
export const unitFinishHandler: MissionHandler = async (ctx) => {
  const p = payloadOf(ctx);
  const cityId = ctx.mission.targetCityId;
  if (cityId == null) throw new Error('unit_finish: şehir yok');
  await ctx.lockCity(cityId);
  if (!await closeQueue(ctx, p.queueId)) return;

  await ctx.tx.execute(sql`
    INSERT INTO units (city_id, type, count) VALUES (${cityId}, ${p.itemType}, ${p.count})
    ON CONFLICT (city_id, type) DO UPDATE SET count = units.count + ${p.count}
  `);

  await ctx.emit('city:units_finished', {
    cityId, playerId: ctx.mission.ownerPlayerId,
    type: p.itemType, count: p.count, at: ctx.at.toISOString(),
  });
  await ctx.audit({
    action: 'units.finished', entity: 'city', entityId: cityId,
    after: { type: p.itemType, count: p.count },
  });
};

/**
 * `defense_finish` — savunma birimi ekler.
 * Sur ve Büyü Kalkanı ADET değil SEVİYE taşır (§13.11.1b) → onlarda `count` yerine `target_level`.
 */
export const defenseFinishHandler: MissionHandler = async (ctx) => {
  const p = payloadOf(ctx);
  const cityId = ctx.mission.targetCityId;
  if (cityId == null) throw new Error('defense_finish: şehir yok');
  await ctx.lockCity(cityId);
  if (!await closeQueue(ctx, p.queueId)) return;

  if (p.targetLevel != null) {
    // Seviye tabanlı yapı (sur / büyü kalkanı): adet ARTMAZ, seviye ATANIR.
    await ctx.tx.execute(sql`
      INSERT INTO defenses (city_id, type, count) VALUES (${cityId}, ${p.itemType}, ${p.targetLevel})
      ON CONFLICT (city_id, type) DO UPDATE SET count = ${p.targetLevel}
    `);
  } else {
    await ctx.tx.execute(sql`
      INSERT INTO defenses (city_id, type, count) VALUES (${cityId}, ${p.itemType}, ${p.count})
      ON CONFLICT (city_id, type) DO UPDATE SET count = defenses.count + ${p.count}
    `);
  }

  await ctx.emit('city:defense_finished', {
    cityId, playerId: ctx.mission.ownerPlayerId,
    type: p.itemType, count: p.count, level: p.targetLevel, at: ctx.at.toISOString(),
  });
  await ctx.audit({
    action: 'defense.finished', entity: 'city', entityId: cityId,
    after: { type: p.itemType, count: p.count, level: p.targetLevel },
  });
};

/** `tech_finish` — teknik seviyesini artırır. Teknik OYUNCU-GENEL (şehir değil, §13.11.5). */
export const techFinishHandler: MissionHandler = async (ctx) => {
  const p = payloadOf(ctx);
  const playerId = ctx.mission.ownerPlayerId;
  if (playerId == null) throw new Error('tech_finish: oyuncu yok');
  if (!await closeQueue(ctx, p.queueId)) return;

  await ctx.tx.execute(sql`
    INSERT INTO techs (player_id, type, level) VALUES (${playerId}, ${p.itemType}, ${p.targetLevel})
    ON CONFLICT (player_id, type) DO UPDATE SET level = ${p.targetLevel}
  `);

  await ctx.emit('player:tech_finished', {
    playerId, type: p.itemType, level: p.targetLevel, at: ctx.at.toISOString(),
  });
  await ctx.audit({
    action: 'tech.finished', entity: 'player', entityId: playerId, playerId,
    after: { type: p.itemType, level: p.targetLevel },
  });
};

/** Worker'a kaydedilecek tipler. */
export const QUEUE_HANDLERS = {
  building_finish: buildingFinishHandler,
  unit_finish: unitFinishHandler,
  defense_finish: defenseFinishHandler,
  tech_finish: techFinishHandler,
} as const;
