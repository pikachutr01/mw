/**
 * Kuyruk bitiş handler'ları — Faz 1 omurgasının ilk GERÇEK görev tipleri.
 *
 * Sözleşme (§1): `ctx.at` "şimdi"dir (`now()` değil), her şey tek transaction'da, outbox satırı
 * aynı transaction'da yazılır. Kuyruk satırı `completed_at` ile kapanır; `missions.idempotency_key`
 * = `queue:<id>` olduğu için aynı kuyruk iki kez uygulanamaz.
 */
import { sql } from 'drizzle-orm';
import type { HandlerContext, MissionHandler } from '../missions/handler-registry.ts';
import { materializeUnitQueues } from './unit-queue.ts';

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

/**
 * `unit_finish` — savaşçı siparişinin BİTİŞ noktası.
 *
 * ⚠️ Askerleri **burada toplu eklemez**: üretim teker teker ve tembel ilerliyor
 * (`materializeUnitQueues`, bkz. `queues/unit-queue.ts`). Bu handler yalnız iki iş yapar:
 *   1. Şehri bu ana kadar ilerletir → kalan birimler eklenir, biten sipariş kapanır,
 *      **sıradaki emir başlar**.
 *   2. Yeni başlayan emir için bir sonraki bitiş görevini kurar (zincirin devamı).
 *
 * Görev geç işlense bile sonuç aynı: `ctx.at` görevin vadesidir ve materializasyon o ana göre
 * hesaplar. Oyuncu hiç girmese de worker bu zinciri yürütür.
 */
/**
 * ⭐ İki kategori de AYNI banttan geçer (2026-07-29): tek fark hangi `queues.category`
 * satırlarının işleneceği ve bitiş görevinin tipi. Savunma birimleri için ayrı bir handler
 * yazsaydık zincir kurma mantığı iki yerde yaşar ve kaçınılmaz olarak ayrışırdı.
 */
function bandFinishHandler(category: 'unit' | 'defense'): MissionHandler {
  const missionType = category === 'unit' ? 'unit_finish' : 'defense_finish';
  return async (ctx) => {
    const cityId = ctx.mission.targetCityId;
    if (cityId == null) throw new Error(`${missionType}: şehir yok`);
    await ctx.lockCity(cityId);

    const produced = await materializeUnitQueues(ctx.tx as never, cityId, ctx.at, category);

    // Sıradaki (ya da hâlâ süren) emir için bitiş görevi yoksa kur — zincir kopmasın.
    const open = await ctx.tx.execute<Record<string, unknown>>(sql`
      SELECT id, item_type, count, finish_at, mission_id FROM queues
       WHERE city_id = ${cityId} AND category = ${category} AND target_level IS NULL
         AND completed_at IS NULL AND canceled_at IS NULL AND position = 1
       LIMIT 1
    `);
    const next = open[0];
    if (next && next['mission_id'] == null) {
      const rows = await ctx.tx.execute<Record<string, unknown>>(sql`
        INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                              execute_at, payload, idempotency_key)
        VALUES (${ctx.worldId}, ${missionType}, 'scheduled', ${ctx.mission.ownerPlayerId},
                ${cityId}, ${cityId}, ${String(next['finish_at'])}::timestamptz,
                ${JSON.stringify({
                  queueId: Number(next['id']), itemType: String(next['item_type']),
                  targetLevel: null, count: Number(next['count']),
                })}::jsonb,
                ${`queue:${Number(next['id'])}`})
        RETURNING id
      `);
      await ctx.tx.execute(sql`
        UPDATE queues SET mission_id = ${Number(rows[0]!['id'])} WHERE id = ${Number(next['id'])}
      `);
    }

    if (Object.keys(produced).length > 0) {
      await ctx.emit(category === 'unit' ? 'city:units_finished' : 'city:defense_finished', {
        cityId, playerId: ctx.mission.ownerPlayerId, produced, at: ctx.at.toISOString(),
      });
      await ctx.audit({
        action: `${category}.finished`, entity: 'city', entityId: cityId, after: { produced },
      });
    }
  };
}

export const unitFinishHandler: MissionHandler = bandFinishHandler('unit');

/**
 * `defense_finish` — savunma birimi ekler.
 * Sur ve Büyü Kalkanı ADET değil SEVİYE taşır (§13.11.1b) → onlarda `count` yerine `target_level`.
 */
/**
 * `defense_finish` — İKİ ŞERİDİ de kapatır (§13.21.3):
 *   • `target_level` doluysa **Sur / Büyü Kalkanı** yükseltmesi: adet artmaz, SEVİYE atanır.
 *     Bu şerit banttan bağımsızdır, birim üretimiyle paralel ilerler.
 *   • değilse **savunma birimi bandı**: Baraka'daki tek bandın aynısı (teker teker, tembel).
 */
export const defenseFinishHandler: MissionHandler = async (ctx) => {
  const p = payloadOf(ctx);
  const cityId = ctx.mission.targetCityId;
  if (cityId == null) throw new Error('defense_finish: şehir yok');

  if (p.targetLevel == null) {
    await bandFinishHandler('defense')(ctx);
    return;
  }

  await ctx.lockCity(cityId);
  if (!await closeQueue(ctx, p.queueId)) return;

  // Seviye tabanlı yapı (sur / büyü kalkanı): adet ARTMAZ, seviye ATANIR.
  await ctx.tx.execute(sql`
    INSERT INTO defenses (city_id, type, count) VALUES (${cityId}, ${p.itemType}, ${p.targetLevel})
    ON CONFLICT (city_id, type) DO UPDATE SET count = ${p.targetLevel}
  `);

  await ctx.emit('city:defense_finished', {
    cityId, playerId: ctx.mission.ownerPlayerId,
    type: p.itemType, level: p.targetLevel, at: ctx.at.toISOString(),
  });
  await ctx.audit({
    action: 'defense.finished', entity: 'city', entityId: cityId,
    after: { type: p.itemType, level: p.targetLevel },
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
