/**
 * ⭐ MAĞARA GÖREVLERİ (§13.20)
 *
 * Üç tip, üçü de aynı çatıda (§1) ve `ctx.at` "şimdi"dir:
 *   `cave_store`    → yoldaki birlikler mağaraya girer
 *   `cave_withdraw` → mağaradan çıkan birlikler şehre varır
 *   `cave_return`   → **mağara yıkıldığında** içerideki (veya yoldaki) birliklerin şehre kaçışı
 *
 * `cave_return` neden ayrı bir tip? Çünkü oyuncunun ekranında bu bir **destek varışı** gibi
 * görünmeli (sarı kalkan) ama gerçek bir destek görevi DEĞİL: kaynağı ve hedefi aynı şehirdir,
 * kaynak taşımaz ve iptal edilemez. Ayrı tip, Ordular ekranındaki görünürlük matrisini
 * (§13.10.1) bozmadan bu istisnayı temiz tutuyor.
 */
import { sql } from 'drizzle-orm';
import { caveTransferSeconds, unitsArea } from '@mobiwar/catalog';
import type { HandlerContext, MissionHandler, Tx } from '../missions/handler-registry.ts';
import { addCaveUnits, addCityUnits } from './cave.service.ts';

/** Görevin taşıdığı birlikler. */
async function loadUnits(tx: Tx, missionId: number): Promise<Record<string, number>> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT unit_type, count FROM mission_units WHERE mission_id = ${missionId}
  `);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r['unit_type'])] = Number(r['count']);
  return out;
}

/** Yoldaki birlikler mağaraya girdi. */
const storeHandler: MissionHandler = async (ctx) => {
  const cityId = ctx.mission.targetCityId;
  if (cityId == null) throw new Error('cave_store: hedef şehir yok');
  await ctx.lockCity(cityId);

  const units = await loadUnits(ctx.tx, ctx.mission.id);
  await addCaveUnits(ctx.tx, cityId, units);

  await ctx.emit('city:changed', {
    cityId, playerId: ctx.mission.ownerPlayerId, reason: 'cave_store',
  });
  await ctx.audit({
    action: 'cave.stored', entity: 'city', entityId: cityId,
    playerId: ctx.mission.ownerPlayerId, after: { units },
  });
};

/** Mağaradan çıkan birlikler şehre vardı. */
const withdrawHandler: MissionHandler = async (ctx) => {
  const cityId = ctx.mission.targetCityId;
  if (cityId == null) throw new Error('cave_withdraw: hedef şehir yok');
  await ctx.lockCity(cityId);

  const units = await loadUnits(ctx.tx, ctx.mission.id);
  await addCityUnits(ctx.tx, cityId, units);

  await ctx.emit('city:changed', {
    cityId, playerId: ctx.mission.ownerPlayerId, reason: 'cave_withdraw',
  });
  await ctx.audit({
    action: 'cave.withdrawn', entity: 'city', entityId: cityId,
    playerId: ctx.mission.ownerPlayerId, after: { units },
  });
};

/** Yıkılan mağaradan kaçan birlikler şehre vardı. */
const returnHandler: MissionHandler = async (ctx) => {
  const cityId = ctx.mission.targetCityId;
  if (cityId == null) throw new Error('cave_return: hedef şehir yok');
  await ctx.lockCity(cityId);

  const units = await loadUnits(ctx.tx, ctx.mission.id);
  await addCityUnits(ctx.tx, cityId, units);

  await ctx.emit('city:changed', {
    cityId, playerId: ctx.mission.ownerPlayerId, reason: 'cave_collapsed_return',
  });
  await ctx.audit({
    action: 'cave.returned', entity: 'city', entityId: cityId,
    playerId: ctx.mission.ownerPlayerId, after: { units },
  });
};

/**
 * ⭐ MAĞARA YIKILDI — içerideki ve **yoldaki** birlikleri şehre kaçırır.
 *
 * Doküman: *"Mağaralar yıkıldıktan sonra ordu savaşa yine katılmaz ve şehre kaçar. Bu nedenle
 * mağara yıkılsa bile ordunuzun şehre dönmesi mağara boşaltma süresi kadar olur."*
 *
 * Üç senaryo ve süreleri (kullanıcı kararı 2026-07-28):
 *  • **İçerideki ordu** → boşaltma süresi kadar (`caveTransferSeconds(alan, seviye)`).
 *  • **Doldurulurken yıkıldı** → birlikler gittikleri kadar yolu geri dönerler: `geçen süre`.
 *    (Yolun yarısındaysa yarım sürede dönerler — mesafe simetrik.)
 *  • **Boşaltılırken yıkıldı** → zaten şehre gidiyorlardı: `kalan süre` kadar sonra varırlar.
 *
 * Üçünde de ordu **savaşa katılmaz**: savaş anında şehirde değildir.
 *
 * @returns yazılan `cave_return` görevlerinin sayısı
 */
export async function scheduleCaveEscape(ctx: HandlerContext, o: {
  cityId: number;
  playerId: number | null;
  caveLevel: number;
  /** Mağaranın içindekiler (boşaltıldıktan sonra verilir). */
  inside: Record<string, number>;
}): Promise<number> {
  let written = 0;

  const insideArea = unitsArea(o.inside);
  if (insideArea > 0) {
    await writeEscape(ctx, {
      cityId: o.cityId, playerId: o.playerId, units: o.inside,
      seconds: caveTransferSeconds(insideArea, o.caveLevel), reason: 'inside',
    });
    written++;
  }

  /**
   * Süren doldurma/boşaltma işleri iptal edilir ve **kaçışa çevrilir**. Görevi öylece
   * bırakmak olmaz: `cave_store` daha sonra çalışıp askerleri yıkılmış mağaraya koyardı.
   */
  const jobs = await ctx.tx.execute<Record<string, unknown>>(sql`
    SELECT id, type, created_at, execute_at FROM missions
     WHERE target_city_id = ${o.cityId}
       AND type IN ('cave_store', 'cave_withdraw')
       AND status IN ('scheduled', 'running')
     FOR UPDATE
  `);

  for (const j of jobs) {
    const missionId = Number(j['id']);
    const type = String(j['type']);
    const startedAt = new Date(String(j['created_at'])).getTime();
    const finishAt = new Date(String(j['execute_at'])).getTime();
    const now = ctx.at.getTime();

    const seconds = type === 'cave_store'
      // Doldurmaya gidiyorlardı → gittikleri yol kadar geri dönerler.
      ? Math.max(1, Math.round((now - startedAt) / 1000))
      // Boşaltılıyorlardı → zaten şehre gidiyorlardı, kalan süre kadar sonra varırlar.
      : Math.max(1, Math.round((finishAt - now) / 1000));

    const units = await loadUnits(ctx.tx, missionId);
    await ctx.tx.execute(sql`
      UPDATE missions SET status = 'canceled', finished_at = now() WHERE id = ${missionId}
    `);
    if (Object.keys(units).length === 0) continue;

    await writeEscape(ctx, {
      cityId: o.cityId, playerId: o.playerId, units, seconds,
      reason: type === 'cave_store' ? 'interrupted_store' : 'interrupted_withdraw',
    });
    written++;
  }

  return written;
}

async function writeEscape(ctx: HandlerContext, o: {
  cityId: number; playerId: number | null; units: Record<string, number>;
  seconds: number; reason: string;
}): Promise<void> {
  const executeAt = new Date(ctx.at.getTime() + Math.max(1, o.seconds) * 1000);
  const rows = await ctx.tx.execute<Record<string, unknown>>(sql`
    INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                          execute_at, payload, idempotency_key)
    VALUES (${ctx.worldId}, 'cave_return', 'scheduled', ${o.playerId}, ${o.cityId}, ${o.cityId},
            ${executeAt.toISOString()}::timestamptz,
            ${JSON.stringify({ reason: o.reason, seconds: o.seconds })}::jsonb,
            ${`cave_return:${ctx.mission.id}:${o.reason}`})
    RETURNING id
  `);
  const missionId = Number(rows[0]!['id']);
  for (const [type, count] of Object.entries(o.units)) {
    if (!(count > 0)) continue;
    await ctx.tx.execute(sql`
      INSERT INTO mission_units (mission_id, unit_type, count) VALUES (${missionId}, ${type}, ${count})
    `);
  }
}

/** Worker'a kaydedilecek tipler. */
export const CAVE_HANDLERS: Record<string, MissionHandler> = {
  cave_store: storeHandler,
  cave_withdraw: withdrawHandler,
  cave_return: returnHandler,
};
