/**
 * ⭐ İTTİFAK SİSTEMİ (§13.15b) — kurma şartı, yetki matrisi, davet/başvuru durum makinesi,
 * lider ayrılma kuralı ve ittifak sıralaması snapshot'ı.
 *
 * Yetki matrisi kullanıcı kararlarıyla (2026-07-30): Konsey davet + kabul + yalnız Asker'i
 * atabilir; Lider her şeyi; lider ancak tek üyeyken ayrılabilir (o zaman ittifak dağılır).
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AllianceService, ROLE } from '../src/alliance/alliance.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { takeSnapshot } from '../src/ranking/ranking.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let service: AllianceService;

let lider: number;
let konsey: number;
let asker: number;
let disaridan: number;

beforeAll(async () => {
  h = await setupTestDb();
  service = new AllianceService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

async function giveCastle(playerId: number, level: number): Promise<void> {
  const [c] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT id FROM cities WHERE player_id = ${playerId} LIMIT 1
  `);
  await h.db.execute(sql`
    INSERT INTO buildings (city_id, type, level) VALUES (${c!['id']}, 'castle', ${level})
    ON CONFLICT (city_id, type) DO UPDATE SET level = ${level}
  `);
}

async function makeCity(playerId: number, s: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital)
    VALUES (${worldId}, ${playerId}, ${'sehir-' + playerId}, 1, 1, ${s}, true)
  `);
}

async function roleOf(playerId: number): Promise<{ allianceId: number | null; role: number }> {
  return service.myMembership(playerId);
}

async function messagesOf(playerId: number): Promise<Record<string, unknown>[]> {
  return h.db.execute<Record<string, unknown>>(sql`
    SELECT kind, subject, body FROM messages WHERE player_id = ${playerId} ORDER BY id
  `);
}

/** Standart kurulum: lider bir ittifak kurar, konsey + asker üyeliğe alınır. */
async function foundedAlliance(): Promise<number> {
  await giveCastle(lider, 5);
  const a = await service.found({ worldId, playerId: lider, name: 'run.dll' });
  for (const [pid, role] of [[konsey, ROLE.COUNCIL], [asker, ROLE.MEMBER]] as const) {
    await h.db.execute(sql`
      UPDATE players SET alliance_id = ${a.id}, alliance_role = ${role} WHERE id = ${pid}
    `);
  }
  return a.id;
}

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  lider = await createPlayer(h, worldId, 'lider');
  konsey = await createPlayer(h, worldId, 'konsey');
  asker = await createPlayer(h, worldId, 'asker');
  disaridan = await createPlayer(h, worldId, 'disaridan');
  let s = 1;
  for (const p of [lider, konsey, asker, disaridan]) await makeCity(p, s++);
});

describe('kurma', () => {
  it('⭐ Kale şartı: 4 reddedilir, 5 kurar; kuran LİDER olur', async () => {
    await giveCastle(lider, 4);
    await expect(service.found({ worldId, playerId: lider, name: 'deneme' }))
      .rejects.toMatchObject({ code: 'castle_required' });

    await giveCastle(lider, 5);
    const a = await service.found({ worldId, playerId: lider, name: 'deneme' });
    expect(a.id).toBeGreaterThan(0);
    const me = await roleOf(lider);
    expect(me.role).toBe(ROLE.LEADER);
    expect(me.allianceId).toBe(a.id);
  });

  it('ad kuralları: 3-10 karakter, dünya içinde büyük/küçük duyarsız benzersiz', async () => {
    await giveCastle(lider, 5);
    await expect(service.found({ worldId, playerId: lider, name: 'ab' }))
      .rejects.toMatchObject({ code: 'bad_name' });
    await expect(service.found({ worldId, playerId: lider, name: 'onbirkarakt' }))
      .rejects.toMatchObject({ code: 'bad_name' });

    await service.found({ worldId, playerId: lider, name: 'RUN.dll' });
    await giveCastle(disaridan, 5);
    await expect(service.found({ worldId, playerId: disaridan, name: 'run.DLL' }))
      .rejects.toMatchObject({ code: 'name_taken' });
  });

  it('zaten üyeyken ikinci ittifak kurulamaz', async () => {
    await foundedAlliance();
    await expect(service.found({ worldId, playerId: lider, name: 'ikinci' }))
      .rejects.toMatchObject({ code: 'already_member' });
  });
});

describe('davet → kabul', () => {
  it('⭐ Konsey davet gönderir, oyuncu kabul edince ASKER olarak katılır; mesaj kutusuna düşer', async () => {
    const aid = await foundedAlliance();
    const inviteId = await service.invite({ worldId, playerId: konsey, targetId: disaridan });

    // Davet mesaj kutusunda (doküman: davetler mesajlarda görünür).
    const kutu = await messagesOf(disaridan);
    const davet = kutu.find((m) => m['kind'] === 'alliance_invite');
    expect(davet).toBeDefined();
    expect((davet!['body'] as Record<string, unknown>)['inviteId']).toBe(inviteId);
    expect((davet!['body'] as Record<string, unknown>)['allianceName']).toBe('run.dll');

    await service.decide({ worldId, playerId: disaridan, inviteId, accept: true });
    const me = await roleOf(disaridan);
    expect(me.allianceId).toBe(aid);
    expect(me.role).toBe(ROLE.MEMBER);
  });

  it('Asker davet GÖNDEREMEZ; ittifakı olana davet gönderilemez; çifte pending engellenir', async () => {
    await foundedAlliance();
    await expect(service.invite({ worldId, playerId: asker, targetId: disaridan }))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(service.invite({ worldId, playerId: lider, targetId: konsey }))
      .rejects.toMatchObject({ code: 'target_has_alliance' });

    await service.invite({ worldId, playerId: lider, targetId: disaridan });
    await expect(service.invite({ worldId, playerId: konsey, targetId: disaridan }))
      .rejects.toMatchObject({ code: 'already_pending' });
  });

  it('başkasının daveti kabul edilemez; red üyelik yaratmaz', async () => {
    await foundedAlliance();
    const inviteId = await service.invite({ worldId, playerId: lider, targetId: disaridan });
    await expect(service.decide({ worldId, playerId: asker, inviteId, accept: true }))
      .rejects.toMatchObject({ code: 'forbidden' });

    await service.decide({ worldId, playerId: disaridan, inviteId, accept: false });
    expect((await roleOf(disaridan)).allianceId).toBeNull();
    // Sonuçlanmış istek ikinci kez işlenemez.
    await expect(service.decide({ worldId, playerId: disaridan, inviteId, accept: true }))
      .rejects.toMatchObject({ code: 'not_pending' });
  });
});

describe('başvuru → yönetim kabulü', () => {
  it('⭐ başvuru lider + TÜM konseyin kutusuna düşer; konsey kabul edebilir; başvurana sonuç mesajı gider', async () => {
    const aid = await foundedAlliance();
    const appId = await service.apply({ worldId, playerId: disaridan, allianceId: aid });

    for (const yonetici of [lider, konsey]) {
      const kutu = await messagesOf(yonetici);
      expect(kutu.some((m) => m['kind'] === 'alliance_application')).toBe(true);
    }
    expect((await messagesOf(asker)).some((m) => m['kind'] === 'alliance_application')).toBe(false);

    await service.decide({ worldId, playerId: konsey, inviteId: appId, accept: true });
    expect((await roleOf(disaridan)).allianceId).toBe(aid);
    expect((await messagesOf(disaridan)).some((m) => String(m['subject']).includes('kabul edildi'))).toBe(true);
  });

  it('Asker başvuru SONUÇLANDIRAMAZ; kabul yarışı: bu arada başka ittifağa girmişse iptal', async () => {
    const aid = await foundedAlliance();
    const appId = await service.apply({ worldId, playerId: disaridan, allianceId: aid });
    await expect(service.decide({ worldId, playerId: asker, inviteId: appId, accept: true }))
      .rejects.toMatchObject({ code: 'forbidden' });

    // Oyuncu bu arada başka bir ittifağa girdi.
    await giveCastle(disaridan, 5);
    await service.found({ worldId, playerId: disaridan, name: 'baska' });
    await expect(service.decide({ worldId, playerId: lider, inviteId: appId, accept: true }))
      .rejects.toMatchObject({ code: 'target_has_alliance' });
  });

  it('kabulde oyuncunun DİĞER bekleyen istekleri iptal olur', async () => {
    const aid = await foundedAlliance();
    // İkinci bir ittifak daha kurulsun, oraya da başvursun.
    await giveCastle(konsey, 5);   // konsey zaten üye — başka oyuncu lazım
    const digerLider = disaridan;
    await giveCastle(digerLider, 5);
    const b = await service.found({ worldId, playerId: digerLider, name: 'ikinci' });

    const yeni = await createPlayer(h, worldId, 'yeni');
    await makeCity(yeni, 9);
    const app1 = await service.apply({ worldId, playerId: yeni, allianceId: aid });
    const app2 = await service.apply({ worldId, playerId: yeni, allianceId: b.id });

    await service.decide({ worldId, playerId: lider, inviteId: app1, accept: true });
    const [ikinci] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT status FROM alliance_invites WHERE id = ${app2}
    `);
    expect(ikinci!['status']).toBe('canceled');
  });
});

describe('yetki matrisi: at / konsey / devir', () => {
  it('⭐ Konsey yalnız ASKERİ atabilir; Lider konseyi de atabilir; kimse lideri atamaz', async () => {
    await foundedAlliance();

    // Konsey konseyi/lideri atamaz.
    await expect(service.kick({ worldId, playerId: konsey, targetId: lider }))
      .rejects.toMatchObject({ code: 'hierarchy' });
    // Asker kimseyi atamaz.
    await expect(service.kick({ worldId, playerId: asker, targetId: konsey }))
      .rejects.toMatchObject({ code: 'forbidden' });

    // Konsey askeri atar → asker ittifaksız kalır ve haber mesajı alır.
    await service.kick({ worldId, playerId: konsey, targetId: asker });
    expect((await roleOf(asker)).allianceId).toBeNull();
    expect((await messagesOf(asker)).some((m) => String(m['subject']).includes('çıkarıldın'))).toBe(true);

    // Lider konseyi atar.
    await service.kick({ worldId, playerId: lider, targetId: konsey });
    expect((await roleOf(konsey)).allianceId).toBeNull();
  });

  it('Konseye Al / Konseyden Çıkar yalnız liderde', async () => {
    await foundedAlliance();
    await expect(service.setCouncil({ worldId, playerId: konsey, targetId: asker, council: true }))
      .rejects.toMatchObject({ code: 'forbidden' });

    await service.setCouncil({ worldId, playerId: lider, targetId: asker, council: true });
    expect((await roleOf(asker)).role).toBe(ROLE.COUNCIL);
    await service.setCouncil({ worldId, playerId: lider, targetId: asker, council: false });
    expect((await roleOf(asker)).role).toBe(ROLE.MEMBER);
  });

  it('⭐ Liderlik Devri: yeni lider atanır, ESKİ lider Konsey Üyesine düşer (istemci q=2)', async () => {
    const aid = await foundedAlliance();
    await service.transfer({ worldId, playerId: lider, targetId: asker });

    expect((await roleOf(asker)).role).toBe(ROLE.LEADER);
    expect((await roleOf(lider)).role).toBe(ROLE.COUNCIL);
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT leader_id FROM alliances WHERE id = ${aid}
    `);
    expect(Number(a!['leader_id'])).toBe(asker);
    expect((await messagesOf(asker)).some((m) => String(m['subject']).includes('liderliği'))).toBe(true);
  });
});

describe('ayrılma / dağıtma', () => {
  it('⭐ lider kalabalık ittifaktan AYRILAMAZ (önce devir); üye ayrılabilir', async () => {
    await foundedAlliance();
    await expect(service.leave({ worldId, playerId: lider }))
      .rejects.toMatchObject({ code: 'leader_must_transfer' });

    const r = await service.leave({ worldId, playerId: asker });
    expect(r.disbanded).toBe(false);
    expect((await roleOf(asker)).allianceId).toBeNull();
  });

  it('⭐ TEK üye kalan liderin ayrılışı ittifağı dağıtır', async () => {
    await giveCastle(lider, 5);
    const a = await service.found({ worldId, playerId: lider, name: 'yalniz' });
    const r = await service.leave({ worldId, playerId: lider });
    expect(r.disbanded).toBe(true);
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM alliances WHERE id = ${a.id}
    `);
    expect(rows).toHaveLength(0);
  });

  it('dağıtma: üyeler boşa düşer, bekleyen istekler iptal olur, kayıt silinir', async () => {
    const aid = await foundedAlliance();
    const inviteId = await service.invite({ worldId, playerId: lider, targetId: disaridan });
    await service.disband({ worldId, playerId: lider });

    for (const p of [lider, konsey, asker]) {
      expect((await roleOf(p)).allianceId).toBeNull();
    }
    // Davet satırları ittifakla birlikte CASCADE ile gider — bekleyen istek kalmaz.
    expect(await h.db.execute(sql`SELECT 1 FROM alliance_invites WHERE id = ${inviteId}`)).toHaveLength(0);
    expect(await h.db.execute(sql`SELECT 1 FROM alliances WHERE id = ${aid}`)).toHaveLength(0);
  });

  it('dağıtma yalnız liderde', async () => {
    await foundedAlliance();
    await expect(service.disband({ worldId, playerId: konsey }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('metin + toplu mesaj', () => {
  it('metni Konsey de düzenler, Asker düzenleyemez; 500 sınırı', async () => {
    await foundedAlliance();
    await service.setText({ worldId, playerId: konsey, text: 'Koşan Deliler İttifakı' });
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT text FROM alliances WHERE id = ${(await roleOf(lider)).allianceId}
    `);
    expect(a!['text']).toBe('Koşan Deliler İttifakı');

    await expect(service.setText({ worldId, playerId: asker, text: 'x' }))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(service.setText({ worldId, playerId: lider, text: 'a'.repeat(501) }))
      .rejects.toMatchObject({ code: 'text_too_long' });
  });

  it('⭐ İttifağa Mesaj: TÜM üyelerin kutusuna düşer (gönderen dahil); Asker gönderemez', async () => {
    await foundedAlliance();
    const sent = await service.broadcast({ worldId, playerId: lider, text: 'Savaşa hazır olun' });
    expect(sent).toBe(3);
    for (const p of [lider, konsey, asker]) {
      const kutu = await messagesOf(p);
      const msg = kutu.find((m) => m['kind'] === 'alliance_message');
      expect(msg).toBeDefined();
      expect((msg!['body'] as Record<string, unknown>)['text']).toBe('Savaşa hazır olun');
    }
    await expect(service.broadcast({ worldId, playerId: asker, text: 'ben de' }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('ittifak sıralaması (snapshot)', () => {
  it('⭐ puan = üyelerin TOPLAMI; prevRank kayması işler; dağıtılan ittifak temizlenir', async () => {
    const aid = await foundedAlliance();
    await h.db.execute(sql`UPDATE players SET score = 100 WHERE id = ${lider}`);
    await h.db.execute(sql`UPDATE players SET score = 60 WHERE id = ${konsey}`);
    await h.db.execute(sql`UPDATE players SET score = 40 WHERE id = ${asker}`);

    // Rakip ittifak: tek üye, 150 puan → ilk snapshot'ta 1. sıra.
    await giveCastle(disaridan, 5);
    const rakip = await service.found({ worldId, playerId: disaridan, name: 'rakip' });
    await h.db.execute(sql`UPDATE players SET score = 150 WHERE id = ${disaridan}`);

    await takeSnapshot(h.db, worldId, new Date());
    const birinci = await h.db.execute<Record<string, unknown>>(sql`
      SELECT subject_id, rank, score FROM rankings
       WHERE world_id = ${worldId} AND kind = 'alliance' ORDER BY rank
    `);
    expect(birinci).toHaveLength(2);
    expect(Number(birinci[0]!['subject_id'])).toBe(aid);       // 200 puan
    expect(Number(birinci[0]!['score'])).toBe(200);
    expect(Number(birinci[1]!['subject_id'])).toBe(rakip.id);  // 150 puan

    // Rakip güçlenir → sıralar yer değiştirir, prev_rank ESKİ sırayı taşır.
    await h.db.execute(sql`UPDATE players SET score = 500 WHERE id = ${disaridan}`);
    await takeSnapshot(h.db, worldId, new Date());
    const [eskiBirinci] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT rank, prev_rank FROM rankings
       WHERE world_id = ${worldId} AND kind = 'alliance' AND subject_id = ${aid}
    `);
    expect(Number(eskiBirinci!['rank'])).toBe(2);
    expect(Number(eskiBirinci!['prev_rank'])).toBe(1);

    // Dağıtılan ittifak bir sonraki snapshot'ta sıralamadan düşer.
    await service.disband({ worldId, playerId: lider });
    await takeSnapshot(h.db, worldId, new Date());
    const kalan = await h.db.execute<Record<string, unknown>>(sql`
      SELECT subject_id FROM rankings WHERE world_id = ${worldId} AND kind = 'alliance'
    `);
    expect(kalan).toHaveLength(1);
    expect(Number(kalan[0]!['subject_id'])).toBe(rakip.id);
  });
});
