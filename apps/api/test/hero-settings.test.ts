/**
 * ⭐ KAHRAMAN AYARLARI GERÇEKTEN ULAŞIYOR MU (§admin Faz 4'ün ikinci yarısı).
 *
 * `combat-settings.test.ts` ayarın **motora** ulaştığını ölçüyor. Bu dosya bir sonraki soruyu
 * soruyor: motor doğru cevabı verse bile **API kendi kararını** dünya ayarıyla mı veriyor?
 *
 * ⚠️⚠️ Arızanın sınıfı tam olarak bu: eşleme (`settings/combat.ts`) doğruydu, `simulate` dünya
 * config'ini alıyordu — ama savaş handler'ı tecrübe payını, kahraman tavanını ve puan bütçesini
 * `DEFAULT_COMBAT_CONFIG`ten okuyordu. Yani ayar panelde görünüyor, kaydediliyor, motora da
 * ulaşıyor; sonra API onu **görmezden geliyordu**. Eşlemenin doğru olması yetmiyor: TÜKETİCİ de
 * dünya config'ini okumalı. Bu dosya o tüketicilerin bekçisi.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_COMBAT_CONFIG, mergeCombatConfig } from '@mobilwar/engine';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { HeroController } from '../src/heroes/hero.controller.ts';
import type { AuthedRequest } from '../src/auth/auth.guard.ts';
import { battleHandlers } from '../src/missions/battle.handlers.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { MissionService } from '../src/missions/mission.service.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import { SettingsService } from '../src/settings/settings.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, dueAt, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let clock: GameClockService;
let cities: CityService;
let missions: MissionService;
let registry: HandlerRegistry;
let svc: SettingsService;
let heroes: HeroController;

let worldId: number;
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
  for (const [type, handler] of Object.entries(battleHandlers(cities))) registry.register(type, handler);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  /** ⚠️ Dünya 0 katmanı TÜM dünyaları etkiliyor → önceki koşuların artığı bu testi kirletir. */
  await h.db.execute(sql`DELETE FROM settings`);
  await h.db.execute(sql`DELETE FROM settings_revisions`);
  /**
   * ⚠️ **Dünya kimlikleri koşular ARASINDA yeniden kullanılıyor** (`freshWorldId` her süreçte
   * 100'den başlıyor) → önceki koşunun savaş satırları aynı dünyada duruyor. İlk yazımda bu
   * satır yoktu ve `battleFacts()` eski bir savaşı okuyup testi rastgele düşürdü: handler
   * doğru dağıtıyorken test "kazanan" diye yanlış tarafa bakıyordu. `battle.test.ts` aynı
   * temizliği aynı sebeple yapıyor.
   */
  await h.db.execute(sql`DELETE FROM battles WHERE world_id = ${worldId}`);
  svc = new SettingsService(h.db);
  await svc.load();
  heroes = new HeroController(h.db, cities, clock, svc);

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

/**
 * ⭐ Zamanlayıcı ayarları motora BURADAN taşıyor. `battle.test.ts`in zamanlayıcısında
 * `engineFor` YOK (o dosya varsayılan dengeyi ölçüyor); bu dosyanın bütün sorusu ise
 * ayarın taşınıp taşınmadığı, o yüzden köprü açıkça kuruluyor.
 */
const scheduler = (): SchedulerService =>
  new SchedulerService(h.db, clock, registry, {
    worldId,
    retryBackoffMs: 0,
    engineFor: (w) => ({ combat: svc.combat(w), loot: svc.loot(w) }),
  });

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
async function mkHero(playerId: number, cityId: number, level = 0): Promise<number> {
  const r = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO heroes (world_id, player_id, city_id, name, level)
    VALUES (${worldId}, ${playerId}, ${cityId}, ${'K-' + randomUUID().slice(0, 6)}, ${level})
    RETURNING id
  `);
  return Number(r[0]!['id']);
}
async function runDue(missionId: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE missions SET execute_at = ${await dueAt(clock, worldId)}::timestamptz WHERE id = ${missionId}
  `);
  const r = await scheduler().tick();
  expect(r.dead).toBe(0);
}
const asReq = (playerId: number): AuthedRequest =>
  ({ player: { playerId, worldId } }) as unknown as AuthedRequest;

/* ═══ Tecrübe payı ══════════════════════════════════════════════════════════ */

/**
 * ⭐ Dengeli savaş kuruyor: tecrübe ancak iki taraf da ciddi kayıp verdiğinde oluşur
 * (`xp = (aLM+dLM) × kazananKaybı/kaybedenKaybı × 0,001`) ve iki tarafta da sağ kahraman
 * kalmalı ki İKİSİ de payını alsın.
 */
async function balancedBattleWithHeroes(): Promise<{ atkHero: number; defHero: number }> {
  await giveUnits(attackCity, 'dwarf', 3000);
  await giveUnits(defendCity, 'dwarf', 3000);
  const atkHero = await mkHero(attacker, attackCity);
  const defHero = await mkHero(defender, defendCity);
  const at = await clock.gameNow(worldId);
  const m = await missions.sendAttack({
    originCityId: attackCity, playerId: attacker, worldId,
    target: { k: 1, d: 1, s: 2 }, units: { dwarf: 3000 }, heroIds: [atkHero], at,
  });
  await runDue(m.missionId);
  return { atkHero, defHero };
}

async function xpOf(id: number): Promise<number> {
  const [r] = await h.db.execute<Record<string, unknown>>(sql`SELECT xp FROM heroes WHERE id = ${id}`);
  return Number(r!['xp']);
}

/** Savaşın ürettiği tecrübe HAVUZU ve kazananı — testin kimin kazandığını varsaymaması için. */
async function battleFacts(): Promise<{ pool: number; winner: string }> {
  const [row] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT winner, (result->>'xp')::int AS xp FROM battles
     WHERE world_id = ${worldId} ORDER BY id DESC LIMIT 1
  `);
  return { pool: Number(row!['xp']), winner: String(row!['winner']) };
}

describe('tecrübe payı ayarı', () => {
  /**
   * ⭐⭐ ARIZANIN KANITI. Düzeltmeden önce bu test KIRMIZI: handler payı
   * `DEFAULT_COMBAT_CONFIG`ten okuduğu için dünya 0,9 dese de 2/3 dağıtıyordu.
   */
  it('`hero.xpWinner` savaşa ULAŞIYOR — kazanan %90, kaybeden %10', async () => {
    await svc.update({ worldId, patch: { 'hero.xpWinner': 0.9 }, actorId: null });

    const { atkHero, defHero } = await balancedBattleWithHeroes();
    const { pool, winner } = await battleFacts();
    expect(pool, 'kurgu bozuk: dengeli savaş tecrübe üretmeliydi').toBeGreaterThan(0);

    const [winXp, loseXp] = winner === 'attacker'
      ? [await xpOf(atkHero), await xpOf(defHero)]
      : [await xpOf(defHero), await xpOf(atkHero)];

    /* ⚠️ Kaybedenin payı `1 − 0,9` ile hesaplanıyor (0,0999…8), düz `0,1` ile DEĞİL — beklenti
     * de aynı aritmetiği kullanmalı, yoksa kayan nokta bir gün testi sınırda düşürür. */
    expect(winXp).toBe(Math.round(pool * 0.9));
    expect(loseXp).toBe(Math.round(pool * (1 - 0.9)));
  });

  /** Dokunulmamış dünya varsayılan dengede kalmalı — düzeltme sessiz bir kayma getirmemeli. */
  it('ayar yokken varsayılan pay (2/3 · 1/3) AYNEN duruyor', async () => {
    const { atkHero, defHero } = await balancedBattleWithHeroes();
    const { pool, winner } = await battleFacts();
    const [winXp, loseXp] = winner === 'attacker'
      ? [await xpOf(atkHero), await xpOf(defHero)]
      : [await xpOf(defHero), await xpOf(atkHero)];

    expect(winXp).toBe(Math.round(pool * DEFAULT_COMBAT_CONFIG.heroXpShare.winner));
    expect(loseXp).toBe(Math.round(pool * DEFAULT_COMBAT_CONFIG.heroXpShare.loser));
  });

  /**
   * ⭐ `hero.xpLoser` KALDIRILDI: kaybeden payı artık türetiliyor. Havuz TEK olduğu için iki
   * bağımsız düğme, toplamı 1'den farklı yapılabildiğinde savaşın ürettiği tecrübeyi sessizce
   * çoğaltıyor ya da buharlaştırıyordu.
   */
  it.each([0.9, 0.5, 1, 0])('kaybeden payı OTOMATİK kayıyor — toplam hep 1 (%s)', async (w) => {
    await svc.update({ worldId, patch: { 'hero.xpWinner': w }, actorId: null });
    const share = mergeCombatConfig(svc.combat(worldId)).heroXpShare;
    expect(share.winner).toBe(w);
    expect(share.winner + share.loser).toBe(1);
  });

  it('`hero.xpLoser` artık YAZILAMAZ (ayar kaldırıldı)', async () => {
    await expect(svc.update({ worldId, patch: { 'hero.xpLoser': 0.5 }, actorId: null }))
      .rejects.toThrow();
  });

  /** Eşleme tek anahtardan İKİ alanı birden yazmalı; yoksa toplam 1 değişmezi kırılır. */
  it('tek anahtar iki alanı da yazıyor', async () => {
    await svc.update({ worldId, patch: { 'hero.xpWinner': 0.75 }, actorId: null });
    expect(svc.combat(worldId)).toEqual({ heroXpShare: { winner: 0.75, loser: 0.25 } });
  });
});

/* ═══ Kahraman tavanı ═══════════════════════════════════════════════════════ */

/**
 * Çıkma ihtimalini %100'e sabitleyen ayar demeti — rulo devre dışı kalsın diye.
 * `chance = min(100, (T×perTempleLevel − K×perHeroPenalty) × min(1, xp×xpScale))`
 */
const CERTAIN_CAPTURE = {
  'capture.xpGate': 0,
  'capture.xpScale': 1,
  'capture.perTempleLevel': 1000,
  'capture.perHeroPenalty': 0,
} as const;

async function heroCountOf(playerId: number): Promise<number> {
  const [r] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT COUNT(*)::int AS n FROM heroes WHERE player_id = ${playerId} AND status <> 'destroyed'
  `);
  return Number(r!['n']);
}

/** İki tarafa da tapınak + tam 5 kahraman verir; kim kazanırsa kazansın tavana dayanmış olur. */
async function captureSetup(): Promise<void> {
  await setBuilding(attackCity, 'temple', 5);
  await setBuilding(defendCity, 'temple', 5);
  await giveUnits(attackCity, 'dwarf', 3000);
  await giveUnits(defendCity, 'dwarf', 3000);
  // Saldıranın 1'i sefere çıkacak + 4'ü evde = 5; savunanın 5'i şehirde.
  for (let i = 0; i < 4; i++) await mkHero(attacker, attackCity);
  for (let i = 0; i < 5; i++) await mkHero(defender, defendCity);
}

async function runCaptureBattle(): Promise<void> {
  const atkHero = await mkHero(attacker, attackCity);
  const at = await clock.gameNow(worldId);
  const m = await missions.sendAttack({
    originCityId: attackCity, playerId: attacker, worldId,
    target: { k: 1, d: 1, s: 2 }, units: { dwarf: 3000 }, heroIds: [atkHero], at,
  });
  await runDue(m.missionId);
}

describe('kahraman tavanı ayarı', () => {
  /** Kontrol vakası: varsayılan tavanda 5 kahramanlı oyuncuya altıncısı ÇIKMAZ. */
  it('varsayılan dünyada 5\'te duruyor', async () => {
    await svc.update({ worldId, patch: { ...CERTAIN_CAPTURE }, actorId: null });
    await captureSetup();
    await runCaptureBattle();

    const { winner } = await battleFacts();
    const winnerId = winner === 'attacker' ? attacker : defender;
    expect(await heroCountOf(winnerId)).toBe(5);
  });

  /**
   * ⭐⭐ ARIZANIN KANITI. Motor `capture.maxHeroes = 8`e uyuyor ama API'deki İKİNCİ kapı
   * sabit 5'ti → ayar yarı yolda kesiliyordu. Düzeltmeden önce bu test KIRMIZI.
   */
  it('`capture.maxHeroes` API kapısına da ULAŞIYOR — 8\'de altıncı çıkar', async () => {
    await svc.update({
      worldId, patch: { ...CERTAIN_CAPTURE, 'capture.maxHeroes': 8 }, actorId: null,
    });
    await captureSetup();
    await runCaptureBattle();

    const { winner } = await battleFacts();
    const winnerId = winner === 'attacker' ? attacker : defender;
    expect(await heroCountOf(winnerId)).toBe(6);
  });
});

/* ═══ Puan bütçesi ve tapınak ekranı ════════════════════════════════════════ */

describe('kahraman puanı ayarı', () => {
  /**
   * ⭐⭐ ARIZANIN KANITI. Bütçe `DEFAULT_COMBAT_CONFIG`ten okunuyordu: dünya 5 puan/seviye
   * dese bile oyuncu seviye 2 kahramana 6'dan fazlasını dağıtamıyordu.
   */
  it('`hero.pointsPerLevel` bütçeye ULAŞIYOR — seviye 2\'ye 10 puan', async () => {
    await svc.update({ worldId, patch: { 'hero.pointsPerLevel': 5 }, actorId: null });
    const id = await mkHero(attacker, attackCity, 2);

    const out = await heroes.skills(
      String(id), { fAtk: 10, fDef: 0, mAtk: 0, mDef: 0 }, asReq(attacker),
    );
    expect(out['remaining']).toBe(0);
  });

  it('varsayılan dünyada bütçe 3×seviye olarak KALIYOR', async () => {
    const id = await mkHero(attacker, attackCity, 2);
    await expect(heroes.skills(
      String(id), { fAtk: 7, fDef: 0, mAtk: 0, mDef: 0 }, asReq(attacker),
    )).rejects.toThrow();

    const out = await heroes.skills(
      String(id), { fAtk: 6, fDef: 0, mAtk: 0, mDef: 0 }, asReq(attacker),
    );
    expect(out['remaining']).toBe(0);
  });

  it('dünya ayarı düşükse bütçe de DÜŞÜYOR', async () => {
    await svc.update({ worldId, patch: { 'hero.pointsPerLevel': 1 }, actorId: null });
    const id = await mkHero(attacker, attackCity, 2);
    await expect(heroes.skills(
      String(id), { fAtk: 3, fDef: 0, mAtk: 0, mDef: 0 }, asReq(attacker),
    )).rejects.toThrow();
  });

  /** Tapınak ekranı iki sayıyı da API'den okuyor (`Temple.tsx`) → dünya değerini yansıtmalı. */
  it('tapınak ekranı dünya değerlerini gösteriyor', async () => {
    await svc.update({
      worldId, patch: { 'capture.maxHeroes': 8, 'hero.pointsPerLevel': 5 }, actorId: null,
    });
    await setBuilding(attackCity, 'temple', 3);
    const id = await mkHero(attacker, attackCity, 2);

    const out = await heroes.temple(String(attackCity), asReq(attacker));
    expect(out['maxHeroes']).toBe(8);
    expect(out['pointsPerLevel']).toBe(5);

    const list = out['heroes'] as Record<string, unknown>[];
    const mine = list.find((x) => x['id'] === id)!;
    expect(mine['pointsTotal']).toBe(10);          // 2 seviye × 5 puan
  });

  it('ayar yokken tapınak ekranı varsayılanı gösteriyor', async () => {
    await setBuilding(attackCity, 'temple', 3);
    const out = await heroes.temple(String(attackCity), asReq(attacker));
    expect(out['maxHeroes']).toBe(DEFAULT_COMBAT_CONFIG.capture.maxHeroes);
    expect(out['pointsPerLevel']).toBe(DEFAULT_COMBAT_CONFIG.hero.pointsPerLevel);
  });
});
