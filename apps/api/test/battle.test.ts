/**
 * ⭐ FAZ 2 ÇIKIŞ KRİTERİ — saldırı görevi, savaş çözümü, ganimet ve dönüş bacağı.
 *
 * Gerçek Postgres kullanılıyor: advisory lock, koşullu UPDATE ile birlik rezervasyonu ve
 * transaction geri alma taklit edilemez — Faz 1'in tüm garantileri bunlara dayanıyor.
 *
 * Ölçülen davranışlar:
 *   • birlikler yola çıkarken şehirden DÜŞER (dodge hamlesi buna dayanır)
 *   • savaş `execute_at` anında çözülür, `now()` anında değil
 *   • ganimet savunandan SAVAŞ ANINDA düşer, saldırana DÖNÜŞ ANINDA eklenir
 *   • hayatta kalan yoksa dönüş görevi oluşturulmaz (§13.11.7)
 *   • savunma tabanı (§13.11.10) gerçek savaşta da işler
 *   • 24s/3 saldırı limiti · acemi koruması · tatil modu · Baraka sefer limiti
 *   • dünya yalıtımı: başka dünyanın şehrine saldırılamaz
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UNITS_BY_ID } from '@mobiwar/catalog';
import { distance, travelSeconds } from '@mobiwar/engine';
import { buildBattleReport, type BattleRow } from '../src/battles/battle-report.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { toDate } from '../src/db/client.ts';
import { battleHandlers, isNightBattle } from '../src/missions/battle.handlers.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { MissionError, MissionService } from '../src/missions/mission.service.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

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
  await h.db.execute(sql`DELETE FROM battles WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM messages WHERE world_id = ${worldId}`);

  attacker = await createPlayer(h, worldId, 'atk');
  defender = await createPlayer(h, worldId, 'def');
  const at = await clock.gameNow(worldId);

  attackCity = await cities.create({
    worldId, playerId: attacker, name: 'saldiran', k: 1, d: 1, s: 1, isCapital: true, at,
  });
  defendCity = await cities.create({
    worldId, playerId: defender, name: 'savunan', k: 1, d: 1, s: 2, isCapital: true, at,
  });
  // Acemi koruması testlerin çoğunda yolda olmasın; kendi testinde açıkça kuruluyor.
  await h.db.execute(sql`UPDATE players SET protected_until = NULL WHERE world_id = ${worldId}`);
  // Baraka 5 → sefer limiti testleri hariç yolda olmasın.
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
async function giveDefenses(cityId: number, type: string, count: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO defenses (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
    ON CONFLICT (city_id, type) DO UPDATE SET count = ${count}
  `);
}
async function setResources(cityId: number, gold: number, food: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE cities SET gold = ${gold}::numeric, food = ${food}::numeric WHERE id = ${cityId}
  `);
}
async function unitsOf(cityId: number): Promise<Record<string, number>> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT type, count FROM units WHERE city_id = ${cityId}
  `);
  return Object.fromEntries(rows.map((r) => [String(r['type']), Number(r['count'])]));
}
async function defensesOf(cityId: number): Promise<Record<string, number>> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT type, count FROM defenses WHERE city_id = ${cityId}
  `);
  return Object.fromEntries(rows.map((r) => [String(r['type']), Number(r['count'])]));
}
async function resourcesOf(cityId: number): Promise<{ gold: number; food: number }> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT gold, food FROM cities WHERE id = ${cityId}
  `);
  return { gold: Number(rows[0]!['gold']), food: Number(rows[0]!['food']) };
}
async function messagesOf(playerId: number): Promise<Record<string, unknown>[]> {
  return h.db.execute<Record<string, unknown>>(sql`
    SELECT kind, side, subject, body, battle_id FROM messages
     WHERE player_id = ${playerId} ORDER BY id
  `);
}
/** Görevi vadesine getirip tek tur koşturur (oyun saatini beklemeden). */
async function runDue(missionId: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE missions SET execute_at = now() - interval '1 second' WHERE id = ${missionId}
  `);
  const r = await scheduler().tick();
  expect(r.dead).toBe(0);
}
async function openMissions(type: string): Promise<Record<string, unknown>[]> {
  return h.db.execute<Record<string, unknown>>(sql`
    SELECT id, type, status, origin_city_id, target_city_id, execute_at, payload
      FROM missions WHERE world_id = ${worldId} AND type = ${type} ORDER BY id
  `);
}

/* ═══════════════════════════════════════════════════════════════════════════ */

describe('saldırı görevi gönderme', () => {
  it('birlikler ŞEHİRDEN DÜŞER ve görev doğru varış saatiyle yazılır', async () => {
    await giveUnits(attackCity, 'dwarf', 100);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 60 }, at,
    });

    // ⭐ Ordu yoldayken şehirde DEĞİLDİR.
    expect((await unitsOf(attackCity))['dwarf']).toBe(40);

    const D = distance({ k: 1, d: 1, s: 1 }, { k: 1, d: 1, s: 2 });
    expect(m.distance).toBe(D);
    expect(m.speed).toBe(UNITS_BY_ID['dwarf']!.speed);
    expect(m.travelSeconds).toBe(travelSeconds({ distance: D, speed: 100 }));
    expect(m.executeAt.getTime()).toBe(at.getTime() + m.travelSeconds * 1000);

    const rows = await openMissions('attack');
    expect(rows).toHaveLength(1);
    expect(String(rows[0]!['status'])).toBe('scheduled');
  });

  it('Haritacılık seferi kısaltır ama TABANI etkilemez', async () => {
    await giveUnits(attackCity, 'dwarf', 200);
    await h.db.execute(sql`
      INSERT INTO techs (player_id, type, level) VALUES (${attacker}, 'cartography', 15)
    `);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
    });
    // Komşu şehirde kazanç yalnız ~%21 (taban süre korunuyor, §13.5.3).
    expect(m.travelSeconds).toBe(travelSeconds({ distance: 1, speed: 100, cartography: 15 }));
    expect(m.travelSeconds / travelSeconds({ distance: 1, speed: 100 })).toBeCloseTo(0.79, 2);
  });

  it('ordunun hızını EN YAVAŞ birim belirler', async () => {
    await giveUnits(attackCity, 'cavalry', 10);
    await giveUnits(attackCity, 'dwarf', 10);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { cavalry: 5, dwarf: 5 }, at,
    });
    expect(m.speed).toBe(100);   // Cüce 100 < Süvari 140
  });

  it('şehirde olmayan birlik gönderilemez ve HİÇBİR ŞEY yazılmaz', async () => {
    await giveUnits(attackCity, 'dwarf', 5);
    const at = await clock.gameNow(worldId);

    await expect(missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 50 }, at,
    })).rejects.toThrow(/yeterli/);

    expect((await unitsOf(attackCity))['dwarf']).toBe(5);
    expect(await openMissions('attack')).toHaveLength(0);
  });

  it('çok tipli orduda BİR tip yetmezse tamamı geri alınır (transaction)', async () => {
    await giveUnits(attackCity, 'dwarf', 100);
    await giveUnits(attackCity, 'elf', 2);
    const at = await clock.gameNow(worldId);

    await expect(missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 50, elf: 50 }, at,
    })).rejects.toThrow(/yeterli/);

    // Cüce düşürülmüş olsa bile transaction geri alındı.
    expect(await unitsOf(attackCity)).toEqual({ dwarf: 100, elf: 2 });
  });

  it('kendi şehrine saldırılamaz', async () => {
    const at = await clock.gameNow(worldId);
    const kendi = await cities.create({
      worldId, playerId: attacker, name: 'koloni', k: 1, d: 1, s: 3, isCapital: false, at,
    });
    expect(kendi).toBeGreaterThan(0);
    await giveUnits(attackCity, 'dwarf', 10);
    await expect(missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 3 }, units: { dwarf: 5 }, at,
    })).rejects.toThrow(/Kendi şehrinize/);
  });

  it('boş koordinata saldırılamaz', async () => {
    await giveUnits(attackCity, 'dwarf', 10);
    const at = await clock.gameNow(worldId);
    await expect(missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 9, d: 9, s: 9 }, units: { dwarf: 5 }, at,
    })).rejects.toThrow(/şehir yok/);
  });

  it('savunma birimi ve casus kuş saldırı ordusuna katılamaz', async () => {
    await giveUnits(attackCity, 'dwarf', 10);
    await giveUnits(attackCity, 'spy_bird', 10);
    const at = await clock.gameNow(worldId);
    const base = {
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, at,
    };
    await expect(missions.sendAttack({ ...base, units: { ballista: 5 } })).rejects.toThrow(/sefere çıkamaz/);
    await expect(missions.sendAttack({ ...base, units: { spy_bird: 5 } })).rejects.toThrow(/katılamaz/);
    await expect(missions.sendAttack({ ...base, units: {} })).rejects.toThrow(/en az bir savaşçı/);
  });

  it('başkasının şehrinden ordu gönderilemez', async () => {
    await giveUnits(defendCity, 'dwarf', 10);
    const at = await clock.gameNow(worldId);
    await expect(missions.sendAttack({
      originCityId: defendCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 5 }, at,
    })).rejects.toThrow(/sizin değil/);
  });
});

describe('⭐ koruma kuralları (§13.5.4)', () => {
  it('acemi korumasındaki oyuncuya saldırılamaz', async () => {
    await giveUnits(attackCity, 'dwarf', 10);
    const at = await clock.gameNow(worldId);
    await h.db.execute(sql`
      UPDATE players SET protected_until = ${at.toISOString()}::timestamptz + interval '10 hours'
       WHERE id = ${defender}
    `);
    const err = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 5 }, at,
    }).catch((e: unknown) => e as MissionError);
    expect((err as MissionError).code).toBe('target_protected');
  });

  it('koruma süresi DOLMUŞSA saldırı serbest', async () => {
    await giveUnits(attackCity, 'dwarf', 10);
    const at = await clock.gameNow(worldId);
    await h.db.execute(sql`
      UPDATE players SET protected_until = ${at.toISOString()}::timestamptz - interval '1 minute'
       WHERE id = ${defender}
    `);
    await expect(missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 5 }, at,
    })).resolves.toBeTruthy();
  });

  it('⭐ saldıran KENDİ korumasını ANINDA kaybeder', async () => {
    await giveUnits(attackCity, 'dwarf', 10);
    const at = await clock.gameNow(worldId);
    await h.db.execute(sql`
      UPDATE players SET protected_until = ${at.toISOString()}::timestamptz + interval '72 hours'
       WHERE id = ${attacker}
    `);

    await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 5 }, at,
    });

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT protected_until FROM players WHERE id = ${attacker}
    `);
    expect(rows[0]!['protected_until']).toBeNull();
  });

  it('tatil modundaki oyuncuya saldırılamaz', async () => {
    await giveUnits(attackCity, 'dwarf', 10);
    const at = await clock.gameNow(worldId);
    await h.db.execute(sql`
      UPDATE players SET vacation_until = ${at.toISOString()}::timestamptz + interval '48 hours'
       WHERE id = ${defender}
    `);
    const err = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 5 }, at,
    }).catch((e: unknown) => e as MissionError);
    expect((err as MissionError).code).toBe('target_vacation');
  });
});

describe('⭐ 24 saatte 3 saldırı limiti (saldıran-hedef çifti başına)', () => {
  it('4. saldırı reddedilir, 3.\'ye kadar serbest', async () => {
    await giveUnits(attackCity, 'dwarf', 1000);
    const at = await clock.gameNow(worldId);
    const send = (): Promise<unknown> => missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
    });

    await send(); await send(); await send();
    const err = await send().catch((e: unknown) => e as MissionError);
    expect((err as MissionError).code).toBe('attack_limit');
  });

  it('YOLDAKİ saldırılar da sayılır (limit "henüz varmadı" ile delinemez)', async () => {
    await giveUnits(attackCity, 'dwarf', 1000);
    const at = await clock.gameNow(worldId);
    for (let i = 0; i < 3; i++) {
      await missions.sendAttack({
        originCityId: attackCity, playerId: attacker, worldId,
        target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
      });
    }
    // Hiçbiri henüz varmadı (hepsi scheduled) — yine de limit dolu.
    const rows = await openMissions('attack');
    expect(rows.every((r) => String(r['status']) === 'scheduled')).toBe(true);
    await expect(missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
    })).rejects.toThrow(/en fazla 3 saldırı/);
  });

  it('limit ÇİFT BAŞINA: aynı saldıran başka şehre saldırabilir', async () => {
    await giveUnits(attackCity, 'dwarf', 1000);
    const at = await clock.gameNow(worldId);
    const ucuncu = await createPlayer(h, worldId, 'uc');
    await cities.create({
      worldId, playerId: ucuncu, name: 'ucuncu', k: 1, d: 1, s: 4, isCapital: true, at,
    });
    await h.db.execute(sql`UPDATE players SET protected_until = NULL WHERE id = ${ucuncu}`);

    for (let i = 0; i < 3; i++) {
      await missions.sendAttack({
        originCityId: attackCity, playerId: attacker, worldId,
        target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
      });
    }
    await expect(missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 4 }, units: { dwarf: 10 }, at,
    })).resolves.toBeTruthy();
  });

  it('24 saat geçince pencere temizlenir', async () => {
    await giveUnits(attackCity, 'dwarf', 1000);
    const at = await clock.gameNow(worldId);
    for (let i = 0; i < 3; i++) {
      await missions.sendAttack({
        originCityId: attackCity, playerId: attacker, worldId,
        target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
      });
    }
    // Eski saldırıları pencerenin dışına it.
    await h.db.execute(sql`
      UPDATE missions SET execute_at = execute_at - interval '25 hours'
       WHERE world_id = ${worldId} AND type = 'attack'
    `);
    await expect(missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
    })).resolves.toBeTruthy();
  });
});

describe('Baraka sefer limiti', () => {
  /**
   * ⚠️ GERÇEK KUSUR (2026-07-27): sayım `origin_city_id`'ye bakıyordu. Dönüş bacağında bu alan
   * **karşı tarafın şehri** olduğu için saldıranın dönen ordusu SAVUNANIN limitini işgal ediyor,
   * saldırıya uğrayan oyuncu kendi ordusunu gönderemiyordu.
   */
  it('⭐ saldıranın DÖNEN ordusu savunanın sefer limitini İŞGAL ETMEZ', async () => {
    await setBuilding(defendCity, 'barracks', 1);
    await giveUnits(attackCity, 'dwarf', 3000);
    await giveUnits(defendCity, 'dwarf', 100);
    const at = await clock.gameNow(worldId);

    // Saldıran vurur, ordusu döner → dönüş görevi savunanın şehrinden ÇIKIYOR gibi görünür.
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 3000 }, at,
    });
    await runDue(m.missionId);
    const returns = await openMissions('return');
    expect(returns).toHaveLength(1);
    expect(Number(returns[0]!['origin_city_id'])).toBe(defendCity);   // kusurun kaynağı

    // Savunan, Baraka 1 ile kendi seferini AÇABİLMELİ (savaşta ölenlerin yerine yeni asker).
    await giveUnits(defendCity, 'dwarf', 50);
    const ucuncu = await createPlayer(h, worldId, 'hedef2');
    await cities.create({
      worldId, playerId: ucuncu, name: 'hedef2', k: 1, d: 1, s: 8, isCapital: true, at,
    });
    await h.db.execute(sql`UPDATE players SET protected_until = NULL WHERE id = ${ucuncu}`);

    await expect(missions.sendAttack({
      originCityId: defendCity, playerId: defender, worldId,
      target: { k: 1, d: 1, s: 8 }, units: { dwarf: 10 }, at,
    })).resolves.toBeTruthy();
  });

  it('açık sefer sayısı Baraka seviyesini aşamaz', async () => {
    await setBuilding(attackCity, 'barracks', 2);
    await giveUnits(attackCity, 'dwarf', 1000);
    const at = await clock.gameNow(worldId);
    const send = (): Promise<unknown> => missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
    });

    await send(); await send();
    const err = await send().catch((e: unknown) => e as MissionError);
    expect((err as MissionError).code).toBe('march_limit');
  });
});

describe('⭐ SAVAŞ ÇÖZÜMÜ', () => {
  it('ezici saldırı: savunan silinir, saldıran döner, rapor iki tarafa da gider', async () => {
    await giveUnits(attackCity, 'dwarf', 5000);
    await giveUnits(defendCity, 'dwarf', 50);
    await setResources(defendCity, 300_000, 300_000);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 5000 }, at,
    });
    await runDue(m.missionId);

    const battles = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id, winner, rng_seed, engine_version, catalog_hash, result FROM battles WHERE world_id = ${worldId}
    `);
    expect(battles).toHaveLength(1);
    expect(String(battles[0]!['winner'])).toBe('attacker');
    // Determinizm künyesi kayıtlı → savaş yeniden oynatılabilir (§5).
    expect(Number(battles[0]!['rng_seed'])).toBeGreaterThan(0);
    expect(String(battles[0]!['engine_version'])).toBe('0.6.0');
    expect(String(battles[0]!['catalog_hash'])).toMatch(/^[0-9a-f]{8}$/);

    // Savunan silindi.
    expect((await unitsOf(defendCity))['dwarf']).toBe(0);

    // Dönüş görevi yazıldı, gidiş süresiyle aynı.
    const returns = await openMissions('return');
    expect(returns).toHaveLength(1);
    expect(Number((returns[0]!['payload'] as Record<string, unknown>)['travelSeconds']))
      .toBe(m.travelSeconds);

    // İki tarafa da rapor.
    const atkMsgs = await messagesOf(attacker);
    const defMsgs = await messagesOf(defender);
    expect(atkMsgs.map((x) => x['side'])).toContain('attacker');
    expect(defMsgs.map((x) => x['side'])).toContain('defender');
    expect(String(atkMsgs[0]!['subject'])).toMatch(/başarılı/);
    expect(String(defMsgs[0]!['subject'])).toMatch(/yağmalandı/);
  });

  it('⭐ ganimet savunandan SAVAŞ ANINDA düşer, saldırana DÖNÜŞ ANINDA eklenir', async () => {
    await giveUnits(attackCity, 'cargo_wagon', 200);   // taşıma kapasitesi 3000/adet
    await giveUnits(attackCity, 'dwarf', 5000);
    await giveUnits(defendCity, 'dwarf', 10);
    await setResources(defendCity, 300_000, 300_000);
    await setResources(attackCity, 0, 0);
    // Üretim ganimet ölçümünü bulandırmasın.
    await h.db.execute(sql`DELETE FROM buildings WHERE city_id = ${defendCity} AND type IN ('farm','mine')`);
    await h.db.execute(sql`DELETE FROM buildings WHERE city_id = ${attackCity} AND type IN ('farm','mine')`);

    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 5000, cargo_wagon: 200 }, at,
    });

    const defBefore = await resourcesOf(defendCity);
    await runDue(m.missionId);

    // Savaş anında savunandan düştü…
    const defAfter = await resourcesOf(defendCity);
    const yagmalanan = (defBefore.gold + defBefore.food) - (defAfter.gold + defAfter.food);
    expect(yagmalanan).toBeGreaterThan(0);

    // …ama saldıranın kasasına HENÜZ girmedi (yoldaki mal kimsenin değil).
    expect(await resourcesOf(attackCity)).toEqual({ gold: 0, food: 0 });

    const ret = (await openMissions('return'))[0]!;
    const loot = (ret['payload'] as Record<string, unknown>)['loot'] as { gold: number; food: number };
    expect(loot.gold + loot.food).toBeGreaterThan(0);

    await runDue(Number(ret['id']));

    const atkAfter = await resourcesOf(attackCity);
    expect(Math.round(atkAfter.gold)).toBe(loot.gold);
    expect(Math.round(atkAfter.food)).toBe(loot.food);
    // Birlikler de geri döndü.
    expect((await unitsOf(attackCity))['dwarf']).toBeGreaterThan(0);
  });

  /**
   * ⚠️ Taban, onarımın (%50-70) **üstüne zemin koyar, yerine geçmez** (§13.11.10 adım 3-4).
   * Bu yüzden kalabalık garnizonda onarım zaten 4'ün çok üstünü döndürür ve taban hiç devreye
   * girmez; taban ancak onarım sonrası adet 4'ün altına inerken görünür. Test bu yüzden
   * KÜÇÜK garnizonla kurulur — kuralın gerçekten çalıştığını ölçen kurulum budur.
   */
  it('⭐ SAVUNMA TABANI gerçek savaşta işler: ezici saldırıda tipler 4\'ün altına inmez (§13.11.10)', async () => {
    const ordu = { dwarf: 20000, cavalry: 4000, dragon: 400, ogre: 300 };
    for (const [type, n] of Object.entries(ordu)) await giveUnits(attackCity, type, n);
    await giveDefenses(defendCity, 'ballista', 6);
    await giveDefenses(defendCity, 'archer_tower', 6);
    await giveDefenses(defendCity, 'guard', 6);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: ordu, at,
    });
    await runDue(m.missionId);

    const d = await defensesOf(defendCity);
    // ⭐ Garanti bu: ordu ne kadar ezici olursa olsun hiçbir tip 4'ün altına inmez.
    //    (Tabanın o seed'de mekanik olarak *gerekip gerekmediği* onarım ruloya bağlıdır;
    //     kuralın kendisi motorun `defense-floor` testlerinde deterministik ölçülüyor.)
    for (const id of ['ballista', 'archer_tower', 'guard']) {
      expect(d[id], `${id} tabanın altına düşmemeli`).toBe(4);
    }

    // Rapor, tabanın döndürdüğü adetleri taşıyan alanı DAİMA içerir (§13.11.10 raporlama kuralı).
    const defMsg = (await messagesOf(defender))[0]!;
    expect(defMsg['body']).toHaveProperty('defenseFloorRestored');
  });

  it('savaş öncesi 4\'ten AZ olan tipte taban savaş öncesi adetle sınırlı (min(4, adet))', async () => {
    const ordu = { dwarf: 20000, cavalry: 4000, dragon: 400, ogre: 300 };
    for (const [type, n] of Object.entries(ordu)) await giveUnits(attackCity, type, n);
    await giveDefenses(defendCity, 'ballista', 3);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: ordu, at,
    });
    await runDue(m.missionId);

    expect((await defensesOf(defendCity))['ballista']).toBe(3);
  });

  it('⭐ savunma birimi hiç ÜRETMEMİŞ şehir korunmaz (0 → 0)', async () => {
    await giveUnits(attackCity, 'dwarf', 5000);
    await giveUnits(defendCity, 'dwarf', 20);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 5000 }, at,
    });
    await runDue(m.missionId);

    // Taban kural birim yaratmaz — savunma tablosu boş kalır.
    expect(await defensesOf(defendCity)).toEqual({});
  });

  it('Sur ve Büyü Kalkanı SEVİYE olarak korunur (adet gibi silinmez)', async () => {
    await giveUnits(attackCity, 'dragon', 400);
    await giveDefenses(defendCity, 'wall', 5);
    await giveDefenses(defendCity, 'magic_shield', 3);
    await giveDefenses(defendCity, 'ballista', 20);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dragon: 400 }, at,
    });
    await runDue(m.missionId);

    const d = await defensesOf(defendCity);
    expect(d['wall']).toBe(5);
    expect(d['magic_shield']).toBe(3);
  });

  it('⭐ TAM KAYIP: saldıran silinirse dönüş görevi OLUŞMAZ (§13.11.7)', async () => {
    await giveUnits(attackCity, 'dwarf', 5);
    await giveDefenses(defendCity, 'ballista', 500);
    await giveUnits(defendCity, 'dragon', 200);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 5 }, at,
    });
    await runDue(m.missionId);

    const battles = await h.db.execute<Record<string, unknown>>(sql`
      SELECT winner, result FROM battles WHERE world_id = ${worldId}
    `);
    expect(String(battles[0]!['winner'])).toBe('defender');
    expect(await openMissions('return')).toHaveLength(0);

    // Saldıranın kasasına hiçbir şey girmedi.
    const atkMsg = (await messagesOf(attacker))[0]!;
    expect((atkMsg['body'] as Record<string, unknown>)['armyReturning']).toBe(false);
  });

  it('saldıran KAYBEDERSE enkazın tamamı savunanın şehrine eklenir', async () => {
    await giveUnits(attackCity, 'dwarf', 50);
    await giveUnits(defendCity, 'dragon', 300);
    await setResources(defendCity, 0, 0);
    await h.db.execute(sql`DELETE FROM buildings WHERE city_id = ${defendCity} AND type IN ('farm','mine')`);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 50 }, at,
    });
    await runDue(m.missionId);

    const after = await resourcesOf(defendCity);
    expect(after.gold + after.food).toBeGreaterThan(0);   // enkaz savunanda kaldı
  });

  it('savaş ANI `execute_at`tir: geç işlenen görev fazladan kaynak yazmaz', async () => {
    await giveUnits(attackCity, 'dwarf', 2000);
    await giveUnits(defendCity, 'dwarf', 10);
    await setResources(defendCity, 200_000, 200_000);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 2000 }, at,
    });
    // Vadeyi 2 saat GERİYE al: görev "geç" işleniyor.
    await h.db.execute(sql`
      UPDATE missions SET execute_at = now() - interval '2 hours' WHERE id = ${m.missionId}
    `);
    await scheduler().tick();

    const battle = (await h.db.execute<Record<string, unknown>>(sql`
      SELECT at, mission_id FROM battles WHERE world_id = ${worldId}
    `))[0]!;
    const missionRow = (await h.db.execute<Record<string, unknown>>(sql`
      SELECT execute_at FROM missions WHERE id = ${m.missionId}
    `))[0]!;
    // Savaş anı = görevin VADESİ, işlendiği an değil.
    expect(toDate(battle['at']).getTime()).toBe(toDate(missionRow['execute_at']).getTime());
  });

  it('aynı görev iki kez çalışsa bile İKİNCİ savaş oluşmaz', async () => {
    await giveUnits(attackCity, 'dwarf', 2000);
    await giveUnits(defendCity, 'dwarf', 10);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 2000 }, at,
    });
    await runDue(m.missionId);

    // Görevi zorla yeniden kuyruğa al.
    await h.db.execute(sql`
      UPDATE missions SET status = 'scheduled', execute_at = now() - interval '1 s', finished_at = NULL
       WHERE id = ${m.missionId}
    `);
    const r = await scheduler().tick();

    // `battles_mission` tekil indeksi ikinci savaşı DB seviyesinde engeller.
    expect(r.done).toBe(0);
    const battles = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM battles WHERE world_id = ${worldId}
    `);
    expect(battles).toHaveLength(1);
  });
});

describe('savaş raporu (§Faz 2 çıkışı — animasyon YOK, metin)', () => {
  it('iki taraf AYNI savaşın farklı yüzünü görür', async () => {
    await giveUnits(attackCity, 'dwarf', 3000);
    await giveUnits(defendCity, 'dwarf', 200);
    await giveDefenses(defendCity, 'archer_tower', 50);
    await setResources(defendCity, 500_000, 500_000);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 3000 }, at,
    });
    await runDue(m.missionId);

    const b = (await h.db.execute<Record<string, unknown>>(sql`
      SELECT id, at, night, winner, input, result FROM battles WHERE world_id = ${worldId}
    `))[0]!;
    const row: BattleRow = {
      id: Number(b['id']), at: toDate(b['at']), night: Boolean(b['night']),
      winner: String(b['winner']),
      input: b['input'] as BattleRow['input'], result: b['result'] as BattleRow['result'],
    };

    const atk = buildBattleReport(row, 'attacker');
    const def = buildBattleReport(row, 'defender');

    expect(atk.won).toBe(true);
    expect(def.won).toBe(false);
    expect(atk.text).toMatch(/KAZANDIN/);
    expect(def.text).toMatch(/KAYBETTİN/);
    // Türkçe birim adları ve sayılar raporda.
    expect(atk.text).toMatch(/Cüce/);
    expect(def.text).toMatch(/Okçu Kulesi/);
    // Saldıran ALDIĞINI, savunan KAYBETTİĞİNİ görür.
    expect(atk.loot).not.toBeNull();
    expect(atk.sections.some((s) => s.key === 'attacker')).toBe(true);
    expect(def.sections.some((s) => s.key === 'defenderStructs')).toBe(true);
  });

  /**
   * Rapor üreticisi SAF bir fonksiyon → canlı savaşın rastgeleliğine bağlamak yanlış ölçüt olur
   * (taban ancak belirli kayıp aralığında devreye girer). Burada doğrudan sentetik motor çıktısı
   * veriliyor; tabanın gerçek savaşta işlediği ayrıca yukarıda DB testiyle ölçülüyor.
   */
  it('savunma tabanı devreye girdiyse raporda AÇIKÇA yazar', () => {
    const row: BattleRow = {
      id: 1,
      at: new Date('2026-07-26T12:00:00Z'),
      night: false,
      winner: 'attacker',
      input: {
        attacker: { counts: { dwarf: 5000 } },
        defender: { counts: { ballista: 20, archer_tower: 10, wall: 3 } },
      },
      result: {
        winner: 'attacker',
        turns: 5,
        attacker: {
          alive: 4200, lost: 800, counts: { dwarf: 4200 },
          floorRestored: {}, heroes: [], wallIntegrity: null,
        },
        defender: {
          alive: 8, lost: 22,
          counts: { ballista: 4, archer_tower: 4, wall: 3 },
          floorRestored: { ballista: 3, archer_tower: 2 },
          heroes: [], wallIntegrity: 0.25,
        },
        debris: { gold: 1000, food: 800 },
        loot: {
          taken: { gold: 500, food: 400 },
          fromDebris: { gold: 500, food: 400 },
          fromPlunder: { gold: 0, food: 0 },
          leftoverDebrisToDefender: { gold: 0, food: 0 },
          effectivePlunderRate: 0,
        },
      },
    };

    const def = buildBattleReport(row, 'defender');
    const notes = def.notes.join(' ');
    expect(notes).toMatch(/Savunma tabanı devreye girdi/);
    expect(notes).toMatch(/Balista 3/);
    expect(notes).toMatch(/Okçu Kulesi 2/);
    // Sur bütünlüğü de raporlanır; Sur SEVİYE olduğu için birim satırı olarak GÖRÜNMEZ.
    expect(notes).toMatch(/Sur bütünlüğü %25/);
    expect(def.text).not.toMatch(/^\s*Sur:/m);

    // Satırlarda "önce → sonra (kayıp)" dökümü var.
    const struct = def.sections.find((s) => s.key === 'defenderStructs')!;
    const ballista = struct.lines.find((l) => l.id === 'ballista')!;
    expect(ballista).toMatchObject({ before: 20, after: 4, lost: 16, restoredByFloor: 3 });
    expect(def.text).toMatch(/Balista: 20 → 4 \(kayıp 16\) \[taban \+3\]/);
  });

  it('gece savaşı raporda belirtilir', () => {
    const row: BattleRow = {
      id: 2, at: new Date('2026-07-26T03:00:00Z'), night: true, winner: 'defender',
      input: { attacker: { counts: { dwarf: 100 } }, defender: { counts: { guard: 50 } } },
      result: {
        winner: 'defender', turns: 3,
        attacker: { alive: 0, lost: 100, counts: {}, floorRestored: {}, heroes: [], wallIntegrity: null },
        defender: { alive: 40, lost: 10, counts: { guard: 40 }, floorRestored: {}, heroes: [], wallIntegrity: null },
        debris: { gold: 0, food: 0 },
      },
    };
    const atk = buildBattleReport(row, 'attacker');
    expect(atk.notes.join(' ')).toMatch(/GECE/);
    expect(atk.notes.join(' ')).toMatch(/Ordudan kimse dönmedi/);
    expect(atk.won).toBe(false);
  });
});

describe('gece savaşı penceresi (dokümandan: 00:00–08:00)', () => {
  it('00:00–08:00 arası gece, dışı gündüz', () => {
    expect(isNightBattle(new Date('2026-07-26T00:00:00Z'))).toBe(true);
    expect(isNightBattle(new Date('2026-07-26T03:30:00Z'))).toBe(true);
    expect(isNightBattle(new Date('2026-07-26T07:59:59Z'))).toBe(true);
    expect(isNightBattle(new Date('2026-07-26T08:00:00Z'))).toBe(false);
    expect(isNightBattle(new Date('2026-07-26T20:00:00Z'))).toBe(false);
  });
});

describe('⭐ DÜNYA YALITIMI (§13.12.1b)', () => {
  it('başka dünyanın koordinatındaki şehre saldırılamaz', async () => {
    const otherWorld = freshWorldId();
    await createWorld(h, otherWorld);
    const yabanci = await createPlayer(h, otherWorld, 'yab');
    const at = await clock.gameNow(worldId);
    await cities.create({
      worldId: otherWorld, playerId: yabanci, name: 'yabanci', k: 5, d: 5, s: 5, isCapital: true, at,
    });
    await giveUnits(attackCity, 'dwarf', 100);

    // Aynı koordinat BU dünyada boş → hedef bulunamaz, öbür dünyaya sızmaz.
    await expect(missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 5, d: 5, s: 5 }, units: { dwarf: 10 }, at,
    })).rejects.toThrow(/şehir yok/);
  });

  it('token\'daki dünya ile şehrin dünyası uyuşmazsa reddedilir', async () => {
    await giveUnits(attackCity, 'dwarf', 100);
    const at = await clock.gameNow(worldId);
    const err = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId: worldId + 500,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
    }).catch((e: unknown) => e as MissionError);
    expect((err as MissionError).code).toBe('world_mismatch');
  });
});

describe('⭐ GÖREV İPTALİ (yoldaki orduyu geri çağırma)', () => {
  /** Saldırı gönderip belirtilen kadar yol almış hâle getirir. */
  async function sendAndTravel(seconds: number): Promise<{ missionId: number; at: Date; travel: number }> {
    await giveUnits(attackCity, 'dwarf', 500);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 100 }, at,
    });
    // "seconds kadar yol aldı" → iptal anını ileri alıyoruz.
    return { missionId: m.missionId, at: new Date(at.getTime() + seconds * 1000), travel: m.travelSeconds };
  }

  it('⭐ dönüş süresi GİDİLEN yol kadardır', async () => {
    const { missionId, at, travel } = await sendAndTravel(300);

    const r = await missions.cancelMission({ missionId, playerId: attacker, worldId, at });

    expect(r.returnSeconds).toBe(300);
    expect(r.executeAt.getTime()).toBe(at.getTime() + 300_000);
    // Yolun tamamı kadar sürmez — yarı yoldan dönmek yarı sürer.
    expect(r.returnSeconds).toBeLessThan(travel);
  });

  it('dönüş süresi toplam yol süresini AŞAMAZ', async () => {
    const { missionId, at, travel } = await sendAndTravel(0);
    const cokSonra = new Date(at.getTime() + (travel + 10_000) * 1000);

    const r = await missions.cancelMission({ missionId, playerId: attacker, worldId, at: cokSonra });

    expect(r.returnSeconds).toBe(travel);
  });

  it('birlikler ve kahraman dönüş görevine TAŞINIR (kopyalanmaz)', async () => {
    const hero = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, level)
      VALUES (${worldId}, ${attacker}, ${attackCity}, ${'K-' + randomUUID().slice(0, 4)}, 3)
      RETURNING id
    `);
    const heroId = Number(hero[0]!['id']);
    await giveUnits(attackCity, 'dwarf', 500);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 100 }, heroIds: [heroId], at,
    });

    const r = await missions.cancelMission({
      missionId: m.missionId, playerId: attacker, worldId,
      at: new Date(at.getTime() + 60_000),
    });

    const units = await h.db.execute<Record<string, unknown>>(sql`
      SELECT mission_id, count FROM mission_units WHERE unit_type = 'dwarf'
        AND mission_id IN (${m.missionId}, ${r.returnMissionId})
    `);
    expect(units).toHaveLength(1);
    expect(Number(units[0]!['mission_id'])).toBe(r.returnMissionId);
    expect(Number(units[0]!['count'])).toBe(100);

    const heroes = await h.db.execute<Record<string, unknown>>(sql`
      SELECT mission_id FROM mission_heroes WHERE hero_id = ${heroId}
    `);
    expect(Number(heroes[0]!['mission_id'])).toBe(r.returnMissionId);
  });

  it('iptal edilen görev ÇALIŞMAZ, dönüş görevi birlikleri geri koyar', async () => {
    const { missionId, at } = await sendAndTravel(120);
    const before = (await unitsOf(attackCity))['dwarf'];
    expect(before).toBe(400);   // 500 − 100 yola çıktı

    const r = await missions.cancelMission({ missionId, playerId: attacker, worldId, at });

    // İptal edilen saldırı vadesi gelse bile savaş ÜRETMEZ.
    await h.db.execute(sql`
      UPDATE missions SET execute_at = now() - interval '1 s' WHERE id = ${missionId}
    `);
    await scheduler().tick();
    const battles = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM battles WHERE world_id = ${worldId}
    `);
    expect(battles).toHaveLength(0);

    // Dönüş varınca birlikler geri gelir.
    await runDue(r.returnMissionId);
    expect((await unitsOf(attackCity))['dwarf']).toBe(500);
  });

  it('⭐ hedefe İPTAL BİLDİRİMİ gider (savunanın ekranından düşsün diye)', async () => {
    const { missionId, at } = await sendAndTravel(60);
    await missions.cancelMission({ missionId, playerId: attacker, worldId, at });

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT payload FROM outbox WHERE world_id = ${worldId} AND topic = 'mission:canceled'
    `);
    expect(rows).toHaveLength(1);
    const p = rows[0]!['payload'] as Record<string, unknown>;
    expect(Number(p['ownerPlayerId'])).toBe(attacker);
    expect(Number(p['targetPlayerId'])).toBe(defender);
  });

  it('dönüş bacağı iptal EDİLEMEZ', async () => {
    const { missionId, at } = await sendAndTravel(60);
    const r = await missions.cancelMission({ missionId, playerId: attacker, worldId, at });

    const err = await missions.cancelMission({
      missionId: r.returnMissionId, playerId: attacker, worldId, at,
    }).catch((e: unknown) => e as MissionError);
    expect((err as MissionError).code).toBe('not_cancelable');
  });

  it('başkasının görevi iptal edilemez', async () => {
    const { missionId, at } = await sendAndTravel(60);
    const err = await missions.cancelMission({
      missionId, playerId: defender, worldId, at,
    }).catch((e: unknown) => e as MissionError);
    expect((err as MissionError).code).toBe('not_owner');
  });

  it('⚠️ worker görevi ALDIYSA iptal edilemez (savaş çözülüyordur)', async () => {
    const { missionId, at } = await sendAndTravel(60);
    await h.db.execute(sql`UPDATE missions SET status = 'running' WHERE id = ${missionId}`);

    const err = await missions.cancelMission({
      missionId, playerId: attacker, worldId, at,
    }).catch((e: unknown) => e as MissionError);
    expect((err as MissionError).code).toBe('not_cancelable');
  });

  it('aynı görev iki kez iptal edilemez', async () => {
    const { missionId, at } = await sendAndTravel(60);
    await missions.cancelMission({ missionId, playerId: attacker, worldId, at });
    await expect(missions.cancelMission({ missionId, playerId: attacker, worldId, at }))
      .rejects.toThrow();
  });

  it('iptal, Baraka sefer limitini SERBEST BIRAKMAZ (ordu hâlâ yolda)', async () => {
    await setBuilding(attackCity, 'barracks', 1);
    const { missionId, at } = await sendAndTravel(60);
    await missions.cancelMission({ missionId, playerId: attacker, worldId, at });

    // Dönüş görevi de açık sefer sayılır → yeni sefer açılamaz.
    await expect(missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
    })).rejects.toThrow(/en fazla 1 sefer/);
  });
});

describe('kahraman', () => {
  it('sefere çıkan kahraman şehirden ayrılır ve dönüşte geri gelir', async () => {
    await giveUnits(attackCity, 'dwarf', 3000);
    await giveUnits(defendCity, 'dwarf', 5);
    const at = await clock.gameNow(worldId);
    const hero = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, level, f_atk, f_def)
      VALUES (${worldId}, ${attacker}, ${attackCity}, ${'Kahraman-' + randomUUID().slice(0, 4)}, 10, 15, 15)
      RETURNING id
    `);
    const heroId = Number(hero[0]!['id']);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 3000 }, heroIds: [heroId], at,
    });

    // Yola çıkarken şehirden ayrıldı.
    let row = (await h.db.execute<Record<string, unknown>>(sql`
      SELECT city_id, dead_until FROM heroes WHERE id = ${heroId}
    `))[0]!;
    expect(row['city_id']).toBeNull();

    await runDue(m.missionId);
    const ret = (await openMissions('return'))[0]!;
    await runDue(Number(ret['id']));

    row = (await h.db.execute<Record<string, unknown>>(sql`
      SELECT city_id, dead_until FROM heroes WHERE id = ${heroId}
    `))[0]!;
    expect(Number(row['city_id'])).toBe(attackCity);
    expect(row['dead_until']).toBeNull();
  });

  it('aynı kahraman iki sefere birden gönderilemez', async () => {
    await giveUnits(attackCity, 'dwarf', 100);
    const at = await clock.gameNow(worldId);
    const hero = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, level)
      VALUES (${worldId}, ${attacker}, ${attackCity}, ${'K-' + randomUUID().slice(0, 4)}, 5)
      RETURNING id
    `);
    const heroId = Number(hero[0]!['id']);

    await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, heroIds: [heroId], at,
    });
    await expect(missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, heroIds: [heroId], at,
    })).rejects.toThrow(/sefere çıkamaz/);
  });

  it('başkasının kahramanı gönderilemez', async () => {
    await giveUnits(attackCity, 'dwarf', 100);
    const at = await clock.gameNow(worldId);
    const hero = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, level)
      VALUES (${worldId}, ${defender}, ${defendCity}, ${'D-' + randomUUID().slice(0, 4)}, 5)
      RETURNING id
    `);
    await expect(missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 },
      heroIds: [Number(hero[0]!['id'])], at,
    })).rejects.toThrow(/sefere çıkamaz/);
  });
});
