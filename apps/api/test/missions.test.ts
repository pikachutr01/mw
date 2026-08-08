/**
 * ⭐ SAVAŞ DIŞI GÖREV TİPLERİ — nakliye · destek · casusluk · şehir kurma · teleport.
 *
 * Ölçütü oyunun kendi dokümanı (`teknik_ve_yapi_dokumantasyonu.md` → NAKLİYE · DESTEK ·
 * CASUSLUK · ŞEHİR KURMA · TELEPORT). Gerçek Postgres kullanılıyor: koşullu UPDATE ile birlik
 * rezervasyonu, advisory lock ve transaction geri alma taklit edilemez.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { maxCities, spyEffectiveDiff, spyLevelFor, teleportCooldownSeconds } from '@mobilwar/catalog';
import { travelSeconds } from '@mobilwar/engine';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { battleHandlers } from '../src/missions/battle.handlers.ts';
import { missionHandlers } from '../src/missions/mission.handlers.ts';
import { MissionController } from '../src/missions/mission.controller.ts';
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

let me: number;
let rival: number;
let home: number;      // benim başkentim   1:1:1
let colony: number;    // benim 2. şehrim   1:1:3
let enemy: number;     // rakibin şehri     1:1:2

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  missions = new MissionService(h.db, cities);
  registry = new HandlerRegistry();
  for (const [type, handler] of Object.entries(missionHandlers(cities))) registry.register(type, handler);
  // `return` handler'ı savaş modülünde yaşıyor — dönüş testleri için o da kayıtlı olmalı.
  registry.register('return', battleHandlers(cities)['return']!);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  me = await createPlayer(h, worldId, 'me');
  rival = await createPlayer(h, worldId, 'rival');
  const at = await clock.gameNow(worldId);

  home = await cities.create({ worldId, playerId: me, name: 'ev', k: 1, d: 1, s: 1, isCapital: true, at });
  enemy = await cities.create({ worldId, playerId: rival, name: 'dusman', k: 1, d: 1, s: 2, isCapital: true, at });
  colony = await cities.create({ worldId, playerId: me, name: 'koloni', k: 1, d: 1, s: 3, isCapital: false, at });

  await h.db.execute(sql`UPDATE players SET protected_until = NULL WHERE world_id = ${worldId}`);
  await setBuilding(home, 'barracks', 10);      // sefer limiti testlerin önüne çıkmasın
  await setBuilding(colony, 'barracks', 10);
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
/** Mağaranın İÇİNE asker koyar — `units` değil `cave_units` tablosu (casus göremez). */
async function putInCave(cityId: number, type: string, count: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO cave_units (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
    ON CONFLICT (city_id, type) DO UPDATE SET count = ${count}
  `);
}
async function giveDefenses(cityId: number, type: string, count: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO defenses (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
    ON CONFLICT (city_id, type) DO UPDATE SET count = ${count}
  `);
}
/**
 * Kahraman ekler. `cityId: null` → SEFERDE (kayıtta şehir bağı kopuk) — casus onu göremez,
 * çünkü `gatherIntel` `WHERE city_id = ?` ile arıyor.
 */
async function giveHero(playerId: number, cityId: number | null, o: {
  name: string; level?: number;
  fAtk?: number; fDef?: number; mAtk?: number; mDef?: number;
  status?: string;
}): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO heroes (world_id, player_id, city_id, name, level, f_atk, f_def, m_atk, m_def, status)
    VALUES (${worldId}, ${playerId}, ${cityId}, ${o.name}, ${o.level ?? 0},
            ${o.fAtk ?? 0}, ${o.fDef ?? 0}, ${o.mAtk ?? 0}, ${o.mDef ?? 0}, ${o.status ?? 'alive'})
  `);
}
async function setTech(playerId: number, type: string, level: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO techs (player_id, type, level) VALUES (${playerId}, ${type}, ${level})
    ON CONFLICT (player_id, type) DO UPDATE SET level = ${level}
  `);
}
async function setResources(cityId: number, gold: number, food: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE cities SET gold = ${gold}::numeric, food = ${food}::numeric, resources_at = now()
     WHERE id = ${cityId}
  `);
}
async function unitsOf(cityId: number): Promise<Record<string, number>> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT type, count FROM units WHERE city_id = ${cityId}
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
    SELECT kind, side, subject, body FROM messages WHERE player_id = ${playerId} ORDER BY id
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
async function openReturn(): Promise<{ id: number; payload: Record<string, unknown> } | null> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT id, payload FROM missions
     WHERE world_id = ${worldId} AND type = 'return' AND status = 'scheduled'
     ORDER BY id DESC LIMIT 1
  `);
  return rows[0] ? { id: Number(rows[0]['id']), payload: rows[0]['payload'] as Record<string, unknown> } : null;
}

/* ═══ NAKLİYE ══════════════════════════════════════════════════════════════ */

describe('nakliye', () => {
  it('⭐ kaynak YOLA ÇIKARKEN düşer, VARIŞTA teslim edilir, ordu BOŞ döner', async () => {
    await giveUnits(home, 'cargo_wagon', 3);          // 3 × 5.000 = 15.000 kapasite
    await setResources(home, 10_000, 0);
    await setResources(enemy, 0, 0);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendTransport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { cargo_wagon: 3 },
      cargo: { gold: 8000, food: 0 }, at,
    });

    // Kaynak ve arabalar ANINDA düştü.
    expect((await resourcesOf(home)).gold).toBeLessThan(2100);
    expect((await unitsOf(home))['cargo_wagon']).toBe(0);
    expect((await resourcesOf(enemy)).gold).toBe(0);   // henüz varmadı

    await runDue(m.missionId);
    expect((await resourcesOf(enemy)).gold).toBeCloseTo(8000, 0);

    // Ordu boş dönüyor: dönüş görevinde kargo YOK.
    const ret = await openReturn();
    expect(ret).not.toBeNull();
    expect(ret!.payload['loot']).toEqual({ gold: 0, food: 0 });
    expect(ret!.payload['returnOf']).toBe('transport');

    /* ⭐ BİRLEŞİK GÖREV BİTİŞİ (2026-07-30): varış anında scheduler `mission:completed`
     * outbox'ı yazar — gönderenin Ordular listesi eskiden hiç tetiklenmiyordu, WS'i bu
     * olay sürer; ileride push sink'i de buradan beslenecek. */
    const [done] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT payload FROM outbox
       WHERE world_id = ${worldId} AND topic = 'mission:completed'
         AND (payload->>'missionId')::bigint = ${m.missionId}
    `);
    expect(done).toBeDefined();
    const p = done!['payload'] as Record<string, unknown>;
    expect(p['type']).toBe('transport');
    expect(Number(p['ownerPlayerId'])).toBe(me);
    expect(Number(p['targetPlayerId'])).toBe(rival);

    /* ⭐ GÖNDEREN RAPORU (2026-07-30): "Giden Nakliye Raporu" — alıcı farklı oyuncuysa yazılır. */
    const gonderen = (await messagesOf(me))
      .find((x) => x['kind'] === 'transport_report' && x['side'] === 'sender');
    expect(gonderen).toBeDefined();
    expect((gonderen!['body'] as Record<string, unknown>)['cargo']).toEqual({ gold: 8000, food: 0 });

    /* ⭐ DÖNÜŞ RAPOR ÜRETMEZ (kullanıcı, 2026-07-30): ordu eve varınca posta DÜŞMEZ —
     * yalnız mission:completed bildirimi. */
    await runDue(ret!.id);
    const donus = (await messagesOf(me)).find((x) => x['kind'] === 'return_report');
    expect(donus).toBeUndefined();
    // Birlikler yine de eve yerleşti (rapor kalktı, mekanik kalmadı değil).
    expect((await unitsOf(home))['cargo_wagon']).toBe(3);
  });

  it('taşıma kapasitesi aşılamaz', async () => {
    await giveUnits(home, 'dwarf', 5);                // 5 × 10 = 50 kapasite
    await setResources(home, 100_000, 100_000);
    const at = await clock.gameNow(worldId);
    await expect(missions.sendTransport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 5 },
      cargo: { gold: 1000, food: 0 }, at,
    })).rejects.toThrow(/taşıma kapasitesi/i);
  });

  it('kaynak yetmezse görev açılmaz ve birlikler şehirde kalır', async () => {
    await giveUnits(home, 'cargo_wagon', 1);
    await setResources(home, 10, 10);
    const at = await clock.gameNow(worldId);
    await expect(missions.sendTransport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { cargo_wagon: 1 },
      cargo: { gold: 5000, food: 0 }, at,
    })).rejects.toThrow(MissionError);
    expect((await unitsOf(home))['cargo_wagon']).toBe(1);
  });
});

/* ═══ DESTEK ═══════════════════════════════════════════════════════════════ */

describe('destek', () => {
  it('⭐ TEK YÖNLÜ: birlikler hedefe yerleşir, dönüş görevi YOK', async () => {
    await giveUnits(home, 'dwarf', 40);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendSupport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 3 }, units: { dwarf: 40 }, at,
    });
    await runDue(m.missionId);

    expect((await unitsOf(colony))['dwarf']).toBe(40);
    expect((await unitsOf(home))['dwarf']).toBe(0);
    expect(await openReturn()).toBeNull();            // ← tek yönlü
  });

  it('orduyla birlikte kaynak da gönderilebilir (doküman)', async () => {
    await giveUnits(home, 'cargo_wagon', 1);
    await setResources(home, 4000, 0);
    await setResources(colony, 0, 0);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendSupport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 3 }, units: { cargo_wagon: 1 },
      cargo: { gold: 3000, food: 0 }, at,
    });
    await runDue(m.missionId);
    expect((await resourcesOf(colony)).gold).toBeCloseTo(3000, 0);
  });

  it('yalnız KENDİ şehrine gönderilir', async () => {
    await giveUnits(home, 'dwarf', 5);
    const at = await clock.gameNow(worldId);
    await expect(missions.sendSupport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 5 }, at,
    })).rejects.toThrow(/kendi şehirlerinize/i);
  });
});

/* ═══ CASUSLUK ═════════════════════════════════════════════════════════════ */

describe('casusluk', () => {
  it('⭐ bilgi kademesi dokümandaki farkla birebir', () => {
    // "8 casus kuş yollarsanız 2^3=8 olduğundan 3 seviye fazla gibi davranır"
    expect(spyEffectiveDiff(0, 8, 0)).toBe(3);
    expect(spyEffectiveDiff(2, 16, 1)).toBe(5);
    expect(spyLevelFor(-1)).toBe('resources');
    expect(spyLevelFor(0)).toBe('economy');
    expect(spyLevelFor(1)).toBe('armyTotals');
    expect(spyLevelFor(2)).toBe('armyTypes');
    expect(spyLevelFor(3)).toBe('armyCounts');
    expect(spyLevelFor(4)).toBe('full');
    expect(spyLevelFor(9)).toBe('full');     // tavan
  });

  it('yüksek farkta TAM rapor gelir (teknikler + Kale/Sur/Mağara)', async () => {
    await giveUnits(home, 'spy_bird', 16);   // log2(16) = +4
    await setTech(me, 'espionage', 5);
    await giveUnits(enemy, 'dwarf', 120);
    await giveDefenses(enemy, 'archer_tower', 7);
    await giveDefenses(enemy, 'wall', 3);
    await setResources(enemy, 5555, 4444);
    await setBuilding(enemy, 'mine', 8);
    await setBuilding(enemy, 'cave', 6);
    await setBuilding(enemy, 'teleport', 2);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 16 }, at,
    });
    await runDue(m.missionId);

    const report = (await messagesOf(me)).find((x) => x['kind'] === 'spy_report');
    expect(report).toBeTruthy();
    const body = report!['body'] as Record<string, unknown>;
    expect(body['level']).toBe('full');
    const intel = body['intel'] as Record<string, unknown>;
    expect((intel['resources'] as Record<string, number>)['gold']).toBe(5555);
    expect((intel['economy'] as Record<string, number>)['mine']).toBe(8);
    expect((intel['warriors'] as Record<string, number>)['dwarf']).toBe(120);
    expect(intel['techs']).toBeTruthy();
    // Sur ADET değil SEVİYE → "toplam savunma" sayısına girmez.
    expect((intel['totals'] as Record<string, number>)['defenses']).toBe(7);
    expect((intel['structures'] as Record<string, number>)['wall']).toBe(3);
    // ⭐ Mağara SEVİYESİ en üst kademede görünür (kullanıcı, 2026-08-02).
    expect((intel['structures'] as Record<string, number>)['cave']).toBe(6);
    // ⭐ Teleport SEVİYESİ de en üst kademede (kullanıcı, 2026-08-07): "bu oyuncu bana ne
    //    kadar hızlı ulaşır" sorusunun cevabı.
    expect((intel['structures'] as Record<string, number>)['teleport']).toBe(2);
  });

  it('⚠️ mağaranın İÇİNDEKİ askerler TAM raporda bile sızmaz', async () => {
    await setBuilding(enemy, 'cave', 6);
    await giveUnits(enemy, 'dwarf', 60);       // meydanda
    await putInCave(enemy, 'dwarf', 40);       // mağarada — görünmemeli
    await giveUnits(home, 'spy_bird', 16);
    await setTech(me, 'espionage', 5);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 16 }, at,
    });
    await runDue(m.missionId);

    const body = (await messagesOf(me)).find((x) => x['kind'] === 'spy_report')!['body'] as Record<string, unknown>;
    const intel = body['intel'] as Record<string, unknown>;
    expect(body['level']).toBe('full');
    // Seviye görünür…
    expect((intel['structures'] as Record<string, number>)['cave']).toBe(6);
    // …ama içerideki 40 cüce raporun HİÇBİR yerinde geçmez: yalnız meydandaki 60 sayılır.
    expect((intel['warriors'] as Record<string, number>)['dwarf']).toBe(60);
    expect(JSON.stringify(intel)).not.toContain('caveUnits');
  });

  /* ── Kahraman istihbaratı (kullanıcı, 2026-08-07) ─────────────────────────────
   *
   * Kademe eşlemesi (`spyEffectiveDiff` = benim + log2(kuş) − onun; ikisi de 0 ⇒ kuş sayısı
   * doğrudan farkı verir): 4 kuş = fark 2 = `armyTypes` · 8 kuş = fark 3 = `armyCounts`.
   * Rakipte kule/elf/kuş olmadığı için engelleme yok, `infoBirds` gönderilenin tamamı.
   */
  async function spyOn(birds: number): Promise<Record<string, unknown>> {
    await giveUnits(home, 'spy_bird', birds);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: birds }, at,
    });
    await runDue(m.missionId);
    return (await messagesOf(me)).find((x) => x['kind'] === 'spy_report')!['body'] as Record<string, unknown>;
  }

  /**
   * ⭐ Kullanıcının şartı: *"Fark 2'de şehirde sadece kahraman olduğunun bilgisi verilsin.
   * Birden fazla ise kaç tane ise o kadar."* Seviye ve yetenek bir üst kademenin ödülü —
   * bu test o çizginin bekçisi.
   */
  it('⭐ fark 2: yalnız kahraman SAYISI sızar, seviye ve yetenek sızmaz', async () => {
    await giveHero(rival, enemy, { name: 'Kayra', level: 9, fAtk: 7 });
    await giveHero(rival, enemy, { name: 'Bora', level: 4 });

    const body = await spyOn(4);
    expect(body['level']).toBe('armyTypes');
    const intel = body['intel'] as Record<string, unknown>;
    expect(intel['heroCount']).toBe(2);
    expect(intel['heroes']).toBeUndefined();
    // Adı ve seviyesi raporun HİÇBİR yerinde geçmemeli.
    expect(JSON.stringify(intel)).not.toContain('Kayra');
  });

  it('⭐ fark 3: her kahramanın seviyesi ve dört yeteneği gelir', async () => {
    await giveHero(rival, enemy, { name: 'Kayra', level: 9, fAtk: 7, fDef: 5, mAtk: 3, mDef: 2 });

    const body = await spyOn(8);
    expect(body['level']).toBe('armyCounts');
    const intel = body['intel'] as Record<string, unknown>;
    expect(intel['heroCount']).toBe(1);
    expect(intel['heroes']).toEqual([
      { name: 'Kayra', level: 9, skills: { fAtk: 7, fDef: 5, mAtk: 3, mDef: 2 } },
    ]);
  });

  /**
   * ⭐ Kullanıcı kararı: ölü/diriltilen kahraman savaşa katılamaz. Rapor doğrudan simülatöre
   * aktarılabildiği için yanlış sayı yanlış savaşa dönüşürdü.
   */
  it('⭐ ölü ve diriltilen kahraman ne sayılır ne listelenir', async () => {
    await giveHero(rival, enemy, { name: 'Diri', level: 5 });
    await giveHero(rival, enemy, { name: 'Olu', level: 12, status: 'dead' });
    await giveHero(rival, enemy, { name: 'Dirilen', level: 8, status: 'reviving' });

    const intel = (await spyOn(8))['intel'] as Record<string, unknown>;
    expect(intel['heroCount']).toBe(1);
    expect(intel['heroes']).toHaveLength(1);
    expect(JSON.stringify(intel)).not.toContain('Olu');
    expect(JSON.stringify(intel)).not.toContain('Dirilen');
  });

  /**
   * ⭐ Seferdeki kahraman kendiliğinden gizli: görevdeyken `heroes.city_id` NULL, sorgu onu
   * hiç görmüyor. Mağaranın orduyu gizlemesiyle aynı sonuç — ayrıca kod yazılmadı.
   */
  it('⭐ seferdeki kahraman (city_id NULL) raporda görünmez', async () => {
    await giveHero(rival, enemy, { name: 'Evde', level: 5 });
    await giveHero(rival, null, { name: 'Yolda', level: 20 });

    const intel = (await spyOn(8))['intel'] as Record<string, unknown>;
    expect(intel['heroCount']).toBe(1);
    expect(JSON.stringify(intel)).not.toContain('Yolda');
  });

  it('fark 1 ve altında kahraman anahtarı HİÇ yok', async () => {
    await giveHero(rival, enemy, { name: 'Kayra', level: 9 });

    const body = await spyOn(2);                 // log2(2) = +1 → armyTotals
    expect(body['level']).toBe('armyTotals');
    const intel = body['intel'] as Record<string, unknown>;
    expect(intel['heroCount']).toBeUndefined();
    expect(intel['heroes']).toBeUndefined();
  });

  it('kahramanı olmayan şehirde sayı SIFIR yazılır (bilgi yokluğuyla karışmasın)', async () => {
    const intel = (await spyOn(4))['intel'] as Record<string, unknown>;
    expect(intel['heroCount']).toBe(0);
  });

  it('düşük farkta YALNIZ kaynak bilgisi gelir', async () => {
    await giveUnits(home, 'spy_bird', 1);    // log2(1) = 0
    await setTech(rival, 'espionage', 4);    // fark = −4
    await setResources(enemy, 777, 888);
    await giveUnits(enemy, 'dwarf', 50);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 1 }, at,
    });
    await runDue(m.missionId);

    const report = (await messagesOf(me)).find((x) => x['kind'] === 'spy_report');
    const intel = (report!['body'] as Record<string, unknown>)['intel'] as Record<string, unknown>;
    expect(intel['resources']).toBeTruthy();
    expect(intel['economy']).toBeUndefined();
    expect(intel['warriors']).toBeUndefined();
  });

  it('⭐ savunanda Elf/Okçu Kulesi YOKSA kuş vurulmaz', async () => {
    await giveUnits(home, 'spy_bird', 10);
    await setTech(rival, 'espionage', 20);   // fark çok düşük ama vuracak birim yok
    const at = await clock.gameNow(worldId);
    const m = await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 10 }, at,
    });
    await runDue(m.missionId);

    const body = (await messagesOf(me)).find((x) => x['kind'] === 'spy_report')!['body'] as Record<string, unknown>;
    expect(body['birdsLost']).toBe(0);
    const ret = await openReturn();
    expect(ret).not.toBeNull();
    expect(ret!.payload['returnOf']).toBe('spy');
  });

  /**
   * ⭐ Casus seferinin GÖREV TİPİNE özel bir sabiti YOK (kullanıcı kararı, 2026-08-03) —
   * farkını yalnız Casus Kuş'un 6000 hızından alır.
   *
   * ⚠️ 2026-07-30'dan bu tarihe kadar motora `spy: true` geçiriliyor ve kuş ayrı bir tabanla
   * (120 sn) uçuyordu. O sabit, katalogdaki hız sütununu anlamsızlaştırıyordu: 60 kat hızlı
   * kuş komşu şehre 2 dk 10 sn'de, ordu 20 dk'da gidiyordu — yani 60 kat fark 9 kata iniyordu.
   * Artık oran hızın kendisi: **tam 1/60**.
   */
  it('casus seferi süresini yalnız KUŞUN HIZINDAN alır (tipe özel taban yok)', async () => {
    await giveUnits(home, 'spy_bird', 3);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 3 }, at,
    });

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT payload FROM missions WHERE id = ${m.missionId}
    `);
    const seconds = Number((rows[0]!['payload'] as Record<string, unknown>)['travelSeconds']);
    const beklenen = travelSeconds({ distance: 1, speed: 6000, cartography: 0, speedMultiplier: 1 });
    expect(seconds).toBe(beklenen);

    // ⭐ Aynı rotada hızı 100 olan bir ordu tam 60 katı sürer.
    const ordu = travelSeconds({ distance: 1, speed: 100, cartography: 0, speedMultiplier: 1 });
    expect(ordu / seconds).toBeCloseTo(60, 0);
  });

  it('yalnız Casus Kuş gönderilir', async () => {
    await giveUnits(home, 'dwarf', 5);
    await giveUnits(home, 'spy_bird', 5);
    const at = await clock.gameNow(worldId);
    await expect(missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 5, dwarf: 5 }, at,
    })).rejects.toThrow(/yalnız Casus Kuş/i);
  });

  /**
   * ⭐ KESİŞİM MODELİ (kullanıcı tasarımı, 2026-07-30): rakip kuşlar VURMAZ, ENGELLER.
   * Eşit casuslukta rakipte gönderilen kadar kuş varsa hiçbir bilgi sızmaz — ve kimse ölmez.
   */
  it('⭐ TAM BLOK: rakipte eşit sayıda casus kuş → bilgi yok, ölü yok, kuşlar döner', async () => {
    await giveUnits(home, 'spy_bird', 50);
    await giveUnits(enemy, 'spy_bird', 50);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 50 }, at,
    });
    await runDue(m.missionId);

    const gonderen = (await messagesOf(me)).find((x) => x['kind'] === 'spy_report')!['body'] as Record<string, unknown>;
    expect(gonderen['level']).toBeNull();              // bilgi SIZMADI
    expect(gonderen['intel']).toBeNull();
    expect(gonderen['birdsLost']).toBe(0);             // kuş kuşu vurmaz
    expect(gonderen['birdsBlocked']).toBe(50);

    const ret = await openReturn();
    expect(ret).not.toBeNull();                        // engellenen kuşlar eve döner
    const [mu] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT count FROM mission_units WHERE mission_id = ${ret!.id} AND unit_type = 'spy_bird'
    `);
    expect(Number(mu!['count'])).toBe(50);
  });

  it('⭐ kule kapasitesi: eşiğin altı TAMAMEN vurulur, üstü sızar (256/300 mantığı)', async () => {
    await giveDefenses(enemy, 'archer_tower', 30);     // eşit casuslukta K_vur = 30
    await giveUnits(home, 'spy_bird', 61);
    const at = await clock.gameNow(worldId);

    // 30 kuş → hepsi vurulur, dönüş görevi bile yok.
    const m1 = await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 30 }, at,
    });
    await runDue(m1.missionId);
    expect(await openReturn()).toBeNull();

    // 31 kuş → 30 vurulur, 1 kuş bilgiyi getirir.
    const m2 = await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 31 }, at,
    });
    await runDue(m2.missionId);
    const raporlar = (await messagesOf(me)).filter((x) => x['kind'] === 'spy_report');
    const son = raporlar[raporlar.length - 1]!['body'] as Record<string, unknown>;
    expect(son['birdsLost']).toBe(30);
    expect(son['level']).not.toBeNull();
    expect(son['intel']).not.toBeNull();
  });

  /** ⭐ Savunan HER casuslukta "Casusluk Önleme Raporu" alır (kullanıcı, 2026-07-30). */
  it('⭐ savunan kuş vurulmasa bile Casusluk Önleme Raporu alır — sızan kademe yazılı', async () => {
    await giveUnits(home, 'spy_bird', 8);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 8 }, at,
    });
    await runDue(m.missionId);

    // Savunmasız şehir: hiç kuş vurulmadı ama rapor YİNE düştü.
    const savunan = (await messagesOf(rival)).find((x) => x['kind'] === 'spy_report');
    expect(savunan).toBeDefined();
    /**
     * ⭐ Başlıkta CASUSLUK YAPANIN ADI (kullanıcı, 2026-08-08). Bilgi zaten gövdedeydi
     * (`route.origin.owner`), eksik olan posta listesiydi: savunan raporu açmadan «kim»
     * sorusunu cevaplayamıyordu.
     */
    expect(String(savunan!['subject'])).toMatch(/^Casusluk Önleme Raporu · /);
    expect(String((savunan!['body'] as Record<string, unknown>)['spyPlayer'])).toBeTruthy();
    const body = savunan!['body'] as Record<string, unknown>;
    expect(body['birdsSent']).toBe(8);
    expect(body['birdsShot']).toBe(0);
    expect(body['leakedLevel']).not.toBeNull();        // rakibin NE aldığını görür

    // ⭐ Rapor çözüm ANINDA yazıldı — dönüş görevi hâlâ açıkken.
    const ret = await openReturn();
    expect(ret).not.toBeNull();
  });
});

/* ═══ RAPOR GÜZERGÂHI ══════════════════════════════════════════════════════ */

/**
 * ⭐ Kullanıcı (2026-08-02) raporlarda kaynak/hedef KOORDİNATINI, (2026-08-04) yanında da
 * O ANKİ ŞEHİR ADINI, (2026-08-07) ayrıca **OYUNCU ADINI** istedi. Üçü de `routeOf` üzerinden
 * **tek yerden** yazılıyor; bu testler o tekliğin farklı görev tiplerinde tuttuğunu ölçüyor.
 *
 * ⚠️ Ekranda artık `owner` yazıyor, `name` değil — ama ikisi de gövdede DURUYOR: `name`
 * silinseydi bu alandan eski raporların güzergâhı adsız kalırdı (`Messages.tsx` `RouteLine`).
 */
describe('rapor güzergâhı (koordinat + o anki şehir ve oyuncu adı)', () => {
  const routeOf = (body: Record<string, unknown>): Record<string, { name?: string; owner?: string }> =>
    body['route'] as Record<string, { name?: string; owner?: string }>;

  it('casusluk raporu kaynak ve hedefi ŞEHİR ve OYUNCU adıyla taşır', async () => {
    await giveUnits(home, 'spy_bird', 16);
    await setTech(me, 'espionage', 5);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 16 }, at,
    });
    await runDue(m.missionId);

    const body = (await messagesOf(me)).find((x) => x['kind'] === 'spy_report')!['body'] as Record<string, unknown>;
    const origin = routeOf(body)['origin']!;
    const target = routeOf(body)['target']!;
    expect(origin).toMatchObject({ k: 1, d: 1, s: 1, name: 'ev' });
    expect(target).toMatchObject({ k: 1, d: 1, s: 2, name: 'dusman' });
    // ⭐ Kullanıcı adları `beforeEach`te rastgele son ek alıyor → önek üzerinden ölçülüyor.
    expect(origin.owner).toMatch(/^me-/);
    expect(target.owner).toMatch(/^rival-/);
  });

  /**
   * ⚠️ Nakliyenin GÖNDEREN kopyası, `routeOf`un `writeMessage` içinden çağrılmasının
   * gerekçesiydi: handler'lara tek tek eklenseydi kaçınılmaz olarak unutulacak yer burasıydı.
   */
  it('nakliyenin gönderen kopyası da güzergâhı taşır', async () => {
    await giveUnits(home, 'cargo_wagon', 2);
    await setResources(home, 10_000, 0);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendTransport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { cargo_wagon: 2 },
      cargo: { gold: 5000, food: 0 }, at,
    });
    await runDue(m.missionId);

    const gonderen = (await messagesOf(me))
      .find((x) => x['kind'] === 'transport_report' && x['side'] === 'sender')!;
    const route = routeOf(gonderen['body'] as Record<string, unknown>);
    expect(route['origin']?.name).toBe('ev');
    expect(route['target']?.name).toBe('dusman');
  });

  /**
   * ⭐ **AD DONUYOR** — koordinattan farklı olarak ad değişebilir, bu yüzden rapor onu okuma
   * anında `cities`ten çekmiyor. Kullanıcının cümlesi: *"o andaki şehir adı"*.
   */
  it('hedef sonradan yeniden adlandırılsa bile rapor eski adı gösterir', async () => {
    await giveUnits(home, 'spy_bird', 16);
    await setTech(me, 'espionage', 5);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 16 }, at,
    });
    await runDue(m.missionId);
    await h.db.execute(sql`UPDATE cities SET name = 'bambaska' WHERE id = ${enemy}`);

    const body = (await messagesOf(me)).find((x) => x['kind'] === 'spy_report')!['body'] as Record<string, unknown>;
    expect(routeOf(body)['target']?.name).toBe('dusman');
  });
});

/* ═══ ŞEHİR KURMA ══════════════════════════════════════════════════════════ */

describe('şehir kurma', () => {
  it('⭐ şehir sayısı Sömürgecilik/3 + 1, tavan 5 (doküman)', () => {
    expect(maxCities(0)).toBe(1);
    expect(maxCities(2)).toBe(1);
    expect(maxCities(3)).toBe(2);
    expect(maxCities(9)).toBe(4);
    expect(maxCities(12)).toBe(5);
    expect(maxCities(60)).toBe(5);           // tavan
  });

  it('boş şehre şehir kurar, ordu yeni şehrin garnizonu olur', async () => {
    await setTech(me, 'colonization', 6);    // 1 + 2 = 3 şehir hakkı (2 şehri var)
    await giveUnits(home, 'dwarf', 30);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendFoundCity({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 7 }, units: { dwarf: 30 }, at,
    });
    await runDue(m.missionId);

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id, name FROM cities WHERE world_id = ${worldId} AND k = 1 AND d = 1 AND s = 7
    `);
    expect(rows).toHaveLength(1);
    const newCityId = Number(rows[0]!['id']);
    expect((await unitsOf(newCityId))['dwarf']).toBe(30);
    expect(await openReturn()).toBeNull();   // garnizon olarak kalır
  });

  it('⭐ şehir yeri bu arada dolarsa ordu GERİ DÖNER (doküman)', async () => {
    await setTech(me, 'colonization', 6);
    await giveUnits(home, 'dwarf', 20);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendFoundCity({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 8 }, units: { dwarf: 20 }, at,
    });

    // Ordu yoldayken rakip aynı yeri kapıyor.
    await cities.create({
      worldId, playerId: rival, name: 'kapkac', k: 1, d: 1, s: 8, isCapital: false, at,
    });
    await runDue(m.missionId);

    const ret = await openReturn();
    expect(ret).not.toBeNull();
    expect(ret!.payload['returnOf']).toBe('found_city');
    const msg = (await messagesOf(me)).find((x) => x['kind'] === 'found_city_report');
    expect((msg!['body'] as Record<string, unknown>)['reason']).toBe('slot_taken');
  });

  /**
   * ⭐ ŞEHİR KURMA YARIŞI GÖRÜNÜRLÜĞÜ (kullanıcı 2026-07-30): koordinatı ÖNCE kapan oyuncu,
   * yoldaki kuruluş seferini şehrine GELEN SALDIRI olarak görür — kılıç simgesi, kaynak
   * koordinat + oyuncu açık. **MASKE kalır, İÇERİK açıktır** (kullanıcı 2026-07-31): 20
   * cüceyle gelen "saldırı" şüphe uyandırır ama görev tipi yine de belli olmaz.
   * Gönderenin kendi bacağı değişmez; üçüncü oyuncu hiçbir şey görmez. Varışta ordu
   * savaşmadan döner ve iki tarafın listesi anında düşer.
   */
  it('⭐ YARIŞ: koordinatı kapan oyuncu yoldaki görevi GELEN SALDIRI olarak görür', async () => {
    await setTech(me, 'colonization', 6);
    await giveUnits(home, 'dwarf', 20);                 // 20 × 10 = 200 taşıma kapasitesi
    await setResources(home, 5_000, 0);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendFoundCity({
      originCityId: home, playerId: me, worldId,
      // ⚠️ Kargo BİLEREK dolu: maskenin kargo deliğini ölçen tek şey bu (aşağıdaki assertion).
      target: { k: 1, d: 1, s: 8 }, units: { dwarf: 20 }, cargo: { gold: 200, food: 0 }, at,
    });
    await cities.create({
      worldId, playerId: rival, name: 'kapkac', k: 1, d: 1, s: 8, isCapital: false, at,
    });

    const controller = new MissionController(missions, clock, h.db);
    const rivalList = await controller.list({ player: { playerId: rival, worldId } } as never);
    const incoming = (rivalList['movements'] as Record<string, unknown>[])
      .find((x) => x['direction'] === 'in');
    expect(incoming).toBeTruthy();
    expect(incoming!['type']).toBe('attack');           // maskeli: kuruluş seferi olduğu belli olmaz
    expect(incoming!['icon']).toBe('attack_in');
    expect(incoming!['units']).toEqual({ dwarf: 20 });  // ⭐ içerik AÇIK (2026-07-31)
    /**
     * ⚠️⚠️ KARGO MASKELİ (2026-08-07). Şehir kurmaya kaynak taşıma eklenince bu satır maskeyi
     * DELİYORDU: gerçek bir saldırının payload'ında `cargo` hiç olmaz, dolayısıyla "Taşınan:
     * 50.000 altın" hem görevin tipini ele verir hem rakibe kaynak istihbaratı sızdırırdı.
     */
    expect(incoming!['cargo']).toBeNull();
    expect(incoming!['origin']).toEqual({ k: 1, d: 1, s: 1 });
    expect(incoming!['originPlayer']).not.toBeNull();
    expect(Number(incoming!['cityId'])).toBeGreaterThan(0);   // çıpa: rakibin yeni şehri

    // Gönderenin kendi bacağı DEĞİŞMEZ: hâlâ Şehir Kurma, birlikleri görünür.
    const myList = await controller.list({ player: { playerId: me, worldId } } as never);
    const out = (myList['movements'] as Record<string, unknown>[])
      .find((x) => x['direction'] === 'out')!;
    expect(out['type']).toBe('found_city');
    expect(out['units']).toEqual({ dwarf: 20 });
    // Kendi bacağımda kargo GÖRÜNÜR — maske yalnız karşı tarafa uygulanıyor.
    expect(out['cargo']).toEqual({ gold: 200, food: 0 });

    // Üçüncü oyuncu hiçbir bacak görmez.
    const third = await createPlayer(h, worldId, 'ucuncu');
    const thirdList = await controller.list({ player: { playerId: third, worldId } } as never);
    expect(thirdList['movements']).toEqual([]);

    // Varışta savaşmadan dönüş + İKİ tarafın listesini düşüren bildirim.
    await runDue(m.missionId);
    const ob = await h.db.execute<Record<string, unknown>>(sql`
      SELECT payload FROM outbox
       WHERE world_id = ${worldId} AND topic = 'mission:completed'
       ORDER BY id DESC LIMIT 1
    `);
    const payload = ob[0]!['payload'] as Record<string, unknown>;
    expect(Number(payload['missionId'])).toBe(m.missionId);
    expect(Number(payload['targetPlayerId'])).toBe(rival);
  });

  it('⭐ YARIŞ: gönderen iptal ederse koordinat sahibi de olayı alır', async () => {
    await setTech(me, 'colonization', 6);
    await giveUnits(home, 'dwarf', 20);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendFoundCity({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 8 }, units: { dwarf: 20 }, at,
    });
    await cities.create({
      worldId, playerId: rival, name: 'kapkac2', k: 1, d: 1, s: 8, isCapital: false, at,
    });

    await missions.cancelMission({ missionId: m.missionId, playerId: me, worldId, at });

    const ob = await h.db.execute<Record<string, unknown>>(sql`
      SELECT payload FROM outbox
       WHERE world_id = ${worldId} AND topic = 'mission:canceled'
       ORDER BY id DESC LIMIT 1
    `);
    expect(Number((ob[0]!['payload'] as Record<string, unknown>)['targetPlayerId'])).toBe(rival);
  });

  it('şehir limiti dolduysa gönderilemez — YOLDAKİ görevler de sayılır', async () => {
    await setTech(me, 'colonization', 3);    // 2 şehir hakkı, zaten 2 şehri var
    await giveUnits(home, 'dwarf', 20);
    const at = await clock.gameNow(worldId);
    await expect(missions.sendFoundCity({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 9 }, units: { dwarf: 10 }, at,
    })).rejects.toThrow(/en fazla 2 şehre/i);
  });

  it('dolu şehre şehir kurulamaz', async () => {
    await setTech(me, 'colonization', 6);
    await giveUnits(home, 'dwarf', 20);
    const at = await clock.gameNow(worldId);
    await expect(missions.sendFoundCity({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
    })).rejects.toThrow(/zaten bir şehir var/i);
  });
});

/* ═══ ŞEHİR KURMA — KARGO · KUŞ · YALNIZ KAHRAMAN (2026-08-07) ═════════════ */

describe('şehir kurma: kargo, casus kuş, yalnız kahraman', () => {
  /** Yeni şehri koordinatından bulur (kuruluş görevin ürettiği tek satır). */
  async function foundedAt(k: number, d: number, s: number): Promise<number | null> {
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM cities WHERE world_id = ${worldId} AND k = ${k} AND d = ${d} AND s = ${s}
    `);
    return rows[0] ? Number(rows[0]['id']) : null;
  }

  async function giveHero(playerId: number, cityId: number, name = 'Kahraman'): Promise<number> {
    const r = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, level, status)
      VALUES (${worldId}, ${playerId}, ${cityId}, ${name}, 3, 'alive')
      RETURNING id
    `);
    return Number(r[0]!['id']);
  }

  /**
   * ⭐⭐ ANA HATA (2026-08-07): kargo `sendFoundCity`'ye hiç geçmiyordu, sessizce yutuluyordu.
   *
   * ⚠️ Bu testin asıl işi ÇİFT SAYIMI yakalamak: yeni şehirde 8.000 yerine 16.000 çıkarsa
   * `cities.create(startingResources)` yanında fazladan bir `cities.add` çağrılmış demektir
   * ve bu bedava kaynak basma açığıdır.
   */
  it('⭐ kargo kalkışta düşer, YENİ ŞEHRİN kesesine yazılır (çift sayım YOK)', async () => {
    await setTech(me, 'colonization', 6);
    await giveUnits(home, 'cargo_wagon', 3);            // 3 × 5.000 = 15.000 kapasite
    await setResources(home, 10_000, 5_000);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendFoundCity({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 7 }, units: { cargo_wagon: 3 },
      cargo: { gold: 8_000, food: 2_000 }, at,
    });

    // Kalkışta düştü mü?
    const afterSend = await resourcesOf(home);
    expect(afterSend.gold).toBeLessThan(2_100);
    expect(afterSend.food).toBeLessThan(3_100);

    await runDue(m.missionId);

    const newCityId = await foundedAt(1, 1, 7);
    expect(newCityId).not.toBeNull();
    const purse = await resourcesOf(newCityId!);
    expect(purse.gold).toBe(8_000);                     // ⚠️ 16.000 olursa çift sayım var
    expect(purse.food).toBe(2_000);
    expect((await unitsOf(newCityId!))['cargo_wagon']).toBe(3);
    expect(await openReturn()).toBeNull();
  });

  it('⭐ yer dolarsa KARGO da orduyla geri döner', async () => {
    await setTech(me, 'colonization', 6);
    await giveUnits(home, 'cargo_wagon', 2);
    await setResources(home, 10_000, 0);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendFoundCity({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 8 }, units: { cargo_wagon: 2 },
      cargo: { gold: 6_000, food: 0 }, at,
    });
    // Ordu yoldayken rakip yeri kapıyor.
    await cities.create({
      worldId, playerId: rival, name: 'kapkac', k: 1, d: 1, s: 8, isCapital: false, at,
    });
    await runDue(m.missionId);

    const ret = await openReturn();
    expect(ret).not.toBeNull();
    // ⚠️ Eskiden burada sabit {0,0} vardı → taşınan kaynak SESSİZCE yok oluyordu.
    expect(ret!.payload['loot']).toEqual({ gold: 6_000, food: 0 });
    // Dönüşün kaynak koordinatı payload'da (origin_city_id FK olduğu için boş kalıyor).
    expect(ret!.payload['originCoords']).toEqual({ k: 1, d: 1, s: 8 });

    await runDue(ret!.id);
    expect((await resourcesOf(home)).gold).toBeGreaterThan(9_900);
  });

  it('⭐ KAHRAMAN TEK BAŞINA şehir kurar (hız 200, garnizon boş)', async () => {
    await setTech(me, 'colonization', 6);
    const heroId = await giveHero(me, home, 'Yalnız');
    const at = await clock.gameNow(worldId);

    const m = await missions.sendFoundCity({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 7 }, units: {}, heroIds: [heroId], at,
    });
    expect(m.speed).toBe(200);                          // HERO_SPEED
    await runDue(m.missionId);

    const newCityId = await foundedAt(1, 1, 7);
    expect(newCityId).not.toBeNull();
    expect(await unitsOf(newCityId!)).toEqual({});      // garnizonsuz ama kuruldu
    const [hero] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT city_id FROM heroes WHERE id = ${heroId}
    `);
    expect(Number(hero!['city_id'])).toBe(newCityId);
  });

  /**
   * ⭐ Kullanıcı kararı (2026-08-07): kuş şehir kurabilir ve hızı KIRPILMAZ.
   * ⚠️ Denge sonucu bilerek kabul edildi: 6000 hız, normal ordunun ~60 katı.
   */
  it('⭐ CASUS KUŞ TEK BAŞINA şehir kurar, hız 6000', async () => {
    await setTech(me, 'colonization', 6);
    await giveUnits(home, 'spy_bird', 1);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendFoundCity({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 7 }, units: { spy_bird: 1 }, at,
    });
    expect(m.speed).toBe(6000);
    await runDue(m.missionId);

    const newCityId = await foundedAt(1, 1, 7);
    expect(newCityId).not.toBeNull();
    expect((await unitsOf(newCityId!))['spy_bird']).toBe(1);
  });

  it('kargo ordunun taşıma kapasitesini aşamaz', async () => {
    await setTech(me, 'colonization', 6);
    await giveUnits(home, 'dwarf', 10);                 // 10 × 10 = 100 kapasite
    await setResources(home, 50_000, 0);
    const at = await clock.gameNow(worldId);
    await expect(missions.sendFoundCity({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 7 }, units: { dwarf: 10 },
      cargo: { gold: 5_000, food: 0 }, at,
    })).rejects.toMatchObject({ code: 'carry_capacity' });
  });

  it('yalnız kahraman kaynak TAŞIYAMAZ ve sebebi anlaşılır', async () => {
    await setTech(me, 'colonization', 6);
    const heroId = await giveHero(me, home);
    await setResources(home, 10_000, 0);
    const at = await clock.gameNow(worldId);
    await expect(missions.sendFoundCity({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 7 }, units: {}, heroIds: [heroId],
      cargo: { gold: 100, food: 0 }, at,
    })).rejects.toThrow(/taşıyabilecek birim yok/i);
  });

  it('ordu da kahraman da yoksa sefer gönderilemez', async () => {
    await setTech(me, 'colonization', 6);
    const at = await clock.gameNow(worldId);
    await expect(missions.sendFoundCity({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 7 }, units: {}, at,
    })).rejects.toMatchObject({ code: 'no_units' });
  });

  /**
   * ⭐ Harita dışı koordinat (2026-08-07). `WORLD_SHAPE` sefer yolunda HİÇ okunmuyordu:
   * `cities_world_coords` "aynı yere iki şehir"i engeller, "olmayan yere şehir"i değil.
   */
  it('⭐ harita DIŞI koordinata şehir kurulamaz', async () => {
    await setTech(me, 'colonization', 6);
    await giveUnits(home, 'dwarf', 5);
    const at = await clock.gameNow(worldId);
    const send = (target: { k: number; d: number; s: number }): Promise<unknown> =>
      missions.sendFoundCity({
        originCityId: home, playerId: me, worldId, target, units: { dwarf: 5 }, at,
      });

    for (const bad of [
      { k: 0, d: 1, s: 1 },        // 1-indeksli, 0 yok
      { k: 11, d: 1, s: 1 },       // 10 kıta
      { k: 1, d: 9999, s: 1 },     // 500 diyar
      { k: 1, d: 1, s: 11 },       // 10 şehir yeri
    ]) {
      await expect(send(bad)).rejects.toMatchObject({ code: 'out_of_world' });
    }
  });

  it('rapor kahramanları ve taşınan kaynağı yazar', async () => {
    await setTech(me, 'colonization', 6);
    await giveUnits(home, 'cargo_wagon', 1);
    await giveHero(me, home, 'Bilge');
    await setResources(home, 5_000, 0);
    const at = await clock.gameNow(worldId);
    const heroes = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM heroes WHERE player_id = ${me} AND city_id = ${home}
    `);
    const m = await missions.sendFoundCity({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 7 }, units: { cargo_wagon: 1 },
      heroIds: [Number(heroes[0]!['id'])], cargo: { gold: 3_000, food: 0 }, at,
    });
    await runDue(m.missionId);

    const msg = (await messagesOf(me)).find((x) => x['kind'] === 'found_city_report')!;
    const body = msg['body'] as Record<string, unknown>;
    expect(body['heroes']).toEqual(['Bilge']);
    expect(body['cargo']).toEqual({ gold: 3_000, food: 0 });
    expect(body['units']).toEqual({ cargo_wagon: 1 });
  });
});

/* ═══ İPTALDE KARGO İADESİ (2026-08-07) ════════════════════════════════════ */

describe('iptal: kargo iadesi', () => {
  /**
   * ⭐⭐ Kalkışta `trySpend` ile düşen kaynak, iptalin açtığı dönüş görevinde `loot: {0,0}`
   * yazıldığı için **yok oluyordu**. `transport`, `support` ve `found_city` üçünü de vuruyordu.
   *
   * ⚠️ Mevcut «nakliye» testindeki `loot` `{0,0}` beklentisi NORMAL VARIŞ senaryosu — o doğru
   * ve değişmemeli (ordu boş döner). Burada ölçülen şey İPTAL yolu.
   */
  it('⭐ nakliye iptal edilince taşınan kaynak GERİ DÖNER', async () => {
    await giveUnits(home, 'cargo_wagon', 3);
    await setResources(home, 10_000, 0);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendTransport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { cargo_wagon: 3 },
      cargo: { gold: 8_000, food: 0 }, at,
    });
    expect((await resourcesOf(home)).gold).toBeLessThan(2_100);

    await missions.cancelMission({ missionId: m.missionId, playerId: me, worldId, at });
    const ret = await openReturn();
    expect(ret!.payload['loot']).toEqual({ gold: 8_000, food: 0 });
    expect(ret!.payload['canceled']).toBe(true);

    await runDue(ret!.id);
    expect((await resourcesOf(home)).gold).toBeGreaterThan(9_900);
  });

  it('saldırı iptalinde davranış DEĞİŞMEZ (payload\'da kargo yok)', async () => {
    await giveUnits(home, 'dwarf', 10);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,   // rakibin başkenti
    });
    await missions.cancelMission({ missionId: m.missionId, playerId: me, worldId, at });
    expect((await openReturn())!.payload['loot']).toEqual({ gold: 0, food: 0 });
  });
});

/* ═══ TELEPORT ═════════════════════════════════════════════════════════════ */

describe('teleport', () => {
  it('⭐ ANLIK: görev satırı yok, birlikler hemen hedefte', async () => {
    await setBuilding(home, 'teleport', 3);
    await setBuilding(colony, 'teleport', 1);
    await giveUnits(home, 'dwarf', 25);
    const at = await clock.gameNow(worldId);

    const r = await missions.teleport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 3 }, units: { dwarf: 25 }, at,
    });

    expect((await unitsOf(home))['dwarf']).toBe(0);
    expect((await unitsOf(colony))['dwarf']).toBe(25);
    const open = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM missions WHERE world_id = ${worldId} AND status = 'scheduled'
    `);
    expect(Number(open[0]!['n'])).toBe(0);
    // Bekleme süresi seviye başına %2 kısalır.
    expect((r.readyAt.getTime() - at.getTime()) / 1000)
      .toBeCloseTo(teleportCooldownSeconds(3), 0);
  });

  it('İKİ şehirde de Teleport ≥ 1 olmalı', async () => {
    await setBuilding(home, 'teleport', 2);
    await giveUnits(home, 'dwarf', 5);
    const at = await clock.gameNow(worldId);
    await expect(missions.teleport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 3 }, units: { dwarf: 5 }, at,
    })).rejects.toThrow(/HER İKİ şehirde/i);
  });

  it('bekleme süresi dolmadan ikinci teleport yapılamaz', async () => {
    await setBuilding(home, 'teleport', 1);
    await setBuilding(colony, 'teleport', 1);
    await giveUnits(home, 'dwarf', 10);
    const at = await clock.gameNow(worldId);
    await missions.teleport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 3 }, units: { dwarf: 5 }, at,
    });
    await expect(missions.teleport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 3 }, units: { dwarf: 5 }, at,
    })).rejects.toThrow(/hazır değil/i);
  });

  it('yalnız kendi şehirleri arasında', async () => {
    await setBuilding(home, 'teleport', 1);
    await setBuilding(enemy, 'teleport', 1);
    await giveUnits(home, 'dwarf', 5);
    const at = await clock.gameNow(worldId);
    await expect(missions.teleport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 5 }, at,
    })).rejects.toThrow(/kendi şehirleriniz/i);
  });
});

/* ═══ ORTAK KURALLAR ═══════════════════════════════════════════════════════ */

describe('ortak sefer kuralları', () => {
  it('⭐ Baraka sefer limiti tüm görev tiplerini birlikte sayar (doküman: ORDU EKRANI)', async () => {
    await setBuilding(home, 'barracks', 2);   // aynı anda 2 sefer
    await giveUnits(home, 'cargo_wagon', 5);
    await giveUnits(home, 'spy_bird', 5);
    await setResources(home, 50_000, 0);
    const at = await clock.gameNow(worldId);

    await missions.sendTransport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { cargo_wagon: 1 }, cargo: { gold: 100, food: 0 }, at,
    });
    await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 1 }, at,
    });
    await expect(missions.sendTransport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { cargo_wagon: 1 }, cargo: { gold: 100, food: 0 }, at,
    })).rejects.toThrow(/en fazla 2 sefer/i);
  });

  it('savunma birimi sefere çıkamaz', async () => {
    await giveUnits(home, 'dwarf', 5);
    await giveDefenses(home, 'archer_tower', 5);
    const at = await clock.gameNow(worldId);
    await expect(missions.sendSupport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 3 }, units: { archer_tower: 1 }, at,
    })).rejects.toThrow(/sefere çıkamaz/i);
  });

  /**
   * ⭐ KUŞ SALDIRI ve NAKLİYEDEN HÂLÂ DIŞLANIYOR — ama DESTEKTEN artık değil (kullanıcı,
   * 2026-08-03). Bu test eskiden desteği örnek alıyordu; kural değişince örnek saldırıya
   * çevrildi, çünkü ölçtüğü şey "kuş her yere gidemez" değişmezi.
   */
  it('Casus Kuş saldırıya ve nakliyeye katılamaz', async () => {
    await giveUnits(home, 'spy_bird', 5);
    const at = await clock.gameNow(worldId);
    await expect(missions.sendAttack({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 4 }, units: { spy_bird: 5 }, at,
    })).rejects.toThrow(/katılamaz/i);
    await expect(missions.sendTransport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 3 }, units: { spy_bird: 5 },
      cargo: { gold: 1, food: 0 }, at,
    })).rejects.toThrow(/casusluk ve destek/i);
  });

  /**
   * ⭐ KUŞ DESTEKLE TAŞINABİLİR (kullanıcı, 2026-08-03).
   *
   * ⚠️ Bu bir denge kararı değil, bir ÇIKMAZIN çözümü: şehir terk etmek barakanın tamamen
   * boş olmasını istiyor ama kuş yalnız casusluğa katılabildiği için şehirden hiç
   * çıkarılamıyordu → kuşu olan şehir **terk edilemiyordu**.
   */
  it('⭐ Casus Kuş DESTEKLE başka şehre taşınabilir', async () => {
    await giveUnits(home, 'spy_bird', 5);
    const at = await clock.gameNow(worldId);
    const r = await missions.sendSupport({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 3 }, units: { spy_bird: 5 }, at,
    });
    expect(r.missionId).toBeGreaterThan(0);
    // Kuşun 6000 hızı orduyu HIZLANDIRMAZ diye bir şey yok — tek birim, hız onun.
    expect(r.speed).toBe(6000);
  });
});

/* ═══ GELEN ORDU GÖRÜNÜRLÜĞÜ ═══════════════════════════════════════════════ */

/**
 * ⭐ İÇERİK KOŞULSUZ AÇIK (kullanıcı kararı 2026-07-31) — önceki "birleşim gizli, öğrenmek
 * için casusluk gerekir" kuralı KALDIRILDI. Savunan gelen saldırıda hangi birimden kaç tane
 * geldiğini, gelen casuslukta kaç kuş uçtuğunu ve orduda kimin kahramanı olduğunu görür.
 *
 * ⚠️ Bu, orijinal J2ME istemcisinden BİLİNÇLİ sapmadır: `k.java`'daki gelen-ordu kaydında
 * birim alanı hiç yoktu (yalnız "Saldırı yaklaşıyor · Kaynak: koordinat").
 *
 * Gizli KALAN tek şey: saldıranın taşıdığı ganimet — dönüş bacağı savunanın listesinde
 * hiç satır üretmiyor (bkz. `OUT_ICON`'da `return` anahtarının olmaması).
 */
describe('gelen ordu içeriği', () => {
  const listFor = (playerId: number): Promise<Record<string, unknown>> =>
    new MissionController(missions, clock, h.db)
      .list({ player: { playerId, worldId } } as never);
  const incomingOf = async (playerId: number): Promise<Record<string, unknown> | undefined> =>
    ((await listFor(playerId))['movements'] as Record<string, unknown>[])
      .find((x) => x['direction'] === 'in');

  it('⭐ gelen SALDIRIDA birleşim TAM görünür', async () => {
    await giveUnits(home, 'dwarf', 500);
    await giveUnits(home, 'elf', 30);
    const at = await clock.gameNow(worldId);
    await missions.sendAttack({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 500, elf: 30 }, at,
    });

    const incoming = await incomingOf(rival);
    expect(incoming).toBeTruthy();
    expect(incoming!['units']).toEqual({ dwarf: 500, elf: 30 });
    expect(incoming!['icon']).toBe('attack_in');
    expect(incoming!['origin']).toEqual({ k: 1, d: 1, s: 1 });
    // ⚠️ Ganimet sızmaz: saldırı GİDİŞ payload'ında kaynak yükü yok.
    expect(incoming!['cargo']).toBeNull();
  });

  it('⭐ gelen CASUSLUKTA kaç kuş geldiği görünür', async () => {
    await giveUnits(home, 'spy_bird', 64);
    const at = await clock.gameNow(worldId);
    await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 64 }, at,
    });

    const incoming = await incomingOf(rival);
    expect(incoming!['units']).toEqual({ spy_bird: 64 });
    expect(incoming!['icon']).toBe('spy_back');
  });

  it('⭐ gelen orduda kahraman ADI ve SEVİYESİ görünür — statları ASLA', async () => {
    await giveUnits(home, 'dwarf', 100);
    const hero = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, level, xp, f_atk, f_def, m_atk, m_def)
      VALUES (${worldId}, ${me}, ${home}, 'Baturalp', 7, 5000, 9, 8, 3, 2)
      RETURNING id
    `);
    const at = await clock.gameNow(worldId);
    await missions.sendAttack({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 100 },
      heroIds: [Number(hero[0]!['id'])], at,
    });

    const incoming = await incomingOf(rival);
    expect(incoming!['heroes']).toEqual([{ name: 'Baturalp', level: 7 }]);
    // Yetenek dağılımı savaşı önceden simüle ettirir → sızmamalı.
    expect(JSON.stringify(incoming)).not.toContain('f_atk');
    expect(JSON.stringify(incoming)).not.toContain('fAtk');
  });

  it('kahramansız görevde kahraman listesi BOŞ dizi (alan hep var)', async () => {
    await giveUnits(home, 'dwarf', 10);
    const at = await clock.gameNow(worldId);
    await missions.sendAttack({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at,
    });
    expect((await incomingOf(rival))!['heroes']).toEqual([]);
  });

  it('birim × kahraman ÇARPIMI olmaz — sayılar bozulmaz (LATERAL kilidi)', async () => {
    await giveUnits(home, 'dwarf', 300);
    await giveUnits(home, 'elf', 40);
    const heroes = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, level, xp)
      VALUES (${worldId}, ${me}, ${home}, 'Aybike', 3, 100),
             (${worldId}, ${me}, ${home}, 'Cengiz', 5, 900)
      RETURNING id
    `);
    const at = await clock.gameNow(worldId);
    await missions.sendAttack({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 300, elf: 40 },
      heroIds: heroes.map((x) => Number(x['id'])), at,
    });

    const incoming = await incomingOf(rival);
    expect(incoming!['units']).toEqual({ dwarf: 300, elf: 40 });   // 2 kahraman × 2 birim tuzağı
    // Seviyeye göre azalan sıra (yüksek seviyeli tehdit önce).
    expect(incoming!['heroes']).toEqual([
      { name: 'Cengiz', level: 5 }, { name: 'Aybike', level: 3 },
    ]);
  });

  it('⭐ outbox bildirimleri birim dökümü taşır (push zemini)', async () => {
    await giveUnits(home, 'dwarf', 250);
    await giveUnits(home, 'spy_bird', 8);
    const at = await clock.gameNow(worldId);
    await missions.sendAttack({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 250 }, at,
    });
    await missions.sendSpy({
      originCityId: home, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 8 }, at,
    });

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT topic, payload FROM outbox
       WHERE world_id = ${worldId} AND topic IN ('city:incoming_attack', 'city:incoming_spy')
    `);
    const atk = rows.find((x) => x['topic'] === 'city:incoming_attack')!['payload'] as Record<string, unknown>;
    const spy = rows.find((x) => x['topic'] === 'city:incoming_spy')!['payload'] as Record<string, unknown>;
    expect(atk['units']).toEqual({ dwarf: 250 });
    expect(atk['heroCount']).toBe(0);
    expect(spy['birds']).toBe(8);
  });
});
