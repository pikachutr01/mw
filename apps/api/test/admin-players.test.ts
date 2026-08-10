/**
 * ⭐ OYUNCULAR + İMPARATORLUK KÜNYESİ (panel 2. nesil, Tur 1).
 *
 * Fazın gerekçesi kullanıcının cümlesi: *"bir kullanıcının hesabındaki askerleri, birimleri,
 * yükseltmelerini görmenin bir yolu var mı?"* Bugüne kadar yoktu — veri tabanı tarayıcısından
 * şehir şehir, 20'den fazla istekle ve **yanlış kaynak değeriyle** bakılıyordu.
 *
 * Testlerin ağırlık merkezi iki iddiada:
 *   1. Künye **tek çağrıda** ve **gerçek** kaynağı veriyor (ham SELECT'in veremediği).
 *   2. **Gelen** hareketler görünüyor — bunlar `owner_player_id` ile bulunamıyor, hedef şehrin
 *      sahibi üzerinden JOIN gerekiyor; tarayıcıda bu soru hiç sorulamıyordu.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminPlayersController } from '../src/admin/admin.players.controller.ts';
import type { AdminRequest } from '../src/admin/admin.guard.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let ctl: AdminPlayersController;
let auth: AuthService;
let cities: CityService;
let clock: GameClockService;

let worldId: number;
let playerId: number;
let cityId: number;
/** Saldırgan — "gelen hareket" iddiasını ölçmek için ikinci bir oyuncu şart. */
let foeId: number;
let foeCityId: number;

const req = (): AdminRequest => ({
  player: { accountId: 1, playerId, worldId, sessionId: '' },
  staff: { role: 'admin', elevated: true },
  headers: {},
} as unknown as AdminRequest);

const queryReq = (q: Record<string, unknown>): AdminRequest =>
  ({ ...req(), query: q } as unknown as AdminRequest);

interface Empire {
  player: Record<string, unknown>;
  cities: Record<string, unknown>[];
  techs: { type: string; name: string; level: number }[];
  heroes: Record<string, unknown>[];
  outgoing: Record<string, unknown>[];
  incoming: Record<string, unknown>[];
}

const empireOf = (id: number): Promise<Empire> =>
  ctl.empire(String(id)) as unknown as Promise<Empire>;

async function register(label: string): Promise<{ playerId: number; cityId: number }> {
  const t = randomUUID().slice(0, 8);
  const r = await auth.register(
    { email: `${label}-${t}@test.local`, password: 'parola-12345', username: `${label}${t.slice(0, 4)}`, worldId },
    { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' },
  );
  const [c] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT id FROM cities WHERE player_id = ${r.playerId}
  `);
  return { playerId: r.playerId, cityId: Number(c!['id']) };
}

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  auth = new AuthService(
    h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock, cities,
  );
  ctl = new AdminPlayersController(h.db, auth, cities, clock);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  ({ playerId, cityId } = await register('kral'));
  ({ playerId: foeId, cityId: foeCityId } = await register('dusman'));
});

/* ═══ 1. İMPARATORLUK — tek çağrıda her şey ══════════════════════════════════ */

describe('imparatorluk künyesi', () => {
  it('⭐ ordu, mağara, savunma, yapı, teknik ve kahraman TEK çağrıda geliyor', async () => {
    await h.db.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${cityId}, 'dwarf', 1500), (${cityId}, 'elf', 40)
    `);
    await h.db.execute(sql`
      INSERT INTO cave_units (city_id, type, count) VALUES (${cityId}, 'dragon', 12)
    `);
    await h.db.execute(sql`
      INSERT INTO defenses (city_id, type, count)
      VALUES (${cityId}, 'archer_tower', 300), (${cityId}, 'wall', 6), (${cityId}, 'magic_shield', 3)
    `);
    await h.db.execute(sql`
      INSERT INTO techs (player_id, type, level) VALUES (${playerId}, 'blacksmithing', 7)
    `);
    await h.db.execute(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, level, xp, status)
      VALUES (${worldId}, ${playerId}, ${cityId}, 'Kayra', 12, 5000, 'alive')
    `);

    const e = await empireOf(playerId);
    const city = e.cities[0]!;
    expect(e.cities.length).toBe(1);
    expect(city['units']).toEqual([
      { type: 'dwarf', name: 'Cüce', count: 1500 },
      { type: 'elf', name: 'Elf', count: 40 },
    ]);
    expect(city['cave']).toEqual([{ type: 'dragon', name: 'Ejderha', count: 12 }]);
    expect(e.techs).toEqual([{ type: 'blacksmithing', name: 'Demircilik', level: 7 }]);
    expect(e.heroes[0]).toMatchObject({ name: 'Kayra', level: 12, cityName: city['name'] });
  });

  it('⭐ Sur ve Büyü Kalkanı savunma BİRİMLERİNDEN ayrılıyor (adet değil SEVİYE)', async () => {
    await h.db.execute(sql`
      INSERT INTO defenses (city_id, type, count)
      VALUES (${cityId}, 'archer_tower', 300), (${cityId}, 'wall', 6), (${cityId}, 'magic_shield', 3)
    `);
    const city = (await empireOf(playerId)).cities[0]!;
    /**
     * ⚠️ İkisi de `defenses` tablosunda ve ikisinin de kolonu `count` — ama Sur'da o sayı
     * SEVİYE. Aynı listede "300 Okçu Kulesi" ile "6 Sur" yan yana dursaydı, 6 adet sur
     * diye okunurdu.
     */
    expect(city['defenses']).toEqual([{ type: 'archer_tower', name: 'Okçu Kulesi', count: 300 }]);
    expect(city['structures']).toEqual([
      { type: 'wall', name: 'Sur', level: 6 },
      { type: 'magic_shield', name: 'Büyü Kalkanı', level: 3 },
    ]);
  });

  it('⭐ kaynak MATERIALIZE edilmiş geliyor — ham SELECT ile aynı değil', async () => {
    // Çıpayı 3 saat geriye it: ham satır eski, gerçek değer birikimle daha büyük olmalı.
    await h.db.execute(sql`
      UPDATE cities SET gold = 1000, food = 1000, resources_at = now() - interval '3 hours'
       WHERE id = ${cityId}
    `);
    const [raw] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT gold FROM cities WHERE id = ${cityId}
    `);
    const city = (await empireOf(playerId)).cities[0]!;

    // Tarayıcının gösterdiği (ham) sayı 1000; künyenin gösterdiği gerçek sayı ondan büyük.
    expect(Math.floor(Number(raw!['gold']))).toBe(1000);
    expect(Number(city['gold'])).toBeGreaterThan(1000);
    // Ve oyuncunun kendi ekranındakiyle BİREBİR aynı olmalı.
    const at = await clock.gameNow(worldId);
    expect(Number(city['gold'])).toBe((await cities.snapshot(cityId, at))!.gold);
  });

  it('katalog id\'leri Türkçe adla geliyor; bilinmeyen id gizlenmiyor', async () => {
    await h.db.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${cityId}, 'uydurma_birim', 5)
    `);
    const city = (await empireOf(playerId)).cities[0]!;
    // ⚠️ Bilinmeyen tip ELENMEZ: veri orada, panel görmezden gelirse tanı imkânsız olur.
    expect(city['units']).toEqual([{ type: 'uydurma_birim', name: 'uydurma_birim', count: 5 }]);
  });

  it('sıfır adetli satırlar listede yer kaplamıyor', async () => {
    await h.db.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${cityId}, 'dwarf', 0), (${cityId}, 'elf', 3)
    `);
    const city = (await empireOf(playerId)).cities[0]!;
    expect(city['units']).toEqual([{ type: 'elf', name: 'Elf', count: 3 }]);
  });

  it('koruma ve tatil alanları künyede görünüyor', async () => {
    await h.db.execute(sql`
      UPDATE players SET protected_until = now() + interval '2 days' WHERE id = ${playerId}
    `);
    const e = await empireOf(playerId);
    // ⚠️ Faz 6 künyesinde bu alan SQL'de çekiliyor ama JSON'a konmuyordu.
    expect(e.player['protectedUntil']).toBeTruthy();
  });

  it('olmayan oyuncu 404', async () => {
    await expect(empireOf(99_999_999)).rejects.toThrow();
  });
});

/* ═══ 2. HAREKETLER — asıl kazanç GELEN tarafta ══════════════════════════════ */

describe('aktif hareketler', () => {
  const attack = async (from: number, to: number, ownerId: number): Promise<number> => {
    const [m] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id,
                            target_city_id, execute_at)
      VALUES (${worldId}, 'attack', 'scheduled', ${ownerId}, ${from}, ${to},
              now() + interval '1 hour')
      RETURNING id
    `);
    const id = Number(m!['id']);
    await h.db.execute(sql`
      INSERT INTO mission_units (mission_id, unit_type, count) VALUES (${id}, 'dwarf', 800)
    `);
    return id;
  };

  it('⭐ GELEN saldırı görünüyor — owner_player_id ile bulunamayan bilgi', async () => {
    await attack(foeCityId, cityId, foeId);
    const e = await empireOf(playerId);

    expect(e.outgoing).toEqual([]);
    expect(e.incoming.length).toBe(1);
    /**
     * ⭐ Fazın en somut kazancı: "bu oyuncuya kim saldırıyor" sorusu veri tabanı tarayıcısında
     * SORULAMIYORDU — `missions.owner_player_id` saldıranı taşıyor, hedefin sahibi ancak
     * `cities` üzerinden JOIN ile bulunuyor.
     */
    expect(e.incoming[0]).toMatchObject({ type: 'attack', ownerPlayerId: foeId });
  });

  it('⭐ yoldaki ordunun BİLEŞİMİ geliyor (mission_units hiçbir uçtan alınamıyordu)', async () => {
    await attack(cityId, foeCityId, playerId);
    const e = await empireOf(playerId);
    expect(e.outgoing[0]!['units']).toEqual([{ type: 'dwarf', name: 'Cüce', count: 800 }]);
  });

  it('bitmiş görevler listede yok', async () => {
    const id = await attack(cityId, foeCityId, playerId);
    await h.db.execute(sql`UPDATE missions SET status = 'done' WHERE id = ${id}`);
    expect((await empireOf(playerId)).outgoing).toEqual([]);
  });

  it('kendi şehrine gelen kendi seferi «gelen» sayılmıyor', async () => {
    // Nakliye: aynı oyuncunun iki şehri arasında. Gelen kutusunu kirletmemeli.
    await attack(cityId, cityId, playerId);
    const e = await empireOf(playerId);
    expect(e.outgoing.length).toBe(1);
    expect(e.incoming).toEqual([]);
  });
});

/* ═══ 3. LİSTE — sunucu taraflı sayfalama ve aktiflik ════════════════════════ */

describe('oyuncu listesi', () => {
  it('sayfalama SUNUCUDA: sayfa boyutu kadar satır + gerçek toplam', async () => {
    const out = await ctl.list(queryReq({ world: worldId })) as Record<string, unknown>;
    expect(out['pageSize']).toBe(25);
    expect(Number(out['total'])).toBe(2);
    expect((out['items'] as unknown[]).length).toBe(2);
  });

  it('arama kullanıcı adı ve e-postada çalışıyor', async () => {
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username FROM players WHERE id = ${playerId}
    `);
    const name = String(row!['username']);
    const out = await ctl.list(queryReq({ world: worldId, q: name })) as Record<string, unknown>;
    expect((out['items'] as { id: number }[]).map((i) => i.id)).toEqual([playerId]);
  });

  it('⭐ gateway yoksa «çevrimdışı» DENMEZ, «bilinmiyor» denir', async () => {
    const out = await ctl.list(queryReq({ world: worldId })) as Record<string, unknown>;
    /**
     * Testlerde `getGateway()` daima `null` (soket sunucusu yok). Panel `online: false`
     * görseydi "herkes çevrimdışı" diye çizerdi — yanlış bilgi, bilgisizlikten kötüdür.
     */
    expect(out['onlineKnown']).toBe(false);
    expect((out['items'] as { online: unknown }[])[0]!.online).toBeNull();
  });

  it('çevrimiçi filtresi, kimse bağlı değilken BOŞ döner (hepsini değil)', async () => {
    const out = await ctl.list(queryReq({ world: worldId, status: 'online' })) as Record<string, unknown>;
    // ⚠️ `= ANY(ARRAY[NULL])` hiçbir satırla eşleşmez — boş dizide "filtre yok" davranışına
    // düşseydi ekran "herkes çevrimiçi" derdi.
    expect(Number(out['total'])).toBe(0);
  });

  it('aktiflik filtresi: son görülme eşiğe göre ayrışıyor', async () => {
    await h.db.execute(sql`
      UPDATE players SET last_seen_at = now() - interval '30 days' WHERE id = ${foeId}
    `);
    const recent = await ctl.list(queryReq({ world: worldId, status: 'recent' })) as Record<string, unknown>;
    const idle = await ctl.list(queryReq({ world: worldId, status: 'idle' })) as Record<string, unknown>;
    expect((recent['items'] as { id: number }[]).map((i) => i.id)).toEqual([playerId]);
    expect((idle['items'] as { id: number }[]).map((i) => i.id)).toEqual([foeId]);
  });

  it('şehir sayısı ve ceza durumu listede', async () => {
    await h.db.execute(sql`
      UPDATE players SET banned_at = now(), ban_mode = 'open' WHERE id = ${foeId}
    `);
    const out = await ctl.list(queryReq({ world: worldId })) as Record<string, unknown>;
    const foe = (out['items'] as Record<string, unknown>[]).find((i) => i['id'] === foeId)!;
    expect(foe['cities']).toBe(1);
    expect(foe['banned']).toBe(true);
    expect(foe['banMode']).toBe('open');
  });
});

/* ═══ 4. TEK CİHAZI DÜŞÜRME ══════════════════════════════════════════════════ */

describe('tek oturum zinciri düşürme', () => {
  it('⭐ yalnız hedef zincir kapanır, diğer cihaz ayakta kalır', async () => {
    const [acc] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT account_id FROM players WHERE id = ${playerId}
    `);
    const accountId = Number(acc!['account_id']);
    const other = randomUUID();
    await h.db.execute(sql`
      INSERT INTO sessions (id, account_id, refresh_hash, chain_id, expires_at, platform)
      VALUES (${randomUUID()}::uuid, ${accountId}, 'ikinci-cihaz', ${other}::uuid,
              now() + interval '30 days', 'android')
    `);
    const before = await auth.listSessions(accountId, '00000000-0000-0000-0000-000000000000');
    expect(before.length).toBe(2);

    await ctl.revokeChain(String(playerId), other, req());

    const after = await auth.listSessions(accountId, '00000000-0000-0000-0000-000000000000');
    // Faz 3'ten beri `revokeChain` hazırdı ama admin'de yalnız "hepsini düşür" vardı.
    expect(after.length).toBe(1);
    expect(after.map((s) => s.chainId)).not.toContain(other);
  });

  it('audit satırı yazılıyor', async () => {
    await h.db.execute(sql`DELETE FROM audit_log WHERE world_id = ${worldId}`);
    await ctl.revokeChain(String(playerId), randomUUID(), req());
    const [log] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT action FROM audit_log
       WHERE world_id = ${worldId} AND action = 'admin.sessions.revoke_chain'
    `);
    expect(log).toBeTruthy();
  });
});
