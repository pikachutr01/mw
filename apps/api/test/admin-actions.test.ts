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
import { AdminActionsController } from '../src/admin/admin.actions.controller.ts';
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
  actions = new AdminActionsController(h.db, cities, clock);
  dbCtl = new AdminDbController(h.db);
  auth = new AuthService(
    h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock,
  );
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
      values: { vacation_until: new Date(Date.now() + 86_400_000).toISOString() },
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
