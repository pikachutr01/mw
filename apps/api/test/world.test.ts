/**
 * ⭐ DÜNYA EKRANI UCU (§13.16) — diyar listesi.
 *
 * Bu dosyanın asıl konusu **`isAlly`**: aynı ittifaktaki oyuncuyu listede işaretleyen bayrak
 * (kullanıcı 2026-08-07). Bayrak sunucuda ve ittifak KİMLİĞİ üzerinden hesaplanıyor; istemci
 * ittifak adlarını karşılaştırmıyor. Ölçülenler: müttefik · yabancı · ittifaksız bakan ·
 * **kendi şehrim müttefik SAYILMAZ** · yalnız ADI aynı olan başka dünyanın ittifakı sızmaz.
 *
 * Controller HTTP olmadan çağrılıyor (`search.test.ts` deseni): kurallar controller'da.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthedRequest } from '../src/auth/auth.guard.ts';
import type { DbHandle } from '../src/db/client.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { WorldController } from '../src/world/world.controller.ts';
import { WorldStateService } from '../src/world/world-state.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let ctl: WorldController;
let worldId: number;

const asReq = (playerId: number, wid = worldId): AuthedRequest => ({
  player: { accountId: 0, playerId, worldId: wid, sessionId: '' },
} as unknown as AuthedRequest);

interface Slot { s: number; city: Record<string, unknown> | null }

/** 1:1 diyarını okur ve dolu satırları oyuncu kimliğine göre indeksler. */
async function districtBy(playerId: number): Promise<Map<number, Record<string, unknown>>> {
  const res = await ctl.district('1', '1', asReq(playerId));
  const out = new Map<number, Record<string, unknown>>();
  for (const slot of res['slots'] as unknown as Slot[]) {
    if (slot.city) out.set(Number(slot.city['playerId']), slot.city);
  }
  return out;
}

/** Oyuncu + 1:1:s şehri. */
async function withCity(label: string, s: number, wid = worldId): Promise<number> {
  const playerId = await createPlayer(h, wid, label);
  await h.db.execute(sql`
    INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital)
    VALUES (${wid}, ${playerId}, ${label}, 1, 1, ${s}, true)
  `);
  return playerId;
}

/** İttifak kurar ve verilen oyuncuları üye yapar. */
async function allianceOf(name: string, members: number[], wid = worldId): Promise<number> {
  const [a] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO alliances (world_id, name, leader_id)
    VALUES (${wid}, ${name}, ${members[0]!}) RETURNING id
  `);
  const id = Number(a!['id']);
  for (const m of members) {
    await h.db.execute(sql`UPDATE players SET alliance_id = ${id} WHERE id = ${m}`);
  }
  return id;
}

beforeAll(async () => {
  h = await setupTestDb();
  ctl = new WorldController(new GameClockService(h.db), new WorldStateService(h.db), h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
});

describe('müttefik işareti (isAlly)', () => {
  it('aynı ittifaktaki BAŞKA oyuncu işaretlenir', async () => {
    const me = await withCity('bakan', 1);
    const dost = await withCity('dost', 2);
    await allianceOf('Demir Yumruk', [me, dost]);

    const rows = await districtBy(me);
    expect(rows.get(dost)!['isAlly']).toBe(true);
    expect(rows.get(dost)!['alliance']).toBe('Demir Yumruk');
  });

  /**
   * ⭐ Bu testin bekçilik ettiği şey kullanıcının cümlesi: *"aynı ittifaktaki DİĞER üyeleri"*.
   * Kendi satırlarım zaten `isOwn` ile renkli ve kenarlıklı; rozeti oraya da basmak listedeki
   * en kalabalık grubu işaretleyip "müttefik" işaretini anlamsızlaştırırdı.
   */
  it('⭐ KENDİ şehrim müttefik sayılmaz (isOwn true, isAlly false)', async () => {
    const me = await withCity('bakan', 1);
    await allianceOf('Demir Yumruk', [me]);

    const mine = (await districtBy(me)).get(me)!;
    expect(mine['isOwn']).toBe(true);
    expect(mine['isAlly']).toBe(false);
  });

  it('başka ittifaktaki oyuncu işaretlenmez', async () => {
    const me = await withCity('bakan', 1);
    const yabanci = await withCity('yabanci', 2);
    await allianceOf('Demir Yumruk', [me]);
    await allianceOf('Gümüş Kalkan', [yabanci]);

    expect((await districtBy(me)).get(yabanci)!['isAlly']).toBe(false);
  });

  it('ittifaksız komşu işaretlenmez', async () => {
    const me = await withCity('bakan', 1);
    const yalniz = await withCity('yalniz', 2);
    await allianceOf('Demir Yumruk', [me]);

    const row = (await districtBy(me)).get(yalniz)!;
    expect(row['isAlly']).toBe(false);
    expect(row['alliance']).toBeNull();
  });

  /**
   * ⚠️ En sinsi hâli: bakan ittifaksız. Alt sorgu NULL döner ve `alliance_id = NULL`
   * SQL'de NULL'dır — `AND` zinciri de NULL. `Boolean(null)` false olduğu için sonuç doğru
   * çıkıyor ama bu tesadüfe bırakılmayacak kadar önemli: ittifaksız bir oyuncuya diyardaki
   * HERKES müttefik görünseydi hata sessiz ve tam ters yönde olurdu.
   */
  it('⭐ bakan oyuncu ittifaksızsa HİÇ KİMSE müttefik görünmez', async () => {
    const me = await withCity('bakan', 1);
    const a = await withCity('a', 2);
    const b = await withCity('b', 3);
    await allianceOf('Demir Yumruk', [a, b]);

    const rows = await districtBy(me);
    expect(rows.get(a)!['isAlly']).toBe(false);
    expect(rows.get(b)!['isAlly']).toBe(false);
  });

  /**
   * ⚠️ Ad karşılaştırması yerine kimlik karşılaştırmasının bekçisi. İki dünyada aynı adlı
   * ittifak olabilir (`alliances` tekilliği dünya başına). İstemcide `c.alliance === benimki`
   * yazılsaydı bu satır müttefik görünürdü — sorgu zaten dünyaya göre süzdüğü için burada
   * karşımıza çıkmıyor, ama karar kuralının kimlik olduğunu kilitliyor.
   */
  it('aynı ADLI başka dünya ittifakı müttefik yapmaz', async () => {
    const me = await withCity('bakan', 1);
    await allianceOf('Demir Yumruk', [me]);

    const other = freshWorldId();
    await createWorld(h, other);
    const uzak = await withCity('uzak', 1, other);
    await allianceOf('Demir Yumruk', [uzak], other);

    const rows = await districtBy(me);
    expect(rows.has(uzak)).toBe(false);          // dünya yalıtımı: satır hiç gelmiyor
    expect(rows.get(me)!['isAlly']).toBe(false);
  });

  it('boş yer null şehir döndürmeye devam eder', async () => {
    const me = await withCity('bakan', 1);
    const res = await ctl.district('1', '1', asReq(me));
    const slots = res['slots'] as unknown as Slot[];
    expect(slots).toHaveLength(10);
    expect(slots[1]!.city).toBeNull();
  });
});
