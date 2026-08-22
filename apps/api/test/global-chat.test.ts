/**
 * ⭐ GENEL SOHBET (§13.12) — dünya başına tek oda, roster'sız mention, engelleme süzgeci,
 * yönetici susturması/silmesi ve **sohbet yasağının KAPSAM yalıtımı**.
 *
 * Servis SAF test ediliyor (Nest ayağa kaldırılmıyor) — `alliance-chat.test.ts` deseni.
 * Kullanıcı adları BİLEREK kural uyumlu (harf + rakam + boşluk): mention çözücü gerçek adlarla
 * sınanmalı, `createPlayer`ın ürettiği tireli etiketle değil.
 *
 * ⚠️ **`slowModeSeconds` varsayılanı 5** ve bu, art arda iki mesaj gönderen HER testi kırar.
 * `beforeEach` onu 0'a çekiyor; yavaş modun kendisi ayrıca ve açıkça sınanıyor.
 */
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ChatService } from '../src/chat/chat.service.ts';
import { GlobalChatService } from '../src/chat/global-chat.service.ts';
import { mentionCandidateNames } from '../src/chat/mentions.ts';
import type { DbHandle } from '../src/db/client.ts';
import { notificationForOutbox } from '../src/notify/notify.catalog.ts';
import { eventForOutbox } from '../src/realtime/realtime.bus.ts';
import { setLiveSettings } from '../src/settings/live.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb, acceptChatTerms } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let chat: GlobalChatService;
let dm: ChatService;

let ali: number;
let eru: number;
let veli: number;

const uuid = (): string => randomUUID();

beforeAll(async () => {
  h = await setupTestDb();
  chat = new GlobalChatService(h.db);
  dm = new ChatService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

/**
 * Yavaş modu kapatıp istenen ayarları üstüne yazar.
 * ⚠️ `setLiveSettings` grubu KOMPLE değiştiriyor (birleştirmiyor), o yüzden her çağrıda
 * `slowModeSeconds: 0` tekrar yazılmak zorunda.
 */
function live(extra: Record<string, number | boolean> = {}): void {
  setLiveSettings({ globalChat: { slowModeSeconds: 0, ...extra } });
}

async function rename(playerId: number, username: string): Promise<void> {
  await h.db.execute(sql`UPDATE players SET username = ${username} WHERE id = ${playerId}`);
}

async function makeStaff(playerId: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE accounts SET role = 'admin' WHERE id = (SELECT account_id FROM players WHERE id = ${playerId})
  `);
}

async function unverify(playerId: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE accounts SET email_verified_at = NULL
     WHERE id = (SELECT account_id FROM players WHERE id = ${playerId})
  `);
}

/** Hesabı `minutes` dakika önce kurulmuş gibi gösterir (acemi kısıtı ölçütü). */
async function ageAccount(playerId: number, minutes: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE players SET created_at = now() - (${minutes} || ' minutes')::interval WHERE id = ${playerId}
  `);
}

/**
 * ⚠️ **`world_id` süzgeci ŞART.** Test veritabanı koşular arasında yaşıyor ve `outbox`
 * temizlenmiyor; dünya kimliği süzülmezse `[row]` önceki KOŞUDAN kalmış bir satırı yakalar ve
 * test, hiç çalıştırmadığı bir gönderimi ölçer. (Bu tuzak bu dosyayı yazarken bir kez ısırdı:
 * `senderId` ekranda 9983 görünüyordu, oysa testin oyuncusu 10082'ydi.)
 */
async function outboxRows(topic: string): Promise<Record<string, unknown>[]> {
  return h.db.execute<Record<string, unknown>>(sql`
    SELECT payload FROM outbox WHERE topic = ${topic} AND world_id = ${worldId} ORDER BY id
  `);
}

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  ali = await createPlayer(h, worldId, 'ali');
  eru = await createPlayer(h, worldId, 'eru');
  veli = await createPlayer(h, worldId, 'veli');
  await rename(ali, 'Ali');
  await rename(eru, 'Eru Ilúvatar');
  await rename(veli, 'Veli');
  /**
   * ⚠️ Üçü de ESKİ hesap sayılıyor. Sebep genel sohbet değil **DM**: `chat.newPlayerHours`
   * varsayılanı 12 saat ve DM'e dokunan testler (kova yalıtımı, kapsam yalıtımı) o kısıta
   * takılıyordu. Genel sohbetin kendi eşiği 0, yani bu satır onu hiç etkilemiyor —
   * «yeni kayıt anında yazabilir» testi zaten kendi taze oyuncusunu kuruyor.
   */
  for (const p of [ali, eru, veli]) await ageAccount(p, 48 * 60);
  live();
});

/** ⚠️ Her testten sonra ayarlar sıfırlanır — ezilen bir limit sonraki testi sessizce bozar. */
afterEach(() => { setLiveSettings({}); });

/* ══ Kanal ══════════════════════════════════════════════════════════════════ */

describe('kanal', () => {
  it('⭐ tembel yaratılır ve DÜNYA BAŞINA TEKtir — iki oyuncu aynı kanalı alır', async () => {
    const a = await chat.open({ worldId, playerId: ali });
    const b = await chat.open({ worldId, playerId: eru });
    expect(a.channelId).toBe(b.channelId);

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM chat_channels WHERE world_id = ${worldId} AND kind = 'global'
    `);
    expect(rows).toHaveLength(1);
  });

  it('⭐ DÜNYA YALITIMI: başka dünyanın genel mesajları geçmişte GÖRÜNMEZ', async () => {
    const other = freshWorldId();
    await createWorld(h, other);
    const yabanci = await createPlayer(h, other, 'yabanci');
    await rename(yabanci, 'Yabanci');

    await chat.send({ worldId, playerId: ali, body: 'birinci dunya', clientMsgId: uuid() });
    await chat.send({ worldId: other, playerId: yabanci, body: 'ikinci dunya', clientMsgId: uuid() });

    const mine = await chat.history({ worldId, playerId: ali });
    const theirs = await chat.history({ worldId: other, playerId: yabanci });

    expect(mine.items.map((m) => m.body)).toEqual(['birinci dunya']);
    expect(theirs.items.map((m) => m.body)).toEqual(['ikinci dunya']);
    expect(mine.channelId).not.toBe(theirs.channelId);
  });
});

/* ══ Yazma hakkı ════════════════════════════════════════════════════════════ */

describe('yazma hakkı', () => {
  it('⭐ KAPALIYKEN OKUMA DA DURUR (ittifak sohbetinden farkı)', async () => {
    live({ enabled: false });
    await expect(chat.open({ worldId, playerId: ali }))
      .rejects.toMatchObject({ code: 'global_disabled' });
    await expect(chat.history({ worldId, playerId: ali }))
      .rejects.toMatchObject({ code: 'global_disabled' });
    await expect(chat.send({ worldId, playerId: ali, body: 'selam', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'global_disabled' });
  });

  it('doğrulanmamış hesap YAZAMAZ ama OKUR', async () => {
    await chat.send({ worldId, playerId: eru, body: 'merhaba', clientMsgId: uuid() });
    await unverify(ali);

    await expect(chat.send({ worldId, playerId: ali, body: 'selam', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'email_unverified' });

    const packet = await chat.open({ worldId, playerId: ali });
    expect(packet.canWrite).toBe(false);
    expect(packet.reason).toBe('unverified');
    const seen = await chat.history({ worldId, playerId: ali });
    expect(seen.items).toHaveLength(1);
  });

  it('⭐ VARSAYILAN 0: yeni kayıt olmuş oyuncu ANINDA yazabilir (kullanıcı şartı)', async () => {
    const taze = await createPlayer(h, worldId, 'taze');
    await rename(taze, 'Taze');
    // `createPlayer` zaten `created_at = now()` bırakıyor; yani gerçekten "az önce kaydoldu".
    const m = await chat.send({ worldId, playerId: taze, body: 'ilk mesajim', clientMsgId: uuid() });
    expect(m.id).toBeGreaterThan(0);
  });

  it('acemi kısıtı AÇILIRSA yeni hesap yazamaz, eski hesap yazar', async () => {
    live({ minPlayerAgeMinutes: 60 });
    await ageAccount(ali, 5);
    await ageAccount(eru, 600);

    await expect(chat.send({ worldId, playerId: ali, body: 'selam', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'global_account_too_new' });
    /* ⚠️ Kısıtlı oyuncu OKUYABİLİR — ceza "sohbetten silinmek" olmamalı. */
    await expect(chat.history({ worldId, playerId: ali })).resolves.toBeTruthy();

    const m = await chat.send({ worldId, playerId: eru, body: 'selam', clientMsgId: uuid() });
    expect(m.id).toBeGreaterThan(0);
  });

  it('yavaş mod: iki mesaj arasında bekleme dayatır', async () => {
    setLiveSettings({ globalChat: { slowModeSeconds: 30 } });
    await chat.send({ worldId, playerId: ali, body: 'birinci', clientMsgId: uuid() });
    await expect(chat.send({ worldId, playerId: ali, body: 'ikinci', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'slow_mode' });
  });

  it('⭐ KOVA KANAL BAŞINA: genel sohbete yazmak DM kotasını TÜKETMEZ', async () => {
    live({ burst: 2, perSeconds: 60 });
    await chat.send({ worldId, playerId: ali, body: 'bir', clientMsgId: uuid() });
    await chat.send({ worldId, playerId: ali, body: 'iki', clientMsgId: uuid() });
    await expect(chat.send({ worldId, playerId: ali, body: 'uc', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'rate_limited' });

    /* Genel kanal kovası doldu ama DM kovası el değmemiş olmalı. */
    const channelId = await dm.openConversation({ worldId, playerId: ali, withPlayerId: eru });
    await acceptChatTerms(h, channelId);
    const m = await dm.send({ worldId, playerId: ali, channelId, body: 'ozel', clientMsgId: uuid() });
    expect(m.id).toBeGreaterThan(0);
  });

  it('aynı `clientMsgId` ile yeniden deneme limitlere BAKMADAN var olan satırı döndürür', async () => {
    const id = uuid();
    const first = await chat.send({ worldId, playerId: ali, body: 'tekrar', clientMsgId: id });
    setLiveSettings({ globalChat: { slowModeSeconds: 300, duplicateSeconds: 300 } });
    const again = await chat.send({ worldId, playerId: ali, body: 'tekrar', clientMsgId: id });
    expect(again.id).toBe(first.id);
  });
});

/* ══ Engelleme ══════════════════════════════════════════════════════════════ */

describe('engelleme', () => {
  it('⭐ TEK YÖNLÜ: engelleyen görmez, engellenen görmeye devam eder', async () => {
    await chat.send({ worldId, playerId: eru, body: 'eru mesaji', clientMsgId: uuid() });
    await chat.send({ worldId, playerId: ali, body: 'ali mesaji', clientMsgId: uuid() });

    await dm.block({ worldId, playerId: ali, targetId: eru });

    const aliGorur = await chat.history({ worldId, playerId: ali });
    expect(aliGorur.items.map((m) => m.body)).toEqual(['ali mesaji']);

    /* ⚠️ Karşı taraf hiçbir şey kaybetmez — engel bir "görünmezlik anlaşması" değil. */
    const eruGorur = await chat.history({ worldId, playerId: eru });
    expect(eruGorur.items.map((m) => m.body)).toEqual(['ali mesaji', 'eru mesaji']);
  });

  it('⭐ engelleyen, engellediğinin bahsetmesinden BİLDİRİM ALMAZ', async () => {
    await dm.block({ worldId, playerId: veli, targetId: ali });
    await chat.send({ worldId, playerId: ali, body: '@Veli ve @Eru Ilúvatar bakar mısınız', clientMsgId: uuid() });

    const [row] = await outboxRows('chat:global');
    const payload = row!['payload'] as Record<string, unknown>;
    /* Gövdede iki bahsetme çözülür (ekranda ikisi de kalın) ama bildirim yalnız Eru'ya gider. */
    expect(payload['mentions']).toEqual([eru]);
  });
});

/* ══ Mention ════════════════════════════════════════════════════════════════ */

describe('mention', () => {
  it('⭐ ROSTER OLMADAN çözülür — boşluklu kullanıcı adı dâhil', async () => {
    const m = await chat.send({
      worldId, playerId: ali, body: 'selam @Eru Ilúvatar nasılsın', clientMsgId: uuid(),
    });
    expect(m.mentions).toEqual([{ id: eru, at: 6, len: 13 }]);
  });

  it('başka dünyadaki AYNI ADLI oyuncuya çözülmez (dünya yalıtımı)', async () => {
    const other = freshWorldId();
    await createWorld(h, other);
    const ikizi = await createPlayer(h, other, 'ikiz');
    await rename(ikizi, 'Veli');

    const m = await chat.send({ worldId, playerId: ali, body: '@Veli selam', clientMsgId: uuid() });
    expect(m.mentions.map((x) => x.id)).toEqual([veli]);
  });

  it('`maxMentions` tavanı hem çözümü hem bildirimi keser', async () => {
    live({ maxMentions: 1 });
    const m = await chat.send({
      worldId, playerId: ali, body: '@Veli @Eru Ilúvatar', clientMsgId: uuid(),
    });
    expect(m.mentions).toHaveLength(1);
    expect(m.mentions[0]!.id).toBe(veli);
  });

  it('`maxMentions: 0` bahsetmeyi tamamen kapatır', async () => {
    live({ maxMentions: 0 });
    const m = await chat.send({ worldId, playerId: ali, body: '@Veli selam', clientMsgId: uuid() });
    expect(m.mentions).toEqual([]);
  });

  /**
   * ⭐⭐ EMOJİLİ MENTION 500 VERİYORDU (kullanıcı bildirimi, 2026-08-17).
   *
   * Aday üretimi gövdeyi **UTF-16 kod birimiyle** dilimliyor; emoji iki kod biriminden oluştuğu
   * için dilim sınırı emojinin ortasına düştüğünde ortaya **eşi olmayan surrogate** çıkıyordu.
   * `JSON.stringify` onu `\ud83d` diye kaçırıyor (JSON'da geçerli), ama Postgres jsonb'de
   * eşsiz surrogate'ı REDDEDİYOR: *"Unicode low surrogate must follow a high surrogate."*
   * Sonuç: sorgu patlıyor, uç 500 dönüyor.
   */
  it('⭐ emoji ile birlikte bahsetmek ÇÖKMEZ ve mention çözülür', async () => {
    const m = await chat.send({
      worldId, playerId: ali, body: '@Veli 😀 selam', clientMsgId: uuid(),
    });
    expect(m.mentions.map((x) => x.id)).toEqual([veli]);
  });

  it('emoji mention\'dan ÖNCE gelse de çökmez', async () => {
    const m = await chat.send({
      worldId, playerId: ali, body: '😀 @Veli selam', clientMsgId: uuid(),
    });
    expect(m.mentions.map((x) => x.id)).toEqual([veli]);
  });

  it('yalnız emoji içeren mesaj (mention yok) sorunsuz', async () => {
    const m = await chat.send({ worldId, playerId: ali, body: '😀🎉', clientMsgId: uuid() });
    expect(m.mentions).toEqual([]);
  });

  /* ── Saf yardımcı: aday üretimi (sorguya giden kümenin sınırları) ────────── */
  describe('mentionCandidateNames', () => {
    it('her `@` için ad sınırları arasındaki TÜM alt dizeleri üretir', () => {
      const names = mentionCandidateNames('@Ali selam', 3);
      expect(names).toContain('Ali');
      expect(names).toContain('Ali selam');
      /* En kısa ad 3 karakter → 2 karakterlik dize hiç sorulmaz. */
      expect(names).not.toContain('Al');
    });

    it('`@`den önce harf varsa aday ÜRETMEZ (e-posta / ali@veli)', () => {
      expect(mentionCandidateNames('ali@veli merhaba', 3)).toEqual([]);
    });

    it('⭐ taranan `@` sayısı `max` ile kesilir — maliyet kapısı', () => {
      const cok = mentionCandidateNames('@aaa @bbb @ccc @ddd', 2);
      expect(cok.some((n) => n.startsWith('aaa'))).toBe(true);
      expect(cok.some((n) => n.startsWith('bbb'))).toBe(true);
      expect(cok.some((n) => n.startsWith('ddd'))).toBe(false);
    });

    it('`max: 0` hiç aday üretmez (özellik kapalı)', () => {
      expect(mentionCandidateNames('@Ali', 0)).toEqual([]);
    });

    /**
     * ⭐⭐ SORGUYA GİDEN HER ADAY **İYİ BİÇİMLİ** OLMALI — emojili mention 500'ünün kökü.
     *
     * Aday üretimi UTF-16 kod birimiyle dilimliyor; emoji iki kod birimi olduğu için sınır
     * ortaya düştüğünde eşsiz surrogate doğuyor ve `::jsonb` cast'i onu reddediyor.
     *
     * ⚠️ Hakem BAĞIMSIZ: kaynak taraf düzenli ifade kullanıyor (tip hedefi ES2022 olduğu için
     * `isWellFormed` yok), buradaki ölçüt ise UTF-8 gidiş-dönüşü. İkisi ayrışırsa test patlar.
     * Üstelik bu ölçüt, Postgres sürücüsünün gerçekte yaptığı şeyin aynısı: eşsiz surrogate
     * kodlanamadığı için değiştirme karakterine dönüşür, yani dize kendine eşit kalmaz.
     */
    const iyiBicimli = (s: string): boolean =>
      new TextDecoder().decode(new TextEncoder().encode(s)) === s;

    it('⭐ emoji yarısından bölünen aday ÜRETİLMEZ (eşsiz surrogate)', () => {
      for (const body of ['@dengeci 😀', '@Ali 🎉 selam', '@😀😀😀', '@Veli 👨‍👩‍👧 selam']) {
        const uretilen = mentionCandidateNames(body, 3);
        for (const n of uretilen) {
          expect(iyiBicimli(n), `${body} → ${JSON.stringify(n)}`).toBe(true);
        }
      }
    });

    /** Ölçütün kendisi doğru mu — yoksa yukarıdaki test her şeyi geçirirdi. */
    it('hakem sağlaması: yarım surrogate iyi biçimli SAYILMAZ', () => {
      expect(iyiBicimli('Ali')).toBe(true);
      expect(iyiBicimli('a😀b')).toBe(true);
      expect(iyiBicimli('dengeci \uD83D')).toBe(false);
      expect(iyiBicimli('\uDE00 selam')).toBe(false);
    });
  });
});

/* ══ Yönetici ═══════════════════════════════════════════════════════════════ */

describe('yönetici', () => {
  it('açılış paketi yönetici bayrağını taşır (⋮ menüsü buna göre çiziliyor)', async () => {
    expect((await chat.open({ worldId, playerId: ali })).isStaff).toBe(false);
    await makeStaff(ali);
    expect((await chat.open({ worldId, playerId: ali })).isStaff).toBe(true);
  });

  it('⭐ susturulan YAZAMAZ ama OKUR; kaldırınca yeniden yazar', async () => {
    await chat.send({ worldId, playerId: eru, body: 'ortam', clientMsgId: uuid() });
    await chat.mute({ worldId, adminId: veli, targetId: ali, minutes: null, reason: 'küfür' });

    await expect(chat.send({ worldId, playerId: ali, body: 'selam', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'chat_banned' });
    const packet = await chat.open({ worldId, playerId: ali });
    expect(packet.canWrite).toBe(false);
    expect(packet.reason).toBe('banned');
    expect((await chat.history({ worldId, playerId: ali })).items).toHaveLength(1);

    await chat.unmute({ worldId, targetId: ali });
    const m = await chat.send({ worldId, playerId: ali, body: 'geri döndüm', clientMsgId: uuid() });
    expect(m.id).toBeGreaterThan(0);
  });

  it('susturulmamış oyuncunun susturması kaldırılmaya çalışılırsa reddedilir', async () => {
    await expect(chat.unmute({ worldId, targetId: ali }))
      .rejects.toMatchObject({ code: 'not_muted' });
  });

  it('⭐⭐ KAPSAM YALITIMI: `global` yasak ÖZEL MESAJI kapatmaz, `all` kapatır', async () => {
    await chat.mute({ worldId, adminId: veli, targetId: ali, minutes: null, reason: 'genel' });

    /* Genel sohbet kapalı… */
    await expect(chat.send({ worldId, playerId: ali, body: 'selam', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'chat_banned' });
    /* …ama özel mesaj AÇIK. Bu ayrımı `assertNotBanned(…, 'other')` sağlıyor. */
    const channelId = await dm.openConversation({ worldId, playerId: ali, withPlayerId: eru });
    await acceptChatTerms(h, channelId);
    const ozel = await dm.send({ worldId, playerId: ali, channelId, body: 'ozel', clientMsgId: uuid() });
    expect(ozel.id).toBeGreaterThan(0);

    /* Kapsam `all` olunca ikisi de kapanır. */
    await h.db.execute(sql`
      INSERT INTO chat_bans (world_id, player_id, scope, reason, created_by)
      VALUES (${worldId}, ${ali}, 'all', 'her yerde', ${veli})
    `);
    await expect(dm.send({ worldId, playerId: ali, channelId, body: 'yine', clientMsgId: uuid() }))
      .rejects.toMatchObject({ code: 'chat_banned' });
  });

  it('mesaj silinince geçmişten düşer ama SATIR durur (denetim izi)', async () => {
    const m = await chat.send({ worldId, playerId: ali, body: 'silinecek', clientMsgId: uuid() });
    await chat.deleteMessage({ worldId, adminId: veli, messageId: m.id });

    expect((await chat.history({ worldId, playerId: eru })).items).toHaveLength(0);
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT deleted_at, deleted_by FROM chat_messages WHERE id = ${m.id}
    `);
    expect(row!['deleted_at']).not.toBeNull();
    expect(Number(row!['deleted_by'])).toBe(veli);

    /* Aynı mesaj ikinci kez silinemez — istemciye "bulunamadı" döner. */
    await expect(chat.deleteMessage({ worldId, adminId: veli, messageId: m.id }))
      .rejects.toMatchObject({ code: 'conversation_not_found' });
  });
});

/* ══ `@` öneri ucu ══════════════════════════════════════════════════════════ */

describe('öneri ucu', () => {
  it('2 karakterden kısa sorgu BOŞ döner (dünyayı taramanın anlamı yok)', async () => {
    expect(await chat.suggest({ worldId, playerId: ali, q: 'a' })).toEqual([]);
    expect(await chat.suggest({ worldId, playerId: ali, q: '' })).toEqual([]);
  });

  it('önek eşleşir, harf büyüklüğüne duyarsızdır', async () => {
    const found = await chat.suggest({ worldId, playerId: ali, q: 'er' });
    expect(found.map((x) => x.username)).toEqual(['Eru Ilúvatar']);
  });

  it('`suggestLimit` sonucu bağlar', async () => {
    live({ suggestLimit: 1 });
    for (const n of ['Testa', 'Testb', 'Testc']) {
      const p = await createPlayer(h, worldId, 'x');
      await rename(p, n);
    }
    expect(await chat.suggest({ worldId, playerId: ali, q: 'test' })).toHaveLength(1);
  });

  it('joker karakterler kaçırılır — `%` her şeyi eşleştirmez', async () => {
    expect(await chat.suggest({ worldId, playerId: ali, q: '%%' })).toEqual([]);
  });
});

/* ══ Olay ve bildirim eşlemesi ══════════════════════════════════════════════ */

describe('olay ve bildirim', () => {
  it('⭐ olay YALNIZ kanal odasına gider — `playerIds` boş, `chatChannelId` dolu', async () => {
    await chat.send({ worldId, playerId: ali, body: 'selam', clientMsgId: uuid() });
    const [row] = await outboxRows('chat:global');
    const payload = row!['payload'] as Record<string, unknown>;

    const ev = eventForOutbox('chat:global', payload, worldId);
    expect(ev).toMatchObject({ topic: 'chat:global', playerIds: [] });
    expect(ev!.chatChannelId).toBe(Number(payload['channelId']));
  });

  it('bahsetme bildirimi yalnız ANILANA gider, GÖNDERENE gitmez', async () => {
    await chat.send({ worldId, playerId: ali, body: '@Veli @Ali bak', clientMsgId: uuid() });
    const [row] = await outboxRows('chat:global');
    const payload = row!['payload'] as Record<string, unknown>;

    const notes = notificationForOutbox('chat:global', payload, worldId);
    expect(notes.map((n) => n.playerId)).toEqual([veli]);
    expect(notes[0]).toMatchObject({ category: 'mention', title: 'Genel sohbet' });
    /* ⭐ `channelId` GÖNDERİLİYOR: istemci "bu benim açık odam mı" diye buna bakıp toast'ı bastırıyor. */
    expect(notes[0]!.channelId).toBe(Number(payload['channelId']));
  });

  it('bahsetmesiz mesaj HİÇ bildirim üretmez', async () => {
    await chat.send({ worldId, playerId: ali, body: 'sadece selam', clientMsgId: uuid() });
    const [row] = await outboxRows('chat:global');
    expect(notificationForOutbox('chat:global', row!['payload'] as Record<string, unknown>, worldId))
      .toEqual([]);
  });

  it('silme olayı odaya gider ama BİLDİRİM ÜRETMEZ', async () => {
    const m = await chat.send({ worldId, playerId: ali, body: 'silinecek', clientMsgId: uuid() });
    await chat.deleteMessage({ worldId, adminId: veli, messageId: m.id });
    const [row] = await outboxRows('chat:global:deleted');
    const payload = row!['payload'] as Record<string, unknown>;

    expect(eventForOutbox('chat:global:deleted', payload, worldId)).toMatchObject({
      topic: 'chat:global:deleted', playerIds: [],
    });
    expect(notificationForOutbox('chat:global:deleted', payload, worldId)).toEqual([]);
  });
});
