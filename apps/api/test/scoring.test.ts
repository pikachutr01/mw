/**
 * ⭐ PUANLAMA ve SIRALAMA testleri.
 *
 * Kilitlenen davranışlar — hepsi bozulduğunda ekranda **makul ama yanlış** bir sayı gösterir,
 * yani gözle fark edilmesi zor olanlar:
 *   • Puan **binlik artık kaybetmeden** birikir (900 + 900 = 1 puan, 0 değil).
 *   • İptal iadesi puanı geri alır → "sipariş ver, iptal et" bedava puan basamaz.
 *   • Savaş kaybı **tür tür** düşülür (Ejderha ile Cüce aynı puanı götürmez).
 *   • Anlık görüntü önceki sırayı `prev_rank`'e kaydırır → "▲2" hesaplanabilir olur.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UNITS_BY_ID, buildingCost } from '@mobilwar/catalog';
import { AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { QueueService } from '../src/queues/queue.service.ts';
import {
  lossValue, pointsFromBase, recomputeScoreBaseFromHoldings, scoreValue,
} from '../src/scoring/score.service.ts';
import {
  nextSnapshotAt, previousSnapshotAt, scheduleSnapshot, takeSnapshot,
} from '../src/ranking/ranking.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb, verifyEmail } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;
let cities: CityService;
let queues: QueueService;
let auth: AuthService;

let playerId: number;
let cityId: number;

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  queues = new QueueService(h.db, cities);
  auth = new AuthService(h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  const t = randomUUID().slice(0, 8);
  const r = await auth.register({
    email: `s-${t}@test.local`, password: 'parola-12345', username: `s_${t}`, worldId,
  }, { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' });
  playerId = r.playerId;
  // Kayıt akışı hesabı doğrulanmamış bırakır; bu dosya §verify kısıtlarını ölçmüyor.
  await verifyEmail(h, playerId);
  const rows = await h.db.execute<{ id: number } & Record<string, unknown>>(sql`
    SELECT id FROM cities WHERE player_id = ${playerId}
  `);
  cityId = Number(rows[0]!.id);
});

async function scoreOf(id = playerId): Promise<{ score: number; base: number }> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT score, score_base FROM players WHERE id = ${id}
  `);
  return { score: Number(rows[0]!['score']), base: Number(rows[0]!['score_base']) };
}

async function giveResources(gold: number, food: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE cities SET gold = ${gold}::numeric, food = ${food}::numeric WHERE id = ${cityId}
  `);
}

async function setScore(id: number, score: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE players SET score = ${score}, score_base = ${score * 1000}::numeric WHERE id = ${id}
  `);
}

describe('puan tabanı', () => {
  it('1.000 kaynak = 1 puan; binlik artık KAYBOLMAZ', () => {
    expect(pointsFromBase(999)).toBe(0);
    expect(pointsFromBase(1000)).toBe(1);
    expect(pointsFromBase(1800)).toBe(1);
    // İki ayrı 900'lük harcama tek tek 0 puan eder; taban toplandığı için birlikte 1 puan eder.
    expect(pointsFromBase(900 + 900)).toBe(1);
    expect(scoreValue({ gold: 900, food: 900 })).toBe(1800);
  });

  it('yapı yükseltmesi harcandığı kaynak kadar puan yazar', async () => {
    await giveResources(1_000_000, 1_000_000);
    const at = new Date();
    const cost = buildingCost('farm', 2);

    await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });

    const s = await scoreOf();
    expect(s.base).toBeCloseTo(cost.gold + cost.food, 3);
    expect(s.score).toBe(Math.floor((cost.gold + cost.food) / 1000));
  });

  it('iptal iadesi puanı geri alır — sipariş/iptal döngüsü bedava puan basamaz', async () => {
    await giveResources(1_000_000, 1_000_000);
    // Cüce'nin ön-şartı Demircilik 1 — teknik seviyesi puana burada karışmasın diye
    // doğrudan yazılıyor (kuyruktan araştırılsaydı harcaması da tabana eklenirdi).
    await h.db.execute(sql`
      INSERT INTO techs (player_id, type, level) VALUES (${playerId}, 'blacksmithing', 1)
      ON CONFLICT (player_id, type) DO UPDATE SET level = 1
    `);
    const at = new Date();
    const before = await scoreOf();

    const q = await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 10, at });
    const afterOrder = await scoreOf();
    expect(afterOrder.base).toBeGreaterThan(before.base);

    // Hemen iptal: dokümandaki kural gereği BİR birim eksik iade edilir.
    const res = await queues.cancel({ queueId: q.id, playerId, at });
    const afterCancel = await scoreOf();

    const unit = UNITS_BY_ID['dwarf']!;
    const ordered = (unit.gold + unit.food) * 10;
    const refunded = res.refunded.gold + res.refunded.food;
    // Elde kalan puan tabanı = harcanan − iade edilen (yani yakılan tek birimin bedeli kadar).
    expect(afterCancel.base).toBeCloseTo(before.base + ordered - refunded, 0);
    expect(afterCancel.base).toBeLessThan(afterOrder.base);
  });
});

describe('savaş kaybının puan bedeli', () => {
  it('tür tür hesaplanır; Sur ve Büyü Kalkanı puan götürmez', () => {
    const dwarf = UNITS_BY_ID['dwarf']!;
    expect(lossValue({ dwarf: 3 })).toBe((dwarf.gold + dwarf.food) * 3);
    // Seviye taşıyan savunma yapıları savaşta adet kaybetmez → puan da götürmez.
    expect(lossValue({ wall: 5, magic_shield: 3 })).toBe(0);
    expect(lossValue({ bilinmeyen_birim: 100 })).toBe(0);
  });
});

describe('sahip olunanlardan geriye dönük doldurma', () => {
  it('mevcut yapı ve orduyu puana çevirir; hiç oynamamış oyuncu 0 kalır', async () => {
    const fresh = await createPlayer(h, worldId, 'bos');
    expect(await recomputeScoreBaseFromHoldings(h.db, fresh)).toBe(0);

    // Başlangıç yapıları (Kale/Baraka/Çiftlik/Maden sv1) HEDİYE → puan yazmaz.
    expect(await recomputeScoreBaseFromHoldings(h.db, playerId)).toBe(0);

    await h.db.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${cityId}, 'dwarf', 10)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 10
    `);
    const dwarf = UNITS_BY_ID['dwarf']!;
    const base = await recomputeScoreBaseFromHoldings(h.db, playerId);
    expect(base).toBe((dwarf.gold + dwarf.food) * 10);
    expect((await scoreOf()).score).toBe(Math.floor(base / 1000));
  });
});

describe('sıralama anlık görüntüsü', () => {
  it('anlık görüntü saatleri 00:00 · 08:00 · 16:00', () => {
    const at = new Date('2026-07-28T09:31:00.000Z');
    expect(nextSnapshotAt(at).toISOString()).toBe('2026-07-28T16:00:00.000Z');
    expect(previousSnapshotAt(at).toISOString()).toBe('2026-07-28T08:00:00.000Z');

    // Tam saat üstünde: "sonraki" bir sonraki dilim, "önceki" o anın kendisi.
    const onTheHour = new Date('2026-07-28T16:00:00.000Z');
    expect(nextSnapshotAt(onTheHour).toISOString()).toBe('2026-07-29T00:00:00.000Z');
    expect(previousSnapshotAt(onTheHour).toISOString()).toBe('2026-07-28T16:00:00.000Z');

    // Gece yarısından önce: önceki dilim BİR ÖNCEKİ günün 16:00'sı.
    expect(previousSnapshotAt(new Date('2026-07-28T00:00:00.000Z')).toISOString())
      .toBe('2026-07-28T00:00:00.000Z');
    expect(previousSnapshotAt(new Date('2026-07-27T23:59:00.000Z')).toISOString())
      .toBe('2026-07-27T16:00:00.000Z');
  });

  it('puana göre sıralar ve ÖNCEKİ sırayı saklar (değişim ondan hesaplanır)', async () => {
    const rakip = await createPlayer(h, worldId, 'rakip');
    await setScore(playerId, 100);
    await setScore(rakip, 500);

    const t1 = new Date('2026-07-28T08:00:00.000Z');
    await takeSnapshot(h.db, worldId, t1);

    const first = await ranks();
    expect(first.get(rakip)).toEqual({ rank: 1, prev: null });
    expect(first.get(playerId)).toEqual({ rank: 2, prev: null });

    // Oyuncu öne geçiyor → ikinci anlık görüntüde sıra değişmeli, eskisi prev_rank olmalı.
    await setScore(playerId, 900);
    const t2 = new Date('2026-07-28T16:00:00.000Z');
    await takeSnapshot(h.db, worldId, t2);

    const second = await ranks();
    expect(second.get(playerId)).toEqual({ rank: 1, prev: 2 });
    expect(second.get(rakip)).toEqual({ rank: 2, prev: 1 });
  });

  it('yasaklanan oyuncu listeden düşer ve sıra numaraları onsuz dizilir', async () => {
    const banli = await createPlayer(h, worldId, 'banli');
    await setScore(playerId, 100);
    await setScore(banli, 500);
    await takeSnapshot(h.db, worldId, new Date('2026-07-28T08:00:00.000Z'));
    expect((await ranks()).get(banli)?.rank).toBe(1);

    await h.db.execute(sql`UPDATE players SET banned_at = now() WHERE id = ${banli}`);
    await takeSnapshot(h.db, worldId, new Date('2026-07-28T16:00:00.000Z'));

    const after = await ranks();
    expect(after.has(banli)).toBe(false);
    expect(after.get(playerId)?.rank).toBe(1);
  });

  /**
   * ⭐ SIRALAMA MUAFİYETİ (§0036) — iki bayrak, iki ayrı soru.
   *
   * ⚠️ En kritik iddia sonuncusu: muaf oyuncunun **kahramanı listede kalır**. Bu kullanıcının
   * açık şartıydı ve kahraman dalını "temizlik" niyetiyle muafiyete bağlamak, sessizce ihlal
   * edilmesi çok kolay bir karar — testi bu yüzden var.
   */
  it('muaf oyuncu sıralamadan düşer', async () => {
    const muaf = await createPlayer(h, worldId, 'muaf');
    await setScore(playerId, 100);
    await setScore(muaf, 500);
    await takeSnapshot(h.db, worldId, new Date('2026-07-28T08:00:00.000Z'));
    expect((await ranks()).get(muaf)?.rank).toBe(1);

    await h.db.execute(sql`UPDATE players SET ranking_excluded = true WHERE id = ${muaf}`);
    await takeSnapshot(h.db, worldId, new Date('2026-07-28T16:00:00.000Z'));

    const after = await ranks();
    expect(after.has(muaf)).toBe(false);
    expect(after.get(playerId)?.rank).toBe(1);
  });

  it('ittifak toplamı YALNIZ alliance_score_excluded ile düşer', async () => {
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO alliances (world_id, name, leader_id)
      VALUES (${worldId}, 'Muaf Testi', ${playerId}) RETURNING id
    `);
    const allianceId = Number(a!['id']);
    await h.db.execute(sql`UPDATE players SET alliance_id = ${allianceId} WHERE id = ${playerId}`);
    await setScore(playerId, 400);

    const total = async (): Promise<number> => {
      const rows = await h.db.execute<Record<string, unknown>>(sql`
        SELECT score FROM rankings
         WHERE world_id = ${worldId} AND kind = 'alliance' AND subject_id = ${allianceId}
      `);
      return Number(rows[0]?.['score'] ?? -1);
    };

    // Sıralamadan muaf ama ittifak toplamına DAHİL → puan takımında sayılmaya devam eder.
    await h.db.execute(sql`
      UPDATE players SET ranking_excluded = true, alliance_score_excluded = false
       WHERE id = ${playerId}
    `);
    await takeSnapshot(h.db, worldId, new Date('2026-07-29T08:00:00.000Z'));
    expect(await total()).toBe(400);

    // İkinci bayrak açılınca toplamdan da düşer.
    await h.db.execute(sql`
      UPDATE players SET alliance_score_excluded = true WHERE id = ${playerId}
    `);
    await takeSnapshot(h.db, worldId, new Date('2026-07-29T16:00:00.000Z'));
    expect(await total()).toBe(0);
  });

  it('muaf oyuncunun KAHRAMANI kahraman sıralamasında kalır', async () => {
    const [hero] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO heroes (world_id, player_id, name, level, xp, status)
      VALUES (${worldId}, ${playerId}, 'Muaf Kahraman', 5, 100, 'alive') RETURNING id
    `);
    const heroId = Number(hero!['id']);

    await h.db.execute(sql`
      UPDATE players SET ranking_excluded = true, alliance_score_excluded = true
       WHERE id = ${playerId}
    `);
    await takeSnapshot(h.db, worldId, new Date('2026-07-30T08:00:00.000Z'));

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT subject_id FROM rankings
       WHERE world_id = ${worldId} AND kind = 'hero' AND subject_id = ${heroId}
    `);
    expect(rows.length).toBe(1);
  });

  it('bir sonraki görevi yazar ve aynı ana İKİNCİ görev yazılamaz', async () => {
    const gameNow = new Date('2026-07-28T09:00:00.000Z');
    const at = await scheduleSnapshot(h.db, worldId, gameNow);
    expect(at.toISOString()).toBe('2026-07-28T16:00:00.000Z');
    await scheduleSnapshot(h.db, worldId, gameNow);   // tekrar — kopya olmamalı

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*) AS n FROM missions
       WHERE world_id = ${worldId} AND type = 'ranking_snapshot'
    `);
    expect(Number(rows[0]!['n'])).toBe(1);
  });
});

async function ranks(): Promise<Map<number, { rank: number; prev: number | null }>> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT subject_id, rank, prev_rank FROM rankings
     WHERE world_id = ${worldId} AND kind = 'player'
  `);
  const out = new Map<number, { rank: number; prev: number | null }>();
  for (const r of rows) {
    out.set(Number(r['subject_id']), {
      rank: Number(r['rank']),
      prev: r['prev_rank'] == null ? null : Number(r['prev_rank']),
    });
  }
  return out;
}
