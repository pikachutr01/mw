/**
 * ⭐ ASKERÎ ÜNVANLAR — Subay · Komutan · Başkomutan · Mareşal.
 *
 * Ölçülen davranışlar:
 *   • birim türü değeri: 400 Cüce ile 400 Ejderha aynı başarı DEĞİL (kullanıcının şartı)
 *   • eşiğin altındaki savaş ünvan vermez
 *   • terfi süreyi sıfırlar · aynı basamak yalnız süreyi yeniler · düşük savaş rozeti DÜŞÜRMEZ
 *   • süresi geçmiş ünvan yok sayılır (temizleyen görev yok, okuma anında süzülüyor)
 *   • aynı ittifaktakiler arasındaki savaş SAYILMAZ
 *   • gerçek bir savaşta iki tarafa da verilir — kaybeden de alır
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MERIT_TIERS, meritTierFor } from '@mobilwar/catalog';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { toDate } from '../src/db/client.ts';
import { applyMerit, meritScore } from '../src/merit/merit.service.ts';
import { battleHandlers } from '../src/missions/battle.handlers.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { MissionService } from '../src/missions/mission.service.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, dueAt, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;
let cities: CityService;
let missions: MissionService;
let registry: HandlerRegistry;
let attacker: number;
let defender: number;
let attackCity: number;
let defendCity: number;

const GUN_MS = 86_400_000;

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  missions = new MissionService(h.db, cities);
  registry = new HandlerRegistry();
  for (const [type, handler] of Object.entries(battleHandlers(cities))) registry.register(type, handler);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  attacker = await createPlayer(h, worldId, 'atk');
  defender = await createPlayer(h, worldId, 'def');
  const at = await clock.gameNow(worldId);
  attackCity = await cities.create({
    worldId, playerId: attacker, name: 'saldiran', k: 1, d: 1, s: 1, isCapital: true, at,
  });
  defendCity = await cities.create({
    worldId, playerId: defender, name: 'savunan', k: 1, d: 1, s: 2, isCapital: true, at,
  });
  await h.db.execute(sql`UPDATE players SET protected_until = NULL WHERE world_id = ${worldId}`);
  await h.db.execute(sql`
    INSERT INTO buildings (city_id, type, level) VALUES (${attackCity}, 'barracks', 20)
    ON CONFLICT (city_id, type) DO UPDATE SET level = 20
  `);
});

async function meritOf(playerId: number): Promise<{
  tier: number | null; score: number | null; expiresAt: Date | null; battleId: number | null;
}> {
  const [r] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT merit_tier, merit_score, merit_expires_at, merit_battle_id
      FROM players WHERE id = ${playerId}
  `);
  return {
    tier: r?.['merit_tier'] == null ? null : Number(r['merit_tier']),
    score: r?.['merit_score'] == null ? null : Number(r['merit_score']),
    expiresAt: r?.['merit_expires_at'] == null ? null : toDate(r['merit_expires_at']),
    battleId: r?.['merit_battle_id'] == null ? null : Number(r['merit_battle_id']),
  };
}

/** `applyMerit` bir `Tx` bekliyor; testte tek transaction yeterli. */
async function apply(playerId: number, losses: Record<string, number>, at: Date): Promise<unknown> {
  return h.db.transaction(async (tx) => applyMerit({
    tx: tx as never, playerId, battleId: 1, enemyLosses: losses, at,
  }));
}

/* ═══ Değer ölçüsü ═══════════════════════════════════════════════════════════ */

describe('kıyım puanı — tür ve sayı birlikte', () => {
  it('⭐ 400 Cüce ile 400 Ejderha aynı başarı DEĞİL (kullanıcının ölçütü)', () => {
    const cuce = meritScore({ dwarf: 400 });
    const ejderha = meritScore({ dragon: 400 });
    expect(cuce).toBeCloseTo(260, 6);          // 400 × (200+450) / 1000
    expect(ejderha).toBeCloseTo(26_000, 6);    // 400 × (45000+20000) / 1000
    expect(ejderha / cuce).toBeCloseTo(100, 6);
  });

  it('⭐ 1000 Elf, 15 Kaos’a bedel değil (kullanıcının ikinci ölçütü)', () => {
    const elf = meritScore({ elf: 1000 });
    const kaos = meritScore({ chaos: 15 });
    expect(elf).toBeCloseTo(1_100, 6);
    expect(kaos).toBeCloseTo(60_000, 6);
    expect(kaos).toBeGreaterThan(elf * 50);
  });

  it('Sur ve Büyü Kalkanı puan getirmez — savaşta adet kaybetmezler', () => {
    expect(meritScore({ wall: 20, magic_shield: 20, temple: 10 })).toBe(0);
  });

  it('eşik tablosu sıralı ve en yüksek eşleşme kazanır', () => {
    expect(meritTierFor(4_999)).toBeNull();
    expect(meritTierFor(5_000)).toBe(1);
    expect(meritTierFor(24_999)).toBe(1);
    expect(meritTierFor(25_000)).toBe(2);
    expect(meritTierFor(100_000)).toBe(3);
    expect(meritTierFor(10_000_000)).toBe(4);
    // Eşikler artan sırada olmalı, yoksa "en yüksek eşleşme" kuralı anlamını yitirir.
    for (let i = 1; i < MERIT_TIERS.length; i++) {
      expect(MERIT_TIERS[i]!.threshold).toBeGreaterThan(MERIT_TIERS[i - 1]!.threshold);
    }
  });
});

/* ═══ Verme / yükseltme / yenileme ═══════════════════════════════════════════ */

describe('ünvan verme kuralları', () => {
  it('eşiğin ALTINDAKİ savaş ünvan vermez — sıradan baskında Subay bile alınmaz', async () => {
    const at = await clock.gameNow(worldId);
    expect(await apply(attacker, { dwarf: 1000 }, at)).toBeNull();   // 650 puan
    expect((await meritOf(attacker)).tier).toBeNull();
  });

  it('Subay verilir ve süresi 7 gün (oyun saatiyle)', async () => {
    const at = await clock.gameNow(worldId);
    await apply(attacker, { dragon: 100 }, at);                      // 6.500 puan
    const m = await meritOf(attacker);
    expect(m.tier).toBe(1);
    expect(m.score).toBe(6_500);
    expect(m.expiresAt!.getTime() - at.getTime()).toBe(7 * GUN_MS);
  });

  it('⭐ terfi süreyi SIFIRDAN başlatır (kullanıcının Subay → Başkomutan örneği)', async () => {
    const at = await clock.gameNow(worldId);
    await apply(attacker, { dragon: 100 }, at);                      // Subay, 7 gün
    // 5 gün sonra Başkomutan eşiğini geçen bir savaş: 2 gün kalmışken terfi.
    const sonra = new Date(at.getTime() + 5 * GUN_MS);
    await apply(attacker, { dragon: 2000 }, sonra);                  // 130.000 puan → tier 3
    const m = await meritOf(attacker);
    expect(m.tier).toBe(3);
    expect(m.expiresAt!.getTime() - sonra.getTime()).toBe(21 * GUN_MS);
  });

  it('aynı basamak yalnız SÜREYİ yeniler', async () => {
    const at = await clock.gameNow(worldId);
    await apply(attacker, { dragon: 100 }, at);
    const sonra = new Date(at.getTime() + 3 * GUN_MS);
    await apply(attacker, { dragon: 110 }, sonra);                   // yine tier 1
    const m = await meritOf(attacker);
    expect(m.tier).toBe(1);
    expect(m.expiresAt!.getTime() - sonra.getTime()).toBe(7 * GUN_MS);
  });

  it('küçük savaş yürürlükteki YÜKSEK ünvanı DÜŞÜRMEZ', async () => {
    const at = await clock.gameNow(worldId);
    await apply(attacker, { dragon: 2000 }, at);                     // Başkomutan
    const once = await meritOf(attacker);
    const sonra = new Date(at.getTime() + GUN_MS);
    expect(await apply(attacker, { dragon: 100 }, sonra)).toBeNull();
    const m = await meritOf(attacker);
    expect(m.tier).toBe(3);
    expect(m.expiresAt!.getTime()).toBe(once.expiresAt!.getTime());  // süre de uzamadı
  });

  it('⭐ SÜRESİ GEÇMİŞ ünvan yok sayılır — sönmüş Mareşal yeniden Subay olabilir', async () => {
    const at = await clock.gameNow(worldId);
    await apply(attacker, { chaos: 200 }, at);                       // 800.000 puan → Mareşal
    expect((await meritOf(attacker)).tier).toBe(4);
    // 31 gün sonra (rozet söndü) küçük bir zafer:
    const sonra = new Date(at.getTime() + 31 * GUN_MS);
    await apply(attacker, { dragon: 100 }, sonra);
    expect((await meritOf(attacker)).tier).toBe(1);
  });
});

/* ═══ Gerçek savaş ══════════════════════════════════════════════════════════ */

describe('gerçek savaşta ünvan', () => {
  async function buyukSavas(): Promise<void> {
    await h.db.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${attackCity}, 'dragon', 900)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 900
    `);
    await h.db.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${defendCity}, 'dragon', 800)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 800
    `);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dragon: 900 }, at,
    });
    await h.db.execute(sql`
      UPDATE missions SET execute_at = ${await dueAt(clock, worldId)}::timestamptz WHERE id = ${m.missionId}
    `);
    const r = await new SchedulerService(h.db, clock, registry, { worldId, retryBackoffMs: 0 }).tick();
    expect(r.dead).toBe(0);
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT status FROM missions WHERE id = ${m.missionId}
    `);
    expect(row?.['status'], 'saldırı görevi işlenmedi').not.toBe('scheduled');
  }

  it('⭐ İKİ TARAF da alır — kaybeden de (kullanıcı şartı)', async () => {
    await buyukSavas();

    const a = await meritOf(attacker);
    const d = await meritOf(defender);
    expect(a.tier, 'saldıran ünvan almalı').not.toBeNull();
    expect(d.tier, 'savunan da ünvan almalı — savaşı kaybetse bile').not.toBeNull();
    // Kanıt bağlantısı: ünvanı hangi savaşın kazandırdığı kayıtlı.
    expect(a.battleId).not.toBeNull();
    expect(d.battleId).toBe(a.battleId);

    const [audit] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM audit_log
       WHERE world_id = ${worldId} AND action = 'merit.granted'
    `);
    expect(Number(audit!['n'])).toBe(2);
  });

  it('⭐ AYNI İTTİFAKTAKİLER arasındaki savaş SAYILMAZ (çiftlik koruması)', async () => {
    const [al] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO alliances (world_id, name, leader_id)
      VALUES (${worldId}, ${`ittifak-${worldId}`}, ${attacker}) RETURNING id
    `);
    await h.db.execute(sql`
      UPDATE players SET alliance_id = ${Number(al!['id'])}, alliance_role = 1
       WHERE id IN (${attacker}, ${defender})
    `);

    await buyukSavas();

    expect((await meritOf(attacker)).tier).toBeNull();
    expect((await meritOf(defender)).tier).toBeNull();
  });
});
