/**
 * ⭐ KÜRATÖRLÜ AKSİYONLAR + VERİ TABANI TARAYICI (admin Faz 7).
 *
 * Fazın gerekçesi tek cümle: bu tablolarda **ham yazmak sessizce yanlış**. En önemli vaka
 * `cities.gold`: kaynak tembel birikimle tutuluyor ve elle yazılan sayı bir sonraki okumada
 * tutmuyor. Buradaki ilk grup hem tuzağı hem doğru yolu ölçüyor.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN_ACTIONS, AdminActionsController } from '../src/admin/admin.actions.controller.ts';
import { AdminDbController } from '../src/admin/admin.db.controller.ts';
import { TABLES_BY_NAME, DB_TABLES } from '../src/admin/db-registry.ts';
import type { AdminRequest } from '../src/admin/admin.guard.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, freshWorldId, setupTestDb, verifyEmail } from './helpers/db.ts';

let h: DbHandle;
let actions: AdminActionsController;
let dbCtl: AdminDbController;
let cities: CityService;
let clock: GameClockService;
let auth: AuthService;

let worldId: number;
let playerId: number;
let cityId: number;

const req = (): AdminRequest => ({
  player: { accountId: 1, playerId, worldId, sessionId: '' },
  headers: {},
} as unknown as AdminRequest);

/** Sorgu parametresi taşıyan sahte istek (tarayıcı uçları `req.query` okuyor). */
const queryReq = (q: Record<string, unknown>): AdminRequest =>
  ({ ...req(), query: q } as unknown as AdminRequest);

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  dbCtl = new AdminDbController(h.db);
  auth = new AuthService(
    h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock,
  );
  // ⚠️ `auth` ÖNCE kurulmalı: `purge-player` oturumları düşürmek için onu kullanıyor.
  actions = new AdminActionsController(h.db, cities, clock, auth);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  const t = randomUUID().slice(0, 8);
  const r = await auth.register({
    email: `a-${t}@test.local`, password: 'parola-12345', username: `a_${t}`, worldId,
  }, { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' });
  playerId = r.playerId;
  // Kayıt akışı hesabı doğrulanmamış bırakır; bu dosya §verify kısıtlarını ölçmüyor.
  await verifyEmail(h, playerId);
  const [c] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT id FROM cities WHERE player_id = ${playerId}
  `);
  cityId = Number(c!['id']);
});

const unitsOf = async (id: number): Promise<Record<string, number>> => {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT type, count FROM units WHERE city_id = ${id}
  `);
  return Object.fromEntries(rows.map((r) => [String(r['type']), Number(r['count'])]));
};

/**
 * Oyuncunun GÖRECEĞİ kaynak (tembel birikim uygulanmış).
 * ⚠️ `CitySnapshot` alanları DÜZ (`gold`/`food`); `resources` diye bir sarmalayıcı yok —
 * ilk yazımda öyle sanılmıştı ve dört vaka `undefined.gold` ile patladı.
 */
async function visibleResources(id: number): Promise<{ gold: number; food: number }> {
  const at = await clock.gameNow(worldId);
  const snap = (await cities.snapshot(id, at))!;
  return { gold: snap.gold, food: snap.food };
}

/* ═══ Şehre ordu koy — kullanıcının somut ihtiyacı ══════════════════════════ */

describe('şehre ordu koy', () => {
  it('⭐ barakaya birim yazar', async () => {
    await actions.giveUnits({ cityId, units: { dwarf: 500, elf: 120 } }, req());
    expect(await unitsOf(cityId)).toMatchObject({ dwarf: 500, elf: 120 });
  });

  it('mevcut adedi DEĞİŞTİRİR (üstüne eklemez)', async () => {
    await actions.giveUnits({ cityId, units: { dwarf: 500 } }, req());
    await actions.giveUnits({ cityId, units: { dwarf: 80 } }, req());
    expect((await unitsOf(cityId))['dwarf']).toBe(80);
  });

  it('0 adet satırı SİLER (kurulumu sıfırlamak için)', async () => {
    await actions.giveUnits({ cityId, units: { dwarf: 500 } }, req());
    await actions.giveUnits({ cityId, units: { dwarf: 0 } }, req());
    expect((await unitsOf(cityId))['dwarf']).toBeUndefined();
  });

  /**
   * ⚠️ Uydurma birim kimliği `units` tablosuna yazılırsa savaş motoru onu tanımaz ve o şehrin
   * HER savaşı sessizce eksik orduyla çözülür. Katalogdan doğrulama bu yüzden var.
   */
  it('⭐ bilinmeyen birim REDDEDİLİR', async () => {
    await expect(actions.giveUnits({ cityId, units: { ejderha_x: 5 } }, req()))
      .rejects.toThrow();
    expect(await unitsOf(cityId)).toEqual({});
  });

  it('mağaraya da yazabilir (ayrı tablo)', async () => {
    await actions.giveUnits({ cityId, units: { dwarf: 300 }, target: 'cave' }, req());
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT count FROM cave_units WHERE city_id = ${cityId} AND type = 'dwarf'
    `);
    expect(Number(row!['count'])).toBe(300);
    // Baraka BOŞ kalmalı — iki tablo karışmasın.
    expect(await unitsOf(cityId)).toEqual({});
  });

  it('her işlem audit_log\'a yazılır', async () => {
    await actions.giveUnits({ cityId, units: { dwarf: 10 } }, req());
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT action FROM audit_log WHERE world_id = ${worldId} AND action = 'admin.action.give_units'
    `);
    expect(rows).toHaveLength(1);
  });
});

/* ═══ ⭐ Kısıt 4: kaynak tembel birikimle tutuluyor ═════════════════════════ */

describe('kaynak ver / al', () => {
  /**
   * ⭐ **FAZIN GEREKÇESİ.** Ham `UPDATE cities SET gold = …` sessizce tutmuyor: `resources_at`
   * çıpası geçmişte kaldığı için bir sonraki okumada üstüne birikim ekleniyor. Bu test önce
   * TUZAĞI gösteriyor, sonra doğru yolun çalıştığını.
   */
  it('⭐ HAM yazma tutmaz — okunan değer yazılandan FARKLI', async () => {
    // Çıpayı geçmişe it: 2 saatlik birikim birikmiş olsun.
    await h.db.execute(sql`
      UPDATE cities SET resources_at = resources_at - interval '2 hours' WHERE id = ${cityId}
    `);
    await h.db.execute(sql`UPDATE cities SET gold = 1000 WHERE id = ${cityId}`);

    const seen = await visibleResources(cityId);
    // Yazılan 1000; görülen ise 1000 + iki saatlik üretim.
    expect(seen.gold).toBeGreaterThan(1000);
  });

  it('⭐ AKSİYON doğru çalışır: önce materialize, sonra ekle', async () => {
    await h.db.execute(sql`
      UPDATE cities SET resources_at = resources_at - interval '2 hours' WHERE id = ${cityId}
    `);
    const before = await visibleResources(cityId);

    await actions.grantResources({ cityId, gold: 5000, food: 0 }, req());
    const after = await visibleResources(cityId);

    /**
     * ⚠️ Tolerans 60: aksiyon ile okuma arasında geçen gerçek saniyelerde üretim akmaya
     * devam ediyor. Ölçtüğümüz şey "tam olarak +5000" değil, **eklemenin kaybolmaması**.
     */
    expect(after.gold - before.gold).toBeGreaterThanOrEqual(5000);
    expect(after.gold - before.gold).toBeLessThan(5000 + 60);
  });

  it('negatif değer ALIR', async () => {
    await actions.grantResources({ cityId, gold: 10_000, food: 0 }, req());
    const before = await visibleResources(cityId);
    await actions.grantResources({ cityId, gold: -4000, food: 0 }, req());
    const after = await visibleResources(cityId);
    expect(after.gold).toBeLessThan(before.gold);
  });

  /** ⚠️ Kasa eksiye düşmez: mevcuttan fazla "al" isteği mevcut kadar alır. */
  it('⭐ kasa EKSİYE düşmez', async () => {
    const r = await actions.grantResources(
      { cityId, gold: -999_999_999, food: -999_999_999 }, req(),
    );
    expect((await visibleResources(cityId)).gold).toBeGreaterThanOrEqual(0);
    // Uygulanan miktar istenenden KÜÇÜK olmalı (kırpıldı) ve audit'te ikisi de duruyor.
    expect((r['applied'] as { gold: number }).gold).toBeGreaterThan(-999_999_999);
  });
});

/* ═══ Türev alanlar ═════════════════════════════════════════════════════════ */

describe('puan (türev alan)', () => {
  /**
   * ⭐ `players.score` TÜREVDİR. Ordu vermek onu kendiliğinden değiştirmiyor — bu bilinçli:
   * test aracı oyuncuyu sıralamada yukarı taşımamalı. Düzeltmek isteyen ayrı aksiyonu çağırır.
   */
  it('ordu vermek puanı DEĞİŞTİRMEZ, yeniden hesaplama değiştirir', async () => {
    const scoreOf = async (): Promise<number> => {
      const [p] = await h.db.execute<Record<string, unknown>>(sql`
        SELECT score FROM players WHERE id = ${playerId}
      `);
      return Number(p!['score']);
    };
    await actions.giveUnits({ cityId, units: { dwarf: 5000 } }, req());
    const afterUnits = await scoreOf();

    const r = await actions.recomputeScore({ playerId }, req());
    expect(await scoreOf()).toBe(Number(r['after']));
    expect(Number(r['after'])).toBeGreaterThan(afterUnits);
  });
});

/* ═══ Hesabı elle doğrula ═══════════════════════════════════════════════════ */

/**
 * ⭐ HESABI ELLE DOĞRULA (kullanıcı, 2026-08-09) — doğrulama e-postası ulaşmayan oyuncunun
 * tek çıkışı. Doğrulanmamış hesap saldıramıyor, nakliye yapamıyor, ittifağa giremiyor ve
 * mesaj yazamıyor; adres yanlış yazıldıysa oyuncunun elinde başka hiçbir yol kalmıyordu.
 */
describe('hesabı elle doğrula', () => {
  const verifiedAt = async (): Promise<unknown> => {
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT a.email_verified_at FROM accounts a
        JOIN players p ON p.account_id = a.id WHERE p.id = ${playerId}
    `);
    return a!['email_verified_at'];
  };

  it('doğrular ve geri alır', async () => {
    // `beforeEach` hesabı doğrulanmış bırakıyor; önce doğrulanmamışa çekiyoruz.
    await actions.verifyEmailAction({ playerId, verified: 'hayır' }, req());
    expect(await verifiedAt()).toBeNull();

    const r = await actions.verifyEmailAction({ playerId, verified: 'evet' }, req());
    expect(r['ok']).toBe(true);
    expect(r['verified']).toBe(true);
    expect(await verifiedAt()).not.toBeNull();
  });

  /**
   * ⚠️ Aksiyon OYUNCU alıyor ama kolon `accounts` tablosunda. Kayıt sırasında oyuncu ve hesap
   * bire bir eşleşiyor; yazmanın hesaba gittiğini ispat etmek gerekiyor çünkü aynı hesabın
   * başka dünyalarda oyuncusu olabilir ve doğrulama onlarda da geçerli olmalı.
   */
  it('⭐ yazma HESABA gider — aynı hesabın başka oyuncusu da doğrulanmış olur', async () => {
    const [acc] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT account_id FROM players WHERE id = ${playerId}
    `);
    const world2 = freshWorldId();
    await createWorld(h, world2);
    const [ikinci] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO players (world_id, account_id, username)
      VALUES (${world2}, ${Number(acc!['account_id'])}, ${'ikinci_' + randomUUID().slice(0, 6)})
      RETURNING id
    `);

    await actions.verifyEmailAction({ playerId, verified: 'hayır' }, req());
    await actions.verifyEmailAction({ playerId: Number(ikinci!['id']), verified: 'evet' }, req());

    // İkinci dünyadaki oyuncudan doğrulandı → BİRİNCİSİ de doğrulanmış görünmeli.
    expect(await verifiedAt()).not.toBeNull();
  });

  it('bilinmeyen oyuncu 404', async () => {
    await expect(actions.verifyEmailAction({ playerId: 999_999_999, verified: 'evet' }, req()))
      .rejects.toMatchObject({ status: 404 });
  });

  it('künyede kayıtlı ve alanları panelin form üreticisiyle uyumlu', async () => {
    const a = ADMIN_ACTIONS.find((x) => x.id === 'verify-email');
    expect(a, 'aksiyon künyeye eklenmemiş — panelde görünmez').toBeDefined();
    expect(a!.fields.map((f) => f.key)).toEqual(['playerId', 'verified']);
  });
});

/* ═══ Kuyruk ↔ görev çifti ══════════════════════════════════════════════════ */

describe('kuyruğu iptal et', () => {
  /**
   * ⭐ Kuyruk satırı ile bitiş GÖREVİ çifttir. Yalnız kuyruğu kapatsaydık görev ayakta kalır
   * ve vadesi gelince olmayan bir kuyruğu tamamlamaya çalışırdı.
   */
  it('⭐ kuyruk VE görev birlikte kapanır', async () => {
    const at = await clock.gameNow(worldId);
    const [q] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO missions (world_id, type, status, execute_at, idempotency_key)
      VALUES (${worldId}, 'building_finish', 'scheduled', ${at.toISOString()}::timestamptz,
              ${`q-${randomUUID()}`})
      RETURNING id
    `);
    const missionId = Number(q!['id']);
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO queues (world_id, city_id, player_id, category, item_type, target_level,
                          started_at, finish_at, spent_gold, spent_food, mission_id)
      VALUES (${worldId}, ${cityId}, ${playerId}, 'building', 'farm', 5,
              ${at.toISOString()}::timestamptz, ${at.toISOString()}::timestamptz, 10, 10,
              ${missionId})
      RETURNING id
    `);

    await actions.cancelQueue({ id: Number(row!['id']) }, req());

    const [after] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT q.canceled_at, m.status FROM queues q JOIN missions m ON m.id = q.mission_id
       WHERE q.id = ${Number(row!['id'])}
    `);
    expect(after!['canceled_at']).not.toBeNull();
    expect(String(after!['status'])).toBe('canceled');
  });
});

/* ═══ Veri tabanı tarayıcı ══════════════════════════════════════════════════ */

describe('tarayıcı', () => {
  it('kayıtta olmayan tablo YOK muamelesi görür', async () => {
    await expect(dbCtl.rows('pg_shadow', queryReq({}))).rejects.toThrow();
    await expect(dbCtl.rows('accounts; DROP TABLE players', queryReq({}))).rejects.toThrow();
  });

  it('satırları okur ve sayfalar', async () => {
    const r = await dbCtl.rows('players', queryReq({ world_id: String(worldId) }));
    expect(Number(r['total'])).toBeGreaterThan(0);
    expect((r['rows'] as unknown[]).length).toBeGreaterThan(0);
  });

  /** Filtre YALNIZ kayıttaki alanlarla; tanımsız alan sessizce yok sayılır. */
  it('kayıtta olmayan filtre alanı yok sayılır', async () => {
    const all = await dbCtl.rows('players', queryReq({}));
    const bogus = await dbCtl.rows('players', queryReq({ password_hash: 'x' }));
    expect(Number(bogus['total'])).toBe(Number(all['total']));
    expect(bogus['applied']).toEqual({});
  });

  /* ── Ham düzenleme ─────────────────────────────────────────────────────── */

  it('⭐ salt-okunur tablo düzenlenemez', async () => {
    await expect(dbCtl.patch('audit_log',
      { where: { id: 1 }, values: { action: 'x' } }, req())).rejects.toThrow();
    await expect(dbCtl.patch('battles',
      { where: { id: 1 }, values: { winner: 'attacker' } }, req())).rejects.toThrow();
    await expect(dbCtl.patch('outbox',
      { where: { id: 1 }, values: { topic: 'x' } }, req())).rejects.toThrow();
  });

  /** ⚠️ `action` politikalı tablo da ham kipte kapalı — doğru yol küratörlü aksiyon. */
  it('⭐ aksiyon-politikalı tablo ham kipte düzenlenemez', async () => {
    await expect(dbCtl.patch('cities',
      { where: { player_id: playerId }, values: { gold: 999 } }, req())).rejects.toThrow();
  });

  it('⭐ izinsiz KOLON reddedilir', async () => {
    // `players` düzenlenebilir ama `score` listede yok (türev alan).
    await expect(dbCtl.patch('players',
      { where: { username: 'x' }, values: { score: 999 } }, req())).rejects.toThrow();
  });

  it('izinli kolon düzenlenir ve ESKİ hâl audit\'e yazılır', async () => {
    const r = await dbCtl.patch('players', {
      where: { username: (await usernameOf()) },
      /* ⚠️ `vacation_until` DEĞİL: tatil alanları artık salt-okunur (§tatil modu) — elle
         temizlemek kaynak çıpasını ortada bırakıyordu. `protected_until` aynı aileden
         (zaman damgası, düzenlenebilir) ve testin ölçtüğü şey kolonun kendisi değil,
         izinli bir kolonun yazılıp audit'e düşmesi. */
      values: { protected_until: new Date(Date.now() + 86_400_000).toISOString() },
    }, req());
    expect(Number(r['updated'])).toBe(1);

    const [audit] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT before, after FROM audit_log WHERE action = 'admin.db.patch'
       ORDER BY id DESC LIMIT 1
    `);
    expect(audit!['before']).toBeTruthy();
    expect(audit!['after']).toBeTruthy();
  });

  it('boş `where` reddedilir (tüm tabloyu güncellemesin)', async () => {
    await expect(dbCtl.patch('players', { where: {}, values: { alliance_id: null } }, req()))
      .rejects.toThrow();
  });

  it('anahtar olmayan alanla satır seçilemez', async () => {
    await expect(dbCtl.patch('players',
      { where: { score: 0 }, values: { alliance_id: null } }, req())).rejects.toThrow();
  });

  async function usernameOf(): Promise<string> {
    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username FROM players WHERE id = ${playerId}
    `);
    return String(p!['username']);
  }
});

/* ═══ Kayıt tutarlılığı ═════════════════════════════════════════════════════ */

describe('tablo kaydı', () => {
  it('her tablo gerçekten var ve kolonları doğru', async () => {
    for (const spec of DB_TABLES) {
      const rows = await h.db.execute<Record<string, unknown>>(sql`
        SELECT column_name FROM information_schema.columns WHERE table_name = ${spec.name}
      `);
      expect(rows.length, `tablo yok: ${spec.name}`).toBeGreaterThan(0);
      const have = new Set(rows.map((r) => String(r['column_name'])));
      for (const col of [...(spec.columns ?? []), ...(spec.editable ?? []),
        ...(spec.filters ?? []), spec.orderBy]) {
        expect(have.has(col), `${spec.name}.${col} yok`).toBe(true);
      }
    }
  });

  /** ⚠️ `editable` her zaman `columns`un ALT KÜMESİ olmalı — görünmeyen alan düzenlenemesin. */
  it('düzenlenebilir kolonlar görünen kolonların alt kümesi', () => {
    for (const spec of DB_TABLES) {
      const shown = new Set(spec.columns ?? []);
      for (const col of spec.editable ?? []) {
        expect(shown.has(col), `${spec.name}.${col} görünmüyor ama düzenlenebilir`).toBe(true);
      }
      if ((spec.editable?.length ?? 0) > 0) expect(spec.policy).toBe('edit');
    }
  });

  /** ⛔ Ekleme-yalnız üçlü ASLA `edit` olmamalı. */
  it('ekleme-yalnız tablolar salt-okunur', () => {
    for (const name of ['audit_log', 'battles', 'outbox']) {
      expect(TABLES_BY_NAME[name]?.policy, name).toBe('readonly');
    }
  });
});

/* ═══ Oyuncuyu dünyadan kaldır — GERİ ALINAMAZ ══════════════════════════════ */

/**
 * ⭐ `purge-player` (kullanıcı, 2026-08-06). Hesap silmeden farkı: orası oyuncunun kendi
 * gizlilik hakkı (başkent KALIR, ad anonimleşir), burası bir moderasyon işlemi — dünyada
 * hiçbir şey kalmaz ama `players` satırı ve AD korunur (savaş geçmişi delik vermesin).
 *
 * ⚠️ Testlerin yarısı "ne SİLİNMEDİĞİNİ" ölçüyor: yalnız silmeyi doğrulayan bir demet,
 * her şeyi silen bir uygulamada da yeşil kalırdı.
 */
describe('oyuncuyu dünyadan kaldır', () => {
  /** İkinci bir oyuncu — "başkası etkilenmiyor" ve ittifak vakaları için. */
  async function otherPlayer(name: string): Promise<{ playerId: number; cityId: number }> {
    const t = randomUUID().slice(0, 8);
    const r = await auth.register({
      email: `o-${t}@test.local`, password: 'parola-12345', username: name, worldId,
    }, { deviceId: randomUUID(), ip: '85.104.12.8', userAgent: 'test', platform: 'web' });
    await verifyEmail(h, r.playerId);
    const [c] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM cities WHERE player_id = ${r.playerId}
    `);
    return { playerId: r.playerId, cityId: Number(c!['id']) };
  }

  async function usernameOf(id: number): Promise<string> {
    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username FROM players WHERE id = ${id}
    `);
    return String(p!['username']);
  }

  async function cityCount(pid: number): Promise<number> {
    const [r] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM cities WHERE player_id = ${pid}
    `);
    return Number(r!['n']);
  }

  async function heroCount(pid: number): Promise<number> {
    const [r] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM heroes WHERE player_id = ${pid}
    `);
    return Number(r!['n']);
  }

  async function addHero(pid: number, cid: number): Promise<void> {
    await h.db.execute(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name)
      VALUES (${worldId}, ${pid}, ${cid}, 'kahraman')
    `);
  }

  async function addMission(o: {
    owner?: number; origin?: number; target?: number;
  }): Promise<number> {
    const [m] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id,
                            target_city_id, execute_at)
      VALUES (${worldId}, 'attack', 'scheduled', ${o.owner ?? null}, ${o.origin ?? null},
              ${o.target ?? null}, now() + interval '1 hour')
      RETURNING id
    `);
    return Number(m!['id']);
  }

  async function statusOf(id: number): Promise<string> {
    const [m] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT status FROM missions WHERE id = ${id}
    `);
    return String(m!['status']);
  }

  /** Yöneticinin kendisi başka biri — "kendini kaldıramaz" kapısı devrede olmasın. */
  const admin = (): AdminRequest => ({
    player: { accountId: 1, playerId: -1, worldId, sessionId: '' }, headers: {},
  } as unknown as AdminRequest);

  it('⭐ başkent DAHİL tüm şehirleri, kahramanları ve açık görevleri kaldırır', async () => {
    await h.db.execute(sql`
      INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital)
      VALUES (${worldId}, ${playerId}, 'koloni', 9, 9, 9, false)
    `);
    await addHero(playerId, cityId);
    const mine = await addMission({ owner: playerId, origin: cityId });

    const res = await actions.purgePlayer(
      { playerId, confirm: await usernameOf(playerId) }, admin(),
    );

    expect(res['cities']).toBe(2);       // ⭐ başkent de gitti (hesap silmede KALIYOR)
    expect(res['heroes']).toBe(1);
    expect(await cityCount(playerId)).toBe(0);
    expect(await heroCount(playerId)).toBe(0);
    expect(await statusOf(mine)).toBe('canceled');
  });

  it('⭐ oyuncu satırı ve ADI SİLİNMEZ; işaretlenir ve kalıcı cezalanır', async () => {
    const before = await usernameOf(playerId);
    await actions.purgePlayer({ playerId, confirm: before }, admin());

    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username, deleted_at, banned_at, ban_until, score, score_base, ranking_excluded
        FROM players WHERE id = ${playerId}
    `);
    expect(p, 'oyuncu satırı silinmemeli').toBeTruthy();
    // ⚠️ Ad KORUNUYOR: hesap silmenin aksine bu gizlilik işlemi değil, denetim izi.
    expect(String(p!['username'])).toBe(before);
    expect(p!['deleted_at']).not.toBeNull();
    expect(p!['banned_at']).not.toBeNull();
    expect(p!['ban_until'], 'ceza KALICI olmalı').toBeNull();
    expect(Number(p!['score'])).toBe(0);
    expect(Number(p!['score_base'])).toBe(0);
    expect(p!['ranking_excluded']).toBe(true);
  });

  it('⭐ ONAY EŞLEŞMEZSE hiçbir şey silinmez', async () => {
    await addHero(playerId, cityId);
    await expect(actions.purgePlayer({ playerId, confirm: 'yanlis-ad' }, admin()))
      .rejects.toThrow(/Onay eşleşmedi/);

    // Kritik: reddin YAN ETKİSİ olmamalı.
    expect(await cityCount(playerId)).toBe(1);
    expect(await heroCount(playerId)).toBe(1);
    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT banned_at FROM players WHERE id = ${playerId}
    `);
    expect(p!['banned_at']).toBeNull();
  });

  it('yönetici kendini kaldıramaz', async () => {
    await expect(actions.purgePlayer(
      { playerId, confirm: await usernameOf(playerId) }, req(),
    )).rejects.toThrow(/Kendini/);
  });

  it('⭐ BAŞKA oyuncunun şehri ve görevi ETKİLENMEZ', async () => {
    const other = await otherPlayer(`o_${randomUUID().slice(0, 6)}`);
    const theirs = await addMission({ owner: other.playerId, origin: other.cityId });

    await actions.purgePlayer({ playerId, confirm: await usernameOf(playerId) }, admin());

    expect(await cityCount(other.playerId)).toBe(1);
    expect(await statusOf(theirs)).toBe('scheduled');
  });

  it('⭐ kaldırılana GELEN saldırı da iptal edilir (hedefi yok oldu)', async () => {
    const other = await otherPlayer(`g_${randomUUID().slice(0, 6)}`);
    const incoming = await addMission({
      owner: other.playerId, origin: other.cityId, target: cityId,
    });

    await actions.purgePlayer({ playerId, confirm: await usernameOf(playerId) }, admin());

    // ⚠️ `missions` FK'sız: elle iptal edilmezse varışta şehri bulamayıp `failed`'a düşerdi.
    expect(await statusOf(incoming)).toBe('canceled');
  });

  it('ittifak ÜYESİ kaldırılınca ittifak yaşar, yönetime mesaj gider', async () => {
    const lider = await otherPlayer(`l_${randomUUID().slice(0, 6)}`);
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO alliances (world_id, name, leader_id)
      VALUES (${worldId}, ${`it${worldId}`}, ${lider.playerId}) RETURNING id
    `);
    const aid = Number(a!['id']);
    await h.db.execute(sql`
      UPDATE players SET alliance_id = ${aid}, alliance_role = 3 WHERE id = ${lider.playerId}
    `);
    await h.db.execute(sql`
      UPDATE players SET alliance_id = ${aid}, alliance_role = 1 WHERE id = ${playerId}
    `);

    const res = await actions.purgePlayer(
      { playerId, confirm: await usernameOf(playerId) }, admin(),
    );
    expect(res['allianceDisbanded']).toBe(false);
    expect(await h.db.execute(sql`SELECT 1 FROM alliances WHERE id = ${aid}`)).toHaveLength(1);

    const [msg] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT subject, body FROM messages
       WHERE player_id = ${lider.playerId} AND kind = 'system' ORDER BY id DESC LIMIT 1
    `);
    expect(String(msg!['subject'])).toBe('Bir üye dünyadan kaldırıldı');
    expect(String((msg!['body'] as Record<string, unknown>)['text'])).not.toBe('');
  });

  /**
   * ⭐ LİDER kaldırılınca ittifak DAĞITILIR. Alternatif "lideri sessizce çıkar" ittifağı
   * onarılamaz hâle getirirdi: davet/at/ad/dağıt hepsi lider kapısının arkasında ve
   * kaldırılan lider kalıcı cezalı olduğu için bir daha giriş yapıp devredemez.
   */
  it('⭐ ittifak LİDERİ kaldırılınca ittifak dağıtılır ve üyeler haberdar edilir', async () => {
    const uye = await otherPlayer(`u_${randomUUID().slice(0, 6)}`);
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO alliances (world_id, name, leader_id)
      VALUES (${worldId}, ${`ld${worldId}`}, ${playerId}) RETURNING id
    `);
    const aid = Number(a!['id']);
    await h.db.execute(sql`
      UPDATE players SET alliance_id = ${aid}, alliance_role = 3 WHERE id = ${playerId}
    `);
    await h.db.execute(sql`
      UPDATE players SET alliance_id = ${aid}, alliance_role = 1 WHERE id = ${uye.playerId}
    `);

    const res = await actions.purgePlayer(
      { playerId, confirm: await usernameOf(playerId) }, admin(),
    );
    expect(res['allianceDisbanded']).toBe(true);
    expect(await h.db.execute(sql`SELECT 1 FROM alliances WHERE id = ${aid}`)).toHaveLength(0);

    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT alliance_id FROM players WHERE id = ${uye.playerId}
    `);
    expect(p!['alliance_id']).toBeNull();

    const [msg] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT subject FROM messages
       WHERE player_id = ${uye.playerId} AND kind = 'system' ORDER BY id DESC LIMIT 1
    `);
    expect(String(msg!['subject'])).toBe('İttifak dağıtıldı');
  });

  /**
   * ⚠️ Panelin formu SUNUCUDAKİ kayıttan üretiliyor (`/admin/db/tables` → `ADMIN_ACTIONS`).
   * `confirm` alanı kayıttan düşerse panel onu hiç sormaz ve yönetici tek tıkla — üstelik
   * anlamsız bir hata mesajıyla — geri alınamaz aksiyona çarpar.
   */
  it('panel kaydında onay alanı var', () => {
    const spec = ADMIN_ACTIONS.find((a) => a.id === 'purge-player');
    expect(spec, 'purge-player kayıtlı değil').toBeTruthy();
    expect(spec!.fields.map((f) => f.key)).toContain('confirm');
  });

  it('denetim kaydı yazılır', async () => {
    await actions.purgePlayer({ playerId, confirm: await usernameOf(playerId) }, admin());
    const [log] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT action, after FROM audit_log
       WHERE entity = 'player' AND entity_id = ${playerId}
         AND action = 'admin.action.purge_player'
    `);
    expect(log, 'denetim kaydı yok').toBeTruthy();
    expect(Number((log!['after'] as Record<string, unknown>)['cities'])).toBe(1);
  });
});
