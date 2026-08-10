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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UNITS_BY_ID, buildingCost } from '@mobilwar/catalog';
import { AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { QueueService } from '../src/queues/queue.service.ts';
import {
  lossValue, pointsFromBase, recomputeScoreBaseFromHoldings, rederiveScores, resourcePerPoint,
  scoreValue,
} from '../src/scoring/score.service.ts';
import { setLiveSettings } from '../src/settings/live.ts';
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
  auth = new AuthService(h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock, cities);
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

/**
 * Cüce üretebilmek için Baraka 1 (ön-şart). Şehirler 2026-08-09'dan beri Baraka **0** ile
 * doğuyor (kullanıcı kararı, `STARTING_BUILDINGS`).
 *
 * ⚠️ **Genel `beforeEach`e KONULAMAZ**, denendi ve kırdı: Baraka artık 0'dan başladığı için
 * seviye 1 *ödenmiş* bir seviye sayılıyor ve `recomputeScoreBaseFromHoldings` ona 200 puan
 * yazıyor. Bu da «hiç oynamamış oyuncu 0 kalır» testini düşürüyordu. Yani yardımcı, YALNIZ
 * asker üreten testlerde çağrılmalı.
 */
async function giveBarracks(): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO buildings (city_id, type, level) VALUES (${cityId}, 'barracks', 1)
    ON CONFLICT (city_id, type) DO UPDATE SET level = 1
  `);
}

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
    await giveBarracks();
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
    expect(await recomputeScoreBaseFromHoldings(h.db, worldId, fresh)).toBe(0);

    // Başlangıç yapıları (Kale/Baraka/Çiftlik/Maden sv1) HEDİYE → puan yazmaz.
    expect(await recomputeScoreBaseFromHoldings(h.db, worldId, playerId)).toBe(0);

    await h.db.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${cityId}, 'dwarf', 10)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 10
    `);
    const dwarf = UNITS_BY_ID['dwarf']!;
    const base = await recomputeScoreBaseFromHoldings(h.db, worldId, playerId);
    expect(base).toBe((dwarf.gold + dwarf.food) * 10);
    expect((await scoreOf()).score).toBe(Math.floor(base / 1000));
  });
});

describe('sıralama anlık görüntüsü', () => {
  /**
   * ⭐ **YUVALAR UTC'DEN TÜRKİYE SAATİNE TAŞINDI** (kullanıcı, 2026-08-04, ikinci bildirim:
   * *"oyunda 00:00 yazıyordu, admin panelde 03:00"*).
   *
   * ⚠️ Bu testin eski hâli 00/08/16 **UTC** bekliyordu ve geçiyordu — ama o yuvalar Türkiye'de
   * 03:00 / 11:00 / 19:00 demekti. Ekrandaki "günde üç kez, 00/08/16" vaadi ile oyuncunun
   * saatinin tutmamasının sebebi buydu. Artık aynı yuvalar TSİ'de, yani UTC'de 21:00 / 05:00 /
   * 13:00.
   */
  it('anlık görüntü saatleri TSİ 00:00 · 08:00 · 16:00', () => {
    const at = new Date('2026-07-28T09:31:00.000Z');            // TSİ 12:31
    expect(nextSnapshotAt(at).toISOString()).toBe('2026-07-28T13:00:00.000Z');     // TSİ 16:00
    expect(previousSnapshotAt(at).toISOString()).toBe('2026-07-28T05:00:00.000Z'); // TSİ 08:00

    // Tam yuva üstünde: "sonraki" bir sonraki dilim, "önceki" o anın kendisi.
    const onTheHour = new Date('2026-07-28T13:00:00.000Z');     // TSİ 16:00
    expect(nextSnapshotAt(onTheHour).toISOString()).toBe('2026-07-28T21:00:00.000Z'); // ertesi TSİ 00:00
    expect(previousSnapshotAt(onTheHour).toISOString()).toBe('2026-07-28T13:00:00.000Z');

    // TSİ gece yarısının hemen öncesi: önceki dilim o günün TSİ 16:00'sı.
    expect(previousSnapshotAt(new Date('2026-07-28T20:59:00.000Z')).toISOString())
      .toBe('2026-07-28T13:00:00.000Z');
    // TSİ gece yarısının kendisi: yeni günün ilk yuvası.
    expect(previousSnapshotAt(new Date('2026-07-28T21:00:00.000Z')).toISOString())
      .toBe('2026-07-28T21:00:00.000Z');
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

  /**
   * ⭐⭐ SİLİNMİŞ HESABIN KAHRAMANI LİSTEDEN DÜŞER (kullanıcı, 2026-08-09).
   *
   * ⚠️ Bir ÜSTTEKİ testin ikizi ve **kasten farklı sonuç veriyor**: muafiyet bayrağı kahramanı
   * listede bırakır (2026-08-03 şartı), hesabın silinmiş olması ise düşürür. İki soru ayrı:
   * "gizlensin mi" ile "bu hesap artık yok mu". Biri diğerine bağlanırsa ikisinden biri
   * sessizce ihlal edilir — ikisi de test edilmeden bırakılmamalı.
   *
   * ⚠️ Kahraman satırı sahibinin ADINI da yazıyor (`command.controller` → `owner`), yani bu
   * süzgeç olmadan silinmiş hesap oyuncu ve ittifak sekmelerinden düşse bile kahraman
   * sekmesinden vitrine geri sızıyordu.
   */
  it('⭐ SİLİNMİŞ hesabın kahramanı sıralamadan düşer (muafiyetten farklı)', async () => {
    const [hero] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO heroes (world_id, player_id, name, level, xp, status)
      VALUES (${worldId}, ${playerId}, 'Hayalet', 7, 250, 'alive') RETURNING id
    `);
    const heroId = Number(hero!['id']);
    const inRanking = async (): Promise<number> => {
      const rows = await h.db.execute<Record<string, unknown>>(sql`
        SELECT subject_id FROM rankings
         WHERE world_id = ${worldId} AND kind = 'hero' AND subject_id = ${heroId}
      `);
      return rows.length;
    };

    await takeSnapshot(h.db, worldId, new Date('2026-07-30T08:00:00.000Z'));
    expect(await inRanking(), 'silinmeden önce listede olmalı').toBe(1);

    // ⚠️ Hesap silinince satır ARTIK VAR olan bir kahramana ait; `NOT EXISTS (heroes)`
    //    temizliği onu bulamaz. Silme dalı `deleted_at`e de bakmazsa satır tabloda kalır.
    await h.db.execute(sql`UPDATE players SET deleted_at = now() WHERE id = ${playerId}`);
    await takeSnapshot(h.db, worldId, new Date('2026-07-30T16:00:00.000Z'));
    expect(await inRanking(), 'silinmiş hesabın kahramanı düşmeliydi').toBe(0);
  });

  it('bir sonraki görevi yazar ve aynı ana İKİNCİ görev yazılamaz', async () => {
    const gameNow = new Date('2026-07-28T09:00:00.000Z');       // TSİ 12:00
    const at = await scheduleSnapshot(h.db, worldId, gameNow);
    // Yuvalar TSİ'de: sıradaki 16:00 TSİ = 13:00Z (2026-08-04 değişikliği).
    expect(at.toISOString()).toBe('2026-07-28T13:00:00.000Z');
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

/**
 * ⭐⭐ KULLANICININ SAYDIĞI KURALLARIN TEK TEK DENETİMİ (2026-08-08).
 *
 * Kullanıcı puanlamayı sekiz maddede tarif etti ve *"bu hesaplama algoritmasını iyice bir test
 * et"* dedi. Bu blok o maddeleri **birebir** ölçüyor; her testin başlığı hangi maddeyi
 * kilitlediğini söylüyor ki bir gün biri kuralı değiştirmek istediğinde hangi testi
 * güncelleyeceğini bilsin.
 */
describe('⭐ puanlama kuralları — kullanıcının tarifi', () => {
  const spend = (c: { gold: number; food: number }): number => c.gold + c.food;

  it('K1 · yapı KÜMÜLATİF: her seviye ayrı ayrı eklenir', async () => {
    await giveResources(1e9, 1e9);
    const at = await clock.gameNow(worldId);
    const before = (await scoreOf()).base;

    // Çiftlik 1→2 ve 2→3: iki ayrı harcama, ikisi de toplanmalı.
    await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    await h.db.execute(sql`UPDATE buildings SET level = 2 WHERE city_id = ${cityId} AND type = 'farm'`);
    await h.db.execute(sql`DELETE FROM queues WHERE city_id = ${cityId}`);
    await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });

    const beklenen = spend(buildingCost('farm', 2)) + spend(buildingCost('farm', 3));
    expect((await scoreOf()).base - before).toBe(beklenen);
  });

  it('K2 · teknik yükseltmesi de puan yazar', async () => {
    await giveResources(1e9, 1e9);
    // ⚠️ Okçuluk'un ön-şartı Akademi 2 — kurgu eksikti ve test ilk yazımda bu yüzden düştü.
    await h.db.execute(sql`
      INSERT INTO buildings (city_id, type, level) VALUES (${cityId}, 'academy', 2)
      ON CONFLICT (city_id, type) DO UPDATE SET level = 2`);
    const at = await clock.gameNow(worldId);
    const before = (await scoreOf()).base;
    await queues.enqueueTech({ cityId, playerId, type: 'archery', at });
    expect((await scoreOf()).base - before).toBeGreaterThan(0);
  });

  it('K3 · asker üretimi puan yazar (adet kadar)', async () => {
    await giveBarracks();
    await giveResources(1e9, 1e9);
    await h.db.execute(sql`
      INSERT INTO techs (player_id, type, level) VALUES (${playerId}, 'blacksmithing', 1)
      ON CONFLICT (player_id, type) DO UPDATE SET level = 1`);
    const at = await clock.gameNow(worldId);
    const before = (await scoreOf()).base;
    await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 7, at });
    const d = UNITS_BY_ID['dwarf']!;
    expect((await scoreOf()).base - before).toBe((d.gold + d.food) * 7);
  });

  it('K4 · savunma birimi ve Sur da puan yazar', async () => {
    await giveResources(1e12, 1e12);
    await h.db.execute(sql`
      INSERT INTO techs (player_id, type, level) VALUES (${playerId}, 'archery', 1)
      ON CONFLICT (player_id, type) DO UPDATE SET level = 1`);
    // ⚠️ Okçu Kulesi'nin ön-şartı Sur 1; Sur'u önce kuruyoruz (kurgu eksikti).
    await h.db.execute(sql`
      INSERT INTO defenses (city_id, type, count) VALUES (${cityId}, 'wall', 1)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 1`);
    const at = await clock.gameNow(worldId);

    const a = (await scoreOf()).base;
    await queues.enqueueDefense({ cityId, playerId, type: 'archer_tower', count: 3, at });
    expect((await scoreOf()).base).toBeGreaterThan(a);

    const b = (await scoreOf()).base;
    await queues.enqueueDefense({ cityId, playerId, type: 'wall', count: 1, at });
    expect((await scoreOf()).base).toBeGreaterThan(b);
  });

  /** ⭐ Kullanıcı: *"Kahraman diriltmesi için harcanan ganimet puan vermez."* */
  it('K5 · KAHRAMAN DİRİLTME puan VERMEZ', async () => {
    await giveResources(1e9, 1e9);
    const at = await clock.gameNow(worldId);
    const before = (await scoreOf()).base;
    // Diriltme kuyruktan değil doğrudan `trySpend`ten geçiyor → puan yazılmamalı.
    await cities.trySpend(cityId, { gold: 50_000, food: 50_000 }, at);
    expect((await scoreOf()).base).toBe(before);
  });

  /** ⭐ Kullanıcı: *"Şehirde henüz harcanmayan ganimet miktarı da puan vermez."* */
  it('K6 · şehirdeki HARCANMAMIŞ kaynak puan vermez', async () => {
    const before = (await scoreOf()).base;
    await giveResources(9_999_999, 9_999_999);
    expect((await scoreOf()).base).toBe(before);
  });

  /** ⭐ Kullanıcı: *"savaşlarda kaybedilen askerler için aynı oranda puan kaybedilir."* */
  it('K7 · kayıp, üretimde YAZILAN puanın aynısını geri alır', async () => {
    await giveBarracks();
    await giveResources(1e9, 1e9);
    await h.db.execute(sql`
      INSERT INTO techs (player_id, type, level) VALUES (${playerId}, 'blacksmithing', 1)
      ON CONFLICT (player_id, type) DO UPDATE SET level = 1`);
    const at = await clock.gameNow(worldId);

    const before = (await scoreOf()).base;
    await queues.enqueueUnits({ cityId, playerId, type: 'dwarf', count: 10, at });
    const yazilan = (await scoreOf()).base - before;

    // Onunun da öldüğü senaryo: tam olarak yazılan kadar düşmeli.
    expect(lossValue({ dwarf: 10 })).toBe(yazilan);
  });

  it('K8 · puan oyuncunun TÜM şehirlerinin toplamı', async () => {
    await giveResources(1e9, 1e9);
    const at = await clock.gameNow(worldId);
    /**
     * ⚠️ `cities.create` **`number` döndürüyor**, nesne değil — ilk yazımda `ikinci.id`
     * yazdım, parametre `undefined` gitti ve Postgres «syntax error at end of input» dedi.
     */
    const ikinciId = await cities.create({
      worldId, playerId, name: 'ikinci', k: 1, d: 9, s: 9, isCapital: false, at,
    });
    await h.db.execute(sql`
      UPDATE cities SET gold = 1000000000::numeric, food = 1000000000::numeric
       WHERE id = ${ikinciId}`);

    const before = (await scoreOf()).base;
    await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    await queues.enqueueBuilding({ cityId: ikinciId, playerId, type: 'farm', at });

    // İki AYRI şehirdeki harcama tek oyuncu tabanında toplanmalı.
    expect((await scoreOf()).base - before).toBe(2 * spend(buildingCost('farm', 2)));
  });
});

/**
 * ⭐⭐ PUAN BÖLENİ PANELDEN AYARLANABİLİR (kullanıcı, 2026-08-08:
 * *"Bu 1000 değerini admin panelde ayarlardan değiştirilebilir yapalım"*).
 *
 * ⚠️ Ölçülen iki ayrı şey var ve ikincisi kolayca unutulur:
 *   1. Yeni harcamalar yeni böleni kullanıyor mu?
 *   2. **Zaten var olan puanlar** ayar değişince güncelleniyor mu? `score` yalnız harcama
 *      anında yeniden hesaplandığı için, bu olmadan yönetici düğmeyi çevirir ve ekranda
 *      hiçbir şey oynamaz — "kaydettim, çalışmıyor" arızası.
 */
describe('⭐ puan böleni ayarlanabilir', () => {
  afterEach(() => { setLiveSettings({}); });

  it('bölen ayardan okunur (varsayılan 1000)', () => {
    expect(resourcePerPoint(worldId)).toBe(1000);
    setLiveSettings({ scoring: { resourcePerPoint: 250 } });
    expect(resourcePerPoint(worldId)).toBe(250);
  });

  it('⭐ yeni harcama YENİ böleni kullanır', async () => {
    setLiveSettings({ scoring: { resourcePerPoint: 100 } });
    await giveResources(1e9, 1e9);
    const at = await clock.gameNow(worldId);
    await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });

    const { score, base } = await scoreOf();
    expect(score).toBe(Math.floor(base / 100));
  });

  it('⭐⭐ bölen değişince MEVCUT puanlar yeniden türetilir', async () => {
    // 10.000 birim harcanmış bir oyuncu: 1000 bölenle 10 puan.
    await h.db.execute(sql`
      UPDATE players SET score_base = 10000::numeric, score = 10 WHERE id = ${playerId}`);

    setLiveSettings({ scoring: { resourcePerPoint: 500 } });
    const n = await rederiveScores(h.db as never, worldId);

    expect(n).toBeGreaterThanOrEqual(1);
    const { score, base } = await scoreOf();
    expect(base, 'taban DEĞİŞMEMELİ — harcanan kaynak bölenden bağımsız').toBe(10000);
    expect(score, '10.000 / 500 = 20').toBe(20);
  });

  /** ⚠️ 0 ya da negatif bölen puanı sonsuza götürürdü; şema alt sınırı 1, kod da kelepçeliyor. */
  it('sıfır/negatif bölen kelepçelenir', () => {
    setLiveSettings({ scoring: { resourcePerPoint: 0 } });
    expect(resourcePerPoint(worldId)).toBe(1);
    setLiveSettings({ scoring: { resourcePerPoint: -5 } });
    expect(resourcePerPoint(worldId)).toBe(1);
  });
});
