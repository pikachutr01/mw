/**
 * ⭐ ÇOKLU HESAP BAĞLANTI ANALİZİ (§9.1, Tur 7).
 *
 * Bu dosyanın asıl derdi **yanlış pozitif**. Sinyalin çalıştığını göstermek kolay; zor olan
 * ve gerçekten test edilmesi gereken şey, sistemin masum durumları SESSİZ geçmesi:
 *   • aynı hesabın iki dünyadaki oyuncusu (her zaman aynı cihaz — çoklu hesap DEĞİL)
 *   • internet kafe / operatör NAT'ı (onlarca oyuncu tek IP — bilgi değeri sıfır)
 *   • farklı saatlerde oynayan iki yabancı (hiç örtüşmez ama devralma yok)
 *
 * ⚠️ §9.1.1: bu servisin çıktısı hiçbir koşulda ceza değildir. Testler de skoru ölçüyor,
 * "banlandı mı"yı değil — böyle bir yol zaten yok.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LinkService, abuseConfig } from '../src/abuse/link.service.ts';
import { AdminAbuseController } from '../src/admin/admin.abuse.controller.ts';
import type { AdminRequest } from '../src/admin/admin.guard.ts';
import { setLiveSettings } from '../src/settings/live.ts';
import type { DbHandle } from '../src/db/client.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let svc: LinkService;

beforeAll(async () => {
  h = await setupTestDb();
  svc = new LinkService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
});

afterEach(() => { setLiveSettings({}); });

/** Hesap + oyuncu. `account_id` yabancı anahtar olduğu için uydurma sayı geçilemiyor. */
async function newAccount(): Promise<number> {
  const [acc] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO accounts (email, password_hash)
    VALUES (${`${randomUUID().slice(0, 8)}@t.local`}, 'x') RETURNING id
  `);
  return Number(acc!['id']);
}

async function newPlayer(
  name: string, opts: { accountId?: number; worldId?: number; createdAt?: string } = {},
): Promise<{ playerId: number; accountId: number }> {
  const accountId = opts.accountId ?? await newAccount();
  const w = opts.worldId ?? worldId;
  const [ply] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO players (world_id, account_id, username, score, created_at)
    VALUES (${w}, ${accountId}, ${name}, 0,
            COALESCE(${opts.createdAt ?? null}::timestamptz, now()))
    RETURNING id
  `);
  return { playerId: Number(ply!['id']), accountId };
}

const device = async (playerId: number, deviceId: string): Promise<void> => {
  await h.db.execute(sql`
    INSERT INTO player_devices (player_id, device_id, platform)
    VALUES (${playerId}, ${deviceId}, 'web')
  `);
};

const ip = async (playerId: number, addr: string, block?: string): Promise<void> => {
  await h.db.execute(sql`
    INSERT INTO player_ips (player_id, ip, ip_block_24)
    VALUES (${playerId}, ${addr},
            ${block ?? addr.split('.').slice(0, 3).concat('0/24').join('.')})
  `);
};

/** Oturum aralığı — `sessions` HESAP düzeyinde, oyuncu düzeyinde değil. */
const session = async (accountId: number, t0: string, t1: string): Promise<void> => {
  await h.db.execute(sql`
    INSERT INTO sessions (id, account_id, refresh_hash, chain_id, created_at, last_seen_at, expires_at)
    VALUES (${randomUUID()}, ${accountId}, 'x', ${randomUUID()},
            ${t0}::timestamptz, ${t1}::timestamptz, now() + interval '30 days')
  `);
};

/** Eşiği düşürüp tek tek sinyalleri ölçebilmek için. */
const anyScore = { minScore: 1 };

/**
 * ⚠️ **Kayıt tarihleri BİLEREK AYRI.** İlk yazımda ikisi de `now()` ile açılıyordu ve testler
 * beklenenden 12 puan fazla ölçüyordu: aynı öbekten milisaniyeler arayla açılan iki hesap
 * gerçekten de «kayıt kohortu»dur — sinyal doğru çalışıyordu, ölçüm iki sinyali birden
 * yakalıyordu. Tek bir sinyalin ağırlığını ölçmek için diğerlerini susturmak gerekiyor.
 */
const FAR_APART = ['2026-01-01T09:00:00Z', '2026-04-01T09:00:00Z'] as const;

describe('bağlantı analizi — sinyaller', () => {
  it('aynı cihazı paylaşan iki hesap yakalanır ve ağırlığı kadar puan alır', async () => {
    const a = await newPlayer('alfa');
    const b = await newPlayer('beta');
    const d = randomUUID();
    await device(a.playerId, d);
    await device(b.playerId, d);

    const pairs = await svc.pairs(worldId, anyScore);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.score).toBe(abuseConfig().weights.sameDevice);
    expect(pairs[0]!.signals.map((s) => s.kind)).toEqual(['sameDevice']);
  });

  it('aynı tam IP ile öbek puanı ÜST ÜSTE BİNMEZ', async () => {
    const a = await newPlayer('alfa', { createdAt: FAR_APART[0] });
    const b = await newPlayer('beta', { createdAt: FAR_APART[1] });
    await ip(a.playerId, '10.0.0.7');
    await ip(b.playerId, '10.0.0.7');

    const [pair] = await svc.pairs(worldId, anyScore);
    const kinds = pair!.signals.map((s) => s.kind);
    expect(kinds).toContain('sameIp');
    // Aynı IP zaten aynı öbek demek; ikisini birden saymak tek gerçeği iki kanıt gibi gösterirdi.
    expect(kinds).not.toContain('sameIpBlock');
    expect(pair!.score).toBe(abuseConfig().weights.sameIp);
  });

  it('yalnız öbeği paylaşanlar daha düşük puan alır', async () => {
    const a = await newPlayer('alfa', { createdAt: FAR_APART[0] });
    const b = await newPlayer('beta', { createdAt: FAR_APART[1] });
    await ip(a.playerId, '10.0.0.7');
    await ip(b.playerId, '10.0.0.9');

    const [pair] = await svc.pairs(worldId, anyScore);
    expect(pair!.signals.map((s) => s.kind)).toContain('sameIpBlock');
    expect(pair!.score).toBeLessThan(abuseConfig().weights.sameIp);
  });

  it('puanlar toplanır: cihaz + IP eşiği geçer', async () => {
    const a = await newPlayer('alfa', { createdAt: FAR_APART[0] });
    const b = await newPlayer('beta', { createdAt: FAR_APART[1] });
    const d = randomUUID();
    await device(a.playerId, d); await device(b.playerId, d);
    await ip(a.playerId, '10.0.0.7'); await ip(b.playerId, '10.0.0.7');

    const cfg = abuseConfig();
    const [pair] = await svc.pairs(worldId);   // varsayılan eşik
    expect(pair!.score).toBe(cfg.weights.sameDevice + cfg.weights.sameIp);
    expect(pair!.score).toBeGreaterThanOrEqual(cfg.reportThreshold);
  });

  /**
   * ⚠️ Kayıt kohortu ZAMAN + YER ister. Aynı öbekten ama aylar arayla kaydolan iki oyuncu
   * kohort değildir; testin iki yarısı tam olarak bu ayrımı ölçüyor.
   */
  it('kayıt kohortu yalnız pencere içindeki kayıtlarda çıkar', async () => {
    const cohort = await (async () => {
      const a = await newPlayer('a1', { createdAt: '2026-01-01T10:00:00Z' });
      const b = await newPlayer('b1', { createdAt: '2026-01-01T10:30:00Z' });
      await ip(a.playerId, '10.1.0.5'); await ip(b.playerId, '10.1.0.6');
      return svc.pairs(worldId, anyScore);
    })();
    expect(cohort[0]!.signals.map((s) => s.kind)).toContain('registrationCohort');

    worldId = freshWorldId();
    await createWorld(h, worldId);
    const a = await newPlayer('a2', { createdAt: '2026-01-01T10:00:00Z' });
    const b = await newPlayer('b2', { createdAt: '2026-03-01T10:00:00Z' });
    await ip(a.playerId, '10.2.0.5'); await ip(b.playerId, '10.2.0.6');
    const apart = await svc.pairs(worldId, anyScore);
    expect(apart[0]!.signals.map((s) => s.kind)).not.toContain('registrationCohort');
  });
});

describe('bağlantı analizi — YANLIŞ POZİTİF savunmaları', () => {
  /**
   * ⭐ **EN ÖNEMLİ TEST.** `player_devices` `player_id` ile anahtarlı ve TEK bir hesabın iki
   * dünyadaki iki oyuncusu doğal olarak aynı cihazı, aynı IP'yi paylaşır. Bu eleme olmasaydı
   * her çoklu-dünya oyuncusu kendini **en yüksek skorla** çoklu hesap olarak ihbar ederdi.
   *
   * ⚠️ Aynı hesabın AYNI dünyada iki oyuncusu yazılamıyor (`players_world_account` benzersiz
   * indeksi); yani bu yanlış pozitifin tek gerçekçi biçimi budur ve onu kapatan şey dünya
   * kısıtıdır. (Servisteki `account_id` kontrolü bugün hiçbir satır elemiyor; dünya kısıtı
   * bir gün gevşetilirse diye duruyor.)
   */
  it('aynı hesabın iki DÜNYADAKİ oyuncusu ASLA çift olarak çıkmaz', async () => {
    const other = freshWorldId();
    await createWorld(h, other);
    const accountId = await newAccount();
    const a = await newPlayer('cokdunyali', { accountId });
    const b = await newPlayer('cokdunyali', { accountId, worldId: other });
    const d = randomUUID();
    await device(a.playerId, d); await device(b.playerId, d);
    await ip(a.playerId, '10.0.0.7'); await ip(b.playerId, '10.0.0.7');

    expect(await svc.pairs(worldId, anyScore)).toEqual([]);
    expect(await svc.pairs(other, anyScore)).toEqual([]);
  });

  it('farklı dünyalardaki AYRI hesaplar da eşleştirilmez', async () => {
    const other = freshWorldId();
    await createWorld(h, other);
    const a = await newPlayer('burada');
    const b = await newPlayer('orada', { worldId: other });
    const d = randomUUID();
    await device(a.playerId, d); await device(b.playerId, d);

    expect(await svc.pairs(worldId, anyScore)).toEqual([]);
    expect(await svc.pairs(other, anyScore)).toEqual([]);
  });

  /**
   * ⭐ İnternet kafe / operatör NAT'ı. `maxGroupSize` aşılınca sinyal TAMAMEN düşer —
   * "zayıflar" değil. Sebep hem anlam (orada iki hesabın aynı kişiye ait olma ihtimali
   * normalden yüksek değil) hem maliyet (n oyuncu n×(n−1)/2 çift üretiyor).
   */
  it('kalabalık bir IP’yi paylaşanlar hiç raporlanmaz', async () => {
    setLiveSettings({ abuse: { maxGroupSize: 4 } });
    const players = [];
    for (let i = 0; i < 6; i += 1) {
      const p = await newPlayer(`kafe${i}`);
      await ip(p.playerId, '10.9.0.1');
      players.push(p);
    }
    expect(await svc.pairs(worldId, anyScore)).toEqual([]);

    // Sınırın altında kalan aynı desen normal şekilde raporlanıyor → eleme grup boyuna bağlı.
    setLiveSettings({ abuse: { maxGroupSize: 10 } });
    const pairs = await svc.pairs(worldId, anyScore);
    expect(pairs.length).toBe((6 * 5) / 2);
  });

  /**
   * ⭐ B3'ün asıl inceliği. "Hiç aynı anda çevrimiçi olmamak" TEK BAŞINA hiçbir şey söylemez:
   * sabah oynayanla gece oynayan iki yabancı da hiç örtüşmez. Sinyal ancak DEVRALMA varsa
   * veriliyor.
   */
  it('sıra sıra oturum: devralma varsa sinyal, yoksa yok', async () => {
    const a = await newPlayer('alfa');
    const b = await newPlayer('beta');
    const d = randomUUID();
    await device(a.playerId, d); await device(b.playerId, d);
    // A 10:00-10:30, B 10:40-11:00 → örtüşme yok, arada 10 dk → DEVRALMA.
    await session(a.accountId, '2026-05-01T10:00:00Z', '2026-05-01T10:30:00Z');
    await session(b.accountId, '2026-05-01T10:40:00Z', '2026-05-01T11:00:00Z');

    setLiveSettings({ abuse: { lookbackDays: 36_500, handoffMinutes: 20 } });
    const handoff = await svc.pairs(worldId, anyScore);
    expect(handoff[0]!.signals.map((s) => s.kind)).toContain('sessionHandoff');

    // Aynı veri, pencere 5 dakikaya inince aradaki 10 dakika artık "devralma" sayılmıyor.
    setLiveSettings({ abuse: { lookbackDays: 36_500, handoffMinutes: 5 } });
    const tooFar = await svc.pairs(worldId, anyScore);
    expect(tooFar[0]!.signals.map((s) => s.kind)).not.toContain('sessionHandoff');
  });

  it('aynı anda çevrimiçi olan iki hesapta devralma sinyali çıkmaz', async () => {
    const a = await newPlayer('alfa');
    const b = await newPlayer('beta');
    const d = randomUUID();
    await device(a.playerId, d); await device(b.playerId, d);
    // Aralıklar ÖRTÜŞÜYOR → aynı kişi olamaz (iki tarayıcı aynı anda açık).
    await session(a.accountId, '2026-05-01T10:00:00Z', '2026-05-01T11:00:00Z');
    await session(b.accountId, '2026-05-01T10:30:00Z', '2026-05-01T10:45:00Z');

    setLiveSettings({ abuse: { lookbackDays: 36_500, handoffMinutes: 120 } });
    const pairs = await svc.pairs(worldId, anyScore);
    expect(pairs[0]!.signals.map((s) => s.kind)).not.toContain('sessionHandoff');
  });

  /** Pencere dışındaki iz görünmez — saklama süresiyle tutarlı kalsın diye. */
  it('inceleme penceresinden eski izler sayılmaz', async () => {
    const a = await newPlayer('alfa');
    const b = await newPlayer('beta');
    const d = randomUUID();
    await device(a.playerId, d); await device(b.playerId, d);
    await h.db.execute(sql`
      UPDATE player_devices SET last_seen = now() - interval '200 days' WHERE device_id = ${d}
    `);

    setLiveSettings({ abuse: { lookbackDays: 90 } });
    expect(await svc.pairs(worldId, anyScore)).toEqual([]);
    setLiveSettings({ abuse: { lookbackDays: 365 } });
    expect(await svc.pairs(worldId, anyScore)).toHaveLength(1);
  });
});

describe('gerçek IP zinciri teşhisi', () => {
  /**
   * ⭐ Cloudflare `real_ip` yapılandırması sunucuda yüklü değilse HERKES tek edge IP'siyle
   * kaydedilir ve IP sinyalleri **sessizce** değersizleşir. Teşhis, Cloudflare IP listesini
   * kopyalamak yerine bozukluğun kendisini ölçüyor — liste bayatlamaz, yanlış alarm vermez.
   */
  it('herkes tek IP’de görünüyorsa şüphe bayrağı kalkar', async () => {
    for (let i = 0; i < 10; i += 1) {
      const p = await newPlayer(`edge${i}`);
      await ip(p.playerId, '104.16.0.1');
    }
    const health = await svc.ipChainHealth(worldId);
    expect(health.players).toBe(10);
    expect(health.distinctIps).toBe(1);
    expect(health.suspect).toBe(true);
  });

  /**
   * ⭐ Panel iki farklı cümle kuruyor ve ayrımı BU alan taşıyor. İlk yazımda tek cümle vardı
   * (*"Cloudflare kenar sunucusu"*) ve geliştirmede **yanlıştı**: orada herkes 127.0.0.1'den
   * geliyor, ortada bozuk zincir yok. Yanlış teşhis, gerçek teşhisin de ciddiye alınmamasına
   * yol açar.
   */
  it('yerel adres ile genel adres AYIRT EDİLİR', async () => {
    for (let i = 0; i < 10; i += 1) {
      const p = await newPlayer(`yerel${i}`);
      await ip(p.playerId, '127.0.0.1', '127.0.0.0/24');
    }
    const local = await svc.ipChainHealth(worldId);
    expect(local.suspect).toBe(true);
    expect(local.topIpLocal).toBe(true);

    worldId = freshWorldId();
    await createWorld(h, worldId);
    for (let i = 0; i < 10; i += 1) {
      const p = await newPlayer(`kenar${i}`);
      await ip(p.playerId, '104.16.0.1');
    }
    const edge = await svc.ipChainHealth(worldId);
    expect(edge.suspect).toBe(true);
    expect(edge.topIpLocal).toBe(false);
  });

  it('IP’ler dağılmışsa şüphe yok', async () => {
    for (let i = 0; i < 10; i += 1) {
      const p = await newPlayer(`ev${i}`);
      await ip(p.playerId, `10.5.${i}.2`);
    }
    expect((await svc.ipChainHealth(worldId)).suspect).toBe(false);
  });

  /** ⚠️ Az oyunculu test/geliştirme dünyasında tek IP normaldir — uyarı çıkmamalı. */
  it('oyuncu az olduğunda tek IP şüphe üretmez', async () => {
    for (let i = 0; i < 3; i += 1) {
      const p = await newPlayer(`az${i}`);
      await ip(p.playerId, '10.7.0.1');
    }
    expect((await svc.ipChainHealth(worldId)).suspect).toBe(false);
  });
});

/* ═══ Yönetim ucu ═══════════════════════════════════════════════════════════ */

/**
 * ⚠️ Denetleyici HTTP olmadan doğrudan kuruluyor (`admin.test.ts` deseni). Guard'lar burada
 * çalışmıyor; ölçülen şey **kararın kaydı**, yetkinin kendisi değil (o `admin.test.ts`in işi).
 */
describe('yönetim ucu — karar kaydı', () => {
  const asReq = (playerId: number): AdminRequest => ({
    player: { playerId, accountId: 0, sessionId: '', worldId },
    headers: {},
  } as unknown as AdminRequest);

  it('karar kaydedilir ve listede çiftin yanında görünür', async () => {
    const ctl = new AdminAbuseController(h.db);
    const a = await newPlayer('alfa', { createdAt: FAR_APART[0] });
    const b = await newPlayer('beta', { createdAt: FAR_APART[1] });
    const admin = await newPlayer('yonetici');
    const d = randomUUID();
    await device(a.playerId, d); await device(b.playerId, d);
    await ip(a.playerId, '10.0.0.7'); await ip(b.playerId, '10.0.0.7');

    const before = await ctl.list(String(worldId));
    const items = before['items'] as { resolved: unknown }[];
    expect(items).toHaveLength(1);
    expect(items[0]!.resolved).toBeNull();

    await ctl.resolvePair(
      { worldId, a: a.playerId, b: b.playerId, resolution: 'innocent', note: 'kardeşler' },
      asReq(admin.playerId),
    );

    const after = await ctl.list(String(worldId));
    const row = (after['items'] as { resolved: { resolution: string; note: string; by: string } }[])[0]!;
    expect(row.resolved.resolution).toBe('innocent');
    expect(row.resolved.note).toBe('kardeşler');
    expect(row.resolved.by).toBe('yonetici');
  });

  /**
   * ⭐ Çift SIRALI saklanmalı: (A,B) ile (B,A) aynı ilişkidir. Uç ters sırayla çağrılsa bile
   * aynı satıra denk gelmeli, yoksa aynı çift için iki farklı karar yaşayabilirdi.
   */
  it('ters sırayla verilen karar da aynı çifte yazılır', async () => {
    const ctl = new AdminAbuseController(h.db);
    const a = await newPlayer('alfa', { createdAt: FAR_APART[0] });
    const b = await newPlayer('beta', { createdAt: FAR_APART[1] });
    const admin = await newPlayer('yonetici');
    const d = randomUUID();
    await device(a.playerId, d); await device(b.playerId, d);

    // Bilerek TERS sırada: b önce, a sonra.
    await ctl.resolvePair(
      { worldId, a: b.playerId, b: a.playerId, resolution: 'watch' },
      asReq(admin.playerId),
    );

    const res = await ctl.list(String(worldId), '1');
    const row = (res['items'] as { resolved: { resolution: string } | null }[])[0]!;
    expect(row.resolved?.resolution).toBe('watch');
  });

  /** ⚠️ §9.1.1: uçta ceza yok — karar `players.banned_at`e DOKUNMAZ. */
  it('«cezalandırıldı» kaydı oyuncuya ceza VERMEZ', async () => {
    const ctl = new AdminAbuseController(h.db);
    const a = await newPlayer('alfa', { createdAt: FAR_APART[0] });
    const b = await newPlayer('beta', { createdAt: FAR_APART[1] });
    const admin = await newPlayer('yonetici');

    await ctl.resolvePair(
      { worldId, a: a.playerId, b: b.playerId, resolution: 'banned' },
      asReq(admin.playerId),
    );

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT banned_at FROM players WHERE id IN (${a.playerId}, ${b.playerId})
    `);
    expect(rows.every((r) => r['banned_at'] == null)).toBe(true);
  });
});
