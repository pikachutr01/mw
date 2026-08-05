/**
 * ⭐ SİSTEM MESAJI — yöneticiden oyunculara (kullanıcı isteği, `ek_bilgiler`).
 *
 * ⚠️ Bu dosyanın asıl derdi **kullanıcının dört şartının** kodda gerçekten tutup tutmadığı:
 *   1. özel VEYA herkese gidebilmeli
 *   2. Raporlar'a değil **Mesajlar** sekmesine düşmeli
 *   3. sistem tarafından gönderilmiş görünmeli (gönderen adı YOK)
 *   4. açılınca okunmuş sayılmalı
 * Üçü de mevcut posta kutusu altyapısına yaslandığı için asıl risk "yanlış sekme" ve
 * "yanlış alıcı kümesi"; ikisi de burada çakılıyor.
 */
import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminMessagesController } from '../src/admin/admin.messages.controller.ts';
import type { AdminRequest } from '../src/admin/admin.guard.ts';
import type { DbHandle } from '../src/db/client.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let ctl: AdminMessagesController;
let worldId: number;
let otherWorldId: number;
let alice: number;
let bob: number;
let outsider: number;

const req = (): AdminRequest => ({
  player: { accountId: 1, playerId: alice, worldId, sessionId: '' },
  headers: {},
} as unknown as AdminRequest);

const send = (body: Record<string, unknown>): Promise<Record<string, unknown>> =>
  ctl.send(body, req());

const messagesOf = (playerId: number): Promise<Record<string, unknown>[]> =>
  h.db.execute<Record<string, unknown>>(sql`
    SELECT kind, side, subject, body, read_at FROM messages WHERE player_id = ${playerId}
     ORDER BY id
  `);

beforeAll(async () => {
  h = await setupTestDb();
  ctl = new AdminMessagesController(h.db, new GameClockService(h.db));

  worldId = freshWorldId();
  await createWorld(h, worldId);
  otherWorldId = freshWorldId();
  await createWorld(h, otherWorldId);
}, 60_000);

afterAll(async () => { await h?.close(); });

/**
 * ⚠️ Ortak test veritabanı: dünya kimlikleri her koşuda 100'den başlıyor ve `createWorld`
 * mevcut satırı GÜNCELLİYOR → önceki koşunun oyuncuları ve mesajları duruyor. Sayımlar
 * "kaç oyuncu var" üstünden gittiği için bu zemin her testte temizleniyor.
 */
beforeEach(async () => {
  for (const w of [worldId, otherWorldId]) {
    await h.db.execute(sql`DELETE FROM messages WHERE world_id = ${w}`);
    await h.db.execute(sql`DELETE FROM outbox WHERE world_id = ${w}`);
    await h.db.execute(sql`DELETE FROM audit_log WHERE world_id = ${w}`);
    await h.db.execute(sql`DELETE FROM players WHERE world_id = ${w}`);
  }
  const tag = randomUUID().slice(0, 6);
  alice = await createPlayer(h, worldId, `a${tag}`);
  bob = await createPlayer(h, worldId, `b${tag}`);
  outsider = await createPlayer(h, otherWorldId, `o${tag}`);
});

describe('duyuru (herkese)', () => {
  it('dünyadaki HER oyuncuya bir satır yazar', async () => {
    const r = await send({ worldId, scope: 'world', subject: 'Bakım', text: 'Yarın 03:00.' });

    expect(r['sent']).toBe(2);
    expect((await messagesOf(alice))).toHaveLength(1);
    expect((await messagesOf(bob))).toHaveLength(1);
  });

  /** ⚠️ Dünya yalıtımı (§13.12.1b) duyuruda da geçerli: komşu dünya duyuruyu görmez. */
  it('BAŞKA dünyanın oyuncusuna gitmez', async () => {
    await send({ worldId, scope: 'world', subject: 'Bakım', text: 'Yarın 03:00.' });
    expect(await messagesOf(outsider)).toHaveLength(0);
  });

  /**
   * ⭐ TEK OUTBOX SATIRI. Dağıtıcı `playerIds` boş gelince olayı dünya odasına yayıyor, yani
   * oyuncu başına satır yazmaya gerek yok. Oyuncu başına yazsaydık 10.000 kişilik bir dünyada
   * tek duyuru 10.000 outbox satırı üretirdi.
   */
  it('duyuru için tek bildirim satırı yazılır, oyuncu başına DEĞİL', async () => {
    await send({ worldId, scope: 'world', subject: 'Bakım', text: 'Yarın 03:00.' });
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT payload FROM outbox WHERE world_id = ${worldId} AND topic = 'message:written'
    `);
    expect(rows).toHaveLength(1);
    // Alıcı YOK → dağıtıcı dünya odasına yayar.
    expect((rows[0]!['payload'] as Record<string, unknown>)['playerId']).toBeUndefined();
  });
});

describe('özel mesaj (tek oyuncu)', () => {
  it('yalnız seçilen oyuncuya gider', async () => {
    const r = await send({
      worldId, scope: 'player', playerId: bob, subject: 'Uyarı', text: 'Kuralları oku.',
    });

    expect(r['sent']).toBe(1);
    expect(await messagesOf(alice)).toHaveLength(0);
    expect(await messagesOf(bob)).toHaveLength(1);
  });

  it('oyuncu seçilmezse reddeder', async () => {
    await expect(send({ worldId, scope: 'player', subject: 'x', text: 'y' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  /** ⚠️ Dünya sınırı burada da: başka dünyanın oyuncusu bu dünyadan mesaj alamaz. */
  it('başka dünyanın oyuncusu hedef seçilemez', async () => {
    await expect(send({
      worldId, scope: 'player', playerId: outsider, subject: 'x', text: 'y',
    })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('kullanıcının şartları', () => {
  /**
   * ⭐ **EN ÖNEMLİ TEST.** Sekme ayrımı `kind LIKE '%_report'` ile yapılıyor
   * (`battle.controller`). `system` bu kalıba UYMADIĞI için Mesajlar sekmesine düşüyor —
   * kullanıcının şartı buydu. Biri ileride türü `system_report` yaparsa mesaj sessizce
   * Raporlar'a kayar ve bu test onu yakalar.
   */
  it('sistem mesajı RAPOR değildir → Mesajlar sekmesine düşer', async () => {
    await send({ worldId, scope: 'world', subject: 'Bakım', text: 'Yarın.' });
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT kind, kind LIKE '%\\_report' ESCAPE '\\' AS is_report
        FROM messages WHERE world_id = ${worldId} LIMIT 1
    `);
    expect(row!['kind']).toBe('system');
    expect(row!['is_report']).toBe(false);
  });

  /**
   * *"Sistem tarafından gönderilmiş gözükürler"* → gövdede gönderen kimliği YOK.
   * `origin` bir yönetici adı değil, panelden geldiğini söyleyen köken işareti (aşağıda).
   */
  it('gövde yalnız metni taşır, gönderen adı taşımaz', async () => {
    await send({ worldId, scope: 'player', playerId: bob, subject: 'Konu', text: 'Gövde.' });
    const body = (await messagesOf(bob))[0]!['body'] as Record<string, unknown>;
    expect(body).toEqual({ text: 'Gövde.', origin: 'admin' });
  });

  /** *"Açılınca okunmuş sayılırlar"* → satır okunmamış doğuyor, mevcut akış işaretliyor. */
  it('mesaj OKUNMAMIŞ doğar ve okununca sayaç düşer', async () => {
    await send({ worldId, scope: 'world', subject: 'Bakım', text: 'Yarın.' });
    expect((await messagesOf(bob))[0]!['read_at']).toBeNull();

    await h.db.execute(sql`UPDATE messages SET read_at = now() WHERE player_id = ${bob}`);
    const [listed] = await ctl.list(String(worldId));
    expect(listed!['recipients']).toBe(2);
    expect(listed!['readCount']).toBe(1);
  });
});

describe('gönderilenler listesi', () => {
  /**
   * ⚠️ Toplu duyurunun N satırı TEK kayıt olarak görünmeli. Gruplama `subject + at` üstünden
   * yapılıyor ve bu ancak tüm satırlar aynı `at` değerini paylaştığı için doğru çalışıyor —
   * `at` uç içinde bir kez hesaplanıp hepsine yazılıyor.
   */
  it('duyurunun N satırı listede TEK kayıt', async () => {
    await send({ worldId, scope: 'world', subject: 'Bakım', text: 'Yarın.' });
    const rows = await ctl.list(String(worldId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!['recipients']).toBe(2);
    // Toplu duyuruda "kime" anlamsız → null.
    expect(rows[0]!['target']).toBeNull();
  });

  it('özel mesajda alıcı adı görünür', async () => {
    await send({ worldId, scope: 'player', playerId: bob, subject: 'Uyarı', text: 'Oku.' });
    const rows = await ctl.list(String(worldId));
    expect(rows[0]!['recipients']).toBe(1);
    expect(rows[0]!['target']).toBeTruthy();
  });

  /**
   * ⭐ **Dev verisinde yakalandı.** `kind = 'system'` panelden ÖNCE de kullanılıyordu
   * (ittifaktan çıkarılma, liderlik devri, mağara iptali). Süzgeç yalnız türe baksaydı panel,
   * hiç göndermediği mesajları "gönderdiklerin" listesinde gösterirdi.
   */
  it('oyunun KENDİ sistem bildirimleri bu listede görünmez', async () => {
    await h.db.execute(sql`
      INSERT INTO messages (world_id, player_id, kind, side, subject, body, at)
      VALUES (${worldId}, ${bob}, 'system', 'owner', 'İttifaktan çıkarıldın',
              '{"allianceId": 1, "reason": "kicked"}'::jsonb, now())
    `);
    expect(await ctl.list(String(worldId))).toHaveLength(0);

    await send({ worldId, scope: 'world', subject: 'Bakım', text: 'Yarın.' });
    expect(await ctl.list(String(worldId))).toHaveLength(1);
  });

  it('başka dünyanın duyurusu bu listede görünmez', async () => {
    await ctl.send(
      { worldId: otherWorldId, scope: 'world', subject: 'Komşu', text: 'Selam.' },
      { player: { accountId: 1, playerId: outsider, worldId: otherWorldId, sessionId: '' },
        headers: {} } as unknown as AdminRequest,
    );
    expect(await ctl.list(String(worldId))).toHaveLength(0);
    expect(await ctl.list(String(otherWorldId))).toHaveLength(1);
  });
});

describe('girdi doğrulama', () => {
  it('boş konu ve boş metin reddedilir', async () => {
    await expect(send({ worldId, scope: 'world', subject: '   ', text: 'x' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(send({ worldId, scope: 'world', subject: 'x', text: '   ' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  /** ⚠️ Üst sınır olmasaydı `jsonb` gövdesi ve WS yükü açık uçlu kalırdı. */
  it('çok uzun metin reddedilir', async () => {
    await expect(send({ worldId, scope: 'world', subject: 'x', text: 'a'.repeat(4001) }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('denetim kaydı yazılır', async () => {
    await send({ worldId, scope: 'world', subject: 'Bakım', text: 'Yarın.' });
    const [log] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT action, after FROM audit_log
       WHERE world_id = ${worldId} AND action = 'system_message.send'
    `);
    expect(log).toBeDefined();
    expect((log!['after'] as Record<string, unknown>)['sent']).toBe(2);
  });
});
