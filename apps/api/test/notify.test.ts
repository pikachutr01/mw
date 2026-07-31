/**
 * ⭐ BİLDİRİM KATMANI (§7.2) — kullanıcının çekirdek şartının testi:
 *
 *   > *"Push sisteminin en önemli özelliği ws bağlı iken bildirim gelmemesi gerekir."*
 *
 * Ölçülen davranışlar: katalog metinleri (dört kategori) · **çevrimiçi → toast, push YOK** ·
 * çevrimdışı → push, toast YOK · kategori kapalıysa ikisi de yok · 410 dönen abonelik SİLİNİR ·
 * ardışık hatada abonelik düşer · üretim birleştirmesi · başlık/gövde sınırı · savaşın iki
 * tarafa iki farklı metni · `message:written`'da savaş raporunun ATLANMASI.
 *
 * ⚠️ Push gönderici `vi.mock` ile DEĞİL, constructor'a geçirilen bellek-içi implementasyonla
 * taklit ediliyor (`outbox.test.ts`'teki sink emsali) — projede mock kullanılmıyor.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/db/client.ts';
import { notificationForOutbox } from '../src/notify/notify.catalog.ts';
import { notifyLimits } from '../src/notify/notify.limits.ts';
import {
  NotifyService, PushGoneError, type PushSender, type PushSubscriptionInput,
} from '../src/notify/notify.service.ts';
import type { RealtimeEvent } from '../src/realtime/realtime.bus.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let ali: number;
let veli: number;

/** Yayınlanan WS olaylarını toplayan sahte bus (yalnız `publish` gerekiyor). */
class FakeBus {
  readonly events: RealtimeEvent[] = [];
  async publish(event: RealtimeEvent): Promise<void> { this.events.push(event); }
}

/** Bellek-içi push gönderici; `fail` ile hata yolları taklit edilir. */
class FakeSender implements PushSender {
  readonly sent: { endpoint: string; payload: Record<string, unknown> }[] = [];
  fail: ((endpoint: string) => Error | null) | null = null;

  async send(sub: PushSubscriptionInput, payload: string): Promise<void> {
    const err = this.fail?.(sub.endpoint);
    if (err) throw err;
    this.sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) as Record<string, unknown> });
  }
}

function build(o: { online?: number[]; sender?: PushSender | null } = {}): {
  service: NotifyService; bus: FakeBus;
} {
  const bus = new FakeBus();
  const online = new Set(o.online ?? []);
  const service = new NotifyService(h.db, {
    bus: bus as unknown as never,
    isOnline: (playerId) => online.has(playerId),
    sender: o.sender === undefined ? new FakeSender() : o.sender,
  });
  return { service, bus };
}

/**
 * Oyuncunun hesabına bir tarayıcı aboneliği ekler ve KULLANILAN endpoint'i döndürür.
 *
 * ⚠️ Endpoint küresel benzersiz (tasarım gereği: bir uç = bir tarayıcı) ve `push_subscriptions`
 * satırları testler arasında silinmiyor (hesaplar da silinmiyor) → sabit bir dize ikinci koşuda
 * tekillik kısıtına çarpar. Her çağrı kendi jetonunu üretir.
 */
async function subscribe(playerId: number, label: string): Promise<string> {
  const endpoint = `https://push.test/${label}-${randomUUID().slice(0, 8)}`;
  const [row] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT account_id FROM players WHERE id = ${playerId}
  `);
  await h.db.execute(sql`
    INSERT INTO push_subscriptions (account_id, endpoint, p256dh, auth)
    VALUES (${Number(row!['account_id'])}, ${endpoint}, 'test-p256dh', 'test-auth')
  `);
  return endpoint;
}

async function subCount(playerId: number): Promise<number> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT COUNT(*)::int AS n FROM push_subscriptions s
      JOIN players p ON p.account_id = s.account_id WHERE p.id = ${playerId}
  `);
  return Number(rows[0]?.['n'] ?? 0);
}

beforeAll(async () => { h = await setupTestDb(); }, 60_000);
afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  ali = await createPlayer(h, worldId, 'notify-ali');
  veli = await createPlayer(h, worldId, 'notify-veli');
});

/* ── Katalog: outbox satırı → insan metni ─────────────────────────────────────── */

describe('notify.catalog', () => {
  const now = new Date('2026-07-31T12:00:00.000Z');

  it('gelen saldırıda birim dökümünü ve göreli varış süresini yazar', () => {
    const [note] = notificationForOutbox('city:incoming_attack', {
      missionId: 7, defenderPlayerId: 42, targetCityId: 3,
      originCoordinates: { k: 1, d: 45, s: 7 },
      arrivesAt: '2026-07-31T12:23:00.000Z',
      units: { dwarf: 3000, elf: 20 }, heroCount: 2,
    }, 1, now);

    expect(note?.playerId).toBe(42);
    expect(note?.category).toBe('attack');
    expect(note?.title).toBe('Saldırı geliyor!');
    expect(note?.body).toContain("1:45:7'den");
    expect(note?.body).toContain('3.000');       // tr-TR binlik ayracı
    expect(note?.body).toContain('23 dk sonra');
    expect(note?.tag).toBe('attack:7');
    expect(note?.url).toBe('/armies');
  });

  it('casus kuş sayısını yazar', () => {
    const [note] = notificationForOutbox('city:incoming_spy', {
      missionId: 9, defenderPlayerId: 42, originCoordinates: { k: 2, d: 5, s: 1 },
      arrivesAt: '2026-07-31T14:00:00.000Z', birds: 12,
    }, 1, now);
    expect(note?.title).toBe('Casus kuş geliyor!');
    expect(note?.body).toContain('12 Casus Kuş');
    expect(note?.body).toContain('2 sa sonra');
  });

  it('DM bildirimi YALNIZ alıcıya gider ve derin bağlantı taşır', () => {
    const notes = notificationForOutbox('chat:dm', {
      channelId: 5, messageId: 11, senderId: 1, senderName: 'Ayla',
      recipientId: 2, preview: 'yarın saldırıyor muyuz',
    }, 1, now);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.playerId).toBe(2);        // gönderene bildirim YOK
    expect(notes[0]?.title).toBe('Ayla');
    expect(notes[0]?.body).toBe('yarın saldırıyor muyuz');
    expect(notes[0]?.url).toBe('/messages?dm=1');
  });

  it('savaş İKİ tarafa İKİ FARKLI metin üretir', () => {
    const notes = notificationForOutbox('battle:resolved', {
      battleId: 3, attackerPlayerId: 1, defenderPlayerId: 2, winner: 'attacker',
    }, 1, now);
    expect(notes).toHaveLength(2);
    expect(notes[0]?.playerId).toBe(1);
    expect(notes[0]?.body).toContain('başarılı');
    expect(notes[1]?.playerId).toBe(2);
    expect(notes[1]?.body).toContain('Savunma çöktü');
    // Aynı savaş, aynı tag → bildirim merkezinde iki satır birikmez.
    expect(notes[0]?.tag).toBe(notes[1]?.tag);
  });

  it('message:written savaş raporunu ATLAR (battle:resolved zaten üretti)', () => {
    expect(notificationForOutbox('message:written', { playerId: 1, kind: 'battle_report' }, 1)).toEqual([]);
    const [invite] = notificationForOutbox('message:written', {
      playerId: 1, kind: 'alliance_invite',
    }, 1);
    expect(invite?.title).toBe('İttifak daveti');
    expect(invite?.category).toBe('report');
  });

  it('üretim bitişlerini Türkçe adla yazar (iki farklı savunma şekli dâhil)', () => {
    const [building] = notificationForOutbox('city:building_finished', {
      cityId: 1, playerId: 5, type: 'barracks', level: 7,
    }, 1);
    expect(building?.category).toBe('production');
    expect(building?.body).toContain('seviye 7');
    expect(building?.body).not.toContain('barracks');   // ekranda ham id görünmez (§13.14)

    const [units] = notificationForOutbox('city:units_finished', {
      cityId: 1, playerId: 5, produced: { dwarf: 150 },
    }, 1);
    expect(units?.title).toBe('Üretim tamamlandı');
    expect(units?.url).toBe('/barracks');

    // Sur/Büyü Kalkanı aynı topic'i `produced` OLMADAN yazar → seviye dalına düşer.
    const [wall] = notificationForOutbox('city:defense_finished', {
      cityId: 1, playerId: 5, type: 'wall', level: 3,
    }, 1);
    expect(wall?.body).toContain('seviye 3');
  });

  it('bildirim üretmeyen olaylar boş dizi döndürür', () => {
    for (const topic of ['mission:completed', 'city:army_returned', 'city:changed', 'ranking:updated']) {
      expect(notificationForOutbox(topic, { playerId: 1 }, 1)).toEqual([]);
    }
  });

  it('başlık ve gövdeyi sınırda keser', () => {
    const [note] = notificationForOutbox('chat:dm', {
      recipientId: 2, senderId: 1, senderName: 'A'.repeat(200), preview: 'b'.repeat(400),
    }, 1);
    expect(note!.title.length).toBeLessThanOrEqual(notifyLimits().titleMax);
    expect(note!.body.length).toBeLessThanOrEqual(notifyLimits().bodyMax);
  });
});

/* ── Teslim: tek dallanma noktası ─────────────────────────────────────────────── */

describe('NotifyService.deliver', () => {
  const note = (playerId: number, category = 'dm' as const) => ([{
    playerId, worldId, category, title: 'Ayla', body: 'selam',
    url: '/messages', tag: `dm:${playerId}`,
  }]);

  it('⭐ oyuncu ÇEVRİMİÇİYKEN toast gider, push GİTMEZ', async () => {
    await subscribe(ali, 'ali');
    const sender = new FakeSender();
    const { service, bus } = build({ online: [ali], sender });

    await service.deliver(note(ali));

    expect(bus.events).toHaveLength(1);
    expect(bus.events[0]?.topic).toBe('notify:show');
    expect(bus.events[0]?.playerIds).toEqual([ali]);
    expect(bus.events[0]?.ref?.['title']).toBe('Ayla');
    expect(sender.sent).toHaveLength(0);          // ← kullanıcının çekirdek şartı
  });

  it('⭐ oyuncu ÇEVRİMDIŞIYKEN push gider, toast GİTMEZ', async () => {
    await subscribe(ali, 'ali');
    const sender = new FakeSender();
    const { service, bus } = build({ online: [], sender });

    await service.deliver(note(ali));

    expect(bus.events).toHaveLength(0);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.payload['title']).toBe('Ayla');
    expect(sender.sent[0]?.payload['url']).toBe('/messages');
  });

  it('aynı hesabın İKİ tarayıcısına da gider', async () => {
    await subscribe(ali, 'ali-1');
    await subscribe(ali, 'ali-2');
    const sender = new FakeSender();
    await build({ sender }).service.deliver(note(ali));
    expect(sender.sent).toHaveLength(2);
  });

  it('kategori kapalıysa NE toast NE push gider', async () => {
    await subscribe(ali, 'ali');
    const sender = new FakeSender();
    const { service, bus } = build({ online: [ali], sender });

    await h.db.execute(sql`
      UPDATE accounts SET notify_prefs = '{"dm": false}'::jsonb
       WHERE id = (SELECT account_id FROM players WHERE id = ${ali})
    `);
    await service.deliver(note(ali));
    expect(bus.events).toHaveLength(0);
    expect(sender.sent).toHaveLength(0);

    // Başka bir kategori etkilenmez — eksik anahtar varsayılana düşer.
    await service.deliver(note(ali, 'attack'));
    expect(bus.events).toHaveLength(1);
  });

  it('aboneliği olmayan çevrimdışı oyuncuda sessizce hiçbir şey olmaz', async () => {
    const sender = new FakeSender();
    await build({ sender }).service.deliver(note(veli));
    expect(sender.sent).toHaveLength(0);
  });

  /* ── Ölü abonelik temizliği ────────────────────────────────────────────────── */

  it('⭐ push servisi 410 dönerse abonelik ANINDA silinir', async () => {
    await subscribe(ali, 'gone');
    const sender = new FakeSender();
    sender.fail = () => new PushGoneError(410);

    await build({ sender }).service.deliver(note(ali));
    expect(await subCount(ali)).toBe(0);
  });

  it('geçici hatada sayaç artar, eşikte abonelik düşer', async () => {
    await subscribe(ali, 'flaky');
    const sender = new FakeSender();
    sender.fail = () => new Error('503 push servisi meşgul');
    const { service } = build({ sender });

    for (let i = 0; i < notifyLimits().maxFailures - 1; i += 1) await service.deliver(note(ali));
    expect(await subCount(ali)).toBe(1);           // henüz eşiğe gelmedi

    await service.deliver(note(ali));
    expect(await subCount(ali)).toBe(0);
  });

  it('başarılı gönderim hata sayacını sıfırlar', async () => {
    const endpoint = await subscribe(ali, 'recover');
    const sender = new FakeSender();
    sender.fail = () => new Error('geçici');
    const { service } = build({ sender });
    await service.deliver(note(ali));

    sender.fail = null;
    await service.deliver(note(ali));

    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT fail_count FROM push_subscriptions WHERE endpoint = ${endpoint}
    `);
    expect(Number(row!['fail_count'])).toBe(0);
  });

  /* ── Üretim birleştirmesi ──────────────────────────────────────────────────── */

  it('üretim push\'ları pencerede birleşir, toast birleşmez', async () => {
    await subscribe(ali, 'prod');
    const sender = new FakeSender();
    const production = [{
      playerId: ali, worldId, category: 'production' as const,
      title: 'Üretim tamamlandı', body: '150 Cüce hazır.', url: '/barracks', tag: `prod:${ali}`,
    }];

    const offline = build({ sender });
    await offline.service.deliver(production);
    await offline.service.deliver(production);
    await offline.service.deliver(production);
    expect(sender.sent).toHaveLength(1);           // ← kilitli telefona üç bildirim düşmez

    const onlineRun = build({ online: [ali], sender });
    await onlineRun.service.deliver(production);
    await onlineRun.service.deliver(production);
    expect(onlineRun.bus.events).toHaveLength(2);  // uygulama açıkken her biri görünür
  });

  it('gönderici yoksa (VAPID anahtarsız) çevrimdışı teslim sessizce atlanır', async () => {
    await subscribe(ali, 'nokeys');
    const { service, bus } = build({ sender: null });
    await service.deliver(note(ali));
    expect(bus.events).toHaveLength(0);
  });
});

/* ── Tercihler ───────────────────────────────────────────────────────────────── */

describe('NotifyService.prefs', () => {
  it('varsayılanlar AÇIK; kısmî güncelleme diğerlerini bozmaz', async () => {
    const { service } = build();
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT account_id FROM players WHERE id = ${ali}
    `);
    const accountId = Number(row!['account_id']);

    expect(await service.prefs(accountId)).toEqual({
      attack: true, dm: true, report: true, production: true,
    });

    await service.setPrefs(accountId, { production: false });
    expect(await service.prefs(accountId)).toEqual({
      attack: true, dm: true, report: true, production: false,
    });

    await service.setPrefs(accountId, { dm: false });
    const after = await service.prefs(accountId);
    expect(after.production).toBe(false);          // önceki yazım korunur (jsonb birleştirme)
    expect(after.dm).toBe(false);
  });

  it('aynı endpoint ikinci kez abone olunca satır ÇOĞALMAZ, tazelenir', async () => {
    const { service } = build();
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT account_id FROM players WHERE id = ${veli}
    `);
    const accountId = Number(row!['account_id']);
    const sub = {
      endpoint: `https://push.test/dup-${randomUUID().slice(0, 8)}`,
      keys: { p256dh: 'a', auth: 'b' },
    };

    await service.subscribe({ accountId, sub });
    await service.subscribe({ accountId, sub: { ...sub, keys: { p256dh: 'yeni', auth: 'yeni' } } });

    expect(await subCount(veli)).toBe(1);
    const [stored] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT p256dh FROM push_subscriptions WHERE endpoint = ${sub.endpoint}
    `);
    expect(stored!['p256dh']).toBe('yeni');

    await service.unsubscribe(accountId, sub.endpoint);
    expect(await subCount(veli)).toBe(0);
  });
});
