/**
 * ⭐ İTTİFAK SOHBETİ (§13.15c) — grup sohbeti, mention çözümü, susturma matrisi ve
 * dağıtmada CASCADE silme.
 *
 * Servis SAF test ediliyor (Nest ayağa kaldırılmıyor) — `chat.test.ts` + `alliance.test.ts`
 * deseni. Kullanıcı adları BİLEREK kural uyumlu (harf + rakam + boşluk): mention çözücü
 * gerçek adlarla sınanmalı, `createPlayer`ın ürettiği tireli etiketle değil.
 */
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AllianceService, ROLE } from '../src/alliance/alliance.service.ts';
import { AllianceChatService } from '../src/chat/alliance-chat.service.ts';
import { ChatService } from '../src/chat/chat.service.ts';
import { resolveMentions } from '../src/chat/mentions.ts';
import type { DbHandle } from '../src/db/client.ts';
import { eventForOutbox } from '../src/realtime/realtime.bus.ts';
import { notificationForOutbox } from '../src/notify/notify.catalog.ts';
import { setLiveSettings } from '../src/settings/live.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb, acceptChatTerms } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let alliance: AllianceService;
let chat: AllianceChatService;

let lider: number;
let konsey: number;
let asker: number;
let asker2: number;
let disaridan: number;
let allianceId: number;

const uuid = (): string => randomUUID();

beforeAll(async () => {
  h = await setupTestDb();
  alliance = new AllianceService(h.db);
  chat = new AllianceChatService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

/** ⚠️ Her testten sonra ayarlar sıfırlanır — ezilen bir limit sonraki testi sessizce bozar. */
afterEach(() => { setLiveSettings({}); });

async function rename(playerId: number, username: string): Promise<void> {
  await h.db.execute(sql`UPDATE players SET username = ${username} WHERE id = ${playerId}`);
}

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
    VALUES (${worldId}, ${playerId}, ${'sehir' + s}, 1, 1, ${s}, true)
  `);
}

/** Üyeyi ittifağa alır ve katılım anını GERİYE çeker (acemi kısıtına takılmasın). */
async function join(playerId: number, role: number, hoursAgo = 48): Promise<void> {
  await h.db.execute(sql`
    UPDATE players SET alliance_id = ${allianceId}, alliance_role = ${role},
           alliance_joined_at = now() - (${hoursAgo} || ' hours')::interval
     WHERE id = ${playerId}
  `);
}

async function outboxRows(topic: string): Promise<Record<string, unknown>[]> {
  return h.db.execute<Record<string, unknown>>(sql`
    SELECT payload FROM outbox WHERE topic = ${topic} ORDER BY id
  `);
}

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  lider = await createPlayer(h, worldId, 'lider');
  konsey = await createPlayer(h, worldId, 'konsey');
  asker = await createPlayer(h, worldId, 'asker');
  asker2 = await createPlayer(h, worldId, 'askeriki');
  disaridan = await createPlayer(h, worldId, 'disaridan');

  await rename(lider, 'Lider Bey');
  await rename(konsey, 'Konsey');
  await rename(asker, 'Ali');
  await rename(asker2, 'Eru Ilúvatar');
  await rename(disaridan, 'Yabanci');

  let s = 1;
  for (const p of [lider, konsey, asker, asker2, disaridan]) await makeCity(p, s++);

  await giveCastle(lider, 5);
  const a = await alliance.found({ worldId, playerId: lider, name: 'run.dll' });
  allianceId = a.id;
  // Lider `found()` ile katıldı → `alliance_joined_at` ŞİMDİ. Geriye çekiyoruz.
  await join(lider, ROLE.LEADER);
  await join(konsey, ROLE.COUNCIL);
  await join(asker, ROLE.MEMBER);
  await join(asker2, ROLE.MEMBER);
});

/* ══ Kanal ══════════════════════════════════════════════════════════════════ */

describe('kanal', () => {
  it('⭐ tembel yaratılır ve İTTİFAK BAŞINA TEKtir — iki üye aynı kanalı alır', async () => {
    const a = await chat.open({ worldId, playerId: lider });
    const b = await chat.open({ worldId, playerId: asker });
    expect(a.channelId).toBe(b.channelId);

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM chat_channels WHERE alliance_id = ${allianceId} AND kind = 'alliance'
    `);
    expect(rows).toHaveLength(1);
  });

  it('ittifaksız oyuncu sohbete HİÇ erişemez (aç / oku / yaz)', async () => {
    await expect(chat.open({ worldId, playerId: disaridan }))
      .rejects.toMatchObject({ code: 'not_alliance_member' });
    await expect(chat.history({ worldId, playerId: disaridan }))
      .rejects.toMatchObject({ code: 'not_alliance_member' });
    await expect(chat.send({ worldId, playerId: disaridan, body: 'selam', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'not_alliance_member' });
  });

  it('⭐ DÜNYA YALITIMI: başka dünyadaki aynı adlı ittifağın kanalına düşülmez', async () => {
    const otherWorld = freshWorldId();
    await createWorld(h, otherWorld);
    const yabanciLider = await createPlayer(h, otherWorld, 'ylider');
    await h.db.execute(sql`
      INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital)
      VALUES (${otherWorld}, ${yabanciLider}, 'obir', 1, 1, 1, true)
    `);
    await giveCastle(yabanciLider, 5);
    await alliance.found({ worldId: otherWorld, playerId: yabanciLider, name: 'run.dll' });

    const mine = await chat.open({ worldId, playerId: lider });
    const theirs = await chat.open({ worldId: otherWorld, playerId: yabanciLider });
    expect(mine.channelId).not.toBe(theirs.channelId);

    // Kendi dünyasının oyuncusu, öteki dünyanın kanalını asla göremez.
    await chat.send({ worldId, playerId: lider, body: 'gizli', clientMsgId: uuid() });
    const other = await chat.history({ worldId: otherWorld, playerId: yabanciLider });
    expect(other.items).toHaveLength(0);
  });
});

/* ══ Yazma kısıtları ════════════════════════════════════════════════════════ */

describe('yeni üye kısıtı', () => {
  it('⭐ katılalı 2 saat olmayan YAZAMAZ ama OKUYABİLİR', async () => {
    await chat.send({ worldId, playerId: lider, body: 'hos geldin', clientMsgId: uuid() });
    await join(asker, ROLE.MEMBER, 0);   // az önce katıldı

    await expect(chat.send({ worldId, playerId: asker, body: 'selam', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'alliance_new_member_restricted' });

    // Okumak serbest — ceza "sohbetten silinmek" değil.
    const seen = await chat.history({ worldId, playerId: asker });
    expect(seen.items.map((m) => m.body)).toContain('hos geldin');

    // Açılış paketi sebebi ÖNCEDEN söylüyor (kutuyu kapatmak için).
    const packet = await chat.open({ worldId, playerId: asker });
    expect(packet.canWrite).toBe(false);
    expect(packet.reason).toBe('too_new');
    expect(packet.blockedText).toMatch(/beklemelisin/);
  });

  it('2 saat dolunca yazabilir', async () => {
    await join(asker, ROLE.MEMBER, 3);
    const m = await chat.send({ worldId, playerId: asker, body: 'artik yazabilirim', clientMsgId: uuid() });
    expect(m.id).toBeGreaterThan(0);
  });

  it('⚠️ `alliance_joined_at` NULL ise FAIL-CLOSED — yazamaz', async () => {
    await h.db.execute(sql`UPDATE players SET alliance_joined_at = NULL WHERE id = ${asker}`);
    await expect(chat.send({ worldId, playerId: asker, body: 'selam', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'alliance_new_member_restricted' });
  });

  it('kısıt 0 yapılınca kapanır', async () => {
    await join(asker, ROLE.MEMBER, 0);
    setLiveSettings({ allianceChat: { newMemberHours: 0 } });
    const m = await chat.send({ worldId, playerId: asker, body: 'serbest', clientMsgId: uuid() });
    expect(m.id).toBeGreaterThan(0);
  });
});

describe('alliance_joined_at yazma noktaları', () => {
  it('⭐ found() katılım anını damgalar', async () => {
    const [r] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT alliance_joined_at FROM players WHERE id = ${lider}
    `);
    expect(r!['alliance_joined_at']).not.toBeNull();
  });

  it('⭐ davet kabulü (decide) damgalar — applyMembership\'ten GEÇMİYOR', async () => {
    const inviteId = await alliance.invite({ worldId, playerId: lider, targetId: disaridan });
    await alliance.decide({ worldId, playerId: disaridan, inviteId, accept: true });
    const [r] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT alliance_id, alliance_joined_at FROM players WHERE id = ${disaridan}
    `);
    expect(Number(r!['alliance_id'])).toBe(allianceId);
    expect(r!['alliance_joined_at']).not.toBeNull();
  });

  it('⭐ ayrılma ve atılma NULL\'a çeker — geri katılan süreyi YENİDEN bekler', async () => {
    await alliance.leave({ worldId, playerId: asker });
    const [left] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT alliance_joined_at FROM players WHERE id = ${asker}
    `);
    expect(left!['alliance_joined_at']).toBeNull();

    await alliance.kick({ worldId, playerId: lider, targetId: asker2 });
    const [kicked] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT alliance_joined_at FROM players WHERE id = ${asker2}
    `);
    expect(kicked!['alliance_joined_at']).toBeNull();
  });

  it('dağıtma NULL\'a çeker', async () => {
    await alliance.disband({ worldId, playerId: lider });
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT alliance_joined_at FROM players WHERE id IN (${lider}, ${konsey}, ${asker})
    `);
    for (const r of rows) expect(r['alliance_joined_at']).toBeNull();
  });
});

/* ══ Akış kontrolleri ═══════════════════════════════════════════════════════ */

describe('flood koruması', () => {
  it('⭐ kova KANAL BAŞINA — DM kovasını yemiyor, DM kovası bunu yemiyor', async () => {
    setLiveSettings({
      allianceChat: { burst: 2, perSeconds: 60 },
      chat: { burst: 2, perSeconds: 60, newPlayerHours: 0 },
    });

    // İttifak kovasını doldur.
    await chat.send({ worldId, playerId: lider, body: 'bir', clientMsgId: uuid() });
    await chat.send({ worldId, playerId: lider, body: 'iki', clientMsgId: uuid() });
    await expect(chat.send({ worldId, playerId: lider, body: 'uc', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'rate_limited' });

    // ⚠️ Aynı oyuncu DM'de HÂLÂ yazabilmeli: kovalar ayrı.
    const dm = new ChatService(h.db);
    const channelId = await dm.openConversation({
      worldId, playerId: lider, withPlayerId: disaridan,
    });
    await acceptChatTerms(h, channelId);
    const sent = await dm.send({
      worldId, playerId: lider, channelId, body: 'dm serbest', clientMsgId: uuid(),
    });
    expect(sent.id).toBeGreaterThan(0);
  });

  it('aynı metin mükerrer sayılır', async () => {
    setLiveSettings({ allianceChat: { duplicateSeconds: 60 } });
    await chat.send({ worldId, playerId: lider, body: 'tekrar', clientMsgId: uuid() });
    await expect(chat.send({ worldId, playerId: lider, body: 'tekrar', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'duplicate_message' });
  });

  it('⭐ yavaş mod: iki mesaj arası asgarî süre', async () => {
    setLiveSettings({ allianceChat: { slowModeSeconds: 60, duplicateSeconds: 0 } });
    await chat.send({ worldId, playerId: lider, body: 'ilk', clientMsgId: uuid() });
    await expect(chat.send({ worldId, playerId: lider, body: 'ikinci', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'slow_mode' });
  });

  it('⭐ IDEMPOTENCY: aynı clientMsgId iki kez → tek satır, limitlere HİÇ bakılmaz', async () => {
    const id = uuid();
    const first = await chat.send({ worldId, playerId: lider, body: 'ayni', clientMsgId: id });
    // Limitleri kapatılamayacak kadar sert yap: yeniden deneme yine de geçmeli.
    setLiveSettings({ allianceChat: { burst: 1, perSeconds: 600, duplicateSeconds: 600 } });
    const again = await chat.send({ worldId, playerId: lider, body: 'ayni', clientMsgId: id });
    expect(again.id).toBe(first.id);

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM chat_messages WHERE client_msg_id = ${id}::uuid
    `);
    expect(rows).toHaveLength(1);
  });

  it('sohbet yasaklı yazamaz ama okuyabilir', async () => {
    await chat.send({ worldId, playerId: lider, body: 'gorunur', clientMsgId: uuid() });
    await h.db.execute(sql`
      INSERT INTO chat_bans (world_id, player_id, scope, until, reason)
      VALUES (${worldId}, ${asker}, 'all', NULL, 'deneme')
    `);
    await expect(chat.send({ worldId, playerId: asker, body: 'selam', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'chat_banned' });
    const seen = await chat.history({ worldId, playerId: asker });
    expect(seen.items).toHaveLength(1);
  });

  it('özellik panelden kapatılınca yazma durur, geçmiş okunur', async () => {
    await chat.send({ worldId, playerId: lider, body: 'eski', clientMsgId: uuid() });
    setLiveSettings({ allianceChat: { enabled: false } });
    await expect(chat.send({ worldId, playerId: lider, body: 'yeni', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'alliance_chat_disabled' });
    const seen = await chat.history({ worldId, playerId: lider });
    expect(seen.items).toHaveLength(1);
  });
});

/* ══ Mention ════════════════════════════════════════════════════════════════ */

describe('mention çözücü (saf)', () => {
  const uyeler = [
    { playerId: 1, username: 'Ali' },
    { playerId: 2, username: 'Eru Ilúvatar' },
    { playerId: 3, username: 'Eru' },
  ];
  const solve = (body: string, max = 5): ReturnType<typeof resolveMentions> =>
    resolveMentions(body, uyeler, max);

  it('tek mention çözülür ve aralık DOĞRU', () => {
    const body = 'selam @Ali nasilsin';
    const [m] = solve(body);
    expect(m!.id).toBe(1);
    // ⭐ İndeks doğruluğu: geri okununca tam `@Ali` çıkmalı.
    expect(body.slice(m!.at, m!.at + m!.len)).toBe('@Ali');
  });

  it('⭐ BOŞLUKLU AD çözülür ve UZUN eşleşme kazanır', () => {
    const body = 'baksana @Eru Ilúvatar burada';
    const [m] = solve(body);
    expect(m!.id).toBe(2);                                   // 3 (Eru) değil
    expect(body.slice(m!.at, m!.at + m!.len)).toBe('@Eru Ilúvatar');
  });

  it('kısa ad tek başına da çözülür', () => {
    const body = '@Eru gel';
    const [m] = solve(body);
    expect(m!.id).toBe(3);
  });

  it('⚠️ `ali@veli` mention DEĞİL (öncesi harf)', () => {
    expect(solve('ali@Ali')).toHaveLength(0);
  });

  it('⚠️ `@Alican` yalnız `Ali` üyeyken çözülmez (sonrası harf)', () => {
    expect(solve('@Alican geldi')).toHaveLength(0);
  });

  it('ittifak dışı ada mention çözülmez', () => {
    expect(solve('@Yabanci selam')).toHaveLength(0);
  });

  it('çok mention + tavan', () => {
    expect(solve('@Ali ve @Eru')).toHaveLength(2);
    expect(solve('@Ali ve @Eru', 1)).toHaveLength(1);
    expect(solve('@Ali ve @Eru', 0)).toHaveLength(0);
  });

  it('aynı kişi iki kez anılırsa İKİ aralık döner (ikisi de kalın yazılmalı)', () => {
    const out = solve('@Ali sana diyorum @Ali');
    expect(out).toHaveLength(2);
    expect(out.every((m) => m.id === 1)).toBe(true);
  });

  it('`@` içeren düz metin mention üretmez', () => {
    expect(solve('e-posta: a@b.com')).toHaveLength(0);
    expect(solve('fiyat @ 5 lira')).toHaveLength(0);
  });
});

describe('mention (uçtan uca)', () => {
  it('⭐ gövde + aralıklar DB\'ye yazılır ve geçmişte geri gelir', async () => {
    const body = 'toplanti var @Ali';
    await chat.send({ worldId, playerId: lider, body, clientMsgId: uuid() });
    const seen = await chat.history({ worldId, playerId: lider });
    const m = seen.items[0]!;
    expect(m.mentions).toHaveLength(1);
    expect(m.mentions[0]!.id).toBe(asker);
    expect(m.body.slice(m.mentions[0]!.at, m.mentions[0]!.at + m.mentions[0]!.len)).toBe('@Ali');
  });

  it('⭐ outbox yükü: mention id\'leri TEKİL ve GÖNDEREN SÜZÜLMÜŞ', async () => {
    await chat.send({
      worldId, playerId: lider,
      body: '@Ali @Ali ve @Lider Bey toplaniyoruz', clientMsgId: uuid(),
    });
    const rows = await outboxRows('chat:alliance');
    const payload = rows.at(-1)!['payload'] as Record<string, unknown>;
    // Ali iki kez anıldı → tek id; gönderen kendini andı → listede YOK.
    expect(payload['mentions']).toEqual([asker]);
  });

  it('mention yoksa outbox mention listesi boş', async () => {
    await chat.send({ worldId, playerId: lider, body: 'duz mesaj', clientMsgId: uuid() });
    const rows = await outboxRows('chat:alliance');
    expect((rows.at(-1)!['payload'] as Record<string, unknown>)['mentions']).toEqual([]);
  });
});

/* ══ Susturma ═══════════════════════════════════════════════════════════════ */

describe('susturma yetki matrisi', () => {
  it('⭐ Konsey → Asker ✓', async () => {
    await chat.mute({ worldId, playerId: konsey, targetId: asker, minutes: 60 });
    await expect(chat.send({ worldId, playerId: asker, body: 'selam', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'alliance_muted' });
  });

  it('⚠️ Konsey → Konsey ✗ · Konsey → Lider ✗', async () => {
    const konsey2 = await createPlayer(h, worldId, 'konseyiki');
    await makeCity(konsey2, 9);
    await join(konsey2, ROLE.COUNCIL);

    await expect(chat.mute({ worldId, playerId: konsey, targetId: konsey2, minutes: 60 }))
      .rejects.toMatchObject({ code: 'mute_hierarchy' });
    await expect(chat.mute({ worldId, playerId: konsey, targetId: lider, minutes: 60 }))
      .rejects.toMatchObject({ code: 'mute_hierarchy' });
  });

  it('⭐ Lider → Konsey ✓ ama Lider → kendisi ✗', async () => {
    await chat.mute({ worldId, playerId: lider, targetId: konsey, minutes: 60 });
    await expect(chat.send({ worldId, playerId: konsey, body: 'selam', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'alliance_muted' });

    await expect(chat.mute({ worldId, playerId: lider, targetId: lider, minutes: 60 }))
      .rejects.toMatchObject({ code: 'mute_self' });
  });

  it('Asker kimseyi susturamaz', async () => {
    await expect(chat.mute({ worldId, playerId: asker, targetId: asker2, minutes: 60 }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('başka ittifağın üyesi susturulamaz', async () => {
    await expect(chat.mute({ worldId, playerId: lider, targetId: disaridan, minutes: 60 }))
      .rejects.toMatchObject({ code: 'not_same_alliance' });
  });
});

describe('susturma davranışı', () => {
  it('⭐ SÜRELİ susturma dolunca yazabilir', async () => {
    await chat.mute({ worldId, playerId: lider, targetId: asker, minutes: 60 });
    await expect(chat.send({ worldId, playerId: asker, body: 'a', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'alliance_muted' });

    // Süreyi geçmişe çek — satır DURUYOR ama etkisiz.
    await h.db.execute(sql`
      UPDATE alliance_chat_mutes SET until = now() - interval '1 minute'
       WHERE player_id = ${asker} AND revoked_at IS NULL
    `);
    const m = await chat.send({ worldId, playerId: asker, body: 'artik serbest', clientMsgId: uuid() });
    expect(m.id).toBeGreaterThan(0);
  });

  it('⭐ KALICI susturma (minutes: null) kendiliğinden dolmaz', async () => {
    await chat.mute({ worldId, playerId: lider, targetId: asker, minutes: null });
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT until FROM alliance_chat_mutes WHERE player_id = ${asker} AND revoked_at IS NULL
    `);
    expect(row!['until']).toBeNull();

    const packet = await chat.open({ worldId, playerId: asker });
    expect(packet.canWrite).toBe(false);
    expect(packet.reason).toBe('muted');
    expect(packet.blockedUntil).toBeNull();
    expect(packet.blockedText).toMatch(/süresiz/);
  });

  it('susturulmuş üye OKUYABİLİR', async () => {
    await chat.send({ worldId, playerId: lider, body: 'gorunur', clientMsgId: uuid() });
    await chat.mute({ worldId, playerId: lider, targetId: asker, minutes: null });
    const seen = await chat.history({ worldId, playerId: asker });
    expect(seen.items).toHaveLength(1);
  });

  it('⭐ kaldırma: satır SİLİNMEZ, revoked_at/revoked_by dolar', async () => {
    await chat.mute({ worldId, playerId: lider, targetId: asker, minutes: null });
    await chat.unmute({ worldId, playerId: lider, targetId: asker });

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT revoked_at, revoked_by FROM alliance_chat_mutes WHERE player_id = ${asker}
    `);
    expect(rows).toHaveLength(1);                          // satır DURUYOR (denetim izi)
    expect(rows[0]!['revoked_at']).not.toBeNull();
    expect(Number(rows[0]!['revoked_by'])).toBe(lider);

    const m = await chat.send({ worldId, playerId: asker, body: 'yeniden', clientMsgId: uuid() });
    expect(m.id).toBeGreaterThan(0);
  });

  it('aktif susturma yokken kaldırma reddedilir', async () => {
    await expect(chat.unmute({ worldId, playerId: lider, targetId: asker }))
      .rejects.toMatchObject({ code: 'not_muted' });
  });

  it('⚠️ SÜRESİ GEÇMİŞ ama iptal edilmemiş satır varken YENİDEN susturma unique ihlali ÜRETMEZ', async () => {
    await chat.mute({ worldId, playerId: lider, targetId: asker, minutes: 60 });
    await h.db.execute(sql`
      UPDATE alliance_chat_mutes SET until = now() - interval '1 minute'
       WHERE player_id = ${asker} AND revoked_at IS NULL
    `);
    // Servis önce eskiyi iptale çekmezse kısmî unique indeks bunu reddederdi.
    await chat.mute({ worldId, playerId: lider, targetId: asker, minutes: null });

    const active = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM alliance_chat_mutes WHERE player_id = ${asker} AND revoked_at IS NULL
    `);
    expect(active).toHaveLength(1);
  });

  it('⭐ susturma İTTİFAĞA bağlı: ayrılıp geri katılan hâlâ susturulmuş', async () => {
    await chat.mute({ worldId, playerId: lider, targetId: asker, minutes: null });
    await alliance.leave({ worldId, playerId: asker });
    await join(asker, ROLE.MEMBER);                       // geri katıldı

    await expect(chat.send({ worldId, playerId: asker, body: 'kacis', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'alliance_muted' });
  });

  it('açılış paketi herkesin susturma durumunu taşır', async () => {
    await chat.mute({ worldId, playerId: lider, targetId: asker, minutes: null });
    const packet = await chat.open({ worldId, playerId: lider });
    const row = packet.members.find((m) => m.playerId === asker)!;
    expect(row.muted).toBe(true);
    expect(row.mutedUntil).toBeNull();
    expect(packet.members.find((m) => m.playerId === konsey)!.muted).toBe(false);
  });
});

/* ══ Üyelik değişimleri ═════════════════════════════════════════════════════ */

describe('üyelik değişimleri', () => {
  it('⭐ AYRILAN ve ATILAN üyenin mesajları sohbette KALIR', async () => {
    await chat.send({ worldId, playerId: asker, body: 'ayrilanin sozu', clientMsgId: uuid() });
    await chat.send({ worldId, playerId: asker2, body: 'atilanin sozu', clientMsgId: uuid() });

    await alliance.leave({ worldId, playerId: asker });
    await alliance.kick({ worldId, playerId: lider, targetId: asker2 });

    const seen = await chat.history({ worldId, playerId: lider });
    const bodies = seen.items.map((m) => m.body);
    expect(bodies).toContain('ayrilanin sozu');
    expect(bodies).toContain('atilanin sozu');
    // Ad hâlâ çözülüyor (oyuncu dünyada duruyor, yalnız ittifakta değil).
    expect(seen.items.every((m) => m.senderName != null)).toBe(true);
  });

  it('ayrılan üye sohbeti artık okuyamaz', async () => {
    await chat.send({ worldId, playerId: lider, body: 'ic bilgi', clientMsgId: uuid() });
    await alliance.leave({ worldId, playerId: asker });
    await expect(chat.history({ worldId, playerId: asker }))
      .rejects.toMatchObject({ code: 'not_alliance_member' });
  });

  it('⭐⭐ DAĞITMA: kanal + mesajlar + susturmalar CASCADE ile gider', async () => {
    const packet = await chat.open({ worldId, playerId: lider });
    await chat.send({ worldId, playerId: lider, body: 'silinecek', clientMsgId: uuid() });
    await chat.mute({ worldId, playerId: lider, targetId: asker, minutes: null });

    await alliance.disband({ worldId, playerId: lider });

    const channels = await h.db.execute(sql`
      SELECT id FROM chat_channels WHERE id = ${packet.channelId}
    `);
    const messages = await h.db.execute(sql`
      SELECT id FROM chat_messages WHERE channel_id = ${packet.channelId}
    `);
    const mutes = await h.db.execute(sql`
      SELECT id FROM alliance_chat_mutes WHERE alliance_id = ${allianceId}
    `);
    expect(channels).toHaveLength(0);
    expect(messages).toHaveLength(0);
    expect(mutes).toHaveLength(0);
  });
});

/* ══ Sayfalama ══════════════════════════════════════════════════════════════ */

describe('geçmiş', () => {
  it('⭐ keyset sayfalama: en yeni ÖNCE, `before` imleci, `hasMore`', async () => {
    setLiveSettings({ allianceChat: { duplicateSeconds: 0, pageSize: 2 } });
    for (const t of ['bir', 'iki', 'uc', 'dort', 'bes']) {
      await chat.send({ worldId, playerId: lider, body: t, clientMsgId: uuid() });
    }

    const first = await chat.history({ worldId, playerId: lider });
    expect(first.items.map((m) => m.body)).toEqual(['bes', 'dort']);
    expect(first.hasMore).toBe(true);

    const second = await chat.history({
      worldId, playerId: lider, before: first.items.at(-1)!.id,
    });
    expect(second.items.map((m) => m.body)).toEqual(['uc', 'iki']);

    const third = await chat.history({
      worldId, playerId: lider, before: second.items.at(-1)!.id,
    });
    expect(third.items.map((m) => m.body)).toEqual(['bir']);
    expect(third.hasMore).toBe(false);
  });
});

/* ══ Mesaj kaldırma ═════════════════════════════════════════════════════════ */

/**
 * ⭐ MESAJI KALDIR (kullanıcı, 2026-08-11) — genel sohbetteki yeteneğin ittifak ikizi.
 * Yetki matrisi susturmanın **birebir aynısı** (`assertCanModerate`), iki noktada ayrışıyor:
 * kendi mesajın ve ayrılmış üyenin mesajı. Bu ikisi asıl bekçiler.
 */
describe('mesaj kaldırma', () => {
  /** Kanalda duran (kaldırılmamış) mesaj gövdeleri, eskiden yeniye. */
  async function gorunen(playerId: number): Promise<string[]> {
    const r = await chat.history({ worldId, playerId });
    return r.items.map((m) => m.body).reverse();
  }

  it('⭐ ARDIŞIK mesajlardan yalnız SEÇİLEN kalkar (kullanıcının bildirdiği senaryo)', async () => {
    setLiveSettings({ allianceChat: { duplicateSeconds: 0 } });
    const ids: number[] = [];
    for (const t of ['bir', 'iki', 'uc']) {
      const m = await chat.send({ worldId, playerId: asker, body: t, clientMsgId: uuid() });
      ids.push(m.id);
    }

    // Ortadaki — eski arayüzde ulaşılamayan mesaj.
    await chat.deleteMessage({ worldId, playerId: lider, messageId: ids[1]! });

    expect(await gorunen(lider)).toEqual(['bir', 'uc']);
  });

  it('⚠️ satır SİLİNMEZ, `deleted_at`/`deleted_by` işaretlenir (kanıt kalır)', async () => {
    const m = await chat.send({ worldId, playerId: asker, body: 'kufur', clientMsgId: uuid() });
    await chat.deleteMessage({ worldId, playerId: konsey, messageId: m.id });

    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT body, deleted_at, deleted_by FROM chat_messages WHERE id = ${m.id}
    `);
    expect(row!['body']).toBe('kufur');
    expect(row!['deleted_at']).not.toBeNull();
    expect(Number(row!['deleted_by'])).toBe(konsey);
  });

  it('yetki matrisi susturmanın aynısı: Konsey Asker’i kaldırır, AKRANINI/Lider’i KALDIRAMAZ', async () => {
    setLiveSettings({ allianceChat: { duplicateSeconds: 0 } });
    /* ⚠️ İkinci bir Konsey ŞART: hedef olarak `konsey`in KENDİ mesajını kullanmak yanlış
       ölçüm olurdu — kendi mesajını kaldırmak matristen muaf ve serbest. Bu testin ilk
       hâli tam bu tuzağa düşüp yeşil bekleyip kırmızı verdi. */
    await join(asker2, ROLE.COUNCIL);
    const askerMsg = await chat.send({ worldId, playerId: asker, body: 'a', clientMsgId: uuid() });
    const akranMsg = await chat.send({ worldId, playerId: asker2, body: 'k', clientMsgId: uuid() });
    const liderMsg = await chat.send({ worldId, playerId: lider, body: 'l', clientMsgId: uuid() });

    await expect(chat.deleteMessage({ worldId, playerId: konsey, messageId: askerMsg.id }))
      .resolves.toBeUndefined();
    await expect(chat.deleteMessage({ worldId, playerId: konsey, messageId: akranMsg.id }))
      .rejects.toMatchObject({ code: 'delete_hierarchy' });
    await expect(chat.deleteMessage({ worldId, playerId: konsey, messageId: liderMsg.id }))
      .rejects.toMatchObject({ code: 'delete_hierarchy' });

    // Lider Konsey'inkini de kaldırabilir.
    await expect(chat.deleteMessage({ worldId, playerId: lider, messageId: akranMsg.id }))
      .resolves.toBeUndefined();
  });

  it('⚠️ ASKER hiçbir mesajı kaldıramaz — kendininki bile', async () => {
    const m = await chat.send({ worldId, playerId: asker, body: 'benim', clientMsgId: uuid() });
    await expect(chat.deleteMessage({ worldId, playerId: asker, messageId: m.id }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('⭐ KENDİ mesajını kaldırmak serbest (susturmadan ayrıldığı 1. nokta)', async () => {
    const m = await chat.send({ worldId, playerId: konsey, body: 'yanlis yazdim', clientMsgId: uuid() });
    await expect(chat.deleteMessage({ worldId, playerId: konsey, messageId: m.id }))
      .resolves.toBeUndefined();
    expect(await gorunen(lider)).toEqual([]);
  });

  it('⭐ AYRILMIŞ üyenin mesajı kaldırılabilir (susturmadan ayrıldığı 2. nokta)', async () => {
    const m = await chat.send({ worldId, playerId: asker, body: 'reklam', clientMsgId: uuid() });
    // Üye ittifaktan ayrıldı; mesajı kanalda kaldı (§13.15c-1).
    await h.db.execute(sql`
      UPDATE players SET alliance_id = NULL, alliance_role = NULL WHERE id = ${asker}
    `);

    await expect(chat.deleteMessage({ worldId, playerId: konsey, messageId: m.id }))
      .resolves.toBeUndefined();
    // …ama susturma hâlâ reddedilir: susturma ÜYEYE uygulanıyor.
    await expect(chat.mute({ worldId, playerId: konsey, targetId: asker, minutes: null }))
      .rejects.toMatchObject({ code: 'not_same_alliance' });
  });

  it('⚠️⚠️ BAŞKA ittifağın mesajına id tahminiyle uzanılamaz', async () => {
    const m = await chat.send({ worldId, playerId: asker, body: 'ozel', clientMsgId: uuid() });

    // `disaridan` kendi ittifağını kurup lideri oluyor — rütbesi en yüksek, ama kanalı başka.
    await giveCastle(disaridan, 5);
    await alliance.found({ worldId, playerId: disaridan, name: 'oteki' });

    await expect(chat.deleteMessage({ worldId, playerId: disaridan, messageId: m.id }))
      .rejects.toMatchObject({ code: 'not_found' });
    expect(await gorunen(lider)).toEqual(['ozel']);
  });

  it('aynı mesaj İKİ KEZ kaldırılamaz', async () => {
    const m = await chat.send({ worldId, playerId: asker, body: 'bir kez', clientMsgId: uuid() });
    await chat.deleteMessage({ worldId, playerId: lider, messageId: m.id });
    await expect(chat.deleteMessage({ worldId, playerId: lider, messageId: m.id }))
      .rejects.toMatchObject({ code: 'not_found' });
  });

  it('⭐ AYRI outbox konusu yazılır — `chat:alliance` olsaydı silme «yeni mesaj» bildirirdi', async () => {
    const m = await chat.send({ worldId, playerId: asker, body: 'x', clientMsgId: uuid() });
    await chat.deleteMessage({ worldId, playerId: lider, messageId: m.id });

    /* ⚠️ `outboxRows` dünya süzgeci taşımıyor ve `outbox` testler arasında temizlenmiyor —
       bu dünyaya ait satırı ayrıca süzmek gerek (ilk hâli 8 satır bulup kırmızı verdi). */
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT payload FROM outbox
       WHERE topic = 'chat:alliance:deleted' AND world_id = ${worldId} ORDER BY id
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]!['payload']).toMatchObject({ messageId: m.id });
  });
});

/* ══ Olay ve bildirim eşlemesi ══════════════════════════════════════════════ */

describe('olay eşlemesi', () => {
  const payload = { channelId: 42, allianceId: 7, messageId: 99, senderId: 5, mentions: [11, 12] };

  it('⭐⭐ olay YALNIZ kanal odasına: chatChannelId dolu, playerIds BOŞ, allianceId YOK', () => {
    const ev = eventForOutbox('chat:alliance', payload, 1)!;
    expect(ev.topic).toBe('chat:alliance');
    expect(ev.chatChannelId).toBe(42);
    expect(ev.playerIds).toEqual([]);
    expect(ev.allianceId ?? null).toBeNull();
  });

  it('⚠️ olay GÖVDE taşımaz — yalnız kimlik', () => {
    const ev = eventForOutbox('chat:alliance', { ...payload, body: 'gizli metin' }, 1)!;
    expect(JSON.stringify(ev)).not.toContain('gizli metin');
    expect(Object.keys(ev.ref ?? {}).sort()).toEqual(['channelId', 'messageId']);
  });

  it('⭐ bildirim YALNIZ anılanlara, kategori `mention`, metinler sabit', () => {
    const notes = notificationForOutbox('chat:alliance', payload, 1);
    expect(notes.map((n) => n.playerId).sort()).toEqual([11, 12]);
    for (const n of notes) {
      expect(n.category).toBe('mention');
      expect(n.title).toBe('İttifak sohbeti');
      expect(n.body).toBe('Sohbette sizden bahsedildi.');
      expect(n.url).toBe('/command/alliance?chat=1');
      expect(n.tag).toBe('mention:42');            // KANAL başına — üst üste gelenler birleşir
    }
  });

  it('⚠️ mention YOKSA hiç bildirim yok (sıradan mesaj sessiz)', () => {
    expect(notificationForOutbox('chat:alliance', { ...payload, mentions: [] }, 1)).toEqual([]);
  });

  /**
   * ⭐ SİLME OLAYI (2026-08-11) — mesaj olayıyla aynı kalıp, aynı odaya. ⚠️ Ayrı konu olması
   * ŞART: `notify.catalog` yalnız `chat:alliance`i tanıyor, yani silme bildirim ÜRETMİYOR.
   * Aynı konuyu kullansaydık bir mesajın kaldırılması odadakilere «sizden bahsedildi»
   * bildirimi gönderirdi.
   */
  it('⭐ silme olayı kanal odasına gider ve HİÇ bildirim üretmez', () => {
    const ev = eventForOutbox('chat:alliance:deleted', { channelId: 42, messageId: 99 }, 1)!;
    expect(ev.topic).toBe('chat:alliance:deleted');
    expect(ev.chatChannelId).toBe(42);
    expect(ev.playerIds).toEqual([]);
    expect(ev.allianceId ?? null).toBeNull();
    expect(notificationForOutbox('chat:alliance:deleted', payload, 1)).toEqual([]);
  });
});
