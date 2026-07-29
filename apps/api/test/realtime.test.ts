/**
 * ⭐ GERÇEK ZAMANLI YOL — Postgres LISTEN/NOTIFY veri yolu.
 *
 * Gateway'in kendisi (socket.io) HTTP sunucusuna bağlı olduğu için burada **veri yolu** ve
 * **outbox → olay eşlemesi** sınanıyor: gerçek bir Postgres üzerinden NOTIFY atılıp LISTEN ile
 * yakalanıyor. Kritik olan bu; soket katmanı bunun üstünde ince bir dağıtım kabuğu.
 *
 * Ölçülen davranışlar:
 *   • olay gerçekten karşı uca ulaşıyor (yayın → dinleyici)
 *   • dünya kimliği olayda taşınıyor (dünya yalıtımı odayı kurabilsin diye)
 *   • outbox konuları doğru istemci olaylarına çevriliyor
 *   • olayın içinde VERİ değil KİMLİK var (yük şişmesi ve iki-kaynak sorunu)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../src/db/client.ts';
import { eventForOutbox, RealtimeBus, type RealtimeEvent } from '../src/realtime/realtime.bus.ts';
import { setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let bus: RealtimeBus;
/** LISTEN ayrı bir bağlantı tutar → yayıncı ve dinleyici ayrı handle kullanır (gerçekçi). */
let listenerHandle: DbHandle;
let listener: RealtimeBus;

beforeAll(async () => {
  h = await setupTestDb();
  listenerHandle = createDb(
    (process.env['DATABASE_URL'] ?? 'postgresql://mobiwar:mobiwar@localhost:5432/mobiwar')
      .replace(/\/[^/?]+(\?|$)/, '/mobiwar_test$1'),
    { max: 2 },
  );
  bus = new RealtimeBus(h.sql);
  listener = new RealtimeBus(listenerHandle.sql);
}, 60_000);

afterAll(async () => {
  await listener?.stop();
  await listenerHandle?.close();
  await h?.close();
});

/** Belirli bir olayı bekler; süre dolarsa testi düşürür (sessiz kaybı gizlemesin). */
function waitFor(
  received: RealtimeEvent[], predicate: (e: RealtimeEvent) => boolean, ms = 5000,
): Promise<RealtimeEvent> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      const hit = received.find(predicate);
      if (hit) return resolve(hit);
      if (Date.now() - started > ms) return reject(new Error('olay gelmedi'));
      setTimeout(tick, 25);
    };
    tick();
  });
}

describe('veri yolu (LISTEN/NOTIFY)', () => {
  const received: RealtimeEvent[] = [];

  beforeAll(async () => {
    await listener.subscribe((e) => received.push(e));
  });

  it('yayınlanan olay karşı uca ulaşır', async () => {
    await bus.publish({
      topic: 'missions:changed', worldId: 42, playerIds: [7], ref: { cityId: 3 },
    });
    const got = await waitFor(received, (e) => e.ref?.['cityId'] === 3);
    expect(got.topic).toBe('missions:changed');
    expect(got.playerIds).toEqual([7]);
  });

  it('⭐ dünya kimliği olayda TAŞINIR (oda adı ondan kuruluyor)', async () => {
    await bus.publish({ topic: 'city:changed', worldId: 99, playerIds: [1], ref: { cityId: 555 } });
    const got = await waitFor(received, (e) => e.ref?.['cityId'] === 555);
    expect(got.worldId).toBe(99);
  });

  it('çok büyük yük yayınlanmaz (NOTIFY 8000 bayt sınırı)', async () => {
    const before = received.length;
    await bus.publish({
      topic: 'city:changed', worldId: 1, playerIds: [1],
      ref: { dev: 'x'.repeat(9000) },
    });
    // Sessizce atlanır; hata FIRLATMAZ — bildirim yolu oyun mutasyonunu düşürmemeli.
    await new Promise((r) => setTimeout(r, 300));
    expect(received.length).toBe(before);
  });
});

describe('outbox → istemci olayı eşlemesi', () => {
  it('gelen saldırı YALNIZ savunana gider', () => {
    const e = eventForOutbox('city:incoming_attack', {
      missionId: 5, defenderPlayerId: 12, targetCityId: 34,
    }, 1)!;
    expect(e.topic).toBe('missions:changed');
    expect(e.playerIds).toEqual([12]);
    expect(e.worldId).toBe(1);
  });

  /** ⚠️ 2026-07-30'a kadar eşlenmemişti — savunan gelen casusluğu 60 sn geç görüyordu. */
  it('⭐ gelen CASUSLUK da anında savunana gider (eşlenmemiş topic kapatıldı)', () => {
    const e = eventForOutbox('city:incoming_spy', {
      missionId: 7, defenderPlayerId: 12, targetCityId: 34,
    }, 1)!;
    expect(e).not.toBeNull();
    expect(e.topic).toBe('missions:changed');
    expect(e.playerIds).toEqual([12]);
  });

  /**
   * ⭐ BİRLEŞİK GÖREV BİTİŞİ (2026-07-30): scheduler her Ordular-görünür görev bitişinde
   * yazar — sahibi VE hedef şehrin sahibi listelerini anında tazeler; payload gelecekteki
   * push sink'ine yetecek kimlikleri taşır.
   */
  it('⭐ mission:completed iki tarafın Ordular listesini tazeler', () => {
    const e = eventForOutbox('mission:completed', {
      missionId: 11, type: 'transport', ownerPlayerId: 3, targetPlayerId: 4, targetCityId: 9,
    }, 2)!;
    expect(e.topic).toBe('missions:changed');
    expect(e.playerIds.sort()).toEqual([3, 4]);
    expect(e.ref['missionId']).toBe(11);
  });

  it('savaş sonucu İKİ tarafa da gider', () => {
    const e = eventForOutbox('battle:resolved', {
      battleId: 9, attackerPlayerId: 3, defenderPlayerId: 4, cityId: 2,
    }, 7)!;
    expect(e.topic).toBe('battle:resolved');
    expect(e.playerIds.sort()).toEqual([3, 4]);
  });

  it('kuyruk bitişleri şehir tazelemesine çevrilir', () => {
    for (const topic of [
      'city:building_finished', 'city:units_finished', 'city:defense_finished', 'player:tech_finished',
    ]) {
      const e = eventForOutbox(topic, { cityId: 8, playerId: 6 }, 2)!;
      expect(e, topic).toBeTruthy();
      expect(e.topic).toBe('city:changed');
      expect(e.playerIds).toEqual([6]);
    }
  });

  /**
   * ⭐ **YOKLAMANIN ÖRTTÜĞÜ BOŞLUK** (2026-07-28). Bu üç konu handler'larda yazılıyordu ama
   * eşleme tablosunda karşılığı yoktu → `null` dönüyor ve olay WS'e HİÇ çıkmıyordu. Ekran yine
   * de güncel görünüyordu çünkü istemci şehri 5 saniyede bir yokluyordu. Yoklama emniyet ağına
   * (60 sn) indirildiği için bu testler artık gerçek bir garantiyi koruyor.
   */
  it('⭐ nakliye/destek varışı, yeni şehir ve posta satırı WS\'e ÇIKAR', () => {
    const city = eventForOutbox('city:changed', { cityId: 8, playerId: 6, reason: 'transport' }, 2)!;
    expect(city, 'city:changed eşlenmemiş').toBeTruthy();
    expect(city.topic).toBe('city:changed');
    expect(city.playerIds).toEqual([6]);

    const founded = eventForOutbox('city:founded', { cityId: 9, playerId: 6 }, 2)!;
    expect(founded, 'city:founded eşlenmemiş').toBeTruthy();
    // Yeni şehir ŞEHİR LİSTESİNİ de değiştirir → ayrı konu.
    expect(founded.topic).toBe('cities:changed');

    const msg = eventForOutbox('message:written', { playerId: 6, kind: 'return_report' }, 2)!;
    expect(msg, 'message:written eşlenmemiş').toBeTruthy();
    expect(msg.topic).toBe('messages:changed');
    expect(msg.playerIds).toEqual([6]);
  });

  it('sıralama anlık görüntüsü DÜNYA GENELİ yayınlanır (oyuncu başına olay üretilmez)', () => {
    const e = eventForOutbox('ranking:updated', {
      takenAt: '2026-07-28T08:00:00.000Z', entries: 31,
    }, 4)!;
    expect(e.topic).toBe('ranking:updated');
    expect(e.playerIds).toEqual([]);
    expect(e.worldId).toBe(4);
  });

  it('⭐ olay VERİ taşımaz, yalnız KİMLİK', () => {
    const e = eventForOutbox('city:army_returned', {
      cityId: 8, playerId: 6,
      // Handler yükünde gerçek veri var; olaya SIZMAMALI.
      units: { dwarf: 500 }, loot: { gold: 12345, food: 999 },
    }, 3)!;
    const keys = Object.keys(e.ref ?? {});
    expect(keys).not.toContain('units');
    expect(keys).not.toContain('loot');
    expect(e.ref).toEqual({ cityId: 8 });
  });

  it('bilinmeyen konu olay üretmez (sessizce yutulur)', () => {
    expect(eventForOutbox('admin:abuse_report', { x: 1 }, 1)).toBeNull();
  });

  it('oyuncu kimliği yoksa hedefsiz kalır (dünya geneli yayına düşmez)', () => {
    const e = eventForOutbox('city:army_returned', { cityId: 8 }, 1)!;
    expect(e.playerIds).toEqual([]);
  });
});
