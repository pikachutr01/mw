/**
 * ⭐ TATİL MODU testleri (§tatil modu).
 *
 * En kritik olanı **«hiç okunmadan 30 gün»**: tatil boyunca şehir bir kez bile okunmazsa
 * (ki normal hâli budur — oyuncu yok) çıkışta altın ARTMAMALI. Bu tek test, tatil modunun
 * tek sessiz ve büyük hatasını yapısal olarak kapatıyor: dondurma yalnız `materialize`
 * çağrıldığında işleseydi, hiç çağrılmayan bir şehrin çıpası girişte kalır ve ilk okumada
 * 30 günlük kaynak tek seferde yazılırdı.
 *
 * ⚠️ Alternatif tasarım («çıpayı tatil boyunca sürekli ilerlet») tam bu testte çöker:
 * ilerletecek bir şey yok, kimse okumuyor.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { echoHandler } from '../src/missions/echo.handler.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { MissionError, MissionService } from '../src/missions/mission.service.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import { QUEUE_HANDLERS } from '../src/queues/queue.handlers.ts';
import { QueueError, QueueService } from '../src/queues/queue.service.ts';
import { AllianceController } from '../src/alliance/alliance.controller.ts';
import { AllianceService } from '../src/alliance/alliance.service.ts';
import type { AuthedRequest } from '../src/auth/auth.guard.ts';
import { VacationError, VacationService } from '../src/vacation/vacation.service.ts';
import { createVacationEndHandler } from '../src/vacation/vacation.handler.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, freshWorldId, setupTestDb, verifyEmail, dueAt } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;
let cities: CityService;
let queues: QueueService;
let missions: MissionService;
let vacation: VacationService;
let auth: AuthService;
let registry: HandlerRegistry;

let playerId: number;
let cityId: number;
/** İkinci oyuncu — saldırı ve gelen-hareket senaryoları için. */
let otherId: number;
let otherCityId: number;

const HOUR = 3600_000;
const DAY = 86_400_000;

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  queues = new QueueService(h.db, cities);
  missions = new MissionService(h.db);
  vacation = new VacationService(h.db, cities);
  auth = new AuthService(h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock, cities);
  registry = new HandlerRegistry()
    .register('echo', echoHandler)
    .register('vacation_end', createVacationEndHandler());
  for (const [type, handler] of Object.entries(QUEUE_HANDLERS)) registry.register(type, handler);
}, 60_000);

afterAll(async () => { await h?.close(); });

async function makePlayer(prefix: string): Promise<{ playerId: number; cityId: number }> {
  const t = randomUUID().slice(0, 8);
  const r = await auth.register({
    email: `${prefix}-${t}@test.local`, password: 'parola-12345', username: `${prefix}_${t}`, worldId,
  }, { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' });
  await verifyEmail(h, r.playerId);
  const [c] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT id FROM cities WHERE player_id = ${r.playerId}
  `);
  return { playerId: r.playerId, cityId: Number(c!['id']) };
}

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  ({ playerId, cityId } = await makePlayer('vac'));
  ({ playerId: otherId, cityId: otherCityId } = await makePlayer('enemy'));
  /* ⚠️ Acemi koruması KALDIRILIYOR: yeni oyuncu `protected_until` ile doğuyor ve
     `assertTargetAllowed` onu tatil kontrolünden ÖNCE reddediyor. Bu dosya tatili ölçüyor,
     acemi korumasını değil. */
  await h.db.execute(sql`
    UPDATE players SET protected_until = NULL WHERE id IN (${playerId}, ${otherId})
  `);
});

const scheduler = (): SchedulerService =>
  new SchedulerService(h.db, clock, registry, { worldId, retryBackoffMs: 0 });

async function goldOf(id = cityId): Promise<number> {
  const [r] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT gold FROM cities WHERE id = ${id}
  `);
  return Number(r!['gold']);
}
async function resourcesAt(id = cityId): Promise<string> {
  const [r] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT resources_at FROM cities WHERE id = ${id}
  `);
  return String(r!['resources_at']);
}
async function onVacation(id = playerId): Promise<boolean> {
  const [r] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT vacation_until IS NOT NULL AS v FROM players WHERE id = ${id}
  `);
  return r!['v'] === true;
}
/** Madeni yükselterek üretim hızını ölçülebilir kılar. */
async function setMine(level: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO buildings (city_id, type, level) VALUES (${cityId}, 'mine', ${level})
    ON CONFLICT (city_id, type) DO UPDATE SET level = ${level}
  `);
}

/* ══ Kaynak dondurma — asıl mesele ══════════════════════════════════════════ */

describe('kaynak dondurma', () => {
  it('⭐ HİÇ OKUNMADAN 30 gün geçip çıkılınca altın ARTMAZ', async () => {
    const t0 = await clock.gameNow(worldId);
    await setMine(10);
    await cities.materialize(cityId, t0, h.db);
    const before = await goldOf();

    await vacation.enter(playerId, t0);

    /* ⚠️ Arada TEK BİR okuma yok — tatilin gerçek hâli bu. */
    const t1 = new Date(t0.getTime() + 30 * DAY);
    await vacation.leave(playerId, t1);

    expect(await goldOf()).toBeCloseTo(before, 6);
    expect(await onVacation()).toBe(false);
  });

  it('tatil boyunca ARADA okunsa bile altın artmaz (materialize no-op)', async () => {
    const t0 = await clock.gameNow(worldId);
    await setMine(10);
    await cities.materialize(cityId, t0, h.db);
    await vacation.enter(playerId, t0);
    const frozen = await goldOf();
    const frozenAt = await resourcesAt();

    for (const gun of [1, 5, 17]) {
      await cities.materialize(cityId, new Date(t0.getTime() + gun * DAY), h.db);
      expect(await goldOf()).toBeCloseTo(frozen, 6);
      // Çıpa da kıpırdamamalı: kıpırdasaydı dondurma değil, sessiz kaynak kaybı olurdu.
      expect(await resourcesAt()).toBe(frozenAt);
    }
  });

  it('çıkıştan 1 saat sonra TAM 1 saatlik birikim olur (ne eksik ne fazla)', async () => {
    const t0 = await clock.gameNow(worldId);
    await setMine(10);
    await cities.materialize(cityId, t0, h.db);
    const base = await goldOf();

    await vacation.enter(playerId, t0);
    const cikis = new Date(t0.getTime() + 10 * DAY);
    await vacation.leave(playerId, cikis);
    await cities.materialize(cityId, new Date(cikis.getTime() + HOUR), h.db);
    const tatilli = await goldOf() - base;

    /* Karşılaştırma grubu: hiç tatile girmemiş İKİNCİ şehir, aynı madenle 1 saat. */
    await h.db.execute(sql`
      INSERT INTO buildings (city_id, type, level) VALUES (${otherCityId}, 'mine', 10)
      ON CONFLICT (city_id, type) DO UPDATE SET level = 10
    `);
    await cities.materialize(otherCityId, t0, h.db);
    const base2 = await goldOf(otherCityId);
    await cities.materialize(otherCityId, new Date(t0.getTime() + HOUR), h.db);
    const normal = await goldOf(otherCityId) - base2;

    expect(tatilli).toBeCloseTo(normal, 6);
    expect(tatilli).toBeGreaterThan(0);
  });

  it('girişte biriken kaynak SON KEZ yazılır (yanmaz)', async () => {
    const t0 = await clock.gameNow(worldId);
    await setMine(10);
    await cities.materialize(cityId, t0, h.db);
    const base = await goldOf();

    /* Son okumadan 3 saat sonra tatile giriliyor: o 3 saat hesaba yazılmalı. */
    const giris = new Date(t0.getTime() + 3 * HOUR);
    await vacation.enter(playerId, giris);
    expect(await goldOf()).toBeGreaterThan(base);
    expect(await resourcesAt()).toBe(
      (await h.db.execute<Record<string, unknown>>(sql`
        SELECT ${giris.toISOString()}::timestamptz AS t
      `))[0]!['t'],
    );
  });

  it('ekranda üretim hızı 0 gösterilir (yoksa «+120/sa» yazıp sayı kıpırdamaz)', async () => {
    const t0 = await clock.gameNow(worldId);
    await setMine(10);
    const once = await cities.snapshot(cityId, t0, h.db);
    expect(once!.goldPerHour).toBeGreaterThan(0);
    expect(once!.onVacation).toBe(false);

    await vacation.enter(playerId, t0);
    const sonra = await cities.snapshot(cityId, new Date(t0.getTime() + DAY), h.db);
    expect(sonra!.goldPerHour).toBe(0);
    expect(sonra!.foodPerHour).toBe(0);
    expect(sonra!.onVacation).toBe(true);
  });
});

/* ══ Giriş engelleri ════════════════════════════════════════════════════════ */

describe('giriş engelleri', () => {
  it('temiz oyuncu girebilir; engel listesi boş gelir', async () => {
    const at = await clock.gameNow(worldId);
    const st = await vacation.status(playerId, at);
    expect(st.onVacation).toBe(false);
    expect(st.blockers).toEqual([]);
    await expect(vacation.enter(playerId, at)).resolves.toMatchObject({ onVacation: true });
  });

  it('süren kuyruk engeldir', async () => {
    const at = await clock.gameNow(worldId);
    await h.db.execute(sql`UPDATE cities SET gold = 1000000, food = 1000000 WHERE id = ${cityId}`);
    await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });

    const st = await vacation.status(playerId, at);
    expect(st.blockers.some((b) => b.includes('üretim'))).toBe(true);
    await expect(vacation.enter(playerId, at)).rejects.toThrow(VacationError);
  });

  it('⭐ GELEN saldırı da engeldir (tatil kaçış düğmesi olmamalı)', async () => {
    const at = await clock.gameNow(worldId);
    await h.db.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${otherCityId}, 'dwarf', 50)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 50
    `);
    const [me] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT k, d, s FROM cities WHERE id = ${cityId}
    `);
    await missions.sendAttack({
      originCityId: otherCityId, playerId: otherId, worldId,
      target: { k: Number(me!['k']), d: Number(me!['d']), s: Number(me!['s']) },
      units: { dwarf: 10 }, at,
    });

    const st = await vacation.status(playerId, at);
    expect(st.blockers.some((b) => b.includes('ordu'))).toBe(true);
    await expect(vacation.enter(playerId, at)).rejects.toMatchObject({ code: 'vacation_blocked' });
  });

  it('GİDEN ordu da engeldir', async () => {
    const at = await clock.gameNow(worldId);
    await h.db.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${cityId}, 'dwarf', 50)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 50
    `);
    const [enemy] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT k, d, s FROM cities WHERE id = ${otherCityId}
    `);
    await missions.sendAttack({
      originCityId: cityId, playerId, worldId,
      target: { k: Number(enemy!['k']), d: Number(enemy!['d']), s: Number(enemy!['s']) },
      units: { dwarf: 10 }, at,
    });
    await expect(vacation.enter(playerId, at)).rejects.toMatchObject({ code: 'vacation_blocked' });
  });

  it('⭐ bekleme ÇIKIŞTAN sayılır, girişten değil', async () => {
    const t0 = await clock.gameNow(worldId);
    await vacation.enter(playerId, t0);
    const cikis = new Date(t0.getTime() + 3 * DAY);      // 48 saati aşıyor
    await vacation.leave(playerId, cikis);

    /* Girişten 3 gün + 1 saat geçti ama ÇIKIŞTAN yalnız 1 saat → hâlâ bekleme var. */
    const erken = new Date(cikis.getTime() + HOUR);
    expect((await vacation.status(playerId, erken)).blockers.some((b) => b.includes('bekle'))).toBe(true);
    await expect(vacation.enter(playerId, erken)).rejects.toThrow(VacationError);

    const gec = new Date(cikis.getTime() + 3 * DAY + HOUR);
    expect((await vacation.status(playerId, gec)).blockers).toEqual([]);
    await expect(vacation.enter(playerId, gec)).resolves.toMatchObject({ onVacation: true });
  });

  it('zaten tatildeyken ikinci giriş reddedilir', async () => {
    const at = await clock.gameNow(worldId);
    await vacation.enter(playerId, at);
    await expect(vacation.enter(playerId, at)).rejects.toMatchObject({ code: 'already_on_vacation' });
  });
});

/* ══ Çıkış ══════════════════════════════════════════════════════════════════ */

describe('çıkış', () => {
  it('47 saatte çıkış REDDEDİLİR, 48 saatte kabul edilir', async () => {
    const t0 = await clock.gameNow(worldId);
    await vacation.enter(playerId, t0);

    const err = await vacation.leave(playerId, new Date(t0.getTime() + 47 * HOUR))
      .catch((e: unknown) => e as VacationError);
    expect((err as VacationError).code).toBe('vacation_too_early');
    expect((err as VacationError).details?.['canLeaveAt']).toBe(
      new Date(t0.getTime() + 48 * HOUR).toISOString(),
    );

    await expect(vacation.leave(playerId, new Date(t0.getTime() + 48 * HOUR)))
      .resolves.toMatchObject({ onVacation: false });
  });

  it('tatilde değilken çıkış reddedilir', async () => {
    const at = await clock.gameNow(worldId);
    await expect(vacation.leave(playerId, at)).rejects.toMatchObject({ code: 'not_on_vacation' });
  });

  it('⭐ 30 gün dolunca `vacation_end` görevi OTOMATİK çıkarır ve altın sıçramaz', async () => {
    const t0 = await clock.gameNow(worldId);
    await setMine(10);
    await cities.materialize(cityId, t0, h.db);
    const before = await goldOf();
    await vacation.enter(playerId, t0);

    /* Görev girişte yazılmış olmalı. */
    const [job] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id, execute_at FROM missions
       WHERE world_id = ${worldId} AND type = 'vacation_end' AND status = 'scheduled'
    `);
    expect(job).toBeTruthy();

    await h.db.execute(sql`
      UPDATE missions SET execute_at = ${await dueAt(clock, worldId)}::timestamptz WHERE id = ${Number(job!['id'])}
    `);
    const r = await scheduler().tick();
    expect(r.dead).toBe(0);

    expect(await onVacation()).toBe(false);
    expect(await goldOf()).toBeCloseTo(before, 6);
  });

  it('⭐ ESKİ otomatik çıkış görevi YENİ tatili erken bitirmez', async () => {
    const t0 = await clock.gameNow(worldId);
    await vacation.enter(playerId, t0);                       // görev A → +30 gün
    await vacation.leave(playerId, new Date(t0.getTime() + 3 * DAY));

    /* Beklemeyi atla ve yeniden gir → görev B. Görev A hâlâ zamanlanmış. */
    await h.db.execute(sql`UPDATE players SET vacation_ended_at = NULL WHERE id = ${playerId}`);
    const ikinciGiris = new Date(t0.getTime() + 7 * DAY);
    await vacation.enter(playerId, ikinciGiris);

    /* Görev A'yı (ilk girişin görevi) vadesine getir ve işlet. */
    const [eski] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM missions
       WHERE world_id = ${worldId} AND type = 'vacation_end'
         AND payload->>'since' = ${t0.toISOString()}
    `);
    expect(eski).toBeTruthy();
    await h.db.execute(sql`
      UPDATE missions SET execute_at = ${await dueAt(clock, worldId)}::timestamptz WHERE id = ${Number(eski!['id'])}
    `);
    const r = await scheduler().tick();
    expect(r.dead).toBe(0);

    /* ⚠️ Oyuncu HÂLÂ tatilde olmalı: eski görev yeni tatili bitirmemeli. */
    expect(await onVacation()).toBe(true);
  });

  it('elle çıkılmışsa otomatik çıkış görevi sessiz no-op olur', async () => {
    const t0 = await clock.gameNow(worldId);
    await vacation.enter(playerId, t0);
    const cikis = new Date(t0.getTime() + 3 * DAY);
    await vacation.leave(playerId, cikis);
    const endedAt = (await vacation.status(playerId, cikis)).endedAt;

    const [job] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM missions WHERE world_id = ${worldId} AND type = 'vacation_end'
    `);
    await h.db.execute(sql`
      UPDATE missions SET execute_at = ${await dueAt(clock, worldId)}::timestamptz WHERE id = ${Number(job!['id'])}
    `);
    const r = await scheduler().tick();
    expect(r.dead).toBe(0);

    /* ⚠️ Asıl ölçüm: çıkış damgası DEĞİŞMEMELİ. Değişseydi bekleme sayacı sıfırlanır ve
       oyuncu 3 gün yerine 6 gün beklerdi. */
    expect((await vacation.status(playerId, cikis)).endedAt).toBe(endedAt);
  });
});

/* ══ Tatildeyken kapalı olanlar ═════════════════════════════════════════════ */

describe('tatildeyken', () => {
  beforeEach(async () => {
    const at = await clock.gameNow(worldId);
    await vacation.enter(playerId, at);
  });

  it('bina kuyruğu açılamaz (403 ailesi: on_vacation)', async () => {
    const at = await clock.gameNow(worldId);
    await h.db.execute(sql`UPDATE cities SET gold = 1000000, food = 1000000 WHERE id = ${cityId}`);
    const err = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at })
      .catch((e: unknown) => e as QueueError);
    expect((err as QueueError).code).toBe('on_vacation');
  });

  it('saldırı gönderilemez', async () => {
    const at = await clock.gameNow(worldId);
    await h.db.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${cityId}, 'dwarf', 50)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 50
    `);
    const [enemy] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT k, d, s FROM cities WHERE id = ${otherCityId}
    `);
    const err = await missions.sendAttack({
      originCityId: cityId, playerId, worldId,
      target: { k: Number(enemy!['k']), d: Number(enemy!['d']), s: Number(enemy!['s']) },
      units: { dwarf: 10 }, at,
    }).catch((e: unknown) => e as MissionError);
    expect((err as MissionError).code).toBe('on_vacation');
  });

  it('⚠️ NAKLİYE de gönderilemez (yoksa donmuş şehir güvenli bir kasa olurdu)', async () => {
    const at = await clock.gameNow(worldId);
    await h.db.execute(sql`UPDATE cities SET gold = 100000 WHERE id = ${cityId}`);
    /* Nakliye taşıyıcı ister; kaynağı tek başına yollamak zaten `no_units` ile reddedilir. */
    await h.db.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${cityId}, 'cargo_wagon', 10)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 10
    `);
    const [enemy] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT k, d, s FROM cities WHERE id = ${otherCityId}
    `);
    const err = await missions.sendTransport({
      originCityId: cityId, playerId, worldId,
      target: { k: Number(enemy!['k']), d: Number(enemy!['d']), s: Number(enemy!['s']) },
      units: { cargo_wagon: 5 }, cargo: { gold: 100, food: 0 }, at,
    }).catch((e: unknown) => e as MissionError);
    expect((err as MissionError).code).toBe('on_vacation');
  });

  it('BAŞKASI ona saldıramaz (target_vacation)', async () => {
    const at = await clock.gameNow(worldId);
    await h.db.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${otherCityId}, 'dwarf', 50)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 50
    `);
    const [me] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT k, d, s FROM cities WHERE id = ${cityId}
    `);
    const err = await missions.sendAttack({
      originCityId: otherCityId, playerId: otherId, worldId,
      target: { k: Number(me!['k']), d: Number(me!['d']), s: Number(me!['s']) },
      units: { dwarf: 10 }, at,
    }).catch((e: unknown) => e as MissionError);
    expect((err as MissionError).code).toBe('target_vacation');
  });

  it('⭐ CASUS da gönderilemez (kullanıcı kararı: engelli kalır)', async () => {
    const at = await clock.gameNow(worldId);
    await h.db.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${otherCityId}, 'spy_bird', 20)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 20
    `);
    const [me] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT k, d, s FROM cities WHERE id = ${cityId}
    `);
    const err = await missions.sendSpy({
      originCityId: otherCityId, playerId: otherId, worldId,
      target: { k: Number(me!['k']), d: Number(me!['d']), s: Number(me!['s']) },
      units: { spy_bird: 5 }, at,
    }).catch((e: unknown) => e as MissionError);
    expect((err as MissionError).code).toBe('target_vacation');
  });
});

/* ══ İttifak listesindeki «Tatilde» ═════════════════════════════════════════ */

describe('ittifak listesi', () => {
  /**
   * ⭐ Ekranın mavi «Tatilde» yazısı bu tek alandan besleniyor (sağ panel + ittifak sayfası).
   * ⚠️ `online` ile BİRLEŞTİRİLMEDİ: tatildeki oyuncu bağlı olabilir. Test ikisinin bağımsız
   * olduğunu da kilitliyor — birleştiren bir "iyileştirme" burada kırmızı yanar.
   */
  it('üye satırı `onVacation` taşır ve `online`dan bağımsızdır', async () => {
    const alliances = new AllianceService(h.db);
    const ctl = new AllianceController(h.db);
    const req = (pid: number): AuthedRequest =>
      ({ player: { playerId: pid, worldId, accountId: 0, sessionId: '' } } as unknown as AuthedRequest);

    /* İttifak kurmak Kale ön-şartı istiyor; bu test onu ölçmüyor, kısayoldan veriliyor. */
    await h.db.execute(sql`
      INSERT INTO buildings (city_id, type, level) VALUES (${cityId}, 'castle', 20)
      ON CONFLICT (city_id, type) DO UPDATE SET level = 20
    `);
    await alliances.found({ worldId, playerId, name: 'Tatilci', text: 'test' });
    const a = await alliances.myMembership(playerId);
    await h.db.execute(sql`
      UPDATE players SET alliance_id = ${a!.allianceId}, alliance_role = 1 WHERE id = ${otherId}
    `);

    const once = await ctl.mine(req(playerId)) as { alliance: { members: Record<string, unknown>[] } };
    expect(once.alliance.members.every((m) => m['onVacation'] === false)).toBe(true);

    await vacation.enter(otherId, await clock.gameNow(worldId));

    const sonra = await ctl.mine(req(playerId)) as { alliance: { members: Record<string, unknown>[] } };
    const tatilci = sonra.alliance.members.find((m) => Number(m['playerId']) === otherId)!;
    const digeri = sonra.alliance.members.find((m) => Number(m['playerId']) === playerId)!;
    expect(tatilci['onVacation']).toBe(true);
    expect(digeri['onVacation']).toBe(false);
    // Çevrimiçilik ayrı eksen: ikisi de çevrimdışı (WS ağ geçidi testte yok).
    expect(tatilci['online']).toBe(false);
  });
});
