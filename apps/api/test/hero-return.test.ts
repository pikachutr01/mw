/**
 * ⭐ KAHRAMAN EVE DÖNER — yok olma kaldırıldı (kullanıcı kararı, 2026-08-01).
 *
 * **Eski davranış:** kahramanla giden ordunun TAMAMI ölürse kahraman `destroyed` yazılıyor,
 * tapınakta 1 saat "Yok Edildi" görünüyor ve sonra **kaydı siliniyordu**. Oyuncunun kalıcı
 * olarak bir varlığı kaybettiği tek yer burasıydı.
 *
 * **Yeni davranış:** kahraman ölür ama silinmez. Taşıyacak birlik kalmasa bile dönüş görevi
 * kurulur ve süre **kahramanın kendi hızıyla** (`HERO_SPEED = 200`) hesaplanır — kalkışta
 * `payload.heroTravelSeconds`e yazılan sayı. Şehre varınca `city_id` dolar ve Dirilt açılır.
 *
 * Burada kilitlenen beş iddia:
 *   (a) tüm ordu + kahraman ölür → dönüş görevi VAR, birlik taşımıyor, süre kahraman hızıyla
 *   (b) dönüş varınca kahraman şehirde ve DİRİLTİLEBİLİR
 *   (c) savunanın kendi şehrinde ölen kahraman ANINDA diriltilebilir (yol yok)
 *   (d) ⚠️ REGRESYON: kahraman SAĞ + savaşçılar ölü → yine döner. Eskiden dönüş kurulmuyordu
 *       ve kahraman `city_id = NULL` + yetim `mission_heroes` satırıyla kalıyordu; tekil
 *       `mission_heroes_hero` indeksi yüzünden bir daha HİÇ sefere çıkamıyordu.
 *   (e) kahraman YOK + savaşçı yok → dönüş görevi de YOK (§13.11.7 korunuyor)
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HERO_SPEED, heroReviveCost } from '@mobilwar/catalog';
import { distance, travelSeconds } from '@mobilwar/engine';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { toDate } from '../src/db/client.ts';
import { battleHandlers } from '../src/missions/battle.handlers.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { missionHandlers } from '../src/missions/mission.handlers.ts';
import { MissionService } from '../src/missions/mission.service.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;
let cities: CityService;
let missions: MissionService;
let registry: HandlerRegistry;

let attacker: number;
let defender: number;
let attackCity: number;
let defendCity: number;

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  missions = new MissionService(h.db, cities);
  registry = new HandlerRegistry();
  // `attack` + `return` savaş tarafından, `transport`/`support`/`spy`/`found_city` diğerinden;
  // iki küme kesişmiyor (`register` çakışmada fırlatırdı).
  for (const [type, handler] of Object.entries(battleHandlers(cities))) registry.register(type, handler);
  for (const [type, handler] of Object.entries(missionHandlers(cities))) registry.register(type, handler);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  attacker = await createPlayer(h, worldId, 'atk');
  defender = await createPlayer(h, worldId, 'def');
  const at = await clock.gameNow(worldId);

  attackCity = await cities.create({
    worldId, playerId: attacker, name: 'saldiran', k: 1, d: 1, s: 1, isCapital: true, at,
  });
  defendCity = await cities.create({
    worldId, playerId: defender, name: 'savunan', k: 1, d: 1, s: 2, isCapital: true, at,
  });
  await h.db.execute(sql`UPDATE players SET protected_until = NULL WHERE world_id = ${worldId}`);
  await setBuilding(attackCity, 'barracks', 5);
});

/* ── yardımcılar ─────────────────────────────────────────────────────────────── */

const scheduler = (): SchedulerService =>
  new SchedulerService(h.db, clock, registry, { worldId, retryBackoffMs: 0 });

async function setBuilding(cityId: number, type: string, level: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO buildings (city_id, type, level) VALUES (${cityId}, ${type}, ${level})
    ON CONFLICT (city_id, type) DO UPDATE SET level = ${level}
  `);
}
async function giveUnits(cityId: number, type: string, count: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO units (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
    ON CONFLICT (city_id, type) DO UPDATE SET count = ${count}
  `);
}
async function giveDefenses(cityId: number, type: string, count: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO defenses (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
    ON CONFLICT (city_id, type) DO UPDATE SET count = ${count}
  `);
}
async function giveHero(playerId: number, cityId: number, level = 3): Promise<number> {
  const r = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO heroes (world_id, player_id, city_id, name, level, status)
    VALUES (${worldId}, ${playerId}, ${cityId}, ${'K-' + randomUUID().slice(0, 4)}, ${level}, 'alive')
    RETURNING id
  `);
  return Number(r[0]!['id']);
}
async function heroRow(id: number): Promise<Record<string, unknown>> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`SELECT * FROM heroes WHERE id = ${id}`);
  return rows[0]!;
}
async function returnMission(): Promise<Record<string, unknown> | undefined> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT * FROM missions WHERE world_id = ${worldId} AND type = 'return'
  `);
  return rows[0];
}
/**
 * Görevin vadesini geçmişe alıp çalıştırır.
 *
 * ⚠️ Eskiden bunun için dünyanın saati `clock_offset_ms` ile ileri sarılıyordu. Tek zaman
 * çizgisinde (0043) öyle bir kolon yok: oyun saati = `now()`. Vadeyi geriye almak aynı işi
 * yapıyor ve **daha dar** — yalnız hedef görevi etkiliyor, dünyadaki her şeyi değil.
 */
async function runDue(missionId: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE missions SET execute_at = now() - interval '1 second' WHERE id = ${missionId}
  `);
  await scheduler().tick();
}

/* ── (a) tüm ordu ölür: kahraman yine döner ──────────────────────────────────── */

describe('ordunun tamamı ölünce', () => {
  /**
   * Kurgu: 1 Cüce ile 3.000 Muhafız'a saldırı. Saldıranın kesin yok oluşu için savunan
   * kasıtlı olarak devasa; kahramanın da düşmesi bekleniyor.
   */
  async function suicideAttack(): Promise<{ heroId: number; missionId: number; at: Date }> {
    await giveUnits(attackCity, 'dwarf', 10);
    await giveDefenses(defendCity, 'guard', 3000);
    const heroId = await giveHero(attacker, attackCity);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 1 }, heroIds: [heroId], at,
    });
    return { heroId, missionId: m.missionId, at };
  }

  it('⭐ dönüş görevi KURULUR ve kahramanı taşır (eskiden kahraman silinirdi)', async () => {
    const { heroId, missionId } = await suicideAttack();
    await runDue(missionId);

    const hero = await heroRow(heroId);
    expect(hero['status']).toBe('dead');
    expect(hero['city_id']).toBeNull();          // henüz yolda

    const ret = await returnMission();
    expect(ret).toBeDefined();

    // Kahraman dönüş görevine bağlandı; dönüşte HİÇ birlik yok.
    const [mh] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT mission_id FROM mission_heroes WHERE hero_id = ${heroId}
    `);
    expect(Number(mh!['mission_id'])).toBe(Number(ret!['id']));
    const units = await h.db.execute<Record<string, unknown>>(sql`
      SELECT * FROM mission_units WHERE mission_id = ${ret!['id']}
    `);
    expect(units).toHaveLength(0);
  });

  it('⭐ dönüş süresi KAHRAMANIN hızıyla — ordu hızıyla DEĞİL', async () => {
    const { missionId } = await suicideAttack();

    // Kalkışta iki süre birden yazıldı; kahramanınki Cüce'ninkinden KISA (200 > 100).
    const [before] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT payload FROM missions WHERE id = ${missionId}
    `);
    const payload = before!['payload'] as Record<string, unknown>;
    const armySeconds = Number(payload['travelSeconds']);
    const heroSeconds = Number(payload['heroTravelSeconds']);

    const d = distance({ k: 1, d: 1, s: 1 }, { k: 1, d: 1, s: 2 });
    expect(heroSeconds).toBe(travelSeconds({ distance: d, speed: HERO_SPEED }));
    expect(heroSeconds).toBeLessThan(armySeconds);   // Cüce 100 vs kahraman 200

    await runDue(missionId);

    const ret = await returnMission();
    expect(Number((ret!['payload'] as Record<string, unknown>)['travelSeconds'])).toBe(heroSeconds);
  });

  it('⭐ şehre varınca kahraman evde ve DİRİLTİLEBİLİR', async () => {
    const { heroId, missionId } = await suicideAttack();
    await runDue(missionId);
    const ret = await returnMission();
    await runDue(Number(ret!['id']));

    const hero = await heroRow(heroId);
    expect(hero['status']).toBe('dead');
    expect(Number(hero['city_id'])).toBe(attackCity);   // ⭐ diriltme kapısının şartı

    // `mission_heroes` temizlendi → kahraman yeniden sefere çıkabilir durumda.
    const mh = await h.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM mission_heroes WHERE hero_id = ${heroId}
    `);
    expect(mh).toHaveLength(0);

    // Diriltme maliyeti seviyeye göre hesaplanabiliyor (uç bunu kullanıyor).
    expect(heroReviveCost(Number(hero['level'])).gold).toBeGreaterThan(0);
  });
});

/* ── (c) savunanda ölen kahraman: yol yok, anında evde ───────────────────────── */

describe('savunanın şehrinde ölen kahraman', () => {
  it('şehirde ÖLÜ kalır — dönüş yolu yok, hemen diriltilebilir', async () => {
    await giveUnits(attackCity, 'dragon', 200);
    await giveDefenses(defendCity, 'trap', 1);
    const heroId = await giveHero(defender, defendCity);
    const at = await clock.gameNow(worldId);

    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dragon: 200 }, heroIds: [], at,
    });
    await runDue(m.missionId);

    const hero = await heroRow(heroId);
    expect(hero['status']).toBe('dead');
    // ⭐ Savunanın kahramanı zaten evinde: `city_id` hiç boşalmadı.
    expect(Number(hero['city_id'])).toBe(defendCity);
  });
});

/* ── (d) REGRESYON: kahraman sağ, ordu yok ───────────────────────────────────── */

describe('⚠️ regresyon — kahraman sağ kalıp ordu yok olursa', () => {
  /**
   * ⭐ SENARYOYU KURAN MEKANİK: **tuzak salvosu**. `trapVolley` (`combat.ts:501`) yalnız
   * `atk.units` üzerinde çalışır — kahramanlara HİÇ dokunmaz. Böylece tek Cüce ilk turda
   * ölürken kahraman çiziksiz kalıyor. Normal savaşta bu ayrımı kurmak mümkün değil: hasar
   * güç payına göre bölündüğü için gücün neredeyse tamamını taşıyan kahraman, Cüce'den önce
   * kendisi soğuruyor (ilk denemede tam olarak bu oldu — kahraman da ölüyordu).
   *
   * Tuzak `NONCOMBAT` olduğu için savunan da "yenik" sayılıyor → saldıran kazanıyor ama
   * savaşçısı kalmıyor. Aranan tam durum: `attackerSurvivorCount = 0`, kahraman sağ.
   */
  it('kahraman KİLİTLENMEZ, dönüş görevine biner', async () => {
    await giveUnits(attackCity, 'dwarf', 10);
    await giveDefenses(defendCity, 'trap', 500);
    const heroId = await giveHero(attacker, attackCity, 40);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 1 }, heroIds: [heroId], at,
    });
    await runDue(m.missionId);

    /**
     * ⚠️ Bu testin ANLAMI kahramanın SAĞ kalmasına bağlı — ölseydi (a) senaryosunu tekrar
     * etmiş olurduk ve eski hata hiç sınanmazdı. Bu yüzden önce onu doğruluyoruz.
     * Eski kodda `survivingUnits === 0` dalı yalnız ÖLÜ kahramanı ele alıyordu; SAĞ kahraman
     * hiçbir dala düşmüyor, `mission_heroes` satırı eski göreve asılı kalıyordu.
     */
    expect((await heroRow(heroId))['status']).toBe('alive');

    const ret = await returnMission();
    expect(ret).toBeDefined();
    const [mh] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT mission_id FROM mission_heroes WHERE hero_id = ${heroId}
    `);
    expect(Number(mh!['mission_id'])).toBe(Number(ret!['id']));

    // Dönüş varınca kahraman şehirde ve yeniden sefere çıkabilir.
    await runDue(Number(ret!['id']));
    const hero = await heroRow(heroId);
    expect(Number(hero['city_id'])).toBe(attackCity);
    const left = await h.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM mission_heroes WHERE hero_id = ${heroId}
    `);
    expect(left).toHaveLength(0);
  });
});

/* ── (e) kahramansız yok oluş: kural DEĞİŞMEDİ ───────────────────────────────── */

describe('kahramansız ordu yok olunca', () => {
  it('dönüş görevi OLUŞMAZ (§13.11.7 korunuyor)', async () => {
    await giveUnits(attackCity, 'dwarf', 10);
    await giveDefenses(defendCity, 'guard', 3000);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 1 }, heroIds: [], at,
    });
    await runDue(m.missionId);

    expect(await returnMission()).toBeUndefined();
  });

  /**
   * ⚠️⚠️ **TEST TERSİNE DÖNDÜ (2026-08-21).** Eskiden *"kahraman taşımayan görevin yükünde
   * `heroTravelSeconds` YOKTUR"* diye kilitliyordu ve gerekçesi *"her göreve ölü bir alan
   * eklemiyoruz"* idi. O gerekçe **artık doğru değil**: saldırı, kahraman taşımasa bile
   * YENİ kahraman üretebiliyor (`maybeCaptureHero`) ve o kahraman ordunun tamamı ölmüşse
   * eve kendi hızıyla yürüyor. Alan olmasaydı `scheduleReturn` ordu hızına düşerdi.
   *
   * ⚠️ Kural yalnız SALDIRIDA genişledi: casus/nakliye/destek/kuruluş seferleri kahraman
   * üretmiyor, orada alan hâlâ yalnız gerçekten kahraman taşıyan görevlere yazılıyor.
   */
  it('⭐ SALDIRI yükünde heroTravelSeconds daima var (kahraman taşımasa bile)', async () => {
    await giveUnits(attackCity, 'dwarf', 10);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dwarf: 1 }, heroIds: [], at,
    });
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT payload FROM missions WHERE id = ${m.missionId}
    `);
    const payload = row!['payload'] as Record<string, unknown>;
    expect(payload).toHaveProperty('heroTravelSeconds');
    /* ⚠️ Kahraman hızı (200) cüceden (100) YÜKSEK → süresi de KISA olmalı. Eşitlik çıkarsa
       alan ordu hızıyla hesaplanmış demektir ve kusur sessizce geri gelmiş olur. */
    expect(Number(payload['heroTravelSeconds']))
      .toBeLessThan(Number(payload['travelSeconds']));
  });
});

/* ── (f) SAVAŞTAN ÇIKAN KAHRAMAN EVE YÜRÜR (kullanıcı, 2026-08-21) ───────────── */

/**
 * ⭐⭐ Kullanıcının şartı: *"Bir savaşta kahraman çıktığında ortaya çıkan kahraman o savaştaki
 * ordu geri dönene kadar başka bir savaşa gönderilemesin. Çünkü kahraman zaten o savaştan
 * çıkmıştır ve henüz eve varmamıştır."*
 *
 * ⚠️⚠️ Eski davranış: kahraman `city_id = <saldıranın şehri>` ile **anında** yazılıyordu.
 * Savaş rakibin kapısında çözülüyor, ordu saatlerce yolda oluyor, kahraman o saniye sefere
 * hazır görünüyordu.
 *
 * ⚠️ İhtimal motorda ölçülüyor (`captureChance`) ve gerçek bir savaşta %100 yapmak zor;
 * bu yüzden testler dünyaya özel motor ayarı geçiriyor (`engineFor`). Ölçülen şey ihtimal
 * DEĞİL, kahraman çıktıktan SONRAKİ yerleşim.
 */
describe('savaştan çıkan kahraman', () => {
  /** Kesin yakalama: eşik kapalı, tapınak başına pay devasa, ölçek 1. */
  const kesinYakalama = (): SchedulerService => new SchedulerService(
    h.db, clock, registry,
    {
      worldId,
      retryBackoffMs: 0,
      engineFor: () => ({
        combat: { capture: { xpGate: -1, xpScale: 1, perTempleLevel: 100_000 } },
      }),
    },
  );

  async function kos(missionId: number): Promise<void> {
    await h.db.execute(sql`
      UPDATE missions SET execute_at = now() - interval '1 second' WHERE id = ${missionId}
    `);
    await kesinYakalama().tick();
  }

  /** Yeni doğan kahraman = savaştan önce var olmayan satır. */
  async function yeniKahraman(playerId: number): Promise<Record<string, unknown> | undefined> {
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT * FROM heroes WHERE player_id = ${playerId} ORDER BY id DESC LIMIT 1
    `);
    return rows[0];
  }

  it('⭐⭐ SALDIRAN kazanınca kahraman EVDE DEĞİL, dönüş kafilesinde', async () => {
    await setBuilding(attackCity, 'temple', 5);      // T > 0 şart
    await giveUnits(attackCity, 'ogre', 20_000);
    await giveUnits(defendCity, 'dragon', 8000);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { ogre: 20_000 }, at,
    });
    await kos(m.missionId);

    const kahraman = await yeniKahraman(attacker);
    expect(kahraman).toBeDefined();
    expect(kahraman!['status']).toBe('alive');
    /* ⭐ ASIL İDDİA: şehirde DEĞİL — savaş alanından eve yürüyor. */
    expect(kahraman!['city_id']).toBeNull();

    /* ⭐ Ve dönüş görevine bağlı: `mission_heroes_hero` tekil indeksi sayesinde bu satır
       varken başka bir sefere seçilmesi **veritabanı seviyesinde** imkânsız. */
    const ret = await returnMission();
    expect(ret).toBeDefined();
    const [mh] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT mission_id FROM mission_heroes WHERE hero_id = ${kahraman!['id']}
    `);
    expect(Number(mh!['mission_id'])).toBe(Number(ret!['id']));
  });

  it('⭐ dönüş varınca kahraman şehre yerleşiyor ve serbest kalıyor', async () => {
    await setBuilding(attackCity, 'temple', 5);
    await giveUnits(attackCity, 'ogre', 20_000);
    await giveUnits(defendCity, 'dragon', 8000);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { ogre: 20_000 }, at,
    });
    await kos(m.missionId);

    const ret = await returnMission();
    await runDue(Number(ret!['id']));

    const kahraman = await yeniKahraman(attacker);
    expect(Number(kahraman!['city_id'])).toBe(attackCity);
    const kalan = await h.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM mission_heroes WHERE hero_id = ${kahraman!['id']}
    `);
    expect(kalan).toHaveLength(0);
  });

  /**
   * ⚠️ SAVUNANIN kahramanı YÜRÜMEZ: savaş zaten onun kapısında geçti, kahraman kendi
   * şehrinde doğuyor. Ona da yolculuk yazsaydık, hiç ayrılmadığı şehre "dönmesi" için
   * bekletmiş olurduk.
   */
  it('⭐⭐ SAVUNAN kazanınca kahraman ANINDA kendi şehrinde', async () => {
    await setBuilding(defendCity, 'temple', 5);
    /**
     * ⚠️⚠️ **Saldıran GÜÇLÜ ama YETERSİZ olmalı** ve kurulum motorla ölçülerek seçildi.
     *
     * Tecrübe `(aLM + dLM) × (dLM / aLM) × 0,001` ve saldıran zayıfken sonuç ≈ `dLM`
     * oluyor; `round()` 500'ün altını **sıfıra** indiriyor → yakalama çarpanı sıfırlanıyor
     * ve kahraman motorda hiç doğmuyor. 3.000 cüce bile bu eşiği geçemedi (ölçüldü);
     * 2.000 ejderha gündüz 8.326, gece 2.824 tecrübe üretiyor — iki hâlde de güvenli.
     * 30.000 muhafız savunanı kazandıracak kadar kalabalık.
     */
    await giveUnits(attackCity, 'dragon', 2000);
    await giveDefenses(defendCity, 'guard', 30_000);
    const at = await clock.gameNow(worldId);
    const m = await missions.sendAttack({
      originCityId: attackCity, playerId: attacker, worldId,
      target: { k: 1, d: 1, s: 2 }, units: { dragon: 2000 }, at,
    });
    await kos(m.missionId);

    /**
     * ⚠️ Kurulumun gerçekten savunanı kazandırdığını ÖNCE doğrula: saldıran kazanırsa
     * kahraman öteki tarafta doğar ve test "kahraman yok" diye anlamsız bir yerde düşer.
     *
     * ⚠️⚠️ Savaş **GÖREV KİMLİĞİNDEN** çekiliyor, `world_id`den DEĞİL. Test dünyaları
     * koşular arasında YENİDEN KULLANILIYOR (`freshWorldId` her koşuda 100'den başlıyor,
     * `createWorld` `ON CONFLICT DO UPDATE` yapıyor) — yani `WHERE world_id = ...` önceki
     * koşudan kalma bir savaşı okuyabiliyor. Bu tam olarak yaşandı: sorgu bambaşka bir
     * kurulumun sonucunu döndürüp testi yanlış yerden düşürdü.
     */
    const [savas] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT winner, result FROM battles WHERE mission_id = ${m.missionId}
    `);
    expect(savas!['winner']).toBe('defender');
    /* Tecrübe > 0 olmadan yakalama çarpanı sıfırlanır ve kahraman motorda hiç doğmaz. */
    expect(Number((savas!['result'] as Record<string, unknown>)['xp'])).toBeGreaterThan(0);

    const kahraman = await yeniKahraman(defender);
    expect(kahraman).toBeDefined();
    expect(Number(kahraman!['city_id'])).toBe(defendCity);
    const mh = await h.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM mission_heroes WHERE hero_id = ${kahraman!['id']}
    `);
    expect(mh).toHaveLength(0);
  });
});
