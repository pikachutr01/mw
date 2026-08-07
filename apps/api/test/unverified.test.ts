/**
 * ⭐ DOĞRULANMAMIŞ HESAP KISITLARI (§verify, kullanıcı kararı 2026-08-01).
 *
 * Bu turdan önce doğrulama **tamamen dişsizdi**: `email-token.service.ts:7-10` "doğrulama
 * YUMUŞAK" diyordu, `VerifyBanner.tsx` "oyunun HİÇBİR yerinde engellenmez" diye tekrarlıyordu.
 * Yani sahte hesap üretmenin bedeli sıfırdı.
 *
 * Burada kilitlenen iddialar:
 *   • yasak olanlar gerçekten yasak (saldırı · nakliye · şehir kurma · savunma ünitesi ·
 *     ittifak · mesaj · şehir adı)
 *   • serbest olanlar gerçekten serbest (casusluk · kendi şehirleri arasında destek)
 *   • ⭐ tavanlar «≥» çalışıyor: doğrulamayı sonradan kaybeden oyuncu **elindekini kaybetmez**
 *   • ⭐ savaşçı sayımı baraka + mağara + yoldaki + kuyruğu birlikte görüyor
 *   • doğrulanmış hesapta kısıtların HİÇBİRİ tetiklenmiyor (yanlış pozitif yok)
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AllianceError, AllianceService } from '../src/alliance/alliance.service.ts';
import { unverifiedLimits } from '../src/auth/unverified.ts';
import { ChatError, ChatService } from '../src/chat/chat.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { MissionError, MissionService } from '../src/missions/mission.service.ts';
import { QueueError, QueueService } from '../src/queues/queue.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb, verifyEmail } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;
let cities: CityService;
let queues: QueueService;
let missions: MissionService;
let alliances: AllianceService;
let chat: ChatService;

/** Doğrulanmamış oyuncu — kısıtların hedefi. */
let me: number;
let myCity: number;
let myColony: number;
/** Doğrulanmış komşu — hem hedef hem karşılaştırma. */
let other: number;
let otherCity: number;

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  queues = new QueueService(h.db, cities);
  missions = new MissionService(h.db, cities);
  alliances = new AllianceService(h.db);
  chat = new ChatService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  me = await createPlayer(h, worldId, 'unv', { verified: false });
  other = await createPlayer(h, worldId, 'ver');
  const at = await clock.gameNow(worldId);

  myCity = await cities.create({
    worldId, playerId: me, name: 'benim', k: 1, d: 1, s: 1, isCapital: true, at,
  });
  myColony = await cities.create({
    worldId, playerId: me, name: 'koloni', k: 1, d: 1, s: 3, isCapital: false, at,
  });
  otherCity = await cities.create({
    worldId, playerId: other, name: 'komsu', k: 1, d: 1, s: 2, isCapital: true, at,
  });
  await h.db.execute(sql`UPDATE players SET protected_until = NULL WHERE world_id = ${worldId}`);
  await setBuilding(myCity, 'barracks', 5);
  await setResources(myCity, 50_000_000, 50_000_000);

  /**
   * ⚠️ ÖN-ŞART TEKNİKLERİ: Cüce Demircilik 1, Okçu Kulesi Okçuluk 1 istiyor ve `enqueue*`
   * ön-şartı §verify tavanından ÖNCE kontrol ediyor. Bunlar verilmezse test "doğrulanmamış"
   * yerine "ön-şart eksik" hatası alır ve iddiayı hiç sınamaz.
   * ⚠️ Seviye 1 seçildi: tavanın (3) altında, yani kısıtın kendisini bozmuyor.
   */
  for (const p of [me, other]) {
    await setTech(p, 'blacksmithing', 1);
    await setTech(p, 'archery', 1);
  }
  /**
   * ⚠️ Sohbetin 12 saatlik acemi kısıtı (`chat.service.ts:513`) §verify'dan bağımsız ve
   * ondan ÖNCE tetikleniyor. Oyuncuları yaşlandırmazsak sohbet testi yanlış sebeple kırmızı olur.
   */
  await h.db.execute(sql`
    UPDATE players SET created_at = now() - interval '30 days' WHERE world_id = ${worldId}
  `);
});

/* ── yardımcılar ─────────────────────────────────────────────────────────────── */

async function setBuilding(cityId: number, type: string, level: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO buildings (city_id, type, level) VALUES (${cityId}, ${type}, ${level})
    ON CONFLICT (city_id, type) DO UPDATE SET level = ${level}
  `);
}
async function setTech(playerId: number, type: string, level: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO techs (player_id, type, level) VALUES (${playerId}, ${type}, ${level})
    ON CONFLICT (player_id, type) DO UPDATE SET level = ${level}
  `);
}
async function setDefense(cityId: number, type: string, count: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO defenses (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
    ON CONFLICT (city_id, type) DO UPDATE SET count = ${count}
  `);
}
async function giveUnits(cityId: number, type: string, count: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO units (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
    ON CONFLICT (city_id, type) DO UPDATE SET count = ${count}
  `);
}
async function setResources(cityId: number, gold: number, food: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE cities SET gold = ${gold}::numeric, food = ${food}::numeric, resources_at = now()
     WHERE id = ${cityId}
  `);
}
const now = (): Promise<Date> => clock.gameNow(worldId);

/* ── SEFERLER ────────────────────────────────────────────────────────────────── */

describe('seferler', () => {
  it('saldırı YASAK', async () => {
    await giveUnits(myCity, 'dwarf', 50);
    await expect(missions.sendAttack({
      originCityId: myCity, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at: await now(),
    })).rejects.toMatchObject({ code: 'email_unverified' });
  });

  it('nakliye YASAK', async () => {
    await giveUnits(myCity, 'cargo_wagon', 5);
    await expect(missions.sendTransport({
      originCityId: myCity, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { cargo_wagon: 1 },
      cargo: { gold: 100, food: 0 }, at: await now(),
    })).rejects.toMatchObject({ code: 'email_unverified' });
  });

  it('şehir kurma YASAK', async () => {
    await giveUnits(myCity, 'dwarf', 50);
    await setTech(me, 'colonization', 3);
    await expect(missions.sendFoundCity({
      originCityId: myCity, playerId: me, worldId,
      /* ⚠️ Koordinat 2026-08-07'de `s: 40` → `s: 7` yapıldı: diyar başına 10 şehir yeri var
         (`WORLD_SHAPE`), yani 40 hiç var olmayan bir yerdi. Sefer yolu bunu denetlemediği
         için test yıllarca geçerli görünüyordu; `assertWithinWorld` eklenince ortaya çıktı.
         Testin ölçtüğü şey doğrulama kısıtı, koordinat değil. */
      target: { k: 1, d: 1, s: 7 }, units: { dwarf: 10 }, at: await now(),
    })).rejects.toMatchObject({ code: 'email_unverified' });
  });

  /**
   * ⚠️ Bu test kullanıcının varsayımını koruyor: *"zaten en fazla 1 şehir kurabileceği için"*.
   * Varsayım kendiliğinden doğru DEĞİLDİ — Sömürgecilik de bir teknik ve tavanı 3, yani
   * `maxCities(3) = 1 + ⌊3/3⌋ = 2`. Şehir kurma ayrıca yasaklanmasaydı doğrulanmamış oyuncu
   * ikinci şehri kurabilirdi.
   */
  it('⭐ Sömürgecilik 3\'e çıksa bile ikinci şehir kurulamıyor', async () => {
    await setTech(me, 'colonization', 3);
    await giveUnits(myCity, 'dwarf', 50);
    await expect(missions.sendFoundCity({
      originCityId: myCity, playerId: me, worldId,
      /* ⚠️ `s: 41` → `s: 8`; gerekçesi bir üstteki testte. */
      target: { k: 1, d: 1, s: 8 }, units: { dwarf: 10 }, at: await now(),
    })).rejects.toMatchObject({ code: 'email_unverified' });
  });

  it('casusluk SERBEST (kullanıcı şartı)', async () => {
    await giveUnits(myCity, 'spy_bird', 20);
    const r = await missions.sendSpy({
      originCityId: myCity, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: 5 }, at: await now(),
    });
    expect(r.missionId).toBeGreaterThan(0);
  });

  it('KENDİ şehirleri arasında destek SERBEST', async () => {
    await giveUnits(myCity, 'dwarf', 50);
    const r = await missions.sendSupport({
      originCityId: myCity, playerId: me, worldId,
      target: { k: 1, d: 1, s: 3 }, units: { dwarf: 10 }, at: await now(),
    });
    expect(r.missionId).toBeGreaterThan(0);
  });

  it('doğrulanmış hesapta saldırı SERBEST (yanlış pozitif yok)', async () => {
    await setBuilding(otherCity, 'barracks', 5);
    await giveUnits(otherCity, 'dwarf', 50);
    const r = await missions.sendAttack({
      originCityId: otherCity, playerId: other, worldId,
      target: { k: 1, d: 1, s: 1 }, units: { dwarf: 10 }, at: await now(),
    });
    expect(r.missionId).toBeGreaterThan(0);
  });
});

/* ── ÜRETİM VE SEVİYE TAVANLARI ──────────────────────────────────────────────── */

describe('yapı ve teknik tavanı', () => {
  it('yapı tavana kadar SERBEST, tavanda YASAK', async () => {
    const max = unverifiedLimits().maxBuildingLevel;
    await setBuilding(myCity, 'farm', max - 1);
    // Tavanın BİR altındayken hâlâ yükseltebilir (tavan seviyesine çıkmak serbest).
    await expect(queues.enqueueBuilding({ cityId: myCity, playerId: me, type: 'farm', at: await now() }))
      .resolves.toMatchObject({ targetLevel: max });

    await h.db.execute(sql`DELETE FROM queues WHERE city_id = ${myCity}`);
    await setBuilding(myCity, 'farm', max);
    await expect(queues.enqueueBuilding({ cityId: myCity, playerId: me, type: 'farm', at: await now() }))
      .rejects.toMatchObject({ code: 'email_unverified' });
  });

  it('teknik tavanda YASAK', async () => {
    const max = unverifiedLimits().maxTechLevel;
    await setBuilding(myCity, 'academy', 20);
    await setTech(me, 'archery', max);
    await expect(queues.enqueueTech({ cityId: myCity, playerId: me, type: 'archery', at: await now() }))
      .rejects.toMatchObject({ code: 'email_unverified' });
  });

  it('Sur tavanda YASAK', async () => {
    const max = unverifiedLimits().maxDefenseLevel;
    await setDefense(myCity, 'wall', max);
    await expect(queues.enqueueDefense({ cityId: myCity, playerId: me, type: 'wall', count: 1, at: await now() }))
      .rejects.toMatchObject({ code: 'email_unverified' });
  });

  it('adetli savunma ünitesi TAMAMEN yasak (seviye tavanı değil, düz yasak)', async () => {
    await setDefense(myCity, 'wall', 1);
    await expect(queues.enqueueDefense({
      cityId: myCity, playerId: me, type: 'archer_tower', count: 1, at: await now(),
    })).rejects.toMatchObject({ code: 'email_unverified' });
  });

  /**
   * ⭐ KULLANICININ AÇIK ŞARTI: *"Eğer oyuncu e postası onaylı iken onaysız durum
   * kısıtlarından fazla iş yaptıysa (örneğin akademideki tekniklerin 6 yaptıysa) tüm bunlar
   * korunur ama onaysız olduğu için kısıtlamalara tabi olur."*
   *
   * ⚠️ Sınav bu: tavanın ÜSTÜNDEKİ seviye korunuyor mu? Kural «>» ile kurulsaydı (hedef
   * seviye tavanı aşıyor mu) sonuç aynı olurdu; ama «≥» ile kurulduğu için tavanın üstündeki
   * oyuncu da net bir ret alıyor ve hiçbir seviyesi geri alınmıyor.
   */
  it('⭐ tavanın ÜSTÜNDEKİ seviye KORUNUR, yalnız ilerleme durur', async () => {
    const max = unverifiedLimits().maxTechLevel;
    await setBuilding(myCity, 'academy', 20);
    await setTech(me, 'archery', max + 3);          // doğrulanmışken kazanılmış seviye

    await expect(queues.enqueueTech({ cityId: myCity, playerId: me, type: 'archery', at: await now() }))
      .rejects.toMatchObject({ code: 'email_unverified' });

    // Seviye hâlâ yerinde — hiçbir şey geri alınmadı.
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT level FROM techs WHERE player_id = ${me} AND type = 'archery'
    `);
    expect(Number(row!['level'])).toBe(max + 3);
  });
});

/* ── SAVAŞÇI TAVANI ──────────────────────────────────────────────────────────── */

describe('savaşçı tavanı', () => {
  it('tavanı aşan sipariş reddedilir, altındaki geçer', async () => {
    const max = unverifiedLimits().maxWarriors;
    await expect(queues.enqueueUnits({
      cityId: myCity, playerId: me, type: 'dwarf', count: max + 1, at: await now(),
    })).rejects.toMatchObject({ code: 'email_unverified' });

    await expect(queues.enqueueUnits({
      cityId: myCity, playerId: me, type: 'dwarf', count: max, at: await now(),
    })).resolves.toMatchObject({ count: max });
  });

  /**
   * ⭐ SAYIM DÖRT KAYNAKTAN. Yalnız baraka sayılsaydı oyuncu tavanı doldurur, orduyu sefere
   * yollar (baraka boşalır) ve tavan kadar daha üretirdi — limit hiçbir şey ifade etmezdi.
   * Aynı boşluk mağara ve bekleyen kuyruk için de geçerli.
   */
  it('⭐ sayıma mağaradaki, yoldaki ve kuyruktaki savaşçılar da giriyor', async () => {
    const max = unverifiedLimits().maxWarriors;
    await setBuilding(myCity, 'cave', 5);

    // 1) mağara
    await h.db.execute(sql`
      INSERT INTO cave_units (city_id, type, count) VALUES (${myCity}, 'dwarf', ${max - 10})
    `);
    await expect(queues.enqueueUnits({
      cityId: myCity, playerId: me, type: 'dwarf', count: 11, at: await now(),
    })).rejects.toMatchObject({ code: 'email_unverified' });
    // Kalan boşluk kadarı geçiyor (10).
    await expect(queues.enqueueUnits({
      cityId: myCity, playerId: me, type: 'dwarf', count: 10, at: await now(),
    })).resolves.toBeTruthy();

    // 2) KUYRUK: az önceki 10 kuyruğa girdi → artık hiç yer yok.
    await expect(queues.enqueueUnits({
      cityId: myCity, playerId: me, type: 'dwarf', count: 1, at: await now(),
    })).rejects.toMatchObject({ code: 'email_unverified' });

    // 3) YOLDAKİ: mağarayı boşalt, orduyu casusluğa yolla — yine sayılıyor.
    await h.db.execute(sql`DELETE FROM cave_units WHERE city_id = ${myCity}`);
    await h.db.execute(sql`DELETE FROM queues WHERE city_id = ${myCity}`);
    await giveUnits(myCity, 'spy_bird', max);
    await missions.sendSpy({
      originCityId: myCity, playerId: me, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { spy_bird: max }, at: await now(),
    });
    await expect(queues.enqueueUnits({
      cityId: myCity, playerId: me, type: 'dwarf', count: 1, at: await now(),
    })).rejects.toMatchObject({ code: 'email_unverified' });
  });

  it('doğrulanmış hesapta tavan HİÇ uygulanmıyor', async () => {
    await setBuilding(otherCity, 'barracks', 5);
    await setResources(otherCity, 50_000_000, 50_000_000);
    const r = await queues.enqueueUnits({
      cityId: otherCity, playerId: other, type: 'dwarf',
      count: unverifiedLimits().maxWarriors * 10, at: await now(),
    });
    expect(r.count).toBe(unverifiedLimits().maxWarriors * 10);
  });
});

/* ── İTTİFAK · SOHBET · ŞEHİR ADI ────────────────────────────────────────────── */

describe('sosyal kısıtlar', () => {
  it('ittifak kurulamaz', async () => {
    await setBuilding(myCity, 'castle', 20);
    await expect(alliances.found({ worldId, playerId: me, name: 'Kartal' }))
      .rejects.toBeInstanceOf(AllianceError);
    await expect(alliances.found({ worldId, playerId: me, name: 'Kartal' }))
      .rejects.toMatchObject({ code: 'email_unverified' });
  });

  /**
   * ⚠️ Kapı `applyMembership`te: "oyuncu X ittifak Y'ye girdi" olayının TEK yeri orası ve
   * üç ayrı yoldan geliniyor. Başvuruyu ONAYLAYAN doğrulanmış olsa bile KATILAN kısıtlıysa
   * katılım gerçekleşmemeli — kontrol onaylayanda olsaydı bu boşluk açık kalırdı.
   */
  it('⭐ başvuru doğrulanmış bir konsey üyesince onaylansa da katılım olmuyor', async () => {
    await setBuilding(otherCity, 'castle', 20);
    const a = await alliances.found({ worldId, playerId: other, name: 'Kartal' });
    const inviteId = await alliances.apply({ worldId, playerId: me, allianceId: a.id });

    await expect(alliances.decide({ worldId, playerId: other, inviteId, accept: true }))
      .rejects.toMatchObject({ code: 'email_unverified' });

    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT alliance_id FROM players WHERE id = ${me}
    `);
    expect(row!['alliance_id']).toBeNull();
  });

  it('mesaj yazılamaz (okumak serbest)', async () => {
    const channelId = await chat.openConversation({ worldId, playerId: other, withPlayerId: me });
    // Doğrulanmış taraf yazabiliyor…
    await chat.send({
      worldId, playerId: other, channelId, body: 'selam', clientMsgId: randomUUID(),
    });
    // …doğrulanmamış taraf CEVAP VEREMİYOR (kullanıcı şartı).
    await expect(chat.send({
      worldId, playerId: me, channelId, body: 'merhaba', clientMsgId: randomUUID(),
    })).rejects.toMatchObject({ code: 'email_unverified' });
  });

  it('kısıtlar kapatılınca hiçbiri tetiklenmiyor', async () => {
    const { setLiveSettings } = await import('../src/settings/live.ts');
    setLiveSettings({ verify: { enabled: false } });
    try {
      await giveUnits(myCity, 'dwarf', 50);
      const r = await missions.sendAttack({
        originCityId: myCity, playerId: me, worldId,
        target: { k: 1, d: 1, s: 2 }, units: { dwarf: 10 }, at: await now(),
      });
      expect(r.missionId).toBeGreaterThan(0);
    } finally {
      setLiveSettings({});
    }
  });
});
