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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UNITS_BY_ID, wallRepairSeconds } from '@mobilwar/catalog';
import { distance, ENGINE_VERSION, travelSeconds } from '@mobilwar/engine';
import { buildBattleReport, type BattleRow } from '../src/battles/battle-report.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { toDate } from '../src/db/client.ts';
import { battleHandlers, isNightBattle } from '../src/missions/battle.handlers.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { MissionController, missionErrorToHttp } from '../src/missions/mission.controller.ts';
import { setLiveSettings } from '../src/settings/live.ts';
import { MissionError, MissionService } from '../src/missions/mission.service.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb, dueAt } from './helpers/db.ts';

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
async function scoreBaseOf(playerId: number): Promise<number> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT score_base FROM players WHERE id = ${playerId}
  `);
  return Number(rows[0]!['score_base']);
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
/**
 * Görevi vadesine getirip tek tur koşturur (oyun saatini beklemeden).
 *
 * ⚠️ **İKİ KORUMA, ikisi de acıyla öğrenildi (2026-08-02):**
 *  1. Vade `dueAt()` ile **oyun saatinden** (`clock.gameNow`) yazılıyor, SQL `now()`'dan
 *     değil. `claimDue` tam o değerle karşılaştırıyor; `now()` ise Postgres'in saati ve o,
 *     Docker VM'inde ayrı işliyor (gerekçenin tamamı `helpers/db.ts` → `dueAt`).
 *  2. Görevin **gerçekten işlendiği** doğrulanıyor. Eskiden yalnız `expect(r.dead).toBe(0)`
 *     vardı ve o, HİÇ görev alınmadığında da geçiyordu: `tick()` boşa dönüyor, savaş hiç
 *     olmuyor, hata sonraki okumada `rows[0] undefined` diye patlıyordu — sebebi görünmeden.
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
    /* ⚠️ `vacation_since` de yazılmalı: `players_vacation_pair` CHECK'i ikisini çift olmaya
       zorluyor (§tatil modu). Tek başına `vacation_until` yazmak artık isteği patlatır. */
    await h.db.execute(sql`
      UPDATE players SET vacation_since = ${at.toISOString()}::timestamptz,
                         vacation_until = ${at.toISOString()}::timestamptz + interval '48 hours'
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

  /* ── Kullanıcının tarif ettiği mantığın birebir ölçümü (2026-08-08) ──────────────────── */

  /**
   * ⭐ Kullanıcı: *"o andan 24 saat öncesine kadar olan sürede yapılan **başarılı veya
   * başarısız** saldırıların toplamı 3 değilse izin verilir."*
   *
   * ⚠️ Yukarıdaki testler yalnız YOLDAKİ (scheduled) saldırıları ölçüyordu. Çözülmüş bir
   * saldırının da sayılması kuralın yarısı ve hiç sınanmamıştı — sayım `status <> 'canceled'`
   * dediği için doğru çalışıyor, ama bunu bir testin söylemesi gerekiyor.
   */
  it('⭐ ÇÖZÜLMÜŞ saldırılar da sayılır (başarılı/başarısız ayrımı yok)', async () => {
    await giveUnits(attackCity, 'dwarf', 3000);
    await giveUnits(defendCity, 'dwarf', 5);
    const at = await clock.gameNow(worldId);

    for (let i = 0; i < 3; i++) {
      const m = await missions.sendAttack({
        originCityId: attackCity, playerId: attacker, worldId,
        target: { k: 1, d: 1, s: 2 }, units: { dwarf: 20 }, at,
      });
      await runDue(m.missionId);                    // savaş çözülsün → status 'done'
    }
    /**
     * ⚠️ `openMissions` adına rağmen o tipteki TÜM satırları döndürüyor (açık olanları değil) —
     * ilk yazımda `toHaveLength(0)` bekledim ve test bu yüzden düştü. Doğru kontrol satırların
     * varlığı değil **durumu**: üçü de çözülmüş olmalı ki ölçüm "çözülmüş saldırı sayılır mı"
     * sorusunu gerçekten sorsun.
     */
    const rows = await openMissions('attack');
    expect(rows, 'kurgu bozuk: üç saldırı da yazılmalıydı').toHaveLength(3);
    expect(
      rows.map((r) => String(r['status'])),
      'kurgu bozuk: saldırılar hâlâ çözülmemiş',
    ).toEqual(['done', 'done', 'done']);

    await expect(missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 20 }, at,
    })).rejects.toThrow(/en fazla 3 saldırı/);
  });

  /**
   * ⭐ İptal edilen saldırı hakkı GERİ VERİR. Canlıda da böyle işliyor (8 Ağustos ölçümü:
   * oyuncu 8 → şehir 12'de 3 iptal + 1 tamamlanmış, yalnız 1'i sayılmış).
   */
  it('⭐ İPTAL edilen saldırı hakkı geri verir', async () => {
    await giveUnits(attackCity, 'dwarf', 1000);
    const at = await clock.gameNow(worldId);
    const send = (): Promise<{ missionId: number }> => missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
    });

    await send(); await send();
    const ucuncu = await send();
    await expect(send()).rejects.toThrow(/en fazla 3 saldırı/);

    await h.db.execute(sql`
      UPDATE missions SET status = 'canceled' WHERE id = ${ucuncu.missionId}
    `);
    await expect(send()).resolves.toBeTruthy();
  });

  /**
   * ⭐⭐ EKRANDAKİ SAYI İLE KAPI AYNI OLMALI (kullanıcı: *"o şehre kalan günlük saldırı sayısı
   * yazılır"*). Sayım `mission.controller.ts`te KOPYAlanmıştı ve pencereyi 24, limiti 3 olarak
   * koda gömüyordu; artık ikisi de `MissionService.attacksUsed`ten okuyor. Bu test o tekliği
   * uçtan uca ölçüyor: her adımda ekrandaki "kalan" ile kapının kabul/ret kararı tutmalı.
   */
  it('⭐⭐ modaldaki «kalan saldırı hakkı» kapıyla adım adım tutuyor', async () => {
    await giveUnits(attackCity, 'dwarf', 1000);
    const at = await clock.gameNow(worldId);
    const controller = new MissionController(missions, clock, h.db);
    const kalan = async (): Promise<number> => {
      const res = await controller.options(
        String(attackCity), '1', '1', '2',
        { player: { playerId: attacker, worldId } } as never,
      );
      return res['attacksLeft'] as number;
    };
    const send = (): Promise<unknown> => missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
    });

    expect(await kalan()).toBe(3);
    await send();
    expect(await kalan()).toBe(2);
    await send();
    expect(await kalan()).toBe(1);
    await send();
    // Ekran 0 diyorsa kapı da reddetmeli — ikisinin ayrışması tam olarak yasak olan şey.
    expect(await kalan()).toBe(0);
    await expect(send()).rejects.toThrow(/en fazla 3 saldırı/);
  });

  /** Kalan hak ÇİFT BAŞINA: başka şehir için sayaç dolu görünmemeli. */
  it('ekrandaki kalan hak da çift başına', async () => {
    await giveUnits(attackCity, 'dwarf', 1000);
    const at = await clock.gameNow(worldId);
    const ucuncu = await createPlayer(h, worldId, 'kalan2');
    await cities.create({
      worldId, playerId: ucuncu, name: 'kalan2', k: 1, d: 1, s: 6, isCapital: true, at,
    });
    await h.db.execute(sql`UPDATE players SET protected_until = NULL WHERE id = ${ucuncu}`);

    for (let i = 0; i < 3; i++) {
      await missions.sendAttack({
        originCityId: attackCity, playerId: attacker, worldId,
        target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
      });
    }
    const controller = new MissionController(missions, clock, h.db);
    const res = await controller.options(
      String(attackCity), '1', '1', '6',
      { player: { playerId: attacker, worldId } } as never,
    );
    expect(res['attacksLeft']).toBe(3);
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
    expect(String(battles[0]!['engine_version'])).toBe(ENGINE_VERSION);
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

  /**
   * ⭐ Doküman (GENEL DURUM): *"Ordularınızın savaştaki kayıpları … puan kaybetmenize neden
   * olur."* Kayıp TÜR TÜR hesaplanmalı — motorun `lost` alanı yalnız toplam adettir ve onu
   * kullanmak Ejderha ile Cüce'yi aynı bedele eşitlerdi.
   */
  it('⭐ savaş kaybı iki tarafın da PUANINI düşürür (kaybedilen birimin katalog bedeli kadar)', async () => {
    // Yakın güçte iki ordu: İKİ taraf da gerçekten kayıp versin (5000'e 50'de saldıran
    // hiç kimseyi kaybetmiyor ve testin yarısı ölçülmemiş kalıyordu).
    await giveUnits(attackCity, 'dwarf', 5000);
    await giveUnits(defendCity, 'dwarf', 4000);
    // Puan tabanı savaştan bağımsız olarak doldurulur → düşüşü net ölçebilelim.
    for (const id of [attacker, defender]) {
      await h.db.execute(sql`
        UPDATE players SET score = 100000, score_base = 100000000::numeric WHERE id = ${id}
      `);
    }
    const before = { atk: await scoreBaseOf(attacker), def: await scoreBaseOf(defender) };
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 5000 }, at,
    });
    await runDue(m.missionId);

    const result = (await h.db.execute<Record<string, unknown>>(sql`
      SELECT result FROM battles WHERE world_id = ${worldId}
    `))[0]!['result'] as {
      attacker: { counts: Record<string, number> };
      defender: { counts: Record<string, number> };
    };

    const dwarf = UNITS_BY_ID['dwarf']!;
    const perUnit = dwarf.gold + dwarf.food;
    const atkLost = 5000 - Math.trunc(result.attacker.counts['dwarf'] ?? 0);
    const defLost = 4000 - Math.trunc(result.defender.counts['dwarf'] ?? 0);
    const after = { atk: await scoreBaseOf(attacker), def: await scoreBaseOf(defender) };

    // Kayıp motorun sonucundan okunuyor; puan düşüşü ona BİREBİR eşit olmalı.
    expect(atkLost).toBeGreaterThan(0);
    expect(defLost).toBeGreaterThan(0);
    expect(before.atk - after.atk).toBe(perUnit * atkLost);
    expect(before.def - after.def).toBe(perUnit * defLost);
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
   * ⭐ GİZLİLİK SINIRI (2026-07-31): gelen ordunun içeriği açıldı ve ganimet artık `cargo`
   * alanında görünüyor — ama YALNIZ sahibine. Savunanın listesinde dönüş bacağı hiç satır
   * ÜRETMEZ; bunun sebebi sorgunun onu dışlaması DEĞİL (dönüşün `origin_city_id`'si savunanın
   * şehridir, satır sorguya girer), `OUT_ICON`'da `return` karşılığının olmamasıdır.
   * Oraya `return` eklenirse savunan saldıranın ganimetini görmeye başlar — bu test o kapıyı
   * kilitliyor.
   */
  it('⭐ savunan saldırının DÖNÜŞ bacağını görmez — ganimet sızmaz', async () => {
    await giveUnits(attackCity, 'cargo_wagon', 50);
    await giveUnits(attackCity, 'dwarf', 3000);
    await giveUnits(defendCity, 'dwarf', 10);
    await setResources(defendCity, 200_000, 200_000);

    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 3000, cargo_wagon: 50 }, at,
    });
    await runDue(m.missionId);

    const controller = new MissionController(missions, clock, h.db);
    const defList = await controller.list({ player: { playerId: defender, worldId } } as never);
    const defRows = defList['movements'] as Record<string, unknown>[];
    expect(defRows.filter((x) => x['type'] === 'return')).toHaveLength(0);
    expect(JSON.stringify(defRows)).not.toContain('"cargo":{');

    // Saldıran ise KENDİ dönüşünde ganimetini görür (kendi bilgisi).
    const atkList = await controller.list({ player: { playerId: attacker, worldId } } as never);
    const own = (atkList['movements'] as Record<string, unknown>[])
      .find((x) => x['direction'] === 'own')!;
    expect(own['type']).toBe('return');
    const cargo = own['cargo'] as { gold: number; food: number };
    expect(cargo.gold + cargo.food).toBeGreaterThan(0);
    expect(own['units']).toBeTruthy();
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
    /**
     * ⭐ Garanti bu: ordu ne kadar ezici olursa olsun hiçbir tip 4'ün altına inmez — ve
     * savaş öncesi adedini de aşmaz.
     *
     * ⚠️ Eskiden `toBe(4)` yazıyordu ve 2026-07-31'de onarım oranı ölçüme göre 0,50-0,70'ten
     * 0,76-0,81'e çıkınca kırıldı: balista 5'te kaldı, çünkü onarım artık tabanın üstünü
     * döndürüyor. Testin KENDİ yorumu zaten "tabanın o seed'de gerekip gerekmediği onarım
     * ruloya bağlı" diyordu — yani iddia kuralı değil, o ruloya düşen tesadüfi sayıyı
     * sabitliyormuş. Kural olarak yeniden yazıldı; deterministik ölçüm motorun
     * `defense-floor` testlerinde duruyor.
     */
    for (const id of ['ballista', 'archer_tower', 'guard']) {
      expect(d[id], `${id} tabanın altına düşmemeli`).toBeGreaterThanOrEqual(4);
      expect(d[id], `${id} savaş öncesi adedini aşmamalı`).toBeLessThanOrEqual(6);
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
      UPDATE missions SET execute_at = ${await dueAt(clock, worldId, 7200000)}::timestamptz WHERE id = ${m.missionId}
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
      UPDATE missions SET status = 'scheduled', execute_at = ${await dueAt(clock, worldId)}::timestamptz, finished_at = NULL
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

/**
 * ⭐⭐ KAPASİTEYE SIĞMAYAN YAĞMA ŞEHİRDE **KALIR** (kullanıcı sorusu, 2026-08-08).
 *
 * Kullanıcı raporu okuyup haklı olarak sordu: *"Şehrin kasasından sadece taşınan iki miktar
 * eksiliyor değil mi? Şehirde kalan olarak yazdığın 441.242 ile 441.264 değil?"*
 *
 * Evet. `plunderNotCarried` **bilgi amaçlı** bir sayıdır: "oranca alınabilirdi ama kapasite
 * yetmedi". Savunandan düşülen tek kalem `fromPlunder`dır (`battle.handlers.ts` → tek
 * `trySpend` çağrısı). Bu ayrım kolayca ters uygulanabilirdi — ve o hâlde savunan, saldıranın
 * hiç götürmediği kaynağı kaybederdi.
 *
 * ⚠️ Mevcut testlerde bu değişmez yalnız DOLAYLI duruyordu (sur iptali testinin kasa hesabı
 * içinde). Kapasitenin gerçekten aştığı bir kurguda doğrudan ölçülmemişti; bu blok onu
 * kilitliyor.
 */
describe('⭐ yağma: kapasiteye sığmayan kısım şehirde kalır', () => {
  it('savunanın kasasından YALNIZ taşınan kadar düşer', async () => {
    // Kağnısız, düşük kapasiteli bir ordu + zengin şehir → kapasite kesin aşılır.
    await giveUnits(attackCity, 'dwarf', 400);
    await setResources(defendCity, 2_000_000, 2_000_000);
    const kasa0 = await resourcesOf(defendCity);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 400 }, at,
    });
    await runDue(m.missionId);

    const [b] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT result FROM battles WHERE world_id = ${worldId}
    `);
    const res = b!['result'] as {
      winner: string;
      attackerCarryCapacity: number;
      loot: {
        taken: { gold: number; food: number };
        fromPlunder: { gold: number; food: number };
        plunderNotCarried: { gold: number; food: number };
        leftoverDebrisToDefender: { gold: number; food: number };
      };
    };
    expect(res.winner, 'kurgu bozuk: saldıran kazanmalıydı').toBe('attacker');

    // Kurgunun gerçekten kapasite freniyle karşılaştığını doğrula — yoksa test boş geçer.
    expect(
      res.loot.plunderNotCarried.gold + res.loot.plunderNotCarried.food,
      'kurgu bozuk: kapasite aşılmamış, test ölçmek istediğini ölçmüyor',
    ).toBeGreaterThan(0);
    // ⭐ Taşınan, kapasitenin TAMAMINI kullanmalı (kullanıcının ikinci sorusu).
    expect(res.loot.taken.gold + res.loot.taken.food)
      .toBeCloseTo(res.attackerCarryCapacity, 0);

    const kasa1 = await resourcesOf(defendCity);
    for (const kaynak of ['gold', 'food'] as const) {
      const beklenen = kasa0[kaynak]
        - res.loot.fromPlunder[kaynak]
        + res.loot.leftoverDebrisToDefender[kaynak];
      expect(kasa1[kaynak], `${kaynak}: yalnız taşınan düşmeli`).toBeCloseTo(beklenen, 0);
      /**
       * ⚠️ Asıl yasak: `plunderNotCarried` DE düşülmüş olsaydı kasa bu kadar azalırdı.
       * Ayrımı açıkça yazıyoruz ki bir gün biri "alınabilecek kadarını düş" derse test
       * ona sebebini göstersin.
       */
      const yanlisBeklenti = beklenen - res.loot.plunderNotCarried[kaynak];
      expect(kasa1[kaynak]).not.toBeCloseTo(yanlisBeklenti, 0);
    }
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
    // Orijinal oyunun kalıpları (k.java): "Kazandınız !" / "Kaybettiniz !".
    expect(atk.text).toMatch(/Kazandınız !/);
    expect(def.text).toMatch(/Kaybettiniz !/);
    // Türkçe birim adları ve sayılar raporda.
    expect(atk.text).toMatch(/Cüce/);
    expect(def.text).toMatch(/Okçu Kulesi/);
    // Saldıran ALDIĞINI, savunan KAYBETTİĞİNİ görür.
    expect(atk.loot).not.toBeNull();
    expect(atk.lootBreakdown).not.toBeNull();
    expect(def.lootBreakdown).toBeNull();
    // ⭐ Bölümler okuyanın perspektifinde: iki taraf da önce KENDİ ordusunu görür.
    expect(atk.sections[0]!.key).toBe('myArmy');
    expect(def.sections.some((s) => s.key === 'enemyArmy')).toBe(true);
    expect(def.sections.some((s) => s.key === 'defenderStructs')).toBe(true);
    // ⭐ Zenginleştirme: koordinatlar, o anki şehir adları VE oyuncu adları (2026-08-07)
    //    savaş anında satıra işlendi. `owner` ekranda `name`in yerini aldı ama ikisi de
    //    gövdede duruyor — `name` silinseydi eski raporlar adsız kalırdı.
    expect(atk.coords?.target).toMatchObject({ k: 1, d: 1, s: 2, name: 'savunan' });
    expect(atk.coords?.origin).toMatchObject({ k: 1, d: 1, s: 1, name: 'saldiran' });
    expect(atk.coords?.target?.owner).toMatch(/^def-/);
    expect(atk.coords?.origin?.owner).toMatch(/^atk-/);
    // Metin dökümünde de ad koordinatın yanında (kullanıcı, 2026-08-04).
    expect(atk.text).toMatch(/Kaynak: 1:1:1 \(saldiran\) → Hedef: 1:1:2 \(savunan\)/);

    /**
     * ⭐ «Ortaya çıkan» ile «Taşınan» AYRI şeyler olmalı. Eskiden `revealed` =
     * `fromDebris + fromPlunder` yazıyordu ve o toplam TANIMI GEREĞİ `taken`e eşit
     * (`engine/loot.ts`: `fromPlunder = taken − fromDebris`) → iki satır her zaman aynı
     * sayıyı gösteriyordu. Artık `revealed` motorun ürettiği ENKAZ.
     */
    expect(atk.lootBreakdown!.revealed).toEqual(row.result.debris);
    expect(atk.lootBreakdown!.carried).toEqual(atk.loot);

    /**
     * ⭐⭐ «NEDEN BU KADAR AZ GANİMET?» — kapasite freni raporda görünmeli
     * (oyuncu bildirimi + canlı doğrulama, 2026-08-08).
     *
     * Canlı savaş #14 (tohum 3295440785): şehirde ~1,5M altın ve ~1,5M yemek vardı, yağma
     * oranı %34,6 → **521 bin + 521 bin** alınabilirdi. Ordunun taşıma kapasitesi 159.728'di
     * ve TAM o kadar taşındı; kalan 441 bin + 441 bin şehirde kaldı. Veri (`plunderNotCarried`)
     * doğruydu ama rapor bundan hiç söz etmiyordu ve oyuncu ganimetin az OLUŞTUĞUNU sandı.
     *
     * ⚠️ Ölçüt sabit bir sayı değil **veriyle tutarlılık**: geride kalan miktar motorun
     * söylediğinin aynısı olmalı. Sabit yazsaydım denge değişince test yanlış yere düşerdi.
     */
    const notCarried = row.result.loot!.plunderNotCarried!;
    const kapasiteAsildi = notCarried.gold > 0 || notCarried.food > 0;
    if (kapasiteAsildi) {
      expect(atk.lootBreakdown!.leftBehind).toEqual(notCarried);
      expect(atk.lootBreakdown!.capacity).toBe(row.result.attackerCarryCapacity);
      expect(atk.text).toMatch(/Taşıma kapasiten yetmedi/);
      // ⚠️ Savunan bu satırı GÖRMEZ: kendi kasasında ne kaldığını zaten biliyor, ve
      //    saldıranın kapasitesi bir istihbarat kırıntısıdır.
      expect(def.lootBreakdown).toBeNull();
    } else {
      expect(atk.lootBreakdown!.leftBehind).toBeNull();
      expect(atk.text).not.toMatch(/kapasiten yetmedi/i);
    }

    // ⭐ Sur oranı SALDIRANA gitmez (kullanıcı, 2026-08-08) — savunan kendi surunu görür.
    if (atk.wall) expect(atk.wall.integrity).toBeNull();
    expect(atk.text).not.toMatch(/bütünlük %/);
    expect(atk.notes.join(' ')).not.toMatch(/Sur bütünlüğü %/);
  });

  /**
   * ⭐⭐ **KAYBEDEN SALDIRANIN RAPORU** — oyuncu bildirimi (2026-08-08) ve canlı veriyle
   * doğrulandı (savaş #5, tohum 731518373).
   *
   * ⚠️ Oyuncu *"kaybettiğim savaşta hiç ganimet oluşmamış yazıyor, oysa ölen askerler var"*
   * dedi ve bunu *"savunana ganimet eklenmemiş"* diye yorumladı. Canlı satırda `debris`
   * **84.495 altın / 82.995 yemek**'ti ve tamamı savunanın şehrine eklenmişti — yani VERİ
   * doğruydu, **rapor yalan söylüyordu**: `revealed` sıfırlanmış alanlardan hesaplanıyordu.
   *
   * Bu test o yalanı imkânsız kılıyor: enkaz varsa raporda GÖRÜNMEK zorunda.
   */
  it('saldıran kaybedince: enkaz raporda görünür, «Ganimet» ve «Taşınan» yazılmaz', async () => {
    // Savunan ezici üstünlükte → saldıran kesin kaybeder ama iki taraf da kayıp verir.
    await giveUnits(attackCity, 'dwarf', 40);
    await giveUnits(defendCity, 'dwarf', 4000);
    await setResources(defendCity, 500_000, 500_000);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 40 }, at,
    });
    await runDue(m.missionId);

    const b = (await h.db.execute<Record<string, unknown>>(sql`
      SELECT id, at, night, winner, input, result FROM battles
       WHERE world_id = ${worldId} ORDER BY id DESC LIMIT 1
    `))[0]!;
    const row: BattleRow = {
      id: Number(b['id']), at: toDate(b['at']), night: Boolean(b['night']),
      winner: String(b['winner']),
      input: b['input'] as BattleRow['input'], result: b['result'] as BattleRow['result'],
    };
    expect(row.winner).toBe('defender');

    // Enkaz gerçekten oluştu (ölen askerler var) ve TAMAMI savunana yazıldı.
    const debris = row.result.debris;
    expect(debris.gold + debris.food).toBeGreaterThan(0);
    expect(row.result.loot!.leftoverDebrisToDefender).toEqual(debris);
    expect(row.result.loot!.taken).toEqual({ gold: 0, food: 0 });

    const atk = buildBattleReport(row, 'attacker');
    // ⛔ Taşıdığı bir şey yok → «Ganimet» satırı HİÇ yazılmaz (kullanıcı kararı).
    expect(atk.loot).toBeNull();
    expect(atk.text).not.toMatch(/Ganimet:/);
    expect(atk.text).not.toMatch(/Taşınan:/);
    // ✅ Ama ortaya çıkan enkaz GÖRÜNÜR — hatanın tam olarak düzeltildiği yer burası.
    expect(atk.lootBreakdown).not.toBeNull();
    expect(atk.lootBreakdown!.revealed).toEqual(debris);
    expect(atk.lootBreakdown!.carried).toBeNull();
    expect(atk.text).toMatch(/Ortaya çıkan:/);

    // Savunan kaybını ve şehrinde kalan enkazı görmeye devam eder.
    const def = buildBattleReport(row, 'defender');
    expect(def.notes.join(' ')).toMatch(/Taşınamayan enkaz şehrinde kaldı/);
  });

  /**
   * ⭐ **ADIN DONMASI** — bu testin ölçtüğü şey tasarımın kendisi.
   *
   * Şehir adı koordinat gibi kalıcı değil: oyuncu her an değiştirebilir. Rapor okuma anında
   * `cities`ten okusaydı, aylar önceki bir saldırının raporu bugünkü adı gösterir ve oyuncunun
   * hatırladığı olayla çelişirdi. Kullanıcının isteği de bunu söylüyor: *"o andaki şehir adı"*.
   */
  it('savaştan SONRA şehir yeniden adlandırılsa bile rapor eski adı gösterir', async () => {
    await giveUnits(attackCity, 'dwarf', 3000);
    await giveUnits(defendCity, 'dwarf', 200);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 3000 }, at,
    });
    await runDue(m.missionId);

    // Savunan, savaştan sonra şehrini yeniden adlandırıyor.
    await h.db.execute(sql`UPDATE cities SET name = 'yeni-ad' WHERE id = ${defendCity}`);

    const b = (await h.db.execute<Record<string, unknown>>(sql`
      SELECT id, at, night, winner, input, result FROM battles WHERE world_id = ${worldId}
    `))[0]!;
    const report = buildBattleReport({
      id: Number(b['id']), at: toDate(b['at']), night: Boolean(b['night']),
      winner: String(b['winner']),
      input: b['input'] as BattleRow['input'], result: b['result'] as BattleRow['result'],
    }, 'attacker');

    expect(report.coords?.target?.name).toBe('savunan');
    expect(report.text).not.toMatch(/yeni-ad/);
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
    // Sur bütünlüğü raporlanır; Sur SEVİYE olduğu için birim SATIRI olarak görünmez,
    // ayrı bir Sur kartı/satırı olarak görünür.
    expect(notes).toMatch(/Sur bütünlüğü %25/);
    const struct = def.sections.find((s) => s.key === 'defenderStructs')!;
    expect(struct.lines.some((l) => l.id === 'wall')).toBe(false);
    expect(def.wall).toMatchObject({ level: 3, integrity: 0.25, destroyed: false });
    expect(def.text).toMatch(/Sur: seviye 3 — bütünlük %25/);

    /* ⭐ ESKİ ŞEKİL DEGRADE: bu sentetik result 2026-07-30 zenginleştirmesinden önceki
     * kayıtları taklit eder (heroesDetail/coords YOK) → rapor boş kahraman listeleri ve
     * null koordinatla, hatasız üretilmeli. */
    expect(def.heroes).toEqual({ mine: [], enemy: [], captured: null });
    expect(def.coords).toBeNull();
    expect(def.cave).toBeNull();

    // Satırlarda "önce → sonra (kayıp)" dökümü var.
    const ballista = struct.lines.find((l) => l.id === 'ballista')!;
    expect(ballista).toMatchObject({ before: 20, after: 4, lost: 16, restoredByFloor: 3 });
    expect(def.text).toMatch(/Balista: 20 → 4 \(kayıp 16\) \[taban \+3\]/);
  });

  /**
   * ⭐ **KURAL DEĞİŞTİ (kullanıcı, 2026-08-05): gece raporda YAZIYLA anlatılmaz.**
   * *"Savaş raporunda açık açık gece savaşı bilgileri yazmasın… Sadece kazanan veya kaybeden
   * yazısının yanında ay simgesi olması yeterli, tooltip çıkmasına da gerek yok."*
   *
   * ⚠️ Testin eski hâli `notes` içinde /GECE/ arıyordu. Şimdi ölçtüğü şey ikiye ayrıldı:
   * (1) o cümle ARTIK YOK, (2) `night` alanı DURUYOR — ekranın ay simgesini çizebilmesi
   * için gerekli. Alanı da silseydik simge çizilemezdi; kaldırılan yalnız düzyazı.
   */
  it('gece savaşı YAZIYLA anlatılmaz ama `night` alanı raporda durur', () => {
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
    // Gece ne notlarda ne de metin dökümünde geçiyor.
    expect(atk.notes.join(' ')).not.toMatch(/gece|GECE|Gece Görüşü/);
    expect(atk.text).not.toMatch(/gece/i);
    // …ama alan duruyor: ekran ay simgesini buradan çiziyor.
    expect(atk.night).toBe(true);
    // Diğer notlar etkilenmedi.
    expect(atk.notes.join(' ')).toMatch(/Ordudan kimse dönmedi/);
    expect(atk.won).toBe(false);
  });
});

/**
 * ⭐ **PENCERE UTC'DEN TÜRKİYE SAATİNE TAŞINDI** (kullanıcı, 2026-08-04).
 *
 * ⚠️ Bu testin eski hâli `00:00Z–08:00Z` bekliyordu ve GEÇİYORDU — ama ölçtüğü şey yanlıştı:
 * o pencere Türkiye'de **03:00–11:00**'e denk geliyordu, yani oyuncular sabah 10'da "gece"
 * cezası yiyor, gerçek gece yarısında yemiyordu. Dokümanın cümlesi ("saat 00:00'dan 08:00'a")
 * hedef kitlenin saatiyle okunmalı.
 *
 * ⚠️ Bu bir DENGE değişikliğidir ve bilerek yapıldı: aynı sefer aynı saatte gönderildiğinde
 * artık farklı sonuçlanabilir.
 */
describe('gece savaşı penceresi (dokümandan: 00:00–08:00, TÜRKİYE saati)', () => {
  it('Türkiye saatiyle 00:00–08:00 arası gece', () => {
    expect(isNightBattle(new Date('2026-07-25T21:00:00Z'))).toBe(true);   // TSİ 00:00
    expect(isNightBattle(new Date('2026-07-26T00:30:00Z'))).toBe(true);   // TSİ 03:30
    expect(isNightBattle(new Date('2026-07-26T04:59:59Z'))).toBe(true);   // TSİ 07:59
    expect(isNightBattle(new Date('2026-07-26T05:00:00Z'))).toBe(false);  // TSİ 08:00
    expect(isNightBattle(new Date('2026-07-26T17:00:00Z'))).toBe(false);  // TSİ 20:00
  });

  /** ⚠️ Değişimin somut yüzü: eskiden gece sayılan iki an artık gündüz ve tersi. */
  it('eski UTC penceresinin kaydırdığı anlar düzeldi', () => {
    // TSİ 10:59 — eskiden "gece"ydi (07:59Z, UTC penceresinin içinde), artık gündüz.
    expect(isNightBattle(new Date('2026-07-26T07:59:00Z'))).toBe(false);
    // TSİ 00:30 — eskiden gündüzdü (21:30Z, UTC penceresinin dışında), artık gece.
    expect(isNightBattle(new Date('2026-07-25T21:30:00Z'))).toBe(true);
    // ⚠️ TSİ 23:30 pencerenin DIŞINDA: gece penceresi 00:00'da başlıyor, akşam değil.
    expect(isNightBattle(new Date('2026-07-26T20:30:00Z'))).toBe(false);
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
      UPDATE missions SET execute_at = ${await dueAt(clock, worldId)}::timestamptz WHERE id = ${missionId}
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
      SELECT city_id, status FROM heroes WHERE id = ${heroId}
    `))[0]!;
    expect(row['city_id']).toBeNull();

    await runDue(m.missionId);
    const ret = (await openMissions('return'))[0]!;
    await runDue(Number(ret['id']));

    row = (await h.db.execute<Record<string, unknown>>(sql`
      SELECT city_id, status FROM heroes WHERE id = ${heroId}
    `))[0]!;
    expect(Number(row['city_id'])).toBe(attackCity);
    expect(row['status']).toBe('alive');
  });

  /**
   * ⭐ TECRÜBE PAYLAŞIMI (kullanıcı kararı, 2026-07-29): havuz TEK, kazanan 2/3'ünü, kaybeden
   * 1/3'ünü alır. Kaybedenin kahramanı sağ kaldıysa o da öğrenir — eski kural "yalnız kazanan"dı.
   */
  it('tecrübeyi iki taraf da alır: kazanan 2/3, kaybeden 1/3', async () => {
    /* Tecrübe ancak DENGELİ savaşta oluşur: xp = (kayıplar) × (kazananKaybı/kaybedenKaybı).
     * 3000'e 3000 hem yüksek XP üretir hem iki tarafta da sağ birlik ve sağ kahraman bırakır. */
    await giveUnits(attackCity, 'dwarf', 3000);
    await giveUnits(defendCity, 'dwarf', 3000);
    const at = await clock.gameNow(worldId);

    const mk = async (playerId: number, cityId: number): Promise<number> => {
      const r = await h.db.execute<Record<string, unknown>>(sql`
        INSERT INTO heroes (world_id, player_id, city_id, name, level)
        VALUES (${worldId}, ${playerId}, ${cityId}, ${'K-' + randomUUID().slice(0, 4)}, 0)
        RETURNING id
      `);
      return Number(r[0]!['id']);
    };
    const atkHero = await mk(attacker, attackCity);
    const defHero = await mk(defender, defendCity);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 3000 }, heroIds: [atkHero], at,
    });
    await runDue(m.missionId);

    const xpOf = async (id: number): Promise<number> => Number((await h.db.execute<Record<string, unknown>>(
      sql`SELECT xp FROM heroes WHERE id = ${id}`,
    ))[0]!['xp']);
    const atkXp = await xpOf(atkHero);
    const defXp = await xpOf(defHero);

    // İki kahraman da sağ çıktı → İKİSİ de öğrenir (eski kuralda kaybeden hiç almazdı).
    expect(atkXp).toBeGreaterThan(0);
    expect(defXp).toBeGreaterThan(0);

    /* Kazananı savaş kaydından okuyoruz: savunma tabanı ve sur yüzünden eşit birlikle
     * savunan kazanabiliyor — testin kimin kazandığını VARSAYMAMASI gerek. */
    const [battle] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT winner FROM battles WHERE world_id = ${worldId}
    `);
    const winnerXp = battle!['winner'] === 'attacker' ? atkXp : defXp;
    const loserXp = battle!['winner'] === 'attacker' ? defXp : atkXp;

    // Kazananın payı kaybedenin tam iki katı (2/3 ÷ 1/3).
    expect(winnerXp / loserXp).toBeCloseTo(2, 1);
  });

  /** Ölen kahraman payını alamaz — kendi tarafı kazanmış olsa bile. */
  it('savaşta ölen kahraman tecrübe almaz', async () => {
    await giveUnits(attackCity, 'dwarf', 4000);
    await giveUnits(defendCity, 'dwarf', 20);
    const at = await clock.gameNow(worldId);
    const r = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, level)
      VALUES (${worldId}, ${defender}, ${defendCity}, ${'Olen-' + randomUUID().slice(0, 4)}, 0)
      RETURNING id
    `);
    const defHero = Number(r[0]!['id']);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 4000 }, at,
    });
    await runDue(m.missionId);

    const [row] = await h.db.execute<Record<string, unknown>>(
      sql`SELECT xp, status FROM heroes WHERE id = ${defHero}`,
    );
    // Savunan ezildi: kahraman öldü → XP yok (ölen kahraman payını alamaz).
    if (row && row['status'] !== 'alive') expect(Number(row['xp'])).toBe(0);
  });

  /**
   * ⭐ ÖLÜ ve DİRİLTİLMEKTE olan kahraman hiçbir sefere katılamaz (kullanıcı kararı 2026-07-29):
   * saldırı, destek, nakliye — hepsi aynı `reserveHeroes` kapısından geçtiği için tek kural.
   *
   * ⚠️ `destroyed` listeden çıktı: o durum 2026-08-01'de emekli oldu (`0033_hero_no_destroy`).
   * Kapı zaten `status = 'alive'` ARIYOR, yani sözlükte olmayan bir değer de reddedilirdi —
   * ama sözlükte olmayan bir değeri test etmek kuralı değil tesadüfü sınamak olurdu.
   */
  it.each(['dead', 'reviving'])('%s kahraman sefere çıkamaz', async (status) => {
    await giveUnits(attackCity, 'dwarf', 100);
    const at = await clock.gameNow(worldId);
    const r = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, level, status)
      VALUES (${worldId}, ${attacker}, ${attackCity}, ${'K-' + randomUUID().slice(0, 4)}, 2, ${status})
      RETURNING id
    `);
    const heroId = Number(r[0]!['id']);
    const ortak = {
      originCityId: attackCity, playerId: attacker, worldId,
      units: { dwarf: 10 }, heroIds: [heroId], at,
    };

    await expect(missions.sendAttack({ ...ortak, target: { k: 1, d: 1, s: 2 } }))
      .rejects.toMatchObject({ code: 'hero_unavailable' });
    await expect(missions.sendTransport({
      ...ortak, target: { k: 1, d: 1, s: 2 }, cargo: { gold: 1, food: 1 },
    })).rejects.toMatchObject({ code: 'hero_unavailable' });
    // Destek yalnız KENDİ şehrine gider → saldırana ikinci bir şehir açıyoruz.
    await cities.create({
      worldId, playerId: attacker, name: 'saldiran-2', k: 1, d: 1, s: 3, isCapital: false, at,
    });
    await expect(missions.sendSupport({ ...ortak, target: { k: 1, d: 1, s: 3 } }))
      .rejects.toMatchObject({ code: 'hero_unavailable' });

    // Kahraman şehirde KALIR: reddedilen sefer onu yerinden oynatmamalı.
    const [row] = await h.db.execute<Record<string, unknown>>(
      sql`SELECT city_id FROM heroes WHERE id = ${heroId}`,
    );
    expect(Number(row!['city_id'])).toBe(attackCity);
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

/**
 * ⭐ SUR YIKIMI ve ONARIMI (§13.21.2, kullanıcı kararı 2026-07-29).
 *
 * Üç kural burada kilitleniyor:
 *  1. Hasar gören sur onarıma girer; süre alınan hasarla orantılıdır.
 *  2. Onarım sürerken gelen saldırıyı sur **o ana kadar onarılmış yüzdeyle** karşılar —
 *     eskiden hep savaş-sonrası değerle giriyordu, yani onarımda geçen saatler ziyandı.
 *  3. Sur TAM yıkılırsa savunma birimi üretimi iptal edilir ve onarım bitene kadar kilitlenir.
 */
describe('sur yıkımı ve onarımı', () => {
  async function wallRow(): Promise<{ integrity: number; from: Date | null; until: Date | null }> {
    const [r] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT wall_integrity, wall_repair_from, wall_repair_until FROM cities WHERE id = ${defendCity}
    `);
    return {
      integrity: Number(r!['wall_integrity']),
      from: r!['wall_repair_from'] == null ? null : toDate(r!['wall_repair_from']),
      until: r!['wall_repair_until'] == null ? null : toDate(r!['wall_repair_until']),
    };
  }
  async function setWallLevel(level: number): Promise<void> {
    await h.db.execute(sql`
      INSERT INTO defenses (city_id, type, count) VALUES (${defendCity}, 'wall', ${level})
      ON CONFLICT (city_id, type) DO UPDATE SET count = ${level}
    `);
  }

  it('hasar gören sur onarıma girer; başlangıç anı da yazılır', async () => {
    await setWallLevel(3);
    await giveUnits(attackCity, 'dwarf', 4000);
    await giveUnits(defendCity, 'dwarf', 50);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 4000 }, at,
    });
    await runDue(m.missionId);

    const w = await wallRow();
    expect(w.integrity).toBeLessThan(1);
    expect(w.until).not.toBeNull();
    // ⭐ Başlangıç anı olmadan onarım ilerlemesi hesaplanamaz.
    expect(w.from).not.toBeNull();
    expect(w.until!.getTime()).toBeGreaterThan(w.from!.getTime());
    // Süre, o seviyedeki tam yıkım tavanıyla orantılı.
    const beklenen = wallRepairSeconds(3, w.integrity);
    expect((w.until!.getTime() - w.from!.getTime()) / 1000).toBeCloseTo(beklenen, 0);
  });

  it('onarımda geçen süre boşa gitmez: sur artan yüzdeyle savaşa girer', async () => {
    await setWallLevel(3);
    // Onarımın yarısını geçmiş bir sur kur: %0'dan başlamış, 10 saatin 5'i dolmuş.
    await h.db.execute(sql`
      UPDATE cities
         SET wall_integrity = 0::numeric,
             wall_repair_from  = ${await dueAt(clock, worldId, 18000000)}::timestamptz,
             wall_repair_until = now() + interval '5 hours'
       WHERE id = ${defendCity}
    `);
    await giveUnits(attackCity, 'dwarf', 10);
    await giveUnits(defendCity, 'dwarf', 10);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
    });
    await runDue(m.missionId);

    const [battle] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT input FROM battles WHERE world_id = ${worldId}
    `);
    const girdi = battle!['input'] as { defender: { wallIntegrity?: number } };
    // %0'dan başlayıp yarısı dolmuş onarım → savaşa ~%50 ile girer (eskiden %0 girerdi).
    expect(girdi.defender.wallIntegrity).toBeCloseTo(0.5, 1);
  });

  it('tam yıkım: üretim iptal, "1 ünite eksik" iade, bilgi YALNIZ savunanın raporunda', async () => {
    await setWallLevel(1);
    await giveUnits(attackCity, 'dwarf', 6000);
    /**
     * ⚠️ Savunana GARNİZON şart (2026-08-07). Bu test eskiden savunanı bomboş bırakıyordu ve
     * yalnız Sur 1 ile geçiyordu — çünkü motor sur SEVİYESİNİ canlı birim sayıyordu, savaş
     * 5 tur boşa dönüyor ve sur o turlarda yıkılıyordu. O sayım hatalıydı ve düzeltildi
     * (`combatAlive` artık `LEVEL_BASED` yapıları saymıyor; binary de aynısını yapıyor:
     * savunanda savaşacak kimse yoksa savaş 1 turda biter ve **sur hiç yıpranmaz**).
     * Testin ölçtüğü şey sur YIKIMI olduğu için kuruluma gerçek bir savunan konuyor.
     */
    await giveUnits(defendCity, 'dwarf', 20);
    const at = await clock.gameNow(worldId);
    const kasa0 = await resourcesOf(defendCity);

    /* Süren bir savunma emri: 10 sipariş, 2'si üretilmiş → 8 kalan. Emre 3000 altın / 4500
     * yemek harcanmış olsun (birim başına 300/450). İade: kalan 8 birimin bedelinden 1 eksik
     * → 7 birim = 2100 altın + 3150 yemek. */
    await h.db.execute(sql`
      INSERT INTO queues (world_id, city_id, player_id, category, item_type, count, done,
                          per_unit_seconds, position, started_at, finish_at, spent_gold, spent_food)
      VALUES (${worldId}, ${defendCity}, ${defender}, 'defense', 'archer_tower', 10, 2,
              60, 1, now(), now() + interval '1 hour', 3000, 4500)
    `);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 6000 }, at,
    });
    await runDue(m.missionId);

    const w = await wallRow();
    expect(w.integrity).toBe(0);                       // tam yıkıldı

    const [q] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT canceled_at, done FROM queues WHERE city_id = ${defendCity} AND category = 'defense'
    `);
    expect(q!['canceled_at']).not.toBeNull();
    // ⭐ O ana kadar üretilmiş 2 birim iptalden ETKİLENMEZ.
    expect(Number(q!['done'])).toBe(2);

    /* ⭐ İADE (kullanıcı, 2026-07-30): normal iptal kuralının aynısı — kalan 8 birimden 1
     * eksik iade. Kasa: başlangıç − yağma + taşınamayan enkaz + İADE. Yağma/enkaz savaşa
     * göre değişir; iadeyi net görmek için savaş raporundaki kalemleri düşerek doğrularız. */
    const [battle] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT result FROM battles WHERE world_id = ${worldId}
    `);
    const res = battle!['result'] as {
      loot: { fromPlunder: { gold: number; food: number };
        leftoverDebrisToDefender: { gold: number; food: number } };
      wallProduction?: { canceled: { type: string; left: number }[];
        refunded: { gold: number; food: number } };
    };
    expect(res.wallProduction).toBeDefined();
    expect(res.wallProduction!.canceled).toEqual([{ type: 'archer_tower', left: 8 }]);
    expect(res.wallProduction!.refunded).toEqual({ gold: 2100, food: 3150 });

    const kasa1 = await resourcesOf(defendCity);
    const beklenenAltin = kasa0.gold - res.loot.fromPlunder.gold
      + res.loot.leftoverDebrisToDefender.gold + 2100;
    expect(kasa1.gold).toBeCloseTo(beklenenAltin, 0);

    // ⭐ Eski ayrı mesaj KALKTI: bilgi artık savaş raporunun savunan gövdesinde.
    const msgs = await messagesOf(defender);
    expect(msgs.some((x) => x['kind'] === 'defense_band_canceled')).toBe(false);
    const rapor = msgs.find((x) => x['kind'] === 'battle_report');
    const body = rapor!['body'] as Record<string, unknown>;
    expect((body['wallProduction'] as Record<string, unknown>)['refunded'])
      .toEqual({ gold: 2100, food: 3150 });

    // Saldıranın gövdesinde İPTAL BİLGİSİ YOK (yalnız yıkım bilgisi var).
    const atkMsgs = await messagesOf(attacker);
    const atkRapor = atkMsgs.find((x) => x['kind'] === 'battle_report');
    const atkBody = atkRapor!['body'] as Record<string, unknown>;
    expect(atkBody['wallProduction']).toBeUndefined();
    expect((atkBody['wall'] as Record<string, unknown>)['destroyed']).toBe(true);
  });

  /**
   * ⭐ ARKA ARKAYA İKİ SALDIRI (kullanıcı garantisi, 2026-07-30): ikinci ordu, ilk savaşın
   * TÜM sonuçları (iade kasada, sur hasarlı) uygulandıktan sonra savaşır — advisory lock
   * aynı şehre düşen görevleri serileştirir.
   */
  it('çifte saldırı: ikinci savaş ilkinin iadesini kasada, surunu hasarlı bulur', async () => {
    await setWallLevel(1);
    await giveUnits(attackCity, 'dwarf', 12_000);
    /* ⚠️ Garnizon şart — gerekçe bir üstteki testte (sur tek başına savaşı sürdüremez). */
    await giveUnits(defendCity, 'dwarf', 20);
    const at = await clock.gameNow(worldId);
    await h.db.execute(sql`
      INSERT INTO queues (world_id, city_id, player_id, category, item_type, count, done,
                          per_unit_seconds, position, started_at, finish_at, spent_gold, spent_food)
      VALUES (${worldId}, ${defendCity}, ${defender}, 'defense', 'archer_tower', 10, 0,
              60, 1, now(), now() + interval '1 hour', 3000, 4500)
    `);

    const m1 = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 6000 }, at,
    });
    const m2 = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 6000 }, at,
    });

    // İkisini de vadeye getir; scheduler sırayla işler (lockCity serileştirir).
    await h.db.execute(sql`
      UPDATE missions SET execute_at = ${await dueAt(clock, worldId)}::timestamptz
       WHERE id IN (${m1.missionId}, ${m2.missionId})
    `);
    const r = await scheduler().tick();
    expect(r.dead).toBe(0);

    const battles = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id, result FROM battles WHERE world_id = ${worldId} ORDER BY id
    `);
    expect(battles).toHaveLength(2);

    const b1 = battles[0]!['result'] as { wallProduction?: unknown;
      loot: { fromPlunder: { gold: number } } };
    const b2 = battles[1]!['result'] as { wallProduction?: unknown };
    // İlk savaş üretimi iptal etti; ikincide iptal edilecek emir kalmadı.
    expect(b1.wallProduction).toBeDefined();
    expect(b2.wallProduction).toBeUndefined();

    /* İkinci savaş sur'u İLK savaşın bıraktığı hâlde (onarım payıyla) bulur: savaşa giren
     * bütünlük 1'den KÜÇÜK olmalı — kayıtlı input bunu kanıtlar. */
    const [b2row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT input FROM battles WHERE world_id = ${worldId} ORDER BY id OFFSET 1
    `);
    const girdi = b2row!['input'] as { defender: { wallIntegrity?: number } };
    expect(girdi.defender.wallIntegrity ?? 1).toBeLessThan(1);
  });
});

/* ═══ 10 KAT KURALI ═════════════════════════════════════════════════════════ */

/**
 * ⭐⭐ 10 KAT KURALI (kullanıcı, 2026-08-06): *"Bir oyuncu … kendisinden 10 kat düşük veya
 * 10 kat yüksek puanlı bir oyuncuya saldırı gerçekleştiremez. Casusluk gönderebilir. Tam 10
 * kat olunca bu kural devreye girer."*
 *
 * ⚠️ Testler kullanıcının VERDİĞİ ÖRNEKLERİ birebir kullanıyor (20↔200, 20↔2, 0↔10, 0↔9).
 * Kendi uydurduğum sayılarla ölçseydim kuralın sınırını yanlış yere koyduğumu fark edemezdim —
 * özellikle `>` mü `>=` mi olduğu tam bu örneklerden çıkıyor.
 *
 * ⚠️ Puan `players.score`tan DEĞİL `rankings`ten okunuyor; bu yüzden testler dondurulmuş
 * satırı doğrudan yazıyor. Anlık puanı değiştirmek kuralı ETKİLEMEMELİ ve bu da ölçülüyor.
 */
describe('10 kat kuralı (saldırı puan farkı)', () => {
  /** Sıralamada donmuş puanı yazar. `rank` kuralı ilgilendirmiyor, sıra için 1'den artıyor. */
  async function freezeScore(playerId: number, score: number, rank = 1): Promise<void> {
    await h.db.execute(sql`
      INSERT INTO rankings (world_id, kind, subject_id, rank, prev_rank, score, taken_at)
      VALUES (${worldId}, 'player', ${playerId}, ${rank}, NULL, ${score}, now())
      ON CONFLICT (world_id, kind, subject_id) DO UPDATE SET score = EXCLUDED.score
    `);
  }

  /**
   * ⚠️ Sonucu DÖNDÜRÜYOR. İlk yazımda `Promise<void>` idi ve `resolves.toBeTruthy()` diyen
   * dört test "expected undefined to be truthy" ile düştü — kural değil, yardımcı hatalıydı.
   */
  const attack = async (): Promise<{ missionId: number }> => {
    await giveUnits(attackCity, 'dwarf', 50);
    const at = await clock.gameNow(worldId);
    return missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 50 }, at,
    });
  };

  /**
   * ⚠️ Canlı ayar HER testten sonra sıfırlanıyor. "Ayar 0" testi bir kez düştüğünde
   * `setLiveSettings({})` satırına hiç ulaşmadı ve `attackScoreRatio: 0` bir sonraki teste
   * SIZDI — o test de yanlış sebeple düştü. Temizliği testin gövdesine bırakmak, hata
   * anında çalışmayan bir temizlik demek.
   */
  afterEach(() => { setLiveSettings({}); });

  const expectBlocked = async (): Promise<void> => {
    await expect(attack()).rejects.toMatchObject({ code: 'score_gap' });
  };

  it('⭐ TAM 10 kat ENGELLİ (20 → 200)', async () => {
    await freezeScore(attacker, 20);
    await freezeScore(defender, 200, 2);
    await expectBlocked();
  });

  it('10 katın ALTI serbest (20 → 199)', async () => {
    await freezeScore(attacker, 20);
    await freezeScore(defender, 199, 2);
    await expect(attack()).resolves.toBeTruthy();
  });

  /** ⭐ Kullanıcının ikinci örneği: kural AŞAĞI doğru da işliyor. */
  it('güçlü oyuncu zayıfa da saldıramaz (20 → 2)', async () => {
    await freezeScore(attacker, 20);
    await freezeScore(defender, 2, 2);
    await expectBlocked();
  });

  it('simetri: 200 puanlı 20 puanlıya saldıramaz', async () => {
    await freezeScore(attacker, 200);
    await freezeScore(defender, 20, 2);
    await expectBlocked();
  });

  /**
   * ⭐ SIFIR İSTİSNASI — kullanıcının açık örneği: *"0 puanlı bir oyuncu da 10 puanlı bir
   * oyuncuya saldıramasın, 9 puanlı birine saldırabilsin."* Kod 0'ı 1'e kelepçeliyor.
   */
  it('0 puan → 10 puana ENGELLİ, 9 puana serbest', async () => {
    await freezeScore(attacker, 0);
    await freezeScore(defender, 10, 2);
    await expectBlocked();

    await freezeScore(defender, 9, 2);
    await expect(attack()).resolves.toBeTruthy();
  });

  it('iki taraf da 0 puanken serbest', async () => {
    await freezeScore(attacker, 0);
    await freezeScore(defender, 0, 2);
    await expect(attack()).resolves.toBeTruthy();
  });

  /**
   * ⭐⭐ **KURALIN EN ÖNEMLİ ŞARTI**: puan DONDURULMUŞ değerden okunuyor. Anlık `players.score`
   * kullanılsaydı oyuncu kime saldırabileceğini ancak deneyerek öğrenirdi ve ekranda gördüğü
   * sayı ile kural ayrışırdı.
   */
  it('anlık puan değişse bile kural DONMUŞ puana bakar', async () => {
    await freezeScore(attacker, 20);
    await freezeScore(defender, 200, 2);
    // Anlık puanları eşitle — kural yine de engellemeli, çünkü sıralama satırı değişmedi.
    await h.db.execute(sql`
      UPDATE players SET score = 100 WHERE id IN (${attacker}, ${defender})
    `);
    await expectBlocked();
  });

  /**
   * ⭐ Sıralama satırı OLMAYAN oyuncu 0 sayılır. Kullanıcının gerekçesi: yeni oyuncu zaten
   * acemi koruması altında ve koruma bitmeden bir sonraki görüntüde listeye giriyor.
   */
  it('sıralama satırı olmayan oyuncu 0 puan sayılır', async () => {
    await freezeScore(defender, 10, 2);        // saldıranın satırı YOK
    await expectBlocked();
  });

  /**
   * ⭐⭐ CASUSLUK MUAF. Kod `sendAttack` gövdesinde; casusluk ortak `march()` üzerinden gidiyor
   * ve bu satırı hiç görmüyor. Ayrı bir istisna YAZILMADI — bu test onun kanıtı.
   */
  it('aynı çiftte CASUSLUK serbest', async () => {
    await freezeScore(attacker, 20);
    await freezeScore(defender, 200, 2);
    await expectBlocked();

    await giveUnits(attackCity, 'spy_bird', 10);
    const at = await clock.gameNow(worldId);
    await expect(missions.sendSpy({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 10 }, at,
    })).resolves.toBeTruthy();
  });

  /** ⚠️ Ayar 0 = kural kapalı; panelden geri alınabilir olmalı. */
  it('ayar 0 iken kural hiç çalışmaz', async () => {
    setLiveSettings({ combat: { attackScoreRatio: 0 } });
    await freezeScore(attacker, 1);
    await freezeScore(defender, 100000, 2);
    await expect(attack()).resolves.toBeTruthy();
    // Temizlik `afterEach`te — test düşerse burası çalışmazdı.
  });

  /** Hata 403 döner — "istek bozuk" (400) değil, "bu iki oyuncu eşleşemez". */
  it('HTTP karşılığı 403', async () => {
    await freezeScore(attacker, 20);
    await freezeScore(defender, 200, 2);
    const err = await attack().catch((e: unknown) => e);
    expect(missionErrorToHttp(err).constructor.name).toBe('ForbiddenException');
  });

  /* ── Seçenek listesi: kural ORDU SEÇİLMEDEN ÖNCE görünmeli (kullanıcı, 2026-08-08) ──────── */

  /**
   * ⭐⭐ Kullanıcı: *"kullanıcı tüm bunları ordusunu seçtikten sonra öğreniyor ve zaman kaybı
   * yaşıyor."* Kural yalnız `sendAttack` kapısındaydı; artık `GET /missions/options` de
   * bildiriyor.
   *
   * ⚠️ Aşağıdaki testlerin ASIL ölçtüğü şey tek tek bayraklar değil, **kapı ile önizlemenin
   * aynı cevabı vermesi**. İki taraf ayrı hesaplasaydı ayrışma kaçınılmazdı ve ortaya çıkan
   * tablo — açık görünen düğmenin reddedilmesi — tam olarak düzeltilmek istenen şikâyet olurdu.
   */
  const optionsFor = async (): Promise<{
    type: string; enabled: boolean; reason: string | null;
  }[]> => {
    const controller = new MissionController(missions, clock, h.db);
    const res = await controller.options(
      String(attackCity), '1', '1', '2',
      { player: { playerId: attacker, worldId } } as never,
    );
    return res['options'] as { type: string; enabled: boolean; reason: string | null }[];
  };
  const optionOf = async (type: string): ReturnType<typeof optionsFor> extends Promise<infer T>
    ? Promise<T extends (infer E)[] ? E | undefined : never> : never => {
    return (await optionsFor()).find((o) => o.type === type) as never;
  };

  it('⭐ 10 kat farkta SALDIRI seçeneği PASİF ve sebebi yazılı', async () => {
    await freezeScore(attacker, 20);
    await freezeScore(defender, 200, 2);

    const attackOpt = await optionOf('attack');
    expect(attackOpt?.enabled).toBe(false);
    expect(attackOpt?.reason).toContain('10 kat');
  });

  /** ⭐ Casusluk muafiyeti listede de görünmeli — yoksa oyuncu ikisini tek yasak sanır. */
  it('⭐ aynı çiftte CASUSLUK seçeneği AÇIK kalır', async () => {
    await freezeScore(attacker, 20);
    await freezeScore(defender, 200, 2);

    expect((await optionOf('spy'))?.enabled).toBe(true);
    expect((await optionOf('transport'))?.enabled).toBe(true);
  });

  it('sınırın altında saldırı seçeneği AÇIK (20 → 199)', async () => {
    await freezeScore(attacker, 20);
    await freezeScore(defender, 199, 2);
    expect((await optionOf('attack'))?.enabled).toBe(true);
  });

  /**
   * ⭐⭐ ASIL BEKÇİ: liste ile gönderim kapısı **hiçbir puan çiftinde ayrışmamalı**. Tek tek
   * eşik testleri yazmak yerine kullanıcının kendi örneklerini ve sınır komşularını tarayıp
   * iki tarafın kararını KARŞILAŞTIRIYORUZ — biri değişip diğeri kalırsa test düşer.
   */
  it('⭐⭐ liste ile gönderim kapısı HİÇBİR puan çiftinde ayrışmaz', async () => {
    const ciftler: [number, number][] = [
      [20, 200], [20, 199], [20, 2], [200, 20], [0, 10], [0, 9], [0, 0], [1, 10], [100, 1000],
    ];
    for (const [a, d] of ciftler) {
      /**
       * ⚠️⚠️ **HER ÇİFTTEN ÖNCE TEMİZLİK ŞART, ve bunu ilk yazımda atladım.** Döngü başarılı
       * saldırıları gerçekten gönderiyor; birkaç tur sonra 24 saatlik saldırı limiti ve Baraka
       * sefer limiti doluyor, kapı artık `score_gap` yerine BAŞKA bir sebeple reddediyor ve
       * ölçüm anlamını yitiriyor. Test tam olarak bu yüzden düştü (1 ↔ 10 çiftinde).
       */
      await h.db.execute(sql`DELETE FROM missions WHERE owner_player_id = ${attacker}`);
      await freezeScore(attacker, a);
      await freezeScore(defender, d, 2);

      /**
       * ⚠️ Ölçüt "izin verildi mi" DEĞİL, **"10 kat kuralı devrede mi"**. İlk yazımda
       * `score_gap` dışındaki her hatayı "izin verildi" saymıştım; o ölçüt, kapının başka bir
       * sebeple reddettiği durumu sessizce "açık" diye okuyor ve karşılaştırmayı bozuyor.
       * Karşılaştırılması gereken şey iki tarafın AYNI KURAL hakkındaki kararı.
       */
      const listeKapali = await optionOf('attack').then((o) =>
        o?.enabled === false && (o.reason ?? '').includes('10 kat'));
      const kapiKapali = await attack().then(() => false, (e: unknown) =>
        (e as { code?: string }).code === 'score_gap');

      expect(listeKapali, `puanlar ${a} ↔ ${d}: liste ve kapı ayrıştı`).toBe(kapiKapali);
    }
  }, 60_000);

  /** Ayar kapatılınca liste de açılmalı — iki taraf aynı ayarı okuyor mu? */
  it('ayar 0 iken listede de saldırı AÇIK', async () => {
    setLiveSettings({ combat: { attackScoreRatio: 0 } });
    await freezeScore(attacker, 1);
    await freezeScore(defender, 100_000, 2);
    expect((await optionOf('attack'))?.enabled).toBe(true);
  });

  /**
   * ⚠️ Acemi koruması 10 kat kuralından ÖNCE gelir: ikisi de geçerliyken oyuncuya daha temel
   * olan sebep gösterilmeli, yoksa koruma bitince "hâlâ neden saldıramıyorum" sorusu doğar.
   */
  it('koruma ve puan farkı birlikteyken KORUMA sebebi yazılır', async () => {
    await freezeScore(attacker, 20);
    await freezeScore(defender, 200, 2);
    await h.db.execute(sql`
      UPDATE players SET protected_until = now() + interval '10 hours' WHERE id = ${defender}
    `);
    const opt = await optionOf('attack');
    expect(opt?.enabled).toBe(false);
    expect(opt?.reason).toContain('acemi koruması');
  });
});
