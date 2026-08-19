/**
 * ⭐ MAĞARA (§13.20) — formüller, doldurma/boşaltma ve savaşta yıkılma.
 *
 * ⚠️ **MODEL 2026-07-28'de DEĞİŞTİ** (kullanıcı kararı): emir artık asker TAŞIMAZ, yalnız bir
 * sayaç kurar. Askerler süre boyunca yerinde durur (şehirde ya da mağarada) ve şehirdekiler
 * savaşa **katılır**; taşıma süre dolunca ANLIK olur. İptal serbest ve yan etkisizdir.
 *
 * Kilitlenen davranışlar, hepsi bozulduğunda **sessiz** kalanlar:
 *   • Mağaradaki ordu savaşa katılmaz ve casus göremez → tabloları ayrı tutmanın tek sebebi bu.
 *   • Doldurma emri BEKLERKEN askerler hâlâ şehirdedir ve savaşa girerler.
 *   • Varışta `min(emredilen, mevcut)` alınır → ölmüş asker mağarada YENİDEN DOĞMAZ.
 *   • Savaşta emrin tamamı ölürse emir iptal edilir ve ayrı bir mesaj gider.
 *   • Yıkılan mağaranın ordusu şehre **sıfırdan boşaltma süresi** kadar sonra döner.
 *   • Onarımdaki mağara yeniden yıkılmaz ve süresi baştan başlamaz.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CAVE_CONSTANTS, UNITS_BY_ID, caveCapacity, caveRepairSeconds, caveTransferSeconds,
  dwarvesToBreakCave, unitsArea,
} from '@mobilwar/catalog';
import { CAVE_HANDLERS } from '../src/cave/cave.handlers.ts';
import { buildBattleReport } from '../src/battles/battle-report.ts';
import { CaveError, CaveService } from '../src/cave/cave.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { toDate } from '../src/db/client.ts';
import { battleHandlers } from '../src/missions/battle.handlers.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { MissionService } from '../src/missions/mission.service.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import { QueueError, QueueService } from '../src/queues/queue.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb, dueAt } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;
let cities: CityService;
let cave: CaveService;
let queues: QueueService;
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
  queues = new QueueService(h.db, cities);
  missions = new MissionService(h.db, cities);
  registry = new HandlerRegistry();
  for (const [type, handler] of Object.entries(CAVE_HANDLERS)) registry.register(type, handler);
  for (const [type, handler] of Object.entries(battleHandlers(cities))) registry.register(type, handler);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  await h.db.execute(sql`DELETE FROM battles WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM messages WHERE world_id = ${worldId}`);

  attacker = await createPlayer(h, worldId, 'catk');
  defender = await createPlayer(h, worldId, 'cdef');
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
  return Object.fromEntries(rows.map((r) => [String(r['type']), Number(r['count'])]));
}
async function caveUnitsOf(cityId: number): Promise<Record<string, number>> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT type, count FROM cave_units WHERE city_id = ${cityId} AND count > 0
  `);
  return Object.fromEntries(rows.map((r) => [String(r['type']), Number(r['count'])]));
}
/**
 * Görevi **vadesi gelmiş sayarak** işler. Oyun saatini ileri sarmak yerine görevin vadesini
 * geçmişe çekiyoruz; handler `ctx.at`'i yine `execute_at`ten okuduğu için sonuç aynı (§1).
 */
async function runDue(missionId: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE missions SET execute_at = ${await dueAt(clock, worldId)}::timestamptz WHERE id = ${missionId}
  `);
  const r = await scheduler().tick();
  expect(r.dead).toBe(0);
  const [row] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT status FROM missions WHERE id = ${missionId}
  `);
  expect(row?.['status'], `görev ${missionId} işlenmedi (tick boşa döndü)`).not.toBe('scheduled');
}
async function openMissions(type: string, cityId = defendCity): Promise<Record<string, unknown>[]> {
  return h.db.execute<Record<string, unknown>>(sql`
    SELECT id, type, execute_at, payload, origin_city_id, target_city_id FROM missions
     WHERE target_city_id = ${cityId} AND type = ${type} AND status = 'scheduled'
     ORDER BY id
  `);
}

/* ═══ Formüller ═════════════════════════════════════════════════════════════ */

describe('mağara formülleri', () => {
  it('kapasite 50 × 2^(sv−1) — ölçülmüş tablo', () => {
    expect(caveCapacity(0)).toBe(0);
    expect(caveCapacity(1)).toBe(50);
    expect(caveCapacity(10)).toBe(25_600);
    expect(caveCapacity(20)).toBe(26_214_400);
  });

  it('cüce eşiği: tablo satırları birebir (Demircilik TOPLAMSAL paydadır)', () => {
    // `cuce-magara.png` Demircilik 0 satırı.
    expect(dwarvesToBreakCave(1, 0)).toBe(100);
    expect(dwarvesToBreakCave(2, 0)).toBe(150);
    expect(dwarvesToBreakCave(3, 0)).toBe(225);
    expect(dwarvesToBreakCave(24, 0)).toBe(1_122_274);
    // Demircilik 1 / 2 / 4 satırlarından örnekler.
    expect(dwarvesToBreakCave(5, 1)).toBe(482);
    expect(dwarvesToBreakCave(3, 2)).toBe(205);
    expect(dwarvesToBreakCave(24, 4)).toBe(935_228);
    // ⚠️ Üssel model olsaydı 0,95^30 = 0,215 verirdi; gerçek tablo 1/2,5 = 0,4 diyor.
    expect(dwarvesToBreakCave(1, 30)).toBe(40);
    // Yapılmamış mağara yıkılamaz.
    expect(dwarvesToBreakCave(0, 0)).toBe(Infinity);
  });

  it('taşıma süresi ALANA göre ve BÜYÜK parti avantajlı (karekök)', () => {
    const küçük = caveTransferSeconds(9, 1);      // tek Cüce
    const büyük = caveTransferSeconds(900, 1);    // 100 Cüce
    expect(büyük).toBeGreaterThan(küçük);
    // ⭐ Asıl şart: alan başına süre BÜYÜK partide daha ucuz.
    expect(büyük / 900).toBeLessThan(küçük / 9);
    // Her mağara seviyesi %10 kısaltır.
    expect(caveTransferSeconds(900, 2)).toBeCloseTo(caveTransferSeconds(900, 1) / 1.1, 0);
    expect(caveTransferSeconds(0, 5)).toBe(0);
    // Tek birim bile anlık olmaz.
    expect(caveTransferSeconds(1, 20)).toBeGreaterThanOrEqual(CAVE_CONSTANTS.minTransferSeconds);
  });

  it('onarım 20 saat, her seviye %10 kısa', () => {
    expect(caveRepairSeconds(1)).toBe(20 * 3600);
    expect(caveRepairSeconds(2)).toBe(Math.round(20 * 3600 * 0.9));
    expect(caveRepairSeconds(20)).toBeLessThan(caveRepairSeconds(1) / 7);
  });

  it('alan hesabı katalogdan gelir', () => {
    expect(unitsArea({ dwarf: 10 })).toBe(UNITS_BY_ID['dwarf']!.area * 10);
    expect(unitsArea({ dwarf: 2, dragon: 1 }))
      .toBe(UNITS_BY_ID['dwarf']!.area * 2 + UNITS_BY_ID['dragon']!.area);
  });
});

/* ═══ Doldurma / boşaltma ═══════════════════════════════════════════════════ */

describe('mağara doldurma ve boşaltma', () => {
  it('⭐ askerler süre boyunca ŞEHİRDE kalır, ancak süre dolunca mağaraya girer', async () => {
    await setBuilding(defendCity, 'cave', 5);          // kapasite 800 alan
    await giveUnits(defendCity, 'dwarf', 50);
    const at = await clock.gameNow(worldId);

    const job = await cave.store({
      cityId: defendCity, playerId: defender, units: { dwarf: 20 }, at,
    });

    // ⭐ Baraka DEĞİŞMEDİ: emir yalnız bir sayaç kurdu.
    expect((await unitsOf(defendCity))['dwarf']).toBe(50);
    expect(await caveUnitsOf(defendCity)).toEqual({});
    expect(job.area).toBe(UNITS_BY_ID['dwarf']!.area * 20);
    expect(job.seconds).toBe(caveTransferSeconds(job.area, 5));

    await runDue(job.missionId);
    expect(await caveUnitsOf(defendCity)).toEqual({ dwarf: 20 });
    expect((await unitsOf(defendCity))['dwarf']).toBe(30);
  });

  it('⭐ İPTAL anlık ve yan etkisiz: doldurmada asker şehirde, boşaltmada mağarada kalır', async () => {
    await setBuilding(defendCity, 'cave', 5);
    await giveUnits(defendCity, 'dwarf', 50);
    const at = await clock.gameNow(worldId);

    await cave.store({ cityId: defendCity, playerId: defender, units: { dwarf: 20 }, at });
    await cave.cancel({ cityId: defendCity, playerId: defender });
    expect((await unitsOf(defendCity))['dwarf']).toBe(50);
    expect(await caveUnitsOf(defendCity)).toEqual({});
    expect((await cave.state(defendCity, at)).job).toBeNull();

    // Mağarayı doldur, sonra boşaltmayı iptal et.
    await runDue((await cave.store({
      cityId: defendCity, playerId: defender, units: { dwarf: 20 }, at,
    })).missionId);
    await cave.withdraw({ cityId: defendCity, playerId: defender, units: { dwarf: 20 }, at });
    await cave.cancel({ cityId: defendCity, playerId: defender });
    expect(await caveUnitsOf(defendCity)).toEqual({ dwarf: 20 });
    expect((await unitsOf(defendCity))['dwarf']).toBe(30);

    // İş yokken iptal reddedilir.
    await expect(cave.cancel({ cityId: defendCity, playerId: defender }))
      .rejects.toMatchObject({ code: 'no_job' });
  });

  it('⭐ CASUS KUŞ mağaraya konulabilir (kullanıcı kuralı)', async () => {
    await setBuilding(defendCity, 'cave', 5);
    await giveUnits(defendCity, 'spy_bird', 40);
    const at = await clock.gameNow(worldId);
    const job = await cave.store({
      cityId: defendCity, playerId: defender, units: { spy_bird: 40 }, at,
    });
    expect(job.area).toBe(UNITS_BY_ID['spy_bird']!.area * 40);
    await runDue(job.missionId);
    expect(await caveUnitsOf(defendCity)).toEqual({ spy_bird: 40 });
  });

  it('boşaltmada birlikler süre boyunca MAĞARADA kalır, sonunda şehre iner', async () => {
    await setBuilding(defendCity, 'cave', 5);
    await giveUnits(defendCity, 'dwarf', 40);
    const at = await clock.gameNow(worldId);
    await runDue((await cave.store({
      cityId: defendCity, playerId: defender, units: { dwarf: 40 }, at,
    })).missionId);

    const back = await cave.withdraw({
      cityId: defendCity, playerId: defender, units: { dwarf: 25 }, at,
    });
    // ⭐ Hâlâ mağaradalar → hâlâ korunuyorlar.
    expect(await caveUnitsOf(defendCity)).toEqual({ dwarf: 40 });
    expect((await unitsOf(defendCity))['dwarf']).toBe(0);

    await runDue(back.missionId);
    expect((await unitsOf(defendCity))['dwarf']).toBe(25);
    expect(await caveUnitsOf(defendCity)).toEqual({ dwarf: 15 });
  });

  it('kapasite aşılamaz; alan türden bağımsız toplanır', async () => {
    await setBuilding(defendCity, 'cave', 1);          // 50 alan
    await giveUnits(defendCity, 'dwarf', 100);
    const at = await clock.gameNow(worldId);

    // 6 Cüce = 54 alan > 50 → red.
    await expect(cave.store({ cityId: defendCity, playerId: defender, units: { dwarf: 6 }, at }))
      .rejects.toMatchObject({ code: 'capacity_exceeded' });

    // 5 Cüce = 45 alan → kabul; asker YERİNDE kalır (emir yalnız sayaç kurar).
    await cave.store({ cityId: defendCity, playerId: defender, units: { dwarf: 5 }, at });
    expect((await unitsOf(defendCity))['dwarf']).toBe(100);
  });

  it('mağara yokken, meşgulken ve onarımdayken emir alınmaz', async () => {
    const at = await clock.gameNow(worldId);
    await giveUnits(defendCity, 'dwarf', 100);

    await expect(cave.store({ cityId: defendCity, playerId: defender, units: { dwarf: 1 }, at }))
      .rejects.toMatchObject({ code: 'no_cave' });

    await setBuilding(defendCity, 'cave', 5);
    await cave.store({ cityId: defendCity, playerId: defender, units: { dwarf: 10 }, at });
    await expect(cave.store({ cityId: defendCity, playerId: defender, units: { dwarf: 1 }, at }))
      .rejects.toMatchObject({ code: 'cave_busy' });

    await h.db.execute(sql`
      UPDATE cities SET cave_repair_until = ${new Date(at.getTime() + 3_600_000).toISOString()}::timestamptz
       WHERE id = ${defendCity}
    `);
    await h.db.execute(sql`
      UPDATE missions SET status = 'done' WHERE target_city_id = ${defendCity} AND type = 'cave_store'
    `);
    await expect(cave.store({ cityId: defendCity, playerId: defender, units: { dwarf: 1 }, at }))
      .rejects.toMatchObject({ code: 'cave_repairing' });
  });

  it('başkasının mağarası kullanılamaz; olmayan asker gönderilemez', async () => {
    await setBuilding(defendCity, 'cave', 5);
    const at = await clock.gameNow(worldId);
    await expect(cave.store({ cityId: defendCity, playerId: attacker, units: { dwarf: 1 }, at }))
      .rejects.toMatchObject({ code: 'not_owner' });

    await giveUnits(defendCity, 'dwarf', 3);
    await expect(cave.store({ cityId: defendCity, playerId: defender, units: { dwarf: 10 }, at }))
      .rejects.toMatchObject({ code: 'not_enough_units' });
    expect((await unitsOf(defendCity))['dwarf']).toBe(3);
  });

  it('⭐ mağara meşgulken/onarımdayken SEVİYE İLERLETİLEMEZ', async () => {
    await setBuilding(defendCity, 'cave', 2);
    await setBuilding(defendCity, 'architect_school', 5);
    await setBuilding(defendCity, 'castle', 20);
    await h.db.execute(sql`
      UPDATE cities SET gold = 100000000::numeric, food = 100000000::numeric WHERE id = ${defendCity}
    `);
    await giveUnits(defendCity, 'dwarf', 10);
    const at = await clock.gameNow(worldId);

    await cave.store({ cityId: defendCity, playerId: defender, units: { dwarf: 5 }, at });
    await expect(queues.enqueueBuilding({ cityId: defendCity, playerId: defender, type: 'cave', at }))
      .rejects.toBeInstanceOf(QueueError);
  });
});

/* ═══ Savaşta yıkılma ═══════════════════════════════════════════════════════ */

describe('mağaranın savaşta yıkılması', () => {
  /** Saldırıyı kurar ve çözer; `defendCity`'ye `dwarf` kadar cüce gönderir. */
  async function attackWith(dwarves: number): Promise<void> {
    await giveUnits(attackCity, 'dwarf', dwarves);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: dwarves }, at,
    });
    await runDue(m.missionId);
  }
  async function caveRepairUntil(): Promise<Date | null> {
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT cave_repair_until FROM cities WHERE id = ${defendCity}
    `);
    return rows[0]?.['cave_repair_until'] == null ? null : toDate(rows[0]!['cave_repair_until']);
  }

  it('⭐ mağaradaki ordu SAVAŞA KATILMAZ ve saldırıdan sağ çıkar', async () => {
    await setBuilding(defendCity, 'cave', 10);        // kapasite 25.600 → 200 Cüce sığar
    await giveUnits(defendCity, 'dwarf', 200);
    const at = await clock.gameNow(worldId);
    await runDue((await cave.store({
      cityId: defendCity, playerId: defender, units: { dwarf: 200 }, at,
    })).missionId);
    // Taşıma bitti → şehir boş, ordu mağarada.
    expect(await unitsOf(defendCity)).toEqual({ dwarf: 0 });

    // Eşiğin ALTINDA saldırı (sv10 için 3.844 cüce gerekir) → mağara sağlam kalır.
    await attackWith(50);

    expect(await caveUnitsOf(defendCity)).toEqual({ dwarf: 200 });
    expect(await caveRepairUntil()).toBeNull();
  });

  it('⭐ yeterli cüce mağarayı yıkar; ordu şehre BOŞALTMA SÜRESİ kadar sonra döner', async () => {
    await setBuilding(defendCity, 'cave', 1);         // eşik 100 cüce (Demircilik 0)
    await giveUnits(defendCity, 'dwarf', 5);
    const at = await clock.gameNow(worldId);
    await runDue((await cave.store({
      cityId: defendCity, playerId: defender, units: { dwarf: 5 }, at,
    })).missionId);

    await attackWith(400);

    // Mağara boşaldı ve onarıma girdi.
    expect(await caveUnitsOf(defendCity)).toEqual({});
    const until = await caveRepairUntil();
    expect(until).not.toBeNull();

    // Kaçış görevi: KENDİ şehrine gelen destek (kaynak = hedef), TEK satır.
    const escapes = await openMissions('cave_return');
    expect(escapes).toHaveLength(1);
    expect(Number(escapes[0]!['origin_city_id'])).toBe(defendCity);
    expect(Number(escapes[0]!['target_city_id'])).toBe(defendCity);
    const area = UNITS_BY_ID['dwarf']!.area * 5;
    expect(Number((escapes[0]!['payload'] as Record<string, unknown>)['seconds']))
      .toBe(caveTransferSeconds(area, 1));

    // Ordu henüz şehirde DEĞİL — süre dolunca barakaya eklenir.
    expect((await unitsOf(defendCity))['dwarf'] ?? 0).toBe(0);
    await runDue(Number(escapes[0]!['id']));
    expect((await unitsOf(defendCity))['dwarf']).toBe(5);
  });

  /**
   * ⭐ Kaçış dönüşü SEFER sayılır (kullanıcı 2026-07-30): `speed_multiplier` süreyi böler.
   * Normal doldur/boşalt şehir içi iştir — çarpandan ETKİLENMEZ; ikisi aynı testte kilitli.
   */
  it('kaçış dönüşü sefer çarpanına bölünür, doldurma bölünmez', async () => {
    await h.db.execute(sql`UPDATE worlds SET speed_multiplier = 4 WHERE id = ${worldId}`);
    await setBuilding(defendCity, 'cave', 1);
    await giveUnits(defendCity, 'dwarf', 5);
    const at = await clock.gameNow(worldId);
    const area = UNITS_BY_ID['dwarf']!.area * 5;

    const store = await cave.store({
      cityId: defendCity, playerId: defender, units: { dwarf: 5 }, at,
    });
    const storeRow = await h.db.execute<Record<string, unknown>>(sql`
      SELECT execute_at FROM missions WHERE id = ${store.missionId}
    `);
    const storeSeconds = Math.round((toDate(storeRow[0]!['execute_at']).getTime() - at.getTime()) / 1000);
    expect(storeSeconds).toBe(caveTransferSeconds(area, 1));
    await runDue(store.missionId);

    await attackWith(400);

    const escapes = await openMissions('cave_return');
    expect(escapes).toHaveLength(1);
    expect(Number((escapes[0]!['payload'] as Record<string, unknown>)['seconds']))
      .toBe(Math.max(1, Math.ceil(caveTransferSeconds(area, 1) / 4)));
  });

  it('BOŞ mağara da yıkılır; seviye 0 mağara yıkılmaz', async () => {
    await setBuilding(defendCity, 'cave', 1);
    await attackWith(400);
    expect(await caveRepairUntil()).not.toBeNull();
    // Kaçacak kimse yoktu → kaçış görevi de yazılmadı.
    expect(await openMissions('cave_return')).toHaveLength(0);

    // Mağarası olmayan ikinci bir şehir: yıkılacak bir şey yok.
    const at = await clock.gameNow(worldId);
    const bare = await cities.create({
      worldId, playerId: defender, name: 'magarasiz', k: 1, d: 1, s: 3, isCapital: false, at,
    });
    await giveUnits(attackCity, 'dwarf', 400);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 3 }, units: { dwarf: 400 }, at,
    });
    await runDue(m.missionId);
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT cave_repair_until FROM cities WHERE id = ${bare}
    `);
    expect(rows[0]!['cave_repair_until']).toBeNull();
  });

  it('⭐ ONARIMDAKİ mağara yeniden yıkılmaz ve süresi baştan başlamaz', async () => {
    await setBuilding(defendCity, 'cave', 1);
    await attackWith(400);
    const first = await caveRepairUntil();
    expect(first).not.toBeNull();

    // İkinci saldırı (24 saatte 3 hakkı var).
    await attackWith(400);
    expect((await caveRepairUntil())!.getTime()).toBe(first!.getTime());
  });

  it('⭐ DOLDURULURKEN yıkılırsa emir iptal edilir; askerler zaten ŞEHİRDEDİR', async () => {
    await setBuilding(defendCity, 'cave', 8);         // eşik 1.709 cüce
    await giveUnits(defendCity, 'dwarf', 500);
    const at = await clock.gameNow(worldId);
    const job = await cave.store({
      cityId: defendCity, playerId: defender, units: { dwarf: 500 }, at,
    });

    await attackWith(3000);

    const canceled = await h.db.execute<Record<string, unknown>>(sql`
      SELECT status FROM missions WHERE id = ${job.missionId}
    `);
    expect(String(canceled[0]!['status'])).toBe('canceled');
    // ⭐ Kaçış görevi YOK: mağara boştu, bekleyen askerler zaten şehirdeydi ve savaştılar.
    expect(await openMissions('cave_return')).toHaveLength(0);
  });

  it('⭐ BOŞALTILIRKEN yıkılırsa askerler SIFIRDAN boşaltma süresiyle şehre gelir', async () => {
    await setBuilding(defendCity, 'cave', 8);
    await giveUnits(defendCity, 'dwarf', 500);
    const at = await clock.gameNow(worldId);
    await runDue((await cave.store({
      cityId: defendCity, playerId: defender, units: { dwarf: 500 }, at,
    })).missionId);

    const back = await cave.withdraw({
      cityId: defendCity, playerId: defender, units: { dwarf: 500 }, at,
    });
    await attackWith(3000);

    const escapes = await openMissions('cave_return');
    expect(escapes).toHaveLength(1);
    /**
     * ⭐ Kalan süre hesabı YOK (kullanıcı kararı): askerler hâlâ mağaranın içindeydiler, bu
     * yüzden kaçış BAŞTAN başlar ve süresi tüm mağara içeriğinin boşaltma süresine eşittir.
     */
    const seconds = Number((escapes[0]!['payload'] as Record<string, unknown>)['seconds']);
    expect(seconds).toBe(back.seconds);

    await runDue(Number(escapes[0]!['id']));
    expect((await unitsOf(defendCity))['dwarf']).toBe(500);
  });

  it('⭐ SAVAŞ bekleyen doldurma emrini hayatta kalanlara göre KÜÇÜLTÜR', async () => {
    await setBuilding(defendCity, 'cave', 10);       // eşik 3.844 → mağara yıkılmasın
    await giveUnits(defendCity, 'dwarf', 500);
    const at = await clock.gameNow(worldId);
    const job = await cave.store({
      cityId: defendCity, playerId: defender, units: { dwarf: 500 }, at,
    });

    // Savunanı ezmeyecek ama kayıp verdirecek bir saldırı.
    await attackWith(200);
    const survivors = (await unitsOf(defendCity))['dwarf'] ?? 0;
    expect(survivors).toBeGreaterThan(0);
    expect(survivors).toBeLessThan(500);

    // Emir hayatta kalan sayıya indi ve süresi DEĞİŞMEDİ.
    const st = await cave.state(defendCity, at);
    expect(st.job?.units).toEqual({ dwarf: survivors });

    await runDue(job.missionId);
    // ⭐ Ordu ÇOĞALMADI: mağaraya yalnız hayatta kalanlar girdi, baraka boşaldı.
    expect(await caveUnitsOf(defendCity)).toEqual({ dwarf: survivors });
    expect((await unitsOf(defendCity))['dwarf'] ?? 0).toBe(0);
  });

  it('⭐ emrin TAMAMI ölürse emir iptal edilir ve AYRI bir mesaj gider', async () => {
    await setBuilding(defendCity, 'cave', 10);
    await giveUnits(defendCity, 'dwarf', 20);
    const at = await clock.gameNow(worldId);
    const job = await cave.store({
      cityId: defendCity, playerId: defender, units: { dwarf: 20 }, at,
    });

    await attackWith(3000);                          // ezici: 20 Cüce silinir

    const row = await h.db.execute<Record<string, unknown>>(sql`
      SELECT status FROM missions WHERE id = ${job.missionId}
    `);
    expect(String(row[0]!['status'])).toBe('canceled');

    const msgs = await h.db.execute<Record<string, unknown>>(sql`
      SELECT subject, body FROM messages
       WHERE world_id = ${worldId} AND player_id = ${defender} AND kind = 'system'
    `);
    expect(msgs).toHaveLength(1);
    expect(String(msgs[0]!['subject'])).toMatch(/Mağaraya giriş iptal/);
    expect((msgs[0]!['body'] as Record<string, unknown>)['reason']).toBe('all_units_lost');
  });

  it('saldıranın Demirciliği eşiği düşürür', async () => {
    await setBuilding(defendCity, 'cave', 3);         // Demircilik 0 → 225 cüce
    await h.db.execute(sql`
      INSERT INTO techs (player_id, type, level) VALUES (${attacker}, 'blacksmithing', 4)
      ON CONFLICT (player_id, type) DO UPDATE SET level = 4
    `);
    expect(dwarvesToBreakCave(3, 4)).toBe(188);

    // 200 cüce Demircilik 0'da yetmezdi (225), Demircilik 4'te yeter (188).
    await attackWith(200);
    expect(await caveRepairUntil()).not.toBeNull();
  });

  it('savaş raporu iki tarafa da mağara sonucunu yazar', async () => {
    await setBuilding(defendCity, 'cave', 1);
    await attackWith(400);

    const msgs = await h.db.execute<Record<string, unknown>>(sql`
      SELECT player_id, side, body FROM messages WHERE world_id = ${worldId} AND kind = 'battle_report'
    `);
    const atkBody = msgs.find((m) => String(m['side']) === 'attacker')!['body'] as Record<string, unknown>;
    const defBody = msgs.find((m) => String(m['side']) === 'defender')!['body'] as Record<string, unknown>;

    expect((atkBody['cave'] as Record<string, unknown>)['broken']).toBe(true);
    // ⚠️ Saldırana mağaranın İÇİ gösterilmez (casusluğun bile göremediği bilgi).
    expect(Object.keys(atkBody['cave'] as Record<string, unknown>)).not.toContain('escaped');
    expect((defBody['cave'] as Record<string, unknown>)['broken']).toBe(true);
    expect(defBody['cave']).toHaveProperty('escaped');
  });

  it('⭐ RAPOR MODALI iki tarafa da mağara notunu yazar (ama farklı cümleyle)', async () => {
    await setBuilding(defendCity, 'cave', 1);
    await attackWith(400);

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id, at, night, winner, input, result, attacker_player_id, defender_player_id
        FROM battles WHERE world_id = ${worldId}
    `);
    const row = rows[0]!;
    const battle = {
      id: Number(row['id']),
      at: toDate(row['at']),
      night: Boolean(row['night']),
      winner: String(row['winner']),
      input: row['input'],
      result: row['result'],
    } as never;

    const def = buildBattleReport(battle, 'defender');
    const atk = buildBattleReport(battle, 'attacker');
    /**
     * ⚠️ **2026-08-17: durum sözcüğü nottan çıktı.** «Yıkıldı» bilgisi artık yalnız
     * `cave.broken` alanında (ekranda kutu, düz metinde «Mağara: YIKILDI») — not onu ikinci
     * kez söylemiyor. Not yalnız kutunun SÖYLEMEDİĞİNİ taşıyor: savunana sonuç, saldırana sayı.
     */
    expect(def.cave?.broken).toBe(true);
    expect(atk.cave?.broken).toBe(true);
    expect(def.notes.join(' ')).not.toMatch(/YIKILDI/);
    expect(atk.notes.join(' ')).not.toMatch(/YIKILDI/);
    expect(def.notes.some((n) => n.includes('şehre kaçıyor'))).toBe(true);
    expect(atk.notes.some((n) => n.includes('cüce yeterli oldu'))).toBe(true);
    expect(def.text).toMatch(/Mağara: YIKILDI/);
    // Saldıranın notunda mağaranın içi geçmez.
    expect(atk.notes.join(' ')).not.toMatch(/kaç(ıyor|tı)/);
    /* ⭐ SIZINTI KİLİDİ: bu çağrı controller MASKESİZ, doğrudan `battles.result` ile yapılıyor —
     * `defenderPrivate` içeride dursa bile kurucu saldırana `escaped`/`repairUntil` VERMEZ.
     * (Controller ayrıca anahtarı komple siler; bu iki katmanın İLKİ burada kilitli.) */
    expect(atk.cave?.escaped).toBeNull();
    expect(atk.cave?.repairUntil).toBeNull();
    expect(def.cave?.escaped).not.toBeNull();
    expect(JSON.stringify(atk)).not.toContain('escaped":{');
  });

  it('mağara dayanırsa rapor GEREKEN cüce sayısını yazar', async () => {
    await setBuilding(defendCity, 'cave', 5);        // eşik 506 cüce
    await attackWith(50);

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id, at, night, winner, input, result FROM battles WHERE world_id = ${worldId}
    `);
    const battle = {
      id: Number(rows[0]!['id']), at: toDate(rows[0]!['at']), night: Boolean(rows[0]!['night']),
      winner: String(rows[0]!['winner']), input: rows[0]!['input'], result: rows[0]!['result'],
    } as never;
    const atk = buildBattleReport(battle, 'attacker');
    /**
     * ⚠️ Sayı SALDIRANA artık kutudan gidiyor (`cave.required`), notla değil — ekran onu
     * «(gereken 506 cüce · sağ kalan N)» diye basıyor ve not aynı sayıyı tekrar ediyordu.
     * Düz metin yüzeyinde kutu olmadığı için satır orada yazılıyor.
     */
    expect(atk.cave).toMatchObject({ broken: false, required: 506 });
    expect(atk.notes.join(' ')).not.toMatch(/506/);
    expect(atk.text).toMatch(/Mağara: dayandı \(gereken 506 cüce/);

    /* Savunana kutu sayı basmıyor → cümle ona kalıyor. */
    const def2 = buildBattleReport(battle, 'defender');
    expect(def2.notes.some((n) => n.includes('506') && n.includes('gerekiyordu'))).toBe(true);
  });
});
