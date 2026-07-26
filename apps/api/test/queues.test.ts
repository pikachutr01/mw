/**
 * ⭐ FAZ 2 — üretim/ilerletme kuyruğu testleri.
 *
 * Kritik olan: kuyruk satırı ile bitiş görevi AYNI transaction'da yazılıyor, bitiş Faz 1
 * omurgasından geçiyor ve kurallar (ön-şart · tavan · Kale bütçesi · Sur kapasitesi) uygulanıyor.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildingCost, defenseCapacity, UNITS_BY_ID } from '@mobiwar/catalog';
import { AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CapacityService } from '../src/cities/capacity.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { echoHandler } from '../src/missions/echo.handler.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import { QUEUE_HANDLERS } from '../src/queues/queue.handlers.ts';
import { QueueError, QueueService } from '../src/queues/queue.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;
let cities: CityService;
let queues: QueueService;
let auth: AuthService;
let registry: HandlerRegistry;

let playerId: number;
let cityId: number;

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  queues = new QueueService(h.db, cities);
  auth = new AuthService(h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock);
  registry = new HandlerRegistry().register('echo', echoHandler);
  for (const [type, handler] of Object.entries(QUEUE_HANDLERS)) registry.register(type, handler);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  const t = randomUUID().slice(0, 8);
  const r = await auth.register({
    email: `q-${t}@test.local`, password: 'parola-12345', username: `q_${t}`, worldId,
  }, { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' });
  playerId = r.playerId;
  const rows = await h.db.execute<{ id: number } & Record<string, unknown>>(sql`
    SELECT id FROM cities WHERE player_id = ${playerId}
  `);
  cityId = Number(rows[0]!.id);
});

const scheduler = (): SchedulerService =>
  new SchedulerService(h.db, clock, registry, { worldId, retryBackoffMs: 0 });

/** Kaynak/yapı/teknik durumunu doğrudan ayarlar (kurulum kısayolu). */
async function setLevel(type: string, level: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO buildings (city_id, type, level) VALUES (${cityId}, ${type}, ${level})
    ON CONFLICT (city_id, type) DO UPDATE SET level = ${level}
  `);
}
async function setTech(type: string, level: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO techs (player_id, type, level) VALUES (${playerId}, ${type}, ${level})
    ON CONFLICT (player_id, type) DO UPDATE SET level = ${level}
  `);
}
async function giveResources(gold: number, food: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE cities SET gold = ${gold}::numeric, food = ${food}::numeric WHERE id = ${cityId}
  `);
}
async function buildings(): Promise<Record<string, number>> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT type, level FROM buildings WHERE city_id = ${cityId}
  `);
  return Object.fromEntries(rows.map((r) => [String(r['type']), Number(r['level'])]));
}
async function unitCounts(): Promise<Record<string, number>> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT type, count FROM units WHERE city_id = ${cityId}
  `);
  return Object.fromEntries(rows.map((r) => [String(r['type']), Number(r['count'])]));
}

describe('yapı yükseltme', () => {
  it('kuyruk açılır, kaynak düşer, bitiş görevi yazılır', async () => {
    const at = await clock.gameNow(worldId);
    const cost = buildingCost('farm', 2);

    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });

    expect(q.category).toBe('building');
    expect(q.targetLevel).toBe(2);
    expect(q.finishAt.getTime()).toBeGreaterThan(at.getTime());

    const snap = await cities.snapshot(cityId, at);
    expect(snap!.gold).toBe(4000 - cost.gold);

    // Kuyruk ile görev AYNI transaction'da yazıldı.
    const m = await h.db.execute<Record<string, unknown>>(sql`
      SELECT type, idempotency_key FROM missions WHERE world_id = ${worldId} AND type = 'building_finish'
    `);
    expect(m).toHaveLength(1);
    expect(String(m[0]!['idempotency_key'])).toBe(`queue:${q.id}`);
  });

  it('görev vadesi gelince seviye ARTAR ve kuyruk kapanır', async () => {
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });

    // Görevi vadesine getir (oyun saatini beklemek yerine vadeyi geriye alıyoruz).
    await h.db.execute(sql`
      UPDATE missions SET execute_at = now() - interval '1 second' WHERE id IN
        (SELECT mission_id FROM queues WHERE id = ${q.id})
    `);
    const r = await scheduler().tick();

    expect(r.done).toBe(1);
    expect((await buildings())['farm']).toBe(2);
    expect(await queues.openQueues(cityId)).toHaveLength(0);
  });

  it('aynı kategoride ikinci iş reddedilir', async () => {
    const at = await clock.gameNow(worldId);
    await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    await expect(queues.enqueueBuilding({ cityId, playerId, type: 'mine', at }))
      .rejects.toThrow(/zaten sürüyor/);
  });

  it('kaynak yetmezse kuyruk AÇILMAZ ve kaynak değişmez', async () => {
    await giveResources(10, 10);
    const at = await clock.gameNow(worldId);

    // Çiftlik'in ön-şartı yok → doğrudan kaynak kontrolüne düşer (Çiftlik 2 = 174 altın).
    await expect(queues.enqueueBuilding({ cityId, playerId, type: 'farm', at }))
      .rejects.toThrow(/Kaynak yetersiz/);

    const snap = await cities.snapshot(cityId, at);
    expect(snap!.gold).toBe(10);
    expect(await queues.openQueues(cityId)).toHaveLength(0);
  });

  it('ön-şart karşılanmazsa reddedilir ve EKSİKLERİN TAMAMI bildirilir', async () => {
    await giveResources(10_000_000, 10_000_000);
    const at = await clock.gameNow(worldId);
    // Teleport → Mimar Okulu 10 gerekiyor (şu an 0)
    const err = await queues.enqueueBuilding({ cityId, playerId, type: 'teleport', at })
      .catch((e: unknown) => e as QueueError);
    expect(err).toBeInstanceOf(QueueError);
    expect((err as QueueError).code).toBe('requirements_unmet');
    expect((err as QueueError).message).toMatch(/architect_school 10/);
  });

  it('seviye tavanı aşılamaz (Çiftlik 40)', async () => {
    await giveResources(1e12, 1e12);
    await setLevel('farm', 40);
    const at = await clock.gameNow(worldId);
    await expect(queues.enqueueBuilding({ cityId, playerId, type: 'farm', at }))
      .rejects.toThrow(/en fazla 40/);
  });

  it('⭐ KALE BÜTÇESİ aşılamaz: Σ(bina seviyeleri) ≤ Kale × 10', async () => {
    await giveResources(1e12, 1e12);
    // Kale 1 → bütçe 10. Çiftlik 8 + Maden 1 + Baraka 1 = 10 → dolu.
    await setLevel('farm', 8);
    const at = await clock.gameNow(worldId);

    const err = await queues.enqueueBuilding({ cityId, playerId, type: 'mine', at })
      .catch((e: unknown) => e as QueueError);
    expect((err as QueueError).code).toBe('castle_budget_full');

    // Kale 2 → bütçe 20 → artık sığar.
    await setLevel('castle', 2);
    await expect(queues.enqueueBuilding({ cityId, playerId, type: 'mine', at })).resolves.toBeTruthy();
  });

  it('Kale, Sur ve Büyü Kalkanı bütçeye GİRMEZ (§13.11.1)', () => {
    const cap = new CapacityService();
    const b = cap.buildingBudget({ castle: 5, farm: 10, mine: 10, wall: 20, magic_shield: 20 });
    expect(b.total).toBe(50);
    expect(b.used).toBe(20);     // yalnız çiftlik + maden
  });
});

describe('savaşçı üretimi', () => {
  it('ön-şart sağlanınca kuyruk açılır ve bitişte barakaya eklenir', async () => {
    await setTech('blacksmithing', 1);
    const at = await clock.gameNow(worldId);

    const q = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 5, at });
    expect(q.count).toBe(5);
    // Model A: Cüce 9 sn × 5 = 45 sn (Baraka 1)
    expect((q.finishAt.getTime() - at.getTime()) / 1000).toBeCloseTo(45, 0);

    await h.db.execute(sql`
      UPDATE missions SET execute_at = now() - interval '1 second'
       WHERE id IN (SELECT mission_id FROM queues WHERE id = ${q.id})
    `);
    await scheduler().tick();

    expect((await unitCounts())['dwarf']).toBe(5);
  });

  it('teknik ön-şartı olmayan birim üretilemez', async () => {
    const at = await clock.gameNow(worldId);
    // Cüce → Demircilik 1 gerekiyor (şu an 0)
    await expect(queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 1, at }))
      .rejects.toThrow(/blacksmithing 1/);
  });

  it('Baraka ön-şartı olmayan birim üretilemez', async () => {
    await giveResources(1e12, 1e12);
    await setTech('sorcery', 20);
    const at = await clock.gameNow(worldId);
    // Kaos → Baraka 15 gerekiyor (şu an 1)
    await expect(queues.enqueueUnits({ cityId, playerId, type: 'chaos', count: 1, at }))
      .rejects.toThrow(/barracks 15/);
  });

  it('geçersiz adet reddedilir', async () => {
    await setTech('blacksmithing', 1);
    const at = await clock.gameNow(worldId);
    await expect(queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 0, at })).rejects.toThrow();
    await expect(queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: -3, at })).rejects.toThrow();
  });

  it('üretim adetle ölçeklenen kaynak harcar', async () => {
    await setTech('blacksmithing', 1);
    const at = await clock.gameNow(worldId);
    const def = UNITS_BY_ID['dwarf']!;

    await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 5, at });

    const snap = await cities.snapshot(cityId, at);
    expect(snap!.gold).toBe(4000 - def.gold * 5);
    expect(snap!.food).toBe(4000 - def.food * 5);
  });
});

describe('savunma birimi üretimi', () => {
  it('⭐ SUR KAPASİTESİ aşılamaz (25.000 × 1,30^(Sur−1))', async () => {
    await giveResources(1e12, 1e12);
    await setTech('archery', 1);
    await h.db.execute(sql`
      INSERT INTO defenses (city_id, type, count) VALUES (${cityId}, 'wall', 1)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 1
    `);
    await setLevel('wall', 1);   // ön-şart kontrolü buildings'ten okuyor
    const at = await clock.gameNow(worldId);

    const area = UNITS_BY_ID['archer_tower']!.area;      // 24
    const cap = defenseCapacity(1);                       // 25.000
    const sigar = Math.floor(cap / area);                 // 1.041

    await expect(queues.enqueueDefense({
      cityId, playerId, type: 'archer_tower', count: sigar + 100, at,
    })).rejects.toThrow(/kapasitesi yetmiyor/);

    await expect(queues.enqueueDefense({
      cityId, playerId, type: 'archer_tower', count: sigar, at,
    })).resolves.toBeTruthy();
  });

  it('Sur SEVİYE olarak ilerler (adet değil)', async () => {
    await giveResources(1e12, 1e12);
    const at = await clock.gameNow(worldId);

    const q = await queues.enqueueDefense({ cityId, playerId, type: 'wall', count: 1, at });
    expect(q.targetLevel).toBe(1);
    expect(q.count).toBeNull();

    await h.db.execute(sql`
      UPDATE missions SET execute_at = now() - interval '1 second'
       WHERE id IN (SELECT mission_id FROM queues WHERE id = ${q.id})
    `);
    await scheduler().tick();

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT count FROM defenses WHERE city_id = ${cityId} AND type = 'wall'
    `);
    expect(Number(rows[0]!['count'])).toBe(1);
  });
});

describe('teknik araştırma', () => {
  it('bitişte teknik seviyesi oyuncuda artar (şehirde değil)', async () => {
    await giveResources(1e9, 1e9);
    await setLevel('academy', 1);
    const at = await clock.gameNow(worldId);

    const q = await queues.enqueueTech({ cityId, playerId, type: 'blacksmithing', at });
    await h.db.execute(sql`
      UPDATE missions SET execute_at = now() - interval '1 second'
       WHERE id IN (SELECT mission_id FROM queues WHERE id = ${q.id})
    `);
    await scheduler().tick();

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT level FROM techs WHERE player_id = ${playerId} AND type = 'blacksmithing'
    `);
    expect(Number(rows[0]!['level'])).toBe(1);
  });

  it('Akademi ön-şartı olmayan teknik araştırılamaz', async () => {
    await giveResources(1e12, 1e12);
    const at = await clock.gameNow(worldId);
    // İçgüdü → Akademi 10 gerekiyor (şu an 0)
    await expect(queues.enqueueTech({ cityId, playerId, type: 'instinct', at }))
      .rejects.toThrow(/academy 10/);
  });

  it('⭐ AYNI TEKNİK iki şehirde aynı anda araştırılamaz (§13.11.5)', async () => {
    await giveResources(1e9, 1e9);
    await setLevel('academy', 1);
    const at = await clock.gameNow(worldId);
    await queues.enqueueTech({ cityId, playerId, type: 'blacksmithing', at });

    // Aynı oyuncunun ikinci şehri
    const city2 = await cities.create({
      worldId, playerId, name: 'ikinci', k: 5, d: 5, s: 5, isCapital: false, at,
    });
    await h.db.execute(sql`
      INSERT INTO buildings (city_id, type, level) VALUES (${city2}, 'academy', 1)
      ON CONFLICT (city_id, type) DO UPDATE SET level = 1
    `);
    await h.db.execute(sql`UPDATE cities SET gold = 1e9, food = 1e9 WHERE id = ${city2}`);

    await expect(queues.enqueueTech({ cityId: city2, playerId, type: 'blacksmithing', at }))
      .rejects.toThrow(/başka bir şehirde araştırılıyor/);

    // FARKLI teknik ikinci şehirde serbest.
    await expect(queues.enqueueTech({ cityId: city2, playerId, type: 'armor', at }))
      .resolves.toBeTruthy();
  });
});

describe('sahiplik ve idempotency', () => {
  it('başkasının şehrine kuyruk açılamaz', async () => {
    const at = await clock.gameNow(worldId);
    await expect(queues.enqueueBuilding({ cityId, playerId: playerId + 999, type: 'farm', at }))
      .rejects.toThrow(/sizin değil/);
  });

  it('⭐ aynı kuyruk İKİ KEZ uygulanamaz (completed_at koruması)', async () => {
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    const missionRows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT mission_id FROM queues WHERE id = ${q.id}
    `);
    const missionId = Number(missionRows[0]!['mission_id']);

    await h.db.execute(sql`UPDATE missions SET execute_at = now() - interval '1 s' WHERE id = ${missionId}`);
    await scheduler().tick();
    expect((await buildings())['farm']).toBe(2);

    // Görevi elle yeniden kuyruğa alıp bir daha çalıştır: seviye ARTMAMALI.
    await h.db.execute(sql`
      UPDATE missions SET status = 'scheduled', execute_at = now() - interval '1 s', finished_at = NULL
       WHERE id = ${missionId}
    `);
    await scheduler().tick();
    expect((await buildings())['farm']).toBe(2);
  });
});

describe('⭐ kuyruk iptali (orijinalde "Yapımı Durdur" / "İlerletmeyi Durdur")', () => {
  it('iptal kuyruğu VE görevi kapatır, kaynağı kısmen iade eder', async () => {
    const at = await clock.gameNow(worldId);
    const cost = buildingCost('farm', 2);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });

    const { refunded } = await queues.cancel({ queueId: q.id, playerId, at });

    // Varsayılan %90 iade (kuyruğu yağma-korumalı kasa yapmasın diye %10 kesinti).
    expect(refunded.gold).toBe(Math.floor(cost.gold * 0.9));
    expect(await queues.openQueues(cityId)).toHaveLength(0);

    const m = await h.db.execute<Record<string, unknown>>(sql`
      SELECT status FROM missions WHERE id IN (SELECT mission_id FROM queues WHERE id = ${q.id})
    `);
    expect(String(m[0]!['status'])).toBe('canceled');

    const snap = await cities.snapshot(cityId, at);
    expect(snap!.gold).toBe(4000 - cost.gold + Math.floor(cost.gold * 0.9));
  });

  it('iptal sonrası aynı kategoride yeni iş açılabilir', async () => {
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    await queues.cancel({ queueId: q.id, playerId, at });
    await expect(queues.enqueueBuilding({ cityId, playerId, type: 'mine', at })).resolves.toBeTruthy();
  });

  it('⭐ iptal edilen kuyruk, görevi bir şekilde çalışsa bile UYGULANMAZ', async () => {
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    const mRows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT mission_id FROM queues WHERE id = ${q.id}
    `);
    const missionId = Number(mRows[0]!['mission_id']);

    await queues.cancel({ queueId: q.id, playerId, at });

    // Görevi zorla yeniden kuyruğa al ve çalıştır: seviye ARTMAMALI.
    await h.db.execute(sql`
      UPDATE missions SET status = 'scheduled', execute_at = now() - interval '1 s', finished_at = NULL
       WHERE id = ${missionId}
    `);
    await scheduler().tick();
    expect((await buildings())['farm']).toBe(1);
  });

  it('tam iade istenirse oran 1.0 verilir', async () => {
    const at = await clock.gameNow(worldId);
    const cost = buildingCost('farm', 2);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    const { refunded } = await queues.cancel({ queueId: q.id, playerId, at, refundRatio: 1 });
    expect(refunded.gold).toBe(cost.gold);
  });

  it('başkasının kuyruğu iptal edilemez', async () => {
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    await expect(queues.cancel({ queueId: q.id, playerId: playerId + 999, at }))
      .rejects.toThrow(/sizin değil/);
  });

  it('aynı kuyruk iki kez iptal edilemez', async () => {
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    await queues.cancel({ queueId: q.id, playerId, at });
    await expect(queues.cancel({ queueId: q.id, playerId, at })).rejects.toThrow(/bulunamadı/);
  });

  it('teknik iptali de çalışır (İlerletmeyi Durdur)', async () => {
    await giveResources(1e9, 1e9);
    await setLevel('academy', 1);
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueTech({ cityId, playerId, type: 'blacksmithing', at });

    await queues.cancel({ queueId: q.id, playerId, at });

    // İptal sonrası aynı teknik başka şehirde araştırılabilir olmalı (kilit kalkmış).
    expect(await queues.openQueues(cityId)).toHaveLength(0);
    await expect(queues.enqueueTech({ cityId, playerId, type: 'blacksmithing', at })).resolves.toBeTruthy();
  });
});
