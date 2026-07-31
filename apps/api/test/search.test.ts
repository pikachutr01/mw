/**
 * ⭐ ARAMA (§13.18) — `arOyn.do` / `itAra.do` karşılığı.
 *
 * Ölçülen davranışlar: ada göre **önek** eşleşmesi · büyük/küçük harf duyarsızlığı · Türkçe
 * karakter · koordinat kipi (diyar ve tek üs) · **DÜNYA YALITIMI** · **yalnız BAŞKENT** ·
 * 20 kesme bayrağı · ittifak araması · kısa/boş sorgu · satırın `TargetModal`ın beklediği
 * ALANLARI taşıması · yeni indeksin sorguda gerçekten KULLANILMASI (`EXPLAIN`).
 *
 * Controller HTTP olmadan çağrılıyor (`alliance.test.ts` deseni): kurallar controller'da.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommandController } from '../src/command/command.controller.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { AuthedRequest } from '../src/auth/auth.guard.ts';
import type { DbHandle } from '../src/db/client.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let ctl: CommandController;
let worldId: number;
let me: number;

/** Controller'ın beklediği en küçük istek nesnesi. */
const asReq = (playerId: number, wid = worldId): AuthedRequest => ({
  player: { accountId: 0, playerId, worldId: wid, sessionId: '' },
} as unknown as AuthedRequest);

/** Oyuncu + başkent (ve istenirse ikinci şehir) yaratır. */
async function withCity(
  label: string, o: { k: number; d: number; s: number; second?: { k: number; d: number; s: number } },
  wid = worldId,
): Promise<number> {
  const playerId = await createPlayer(h, wid, label);
  await h.db.execute(sql`
    INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital)
    VALUES (${wid}, ${playerId}, ${label}, ${o.k}, ${o.d}, ${o.s}, true)
  `);
  if (o.second) {
    await h.db.execute(sql`
      INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital)
      VALUES (${wid}, ${playerId}, ${`${label}-2`}, ${o.second.k}, ${o.second.d}, ${o.second.s}, false)
    `);
  }
  return playerId;
}

/** `createPlayer` adın sonuna rastgele jeton ekliyor → gerçek kullanıcı adını okuruz. */
async function nameOf(playerId: number): Promise<string> {
  const [r] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT username FROM players WHERE id = ${playerId}
  `);
  return String(r!['username']);
}

interface PlayerHit { username: string; k: number; d: number; s: number; isCapital: boolean }
const players = (res: Record<string, unknown>): PlayerHit[] =>
  res['items'] as unknown as PlayerHit[];

beforeAll(async () => {
  h = await setupTestDb();
  ctl = new CommandController(new CityService(h.db), new GameClockService(h.db), h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  me = await withCity('arayan', { k: 1, d: 1, s: 1 });
});

describe('oyuncu araması — ada göre', () => {
  it('önek eşleşir, alakasız ad çıkmaz', async () => {
    const ayla = await withCity('ayla', { k: 1, d: 45, s: 7 });
    await withCity('mehmet', { k: 1, d: 45, s: 8 });

    const res = await ctl.search(asReq(me), 'player', 'ayla');
    const hits = players(res);
    expect(hits.map((x) => x.username)).toContain(await nameOf(ayla));
    expect(hits.some((x) => x.username.startsWith('mehmet'))).toBe(false);
  });

  it('büyük/küçük harf duyarsız', async () => {
    await withCity('zeynep', { k: 2, d: 3, s: 4 });
    const upper = players(await ctl.search(asReq(me), 'player', 'ZEY'));
    const lower = players(await ctl.search(asReq(me), 'player', 'zey'));
    expect(upper).toHaveLength(1);
    expect(lower).toHaveLength(1);
    expect(upper[0]!.username).toBe(lower[0]!.username);
  });

  it('Türkçe karakterli ad bulunur', async () => {
    const id = await withCity('çiğdem', { k: 3, d: 3, s: 3 });
    const hits = players(await ctl.search(asReq(me), 'player', 'çiğ'));
    expect(hits.map((x) => x.username)).toContain(await nameOf(id));
  });

  it('⭐ yalnız BAŞKENT döner (§13.16.5) — ikinci şehir aramayla bulunmaz', async () => {
    await withCity('kasim', { k: 1, d: 10, s: 1 }, worldId);
    const id = await withCity('kerem', { k: 1, d: 20, s: 1, second: { k: 9, d: 400, s: 5 } });
    const hits = players(await ctl.search(asReq(me), 'player', 'kerem'));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.isCapital).toBe(true);
    expect(hits[0]!.k).toBe(1);          // ← 9:400:5 (ikinci şehir) DEĞİL
    expect(await nameOf(id)).toContain('kerem');
  });

  it('⭐ DÜNYA YALITIMI — başka dünyanın oyuncusu çıkmaz', async () => {
    const other = freshWorldId();
    await createWorld(h, other);
    await withCity('ayla', { k: 1, d: 1, s: 2 }, other);

    expect(players(await ctl.search(asReq(me), 'player', 'ayla'))).toHaveLength(0);
  });

  it('kısa ya da boş sorgu boş liste döndürür (her tuşta sorgu atılmasın)', async () => {
    await withCity('ahmet', { k: 5, d: 5, s: 5 });
    expect(players(await ctl.search(asReq(me), 'player', 'a'))).toHaveLength(0);
    expect(players(await ctl.search(asReq(me), 'player', ''))).toHaveLength(0);
    expect(players(await ctl.search(asReq(me), 'player'))).toHaveLength(0);
  });

  it('20\'den fazla sonuçta kesme bayrağı yanar', async () => {
    for (let i = 0; i < 21; i += 1) {
      await withCity('kalabalik', { k: 4, d: 100 + i, s: 1 });
    }
    const res = await ctl.search(asReq(me), 'player', 'kalabalik');
    expect(players(res)).toHaveLength(20);
    expect(res['truncated']).toBe(true);
  });

  it('satır TargetModal\'ın beklediği alanları taşır', async () => {
    await withCity('hedef', { k: 7, d: 77, s: 3 });
    const [hit] = players(await ctl.search(asReq(me), 'player', 'hedef')) as unknown as Record<string, unknown>[];
    for (const key of [
      'k', 'd', 's', 'id', 'name', 'playerId', 'username', 'score',
      'isCapital', 'isOwn', 'rank', 'alliance', 'hasAlliance', 'protection',
    ]) {
      expect(hit).toHaveProperty(key);
    }
    expect(hit!['isOwn']).toBe(false);
  });

  it('kendi adını arayınca isOwn true olur', async () => {
    const [hit] = players(await ctl.search(asReq(me), 'player', 'arayan')) as unknown as Record<string, unknown>[];
    expect(hit!['isOwn']).toBe(true);
  });
});

describe('oyuncu araması — koordinat kipi', () => {
  it('diyardaki DOLU yerleri döndürür', async () => {
    await withCity('komsu1', { k: 2, d: 50, s: 1 });
    await withCity('komsu2', { k: 2, d: 50, s: 4 });
    await withCity('uzak', { k: 3, d: 50, s: 1 });

    const hits = players(await ctl.search(asReq(me), 'player', undefined, '2', '50'));
    expect(hits).toHaveLength(2);
    expect(hits.every((x) => x.k === 2 && x.d === 50)).toBe(true);
  });

  it('üs verilirse tek yer döner', async () => {
    await withCity('tekyer1', { k: 6, d: 60, s: 2 });
    await withCity('tekyer2', { k: 6, d: 60, s: 9 });
    const hits = players(await ctl.search(asReq(me), 'player', undefined, '6', '60', '9'));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.s).toBe(9);
  });

  /**
   * ⚠️ Koordinat kipinde başkent kısıtı YOK — koordinatı zaten bilen biri o yeri Dünya
   * ekranından da görebilir; gizlilik kısıtı ADA göre aramada anlamlı (§13.16.5).
   */
  it('koordinat kipi başkent OLMAYAN şehri de döndürür', async () => {
    await withCity('ikincili', { k: 8, d: 80, s: 1, second: { k: 8, d: 81, s: 6 } });
    const hits = players(await ctl.search(asReq(me), 'player', undefined, '8', '81'));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.isCapital).toBe(false);
  });

  it('boş diyar boş liste döndürür', async () => {
    expect(players(await ctl.search(asReq(me), 'player', undefined, '10', '499'))).toHaveLength(0);
  });
});

describe('ittifak araması', () => {
  it('önek eşleşir, üye sayısı ve puan gelir', async () => {
    const lider = await withCity('itlider', { k: 1, d: 2, s: 1 });
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO alliances (world_id, name, leader_id)
      VALUES (${worldId}, 'Demir Yumruk', ${lider}) RETURNING id
    `);
    await h.db.execute(sql`
      UPDATE players SET alliance_id = ${Number(a!['id'])}, alliance_role = 3, score = 500
       WHERE id = ${lider}
    `);

    const res = await ctl.search(asReq(me), 'alliance', 'demir');
    const items = res['items'] as unknown as { name: string; memberCount: number; score: number }[];
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('Demir Yumruk');
    expect(items[0]!.memberCount).toBe(1);
    expect(items[0]!.score).toBe(500);
  });

  it('dünya yalıtımı ittifakta da geçerli', async () => {
    const other = freshWorldId();
    await createWorld(h, other);
    const lider = await withCity('otherlider', { k: 1, d: 1, s: 3 }, other);
    await h.db.execute(sql`
      INSERT INTO alliances (world_id, name, leader_id)
      VALUES (${other}, 'Gizli Birlik', ${lider})
    `);
    const res = await ctl.search(asReq(me), 'alliance', 'gizli');
    expect(res['items']).toHaveLength(0);
  });
});

describe('indeks', () => {
  /**
   * ⭐ Bu test olmadan indeks "var ama kullanılmıyor" durumuna sessizce düşebilir —
   * `text_pattern_ops` unutulursa sorgu tam tarama yapar ve HİÇBİR test bunu fark etmez.
   */
  /**
   * ⚠️ Bu testin iki kez düzeltilmesi gerekti; ikisi de gerçek ders:
   *  1. `SET LOCAL` yalnız transaction içinde geçerli ve havuzdaki her `execute` başka bağlantı
   *     alabilir → EXPLAIN ile AYNI transaction'da olmalı.
   *  2. **Desen TEK PARAMETRE olmalı.** `lower('ayl') || '%'` yazılınca Postgres öneki plan
   *     zamanında göremiyor, indeksi yalnız `world_id` için kullanıp `lower(username)`'ı
   *     FİLTREYE düşürüyor — indeks var ama boşuna. Sunucu kodu da bu yüzden deseni JS'te
   *     `prefixPattern()` ile kuruyor.
   *
   * Ayrıca planlayıcıya GERÇEK bir seçim sunmak için dünya kalabalıklaştırılıyor: birkaç
   * satırlık tabloda her indeks ucuzdur ve planlayıcı rastgele birini (ör. `players_alliance`)
   * seçer — o durumda test hiçbir şey ölçmez.
   */
  it('ada göre arama players_world_username_lower indeksini KULLANIR', async () => {
    const big = freshWorldId();
    await createWorld(h, big);
    /* ⚠️ `createWorld` hesapları SİLMEZ ve `freshWorldId()` her koşuda 100'den başlar →
       e-posta sabit olsaydı ikinci koşuda tekillik kısıtına çarpardı. Jeton şart. */
    const tag = randomUUID().slice(0, 8);
    await h.db.execute(sql`
      INSERT INTO accounts (email, password_hash)
      SELECT 'bulk-' || ${tag} || '-' || g || '@test.local', 'x' FROM generate_series(1, 2000) g
    `);
    /*
     * ⚠️ Adlar DAĞINIK olmalı. İlk denemede hepsi `bulk…` diye başlıyordu; `LIKE 'bulk1%'`
     * 2000 satırın ~1100'ünü tutuyordu ve seq scan GERÇEKTEN doğru plandı — test indeksi
     * değil, kötü kurgulanmış veriyi ölçüyordu. `md5` ile dağıtıp aranan öneki tek satıra
     * bırakınca soru anlamlı hâle geliyor.
     */
    await h.db.execute(sql`
      INSERT INTO players (world_id, account_id, username)
      SELECT ${big}, a.id, 'u' || substr(md5(a.id::text), 1, 12)
        FROM accounts a WHERE a.email LIKE 'bulk-' || ${tag} || '-%'
    `);
    const hedef = await createPlayer(h, big, 'aranankisi');
    await h.db.execute(sql`ANALYZE players`);

    const text = await h.db.transaction(async (tx) => {
      const plan = await tx.execute<Record<string, unknown>>(sql`
        EXPLAIN SELECT p.id FROM players p
         WHERE p.world_id = ${big} AND lower(p.username) LIKE ${'aranankisi%'}
      `);
      return plan.map((r) => String(Object.values(r)[0])).join('\n');
    });
    expect(hedef).toBeGreaterThan(0);

    expect(text).toContain('players_world_username_lower');
    // Önek gerçekten INDEX KOŞULU olmalı, sonradan uygulanan bir filtre değil.
    expect(text).toContain('Index Cond');

    // Toplu veri test DB'sinde birikmesin (hesaplar dünya-üstü, createWorld temizlemiyor).
    await h.db.execute(sql`DELETE FROM players WHERE world_id = ${big}`);
    await h.db.execute(sql`DELETE FROM accounts WHERE email LIKE 'bulk-' || ${tag} || '-%'`);
  });
});
