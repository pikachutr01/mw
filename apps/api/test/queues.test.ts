/**
 * ⭐ FAZ 2 — üretim/ilerletme kuyruğu testleri.
 *
 * Kritik olan: kuyruk satırı ile bitiş görevi AYNI transaction'da yazılıyor, bitiş Faz 1
 * omurgasından geçiyor ve kurallar (ön-şart · tavan · Kale bütçesi · Sur kapasitesi) uygulanıyor.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildingCost, buildingTimeSeconds, defenseCapacity, STARTING_RESOURCES, techTimeSeconds,
  timeFromCost, trainingTimeSeconds, UNITS_BY_ID,
} from '@mobilwar/catalog';
import { AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CaveService } from '../src/cave/cave.service.ts';
import { CapacityService, DEFAULT_AREA_RULES } from '../src/cities/capacity.service.ts';
import { CityController } from '../src/cities/city.controller.ts';
import { CityService } from '../src/cities/city.service.ts';
import { SettingsService } from '../src/settings/settings.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { echoHandler } from '../src/missions/echo.handler.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import { QUEUE_HANDLERS } from '../src/queues/queue.handlers.ts';
import { QueueError, QueueService } from '../src/queues/queue.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, freshWorldId, setupTestDb, verifyEmail, dueAt } from './helpers/db.ts';

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
  auth = new AuthService(h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock, cities);
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
  // Kayıt akışı hesabı doğrulanmamış bırakır; bu dosya §verify kısıtlarını ölçmüyor.
  await verifyEmail(h, playerId);
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
    expect(snap!.gold).toBe(STARTING_RESOURCES.gold - cost.gold);

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
      UPDATE missions SET execute_at = ${await dueAt(clock, worldId)}::timestamptz WHERE id IN
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
    await giveResources(2, 2);
    const at = await clock.gameNow(worldId);

    // Çiftlik'in ön-şartı yok → doğrudan kaynak kontrolüne düşer (Çiftlik 1→2 = 3 altın + 4 yemek).
    await expect(queues.enqueueBuilding({ cityId, playerId, type: 'farm', at }))
      .rejects.toThrow(/Kaynak yetersiz/);

    const snap = await cities.snapshot(cityId, at);
    expect(snap!.gold).toBe(2);
    expect(await queues.openQueues(cityId)).toHaveLength(0);
  });

  it('ön-şart karşılanmazsa reddedilir ve EKSİKLERİN TAMAMI bildirilir', async () => {
    await giveResources(10_000_000, 10_000_000);
    const at = await clock.gameNow(worldId);
    // Teleport → Kale 12 + Mimar Okulu 12 + Büyücülük 12 (doküman); hepsi eksik
    const err = await queues.enqueueBuilding({ cityId, playerId, type: 'teleport', at })
      .catch((e: unknown) => e as QueueError);
    expect(err).toBeInstanceOf(QueueError);
    expect((err as QueueError).code).toBe('requirements_unmet');
    expect((err as QueueError).message).toMatch(/Mimar Okulu 12/);
    expect((err as QueueError).message).toMatch(/Kale 12/);
    expect((err as QueueError).message).toMatch(/Büyücülük 12/);
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
    /* Kale 1 → bütçe 10. ⚠️ Baraka 2026-08-09'da 0 seviyeden başlıyor, yani başlangıç toplamı
       bir eksildi (Çiftlik + Maden = 2). Bütçeyi doldurmak için Çiftlik 8 yerine 9 gerekiyor:
       Çiftlik 9 + Maden 1 = 10. */
    await setLevel('farm', 9);
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
  /**
   * ⚠️ **Baraka AÇIKÇA kuruluyor** (2026-08-09): şehirler artık Baraka 0 ile doğuyor
   * (kullanıcı kararı, `STARTING_BUILDINGS`). Öncesinde bedava sv1 vardı ve bu blok ona
   * sessizce güveniyordu. Süre formülü de Baraka seviyesine bölüyor, yani sayı testin
   * parçası — kurulumu görünür kılmak beklenen sürelerin neden o olduğunu da açıklıyor.
   */
  beforeEach(async () => { await setLevel('barracks', 1); });

  it('ön-şart sağlanınca kuyruk açılır ve bitişte barakaya eklenir', async () => {
    await setTech('blacksmithing', 1);
    // ⚠️ 5 Cüce = 1.000 altın + 2.250 yemek; başlangıç kesesi (1.000/1.000) yetmiyor.
    await giveResources(10_000, 10_000);
    const at = await clock.gameNow(worldId);

    const q = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 5, at });
    expect(q.count).toBe(5);
    // ⭐ §13.11.3: 190 × ((200+450+10)/1000)^0,8 / 1,2^Baraka. Baraka 1 → 113,6 sn/birim.
    const birim = (190 * 0.66 ** 0.8) / 1.2;
    expect((q.finishAt.getTime() - at.getTime()) / 1000).toBeCloseTo(birim * 5, 0);

    // ⭐ Üretim TEKER TEKER ve tembel: zamanı ileri almak için kuyruğun başlangıcını geriye
    //    çekiyoruz (oyun saatini beklemek yerine). Beş birimlik süre geçince beşi de eklenmiş olur.
    await h.db.execute(sql`
      UPDATE queues SET started_at = ${await dueAt(clock, worldId, 3600000)}::timestamptz, finish_at = ${await dueAt(clock, worldId)}::timestamptz
       WHERE id = ${q.id}
    `);
    await h.db.execute(sql`
      UPDATE missions SET execute_at = ${await dueAt(clock, worldId)}::timestamptz
       WHERE id IN (SELECT mission_id FROM queues WHERE id = ${q.id})
    `);
    await scheduler().tick();

    expect((await unitCounts())['dwarf']).toBe(5);
    expect(await queues.openQueues(cityId)).toHaveLength(0);
  });

  /**
   * ⭐ ÇEVRİMDIŞI ÜRETİM — kullanıcının işaret ettiği kritik senaryo: emri verip oyundan çıkan
   * oyuncunun şehrine saldırı gelirse, o ana kadar üretilmiş askerler savaşta HAZIR olmalı.
   * Üretim tembel ilerlediği için `materialize` (savaş çözümünün ilk adımı) bunu sağlar.
   */
  it('⭐ askerler TEKER TEKER eklenir; şehir okunduğu anda o ana kadarki üretim hazırdır', async () => {
    await setTech('blacksmithing', 1);
    await giveResources(1e9, 1e9);
    const at = await clock.gameNow(worldId);

    const q = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 100, at });
    const perUnit = (190 * 0.66 ** 0.8) / 1.2;

    // Henüz hiçbiri bitmedi.
    expect((await unitCounts())['dwarf'] ?? 0).toBe(0);

    // Tam 10 birimlik süre geçmiş gibi yap.
    const gecen = Math.round(perUnit * 10);
    await h.db.execute(sql`
      UPDATE queues SET started_at = now() - (${gecen}::int * interval '1 second') WHERE id = ${q.id}
    `);
    await cities.snapshot(cityId, new Date());

    expect((await unitCounts())['dwarf']).toBe(10);
    const open = await queues.openQueues(cityId);
    expect(open[0]!.done).toBe(10);          // sipariş sürüyor
    expect(open[0]!.count).toBe(100);
  });

  it('⭐ aynı anda BARAKA SEVİYESİ kadar emir; fazlası reddedilir', async () => {
    await setTech('blacksmithing', 1);
    await giveResources(1e9, 1e9);
    await setLevel('barracks', 2);
    const at = await clock.gameNow(worldId);

    const a = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 10, at });
    const b = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 20, at });
    expect(a.position).toBe(1);
    expect(b.position).toBe(2);

    await expect(queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 5, at }))
      .rejects.toThrow(/en fazla 2 üretim emri/);
  });

  /**
   * ⭐ TEK ÜRETİM BANDI — kullanıcının fabrika benzetmesi: 10 kazak bitmeden 20 gömleğin
   * üretimi BAŞLAMAZ. 🐛 Bu test, emirlerin paralel geri sayıp iptalden sonra hepsinin birden
   * üretilmesi hatasını kilitliyor.
   */
  it('⭐ kuyruktaki emir, öndeki BİTMEDEN üretmez ve saymaz', async () => {
    await setTech('blacksmithing', 1);
    await setTech('archery', 1);
    await giveResources(1e9, 1e9);
    await setLevel('barracks', 3);
    const at = await clock.gameNow(worldId);

    const a = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 10, at });
    const b = await queues.enqueueUnits({ cityId, playerId, type: 'elf', count: 20, at });

    // 2. emir 1.'nin BİTİŞİNDE başlar → başlangıcı a.finishAt'e eşit.
    expect(b.startedAt.getTime()).toBeGreaterThanOrEqual(a.finishAt.getTime() - 1000);
    expect(b.finishAt.getTime()).toBeGreaterThan(a.finishAt.getTime());

    // 1. emrin süresinin yarısı geçtiğinde: Cüce üretilmiş, Elf HİÇ üretilmemiş olmalı.
    const perDwarf = (190 * 0.66 ** 0.8) / 1.2 ** 3;
    await h.db.execute(sql`
      UPDATE queues SET started_at = started_at - (${Math.ceil(perDwarf * 5) + 1}::int * interval '1 second'),
                        finish_at  = finish_at  - (${Math.ceil(perDwarf * 5) + 1}::int * interval '1 second')
       WHERE city_id = ${cityId} AND category = 'unit'
    `);
    await cities.snapshot(cityId, new Date());
    const u = await unitCounts();
    expect(u['dwarf']).toBe(5);
    expect(u['elf'] ?? 0).toBe(0);          // ← paralel ilerleme YOK

    // 1. emri iptal et → 2. emir HEMEN bandı devralır ve o an başlar.
    await queues.cancel({ queueId: a.id, playerId, at: new Date() });
    const open = await queues.openQueues(cityId);
    expect(open).toHaveLength(1);
    expect(open[0]!.itemType).toBe('elf');
    expect(open[0]!.position).toBe(1);
    expect(open[0]!.done).toBe(0);
    // Elf'in sayacı ancak ŞİMDİ başlıyor: bitişi hâlâ ilerde.
    expect(open[0]!.finishAt.getTime()).toBeGreaterThan(Date.now());
    expect((await unitCounts())['elf'] ?? 0).toBe(0);
  });

  it('⭐ iptalde YALNIZ kalan adet iade edilir (üretilenler geri alınmaz)', async () => {
    await setTech('blacksmithing', 1);
    await giveResources(1e9, 1e9);
    const at = await clock.gameNow(worldId);
    const def = UNITS_BY_ID['dwarf']!;

    const q = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 100, at });
    const perUnit = (190 * 0.66 ** 0.8) / 1.2;
    await h.db.execute(sql`
      UPDATE queues SET started_at = now() - (${Math.ceil(perUnit * 40) + 1}::int * interval '1 second')
       WHERE id = ${q.id}
    `);

    const r = await queues.cancel({ queueId: q.id, playerId, at: new Date() });
    // 40 üretildi → kalan 60; iade = 59 birim (bir birim eksik kuralı).
    expect((await unitCounts())['dwarf']).toBe(40);
    expect(r.refunded.gold).toBeCloseTo(def.gold * 59, -1);
  });

  it('teknik ön-şartı olmayan birim üretilemez', async () => {
    const at = await clock.gameNow(worldId);
    // Cüce → Demircilik 1 gerekiyor (şu an 0)
    await expect(queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 1, at }))
      .rejects.toThrow(/Demircilik 1/);
  });

  it('Baraka ön-şartı olmayan birim üretilemez', async () => {
    await giveResources(1e12, 1e12);
    await setTech('sorcery', 20);
    const at = await clock.gameNow(worldId);
    // Kaos → Baraka 15 gerekiyor (şu an 1)
    await expect(queues.enqueueUnits({ cityId, playerId, type: 'chaos', count: 1, at }))
      .rejects.toThrow(/Baraka 15/);
  });

  it('geçersiz adet reddedilir', async () => {
    await setTech('blacksmithing', 1);
    const at = await clock.gameNow(worldId);
    await expect(queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 0, at })).rejects.toThrow();
    await expect(queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: -3, at })).rejects.toThrow();
  });

  it('üretim adetle ölçeklenen kaynak harcar', async () => {
    await setTech('blacksmithing', 1);
    // ⚠️ Başlangıç kesesi 5 Cüce'ye yetmiyor (1.000/1.000 ↔ 1.000 altın + 2.250 yemek).
    const kese = { gold: 10_000, food: 10_000 };
    await giveResources(kese.gold, kese.food);
    const at = await clock.gameNow(worldId);
    const def = UNITS_BY_ID['dwarf']!;

    await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 5, at });

    const snap = await cities.snapshot(cityId, at);
    expect(snap!.gold).toBe(kese.gold - def.gold * 5);
    expect(snap!.food).toBe(kese.food - def.food * 5);
  });
});

describe('savunma birimi üretimi', () => {
  /**
   * ⭐ KULLANICI KARARI (2026-07-27): Sur kapasitesi artık **kapı değil**. Savunma birimleri,
   * üretim ön-şartları sağlandığı sürece istenildiği kadar üretilebilir. Mekanizma silinmedi —
   * `DEFAULT_AREA_RULES.defenseCapacity.enforced` ile tek satırda geri gelir. Test hem kapının
   * açık olduğunu hem de kuralın kapatılınca yeniden çalıştığını doğrular; yoksa "kapalı" karar
   * sessizce "kaybolmuş" kurala dönüşürdü.
   */
  it('⭐ Sur kapasitesi UYGULANMIYOR — kapasitenin çok üstünde savunma üretilebilir', async () => {
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
    })).resolves.toBeTruthy();

    // Hesap yine yapılıyor: kapasite aşıldı, yalnız kapı kapanmıyor.
    const acik = new CapacityService();
    const durum = acik.defenseCapacity({ wall: 1 }, { archer_tower: sigar + 100 });
    expect(durum.used).toBeGreaterThan(durum.total);
    expect(durum.fits).toBe(true);

    // Kural açılırsa aynı girdi reddedilir (mekanizma canlı).
    const kapali = new CapacityService({
      ...DEFAULT_AREA_RULES,
      defenseCapacity: { ...DEFAULT_AREA_RULES.defenseCapacity, enforced: true },
    });
    expect(kapali.defenseCapacity({ wall: 1 }, { archer_tower: sigar + 100 }).fits).toBe(false);
    expect(kapali.defenseCapacity({ wall: 1 }, { archer_tower: sigar }).fits).toBe(true);
  });

  it('Sur SEVİYE olarak ilerler (adet değil)', async () => {
    await giveResources(1e12, 1e12);
    const at = await clock.gameNow(worldId);

    const q = await queues.enqueueDefense({ cityId, playerId, type: 'wall', count: 1, at });
    expect(q.targetLevel).toBe(1);
    expect(q.count).toBeNull();

    await h.db.execute(sql`
      UPDATE missions SET execute_at = ${await dueAt(clock, worldId)}::timestamptz
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
      UPDATE missions SET execute_at = ${await dueAt(clock, worldId)}::timestamptz
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
      .rejects.toThrow(/Akademi 10/);
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

/**
 * ⭐ BARAKA ↔ ASKER, AKADEMİ ↔ TEKNİK KARŞILIKLI KİLİT (§13.11.6, kullanıcı 2026-08-06).
 *
 * Kural şehir başına ve ÇİFT YÖNLÜ. Aşağıdaki testler dört yönün dördünü ayrı ayrı ölçüyor;
 * son üçü kilidin **fazla geniş olmadığını** kanıtlıyor (başka şehir · savunma birimi ·
 * alâkasız bina) — tek başına "engelledi" testleri kilit her şeyi kapatsa da yeşil kalırdı.
 */
describe('Baraka ↔ asker, Akademi ↔ teknik kilidi', () => {
  beforeEach(async () => {
    await giveResources(1e12, 1e12);
    await setTech('blacksmithing', 1);   // Cüce ön-şartı
    // ⚠️ Baraka 2026-08-09'dan beri 0 başlıyor; Cüce ön-şartı Baraka 1 istiyor.
    await setLevel('barracks', 1);
  });

  it('Baraka yükseltilirken asker üretilemez', async () => {
    const at = await clock.gameNow(worldId);
    await queues.enqueueBuilding({ cityId, playerId, type: 'barracks', at });

    const err = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 5, at })
      .then(() => null).catch((e: unknown) => e as QueueError);
    expect(err).toBeInstanceOf(QueueError);
    expect((err as QueueError).code).toBe('slot_busy');
    expect((err as QueueError).message).toMatch(/Baraka yükseltilirken asker üretilemez/);
  });

  it('asker üretimi varken Baraka yükseltilemez', async () => {
    const at = await clock.gameNow(worldId);
    await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 5, at });

    const err = await queues.enqueueBuilding({ cityId, playerId, type: 'barracks', at })
      .then(() => null).catch((e: unknown) => e as QueueError);
    expect((err as QueueError).code).toBe('slot_busy');
    expect((err as QueueError).message).toMatch(/asker üretimi sürerken Baraka yükseltilemez/);
  });

  /**
   * ⚠️ Kullanıcının şartında «kuyruk da dahil» geçiyor: üretimi HENÜZ BAŞLAMAMIŞ, sırada
   * bekleyen bir emir de Baraka'yı kilitlemeli. Öndeki emri elle `completed_at` işaretleyerek
   * geriye YALNIZ bekleyen emir bırakılıyor — kilidin `position`a bakmadığı böyle ölçülüyor.
   */
  it('⭐ sırada BEKLEYEN emir de Baraka\'yı kilitler', async () => {
    await setLevel('barracks', 2);
    const at = await clock.gameNow(worldId);
    const first = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 5, at });
    const second = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 5, at });
    expect(second.position).toBe(2);

    await h.db.execute(sql`UPDATE queues SET completed_at = now() WHERE id = ${first.id}`);

    await expect(queues.enqueueBuilding({ cityId, playerId, type: 'barracks', at }))
      .rejects.toThrow(/asker üretimi sürerken Baraka yükseltilemez/);
  });

  it('Akademi yükseltilirken teknik araştırılamaz', async () => {
    await setLevel('castle', 3);          // Akademi ön-şartı: Kale 2
    await setLevel('academy', 1);         // Demircilik ön-şartı: Akademi 1
    const at = await clock.gameNow(worldId);
    await queues.enqueueBuilding({ cityId, playerId, type: 'academy', at });

    const err = await queues.enqueueTech({ cityId, playerId, type: 'armor', at })
      .then(() => null).catch((e: unknown) => e as QueueError);
    expect((err as QueueError).code).toBe('slot_busy');
    expect((err as QueueError).message).toMatch(/Akademi yükseltilirken teknik araştırılamaz/);
  });

  it('teknik araştırılırken Akademi yükseltilemez', async () => {
    await setLevel('castle', 3);
    await setLevel('academy', 1);
    const at = await clock.gameNow(worldId);
    await queues.enqueueTech({ cityId, playerId, type: 'armor', at });

    const err = await queues.enqueueBuilding({ cityId, playerId, type: 'academy', at })
      .then(() => null).catch((e: unknown) => e as QueueError);
    expect((err as QueueError).code).toBe('slot_busy');
    expect((err as QueueError).message).toMatch(/araştırma sürerken Akademi yükseltilemez/);
  });

  it('⭐ kilit ŞEHİR BAŞINA — diğer şehir etkilenmez', async () => {
    const at = await clock.gameNow(worldId);
    await queues.enqueueBuilding({ cityId, playerId, type: 'barracks', at });

    const city2 = await cities.create({
      worldId, playerId, name: 'ikinci', k: 5, d: 5, s: 5, isCapital: false, at,
    });
    await h.db.execute(sql`UPDATE cities SET gold = 1e9, food = 1e9 WHERE id = ${city2}`);
    /* ⚠️ İkinci şehre Baraka AÇIKÇA kuruluyor: 2026-08-09'dan beri yeni şehirler de Baraka 0
       ile doğuyor, yani Cüce ön-şartı (Baraka 1) kendiliğinden sağlanmıyor. Testin ölçtüğü şey
       bu değil — kilidin şehir başına olduğu. */
    await h.db.execute(sql`
      INSERT INTO buildings (city_id, type, level) VALUES (${city2}, 'barracks', 1)
      ON CONFLICT (city_id, type) DO UPDATE SET level = 1
    `);

    // İkinci şehrin barakası boşta → üretim serbest.
    await expect(queues.enqueueUnits({ cityId: city2, playerId, type: 'dwarf', count: 5, at }))
      .resolves.toBeTruthy();
  });

  /**
   * ⭐ SAVUNMA BİRİMLERİ KAPSAM DIŞI: `trap`/`archer_tower` Baraka'da değil Sur'da üretiliyor
   * (ön-şart `wall`), dolayısıyla Baraka yükseltmesi onları kilitlememeli.
   */
  it('⭐ Baraka yükseltmesi savunma birimini engellemez', async () => {
    const at = await clock.gameNow(worldId);
    await h.db.execute(sql`
      INSERT INTO defenses (city_id, type, count) VALUES (${cityId}, 'wall', 1)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 1
    `);
    await setLevel('wall', 1);            // ön-şart kontrolü buildings'ten okuyor
    await queues.enqueueBuilding({ cityId, playerId, type: 'barracks', at });

    await expect(queues.enqueueDefense({ cityId, playerId, type: 'trap', count: 3, at }))
      .resolves.toBeTruthy();
  });

  it('⭐ alâkasız bina (Çiftlik) asker üretimini engellemez', async () => {
    const at = await clock.gameNow(worldId);
    await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });

    await expect(queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 5, at }))
      .resolves.toBeTruthy();
  });

  it('iptal kilidi çözer', async () => {
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 5, at });
    await expect(queues.enqueueBuilding({ cityId, playerId, type: 'barracks', at })).rejects.toThrow();

    await queues.cancel({ queueId: q.id, playerId, at });

    await expect(queues.enqueueBuilding({ cityId, playerId, type: 'barracks', at }))
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

    await h.db.execute(sql`UPDATE missions SET execute_at = ${await dueAt(clock, worldId)}::timestamptz WHERE id = ${missionId}`);
    await scheduler().tick();
    expect((await buildings())['farm']).toBe(2);

    // Görevi elle yeniden kuyruğa alıp bir daha çalıştır: seviye ARTMAMALI.
    await h.db.execute(sql`
      UPDATE missions SET status = 'scheduled', execute_at = ${await dueAt(clock, worldId)}::timestamptz, finished_at = NULL
       WHERE id = ${missionId}
    `);
    await scheduler().tick();
    expect((await buildings())['farm']).toBe(2);
  });
});

describe('⭐ kuyruk iptali (orijinalde "Yapımı Durdur" / "İlerletmeyi Durdur")', () => {
  /* ⚠️ Savaşçı iptali testleri asker üretiyor; Baraka 2026-08-09'dan beri 0 başlıyor. */
  beforeEach(async () => { await setLevel('barracks', 1); });

  it('⭐ YAPI iptali SÜREYE göre iade eder (dokümanın kuralı)', async () => {
    const at = await clock.gameNow(worldId);
    const cost = buildingCost('farm', 2);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });

    // Hemen iptal → ilerleme ~0 → neredeyse tamamı iade.
    const { refunded, rule, progress } = await queues.cancel({ queueId: q.id, playerId, at });

    expect(rule).toBe('timeProgress');
    expect(progress).toBeCloseTo(0, 2);
    expect(refunded.gold).toBe(cost.gold);
    expect(await queues.openQueues(cityId)).toHaveLength(0);

    const m = await h.db.execute<Record<string, unknown>>(sql`
      SELECT status FROM missions WHERE id IN (SELECT mission_id FROM queues WHERE id = ${q.id})
    `);
    expect(String(m[0]!['status'])).toBe('canceled');

    const snap = await cities.snapshot(cityId, at);
    expect(snap!.gold).toBe(STARTING_RESOURCES.gold);   // hemen iptal → kese başa döndü
  });

  it('⭐ dokümanın ÖRNEĞİ birebir: %20 tamamlanmış yapı iptalinde %80 iade', async () => {
    const at = await clock.gameNow(worldId);
    const cost = buildingCost('farm', 2);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });

    // Sürenin %20'si geçmiş anda iptal et.
    const span = q.finishAt.getTime() - q.startedAt.getTime();
    const yuzde20 = new Date(q.startedAt.getTime() + span * 0.2);
    const { refunded, progress } = await queues.cancel({ queueId: q.id, playerId, at: yuzde20 });

    expect(progress).toBeCloseTo(0.2, 2);
    expect(refunded.gold).toBe(Math.floor(cost.gold * 0.8));
    expect(refunded.food).toBe(Math.floor(cost.food * 0.8));
  });

  it('⭐ SAVAŞÇI iptali BİR BİRİM EKSİK iade eder (dokümanın kuralı)', async () => {
    await setTech('blacksmithing', 1);
    await giveResources(10_000, 10_000);   // 5 Cüce başlangıç kesesini aşıyor
    const at = await clock.gameNow(worldId);
    const def = UNITS_BY_ID['dwarf']!;
    const q = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 5, at });

    const { refunded, rule } = await queues.cancel({ queueId: q.id, playerId, at });

    expect(rule).toBe('minusOneUnit');
    // 5 sipariş → 4 birimin ücreti iade, 1 birim yanar (üretimdeki savaşçı).
    expect(refunded.gold).toBe(def.gold * 4);
    expect(refunded.food).toBe(def.food * 4);
  });

  it('TEK birimlik sipariş iptalinde HİÇ iade yok', async () => {
    await setTech('blacksmithing', 1);
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 1, at });

    const { refunded } = await queues.cancel({ queueId: q.id, playerId, at });

    expect(refunded).toEqual({ gold: 0, food: 0 });
  });

  it('pahalı birimlerde iptal AĞIR (dokümanın Ejderha/Kaos uyarısı)', async () => {
    await giveResources(1e11, 1e11);
    await setLevel('barracks', 10);
    await setTech('sorcery', 12);
    const at = await clock.gameNow(worldId);
    const dragon = UNITS_BY_ID['dragon']!;
    const q = await queues.enqueueUnits({ cityId, playerId, type: 'dragon', count: 2, at });

    const { refunded } = await queues.cancel({ queueId: q.id, playerId, at });

    // 2 Ejderha siparişinin iptali BİR Ejderhayı yakar.
    expect(refunded.gold).toBe(dragon.gold);
    expect(dragon.gold).toBeGreaterThan(40_000);
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
      UPDATE missions SET status = 'scheduled', execute_at = ${await dueAt(clock, worldId)}::timestamptz, finished_at = NULL
       WHERE id = ${missionId}
    `);
    await scheduler().tick();
    expect((await buildings())['farm']).toBe(1);
  });

  it('ek denge çarpanı (refundRatio) iadeyi ayrıca kısar', async () => {
    const at = await clock.gameNow(worldId);
    const cost = buildingCost('farm', 2);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    const { refunded } = await queues.cancel({ queueId: q.id, playerId, at, refundRatio: 0.5 });
    expect(refunded.gold).toBe(Math.floor(cost.gold * 0.5));
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

/**
 * ⭐ SUR TAM YIKILDIYSA SAVUNMA BİRİMİ ÜRETİLEMEZ (§13.21.2, kullanıcı kararı 2026-07-29).
 * Kilit yalnız TAM yıkımda (bütünlük %0) ve yalnız birim şeridinde geçerli — kısmi hasarda
 * sur ayakta, üretim sürer; Sur/Büyü Kalkanı yükseltmeleri hiçbir hâlde engellenmez.
 */
describe('yıkık sur savunma üretimini kilitler', () => {
  async function setWall(integrity: number, repairMinutes: number | null): Promise<void> {
    await h.db.execute(sql`
      UPDATE cities
         SET wall_integrity = ${integrity}::numeric,
             wall_repair_from = ${repairMinutes == null ? null : sql`now()`},
             wall_repair_until = ${repairMinutes == null
    ? null
    : sql`now() + (${repairMinutes} || ' minutes')::interval`}
       WHERE id = ${cityId}
    `);
  }

  beforeEach(async () => {
    await giveResources(1e12, 1e12);
    // ⚠️ Sur SEVİYESİ `defenses` tablosunda durur (`structureLevels`), `buildings`ta değil.
    await h.db.execute(sql`
      INSERT INTO defenses (city_id, type, count) VALUES (${cityId}, 'wall', 3)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 3
    `);
    await setTech('archery', 1);   // okçu kulesinin ön-şartı
  });

  it('sur %0 ve onarımdayken savunma birimi reddedilir', async () => {
    const at = await clock.gameNow(worldId);
    await setWall(0, 120);
    await expect(queues.enqueueDefense({ cityId, playerId, type: 'archer_tower', count: 1, at }))
      .rejects.toMatchObject({ code: 'wall_destroyed' });
  });

  it('KISMİ hasarda üretim serbest — sur hâlâ ayakta', async () => {
    const at = await clock.gameNow(worldId);
    await setWall(0.35, 120);
    await expect(queues.enqueueDefense({ cityId, playerId, type: 'archer_tower', count: 1, at }))
      .resolves.toBeTruthy();
  });

  it('onarım bitince kilit kalkar', async () => {
    const at = await clock.gameNow(worldId);
    await setWall(0, -5);            // bitiş anı geçmişte
    await expect(queues.enqueueDefense({ cityId, playerId, type: 'archer_tower', count: 1, at }))
      .resolves.toBeTruthy();
  });

  /**
   * ⭐ TERSİNE DÖNDÜ (kullanıcı, 2026-07-30): "tamirat sırasında sur seviyesi artırılamaz."
   * Önceki kural yükseltmeye izin veriyordu; artık onarım — KISMİ hasar dahil — bitmeden
   * Sur seviyesi yükseltilemez. Büyü Kalkanı etkilenmez.
   */
  it('onarımdaki Sur YÜKSELTİLEMEZ (kısmi hasarda bile)', async () => {
    const at = await clock.gameNow(worldId);
    await setWall(0, 120);
    await expect(queues.enqueueDefense({ cityId, playerId, type: 'wall', count: 1, at }))
      .rejects.toMatchObject({ code: 'wall_repairing' });

    await setWall(0.6, 120);   // kısmi hasar: birim üretimi serbest ama yükseltme yine kilitli
    await expect(queues.enqueueDefense({ cityId, playerId, type: 'wall', count: 1, at }))
      .rejects.toMatchObject({ code: 'wall_repairing' });
  });

  it('onarım bitince Sur yükseltmesi tekrar açılır', async () => {
    const at = await clock.gameNow(worldId);
    await setWall(0.6, -5);    // bitiş geçmişte → onarım tamam sayılır
    await expect(queues.enqueueDefense({ cityId, playerId, type: 'wall', count: 1, at }))
      .resolves.toBeTruthy();
  });
});

/**
 * ⭐ DÜNYA HIZ ÇARPANLARI (§13.7, kullanıcı 2026-07-30): `training_multiplier` birim
 * üretimini, `construction_multiplier` bina/Sur seviyesi/teknik sürelerini böler.
 * Varsayılan 1 → klasik hız; buradaki testler çarpanın GERÇEKTEN uygulandığını kilitler
 * (kaynak/sefer çarpanlarının başına gelen "yarım kalmış sabit" tuzağı tekrarlanmasın).
 */
describe('dünya hız çarpanları üretim/inşaat sürelerini böler', () => {
  async function setMultipliers(training: number, construction: number): Promise<void> {
    await h.db.execute(sql`
      UPDATE worlds SET training_multiplier = ${training}, construction_multiplier = ${construction}
       WHERE id = ${worldId}
    `);
  }
  /** Kesirli saniye korunur (ms hassasiyeti) — yuvarlama YOK. */
  const durationOf = (q: { startedAt: Date; finishAt: Date }): number =>
    (q.finishAt.getTime() - q.startedAt.getTime()) / 1000;

  it('inşaat çarpanı bina süresini böler', async () => {
    await setMultipliers(1, 4);
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    expect(durationOf(q)).toBe(Math.round(buildingTimeSeconds('farm', 2, 0) / 4));
  });

  it('birim çarpanı Baraka süresini böler (kesir korunur)', async () => {
    await giveResources(1e9, 1e9);
    await setLevel('barracks', 1);
    await setTech('blacksmithing', 1);   // Cüce ön-şartı
    await setMultipliers(2, 1);
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 10, at });
    const perUnit = trainingTimeSeconds('dwarf', 1) / 2;
    expect(Number(q.perUnitSeconds)).toBeCloseTo(perUnit, 1);
    expect(durationOf(q)).toBeCloseTo(perUnit * 10, 1);
  });

  it('savunma birimi training, Sur seviyesi construction çarpanını kullanır', async () => {
    await giveResources(1e12, 1e12);
    await setTech('archery', 1);
    await h.db.execute(sql`
      INSERT INTO defenses (city_id, type, count) VALUES (${cityId}, 'wall', 3)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 3
    `);
    await setMultipliers(3, 5);
    const at = await clock.gameNow(worldId);

    const tower = await queues.enqueueDefense({ cityId, playerId, type: 'archer_tower', count: 4, at });
    expect(Number(tower.perUnitSeconds)).toBeCloseTo(trainingTimeSeconds('archer_tower', 0) / 3, 1);

    const wall = UNITS_BY_ID['wall']!;
    const cost = {
      gold: Math.round(wall.gold * 1.8 ** 3),   // mevcut sv 3 → hedef 4
      food: Math.round(wall.food * 1.8 ** 3),
    };
    const up = await queues.enqueueDefense({ cityId, playerId, type: 'wall', count: 1, at });
    expect(durationOf(up)).toBe(Math.round(timeFromCost(cost, 0) / 5));
  });

  it('teknik süresi construction çarpanına bölünür', async () => {
    await giveResources(1e9, 1e9);
    await setLevel('academy', 2);
    await setMultipliers(1, 6);
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueTech({ cityId, playerId, type: 'blacksmithing', at });
    expect(durationOf(q)).toBe(Math.round(techTimeSeconds('blacksmithing', 1, 2) / 6));
  });

  it('çarpan 1 iken süreler değişmez (klasik hız)', async () => {
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    expect(durationOf(q)).toBe(Math.round(buildingTimeSeconds('farm', 2, 0)));
  });

  /* ── EKRAN İLE KUYRUK AYNI SÜREYİ SÖYLEMELİ (kullanıcı, 2026-08-08) ─────────────────── */

  /**
   * ⭐⭐ ASIL BEKÇİ. Kullanıcı: *"İnşaat süresi hızını 10 kat yapıp yükseltme başlattığımda
   * geri sayım hızlanmış görünüyor ama binanın yanında yazan süre 1x hâliyle duruyor."*
   *
   * Sebep: çarpanı YALNIZ `queue.service` uyguluyordu; katalog ucu (ekrandaki süre) bölmeden
   * gönderiyordu. Yukarıdaki testler kuyruğu ölçüyor, ekranı hiç ölçmüyordu — arıza tam o
   * boşlukta yaşıyordu.
   *
   * ⚠️ Ölçülen şey bir formül değil, **iki tarafın eşitliği**: ekranda yazan süre, kuyruğa
   * gerçekten yazılan süreye (yuvarlanmış hâliyle) eşit olmalı. Formülü tekrar yazsaydım
   * ikisi de benim yazdığıma uyar ama birbirinden yine kayabilirdi.
   */
  const catalogOf = async (): Promise<Record<string, Record<string, unknown>[]>> => {
    const ctl = new CityController(
      cities, queues, new CaveService(h.db), clock, new SettingsService(h.db), h.db,
    );
    return await ctl.catalog(
      String(cityId), { player: { playerId, worldId } } as never,
    ) as never;
  };
  const pick = (rows: Record<string, unknown>[], id: string): Record<string, unknown> =>
    rows.find((r) => r['id'] === id)!;

  it('⭐⭐ ekrandaki bina süresi, kuyruğun yazdığı süreyle AYNI', async () => {
    await setMultipliers(1, 10);
    const at = await clock.gameNow(worldId);

    const row = pick((await catalogOf())['buildings']!, 'farm');
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });

    expect(row['nextSeconds']).toBe(Math.round(durationOf(q)));
    // Üstü çizili "eski" değer de çarpansız süre olmalı.
    expect(row['baseSeconds']).toBe(Math.round(buildingTimeSeconds('farm', 2, 0)));
  });

  it('⭐ ekrandaki teknik süresi de kuyrukla aynı', async () => {
    await giveResources(1e9, 1e9);
    await setLevel('academy', 2);
    await setMultipliers(1, 6);
    const at = await clock.gameNow(worldId);

    const row = pick((await catalogOf())['techs']!, 'blacksmithing');
    const q = await queues.enqueueTech({ cityId, playerId, type: 'blacksmithing', at });

    expect(row['nextSeconds']).toBe(Math.round(durationOf(q)));
  });

  /**
   * ⚠️ Savunmanın İKİ dalı FARKLI çarpan kullanıyor (Sur → construction, adetli birim →
   * training). Tek testte ölçülüyor ki biri diğerinin çarpanına kaydırılırsa yakalansın —
   * ekranda doğru, kuyrukta yanlış bir süre en sinsi hâli olurdu.
   */
  it('⭐ savunmanın iki dalı ekranda da DOĞRU çarpanı kullanıyor', async () => {
    await giveResources(1e12, 1e12);
    await setTech('archery', 1);
    await h.db.execute(sql`
      INSERT INTO defenses (city_id, type, count) VALUES (${cityId}, 'wall', 3)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 3
    `);
    await setMultipliers(3, 5);
    const at = await clock.gameNow(worldId);
    const rows = (await catalogOf())['defenses']!;

    const tower = await queues.enqueueDefense({ cityId, playerId, type: 'archer_tower', count: 4, at });
    expect(pick(rows, 'archer_tower')['seconds'])
      .toBe(Math.round(Number(tower.perUnitSeconds)));

    const wall = await queues.enqueueDefense({ cityId, playerId, type: 'wall', count: 1, at });
    expect(pick(rows, 'wall')['seconds']).toBe(Math.round(durationOf(wall)));
  });

  it('⭐ ekrandaki savaşçı süresi kuyrukla aynı (birim başına)', async () => {
    await giveResources(1e9, 1e9);
    await setLevel('barracks', 1);
    await setTech('blacksmithing', 1);
    await setMultipliers(4, 1);
    const at = await clock.gameNow(worldId);

    const row = pick((await catalogOf())['units']!, 'dwarf');
    const q = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 10, at });

    expect(row['seconds']).toBe(Math.round(Number(q.perUnitSeconds)));
    expect(row['baseSeconds']).toBe(Math.round(trainingTimeSeconds('dwarf', 1)));
  });

  /**
   * ⚠️ Çarpan 1'ken `baseSeconds` **null** olmalı: istemci onu "farklı değer var" işareti
   * olarak okuyor ve dolu gelseydi her satırda gereksiz bir üstü çizili sayı belirirdi.
   */
  it('çarpan 1 iken üstü çizili değer HİÇ gönderilmez', async () => {
    const cat = await catalogOf();
    expect(pick(cat['buildings']!, 'farm')['baseSeconds']).toBeNull();
    expect(pick(cat['techs']!, 'blacksmithing')['baseSeconds']).toBeNull();
    expect(pick(cat['units']!, 'dwarf')['baseSeconds']).toBeNull();
  });
});
