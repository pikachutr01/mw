/**
 * ⭐ ADMİN → GÖREVLER TABLOSU (kullanıcı, `ek_bilgiler`).
 *
 * ⚠️ Buradaki asıl risk "veri geliyor mu" değil, **sayfalamanın gerçekten sunucuda olması** ve
 * **her satırın kendi bağlamını taşıması**. İkisi de tarayıcıda gözle ayırt edilemez: 200
 * satırı çekip 25'ini çizen bir ekran da doğru görünür.
 */
import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminWorldController } from '../src/admin/admin.world.controller.ts';
import type { AdminRequest } from '../src/admin/admin.guard.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { SettingsService } from '../src/settings/settings.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { WorldStateService } from '../src/world/world-state.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let ctl: AdminWorldController;
let cities: CityService;
let clock: GameClockService;
let worldId: number;
let alice: number;
let bob: number;
let aliceCity: number;
let bobCity: number;

interface Item {
  id: number; type: string; owner: string | null;
  origin: string | null; originOwner: string | null;
  target: string | null; targetCoord: string | null; targetOwner: string | null;
  units: string[];
}
interface Payload { total: number; page: number; pageSize: number; items: Item[] }

const query = async (q: Record<string, unknown>): Promise<Payload> => {
  const req = {
    player: { accountId: 1, playerId: alice, worldId, sessionId: '' }, headers: {}, query: q,
  } as unknown as AdminRequest;
  return await ctl.missions(req) as unknown as Payload;
};

/** Görev satırı — birim dökümü isteğe bağlı. */
async function mission(o: {
  type: string; origin: number | null; target: number | null; owner: number;
  targetCoord?: [number, number, number]; units?: Record<string, number>;
}): Promise<number> {
  const [m] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                          target_k, target_d, target_s, execute_at)
    VALUES (${worldId}, ${o.type}, 'scheduled', ${o.owner}, ${o.origin}, ${o.target},
            ${o.targetCoord?.[0] ?? null}, ${o.targetCoord?.[1] ?? null},
            ${o.targetCoord?.[2] ?? null}, now() + interval '1 hour')
    RETURNING id
  `);
  const id = Number(m!['id']);
  for (const [type, count] of Object.entries(o.units ?? {})) {
    await h.db.execute(sql`
      INSERT INTO mission_units (mission_id, unit_type, count) VALUES (${id}, ${type}, ${count})
    `);
  }
  return id;
}

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  ctl = new AdminWorldController(
    h.db,
    new SettingsService(h.db),
    clock,
    new WorldStateService(h.db),
    new AuthService(h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock, cities),
  );
  worldId = freshWorldId();
  await createWorld(h, worldId);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  await h.db.execute(sql`DELETE FROM missions WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM cities WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM players WHERE world_id = ${worldId}`);
  const t = randomUUID().slice(0, 6);
  alice = await createPlayer(h, worldId, `alice${t}`);
  bob = await createPlayer(h, worldId, `bob${t}`);
  const at = await clock.gameNow(worldId);
  aliceCity = await cities.create({
    worldId, playerId: alice, name: 'Alicekent', k: 1, d: 1, s: 1, isCapital: true, at,
  });
  bobCity = await cities.create({
    worldId, playerId: bob, name: 'Bobkale', k: 1, d: 1, s: 2, isCapital: true, at,
  });
});

describe('satır bağlamı', () => {
  /**
   * ⭐ **EKRANIN VAR OLMA SEBEBİ.** Oyuncu künyesindeki listede merkez bir oyuncu var, burada
   * yok; o yüzden satır kaynak ve hedef şehrin SAHİBİNİ de taşımak zorunda. Taşımasaydı
   * "kim kime saldırıyor" sorusu bu tabloda cevapsız kalırdı.
   */
  it('kaynak ve hedef şehrin SAHİBİ de satırda', async () => {
    await mission({ type: 'attack', origin: aliceCity, target: bobCity, owner: alice,
      units: { dwarf: 120 } });

    const [row] = (await query({ worldId })).items;
    expect(row!.owner).toContain('alice');
    expect(row!.origin).toBe('Alicekent');
    expect(row!.originOwner).toContain('alice');
    expect(row!.target).toBe('Bobkale');
    expect(row!.targetOwner).toContain('bob');
    expect(row!.units).toEqual(['Cüce 120']);
  });

  /**
   * ⚠️ Hedefi ŞEHİR OLMAYAN görev (boş koordinata şehir kurma). `cities` JOIN'ine güvenip
   * bıraksaydık bu satırlar tabloda HEDEFSİZ görünürdü.
   */
  it('boş koordinata şehir kurma: ad yok ama koordinat var', async () => {
    await mission({ type: 'found_city', origin: aliceCity, target: null, owner: alice,
      targetCoord: [1, 4, 7] });

    const [row] = (await query({ worldId })).items;
    expect(row!.target).toBeNull();
    expect(row!.targetCoord).toBe('1:4:7');
    expect(row!.targetOwner).toBeNull();
  });
});

describe('sunucu taraflı sayfalama', () => {
  /**
   * ⭐ Sayfalamanın gerçekten sunucuda olduğunu kanıtlayan tek ölçü: **`total` sayfadan
   * bağımsız**. İstemcide dilimlense `items` yine 5 gelir ama `total` da 5 gelirdi.
   */
  it('total sayfadan bağımsız, sayfa gerçekten kesiyor', async () => {
    for (let i = 0; i < 12; i += 1) {
      await mission({ type: 'attack', origin: aliceCity, target: bobCity, owner: alice });
    }
    const first = await query({ worldId, page: 0, pageSize: 5 });
    expect(first.total).toBe(12);
    expect(first.items).toHaveLength(5);

    const last = await query({ worldId, page: 2, pageSize: 5 });
    expect(last.total).toBe(12);
    expect(last.items).toHaveLength(2);

    // Sayfalar ÖRTÜŞMEZ (sıralama kararlı: execute_at, id).
    const ids = new Set([...first.items, ...last.items].map((r) => r.id));
    expect(ids.size).toBe(7);
  });

  it('worldId olmadan reddeder', async () => {
    await expect(query({})).rejects.toBeInstanceOf(BadRequestException);
  });

  /** ⚠️ Tamamlanmış görevler tabloya girmemeli; ekranın vaadi "şu an açık olanlar". */
  it('yalnız açık görevler listelenir', async () => {
    const done = await mission({ type: 'attack', origin: aliceCity, target: bobCity, owner: alice });
    await h.db.execute(sql`UPDATE missions SET status = 'done' WHERE id = ${done}`);
    await mission({ type: 'spy', origin: aliceCity, target: bobCity, owner: alice });

    const r = await query({ worldId });
    expect(r.total).toBe(1);
    expect(r.items[0]!.type).toBe('spy');
  });
});

describe('süzgeçler', () => {
  it('tip süzgeci sayacı da daraltır', async () => {
    await mission({ type: 'attack', origin: aliceCity, target: bobCity, owner: alice });
    await mission({ type: 'spy', origin: aliceCity, target: bobCity, owner: alice });

    const r = await query({ worldId, type: 'spy' });
    expect(r.total).toBe(1);
    expect(r.items[0]!.type).toBe('spy');
  });

  /**
   * ⭐ **ARAMANIN ASIL DALI.** `bob` ne görevin sahibi ne de kaynak şehrin sahibi; yalnız
   * HEDEF şehrin sahibi. Arama tek tarafa baksaydı "bana ne geliyor" sorusu cevapsız kalırdı
   * — oysa yöneticinin en sık sorduğu soru bu.
   */
  it('arama HEDEF şehrin sahibini de bulur', async () => {
    await mission({ type: 'attack', origin: aliceCity, target: bobCity, owner: alice });
    const [bobName] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username FROM players WHERE id = ${bob}
    `);

    const r = await query({ worldId, q: String(bobName!['username']) });
    expect(r.total).toBe(1);
    expect(r.items[0]!.targetOwner).toContain('bob');
  });

  it('şehir adıyla da aranabilir', async () => {
    await mission({ type: 'attack', origin: aliceCity, target: bobCity, owner: alice });
    expect((await query({ worldId, q: 'Bobkale' })).total).toBe(1);
    expect((await query({ worldId, q: 'yokboyle' })).total).toBe(0);
  });

  /** ⚠️ Tek harflik arama süzgece DÖNÜŞMEZ: her şeyi eşleyip listeyi anlamsızlaştırırdı. */
  it('iki karakterden kısa arama yok sayılır', async () => {
    await mission({ type: 'attack', origin: aliceCity, target: bobCity, owner: alice });
    expect((await query({ worldId, q: 'a' })).total).toBe(1);
  });
});
