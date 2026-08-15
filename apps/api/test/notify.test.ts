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
import { notifyLimits, type NotifyCategory } from '../src/notify/notify.limits.ts';
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
  /** Kaynak → hedef güzergâhı; bildirim gövdelerinin TEK veri kaynağı. */
  const route = {
    origin: { k: 2, d: 5, s: 1, name: 'Karakule' },
    target: { k: 1, d: 45, s: 7, name: 'Çığlıktepe' },
  };

  /**
   * ⭐ KALKIŞ UYARISI: detay YOK, push YOK (kullanıcı 2026-08-07).
   *
   * ⚠️ Bu test eskiden tam TERSİNİ kilitliyordu — birim dökümünü ve "23 dk sonra"yı
   * bekliyordu. Kural değişti: gövde yalnız hedef şehri yazar.
   */
  it('gelen saldırı uyarısı yalnız hedef şehri yazar ve push ATMAZ', () => {
    const [note] = notificationForOutbox('city:incoming_attack', {
      missionId: 7, defenderPlayerId: 42, targetCityId: 3,
      originCoordinates: { k: 2, d: 5, s: 1 },
      targetCity: { k: 1, d: 45, s: 7, name: 'Çığlıktepe' },
      arrivesAt: '2026-07-31T12:23:00.000Z',
      units: { dwarf: 3000, elf: 20 }, heroCount: 2,
    }, 1);

    expect(note?.playerId).toBe(42);
    expect(note?.category).toBe('attack');
    expect(note?.title).toBe('Saldırı geliyor!');
    expect(note?.body).toBe('Çığlıktepe (1:45:7)');
    expect(note?.push).toBe(false);
    expect(note?.tag).toBe('attack:7');
    expect(note?.url).toBe('/armies');
  });

  it('gelen casusluk uyarısı da sade ve push’suz', () => {
    const [note] = notificationForOutbox('city:incoming_spy', {
      missionId: 9, defenderPlayerId: 42, originCoordinates: { k: 2, d: 5, s: 1 },
      targetCity: { k: 1, d: 45, s: 7, name: 'Çığlıktepe' },
      arrivesAt: '2026-07-31T14:00:00.000Z', birds: 12,
    }, 1);
    expect(note?.title).toBe('Casus kuş geliyor!');
    expect(note?.body).toBe('Çığlıktepe (1:45:7)');
    expect(note?.push).toBe(false);
  });

  /**
   * ⭐ Hiçbir gövdede süre ifadesi kalmadı — `inWords()` silindi. Bu test o silmenin
   * geri sızmasını engelliyor: yeni bir dal "2 sa sonra" yazmaya kalkarsa kırmızı olur.
   */
  it('HİÇBİR bildirim gövdesinde göreli süre ifadesi yok', () => {
    const rows: [string, Record<string, unknown>][] = [
      ['city:incoming_attack', {
        defenderPlayerId: 1, targetCity: route.target, arrivesAt: '2026-07-31T14:00:00.000Z',
        units: { dwarf: 10 }, heroCount: 1,
      }],
      ['city:incoming_spy', {
        defenderPlayerId: 1, targetCity: route.target, arrivesAt: '2026-07-31T14:00:00.000Z', birds: 5,
      }],
      ['mission:sent', { type: 'transport', ownerPlayerId: 1, targetPlayerId: 2, originCity: route.origin }],
      ['battle:resolved', { battleId: 1, attackerPlayerId: 1, defenderPlayerId: 2, winner: 'attacker', route }],
      ['message:written', { playerId: 1, kind: 'transport_report', side: 'receiver', route }],
      ['cave:returned', { playerId: 1, cityId: 3, city: route.target }],
      ['merit:granted', { playerId: 1, promoted: true, name: 'Subay', tier: 1 }],
    ];
    for (const [topic, payload] of rows) {
      for (const note of notificationForOutbox(topic, payload, 1)) {
        expect(note.body, `${topic} gövdesi`).not.toMatch(/birazdan|dk sonra|sa sonra/);
      }
    }
  });

  it('DM bildirimi YALNIZ alıcıya gider ve derin bağlantı taşır', () => {
    const notes = notificationForOutbox('chat:dm', {
      channelId: 5, messageId: 11, senderId: 1, senderName: 'Ayla',
      recipientId: 2, preview: 'yarın saldırıyor muyuz',
    }, 1);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.playerId).toBe(2);        // gönderene bildirim YOK
    expect(notes[0]?.title).toBe('Ayla');
    expect(notes[0]?.body).toBe('yarın saldırıyor muyuz');
    expect(notes[0]?.url).toBe('/messages?dm=1');
  });

  /**
   * ⭐ AÇIK PENCEREYİ SUSTURMANIN SUNUCU AYAĞI (kullanıcı, 2026-08-09): *"mesaj atan kişinin
   * sohbet penceresi açıksa bu notify çıkmasın"*. Kararı istemci veriyor (`suppressToast`)
   * ama karşılaştıracağı kanal kimliğini sunucu göndermek zorunda.
   *
   * ⚠️ İstemci bunu `tag`ten ("dm:5") ayrıştırmıyor — etiketin biçimi değişse bastırma
   * **sessizce** çalışmayı bırakırdı. Alan açık, bu test de onun gitmeye devam ettiğinin bekçisi.
   */
  it('⭐ DM bildirimi sohbet KANAL KİMLİĞİNİ taşır (açık pencereyi susturmak için)', () => {
    const [note] = notificationForOutbox('chat:dm', {
      channelId: 5, messageId: 11, senderId: 1, senderName: 'Ayla',
      recipientId: 2, preview: 'selam',
    }, 1);
    expect(note?.channelId).toBe(5);
  });

  /** ⚠️ Kanal bilinmiyorsa alan HİÇ gitmez → istemci bastırmaz, toast çıkar (güvenli yön). */
  it('kanal kimliği yoksa alan gönderilmez', () => {
    const [note] = notificationForOutbox('chat:dm', {
      messageId: 11, senderId: 1, senderName: 'Ayla', recipientId: 2, preview: 'selam',
    }, 1);
    expect(note?.channelId).toBeUndefined();
  });

  /** ⚠️ DM DIŞI bildirimler bu alanı taşımaz: bastırma yalnız sohbete özgü bir kural. */
  it('DM olmayan bildirimlerde kanal kimliği yok', () => {
    const [note] = notificationForOutbox('city:incoming_attack', {
      defenderPlayerId: 2, targetCity: route.target,
      arrivesAt: '2026-07-31T14:00:00.000Z', units: { dwarf: 10 },
    }, 1);
    expect(note?.channelId).toBeUndefined();
  });

  /**
   * ⭐ SALDIRININ ASIL BİLDİRİMİ: kalkışta susan sistem varışta konuşuyor. Başlık
   * kazanan/kaybeden, gövde ise güzergâhın oyuncuyu ilgilendiren UCU — saldıran hedefi,
   * savunan saldırganı görür. Uçların takas edilmesi en olası regresyon, test onu ölçüyor.
   */
  it('savaş İKİ tarafa İKİ FARKLI metin üretir ve güzergâhın DOĞRU ucunu yazar', () => {
    const notes = notificationForOutbox('battle:resolved', {
      battleId: 3, attackerPlayerId: 1, defenderPlayerId: 2, winner: 'attacker', route,
    }, 1);
    expect(notes).toHaveLength(2);
    expect(notes[0]?.playerId).toBe(1);
    expect(notes[0]?.title).toBe('Savaşı kazandın');
    expect(notes[0]?.body).toBe('Çığlıktepe (1:45:7)');       // vurduğu şehir
    expect(notes[1]?.playerId).toBe(2);
    expect(notes[1]?.title).toBe('Savunmayı kaybettin');
    expect(notes[1]?.body).toBe('Karakule (2:5:1)');          // saldırı nereden geldi
    // Savaş sonucu artık `report` değil `attack` kategorisinde (tek anahtar, §Seçenekler).
    expect(notes[0]?.category).toBe('attack');
    // Aynı savaş, aynı tag → bildirim merkezinde iki satır birikmez.
    expect(notes[0]?.tag).toBe(notes[1]?.tag);
    // Sonuç bildirimi push ATAR — kalkış uyarısının tersi.
    expect(notes[0]?.push).toBeUndefined();
  });

  it('savunan püskürtürse başlıklar tersine döner', () => {
    const notes = notificationForOutbox('battle:resolved', {
      battleId: 4, attackerPlayerId: 1, defenderPlayerId: 2, winner: 'defender', route,
    }, 1);
    expect(notes[0]?.title).toBe('Savaşı kaybettin');
    expect(notes[1]?.title).toBe('Saldırıyı püskürttün');
  });

  it('message:written savaş raporunu ATLAR (battle:resolved zaten üretti)', () => {
    expect(notificationForOutbox('message:written', { playerId: 1, kind: 'battle_report' }, 1)).toEqual([]);
    const [invite] = notificationForOutbox('message:written', {
      playerId: 1, kind: 'alliance_invite',
    }, 1);
    expect(invite?.title).toBe('İttifak daveti');
    expect(invite?.category).toBe('report');
  });

  /**
   * ⭐ `kind:side` ayrımı — turun ana kazanımlarından biri. Eskiden İKİ TARAF DA
   * "Casusluk raporu · Rapor mesaj kutunda." görüyordu; casuslanan oyuncu kendisine mi
   * casusluk yapıldığını yoksa kendisinin mi casusluk yaptığını ayırt edemiyordu.
   */
  it('casusluk raporu gönderen ve hedef için AYRI başlık ve AYRI uç yazar', () => {
    const [sender] = notificationForOutbox('message:written', {
      playerId: 1, kind: 'spy_report', side: 'spy', route,
    }, 1);
    expect(sender?.title).toBe('Casusluk raporu');
    expect(sender?.body).toBe('Çığlıktepe (1:45:7)');
    expect(sender?.category).toBe('attack');

    const [target] = notificationForOutbox('message:written', {
      playerId: 2, kind: 'spy_report', side: 'target', route,
    }, 1);
    expect(target?.title).toBe('Casusluk önleme raporu');
    expect(target?.body).toBe('Karakule (2:5:1)');
  });

  it('nakliyenin alıcı ve gönderen kopyası farklı metin alır', () => {
    const [receiver] = notificationForOutbox('message:written', {
      playerId: 1, kind: 'transport_report', side: 'receiver', route,
    }, 1);
    expect(receiver?.title).toBe('Nakliye ulaştı');
    expect(receiver?.body).toBe('Karakule (2:5:1)');
    expect(receiver?.category).toBe('report');

    const [sender] = notificationForOutbox('message:written', {
      playerId: 2, kind: 'transport_report', side: 'sender', route,
    }, 1);
    expect(sender?.title).toBe('Nakliyen ulaştı');
    expect(sender?.body).toBe('Çığlıktepe (1:45:7)');
  });

  /** `outcome` basamağının tek var oluş sebebi: aynı `kind`+`side`, iki farklı sonuç. */
  it('şehir kurma başarı ve başarısızlığı farklı başlık üretir', () => {
    const [ok] = notificationForOutbox('message:written', {
      playerId: 1, kind: 'found_city_report', side: 'owner', outcome: 'ok', route,
    }, 1);
    expect(ok?.title).toBe('Yeni şehir kuruldu');

    const [fail] = notificationForOutbox('message:written', {
      playerId: 1, kind: 'found_city_report', side: 'owner', outcome: 'fail',
      // Boş koordinata kuruluşta hedefin ADI yok — gövde çıplak koordinat yazar.
      route: { origin: route.origin, target: { k: 3, d: 7, s: 2 } },
    }, 1);
    expect(fail?.title).toBe('Şehir kurulamadı');
    expect(fail?.body).toBe('3:7:2');
  });

  /**
   * ⭐ Nakliye kalkışı — kalkışta haber veren TEK sefer tipi. Kapı tip değil ALICI
   * üzerinden: kendi şehrine nakliyede kimse kendi eylemini kendinden duymamalı.
   */
  it('nakliye kalkışı yalnız BAŞKA oyuncuya giderken bildirim üretir', () => {
    const [note] = notificationForOutbox('mission:sent', {
      missionId: 12, type: 'transport', ownerPlayerId: 1, targetPlayerId: 2,
      originCity: route.origin,
    }, 1);
    expect(note?.playerId).toBe(2);
    expect(note?.title).toBe('Sana nakliye yolda');
    expect(note?.body).toBe('Karakule (2:5:1)');

    // Kendi şehrine nakliye → sessiz.
    expect(notificationForOutbox('mission:sent', {
      missionId: 13, type: 'transport', ownerPlayerId: 1, targetPlayerId: 1,
      originCity: route.origin,
    }, 1)).toEqual([]);

    // Saldırı/casusluk/destek kalkışı bu konudan bildirim üretmez.
    for (const type of ['attack', 'spy', 'support', 'found_city']) {
      expect(notificationForOutbox('mission:sent', {
        missionId: 14, type, ownerPlayerId: 1, targetPlayerId: 2, originCity: route.origin,
      }, 1)).toEqual([]);
    }
  });

  it('mağara dönüşü bildirim üretir, city:changed hâlâ üretmez', () => {
    const [note] = notificationForOutbox('cave:returned', {
      playerId: 5, cityId: 9, city: route.target,
    }, 1);
    expect(note?.title).toBe('Ordun mağaradan döndü');
    expect(note?.body).toBe('Çığlıktepe (1:45:7)');
    expect(note?.url).toBe('/barracks');
    expect(notificationForOutbox('city:changed', {
      cityId: 9, playerId: 5, reason: 'cave_collapsed_return',
    }, 1)).toEqual([]);
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
  /** ⚠️ `= 'dm' as const` varsayılanı tipi TEK değere kilitliyordu; çağıranlar 'attack' da
   *     geçiyor. Doğrusu varsayılanı korumak ama tipi kategori birliğine açmak. */
  const note = (playerId: number, category: NotifyCategory = 'dm') => ([{
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

  /**
   * ⭐⭐ TURUN ASIL BEKÇİSİ (kullanıcı 2026-08-07): saldırı/casusluk KALKIŞ uyarısı
   * çevrimdışı oyuncuya push atmaz — "ani saldırı" gölgelenmesin.
   *
   * ⚠️ Kapının `deliverOne`da toast dalının ALTINDA durması şart; üste taşınırsa aşağıdaki
   * ikinci test kırmızıya döner. İkisi birlikte kapının yerini kilitliyor.
   */
  it('⭐ push:false uyarı ÇEVRİMDIŞIYA hiçbir şey göndermez', async () => {
    await subscribe(ali, 'ali');
    const sender = new FakeSender();
    const { service, bus } = build({ online: [], sender });

    await service.deliver([{ ...note(ali, 'attack')[0]!, push: false }]);

    expect(sender.sent).toHaveLength(0);
    expect(bus.events).toHaveLength(0);
  });

  it('⭐ push:false uyarı ÇEVRİMİÇİ oyuncuya toast olarak yine gider', async () => {
    await subscribe(ali, 'ali');
    const sender = new FakeSender();
    const { service, bus } = build({ online: [ali], sender });

    await service.deliver([{ ...note(ali, 'attack')[0]!, push: false }]);

    expect(bus.events).toHaveLength(1);
    expect(bus.events[0]?.topic).toBe('notify:show');
    expect(sender.sent).toHaveLength(0);
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

    /**
     * ⚠️ Liste `NOTIFY_DEFAULTS` ile birebir olmak ZORUNDA — bu bir bekçi testi: yeni bir
     * kategori eklenince burası kırmızı yanar ve `NotifySettings.tsx`teki anahtarı da
     * eklemeyi hatırlatır. (`mention` 2026-08-07'de tam olarak böyle yakalandı.)
     */
    expect(await service.prefs(accountId)).toEqual({
      attack: true, dm: true, report: true, production: true, mention: true,
      /** ⭐ Destek talebine yönetici yanıtı (2026-08-14) — `mention` gibi GÖÇSÜZ eklendi. */
      ticket: true,
    });

    await service.setPrefs(accountId, { production: false });
    expect(await service.prefs(accountId)).toEqual({
      attack: true, dm: true, report: true, production: false, mention: true, ticket: true,
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
