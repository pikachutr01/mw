/**
 * ⭐ HESAP YÖNETİMİ (kullanıcı, 2026-08-01): silme · e-posta değiştirme · şifre değiştirme.
 *
 * Kilitlenen iddialar:
 *   • ⭐ silme oyun dünyasına **HİÇ DOKUNMAZ** (2026-08-13): şehirler, adlar, puan, sıralamalar,
 *     ittifak rütbesi, tatil ve bekleyen başvurular aynen kalır
 *   • silinen yalnız hesap tarafı; oyuncu bir daha **giriş yapamaz**
 *   • tek engel **ittifak liderliği**; ordu hareketi ve üretim kuyruğu engel DEĞİL
 *   • `hükümdarN` deseni artık üretilmiyor ama kayıt onu REZERVE etmeye devam ediyor
 *     (canlıda eski silmelerden kalma `hükümdarN` adlı oyuncular var)
 *   • e-posta serbest kalır → aynı adresle yeniden kayıt olunabilir
 *   • adres değişince doğrulama düşer, eski reset jetonu ölür, iki mail gider
 *   • şifre değişince **aktif oturum ayakta kalır**, diğerleri düşer
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AllianceService } from '../src/alliance/alliance.service.ts';
import { AccountDeleteError, AccountDeleteService } from '../src/auth/account-delete.service.ts';
import { AuthError, AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { EmailError, EmailTokenService } from '../src/mail/email-token.service.ts';
import { MissionService } from '../src/missions/mission.service.ts';
import { takeSnapshot } from '../src/ranking/ranking.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb, verifyEmail } from './helpers/db.ts';

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
/** ⚠️ Başkentin adını `auth.register()` üretiyor (tohumlu); testte SABİT yazılamaz. */
let CAPITAL_NAME: string;
let email: string;
const PW = 'parola-12345';

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  auth = new AuthService(h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock, cities);
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
    SELECT id, name FROM cities WHERE player_id = ${playerId} AND is_capital
  `);
  capitalId = Number(c!['id']);
  CAPITAL_NAME = String(c!['name']);
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
const run = (): Promise<void> =>
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
  origin: number | null; target: number | null; owner?: number; type?: string;
}): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                          target_k, target_d, target_s, execute_at)
    VALUES (${worldId}, ${o.type ?? 'attack'}, 'scheduled', ${o.owner ?? playerId},
            ${o.origin}, ${o.target}, 1, 1, 9, now() + interval '1 hour')
  `);
}
/** Bir oyuncunun canlı puanını kurar — sıralama anlık görüntüsü bunu donduruyor. */
async function setScore(pid: number, score: number): Promise<void> {
  await h.db.execute(sql`UPDATE players SET score = ${score} WHERE id = ${pid}`);
}
async function outboxMails(): Promise<Record<string, unknown>[]> {
  return h.db.execute<Record<string, unknown>>(sql`
    SELECT payload FROM outbox WHERE topic = 'mail:send' ORDER BY id
  `);
}

/* ── SİLME: temel akış ───────────────────────────────────────────────────────── */

describe('hesap silme — dünyada iz bırakmaz', () => {
  /**
   * ⭐⭐⭐ **YENİ SÖZLEŞMENİN TAMAMI TEK TESTTE** (kullanıcı, 2026-08-13): *"Şehirler aynen
   * kalsın, isimleri de kullanıcı adı da değişmesin… Diğer oyuncular bu hesabın silindiğini
   * anlayamasın."*
   *
   * ⚠️ Bu testin eski hâli tam TERSİNİ kilitliyordu (`razed === 1`, `username === 'hükümdar1'`).
   */
  it('⭐⭐ TÜM şehirler adlarıyla durur, oyuncu adı DEĞİŞMEZ', async () => {
    const colony = await addColony(3);
    const [before] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT name FROM cities WHERE id = ${colony}
    `);
    const [me] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username FROM players WHERE id = ${playerId}
    `);

    await run();

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id, name FROM cities WHERE player_id = ${playerId} ORDER BY id
    `);
    expect(rows, 'hiçbir şehir yıkılmamalı').toHaveLength(2);
    const byId = new Map(rows.map((r) => [Number(r['id']), String(r['name'])]));
    expect(byId.get(capitalId)).toBe(CAPITAL_NAME);
    expect(byId.get(colony)).toBe(String(before!['name']));

    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username, deleted_at FROM players WHERE id = ${playerId}
    `);
    expect(p!['username'], 'oyuncu adı DEĞİŞMEMELİ').toBe(String(me!['username']));
    // ⚠️ `deleted_at` yine yazılıyor — ama artık yalnız İÇ işaret (giriş kapısı + denetim).
    expect(p!['deleted_at']).not.toBeNull();
  });

  /** ⚠️ Şehrin içi de duruyor: yapı/birim/kuyruk `cities.id`ye CASCADE bağlı, şehir gidince giderdi. */
  it('şehrin İÇİ de durur: yapılar, birlikler, kuyruk', async () => {
    const colony = await addColony(7);
    await h.db.execute(sql`
      INSERT INTO buildings (city_id, type, level) VALUES (${colony}, 'barracks', 3)
      ON CONFLICT (city_id, type) DO UPDATE SET level = 3
    `);
    await h.db.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${colony}, 'swordsman', 40)
      ON CONFLICT (city_id, type) DO UPDATE SET count = 40
    `);

    await run();

    const [b] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT level FROM buildings WHERE city_id = ${colony} AND type = 'barracks'
    `);
    const [u] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT count FROM units WHERE city_id = ${colony} AND type = 'swordsman'
    `);
    expect(Number(b!['level'])).toBe(3);
    expect(Number(u!['count'])).toBe(40);
  });

  /**
   * ⭐ SIRALAMA MUAFİYETİ ARTIK YAZILMIYOR (kullanıcı: *"puan sıralamalarından da ittifak puanı
   * sıralamalarından da çıkarılmasın"*). Ölçü canlı bayrak DEĞİL, anlık görüntünün kendisi:
   * bayrağı doğru bırakıp süzgeci yanlış yazmak da mümkündü.
   */
  it('⭐ oyuncu sıralamasında KALIR ve puanı ittifak toplamına yazılır', async () => {
    const other = await createPlayer(h, worldId, 'ortak');
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO alliances (world_id, name, leader_id) VALUES (${worldId}, 'Kartal', ${other})
      RETURNING id
    `);
    const allianceId = Number(a!['id']);
    await h.db.execute(sql`
      UPDATE players SET alliance_id = ${allianceId}, alliance_role = 3 WHERE id = ${other}
    `);
    await h.db.execute(sql`
      UPDATE players SET alliance_id = ${allianceId}, alliance_role = 1 WHERE id = ${playerId}
    `);
    await setScore(playerId, 500);
    await setScore(other, 300);

    await run();

    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT ranking_excluded, alliance_score_excluded FROM players WHERE id = ${playerId}
    `);
    expect(p!['ranking_excluded']).toBe(false);
    expect(p!['alliance_score_excluded']).toBe(false);

    await takeSnapshot(h.db as never, worldId, await clock.gameNow(worldId));

    const [mine] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT score FROM rankings
       WHERE world_id = ${worldId} AND kind = 'player' AND subject_id = ${playerId}
    `);
    expect(Number(mine?.['score']), 'oyuncu sıralamasında durmalı').toBe(500);

    const [team] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT score FROM rankings
       WHERE world_id = ${worldId} AND kind = 'alliance' AND subject_id = ${allianceId}
    `);
    expect(Number(team?.['score']), 'puanı takım toplamına yazılmalı').toBe(800);
  });

  /**
   * ⭐ KAHRAMAN SIRALAMASI — 2026-08-13'e kadar `p.deleted_at IS NULL` süzgeci vardı ve silinmiş
   * hesabın kahramanını listeden düşürüyordu. Oyuncu/ittifak sekmelerinden hiç düşmeyen bir
   * hesabın yalnız kahraman sekmesinden kaybolması, silinmişliği tek başına ele verirdi.
   */
  it('⭐ kahraman sıralamada KALIR', async () => {
    const [hero] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, level, status)
      VALUES (${worldId}, ${playerId}, ${capitalId}, 'Kahra', 5, 'alive')
      RETURNING id
    `);

    await run();
    await takeSnapshot(h.db as never, worldId, await clock.gameNow(worldId));

    const [r] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT rank FROM rankings
       WHERE world_id = ${worldId} AND kind = 'hero' AND subject_id = ${Number(hero!['id'])}
    `);
    expect(r, 'kahraman listede kalmalı').toBeTruthy();
  });

  /**
   * ⭐⭐⭐ **ASIL GEREKÇE: ŞEHİR YAĞMALANABİLİR KALMALI** (kullanıcı: *"diğer oyuncuların yağma
   * yapabileceği potansiyel şehirleri yok etmiş oluyoruz"*).
   *
   * ⚠️⚠️ Eski tasarımda hayatta bırakılan başkent bile pratikte DOKUNULMAZDI: 10 kat kuralı
   * puanı sıralama satırından okuyor ve satırı olmayanı 0 (kelepçeyle 1) sayıyor, sıralama
   * muafiyeti de satırı düşürüyordu → 10+ puanlı hiç kimse saldıramıyordu. Bu test tam olarak
   * o kilidin açıldığını ölçüyor; muafiyet geri konursa kırmızıya döner.
   */
  it('⭐⭐⭐ 10 kat kuralı silinmiş hesabı ARTIK korumuyor', async () => {
    const attacker = await createPlayer(h, worldId, 'saldiran');
    await setScore(playerId, 500);
    await setScore(attacker, 1000);

    await run();
    await takeSnapshot(h.db as never, worldId, await clock.gameNow(worldId));

    const missions = new MissionService(h.db, cities);
    const gap = await missions.scoreGap(worldId, attacker, playerId);
    expect(gap?.defenderScore, 'savunanın puanı sıralamadan okunabilmeli').toBe(500);
    expect(gap?.blocked, 'silinmiş hesaba saldırı engellenmemeli').toBe(false);
  });

  it('⭐ hesap sterilize edilir: e-posta SERBEST, parola kullanılamaz, oturum yok', async () => {
    const [me] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username FROM players WHERE id = ${playerId}
    `);
    await run();

    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT email, email_verified_at, password_hash FROM accounts WHERE id = ${accountId}
    `);
    expect(String(a!['email'])).toBe(`silinmis+${accountId}@mobilwar.invalid`);
    expect(a!['email_verified_at']).toBeNull();

    // Eski parolayla giriş ARTIK ÇALIŞMIYOR (hash rastgeleye çevrildi + `deleted_at` kapısı).
    await expect(auth.login({ username: String(me!['username']), password: PW, worldId },
      { deviceId: randomUUID(), ip: '1.1.1.1', userAgent: 't', platform: 'web' }))
      .rejects.toBeInstanceOf(AuthError);

    const sess = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM sessions WHERE account_id = ${accountId}
    `);
    expect(sess).toHaveLength(0);
  });

  /**
   * ⭐⭐ GİRİŞ KAPISI — ad artık anonimleşmediği için silinmiş bir hesabın adı giriş formunda
   * hâlâ aranabiliyor.
   *
   * ⚠️ Hata **sıradan kimlik hatasıyla birebir aynı** olmalı: ayrı bir kod/mesaj, ucu *"bu ad
   * silinmiş bir hesaba mı ait"* sorusunu cevaplayan bir araca çevirir ve silmenin ana şartını
   * (kimse anlamasın) doğrudan çiğnerdi. Bu yüzden test **kodu** ölçüyor, yalnız reddi değil.
   */
  it('⭐⭐ silinmiş hesap giriş yapamaz ve hata SIRADAN kimlik hatası', async () => {
    const [me] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username FROM players WHERE id = ${playerId}
    `);
    const username = String(me!['username']);
    // ⚠️ Parolayı bilerek DOĞRU veriyoruz: yalnız `deleted_at` kapısı reddedebilir.
    await h.db.execute(sql`UPDATE players SET deleted_at = now() WHERE id = ${playerId}`);

    await expect(auth.login({ username, password: PW, worldId },
      { deviceId: randomUUID(), ip: '1.1.1.1', userAgent: 't', platform: 'web' }))
      .rejects.toMatchObject({ code: 'invalid_credentials' });
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

  /**
   * ⚠️ Eski kullanıcı adı SERBEST KALMIYOR — silme artık adı bırakmıyor. Aynı e-postayla dönen
   * oyuncu yeni bir ad seçmek zorunda; arayüz ve silme e-postası bunu açıkça söylüyor.
   */
  it('⚠️ eski oyuncu adı ALINAMAZ (dünyada duruyor)', async () => {
    const [me] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username FROM players WHERE id = ${playerId}
    `);
    await run();
    await expect(auth.register(
      { email: `x-${randomUUID().slice(0, 8)}@test.local`, password: PW,
        username: String(me!['username']), worldId },
      { deviceId: randomUUID(), ip: '9.9.9.9', userAgent: 'test', platform: 'web' },
    )).rejects.toMatchObject({ code: 'username_taken' });
  });

  /**
   * ⚠️ `hükümdarN` ARTIK ÜRETİLMİYOR ama rezervasyon DURUYOR: canlıda eski silmelerden kalma
   * `hükümdar1`, `hükümdar2`… adlı oyuncular var. Rezervasyon kalksaydı yeni bir oyuncu o adı
   * alıp geçmiş kayıtlardaki kimliği bulanıklaştırabilirdi.
   */
  it('kayıt `hükümdarN` desenini REZERVE etmeye devam eder', async () => {
    const t = randomUUID().slice(0, 8);
    await expect(auth.register(
      { email: `x-${t}@test.local`, password: PW, username: 'hükümdar1', worldId },
      { deviceId: randomUUID(), ip: '9.9.9.9', userAgent: 'test', platform: 'web' },
    )).rejects.toMatchObject({ code: 'username_taken' });
  });

  it('denetim kaydı yazılır (silinmişliğin tek izi)', async () => {
    await run();
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT action FROM audit_log WHERE player_id = ${playerId} AND action = 'account.deleted'
    `);
    expect(row).toBeTruthy();
  });
});

/* ── SİLME: dokunulmayanlar ──────────────────────────────────────────────────── */

describe('silme neye DOKUNMUYOR', () => {
  /**
   * ⚠️ 2026-08-13'e kadar konsey ASKER'e indiriliyordu. Gerekçe makuldü (hayalet üstünde yetki
   * bırakmamak) ama rütbe düşüşü ittifak panelinde HERKESE görünüyor — yani silinmişliği ele
   * veren bir iz. Kullanıcı bu izin kalkmasını seçti; yetki, giriş yapamayan bir hesapta zaten
   * kullanılamıyor.
   */
  it('⭐ KONSEY rütbesi aynen kalır', async () => {
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO alliances (world_id, name, leader_id) VALUES (${worldId}, 'Şahin', ${playerId})
      RETURNING id
    `);
    await h.db.execute(sql`
      UPDATE players SET alliance_id = ${Number(a!['id'])}, alliance_role = 2 WHERE id = ${playerId}
    `);
    await run();

    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT alliance_id, alliance_role FROM players WHERE id = ${playerId}
    `);
    expect(Number(p!['alliance_id'])).toBe(Number(a!['id']));
    expect(Number(p!['alliance_role']), 'rütbe düşürülmemeli').toBe(2);
  });

  /**
   * ⭐ TATİL MODU BİTİRİLMİYOR (2026-08-13). Rozetin aniden düşmesi dışarıdan görülen bir olay.
   * ⚠️ Kalıcı dokunulmazlık riski yok: tatile girişte `vacation_end` görevi zaten zamanlanıyor
   * (`vacation.service.ts`), yani tatil en geç süresi dolunca kendiliğinden bitiyor.
   */
  it('⭐ tatil modu SÜRER', async () => {
    const [m] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO missions (world_id, type, status, execute_at, owner_player_id)
      VALUES (${worldId}, 'vacation_end', 'scheduled', now() + interval '10 days', ${playerId})
      RETURNING id
    `);
    await h.db.execute(sql`
      UPDATE players
         SET vacation_since = now(), vacation_until = now() + interval '10 days',
             vacation_mission_id = ${Number(m!['id'])}
       WHERE id = ${playerId}
    `);

    await run();

    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT vacation_until, vacation_since FROM players WHERE id = ${playerId}
    `);
    expect(p!['vacation_until'], 'tatil sürmeliydi').not.toBeNull();
    expect(p!['vacation_since']).not.toBeNull();
  });

  /**
   * ⭐ BEKLEYEN BAŞVURU/DAVETLER İPTAL EDİLMİYOR (2026-08-13). İptal, karşı tarafın kutusundan
   * bir satırın kaybolması demekti — görülebilir bir iz. Başvuru kabul edilirse hesap ittifağa
   * girer; hiç oynamayan bir üyeden ayırt edilemez, istenen de bu.
   */
  it('⭐ bekleyen başvuru PENDING kalır ve mesajı durur', async () => {
    const other = await createPlayer(h, worldId, 'lider');
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO alliances (world_id, name, leader_id) VALUES (${worldId}, 'Kartal', ${other})
      RETURNING id
    `);
    await h.db.execute(sql`
      UPDATE players SET alliance_id = ${Number(a!['id'])}, alliance_role = 3 WHERE id = ${other}
    `);

    const alliances = new AllianceService(h.db);
    await alliances.apply({ worldId, playerId, allianceId: Number(a!['id']) });

    await run();

    const [inv] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT status FROM alliance_invites WHERE player_id = ${playerId}
    `);
    expect(inv!['status']).toBe('pending');
    const [box] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT count(*)::int AS n FROM messages
       WHERE player_id = ${other} AND kind = 'alliance_application'
    `);
    expect(Number(box!['n']), 'liderin kutusundaki başvuru durmalı').toBe(1);
  });

  /** ⚠️ Kahraman taşınmıyor: taşınacak bir yıkım yok, şehir olduğu yerde duruyor. */
  it('kahraman bulunduğu şehirde kalır', async () => {
    const colony = await addColony(4);
    await h.db.execute(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, level, status)
      VALUES (${worldId}, ${playerId}, ${colony}, 'Kahra', 3, 'alive')
    `);
    await run();
    const [hero] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT city_id FROM heroes WHERE player_id = ${playerId}
    `);
    expect(Number(hero!['city_id'])).toBe(colony);
  });
});

/* ── SİLME: engeller ─────────────────────────────────────────────────────────── */

describe('silme engelleri', () => {
  it('ittifak LİDERİ ise engellenir, üye ise engellenmez', async () => {
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO alliances (world_id, name, leader_id) VALUES (${worldId}, 'Kartal', ${playerId})
      RETURNING id
    `);
    await h.db.execute(sql`
      UPDATE players SET alliance_id = ${Number(a!['id'])}, alliance_role = 3 WHERE id = ${playerId}
    `);
    expect((await deletes.preview(playerId)).blockers.join(' ')).toMatch(/lideri/);
    await expect(run()).rejects.toBeInstanceOf(AccountDeleteError);

    await h.db.execute(sql`UPDATE players SET alliance_role = 1 WHERE id = ${playerId}`);
    expect((await deletes.preview(playerId)).blockers).toHaveLength(0);
    await run();
    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT alliance_id FROM players WHERE id = ${playerId}
    `);
    // ⚠️ `alliance_id` bigint → postgres.js DİZE döndürüyor; sayıya çevirmeden kıyaslanmaz.
    expect(Number(p!['alliance_id']), 'üyelik korunmalı').toBe(Number(a!['id']));
  });

  /**
   * ⭐ ORDU HAREKETİ ARTIK ENGEL DEĞİL — dayanağı olan şehir yıkımı kalktı. Yoldaki ordu
   * görevini tamamlar; dışarıdan görüntüsü, oyuna girmeyi bırakmış bir oyuncunun ordusudur.
   */
  it('⭐ yoldaki ordu (başkentten çıkmış ya da koloniye değen) engel DEĞİL', async () => {
    const colony = await addColony(5);
    await addMission({ origin: capitalId, target: null });
    await addMission({ origin: null, target: colony, owner: playerId });

    expect((await deletes.preview(playerId)).blockers).toHaveLength(0);
    await expect(run()).resolves.toBeUndefined();
  });

  /**
   * ⭐⭐⭐ **ÜRETİM KUYRUĞU ENGEL DEĞİL — 2026-08-13'te düzeltilen canlı kusur.**
   *
   * Eski engel sorgusu görev TÜRÜNE bakmıyordu; kuyruk bitişleri de `missions` satırı ve
   * `origin_city_id = target_city_id = şehir` taşıyor (`queues/queue.service.ts`). Sonuç:
   * başkentinde bina yükselten oyuncuya **"Başkentinden çıkmış bir ordun var"** deniyor ve
   * hesabını silemiyordu — ortada ordu yokken, üstelik başkent zaten yıkılmazken. Uzun bir
   * yükseltme 12 saatlik silme bağlantısını rahatça geçebiliyordu.
   */
  it('⭐⭐⭐ başkentte süren üretim kuyruğu silmeyi ENGELLEMEZ', async () => {
    await addMission({ origin: capitalId, target: capitalId, type: 'building_finish' });

    expect((await deletes.preview(playerId)).blockers).toHaveLength(0);
    await expect(run()).resolves.toBeUndefined();
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

/* ── SİLME: OTURUMSUZ istek (kullanıcı, 2026-08-12) ──────────────────────────── */

/**
 * ⭐⭐ `/hesap-sil` sayfası artık yalnız e-posta adresiyle silme bağlantısı isteyebiliyor.
 *
 * ⚠️ Bu akışın `requestDeletion`dan **tek ama belirleyici** farkı sessizliği: oturumlu çağrı
 * hata fırlatabilir (arayan kim olduğunu kanıtlamıştır), oturumsuz çağrı **asla** fırlatmaz.
 * Aksi hâlde uç, "bu e-posta bu oyunda kayıtlı mı" sorusunu cevaplayan bir sorgulama aracına
 * dönerdi — üstelik silme bağlamında, yani hedefli oltalama için biçilmiş kaftan.
 *
 * Testlerin çoğu bu yüzden **iki şeyi birden** ölçüyor: hata fırlatmadığını VE gerçekten bir
 * şey yapmadığını. Yalnız birincisine bakan bir test, sessizce her adrese mail yollayan bir
 * hatayı yeşil geçerdi.
 */
describe('⭐⭐ oturumsuz silme isteği (e-posta ile)', () => {
  /**
   * ⚠️ **Hesaba göre daraltılmış.** `email_tokens` `beforeEach`te temizlenmiyor (yalnız
   * `outbox` temizleniyor) → tablo genelinde saymak, önceki `describe`ların bıraktığı
   * jetonları da toplayıp sayıyı her testte bir artırıyordu.
   */
  const tokenCount = async (): Promise<number> => {
    const [r] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM email_tokens
       WHERE purpose = 'delete' AND account_id = ${accountId}
    `);
    return Number(r!['n']);
  };
  /** ⚠️ Alıcıya göre daraltılmış — `outbox` da bu worker'ın diğer test dosyalarıyla ortak. */
  const mailCount = async (): Promise<number> => {
    const [r] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM outbox
       WHERE topic = 'mail:send' AND payload->>'to' = ${email}
    `);
    return Number(r!['n']);
  };

  /**
   * ⚠️⚠️ **HER TESTE TAZE IP.** `assertQuota` IP başına günde 30 jeton sayıyor ve `email_tokens`
   * bu worker'ın TÜM test dosyalarıyla ortak (worker başına veritabanı — bkz. `helpers/db.ts`).
   * Sabit bir IP yazıldığında testler tek başına yeşil, tam koşuda kırmızı oluyordu: komşu
   * dosyaların aynı IP'yle yazdığı satırlar tavanı doldurup isteği **sessizce** düşürüyordu —
   * yani ucun doğru davranışı, testi yanlış yere düşürüyordu.
   */
  let ipSeq = 0;
  const freshIp = (): string => `203.0.113.${(ipSeq += 1)}`;

  it('⭐ doğrulanmış adres bağlantı alır — hem jeton hem mail satırı yazılır', async () => {
    await emails.requestDeletionByEmail(email, freshIp());
    expect(await tokenCount()).toBe(1);
    expect(await mailCount()).toBe(1);
  });

  /**
   * ⭐⭐⭐ ASIL DEĞİŞMEZ: üretilen jeton, oyun içi düğmeninkiyle **aynı sınıftan**. Yalnız
   * "bir satır yazıldı" demek yetmez — bağlantının gerçekten silme akışını açtığını görmeliyiz.
   */
  it('⭐⭐⭐ gelen bağlantı GERÇEKTEN çalışıyor (önizleme onu kabul ediyor)', async () => {
    await emails.requestDeletionByEmail(email, freshIp());
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT payload FROM outbox WHERE topic = 'mail:send' ORDER BY id DESC LIMIT 1
    `);
    const text = String((row!['payload'] as Record<string, unknown>)['text']);
    // Bağlantı `/hesap-sil` sayfasına gitmeli — sıfırlama sayfasına değil.
    expect(text).toMatch(/\/hesap-sil\?token=/);
    const token = /token=([A-Za-z0-9_-]+)/.exec(text)![1]!;
    await expect(emails.peekDeletion(token)).resolves.toMatchObject({ accountId });
  });

  it('kayıtlı olmayan adres: hata YOK, jeton da YOK', async () => {
    await expect(emails.requestDeletionByEmail('yok-boyle-biri@test.local')).resolves
      .toBeUndefined();
    expect(await tokenCount()).toBe(0);
    expect(await mailCount()).toBe(0);
  });

  /**
   * ⭐ Oturumlu akışla KARŞITLIK burada görünüyor: aynı hesap durumu, iki farklı davranış.
   * Kural aynı (doğrulanmamış adrese silme yetkisi gitmez), yalnız haber verme biçimi farklı.
   */
  it('⭐ doğrulanmamış hesap: SESSİZCE durulur (oturumlu akış ise hata fırlatır)', async () => {
    await h.db.execute(sql`UPDATE accounts SET email_verified_at = NULL WHERE id = ${accountId}`);

    await expect(emails.requestDeletionByEmail(email)).resolves.toBeUndefined();
    expect(await tokenCount()).toBe(0);

    // Aynı hesap, oturumlu yol → açık hata. İki yolun ayrıştığı tek nokta bu.
    await expect(emails.requestDeletion(accountId)).rejects.toMatchObject({ code: 'not_verified' });
  });

  /** Kota bilgisi de sızmaz: ikinci istek cooldown'a takılır ama çağıran bunu ANLAYAMAZ. */
  it('cooldown\'a takılan ikinci istek de sessiz — ikinci mail çıkmaz', async () => {
    await emails.requestDeletionByEmail(email, freshIp());
    await expect(emails.requestDeletionByEmail(email, freshIp())).resolves.toBeUndefined();
    expect(await tokenCount(), 'ikinci jeton üretilmemeli').toBe(1);
    expect(await mailCount()).toBe(1);
  });

  it('adres büyük harfli/boşluklu yazılsa da bulunur', async () => {
    await emails.requestDeletionByEmail(`  ${email.toUpperCase()}  `);
    expect(await tokenCount()).toBe(1);
  });

  /**
   * ⚠️ Cooldown **amaç başına** sayılıyor. Bu uç eklendikten sonra da öyle kalmalı: az önce
   * doğrulama maili almış oyuncunun silme isteği sessizce yutulursa, oyuncu hiçbir açıklama
   * göremediği için sayfayı bozuk sanır.
   */
  it('⚠️ başka amaçtaki taze mail silme isteğini ENGELLEMEZ', async () => {
    // Az önce gidilmiş bir DOĞRULAMA maili taklidi (cooldown penceresinin içinde).
    await h.db.execute(sql`
      INSERT INTO email_tokens (account_id, purpose, token_hash, email, expires_at)
      VALUES (${accountId}, 'verify', ${`h-${randomUUID()}`}, ${email}, now() + interval '1 day')
    `);
    await emails.requestDeletionByEmail(email);
    expect(await tokenCount()).toBe(1);
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
    const ctx = { deviceId: randomUUID(), ip: '3.3.3.3', userAgent: 't', platform: 'web' as const };
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
