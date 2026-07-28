/**
 * ⭐ SAVAŞ ÇÖZÜMÜ ve DÖNÜŞ BACAĞI (SİSTEM PLANI §13.10, §13.11.7, §13.11.10)
 *
 * `attack` handler'ı motoru gerçek şehirlere bağlayan yerdir. Sözleşme (§1) burada da geçerli:
 * **`ctx.at` "şimdi"dir** (`now()` DEĞİL) ve **her şey tek transaction'dadır** — savaş, kayıplar,
 * ganimet, dönüş görevi ve iki tarafın raporu ya hep birlikte yazılır ya hiç yazılmaz.
 *
 * Zamanlama kuralları (§13.10.2):
 *   • Savaş anı = `mission.execute_at`. Görev 800 ms geç işlense bile savunanın kaynağı ve
 *     ordusu **varış anındaki** hâliyle okunur; zincir kaymaz.
 *   • Dönüş görevi `execute_at = savaş anı + gidiş süresi` (aynı süre, doküman kuralı).
 *   • Ganimet savunandan **savaş anında** düşülür, saldırana **dönüş anında** eklenir.
 */
import { sql } from 'drizzle-orm';
import { LEVEL_BASED, UNITS_BY_ID, heroReviveSeconds } from '@mobiwar/catalog';
import { calculateLoot, simulate, type LootResult, type SimulateInput, type SimulateResult } from '@mobiwar/engine';
import type { CityService } from '../cities/city.service.ts';
import { debitLosses } from '../scoring/score.service.ts';
import type { HandlerContext, MissionHandler, Tx } from './handler-registry.ts';

/**
 * Gece savaşı penceresi — oyunun KENDİ dokümanından:
 * *"Saat 00:00'dan sabah 08:00'a kadar olan zaman gece olarak nitelendirilir."*
 * Oyun saatine göre değerlendirilir (bakımda saat donduğu için pencere de kaymaz).
 */
export const NIGHT_WINDOW = { fromHour: 0, toHour: 8 } as const;

export function isNightBattle(at: Date, window = NIGHT_WINDOW): boolean {
  const h = at.getUTCHours();
  return h >= window.fromHour && h < window.toHour;
}

interface SideState {
  playerId: number;
  units: Record<string, number>;
  techs: Record<string, number>;
  heroes: { id: number; level: number; fAtk: number; fDef: number; mAtk: number; mDef: number }[];
  temple: number;
}

/* ═══ SALDIRI ═══════════════════════════════════════════════════════════════ */

export function createAttackHandler(cities: CityService): MissionHandler {
  return async (ctx) => {
    const targetCityId = ctx.mission.targetCityId;
    const originCityId = ctx.mission.originCityId;
    const attackerPlayerId = ctx.mission.ownerPlayerId;
    if (targetCityId == null || originCityId == null || attackerPlayerId == null) {
      throw new Error('attack: eksik görev alanları (hedef/kaynak şehir veya oyuncu)');
    }

    // Aynı şehre düşen görevler seri hâle gelir → iki saldırı aynı savunmayı iki kez okuyamaz.
    await ctx.lockCity(targetCityId);

    // ⭐ Savunanın kaynağı SAVAŞ ANINA kadar biriktirilir; ganimet bu tutardan hesaplanır.
    await cities.materialize(targetCityId, ctx.at, ctx.tx as never);

    const defenderCity = await loadCityOwner(ctx.tx, targetCityId);
    if (!defenderCity) {
      // Şehir savaş varmadan yok olmuş (terk/fetih). Ordu boş yere gitmiş sayılır: geri döner.
      await scheduleReturn(ctx, {
        originCityId, battleId: null,
        units: await loadMissionUnits(ctx.tx, ctx.mission.id),
        loot: null,
      });
      return;
    }

    const attacker = await loadAttackerState(ctx, attackerPlayerId);
    const defender = await loadDefenderState(ctx.tx, targetCityId, defenderCity.playerId);

    const night = isNightBattle(ctx.at);
    const input: SimulateInput = {
      attacker: {
        counts: attacker.units,
        tech: attacker.techs,
        heroes: attacker.heroes.map(toHeroInput),
        temple: attacker.temple,
        heroCount: attacker.heroes.length,
      },
      defender: {
        counts: defender.units,
        tech: defender.techs,
        heroes: defender.heroes.map(toHeroInput),
        temple: defender.temple,
        heroCount: defender.heroes.length,
      },
      night,
      nightVisionAttacker: attacker.techs['night_vision'] ?? 0,
      nightVisionDefender: defender.techs['night_vision'] ?? 0,
      // ⭐ Determinizm (§5): seed görevin kimliğidir → savaş her yeniden oynatmada aynı biter.
      seed: `mission:${ctx.mission.id}`,
    };

    const result = simulate(input);

    // Savaş öncesi savunmasız mıydı? (`loot.condition = "undefendedBefore"` seçeneği için.)
    const defendedBefore = Object.entries(defender.units)
      .some(([id, n]) => n > 0 && !LEVEL_BASED.has(id));

    const cityResources = await readCityResources(ctx.tx, targetCityId);
    const loot = calculateLoot({
      winner: result.winner,
      debris: result.debris,
      cityResources,
      carryCapacity: result.attackerCarryCapacity,
      defendedBefore,
      seed: `mission:${ctx.mission.id}`,
    });

    const battleId = await writeBattle(ctx, {
      missionId: ctx.mission.id,
      attackerPlayerId,
      defenderPlayerId: defenderCity.playerId,
      attackerCityId: originCityId,
      defenderCityId: targetCityId,
      night,
      input,
      result,
      loot,
    });

    // ── Kayıpları uygula ──────────────────────────────────────────────────────
    await applySurvivors(ctx.tx, targetCityId, result.defender.counts, defender.units);

    /**
     * ⭐ PUAN KAYBI (doküman GENEL DURUM: *"Ordularınızın savaştaki kayıpları … puan
     * kaybetmenize neden olur"*). Motorun `lost` alanı TOPLAM adettir; puan bedeli birim
     * türüne göre değiştiği için kayıp **tür tür** çıkarılır (öncesi − sonrası).
     *
     * ⚠️ Savunanın tabanla geri gelen birimleri `counts` içinde zaten duruyor → onlar
     * kaybedilmiş sayılmaz ve puan götürmez; bu, savunma tabanının (§13.11.10) puan
     * tarafındaki doğal karşılığı.
     */
    await debitLosses(ctx.tx, attackerPlayerId, perTypeLosses(attacker.units, result.attacker.counts));
    await debitLosses(ctx.tx, defenderCity.playerId, perTypeLosses(defender.units, result.defender.counts));

    // ⭐ Yağma savunandan SAVAŞ ANINDA düşülür (§13.10.4): yoldaki mal kimsenin değildir,
    //    savunan geri alamaz, saldıran ancak dönüşte alır.
    if (loot.fromPlunder.gold > 0 || loot.fromPlunder.food > 0) {
      await cities.trySpend(targetCityId, loot.fromPlunder, ctx.at, ctx.tx as never);
    }
    // Taşınamayan enkaz yok olmaz → savunanın şehrine eklenir.
    if (loot.leftoverDebrisToDefender.gold > 0 || loot.leftoverDebrisToDefender.food > 0) {
      await cities.add(targetCityId, loot.leftoverDebrisToDefender, ctx.at, ctx.tx as never);
    }

    await settleHeroes(ctx, defender.heroes, result.defender.heroes, defender.temple, targetCityId);
    const attackerHeroesAlive = await settleHeroes(
      ctx, attacker.heroes, result.attacker.heroes, attacker.temple, originCityId,
    );

    // ── Dönüş bacağı (§13.10.3) ───────────────────────────────────────────────
    // ⭐ Hayatta kalan birlik YOKSA dönüş görevi oluşturulmaz (§13.11.7): ordu yok olmuştur,
    //    ganimet de yoktur. Rapor "ordudan kimse dönmedi" der.
    const survivors = warriorsOnly(result.attacker.counts);
    const anySurvivor = Object.values(survivors).some((n) => n > 0) || attackerHeroesAlive.length > 0;
    if (anySurvivor) {
      await scheduleReturn(ctx, { originCityId, battleId, units: survivors, loot });
    }

    await writeBattleReports(ctx, {
      battleId,
      attackerPlayerId,
      defenderPlayerId: defenderCity.playerId,
      targetCityId,
      originCityId,
      result,
      loot,
      night,
      returning: anySurvivor,
    });

    await ctx.audit({
      action: 'battle.resolved',
      entity: 'battle',
      entityId: battleId,
      playerId: attackerPlayerId,
      after: {
        winner: result.winner, turns: result.turns,
        attackerLost: result.attacker.lost, defenderLost: result.defender.lost,
        loot: loot.taken,
      },
    });
  };
}

/* ═══ DÖNÜŞ ════════════════════════════════════════════════════════════════ */

export function createReturnHandler(cities: CityService): MissionHandler {
  return async (ctx) => {
    const cityId = ctx.mission.targetCityId ?? ctx.mission.originCityId;
    if (cityId == null) throw new Error('return: dönülecek şehir yok');
    await ctx.lockCity(cityId);

    const units = await loadMissionUnits(ctx.tx, ctx.mission.id);
    for (const [type, count] of Object.entries(units)) {
      if (count <= 0) continue;
      await ctx.tx.execute(sql`
        INSERT INTO units (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
        ON CONFLICT (city_id, type) DO UPDATE SET count = units.count + ${count}
      `);
    }

    // Kahramanlar şehre geri konur (ölenler savaş anında zaten ayrılmıştı).
    await ctx.tx.execute(sql`
      UPDATE heroes SET city_id = ${cityId}
       WHERE id IN (SELECT hero_id FROM mission_heroes WHERE mission_id = ${ctx.mission.id})
    `);
    await ctx.tx.execute(sql`DELETE FROM mission_heroes WHERE mission_id = ${ctx.mission.id}`);

    // ⭐ Ganimet VARIŞTA kasaya eklenir (§13.10.3).
    const loot = readLootPayload(ctx.mission.payload);
    if (loot.gold > 0 || loot.food > 0) {
      await cities.add(cityId, loot, ctx.at, ctx.tx as never);
    }

    const playerId = ctx.mission.ownerPlayerId;
    if (playerId != null) {
      await writeMessage(ctx, {
        playerId,
        kind: 'return_report',
        side: 'owner',
        battleId: numOrNull(ctx.mission.payload['battleId']),
        subject: 'Ordu geri döndü',
        body: { cityId, units, loot, at: ctx.at.toISOString() },
      });
      await ctx.emit('city:army_returned', {
        cityId, playerId, units, loot, at: ctx.at.toISOString(),
      });
    }

    await ctx.audit({
      action: 'mission.return.arrived', entity: 'city', entityId: cityId,
      after: { units, loot },
    });
  };
}

/* ═══ Yardımcılar ═══════════════════════════════════════════════════════════ */

function toHeroInput(h: { level: number; fAtk: number; fDef: number; mAtk: number; mDef: number }): {
  level: number; fAtk: number; fDef: number; mAtk: number; mDef: number;
} {
  return { level: h.level, fAtk: h.fAtk, fDef: h.fDef, mAtk: h.mAtk, mDef: h.mDef };
}

async function loadCityOwner(tx: Tx, cityId: number): Promise<{ playerId: number } | null> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT player_id FROM cities WHERE id = ${cityId}
  `);
  return rows[0] ? { playerId: Number(rows[0]['player_id']) } : null;
}

async function loadMissionUnits(tx: Tx, missionId: number): Promise<Record<string, number>> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT unit_type, count FROM mission_units WHERE mission_id = ${missionId}
  `);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r['unit_type'])] = Number(r['count']);
  return out;
}

async function loadTechs(tx: Tx, playerId: number): Promise<Record<string, number>> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT type, level FROM techs WHERE player_id = ${playerId}
  `);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r['type'])] = Number(r['level']);
  return out;
}

async function loadTemple(tx: Tx, cityId: number): Promise<number> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT level FROM buildings WHERE city_id = ${cityId} AND type = 'temple'
  `);
  return Number(rows[0]?.['level'] ?? 0);
}

/** Saldıran ordu görevin kendisinden okunur — şehirden değil (birlikler yola çıkarken düşmüştü). */
async function loadAttackerState(ctx: HandlerContext, playerId: number): Promise<SideState> {
  const heroRows = await ctx.tx.execute<Record<string, unknown>>(sql`
    SELECT h.id, h.level, h.f_atk, h.f_def, h.m_atk, h.m_def
      FROM mission_heroes mh JOIN heroes h ON h.id = mh.hero_id
     WHERE mh.mission_id = ${ctx.mission.id}
  `);
  return {
    playerId,
    units: await loadMissionUnits(ctx.tx, ctx.mission.id),
    techs: await loadTechs(ctx.tx, playerId),
    heroes: heroRows.map(toHeroRow),
    temple: ctx.mission.originCityId == null ? 0 : await loadTemple(ctx.tx, ctx.mission.originCityId),
  };
}

/**
 * Savunanın SAVAŞ ANINDAKİ durumu: barakadaki savaşçılar + surdaki savunma birimleri +
 * Sur/Büyü Kalkanı SEVİYELERİ (bunlar adet değil seviye taşır, §13.11.1b) + oyuncu teknikleri.
 */
async function loadDefenderState(tx: Tx, cityId: number, playerId: number): Promise<SideState> {
  const [unitRows, defRows, heroRows] = await Promise.all([
    tx.execute<Record<string, unknown>>(sql`SELECT type, count FROM units WHERE city_id = ${cityId}`),
    tx.execute<Record<string, unknown>>(sql`SELECT type, count FROM defenses WHERE city_id = ${cityId}`),
    tx.execute<Record<string, unknown>>(sql`
      SELECT id, level, f_atk, f_def, m_atk, m_def FROM heroes
       WHERE city_id = ${cityId} AND dead_until IS NULL
    `),
  ]);

  const units: Record<string, number> = {};
  for (const r of [...unitRows, ...defRows]) {
    const count = Number(r['count']);
    if (count > 0) units[String(r['type'])] = count;
  }

  return {
    playerId,
    units,
    techs: await loadTechs(tx, playerId),
    heroes: heroRows.map(toHeroRow),
    temple: await loadTemple(tx, cityId),
  };
}

function toHeroRow(r: Record<string, unknown>): SideState['heroes'][number] {
  return {
    id: Number(r['id']),
    level: Number(r['level']),
    fAtk: Number(r['f_atk']),
    fDef: Number(r['f_def']),
    mAtk: Number(r['m_atk']),
    mDef: Number(r['m_def']),
  };
}

async function readCityResources(tx: Tx, cityId: number): Promise<{ gold: number; food: number }> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT gold, food FROM cities WHERE id = ${cityId}
  `);
  return { gold: Number(rows[0]?.['gold'] ?? 0), food: Number(rows[0]?.['food'] ?? 0) };
}

/** Savaşçılar `units`, savunma birimleri `defenses` tablosuna yazılır. Sur/Kalkan SEVİYE → dokunulmaz. */
async function applySurvivors(
  tx: Tx, cityId: number, after: Record<string, number>, before: Record<string, number>,
): Promise<void> {
  for (const id of Object.keys(before)) {
    if (LEVEL_BASED.has(id)) continue;          // Sur / Büyü Kalkanı / Tapınak: seviye düşmez
    const def = UNITS_BY_ID[id];
    if (!def) continue;
    const left = Math.max(0, Math.trunc(after[id] ?? 0));
    const table = def.kind === 'defense' ? 'defenses' : 'units';
    await tx.execute(sql`
      UPDATE ${sql.raw(table)} SET count = ${left} WHERE city_id = ${cityId} AND type = ${id}
    `);
  }
}

/** Savaş öncesi/sonrası adetlerden tür tür kayıp. Artı yönde değişim (taban onarımı) sayılmaz. */
function perTypeLosses(
  before: Record<string, number>, after: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(before)) {
    const lost = Math.trunc(n) - Math.max(0, Math.trunc(after[id] ?? 0));
    if (lost > 0) out[id] = lost;
  }
  return out;
}

function warriorsOnly(counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(counts)) {
    if (UNITS_BY_ID[id]?.kind !== 'warrior') continue;
    const count = Math.max(0, Math.trunc(n));
    if (count > 0) out[id] = count;
  }
  return out;
}

/**
 * Kahraman sonuçları. Ölen kahraman **silinmez** — seviyesi ve yetenekleri korunur, `dead_until`
 * ile diriltme süresine girer (§13.11.7) ve sahibinin şehrine geri konur.
 *
 * ⚠️ Buradaki `dead_until`, dokümandaki *ücretli* diriltmenin (§13.11.4b: `(3000,2000)×1,5^lvl`)
 * yerine geçmez; onun **otomatik kurtarma süresi**dir (aynı formülün süre bacağı). Oyuncunun
 * ücret ödeyip süreyi kısalttığı kuyruk akışı Faz 4'te eklenecek.
 *
 * @returns hayatta kalan kahramanların id'leri
 */
async function settleHeroes(
  ctx: HandlerContext,
  before: SideState['heroes'],
  after: { level: number; durum: number; alive: boolean }[],
  temple: number,
  homeCityId: number | null,
): Promise<number[]> {
  const alive: number[] = [];
  for (let i = 0; i < before.length; i++) {
    const hero = before[i]!;
    // Motor kahramanları girdi sırasıyla döndürür; eşleşme indeks üzerinden.
    if (after[i]?.alive !== false) {
      alive.push(hero.id);
      continue;
    }
    const deadUntil = new Date(ctx.at.getTime() + heroReviveSeconds(hero.level, temple) * 1000);
    await ctx.tx.execute(sql`
      UPDATE heroes SET dead_until = ${deadUntil.toISOString()}::timestamptz, city_id = ${homeCityId}
       WHERE id = ${hero.id}
    `);
    // Ölen kahraman dönüş görevine bağlı kalmamalı (tekil indeks onu bir sonraki sefere kilitlerdi).
    await ctx.tx.execute(sql`DELETE FROM mission_heroes WHERE hero_id = ${hero.id}`);
  }
  return alive;
}

async function writeBattle(ctx: HandlerContext, o: {
  missionId: number;
  attackerPlayerId: number;
  defenderPlayerId: number;
  attackerCityId: number;
  defenderCityId: number;
  night: boolean;
  input: SimulateInput;
  result: SimulateResult;
  loot: LootResult;
}): Promise<number> {
  const rows = await ctx.tx.execute<Record<string, unknown>>(sql`
    INSERT INTO battles (world_id, mission_id, attacker_player_id, defender_player_id,
                         attacker_city_id, defender_city_id, at, winner, night,
                         rng_seed, engine_version, catalog_hash, input, result)
    VALUES (${ctx.worldId}, ${o.missionId}, ${o.attackerPlayerId}, ${o.defenderPlayerId},
            ${o.attackerCityId}, ${o.defenderCityId}, ${ctx.at.toISOString()}::timestamptz,
            ${o.result.winner}, ${o.night},
            ${o.result.seed}, ${o.result.engineVersion}, ${o.result.catalogHash},
            ${JSON.stringify(o.input)}::jsonb,
            ${JSON.stringify({ ...o.result, loot: o.loot })}::jsonb)
    RETURNING id
  `);
  return Number(rows[0]!['id']);
}

/** Dönüş görevi + taşınan birlikler + ganimet. Kahramanlar aynı satırla yeni göreve taşınır. */
async function scheduleReturn(ctx: HandlerContext, o: {
  originCityId: number;
  battleId: number | null;
  units: Record<string, number>;
  loot: LootResult | null;
}): Promise<number> {
  const travel = Number(ctx.mission.payload['travelSeconds'] ?? 0);
  const executeAt = new Date(ctx.at.getTime() + Math.max(1, travel) * 1000);
  const taken = o.loot?.taken ?? { gold: 0, food: 0 };

  const rows = await ctx.tx.execute<Record<string, unknown>>(sql`
    INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                          execute_at, payload, idempotency_key)
    VALUES (${ctx.worldId}, 'return', 'scheduled', ${ctx.mission.ownerPlayerId},
            ${ctx.mission.targetCityId}, ${o.originCityId},
            ${executeAt.toISOString()}::timestamptz,
            ${JSON.stringify({
              battleId: o.battleId,
              loot: taken,
              travelSeconds: travel,
              fromMissionId: ctx.mission.id,
            })}::jsonb,
            ${`return:${ctx.mission.id}`})
    RETURNING id
  `);
  const returnMissionId = Number(rows[0]!['id']);

  for (const [type, count] of Object.entries(o.units)) {
    if (count <= 0) continue;
    await ctx.tx.execute(sql`
      INSERT INTO mission_units (mission_id, unit_type, count) VALUES (${returnMissionId}, ${type}, ${count})
    `);
  }
  await ctx.tx.execute(sql`
    UPDATE mission_heroes SET mission_id = ${returnMissionId} WHERE mission_id = ${ctx.mission.id}
  `);
  return returnMissionId;
}

async function writeBattleReports(ctx: HandlerContext, o: {
  battleId: number;
  attackerPlayerId: number;
  defenderPlayerId: number;
  targetCityId: number;
  originCityId: number;
  result: SimulateResult;
  loot: LootResult;
  night: boolean;
  returning: boolean;
}): Promise<void> {
  const won = o.result.winner === 'attacker';
  const base = {
    battleId: o.battleId,
    winner: o.result.winner,
    turns: o.result.turns,
    night: o.night,
    at: ctx.at.toISOString(),
  };

  await writeMessage(ctx, {
    playerId: o.attackerPlayerId,
    kind: 'battle_report',
    side: 'attacker',
    battleId: o.battleId,
    subject: won ? 'Saldırın başarılı' : 'Saldırın püskürtüldü',
    body: {
      ...base,
      targetCityId: o.targetCityId,
      lost: o.result.attacker.lost,
      survivors: o.result.attacker.counts,
      loot: o.loot.taken,
      lootBreakdown: o.loot,
      armyReturning: o.returning,
    },
  });

  await writeMessage(ctx, {
    playerId: o.defenderPlayerId,
    kind: 'battle_report',
    side: 'defender',
    battleId: o.battleId,
    subject: won ? 'Şehrin yağmalandı' : 'Saldırıyı püskürttün',
    body: {
      ...base,
      cityId: o.targetCityId,
      lost: o.result.defender.lost,
      survivors: o.result.defender.counts,
      // ⭐ Savunma tabanı raporda ayrıca gösterilir (§13.11.10): "okçu kulesi 4 … korundu".
      defenseFloorRestored: o.result.defender.floorRestored,
      wallIntegrity: o.result.defender.wallIntegrity,
      lost_resources: o.loot.fromPlunder,
      debrisRecovered: o.loot.leftoverDebrisToDefender,
    },
  });

  // Bildirim (push/WS) outbox üzerinden — savaşla AYNI transaction'da (§1).
  await ctx.emit('battle:resolved', {
    battleId: o.battleId,
    attackerPlayerId: o.attackerPlayerId,
    defenderPlayerId: o.defenderPlayerId,
    winner: o.result.winner,
    cityId: o.targetCityId,
    at: ctx.at.toISOString(),
  });
}

async function writeMessage(ctx: HandlerContext, o: {
  playerId: number;
  kind: string;
  side: string;
  battleId: number | null;
  subject: string;
  body: Record<string, unknown>;
}): Promise<void> {
  await ctx.tx.execute(sql`
    INSERT INTO messages (world_id, player_id, kind, side, battle_id, mission_id, subject, body, at)
    VALUES (${ctx.worldId}, ${o.playerId}, ${o.kind}, ${o.side}, ${o.battleId}, ${ctx.mission.id},
            ${o.subject}, ${JSON.stringify(o.body)}::jsonb, ${ctx.at.toISOString()}::timestamptz)
  `);
}

function readLootPayload(payload: Record<string, unknown>): { gold: number; food: number } {
  const loot = payload['loot'];
  if (!loot || typeof loot !== 'object') return { gold: 0, food: 0 };
  const l = loot as Record<string, unknown>;
  return { gold: Math.max(0, Number(l['gold'] ?? 0)), food: Math.max(0, Number(l['food'] ?? 0)) };
}

function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/** Worker'a kaydedilecek tipler. */
export function battleHandlers(cities: CityService): Record<string, MissionHandler> {
  return {
    attack: createAttackHandler(cities),
    return: createReturnHandler(cities),
  };
}
