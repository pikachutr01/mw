/**
 * ⭐⭐ KAHRAMAN MAĞARADA (§13.20.6, 2026-08-11) — orijinalde de vardı.
 *
 * `docs/JAVA_ROENTGEN.md` §6.2: istemcinin mağara ekranı birim listesinin ardına **kahraman
 * satırlarını** ekliyor ve "tümünü seç" işlevi (`i.java:844-852`) kahramanları **durum koduyla**
 * eliyor — doldururken yalnız `u == 2` («Şehirde»), boşaltırken yalnız `u == 3` («Mağarada»).
 * Durum tablosunda üç mağara durumu var (`k.a[234..236]`).
 *
 * ⚠️ Ayrı dosya çünkü `cave.test.ts` zaten 630 satır ve bu küme kendi kurulumunu (kahraman
 * satırları) taşıyor.
 *
 * Kilitlenen davranışlar — **hepsi bozulduğunda sessiz kalır**:
 *   • Ölü / seferdeki kahraman mağaraya konabilir hâle gelirse (Java'nın kuralı kırılır).
 *   • Mağaradaki kahraman savunmaya katılır ya da casusa görünür hâle gelirse (mağaranın
 *     bütün varlık sebebi bu).
 *   • Mağara emrindeki asker/kahraman ikinci bir göreve de söz verilebilirse (kullanıcı
 *     kuralı 2026-08-11).
 *   • Savaşta bir KISMI ölünce emir komple iptal olursa — kullanıcı kuralı: **iptal olmaz**,
 *     kalanla tamamlanır.
 *   • Mağarada yalnız kahraman varken yıkılırsa kaçış görevi hiç yazılmazsa (alan 0 tuzağı).
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HERO_AREA, UNITS_BY_ID, caveArea, unitsArea } from '@mobilwar/catalog';
import { CAVE_HANDLERS } from '../src/cave/cave.handlers.ts';
import { CaveService } from '../src/cave/cave.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { battleHandlers } from '../src/missions/battle.handlers.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { MissionService } from '../src/missions/mission.service.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb, dueAt } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;
let cities: CityService;
let cave: CaveService;
let missions: MissionService;
let registry: HandlerRegistry;

let attacker: number;
let defender: number;
let attackCity: number;
let defendCity: number;

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  cave = new CaveService(h.db);
  missions = new MissionService(h.db, cities);
  registry = new HandlerRegistry();
  for (const [type, handler] of Object.entries(CAVE_HANDLERS)) registry.register(type, handler);
  for (const [type, handler] of Object.entries(battleHandlers(cities))) registry.register(type, handler);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  attacker = await createPlayer(h, worldId, 'hatk');
  defender = await createPlayer(h, worldId, 'hdef');
  const at = await clock.gameNow(worldId);
  attackCity = await cities.create({
    worldId, playerId: attacker, name: 'saldiran', k: 1, d: 1, s: 1, isCapital: true, at,
  });
  defendCity = await cities.create({
    worldId, playerId: defender, name: 'savunan', k: 1, d: 1, s: 2, isCapital: true, at,
  });
  await h.db.execute(sql`UPDATE players SET protected_until = NULL WHERE world_id = ${worldId}`);
  await setBuilding(attackCity, 'barracks', 5);
});

const scheduler = (): SchedulerService =>
  new SchedulerService(h.db, clock, registry, { worldId, retryBackoffMs: 0 });

async function setBuilding(cityId: number, type: string, level: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO buildings (city_id, type, level) VALUES (${cityId}, ${type}, ${level})
    ON CONFLICT (city_id, type) DO UPDATE SET level = ${level}
  `);
}
async function giveUnits(cityId: number, type: string, count: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO units (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
    ON CONFLICT (city_id, type) DO UPDATE SET count = ${count}
  `);
}
async function unitsOf(cityId: number): Promise<Record<string, number>> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT type, count FROM units WHERE city_id = ${cityId}
  `);
  return Object.fromEntries(rows.map((r: Record<string, unknown>) =>
    [String(r['type']), Number(r['count'])]));
}
async function caveUnitsOf(cityId: number): Promise<Record<string, number>> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT type, count FROM cave_units WHERE city_id = ${cityId} AND count > 0
  `);
  return Object.fromEntries(rows.map((r: Record<string, unknown>) =>
    [String(r['type']), Number(r['count'])]));
}
/** Görevi **vadesi gelmiş sayarak** işler (bkz. `cave.test.ts` aynı yardımcı). */
async function runDue(missionId: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE missions SET execute_at = ${await dueAt(clock, worldId)}::timestamptz WHERE id = ${missionId}
  `);
  const r = await scheduler().tick();
  expect(r.dead).toBe(0);
  const [row] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT status FROM missions WHERE id = ${missionId}
  `);
  expect(row?.['status'], `görev ${missionId} işlenmedi`).not.toBe('scheduled');
}
async function openMissions(type: string, cityId = defendCity): Promise<Record<string, unknown>[]> {
  return h.db.execute<Record<string, unknown>>(sql`
    SELECT id, type, payload FROM missions
     WHERE target_city_id = ${cityId} AND type = ${type} AND status = 'scheduled'
     ORDER BY id
  `);
}
async function giveHero(cityId: number, name: string, level = 3): Promise<number> {
  const [row] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO heroes (world_id, player_id, city_id, name, level, xp, status)
    VALUES (${worldId}, ${defender}, ${cityId}, ${name}, ${level}, 0, 'alive')
    RETURNING id
  `);
  return Number(row!['id']);
}
async function heroStatus(id: number): Promise<string> {
  const [row] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT status FROM heroes WHERE id = ${id}
  `);
  return String(row!['status']);
}
/** `defendCity`'ye saldırır ve savaşı çözer. */
async function attackDefender(dwarves: number): Promise<void> {
  await giveUnits(attackCity, 'dwarf', dwarves);
  const m = await missions.sendAttack({
    originCityId: attackCity, playerId: attacker, worldId,
    target: { k: 1, d: 1, s: 2 }, units: { dwarf: dwarves }, at: await clock.gameNow(worldId),
  });
  await runDue(m.missionId);
}

/* ═══ Alan ══════════════════════════════════════════════════════════════════ */

describe('kahraman alanı', () => {
  it('⭐ ÖLÇÜLMÜŞ: kahraman 5 alan kaplar', () => {
    // `docs/referans/teknik_ve_yapi_dokumantasyonu.md:209` → «Hız: 200 · Kapasite: 0 · Alan: 5».
    expect(HERO_AREA).toBe(5);
    expect(caveArea({ dwarf: 2 }, 3)).toBe(UNITS_BY_ID['dwarf']!.area * 2 + 15);
  });

  it('kahramansız çağrı `unitsArea` ile BİREBİR aynı kalır', () => {
    // Eski çağrı yerleri (rapor, admin) `unitsArea` kullanmaya devam ediyor; ikisi kaymamalı.
    expect(caveArea({ dwarf: 2, elf: 5 })).toBe(unitsArea({ dwarf: 2, elf: 5 }));
    expect(caveArea({}, 0)).toBe(0);
  });
});

/* ═══ Giriş / çıkış ═════════════════════════════════════════════════════════ */

describe('kahramanın mağaraya girip çıkması', () => {
  it('⭐ kahraman mağaraya girer, ekranda görünür, alanı düşülür', async () => {
    await setBuilding(defendCity, 'cave', 1);        // kapasite 50
    const hero = await giveHero(defendCity, 'Bora');
    const at = await clock.gameNow(worldId);

    const job = await cave.store({
      cityId: defendCity, playerId: defender, units: {}, heroIds: [hero], at,
    });
    expect(job.area).toBe(HERO_AREA);
    // ⭐ Emir sürerken kahraman HÂLÂ ŞEHİRDE — savunmaya katılabilsin diye.
    expect(await heroStatus(hero)).toBe('alive');

    await runDue(job.missionId);
    expect(await heroStatus(hero)).toBe('in_cave');

    const st = await cave.state(defendCity, await clock.gameNow(worldId));
    expect(st.heroes.map((x) => x.name)).toEqual(['Bora']);
    expect(st.usedArea).toBe(HERO_AREA);
    expect(st.freeArea).toBe(50 - HERO_AREA);
  });

  it('⭐ ölü ve seferdeki kahraman mağaraya KONULAMAZ (Java: yalnız «Şehirde»)', async () => {
    await setBuilding(defendCity, 'cave', 3);
    const dead = await giveHero(defendCity, 'Olu');
    const away = await giveHero(defendCity, 'Uzak');
    await h.db.execute(sql`UPDATE heroes SET status = 'dead' WHERE id = ${dead}`);
    // ⚠️ Seferdeki kahramanın `city_id`si NULL olur: «canlı ama şehirde değil».
    await h.db.execute(sql`UPDATE heroes SET city_id = NULL WHERE id = ${away}`);
    const at = await clock.gameNow(worldId);

    await expect(cave.store({ cityId: defendCity, playerId: defender, units: {}, heroIds: [dead], at }))
      .rejects.toMatchObject({ code: 'hero_unavailable' });
    await expect(cave.store({ cityId: defendCity, playerId: defender, units: {}, heroIds: [away], at }))
      .rejects.toMatchObject({ code: 'hero_unavailable' });

    // ⚠️ Biri bile uygun değilse emrin TAMAMI reddedilir — yarım kabul yok.
    const ok = await giveHero(defendCity, 'Saglam');
    await expect(cave.store({
      cityId: defendCity, playerId: defender, units: {}, heroIds: [ok, dead], at,
    })).rejects.toMatchObject({ code: 'hero_unavailable' });
    expect(await openMissions('cave_store')).toHaveLength(0);
  });

  it('⭐ mağaradan çıkan kahraman yeniden şehirde ve canlı olur', async () => {
    await setBuilding(defendCity, 'cave', 3);
    const hero = await giveHero(defendCity, 'Donen');
    await runDue((await cave.store({
      cityId: defendCity, playerId: defender, units: {}, heroIds: [hero],
      at: await clock.gameNow(worldId),
    })).missionId);
    expect(await heroStatus(hero)).toBe('in_cave');

    const out = await cave.withdraw({
      cityId: defendCity, playerId: defender, units: {}, heroIds: [hero],
      at: await clock.gameNow(worldId),
    });
    // ⭐ Boşaltma sürerken kahraman HÂLÂ mağarada — yani hâlâ korunuyor.
    expect(await heroStatus(hero)).toBe('in_cave');
    await runDue(out.missionId);
    expect(await heroStatus(hero)).toBe('alive');
    expect((await cave.state(defendCity, await clock.gameNow(worldId))).heroes).toHaveLength(0);
  });

  it('mağarada olmayan kahraman ÇIKARILAMAZ', async () => {
    await setBuilding(defendCity, 'cave', 3);
    const hero = await giveHero(defendCity, 'Disarda');
    await expect(cave.withdraw({
      cityId: defendCity, playerId: defender, units: {}, heroIds: [hero],
      at: await clock.gameNow(worldId),
    })).rejects.toMatchObject({ code: 'hero_unavailable' });
  });
});

/* ═══ Savaş ═════════════════════════════════════════════════════════════════ */

describe('kahraman mağaradayken savaş', () => {
  it('⭐⭐ mağaradaki kahraman SAVUNMAYA KATILMAZ ve casusa görünmez', async () => {
    await setBuilding(defendCity, 'cave', 3);
    const hero = await giveHero(defendCity, 'Gizli', 8);
    await runDue((await cave.store({
      cityId: defendCity, playerId: defender, units: {}, heroIds: [hero],
      at: await clock.gameNow(worldId),
    })).missionId);

    await giveUnits(defendCity, 'dwarf', 10);
    await attackDefender(60);

    /**
     * ⚠️ Savaş girdisi hem savunma ordusunu hem casus istihbaratını besleyen sorgudan geliyor
     * (`status = 'alive'`). Kahraman `in_cave` olduğu için HİÇ görünmüyor — mağaranın orduyu
     * gizlemesiyle aynı sonuç, ayrıca kod yazmaya gerek kalmadı.
     */
    const [b] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT input FROM battles WHERE world_id = ${worldId} ORDER BY id DESC LIMIT 1
    `);
    const input = b!['input'] as { defender: { heroes: unknown[]; heroCount: number } };
    expect(input.defender.heroes).toHaveLength(0);
    expect(input.defender.heroCount).toBe(0);
    // Savaşa girmediği için ölmedi de.
    expect(await heroStatus(hero)).toBe('in_cave');
  });

  it('⭐⭐ mağarada YALNIZ kahraman varken yıkılırsa kaçış görevi yazılır', async () => {
    await setBuilding(defendCity, 'cave', 1);        // eşik 100 cüce (Demircilik 0)
    const hero = await giveHero(defendCity, 'Kacan');
    await runDue((await cave.store({
      cityId: defendCity, playerId: defender, units: {}, heroIds: [hero],
      at: await clock.gameNow(worldId),
    })).missionId);

    await attackDefender(400);

    /**
     * ⚠️ Asıl tuzak: kahraman alan hesabına katılmasaydı toplam alan 0 çıkardı,
     * `scheduleCaveEscape` erken dönerdi ve kahraman YIKIK mağarada asılı kalırdı.
     */
    const escapes = await openMissions('cave_return');
    expect(escapes).toHaveLength(1);
    expect((escapes[0]!['payload'] as Record<string, unknown>)['heroIds']).toEqual([hero]);
    // Kaçış boyunca hâlâ `in_cave`: doküman *"ordu savaşa yine katılmaz ve şehre kaçar"* diyor.
    expect(await heroStatus(hero)).toBe('in_cave');

    await runDue(Number(escapes[0]!['id']));
    expect(await heroStatus(hero)).toBe('alive');
  });

  it('⭐⭐ savaşta askerlerin bir kısmı ölse de emir İPTAL OLMAZ, kalanla tamamlanır', async () => {
    // ⚠️ Sayılar `cave.test.ts`'in "emri KÜÇÜLTÜR" testinden: savunanı ezmeyen ama kayıp
    //    verdiren tek kombinasyon. Mağara sv10 → eşik 3.844, yani yıkılmaz.
    await setBuilding(defendCity, 'cave', 10);
    await giveUnits(defendCity, 'dwarf', 500);
    const hero = await giveHero(defendCity, 'Sagkalan');
    const job = await cave.store({
      cityId: defendCity, playerId: defender, units: { dwarf: 500 }, heroIds: [hero],
      at: await clock.gameNow(worldId),
    });

    await attackDefender(200);

    const survivors = (await unitsOf(defendCity))['dwarf'] ?? 0;
    expect(survivors).toBeGreaterThan(0);
    expect(survivors).toBeLessThan(500);

    // ⭐ Kullanıcı kuralı (2026-08-11): emir hâlâ ayakta, yalnız küçüldü.
    const [still] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT status FROM missions WHERE id = ${job.missionId}
    `);
    expect(still!['status']).toBe('scheduled');

    await runDue(job.missionId);
    expect(await caveUnitsOf(defendCity)).toEqual({ dwarf: survivors });
    // *"Kahraman da savaş sonunda ölmezse mağaraya girer."*
    expect(await heroStatus(hero)).toBe('in_cave');
  });

  it('⭐ savaşta ÖLEN kahraman mağarada DİRİLMEZ', async () => {
    await setBuilding(defendCity, 'cave', 3);
    const hero = await giveHero(defendCity, 'Olecek');
    const job = await cave.store({
      cityId: defendCity, playerId: defender, units: {}, heroIds: [hero],
      at: await clock.gameNow(worldId),
    });
    // Savaşı beklemeden ölü işaretle: sınanan şey handler'ın kendi clamp'i.
    await h.db.execute(sql`UPDATE heroes SET status = 'dead' WHERE id = ${hero}`);

    await runDue(job.missionId);
    expect(await heroStatus(hero)).toBe('dead');
    expect((await cave.state(defendCity, await clock.gameNow(worldId))).heroes).toHaveLength(0);
  });
});

/* ═══ ⭐⭐ Rezervasyon ═══════════════════════════════════════════════════════ */

describe('mağara emri rezervasyonu', () => {
  it('⭐⭐ mağaraya işaretli asker sefere gönderilemez (50 var, 30 ayrıldı → 40 RED)', async () => {
    await setBuilding(defendCity, 'cave', 5);
    await giveUnits(defendCity, 'dwarf', 50);
    const at = await clock.gameNow(worldId);
    await cave.store({ cityId: defendCity, playerId: defender, units: { dwarf: 30 }, at });

    // Kullanıcının kendi örneği.
    await expect(missions.sendAttack({
      originCityId: defendCity, playerId: defender, worldId,
      target: { k: 1, d: 1, s: 1 }, units: { dwarf: 40 }, at,
    })).rejects.toMatchObject({ code: 'insufficient_units' });

    // …ama serbest olanın tamamı (20) geçer.
    const ok = await missions.sendAttack({
      originCityId: defendCity, playerId: defender, worldId,
      target: { k: 1, d: 1, s: 1 }, units: { dwarf: 20 }, at,
    });
    expect(ok.missionId).toBeGreaterThan(0);
    // ⭐ Mağara emri bozulmadı: 30 cüce hâlâ şehirde ve hâlâ işaretli.
    expect((await unitsOf(defendCity))['dwarf']).toBe(30);
  });

  it('⭐⭐ mağaraya işaretli kahraman sefere gönderilemez; iptalden sonra serbest kalır', async () => {
    await setBuilding(defendCity, 'cave', 3);
    await giveUnits(defendCity, 'dwarf', 5);
    const hero = await giveHero(defendCity, 'Sozlu');
    const at = await clock.gameNow(worldId);
    await cave.store({ cityId: defendCity, playerId: defender, units: {}, heroIds: [hero], at });

    await expect(missions.sendAttack({
      originCityId: defendCity, playerId: defender, worldId,
      target: { k: 1, d: 1, s: 1 }, units: { dwarf: 5 }, heroIds: [hero], at,
    })).rejects.toMatchObject({ code: 'hero_unavailable' });

    await cave.cancel({ cityId: defendCity, playerId: defender });
    const ok = await missions.sendAttack({
      originCityId: defendCity, playerId: defender, worldId,
      target: { k: 1, d: 1, s: 1 }, units: { dwarf: 5 }, heroIds: [hero], at,
    });
    expect(ok.missionId).toBeGreaterThan(0);
  });

  it('rezervasyon yokken hata mesajı ESKİSİ gibi kalır', async () => {
    await giveUnits(defendCity, 'dwarf', 3);
    await expect(missions.sendAttack({
      originCityId: defendCity, playerId: defender, worldId,
      target: { k: 1, d: 1, s: 1 }, units: { dwarf: 10 }, at: await clock.gameNow(worldId),
    })).rejects.toMatchObject({ code: 'insufficient_units', details: { caveReserved: 0 } });
  });
});
