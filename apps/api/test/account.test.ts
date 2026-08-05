/**
 * ⭐ HESAP YÖNETİMİ (kullanıcı, 2026-08-01): silme · e-posta değiştirme · şifre değiştirme.
 *
 * Kilitlenen iddialar:
 *   • silme = **anonimleştirme + sterilizasyon**; başkent dünyada kalır, diğer şehirler yıkılır
 *   • üç engel (başkent dışı hareket · başkentten çıkmış ordu · ittifak liderliği) ayrı ayrı
 *   • başkente GELEN saldırı engel DEĞİL (kullanıcının açık kuralı)
 *   • `hükümdarN` sayacı dünya başına artar ve kayıt bu deseni REZERVE eder
 *   • e-posta serbest kalır → aynı adresle yeniden kayıt olunabilir
 *   • adres değişince doğrulama düşer, eski reset jetonu ölür, iki mail gider
 *   • şifre değişince **aktif oturum ayakta kalır**, diğerleri düşer
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountDeleteError, AccountDeleteService } from '../src/auth/account-delete.service.ts';
import { AuthError, AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { EmailError, EmailTokenService } from '../src/mail/email-token.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, freshWorldId, setupTestDb, verifyEmail } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;
let cities: CityService;
let auth: AuthService;
let emails: EmailTokenService;
let deletes: AccountDeleteService;

let accountId: number;
let playerId: number;
let capitalId: number;
let email: string;
const PW = 'parola-12345';

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  auth = new AuthService(h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock);
  emails = new EmailTokenService(h.db);
  deletes = new AccountDeleteService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  const t = randomUUID().slice(0, 8);
  email = `acc-${t}@test.local`;
  const r = await auth.register(
    { email, password: PW, username: `acc${t}`, worldId },
    { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' },
  );
  accountId = r.accountId;
  playerId = r.playerId;
  await verifyEmail(h, playerId);
  const [c] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT id FROM cities WHERE player_id = ${playerId} AND is_capital
  `);
  capitalId = Number(c!['id']);
  await h.db.execute(sql`DELETE FROM outbox`);
});

/* ── yardımcılar ─────────────────────────────────────────────────────────────── */

const revokeAll = async (id: number): Promise<string[]> => {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    UPDATE sessions SET revoked_at = now()
     WHERE account_id = ${id} AND revoked_at IS NULL RETURNING id
  `);
  return rows.map((r) => String(r['id']));
};
const run = (): Promise<{ username: string; razed: number }> =>
  deletes.execute({ accountId, playerId, worldId, revokeAll });

/**
 * Başkent dışı bir koloni ekler.
 *
 * ⚠️ **İstenen yuva DOLUYSA bir sonraki boş yuvaya kayar.** Başkenti `auth.register()`
 * yerleştiriyor ve yerleşim algoritması TOHUMLU (`hash(world_seed, player_id)`, §13.6.3) —
 * yani başkent `1:1:3` gibi bir yuvaya pekâlâ düşebilir. Sabit `s` ile kurulduğunda test,
 * başkentin nereye düştüğüne bağlı olarak `cities_world_coords` ihlaliyle ÇÖKÜYORDU: dünya
 * kimliği değişince tohum da değişiyor, yani hata dosya sırası her değiştiğinde başka bir
 * teste sıçrıyor (2026-08-05'te yeni bir test dosyası eklenince tam böyle görüldü).
 *
 * ⚠️ Hangi `s` olduğu testlerin hiçbiri için anlamlı değil — istenen tek şey "başkent
 * OLMAYAN ikinci bir şehir".
 */
async function addColony(s: number): Promise<number> {
  const at = await clock.gameNow(worldId);
  /* ⚠️ Açık `::int` şart: bağlı parametreler tipsiz gelir ve `generate_series` aşırı
   * yüklemeleri arasında seçim yapılamaz ("function generate_series(unknown, unknown) is not
   * unique"). ⚠️ Bu not SQL'in İÇİNDE değil — orada ters tırnak şablon dizesini kapatıyor
   * ve dosya derlenmiyor (`createWorld` aynı uyarıyı taşıyor; yine de aynı tuzağa düşüldü). */
  const [free] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT g.s FROM generate_series(${s}::int, ${s + 50}::int) AS g(s)
     WHERE NOT EXISTS (
       SELECT 1 FROM cities c
        WHERE c.world_id = ${worldId} AND c.k = 1 AND c.d = 1 AND c.s = g.s)
     ORDER BY g.s LIMIT 1
  `);
  const slot = Number(free!['s']);
  return cities.create({
    worldId, playerId, name: `koloni${slot}`, k: 1, d: 1, s: slot, isCapital: false, at,
  });
}
async function addMission(o: {
  origin: number | null; target: number | null; owner?: number;
}): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                          target_k, target_d, target_s, execute_at)
    VALUES (${worldId}, 'attack', 'scheduled', ${o.owner ?? playerId},
            ${o.origin}, ${o.target}, 1, 1, 9, now() + interval '1 hour')
  `);
}
async function outboxMails(): Promise<Record<string, unknown>[]> {
  return h.db.execute<Record<string, unknown>>(sql`
    SELECT payload FROM outbox WHERE topic = 'mail:send' ORDER BY id
  `);
}

/* ── SİLME: temel akış ───────────────────────────────────────────────────────── */

describe('hesap silme', () => {
  it('⭐ başkent KALIR, diğer şehirler YIKILIR, oyuncu anonimleşir', async () => {
    const colony = await addColony(3);
    const r = await run();

    expect(r.username).toBe('hükümdar1');
    expect(r.razed).toBe(1);

    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username, deleted_at, alliance_id FROM players WHERE id = ${playerId}
    `);
    expect(p!['username']).toBe('hükümdar1');
    expect(p!['deleted_at']).not.toBeNull();

    // Başkent duruyor ve adı da anonim (kullanıcı şartı: ikisi AYNI).
    const [cap] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT name FROM cities WHERE id = ${capitalId}
    `);
    expect(cap!['name']).toBe('hükümdar1');

    const gone = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM cities WHERE id = ${colony}
    `);
    expect(gone).toHaveLength(0);
  });

  it('⭐ hesap sterilize edilir: e-posta SERBEST, parola kullanılamaz, oturum yok', async () => {
    await run();

    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT email, email_verified_at, password_hash FROM accounts WHERE id = ${accountId}
    `);
    expect(String(a!['email'])).toBe(`silinmis+${accountId}@mobilwar.invalid`);
    expect(a!['email_verified_at']).toBeNull();

    // Eski parolayla giriş ARTIK ÇALIŞMIYOR (hash rastgeleye çevrildi).
    await expect(auth.login({ username: 'hükümdar1', password: PW, worldId },
      { deviceId: randomUUID(), ip: '1.1.1.1', userAgent: 't', platform: 'web' }))
      .rejects.toBeInstanceOf(AuthError);

    const sess = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM sessions WHERE account_id = ${accountId}
    `);
    expect(sess).toHaveLength(0);
  });

  it('⭐ serbest kalan e-posta ile YENİDEN kayıt olunabilir', async () => {
    await run();
    const again = await auth.register(
      { email, password: PW, username: `yeni${randomUUID().slice(0, 6)}`, worldId },
      { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' },
    );
    expect(again.playerId).toBeGreaterThan(0);
    expect(again.accountId).not.toBe(accountId);
  });

  it('sayaç DÜNYA BAŞINA artar: ikinci silme hükümdar2 olur', async () => {
    await run();
    const t = randomUUID().slice(0, 8);
    const r2 = await auth.register(
      { email: `b-${t}@test.local`, password: PW, username: `b${t}`, worldId },
      { deviceId: randomUUID(), ip: '9.9.9.9', userAgent: 'test', platform: 'web' },
    );
    await verifyEmail(h, r2.playerId);
    const out = await deletes.execute({
      accountId: r2.accountId, playerId: r2.playerId, worldId, revokeAll,
    });
    expect(out.username).toBe('hükümdar2');
  });

  /**
   * ⚠️ Kayıt kapısı olmadan: gerçek bir oyuncu "hükümdar1" alır, sonraki silme aynı adı
   * üretmek isteyip `players_world_username` tekilliğine çarpar ve **silme başarısız olur**.
   */
  it('⭐ kayıt `hükümdarN` desenini REZERVE eder', async () => {
    const t = randomUUID().slice(0, 8);
    await expect(auth.register(
      { email: `x-${t}@test.local`, password: PW, username: 'hükümdar1', worldId },
      { deviceId: randomUUID(), ip: '9.9.9.9', userAgent: 'test', platform: 'web' },
    )).rejects.toMatchObject({ code: 'username_taken' });
  });

  it('kahramanlar başkente taşınır (şehirsiz kalmazlar)', async () => {
    const colony = await addColony(4);
    await h.db.execute(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, level, status)
      VALUES (${worldId}, ${playerId}, ${colony}, 'Kahra', 3, 'alive')
    `);
    await run();
    const [hero] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT city_id FROM heroes WHERE player_id = ${playerId}
    `);
    // ⚠️ `heroes.city_id` şehre ON DELETE SET NULL bağlı — taşınmasaydı NULL olurdu.
    expect(Number(hero!['city_id'])).toBe(capitalId);
  });
});

/* ── SİLME: engeller ─────────────────────────────────────────────────────────── */

describe('silme engelleri', () => {
  it('başkent DIŞI şehirde hareket varsa engellenir', async () => {
    const colony = await addColony(5);
    await addMission({ origin: colony, target: null });
    const pre = await deletes.preview(playerId);
    expect(pre.blockers.join(' ')).toMatch(/Başkentin dışındaki/);
    await expect(run()).rejects.toBeInstanceOf(AccountDeleteError);
  });

  it('başkent DIŞI şehre GELEN hareket de engeller (şehir yıkılacak)', async () => {
    const colony = await addColony(6);
    await addMission({ origin: null, target: colony, owner: playerId });
    expect((await deletes.preview(playerId)).blockers).not.toHaveLength(0);
  });

  it('başkentten ÇIKMIŞ ordu varsa engellenir', async () => {
    await addMission({ origin: capitalId, target: null });
    const pre = await deletes.preview(playerId);
    expect(pre.blockers.join(' ')).toMatch(/Başkentinden çıkmış/);
  });

  /** ⭐ Kullanıcının açık kuralı: *"Başkenti kalacağı için buraya saldırı da olsa fark etmez."* */
  it('⭐ başkente GELEN saldırı engel DEĞİL', async () => {
    await addMission({ origin: null, target: capitalId, owner: playerId });
    const pre = await deletes.preview(playerId);
    expect(pre.blockers).toHaveLength(0);
    await expect(run()).resolves.toMatchObject({ username: 'hükümdar1' });
  });

  it('ittifak LİDERİ ise engellenir, üye ise engellenmez', async () => {
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO alliances (world_id, name, leader_id) VALUES (${worldId}, 'Kartal', ${playerId})
      RETURNING id
    `);
    await h.db.execute(sql`
      UPDATE players SET alliance_id = ${Number(a!['id'])}, alliance_role = 3 WHERE id = ${playerId}
    `);
    expect((await deletes.preview(playerId)).blockers.join(' ')).toMatch(/lideri/);

    // Üyeye indirilince engel kalkar ve silme ittifaktan sessizce çıkarır.
    await h.db.execute(sql`UPDATE players SET alliance_role = 1 WHERE id = ${playerId}`);
    expect((await deletes.preview(playerId)).blockers).toHaveLength(0);
    await run();
    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT alliance_id FROM players WHERE id = ${playerId}
    `);
    expect(p!['alliance_id']).toBeNull();
  });
});

/* ── SİLME: jeton ────────────────────────────────────────────────────────────── */

describe('silme jetonu', () => {
  it('doğrulanmamış hesap silme bağlantısı İSTEYEMEZ', async () => {
    await h.db.execute(sql`
      UPDATE accounts SET email_verified_at = NULL WHERE id = ${accountId}
    `);
    await expect(emails.requestDeletion(accountId)).rejects.toMatchObject({ code: 'not_verified' });
  });

  it('12 saatlik jeton üretilir ve önizleme onu TÜKETMEZ', async () => {
    await emails.requestDeletion(accountId);
    const [t] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT purpose, used_at,
             (expires_at > now() + interval '11 hours') AS long_enough,
             (expires_at < now() + interval '13 hours') AS not_too_long
        FROM email_tokens WHERE account_id = ${accountId} AND purpose = 'delete'
    `);
    expect(t!['long_enough']).toBe(true);
    expect(t!['not_too_long']).toBe(true);
    expect(t!['used_at']).toBeNull();
  });
});

/* ── E-POSTA ADRESİ DEĞİŞTİRME ───────────────────────────────────────────────── */

describe('e-posta adresi değiştirme', () => {
  it('⭐ adres değişir, doğrulama DÜŞER, iki mail gider', async () => {
    await h.db.execute(sql`DELETE FROM outbox`);
    const next = `yeni-${randomUUID().slice(0, 8)}@test.local`;
    await emails.changeEmail({ accountId, newEmail: next, currentPassword: PW });

    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT email, email_verified_at FROM accounts WHERE id = ${accountId}
    `);
    expect(a!['email']).toBe(next);
    expect(a!['email_verified_at']).toBeNull();

    // Biri YENİ adrese doğrulama, biri ESKİ adrese bilgilendirme.
    const mails = await outboxMails();
    const targets = mails.map((m) => String((m['payload'] as Record<string, unknown>)['to']));
    expect(targets).toContain(next);
    expect(targets).toContain(email);
  });

  it('yanlış parola reddedilir, adres DEĞİŞMEZ', async () => {
    await expect(emails.changeEmail({
      accountId, newEmail: 'x@test.local', currentPassword: 'yanlis-parola',
    })).rejects.toMatchObject({ code: 'invalid_credentials' });
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT email FROM accounts WHERE id = ${accountId}
    `);
    expect(a!['email']).toBe(email);
  });

  it('aynı adres ve başkasının adresi reddedilir', async () => {
    await expect(emails.changeEmail({ accountId, newEmail: email, currentPassword: PW }))
      .rejects.toMatchObject({ code: 'same_email' });

    const t = randomUUID().slice(0, 8);
    const other = `o-${t}@test.local`;
    await auth.register({ email: other, password: PW, username: `o${t}`, worldId },
      { deviceId: randomUUID(), ip: '2.2.2.2', userAgent: 't', platform: 'web' });
    await expect(emails.changeEmail({ accountId, newEmail: other, currentPassword: PW }))
      .rejects.toMatchObject({ code: 'email_taken' });
  });

  /**
   * ⭐ Bedava gelen davranış: `consume()` jetondaki adresi hesabın GÜNCEL adresiyle
   * karşılaştırıyor (`email_tokens.email` kasıtlı denormalize). Adres değişince eski
   * sıfırlama bağlantısı kendiliğinden ölüyor — ayrıca silmek gerekmiyor.
   */
  it('⭐ adres değişince bekleyen ŞİFRE SIFIRLAMA jetonu ÖLÜR', async () => {
    await emails.requestReset(email);
    const [tok] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT token_hash FROM email_tokens WHERE account_id = ${accountId} AND purpose = 'reset'
    `);
    expect(tok).toBeDefined();

    await emails.changeEmail({
      accountId, newEmail: `z-${randomUUID().slice(0, 8)}@test.local`, currentPassword: PW,
    });

    // Jeton satırı hâlâ duruyor ama artık tüketilemez (adres eşleşmiyor).
    const [still] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT t.id FROM email_tokens t JOIN accounts a ON a.id = t.account_id
       WHERE t.account_id = ${accountId} AND t.purpose = 'reset'
         AND t.used_at IS NULL AND t.email = a.email
    `);
    expect(still).toBeUndefined();
  });
});

/* ── ŞİFRE DEĞİŞTİRME ────────────────────────────────────────────────────────── */

describe('şifre değiştirme', () => {
  it('⭐ AKTİF oturum ayakta kalır, diğerleri düşer', async () => {
    const ctx = { deviceId: randomUUID(), ip: '3.3.3.3', userAgent: 't', platform: 'web' };
    const a = await auth.login({ username: (await username()), password: PW, worldId }, ctx);
    const b = await auth.login(
      { username: (await username()), password: PW, worldId },
      { ...ctx, deviceId: randomUUID() },
    );

    await emails.changePassword({
      accountId, current: PW, next: 'yeni-parola-9',
      revokeOthers: async (id) => (await auth.revokeOtherChains(id, b.sessionId)).length,
    });

    const [rows] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT
        (SELECT revoked_at FROM sessions WHERE id = ${a.sessionId}::uuid) AS a_revoked,
        (SELECT revoked_at FROM sessions WHERE id = ${b.sessionId}::uuid) AS b_revoked
    `);
    expect(rows!['a_revoked']).not.toBeNull();   // diğer cihaz düştü
    expect(rows!['b_revoked']).toBeNull();       // ⭐ aktif oturum AYAKTA
  });

  it('bilgilendirme e-postası gönderilir', async () => {
    await h.db.execute(sql`DELETE FROM outbox`);
    await emails.changePassword({
      accountId, current: PW, next: 'yeni-parola-9', revokeOthers: async () => 0,
    });
    const mails = await outboxMails();
    expect(mails).toHaveLength(1);
    const p = mails[0]!['payload'] as Record<string, unknown>;
    expect(String(p['to'])).toBe(email);
    expect(String(p['subject'])).toMatch(/şifren değiştirildi/i);
  });

  it('yanlış mevcut parola reddedilir', async () => {
    await expect(emails.changePassword({
      accountId, current: 'yanlis', next: 'yeni-parola-9', revokeOthers: async () => 0,
    })).rejects.toBeInstanceOf(EmailError);
  });
});

async function username(): Promise<string> {
  const [p] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT username FROM players WHERE id = ${playerId}
  `);
  return String(p!['username']);
}
